from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import yfinance as yf
import datetime
import pandas as pd
import numpy as np
import os

from scanner import (
    find_3_leg_fibo_short,
    calculate_indicators,
    find_support_resistance,
)

app = FastAPI(title="Scanner PRO API")

# ── Serve React static files from FRONTEND/dist ─────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Primary: FRONTEND/dist (Render / GitHub)  Fallback: frontend/dist (local dev)
if os.path.isdir(os.path.join(BASE_DIR, "FRONTEND", "dist")):
    FRONTEND_DIR = os.path.join(BASE_DIR, "FRONTEND", "dist")
elif os.path.isdir(os.path.join(BASE_DIR, "frontend", "dist")):
    FRONTEND_DIR = os.path.join(BASE_DIR, "frontend", "dist")
else:
    FRONTEND_DIR = os.path.join(BASE_DIR, "FRONTEND", "dist")

# Mount /assets for JS/CSS bundles
if os.path.isdir(os.path.join(FRONTEND_DIR, "assets")):
    app.mount(
        "/assets",
        StaticFiles(directory=os.path.join(FRONTEND_DIR, "assets")),
        name="assets",
    )

# Startup diagnostics
print(f"[BOOT] FRONTEND_DIR = {FRONTEND_DIR}", flush=True)
print(f"[BOOT] Exists: {os.path.isdir(FRONTEND_DIR)}", flush=True)
if os.path.isdir(FRONTEND_DIR):
    for f in os.listdir(FRONTEND_DIR):
        full = os.path.join(FRONTEND_DIR, f)
        if os.path.isdir(full):
            for sub in os.listdir(full):
                print(f"[BOOT]   {f}/{sub}", flush=True)
        else:
            print(f"[BOOT]   {f}", flush=True)

# Enable CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Response Models ──────────────────────────────────────────────────


class ChartResponse(BaseModel):
    ticker: str
    interval: str
    ohlc: List[Dict[str, Any]]
    overlays: Dict[str, Any]


# ── Helpers ──────────────────────────────────────────────────────────

INTERVAL_PERIOD_MAP = {
    "1m": "7d",
    "5m": "60d",
    "15m": "60d",
    "1h": "730d",
    "4h": "730d",  # yf doesn't support 4h natively; we'll resample from 1h
    "1d": "1y",
    "1wk": "5y",
    "1mo": "10y",
}

YF_VALID_INTERVALS = {"1m", "5m", "15m", "1h", "1d", "1wk", "1mo"}


def resample_4h(df):
    """Resample 1h data to 4h OHLCV bars."""
    resampled = (
        df.resample("4h")
        .agg(
            {
                "Open": "first",
                "High": "max",
                "Low": "min",
                "Close": "last",
                "Volume": "sum",
            }
        )
        .dropna()
    )
    return resampled


def build_ohlc_list(df, is_intraday=False):
    """Convert a DataFrame to a list of OHLC dicts for lightweight-charts."""
    ohlc = []
    for idx, row in df.iterrows():
        if is_intraday:
            # lightweight-charts needs UTC unix timestamp for intraday
            ts = int(idx.timestamp())
            ohlc.append(
                {
                    "time": ts,
                    "open": round(float(row["Open"]), 4),
                    "high": round(float(row["High"]), 4),
                    "low": round(float(row["Low"]), 4),
                    "close": round(float(row["Close"]), 4),
                    "volume": float(row["Volume"]) if "Volume" in row else 0.0,
                }
            )
        else:
            ohlc.append(
                {
                    "time": str(idx.date()),
                    "open": round(float(row["Open"]), 4),
                    "high": round(float(row["High"]), 4),
                    "low": round(float(row["Low"]), 4),
                    "close": round(float(row["Close"]), 4),
                    "volume": float(row["Volume"]) if "Volume" in row else 0.0,
                }
            )
    return ohlc


def build_ma_series(df, col_name, is_intraday=False):
    """Convert a single MA column into a lightweight-charts line series list."""
    series = []
    for idx, val in df[col_name].dropna().items():
        if is_intraday:
            series.append({"time": int(idx.timestamp()), "value": round(float(val), 4)})
        else:
            series.append({"time": str(idx.date()), "value": round(float(val), 4)})
    return series


# ── Nick Shawn: Compute S/R Zones ────────────────────────────────────


def compute_nick_shawn_zones(df):
    """Return support and resistance zone bands for Nick Shawn strategy."""
    if len(df) < 50:
        return None

    recent_50 = df.tail(50)
    price = float(df.iloc[-1]["Close"])
    support = float(recent_50["Low"].min())
    resistance = float(recent_50["High"].max())

    result = {}

    # Support zone: support to support * 1.015
    result["support_zone"] = {
        "low": round(support, 2),
        "high": round(support * 1.015, 2),
    }
    result["resistance_zone"] = {
        "low": round(resistance * 0.985, 2),
        "high": round(resistance, 2),
    }

    # Determine if signal is active
    if support <= price <= support * 1.015:
        entry = price
        stop = round(support * 0.99, 2)
        target = round(entry + (entry - stop), 2)
        result["signal"] = "Long"
        result["entry"] = round(entry, 2)
        result["stop_loss"] = stop
        result["target"] = target
    elif resistance * 0.985 <= price <= resistance:
        entry = price
        stop = round(resistance * 1.01, 2)
        target = round(entry - (stop - entry), 2)
        result["signal"] = "Short"
        result["entry"] = round(entry, 2)
        result["stop_loss"] = stop
        result["target"] = target

    return result


# ── Qullamaggie: Compute breakout level ──────────────────────────────


def compute_qullamaggie_levels(df):
    """Return Qullamaggie breakout overlay data."""
    if len(df) < 50:
        return None

    last_row = df.iloc[-1]
    price = float(last_row["Close"])
    ema10 = float(last_row["EMA_10"])
    ema20 = float(last_row["EMA_20"])
    ema50 = float(last_row["EMA_50"])

    # Check alignment
    if not (price > ema10 > ema20 > ema50):
        return {"aligned": False}

    breakout_level = round(float(df["High"].tail(10).max()), 2)
    stop_loss = round(float(df["EMA_20"].iloc[-1]), 2)

    if breakout_level <= stop_loss:
        return {"aligned": True, "breakout_level": breakout_level}

    risk = breakout_level - stop_loss
    target = round(breakout_level + 3 * risk, 2)

    return {
        "aligned": True,
        "breakout_level": breakout_level,
        "entry": breakout_level,
        "stop_loss": stop_loss,
        "target": target,
    }


# ── Main Endpoint ───────────────────────────────────────────────────


@app.get("/chart", response_model=ChartResponse)
def get_chart(
    ticker: str = Query(..., description="Ticker symbol"),
    interval: str = Query("1d", description="Chart interval"),
    strategy: str = Query("none", description="Strategy overlay"),
):
    is_4h = interval == "4h"
    yf_interval = "1h" if is_4h else interval

    if yf_interval not in YF_VALID_INTERVALS:
        raise HTTPException(status_code=400, detail=f"Invalid interval: {interval}")

    period = INTERVAL_PERIOD_MAP.get(interval, "1y")
    is_intraday = interval in ("1m", "5m", "15m", "1h", "4h")

    try:
        df = yf.download(ticker, period=period, interval=yf_interval, progress=False)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    if df.empty:
        raise HTTPException(status_code=404, detail=f"No data for {ticker}")

    # Flatten MultiIndex
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.droplevel(1)

    if is_4h:
        df = resample_4h(df)

    # Build OHLC
    ohlc_data = build_ohlc_list(df, is_intraday)

    # Calculate indicators
    df = calculate_indicators(df)

    # ── Build overlays dict ──────────────────────────────────────────
    overlays: Dict[str, Any] = {}

    # Moving Averages (always available)
    overlays["moving_averages"] = {
        "ema10": build_ma_series(df, "EMA_10", is_intraday),
        "ema20": build_ma_series(df, "EMA_20", is_intraday),
        "ema50": build_ma_series(df, "EMA_50", is_intraday),
    }

    # Support / Resistance
    sr_type, sr_value = find_support_resistance(df)
    if sr_type and sr_value:
        overlays["support_resistance"] = {"type": sr_type, "value": sr_value}

    # General support and resistance levels (always show, not conditional)
    if len(df) >= 50:
        recent = df.tail(100) if len(df) >= 100 else df
        overlays["support"] = round(float(recent["Low"].min()), 2)
        overlays["resistance"] = round(float(recent["High"].max()), 2)

    # ── Strategy-specific overlays ───────────────────────────────────
    if strategy == "fibo":
        f_res = find_3_leg_fibo_short(df)
        if f_res[0] is not None:
            (
                entry,
                stop_loss,
                target,
                low_date_str,
                swing_low,
                high_date_str,
                swing_high,
                leg2_date_str,
                touch_low,
            ) = f_res

            fibo_range = swing_high - swing_low
            overlays["fibo"] = {
                "levels": {
                    "0": float(swing_high),
                    "0.382": round(float(swing_high - 0.382 * fibo_range), 2),
                    "0.5": round(float(swing_high - 0.5 * fibo_range), 2),
                    "0.618": round(float(swing_high - 0.618 * fibo_range), 2),
                    "1": float(swing_low),
                },
                "legs": {
                    "leg1_start": {"date": low_date_str, "price": swing_low},
                    "leg1_end": {"date": high_date_str, "price": swing_high},
                    "leg2_end": {"date": leg2_date_str, "price": touch_low},
                },
            }
            overlays["predictions"] = {
                "entry": float(entry),
                "stop_loss": float(stop_loss),
                "target": float(target),
            }

    elif strategy == "nick_shawn":
        ns_data = compute_nick_shawn_zones(df)
        if ns_data:
            overlays["nick_shawn"] = ns_data
            if "entry" in ns_data:
                overlays["predictions"] = {
                    "entry": ns_data["entry"],
                    "stop_loss": ns_data["stop_loss"],
                    "target": ns_data["target"],
                }

    elif strategy == "qullamaggie":
        q_data = compute_qullamaggie_levels(df)
        if q_data:
            overlays["qullamaggie"] = q_data
            if "entry" in q_data:
                overlays["predictions"] = {
                    "entry": q_data["entry"],
                    "stop_loss": q_data["stop_loss"],
                    "target": q_data["target"],
                }

    return ChartResponse(
        ticker=ticker,
        interval=interval,
        ohlc=ohlc_data,
        overlays=overlays,
    )


# Keep legacy /scan endpoint — always returns full Fibo + Zig-Zag data
@app.get("/scan")
def legacy_scan(ticker: str = Query(...)):
    return get_chart(ticker=ticker, interval="1d", strategy="fibo")


# ── Scanner Results Endpoint ────────────────────────────────────────

import os

STRATEGY_FILES = {
    "qullamaggie": "momentum_candidates.csv",
    "nick_shawn": "nick_shawn_candidates.csv",
    "fibo": "fibo_candidates.csv",
}

# Columns we always want to show (in order), rest are hidden
DISPLAY_COLS = [
    "Ticker",
    "Market",
    "Signal_Status",
    "Close",
    "Entry",
    "Stop_Loss",
    "Target",
    "Win_Rate",
]


@app.get("/results")
def get_results(strategy: str = Query("qullamaggie")):
    """Return scan results from the latest CSV for the given strategy."""
    filename = STRATEGY_FILES.get(strategy)
    if not filename:
        raise HTTPException(status_code=400, detail=f"Unknown strategy: {strategy}")

    base_dir = os.path.dirname(os.path.abspath(__file__))
    filepath = os.path.join(base_dir, filename)

    if not os.path.exists(filepath):
        return {"strategy": strategy, "rows": [], "columns": []}

    try:
        df = pd.read_csv(filepath, encoding="utf-8-sig")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading CSV: {str(e)}")

    if df.empty:
        return {"strategy": strategy, "rows": [], "columns": []}

    # Determine trade type
    def get_type(row):
        try:
            e, s = float(row.get("Entry", 0)), float(row.get("Stop_Loss", 0))
            if e > s:
                return "LONG 📈"
            elif e < s:
                return "SHORT 📉"
            return "N/A"
        except:
            return "N/A"

    df["Type"] = df.apply(get_type, axis=1)

    # Pick strategy-specific label column
    if "Setup_Type" in df.columns:
        df["Strategy_Label"] = df["Setup_Type"]
    elif "Trend" in df.columns:
        df["Strategy_Label"] = df["Trend"]
    else:
        df["Strategy_Label"] = strategy.title()

    # Build ordered columns
    ordered = ["Ticker", "Market", "Type", "Signal_Status", "Strategy_Label"]
    for c in ["Close", "Entry", "Stop_Loss", "Target", "Win_Rate"]:
        if c in df.columns:
            ordered.append(c)

    # Round numeric columns
    for c in ["Close", "Entry", "Stop_Loss", "Target"]:
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce").round(2)

    # Only keep the ordered columns that exist
    ordered = [c for c in ordered if c in df.columns]
    df = df[ordered]

    rows = df.to_dict(orient="records")
    return {"strategy": strategy, "columns": ordered, "rows": rows}


# ── Run Scanner Endpoint ────────────────────────────────────────────
from scanner import run_scanner as _run_scanner
import threading

_scan_status = {"running": False, "message": "idle"}


@app.post("/run-scan")
def run_scan_endpoint():
    """Trigger a full market scan in background thread."""
    if _scan_status["running"]:
        return {"status": "running", "message": "Scan already in progress..."}

    def _scan_worker():
        _scan_status["running"] = True
        _scan_status["message"] = "Scanning market..."
        try:
            _run_scanner()
            _scan_status["message"] = "Scan complete"
        except Exception as e:
            _scan_status["message"] = f"Error: {str(e)}"
        finally:
            _scan_status["running"] = False

    threading.Thread(target=_scan_worker, daemon=True).start()
    return {"status": "started", "message": "Market scan started..."}


@app.get("/scan-status")
def scan_status():
    return _scan_status


# ── Quick Market Scan (Fibo only, top 50) ──────────────────────────

TOP_50 = [
    "AAPL",
    "MSFT",
    "GOOGL",
    "AMZN",
    "NVDA",
    "META",
    "TSLA",
    "BRK-B",
    "JPM",
    "V",
    "UNH",
    "JNJ",
    "WMT",
    "XOM",
    "MA",
    "PG",
    "HD",
    "CVX",
    "MRK",
    "ABBV",
    "COST",
    "PEP",
    "KO",
    "AVGO",
    "LLY",
    "TMO",
    "MCD",
    "CSCO",
    "ACN",
    "ABT",
    "DHR",
    "CRM",
    "NKE",
    "TXN",
    "CMCSA",
    "NEE",
    "PM",
    "VZ",
    "INTC",
    "UPS",
    "QCOM",
    "AMD",
    "LOW",
    "BA",
    "CAT",
    "AMAT",
    "SPGI",
    "GS",
    "ISRG",
    "SYK",
]


@app.get("/scan-ticker")
def scan_ticker(ticker: str = Query(...), strategy: str = Query("all")):
    """Scan a single ticker for active setups across all strategies."""
    results = []
    strategies_to_run = (
        ["fibo", "nick_shawn", "qullamaggie"] if strategy == "all" else [strategy]
    )
    try:
        data = yf.download(ticker.upper(), period="1y", interval="1d", progress=False)
        if data is None or data.empty or len(data) < 60:
            return {"count": 0, "results": [], "error": f"No data for {ticker}"}

        if isinstance(data.columns, pd.MultiIndex):
            data.columns = data.columns.get_level_values(0)

        df = calculate_indicators(data)
        close = round(float(df["Close"].iloc[-1]), 2)

        if "fibo" in strategies_to_run:
            fibo = find_3_leg_fibo_short(df)
            if fibo and fibo[0] is not None:
                entry = round(float(fibo[0]), 2)
                sl = round(float(fibo[1]), 2)
                tp = round(float(fibo[2]), 2)
                dist = round(((entry - close) / close) * 100, 2) if close else 0
                if close >= entry:
                    leg = "🎯 At Entry"
                elif fibo[7]:
                    leg = "↩️ Pullback"
                else:
                    leg = "🔨 Building"
                results.append(
                    {
                        "ticker": ticker.upper(),
                        "strategy": "Fibonacci",
                        "signal": leg,
                        "setup": "SHORT 📉" if entry < sl else "LONG 📈",
                        "close": close,
                        "entry": entry,
                        "stop_loss": sl,
                        "target": tp,
                        "dist_pct": dist,
                        "win_rate": "—",
                    }
                )

        if "qullamaggie" in strategies_to_run:
            last = df.iloc[-1]
            ema10 = float(last["EMA_10"])
            ema20 = float(last["EMA_20"])
            ema50 = float(last["EMA_50"])
            vol_sma = float(last["Vol_SMA_30"])
            if close > 5 and vol_sma > 500000 and close > ema10 > ema20 > ema50:
                entry = round(float(df["High"].tail(10).max()), 2)
                sl = round(ema20, 2)
                if entry > sl:
                    risk = entry - sl
                    tp = round(entry + 3 * risk, 2)
                    dist = round(((entry - close) / close) * 100, 2) if close else 0
                    if close >= entry * 0.995:
                        leg = "🚀 Active"
                    elif abs(dist) <= 5:
                        leg = "🔥 Close"
                    else:
                        leg = "⏳ Building"
                    results.append(
                        {
                            "ticker": ticker.upper(),
                            "strategy": "Qullamaggie",
                            "signal": leg,
                            "setup": "LONG 📈",
                            "close": close,
                            "entry": entry,
                            "stop_loss": sl,
                            "target": tp,
                            "dist_pct": dist,
                            "win_rate": "—",
                        }
                    )

        if "nick_shawn" in strategies_to_run:
            recent_50 = df.tail(50)
            support = float(recent_50["Low"].min())
            resistance = float(recent_50["High"].max())
            if close <= support * 1.015 and close >= support:
                sl = round(support * 0.99, 2)
                tp = round(close + (close - sl), 2)
                dist = round(((close - support) / support) * 100, 2)
                leg = "🟢 At Support" if dist <= 0.5 else "🔥 Near Support"
                results.append(
                    {
                        "ticker": ticker.upper(),
                        "strategy": "Nick Shawn",
                        "signal": leg,
                        "setup": "LONG 📈",
                        "close": close,
                        "entry": round(close, 2),
                        "stop_loss": sl,
                        "target": tp,
                        "dist_pct": dist,
                        "win_rate": "—",
                    }
                )
            elif close >= resistance * 0.985 and close <= resistance:
                sl = round(resistance * 1.01, 2)
                tp = round(close - (sl - close), 2)
                dist = round(((resistance - close) / resistance) * 100, 2)
                leg = "🔴 At Resistance" if dist <= 0.5 else "🔥 Near Resistance"
                results.append(
                    {
                        "ticker": ticker.upper(),
                        "strategy": "Nick Shawn",
                        "signal": leg,
                        "setup": "SHORT 📉",
                        "close": close,
                        "entry": round(close, 2),
                        "stop_loss": sl,
                        "target": tp,
                        "dist_pct": dist,
                        "win_rate": "—",
                    }
                )

        # If no strategy triggered, still return basic info
        if not results:
            results.append(
                {
                    "ticker": ticker.upper(),
                    "strategy": "—",
                    "signal": "No Setup",
                    "setup": "—",
                    "close": close,
                    "entry": None,
                    "stop_loss": None,
                    "target": None,
                    "dist_pct": 0,
                    "win_rate": "—",
                }
            )
    except Exception as e:
        return {"count": 0, "results": [], "error": str(e)}

    return {"count": len(results), "results": results}


@app.get("/scan-market")
def scan_market(strategy: str = Query("all")):
    """Modular market scan — supports fibo, nick_shawn, qullamaggie, or all."""
    results = []
    strategies_to_run = (
        ["fibo", "nick_shawn", "qullamaggie"] if strategy == "all" else [strategy]
    )

    for ticker in TOP_50:
        try:
            data = yf.download(ticker, period="1y", interval="1d", progress=False)
            if data is None or data.empty or len(data) < 60:
                continue

            if isinstance(data.columns, pd.MultiIndex):
                data.columns = data.columns.get_level_values(0)

            df = calculate_indicators(data)
            close = round(float(df["Close"].iloc[-1]), 2)

            # ── Fibonacci Strategy ──
            if "fibo" in strategies_to_run:
                fibo = find_3_leg_fibo_short(df)
                if fibo and fibo[0] is not None:
                    entry = round(float(fibo[0]), 2)
                    sl = round(float(fibo[1]), 2)
                    tp = round(float(fibo[2]), 2)
                    dist = round(((entry - close) / close) * 100, 2) if close else 0
                    if close >= entry:
                        leg = "Leg 3 — At Entry Zone 🎯"
                    elif fibo[7]:
                        leg = "Leg 2 — Pullback Active ↩️"
                    else:
                        leg = "Leg 1 — Building 🔨"
                    results.append(
                        {
                            "ticker": ticker,
                            "strategy": "Fibonacci",
                            "close": close,
                            "entry": entry,
                            "stop_loss": sl,
                            "target": tp,
                            "dist_pct": dist,
                            "leg_status": leg,
                            "type": "LONG 📈" if entry > sl else "SHORT 📉",
                        }
                    )

            # ── Qullamaggie Breakout Strategy ──
            if "qullamaggie" in strategies_to_run:
                last = df.iloc[-1]
                ema10, ema20, ema50 = (
                    float(last["EMA_10"]),
                    float(last["EMA_20"]),
                    float(last["EMA_50"]),
                )
                vol_sma = float(last["Vol_SMA_30"])
                if close > 5 and vol_sma > 500000 and close > ema10 > ema20 > ema50:
                    entry = round(float(df["High"].tail(10).max()), 2)
                    sl = round(ema20, 2)
                    if entry > sl:
                        risk = entry - sl
                        tp = round(entry + 3 * risk, 2)
                        dist = round(((entry - close) / close) * 100, 2) if close else 0
                        if close >= entry * 0.995:
                            leg = "Breakout Active 🚀"
                        elif abs(dist) <= 5:
                            leg = "Near Breakout 🔥"
                        else:
                            leg = "Building Base ⏳"
                        results.append(
                            {
                                "ticker": ticker,
                                "strategy": "Qullamaggie",
                                "close": close,
                                "entry": entry,
                                "stop_loss": sl,
                                "target": tp,
                                "dist_pct": dist,
                                "leg_status": leg,
                                "type": "LONG 📈",
                            }
                        )

            # ── Nick Shawn S/R Strategy ──
            if "nick_shawn" in strategies_to_run:
                recent_50 = df.tail(50)
                support = float(recent_50["Low"].min())
                resistance = float(recent_50["High"].max())
                if close <= support * 1.015 and close >= support:
                    sl = round(support * 0.99, 2)
                    tp = round(close + (close - sl), 2)
                    dist = round(((close - support) / support) * 100, 2)
                    leg = "At Support Zone 🟢" if dist <= 0.5 else "Near Support 🔥"
                    results.append(
                        {
                            "ticker": ticker,
                            "strategy": "Nick Shawn",
                            "close": close,
                            "entry": round(close, 2),
                            "stop_loss": sl,
                            "target": tp,
                            "dist_pct": dist,
                            "leg_status": leg,
                            "type": "LONG 📈",
                        }
                    )
                elif close >= resistance * 0.985 and close <= resistance:
                    sl = round(resistance * 1.01, 2)
                    tp = round(close - (sl - close), 2)
                    dist = round(((resistance - close) / resistance) * 100, 2)
                    leg = (
                        "At Resistance Zone 🔴" if dist <= 0.5 else "Near Resistance 🔥"
                    )
                    results.append(
                        {
                            "ticker": ticker,
                            "strategy": "Nick Shawn",
                            "close": close,
                            "entry": round(close, 2),
                            "stop_loss": sl,
                            "target": tp,
                            "dist_pct": dist,
                            "leg_status": leg,
                            "type": "SHORT 📉",
                        }
                    )

        except Exception:
            continue

    results.sort(key=lambda r: abs(r["dist_pct"]))
    return {"count": len(results), "strategy": strategy, "results": results}


# ── Catch-all: serve React index.html for SPA routing ────────────────
@app.get("/{full_path:path}")
async def serve_react_app(full_path: str):
    """Serve the React SPA for any unmatched route."""
    # Try to serve the exact file from FONTEND/dist
    file_path = os.path.join(FRONTEND_DIR, full_path)
    if full_path and os.path.isfile(file_path):
        return FileResponse(file_path)
    # Otherwise, always return index.html (SPA routing)
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
