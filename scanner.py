import pandas as pd
import yfinance as yf
import datetime
import os
import requests

# 1. INITIALIZE LISTS EXACTLY ONCE
momentum_candidates = []
nick_shawn_candidates = []
fibo_candidates = []


def backtest_nick_shawn(df):
    # We need at least 50 days for the first calculation, plus some future days to check outcome
    if len(df) < 60:
        return "N/A"

    wins = 0
    losses = 0

    # Loop through historical data starting from day 50 up to 5 days ago
    for i in range(50, len(df) - 1):
        historical_50 = df.iloc[i - 50 : i]
        support = float(historical_50["Low"].min())
        resistance = float(historical_50["High"].max())
        current_close = float(df["Close"].iloc[i])

        trade_entered = None
        entry_price = 0.0
        target = 0.0
        stop = 0.0

        # Check for historical Long
        if support <= current_close <= (support * 1.015):
            trade_entered = "Long"
            entry_price = current_close
            stop = support * 0.99
            target = entry_price + (entry_price - stop)

        # Check for historical Short
        elif (resistance * 0.985) <= current_close <= resistance:
            trade_entered = "Short"
            entry_price = current_close
            stop = resistance * 1.01
            target = entry_price - (stop - entry_price)

        # If a historical trade triggered, scan forward to see what hit first
        if trade_entered:
            for j in range(i + 1, len(df)):
                future_high = float(df["High"].iloc[j])
                future_low = float(df["Low"].iloc[j])

                if trade_entered == "Long":
                    if future_low <= stop:
                        losses += 1
                        break
                    elif future_high >= target:
                        wins += 1
                        break
                elif trade_entered == "Short":
                    if future_high >= stop:
                        losses += 1
                        break
                    elif future_low <= target:
                        wins += 1
                        break

    total_trades = wins + losses
    if total_trades == 0:
        return "0/0 (0%)"

    win_rate = int((wins / total_trades) * 100)
    return f"{win_rate}% ({wins}/{total_trades})"


def backtest_3_leg_fibo_short(df):
    if len(df) < 60:
        return "N/A"

    wins = 0
    losses = 0

    # Iterate through history, giving a 30-day window to form the setup, and time to play out
    for i in range(30, len(df) - 5):
        window_df = df.iloc[i - 30 : i]

        # 1. Identify Leg 1
        swing_low = window_df["Low"].min()
        low_idx_candidates = window_df[window_df["Low"] == swing_low].index
        if len(low_idx_candidates) == 0:
            continue
        low_idx = low_idx_candidates[-1]

        subsequent_df = window_df.loc[low_idx:]
        if len(subsequent_df) < 3:
            continue

        swing_high = subsequent_df["High"].max()
        high_idx_candidates = subsequent_df[subsequent_df["High"] == swing_high].index
        if len(high_idx_candidates) == 0:
            continue
        high_idx = high_idx_candidates[-1]

        fibo_range = swing_high - swing_low
        if fibo_range <= 0:
            continue

        lvl_0382 = swing_high - (0.382 * fibo_range)
        lvl_075 = swing_high - (0.75 * fibo_range)
        entry_price = swing_high + (0.618 * fibo_range)
        stop_loss = swing_high + (1.0 * fibo_range)
        target = entry_price - ((stop_loss - entry_price) / 3)

        # 2. Identify Leg 2 (Retracement)
        leg2_df = window_df.loc[high_idx:]
        touched_0382 = False
        touch_date = None
        invalidated = False

        for idx, row in leg2_df.iterrows():
            if row["Low"] <= lvl_075:
                invalidated = True
                break
            if row["Low"] <= lvl_0382 and not touched_0382:
                touched_0382 = True
                touch_date = idx

        if not touched_0382 or invalidated:
            continue

        # 3. Check Leg 3 (Trigger within 3 days)
        current_date = window_df.index[-1]
        if (current_date - touch_date).days > 3:
            continue

        # If setup was perfectly valid historically, check the outcome in the future data!
        trade_triggered = False
        for j in range(i, len(df)):
            future_high = float(df["High"].iloc[j])
            future_low = float(df["Low"].iloc[j])

            if not trade_triggered:
                if future_high >= entry_price:
                    trade_triggered = True  # We got filled!

            if trade_triggered:
                # Did it hit target or stop loss first?
                if future_high >= stop_loss:
                    losses += 1
                    break
                elif future_low <= target:
                    wins += 1
                    break

    total_trades = wins + losses
    if total_trades == 0:
        return "0/0 (0%)"

    win_rate = int((wins / total_trades) * 100)
    return f"{win_rate}% ({wins}/{total_trades})"


def backtest_qullamaggie(df):
    if len(df) < 60:
        return "N/A"

    wins = 0
    losses = 0

    df_bt = df.copy()
    df_bt["MA10"] = df_bt["Close"].rolling(window=10).mean()
    df_bt["MA20"] = df_bt["Close"].rolling(window=20).mean()
    df_bt["MA50"] = df_bt["Close"].rolling(window=50).mean()
    df_bt["High_20"] = df_bt["High"].rolling(window=20).max().shift(1)

    # Start checking from day 50
    for i in range(50, len(df_bt) - 5):
        current_close = float(df_bt["Close"].iloc[i])
        current_high = float(df_bt["High"].iloc[i])
        prev_close = float(df_bt["Close"].iloc[i - 1])

        ma10 = float(df_bt["MA10"].iloc[i])
        ma20 = float(df_bt["MA20"].iloc[i])
        ma50 = float(df_bt["MA50"].iloc[i])
        prev_high_20 = float(df_bt["High_20"].iloc[i])

        # Qullamaggie conditions: MAs aligned, breaking out of 20-day high
        if current_close > ma10 > ma20 > ma50:
            if current_high > prev_high_20 and prev_close <= prev_high_20:
                entry_price = prev_high_20
                stop_loss = float(df_bt["Low"].iloc[i])  # Low of the breakout day

                if entry_price <= stop_loss:
                    continue

                target = entry_price + 2 * (entry_price - stop_loss)  # 2R target

                # Check future outcome
                for j in range(i + 1, len(df_bt)):
                    future_high = float(df_bt["High"].iloc[j])
                    future_low = float(df_bt["Low"].iloc[j])

                    if future_low <= stop_loss:
                        losses += 1
                        break
                    elif future_high >= target:
                        wins += 1
                        break

    total_trades = wins + losses
    if total_trades == 0:
        return "0/0 (0%)"

    win_rate = int((wins / total_trades) * 100)
    return f"{win_rate}% ({wins}/{total_trades})"


def get_sp500_tickers():
    """Fetch S&P 500 tickers from Wikipedia."""
    print("Fetching S&P 500 tickers from Wikipedia...")
    url = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }
    response = requests.get(url, headers=headers)
    tables = pd.read_html(response.text)
    df = tables[0]
    tickers = df["Symbol"].tolist()
    # Replace dots with hyphens for yfinance compatibility
    tickers = [ticker.replace(".", "-") for ticker in tickers]
    return tickers


def get_nasdaq_tickers():
    """Fetch NASDAQ-100 tickers from Wikipedia."""
    print("Fetching NASDAQ-100 tickers from Wikipedia...", flush=True)
    try:
        url = "https://en.wikipedia.org/wiki/Nasdaq-100"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
        response = requests.get(url, headers=headers)
        # Use flavor='lxml' or 'html5lib' if 'bs4' fails
        tables = pd.read_html(response.text, flavor="lxml")
        # The ticker table is usually the first or second one
        for table in tables:
            if "Ticker" in table.columns or "Symbol" in table.columns:
                col = "Ticker" if "Ticker" in table.columns else "Symbol"
                tickers = table[col].tolist()
                tickers = [ticker.replace(".", "-") for ticker in tickers]
                return tickers
    except Exception as e:
        print(
            f"Warning: Could not fetch Nasdaq-100 tickers: {e}. Using fallback list.",
            flush=True,
        )
        return [
            "AAPL",
            "MSFT",
            "AMZN",
            "NVDA",
            "META",
            "AVGO",
            "TSLA",
            "GOOGL",
            "GOOG",
            "COST",
            "ADBE",
            "PEP",
            "CSCO",
            "NFLX",
            "AMD",
            "TMUS",
            "INTC",
            "TXN",
            "QCOM",
            "AMGN",
            "HON",
            "INTU",
            "SBUX",
            "ISRG",
            "GILD",
            "MDLZ",
            "BKNG",
            "ADI",
            "VRTX",
            "REGN",
            "ADP",
            "PANW",
            "PDD",
            "LRCX",
            "SNPS",
            "MELI",
            "CDNS",
            "MU",
            "CSX",
            "PYPL",
            "KLAC",
            "MAR",
            "ASML",
            "CTAS",
            "ORLY",
            "CRWD",
            "MNST",
            "NXPI",
            "FTNT",
            "WDAY",
            "DXCM",
            "ABNB",
            "KDP",
            "LULU",
            "AEP",
            "BIIB",
            "MCHP",
            "IDXX",
            "KHC",
            "PAYX",
            "PCAR",
            "ROST",
            "CTSH",
            "EXC",
            "CEG",
            "EA",
            "VRSK",
            "CPRT",
            "SGEN",
            "ODFL",
            "FAST",
            "XEL",
            "VRSN",
            "DLTR",
            "CSGP",
            "BKR",
            "DDOG",
            "WBD",
            "WBA",
            "ON",
            "GEHC",
            "FANG",
            "ZS",
            "TEAM",
            "MRVL",
            "GFS",
            "CCEP",
            "TTD",
            "ENPH",
            "AZN",
            "SPLK",
            "DASH",
            "SYM",
            "CRSP",
            "ARM",
            "RIVN",
            "ZION",
            "ALGN",
            "MDB",
            "MSTR",
        ]


def calculate_indicators(df):
    """Calculate indicators using native pandas."""
    # EMAs
    df["EMA_10"] = df["Close"].ewm(span=10, adjust=False).mean()
    df["EMA_20"] = df["Close"].ewm(span=20, adjust=False).mean()
    df["EMA_50"] = df["Close"].ewm(span=50, adjust=False).mean()

    # 30-day Volume SMA
    df["Vol_SMA_30"] = df["Volume"].rolling(window=30).mean()

    # 200-day SMA
    df["SMA_200"] = df["Close"].rolling(window=200).mean()

    # 20-day ADR (Average Daily Range)
    # Daily Range = (High / Low) - 1
    df["Daily_Range"] = (df["High"] / df["Low"]) - 1
    df["ADR_20"] = (
        df["Daily_Range"].rolling(window=20).mean() * 100
    )  # Multiplied by 100 for percentage

    return df


def find_support_resistance(df):
    """
    Identify the highest high and lowest low of the last 100 days.
    Check if the current price is within 2% of these levels.
    """
    if len(df) < 100:
        return None, None

    last_100 = df.iloc[-100:]
    highest_high = last_100["High"].max()
    lowest_low = last_100["Low"].min()

    current_price = df.iloc[-1]["Close"]

    is_at_resistance = abs(current_price - highest_high) / highest_high <= 0.02
    is_at_support = abs(current_price - lowest_low) / lowest_low <= 0.02

    if is_at_resistance:
        return "Resistance", round(float(highest_high), 2)
    elif is_at_support:
        return "Support", round(float(lowest_low), 2)

    return None, None


def find_pivots(df, left_bars=5, right_bars=5):
    """Identify potential swing highs and swing lows."""
    highs = []
    lows = []
    for i in range(left_bars, len(df) - right_bars):
        if all(
            df["High"].iloc[i] >= df["High"].iloc[i - j]
            for j in range(1, left_bars + 1)
        ) and all(
            df["High"].iloc[i] >= df["High"].iloc[i + j]
            for j in range(1, right_bars + 1)
        ):
            highs.append((i, df.index[i], df["High"].iloc[i]))
        if all(
            df["Low"].iloc[i] <= df["Low"].iloc[i - j] for j in range(1, left_bars + 1)
        ) and all(
            df["Low"].iloc[i] <= df["Low"].iloc[i + j] for j in range(1, right_bars + 1)
        ):
            lows.append((i, df.index[i], df["Low"].iloc[i]))
    return highs, lows


def find_3_leg_fibo_short(df):
    # Look at the last 30 bars to find the structure
    recent_df = df.tail(30)
    if len(recent_df) < 10:
        return None, None, None, None, None, None, None, None, None

    # 1. Identify Leg 1 (Upward move: Low to High)
    swing_low = recent_df["Low"].min()
    low_idx = recent_df[recent_df["Low"] == swing_low].index[-1]

    # Find the highest point AFTER the swing low
    subsequent_df = recent_df.loc[low_idx:]
    if len(subsequent_df) < 3:
        return None, None, None, None, None, None, None, None, None

    swing_high = subsequent_df["High"].max()
    high_idx = subsequent_df[subsequent_df["High"] == swing_high].index[-1]

    # Calculate Fibonacci Levels based on Leg 1
    # Level 1.0 = swing_low, Level 0.0 = swing_high
    fibo_range = swing_high - swing_low
    if fibo_range <= 0:
        return None, None, None, None, None, None, None, None, None

    lvl_0 = swing_high
    lvl_0382 = swing_high - (0.382 * fibo_range)
    lvl_075 = swing_high - (0.75 * fibo_range)
    lvl_minus_0618 = swing_high + (0.618 * fibo_range)  # Extension UP (Entry for Short)
    lvl_minus_1 = swing_high + (1.0 * fibo_range)  # Stop Loss

    # 2. Identify Leg 2 (Retracement down)
    leg2_df = recent_df.loc[high_idx:]
    touched_0382 = False
    touch_date = None
    touch_low = None

    for idx, row in leg2_df.iterrows():
        if row["Low"] <= lvl_075:
            return (
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
            )  # INVALIDATED: Touched 0.75
        if row["Low"] <= lvl_0382 and not touched_0382:
            touched_0382 = True
            touch_date = idx
            touch_low = row["Low"]

    if not touched_0382:
        return None, None, None, None, None, None, None, None, None

    # 3. Identify Leg 3 (Extension up to -0.618 within 3 days)
    # Calculate days passed since 0.382 touch
    current_date = recent_df.index[-1]
    days_passed = (current_date - touch_date).days

    if days_passed > 3:
        return (
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        )  # INVALIDATED: Took more than 3 calendar days

    # Valid Setup Found! Return Trading Plan Variables
    entry = round(lvl_minus_0618, 2)
    stop_loss = round(lvl_minus_1, 2)
    target = round(
        entry - ((stop_loss - entry) / 3), 2
    )  # Target is below entry (1/3 of risk)

    # Explicitly format dates as strings to prevent JSON serialization/parsing crashes
    low_date_str = (
        str(low_idx.strftime("%Y-%m-%d"))
        if hasattr(low_idx, "strftime")
        else str(low_idx)
    )
    high_date_str = (
        str(high_idx.strftime("%Y-%m-%d"))
        if hasattr(high_idx, "strftime")
        else str(high_idx)
    )
    leg2_date_str = (
        str(touch_date.strftime("%Y-%m-%d"))
        if hasattr(touch_date, "strftime")
        else str(touch_date)
    )

    return (
        entry,
        stop_loss,
        target,
        low_date_str,
        float(swing_low),
        high_date_str,
        float(swing_high),
        leg2_date_str,
        float(touch_low),
    )


def get_indices_tickers():
    """Return a list of liquid index futures tickers."""
    return ["ES=F", "NQ=F", "YM=F", "RTY=F", "ZB=F", "ZN=F"]


def get_commodities_tickers():
    """Return a list of liquid commodity futures tickers."""
    return ["CL=F", "GC=F", "SI=F", "HG=F", "NG=F", "ZC=F", "ZW=F", "ZS=F"]


def run_scanner():
    sp500_tickers = get_sp500_tickers()
    nasdaq_tickers = get_nasdaq_tickers()
    indices_tickers = get_indices_tickers()
    commodities_tickers = get_commodities_tickers()

    # Create a mapping of ticker to market for later tagging
    ticker_market_map = {}
    for t in sp500_tickers:
        ticker_market_map[t] = "S&P 500"
    for t in nasdaq_tickers:
        ticker_market_map[t] = "NASDAQ"
    for t in indices_tickers:
        ticker_market_map[t] = "Indices"
    for t in commodities_tickers:
        ticker_market_map[t] = "Commodities"

    # Combined and remove duplicates
    regular_stocks = list(ticker_market_map.keys())

    my_futures = [
        "ES=F",
        "NQ=F",
        "YM=F",
        "RTY=F",
        "CL=F",
        "GC=F",
        "SPY",
        "QQQ",
        "DIA",
        "IWM",
        "AAPL",
        "MSFT",
        "NVDA",
        "TSLA",
        "AMZN",
        "GOOGL",
        "META",
    ]
    tickers = my_futures + regular_stocks
    print(
        f"Total unique tickers to scan (stocks + futures): {len(tickers)}", flush=True
    )

    # Ensure lists are cleared if run_scanner is called multiple times
    global momentum_candidates, nick_shawn_candidates, fibo_candidates
    momentum_candidates = []
    nick_shawn_candidates = []
    fibo_candidates = []

    end_date = datetime.datetime.now()
    start_date = end_date - datetime.timedelta(days=180)  # 6 months

    print(f"Scanning {len(tickers)} stocks...", flush=True)

    # Download all data in one batch for speed
    print("Downloading historical data for all stocks...", flush=True)
    try:
        # group_by='ticker' makes it easier to iterate
        data = yf.download(
            tickers, start=start_date, end=end_date, progress=True, group_by="ticker"
        )
    except Exception as e:
        print(f"Error downloading data: {e}", flush=True)
        return

    print("\nAnalyzing ticker data...", flush=True)
    for ticker in tickers:
        try:
            # yf.download with group_by='ticker' returns a MultiIndex if multiple tickers
            if ticker not in data.columns.levels[0]:
                continue

            df = data[ticker].dropna()

            if df.empty or len(df) < 50:
                continue

            df = calculate_indicators(df)

            # Get the most recent day's data
            last_row = df.iloc[-1]
            price = last_row["Close"]
            market = ticker_market_map.get(ticker, "Unknown")

            # --- Qullamaggie Strategy ---
            vol_sma = last_row["Vol_SMA_30"]
            ema10 = last_row["EMA_10"]
            ema20 = last_row["EMA_20"]
            ema50 = last_row["EMA_50"]
            adr = last_row["ADR_20"]

            # Setup_High (highest high of last 10 days)
            setup_high = df.iloc[-10:]["High"].max()

            check_price = price > 5
            check_volume = vol_sma > 500000
            check_trend = price > ema10 and ema10 > ema20 and ema20 > ema50

            if check_price and check_volume and check_trend:
                entry = round(float(df["High"].tail(10).max()), 2)
                stop_loss = round(float(df["EMA_20"].iloc[-1]), 2)

                # Directional Logic (Long vs Short Check)
                if entry > stop_loss:
                    risk = entry - stop_loss
                    target = round(entry + (3 * risk), 2)  # Qullamaggie 3R
                else:
                    risk = stop_loss - entry
                    target = round(entry - (3 * risk), 2)

                # Unified Signal Status Logic (WIDER THRESHOLDS)
                try:
                    price_f = float(price)
                    entry_f = float(entry)
                    dist = abs(entry_f - price_f) / price_f

                    if price_f >= entry_f * 0.995:  # Within 0.5% or above
                        sig_status = "🚀 Active"
                    elif dist <= 0.05:  # Within 5%
                        sig_status = "🔥 Close"
                    else:
                        sig_status = "⏳ Building"
                except Exception:
                    sig_status = "⏳ Building"

                # Run Backtest
                historical_winrate = backtest_qullamaggie(df)

                momentum_candidates.append(
                    {
                        "Ticker": ticker,
                        "Market": market,
                        "Signal_Status": sig_status,
                        "Close": round(float(price), 2),
                        "ADR_20%": round(float(adr), 2),
                        "Vol_SMA_30": int(vol_sma),
                        "EMA_10": round(float(ema10), 2),
                        "Entry": entry,
                        "Stop_Loss": stop_loss,
                        "Target": target,
                        "Check_Price": check_price,
                        "Check_Volume": check_volume,
                        "Check_Trend": check_trend,
                        "Win_Rate": historical_winrate,  # NEW FIELD
                    }
                )
                # Emoji-safe print
                safe_status = (
                    sig_status.replace("🚀", "[Active]")
                    .replace("🔥", "[Close]")
                    .replace("⏳", "[Building]")
                )
                print(f"[Qullamaggie] Appending {ticker} with status: {safe_status}")

            # --- Nick Shawn Strategy ---
            try:
                # 1. Define Support and Resistance over the last 50 days
                recent_50 = df.tail(50)
                price_f = float(price)
                support = float(recent_50["Low"].min())
                resistance = float(recent_50["High"].max())

                ns_setup_type = None
                ns_entry = 0.0
                ns_stop_loss = 0.0
                ns_target = 0.0
                ns_sig_status = "⏳ Building"

                # 2. Check LONG condition (Price is dropping into Support Zone - within 1.5%)
                if price_f <= support * 1.015 and price_f >= support:
                    ns_setup_type = "Long"
                    ns_entry = price_f
                    ns_stop_loss = support * 0.99  # Stop is 1% below actual support
                    ns_target = ns_entry + (ns_entry - ns_stop_loss)  # 1:1 Risk/Reward

                    ns_dist = abs(price_f - support) / support
                    if ns_dist <= 0.005:
                        ns_sig_status = "🚀 Active"
                    else:
                        ns_sig_status = "🔥 Close"

                # 3. Check SHORT condition (Price is rallying into Resistance Zone - within 1.5%)
                elif price_f >= resistance * 0.985 and price_f <= resistance:
                    ns_setup_type = "Short"
                    ns_entry = price_f
                    ns_stop_loss = (
                        resistance * 1.01
                    )  # Stop is 1% above actual resistance
                    ns_target = ns_entry - (ns_stop_loss - ns_entry)  # 1:1 Risk/Reward

                    ns_dist = abs(resistance - price_f) / resistance
                    if ns_dist <= 0.005:
                        ns_sig_status = "🚀 Active"
                    else:
                        ns_sig_status = "🔥 Close"

                # 4. Append if a setup was found
                if ns_setup_type:
                    # Run Backtest
                    historical_winrate = backtest_nick_shawn(df)

                    nick_shawn_candidates.append(
                        {
                            "Ticker": ticker,
                            "Market": market,
                            "Close": round(price_f, 2),
                            "Entry": round(float(ns_entry), 2),
                            "Stop_Loss": round(float(ns_stop_loss), 2),
                            "Target": round(float(ns_target), 2),
                            "Setup_Type": ns_setup_type,
                            "Check_Zone": True,
                            "Signal_Status": ns_sig_status,
                            "Win_Rate": historical_winrate,  # NEW FIELD
                        }
                    )
                    # Emoji-safe print
                    safe_ns_status = (
                        ns_sig_status.replace("🚀", "[Active]")
                        .replace("🔥", "[Close]")
                        .replace("⏳", "[Building]")
                    )
                    print(
                        f"[Nick Shawn] Appending {ticker} with status: {safe_ns_status}"
                    )
            except Exception as e:
                pass  # Silent on math but emoji error handled by structure

            # --- Fibonacci Counter-Trend Strategy ---
            (
                f_entry_val,
                f_stop_val,
                f_target_val,
                f_low_date,
                f_low_price,
                f_high_date,
                f_high_price,
                f_leg2_date,
                f_leg2_price,
            ) = find_3_leg_fibo_short(df)
            if f_entry_val is not None:
                # Unified Signal Status Logic (Fibonacci - WIDER THRESHOLDS)
                try:
                    if f_entry_val != 0:
                        price_f = float(price)
                        entry_f = float(f_entry_val)
                        dist = abs(price_f - entry_f) / abs(entry_f)

                        if dist <= 0.01:  # Within 1%
                            sig_status = "🚀 Active"
                        elif dist <= 0.05:  # Within 5%
                            sig_status = "🔥 Close"
                        else:
                            sig_status = "⏳ Building"
                    else:
                        sig_status = "⏳ Building"
                except Exception:
                    sig_status = "⏳ Building"

                try:
                    # Run Backtest
                    historical_winrate = backtest_3_leg_fibo_short(df)

                    fibo_candidates.append(
                        {
                            "Ticker": ticker,
                            "Market": market,
                            "Close": round(float(price), 2),
                            "Entry": f_entry_val,
                            "Stop_Loss": f_stop_val,
                            "Target": f_target_val,
                            "Trend": "Short Counter-Trend",
                            "Signal_Status": sig_status,
                            "Win_Rate": historical_winrate,  # NEW FIELD
                            "Swing_Low_Date": str(f_low_date),
                            "Swing_Low_Price": float(f_low_price),
                            "Swing_High_Date": str(f_high_date),
                            "Swing_High_Price": float(f_high_price),
                            "Leg2_Date": str(f_leg2_date),
                            "Leg2_Price": float(f_leg2_price),
                        }
                    )
                    # Emoji-safe print
                    safe_f_status = (
                        sig_status.replace("🚀", "[Active]")
                        .replace("🔥", "[Close]")
                        .replace("⏳", "[Building]")
                    )
                    print(
                        f"[Fibonacci] Appending {ticker} with status: {safe_f_status}"
                    )
                except Exception as e:
                    print(f"Error processing Fibo for {ticker}: {e}")
                    continue

        except Exception as e:
            continue

    print("Scan complete. Historical analysis finished.")

    # Results Summary
    print(f"\n--- Scan Summary ---")
    print(f"Momentum: {len(momentum_candidates)} candidates")
    print(f"Nick Shawn: {len(nick_shawn_candidates)} candidates")
    print(f"Fibonacci: {len(fibo_candidates)} candidates")
    print(f"--------------------\n")

    if not momentum_candidates and not nick_shawn_candidates and not fibo_candidates:
        print("\nNo stocks matched any criteria.", flush=True)

    base_dir = os.path.dirname(os.path.abspath(__file__))

    # 3. SAVE TO CSV EXACTLY ONCE (At the very end of the file, outside the loop)
    # Save Momentum Results
    if momentum_candidates:
        m_df = pd.DataFrame(momentum_candidates)
        m_df = m_df.sort_values(by="ADR_20%", ascending=False)
        # Explicitly ensure Signal_Status is present if list had at least one candidate
        if "Signal_Status" not in m_df.columns:
            m_df["Signal_Status"] = "⏳ Building"
        m_df.to_csv(os.path.join(base_dir, "momentum_candidates.csv"), index=False)
        print(f"[OK] Saved {len(momentum_candidates)} Momentum candidates.")
    else:
        pd.DataFrame(
            columns=[
                "Ticker",
                "Market",
                "Close",
                "ADR_20%",
                "Vol_SMA_30",
                "EMA_10",
                "Entry",
                "Stop_Loss",
                "Target",
                "Check_Price",
                "Check_Volume",
                "Check_Trend",
                "Signal_Status",
            ]
        ).to_csv(os.path.join(base_dir, "momentum_candidates.csv"), index=False)
        print("[WARN] No Momentum candidates found. Empty CSV created.")

    # Save Nick Shawn Results
    if nick_shawn_candidates:
        pd.DataFrame(nick_shawn_candidates).to_csv(
            os.path.join(base_dir, "nick_shawn_candidates.csv"), index=False
        )
        print(f"[OK] Saved {len(nick_shawn_candidates)} Nick Shawn candidates.")
    else:
        pd.DataFrame(
            columns=[
                "Ticker",
                "Market",
                "Close",
                "Entry",
                "Stop_Loss",
                "Target",
                "Setup_Type",
                "Check_Zone",
                "Signal_Status",
            ]
        ).to_csv(os.path.join(base_dir, "nick_shawn_candidates.csv"), index=False)
        print("[WARN] No Nick Shawn candidates found. Empty CSV created.")

    # Save Fibonacci Results
    if fibo_candidates:
        f_df = pd.DataFrame(fibo_candidates)
        if "Signal_Status" not in f_df.columns:
            f_df["Signal_Status"] = "⏳ Building"
        f_df.to_csv(os.path.join(base_dir, "fibo_candidates.csv"), index=False)
        print(f"[OK] Saved {len(fibo_candidates)} Fibonacci candidates.")
    else:
        pd.DataFrame(
            columns=[
                "Ticker",
                "Market",
                "Close",
                "Entry",
                "Stop_Loss",
                "Target",
                "Trend",
                "Signal_Status",
                "Win_Rate",
                "Swing_Low_Date",
                "Swing_Low_Price",
                "Swing_High_Date",
                "Swing_High_Price",
                "Leg2_Date",
                "Leg2_Price",
            ]
        ).to_csv(os.path.join(base_dir, "fibo_candidates.csv"), index=False)
        print("[WARN] No Fibonacci candidates found. Empty CSV created.")


if __name__ == "__main__":
    run_scanner()
