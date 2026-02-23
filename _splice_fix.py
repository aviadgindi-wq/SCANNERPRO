"""Splice batch scan code into main.py, replacing lines 778-931."""

import os

MAIN_PY = r"C:\Users\aviad\.gemini\antigravity\SCANNERPRO\main.py"

with open(MAIN_PY, "r", encoding="utf-8") as f:
    lines = f.readlines()

print(f"Original: {len(lines)} lines")

# Keep lines 1-777 (index 0-776) and lines 932+ (index 931+)
prefix = lines[:777]  # lines 1-777
suffix = lines[931:]  # lines 932+

NEW_CODE = r'''
# ─────────────────────────────────────────────────────────────────────
#  Proximity Scanner — BATCH download, then process in memory
# ─────────────────────────────────────────────────────────────────────

print("✅ Server starting with optimized batch scanning...")


def _process_ticker_df(ticker, df, strategies_to_run):
    """Process a single ticker's DataFrame for all strategies.
    Returns a result dict or None if processing fails."""
    try:
        if df is None or df.empty or len(df) < 60:
            return None

        # Flatten MultiIndex columns if needed
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)

        df = calculate_indicators(df)
        close = round(float(df["Close"].iloc[-1]), 2)

        strategies_found = []
        best_entry = None
        best_sl = None
        best_tp = None
        best_dist = None
        best_signal = "No Setup"
        best_setup = "—"
        best_winrate = "—"

        # ── Fibonacci ──
        if "fibo" in strategies_to_run:
            try:
                fibo = find_3_leg_fibo_short(df)
                if fibo and fibo[0] is not None:
                    entry = round(float(fibo[0]), 2)
                    sl = round(float(fibo[1]), 2)
                    tp = round(float(fibo[2]), 2)
                    dist = round(((entry - close) / close) * 100, 2) if close else 0
                    if close >= entry:
                        sig = "🎯 At Entry"
                    elif fibo[7]:
                        sig = "↩️ Pullback"
                    else:
                        sig = "🔨 Building"
                    strategies_found.append("Fibonacci")
                    if best_dist is None or abs(dist) < abs(best_dist):
                        best_entry, best_sl, best_tp = entry, sl, tp
                        best_dist = dist
                        best_signal = sig
                        best_setup = "LONG 📈" if entry > sl else "SHORT 📉"
                        best_winrate = "62%"
            except Exception:
                pass

        # ── Qullamaggie ──
        if "qullamaggie" in strategies_to_run:
            try:
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
                            sig = "🚀 Active"
                        elif abs(dist) <= 5:
                            sig = "🔥 Close"
                        else:
                            sig = "⏳ Building"
                        strategies_found.append("Qullamaggie")
                        if best_dist is None or abs(dist) < abs(best_dist):
                            best_entry, best_sl, best_tp = entry, sl, tp
                            best_dist = dist
                            best_signal = sig
                            best_setup = "LONG 📈"
                            best_winrate = "58%"
            except Exception:
                pass

        # ── Nick Shawn ──
        if "nick_shawn" in strategies_to_run:
            try:
                recent_50 = df.tail(50)
                support = float(recent_50["Low"].min())
                resistance = float(recent_50["High"].max())
                if close <= support * 1.015 and close >= support:
                    sl = round(support * 0.99, 2)
                    tp = round(close + (close - sl), 2)
                    dist = round(((close - support) / support) * 100, 2)
                    sig = "🟢 At Support" if dist <= 0.5 else "🔥 Near Support"
                    strategies_found.append("Nick Shawn")
                    if best_dist is None or abs(dist) < abs(best_dist):
                        best_entry, best_sl, best_tp = round(close, 2), sl, tp
                        best_dist = dist
                        best_signal = sig
                        best_setup = "LONG 📈"
                        best_winrate = "55%"
                elif close >= resistance * 0.985 and close <= resistance:
                    sl = round(resistance * 1.01, 2)
                    tp = round(close - (sl - close), 2)
                    dist = round(((resistance - close) / resistance) * 100, 2)
                    sig = "🔴 At Resistance" if dist <= 0.5 else "🔥 Near Resistance"
                    strategies_found.append("Nick Shawn")
                    if best_dist is None or abs(dist) < abs(best_dist):
                        best_entry, best_sl, best_tp = round(close, 2), sl, tp
                        best_dist = dist
                        best_signal = sig
                        best_setup = "SHORT 📉"
                        best_winrate = "55%"
            except Exception:
                pass

        return {
            "ticker": ticker,
            "strategy": " + ".join(strategies_found) if strategies_found else "—",
            "signal": best_signal,
            "setup": best_setup,
            "close": close,
            "entry": best_entry,
            "stop_loss": best_sl,
            "target": best_tp,
            "dist_pct": best_dist,
            "win_rate": best_winrate,
        }

    except Exception:
        return None


@app.get("/scan-market")
def scan_market(strategy: str = Query("all")):
    """Full proximity scan — batch downloads ALL tickers at once, then processes in memory."""
    strategies_to_run = (
        ["fibo", "nick_shawn", "qullamaggie"] if strategy == "all" else [strategy]
    )

    results = []

    try:
        # ── SINGLE batch download for ALL tickers ──
        print(f"[SCAN] Batch downloading {len(GLOBAL_WATCHLIST)} tickers...")
        all_data = yf.download(
            tickers=GLOBAL_WATCHLIST,
            period="1y",
            interval="1d",
            group_by="ticker",
            threads=True,
            progress=False,
        )
        print(f"[SCAN] Download complete. Processing...")

        for ticker in GLOBAL_WATCHLIST:
            try:
                # Extract single ticker's DataFrame from the batch result
                if len(GLOBAL_WATCHLIST) == 1:
                    ticker_df = all_data.copy()
                else:
                    if ticker not in all_data.columns.get_level_values(0):
                        continue
                    ticker_df = all_data[ticker].copy()

                # Drop NaN rows (ticker may have fewer bars)
                ticker_df = ticker_df.dropna(subset=["Close"])

                row = _process_ticker_df(ticker, ticker_df, strategies_to_run)
                if row:
                    results.append(row)
            except Exception as e:
                print(f"[SCAN] Skipping {ticker}: {e}")
                continue

    except Exception as e:
        print(f"[SCAN] Batch download failed: {e}")
        return {"count": 0, "strategy": strategy, "results": [], "error": str(e)}

    # Sort: tickers with setups first (smallest |dist|), then no-setup tickers
    def sort_key(r):
        d = r.get("dist_pct")
        if d is None:
            return (1, 9999)
        return (0, abs(d))

    results.sort(key=sort_key)
    print(f"[SCAN] Done. {len(results)} tickers processed.")
    return {"count": len(results), "strategy": strategy, "results": results}

'''

# Convert new code to lines
new_lines = [line + "\n" for line in NEW_CODE.strip().split("\n")]

result = prefix + new_lines + suffix

with open(MAIN_PY, "w", encoding="utf-8") as f:
    f.writelines(result)

print(f"Done! New file: {len(result)} lines")
