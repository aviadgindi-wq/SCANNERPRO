import streamlit as st
import pandas as pd
import streamlit.components.v1 as components
import os
import urllib.request
import xml.etree.ElementTree as ET
from scanner import run_scanner
import plotly.graph_objects as go
import yfinance as yf
import datetime

# Page configuration - MUST BE FIRST
st.set_page_config(page_title="PRO Stock Terminal", layout="wide")

# Pepperstone & TVC Symbol Map (High-Resiliency CFDs)
tv_symbol_map = {
    # --- INDICES (Standard & Micro) ---
    "ES=F": "PEPPERSTONE:US500",
    "MES=F": "PEPPERSTONE:US500",
    "NQ=F": "PEPPERSTONE:NAS100",
    "MNQ=F": "PEPPERSTONE:NAS100",
    "YM=F": "PEPPERSTONE:US30",
    "MYM=F": "PEPPERSTONE:US30",
    "RTY=F": "PEPPERSTONE:US2000",
    "M2K=F": "PEPPERSTONE:US2000",
    # --- COMMODITIES & METALS (Using TVC Native Feed) ---
    "CL=F": "TVC:USOIL",  # Crude Oil WTI
    "GC=F": "TVC:GOLD",  # Gold
    "SI=F": "TVC:SILVER",  # Silver
    "HG=F": "TVC:USCOPPER",  # Copper
    "NG=F": "TVC:USNGAS",  # Natural Gas
    # --- GRAINS & BONDS (Using TVC Native Feed) ---
    "ZC=F": "TVC:USCORN",
    "ZW=F": "TVC:USWHEAT",
    "ZS=F": "TVC:USSOYBEANS",
    "ZB=F": "TVC:US10Y",
    "ZN=F": "TVC:US10Y",
}


def get_rss_news(ticker):
    try:
        url = f"https://feeds.finance.yahoo.com/rss/2.0/headline?s={ticker}&region=US&lang=en-US"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req) as response:
            xml_data = response.read()
        root = ET.fromstring(xml_data)
        news_items = []
        for item in root.findall("./channel/item")[:5]:
            news_items.append(
                {
                    "title": item.find("title").text,
                    "link": item.find("link").text,
                    "pubDate": item.find("pubDate").text,
                }
            )
        return news_items
    except:
        return []


def render_verification_chart(selected_row, selected_tf, show_mas):
    """Generates an interactive Plotly chart with level overlays and dynamic Fibo zones for verification."""
    try:
        ticker = selected_row.get("Ticker", "")
        entry = selected_row.get("Entry")
        stop_loss = selected_row.get("Stop_Loss")
        target = selected_row.get("Target")

        # Clean the ticker for yfinance (e.g., remove TVC: or other mapped prefixes if passed accidentally)
        clean_ticker = ticker.split(":")[-1] if ":" in ticker else ticker

        period_str = "60d" if selected_tf in ["1h", "15m"] else "6mo"
        df = yf.download(
            clean_ticker, period=period_str, interval=selected_tf, progress=False
        )

        if df.empty:
            return go.Figure().update_layout(
                title="No price data found", template="plotly_dark"
            )

        # CRITICAL FIX: Flatten MultiIndex columns if yfinance returns them
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.droplevel(1)

        # Calculate Moving Averages for Visual Backtesting if requested
        if show_mas:
            df["MA10"] = df["Close"].rolling(window=10).mean()
            df["MA20"] = df["Close"].rolling(window=20).mean()
            df["MA50"] = df["Close"].rolling(window=50).mean()

        traces = [
            go.Candlestick(
                x=df.index,
                open=df["Open"],
                high=df["High"],
                low=df["Low"],
                close=df["Close"],
                name="Price",
            )
        ]

        if show_mas and "MA10" in df.columns:
            traces.extend(
                [
                    go.Scatter(
                        x=df.index,
                        y=df["MA10"],
                        mode="lines",
                        line=dict(color="blue", width=1),
                        name="MA 10",
                    ),
                    go.Scatter(
                        x=df.index,
                        y=df["MA20"],
                        mode="lines",
                        line=dict(color="orange", width=1),
                        name="MA 20",
                    ),
                    go.Scatter(
                        x=df.index,
                        y=df["MA50"],
                        mode="lines",
                        line=dict(color="grey", width=1.5, dash="dot"),
                        name="MA 50",
                    ),
                ]
            )

        fig = go.Figure(data=traces)

        # Add Level Overlays
        # Level Overlays & Fibo Logic
        setup_name = (
            str(
                selected_row.get(
                    "Trend", selected_row.get("Setup_Type", pd.Series([""]))
                )
            )
            .iloc[0]
            .lower()
            if hasattr(
                selected_row.get("Trend", selected_row.get("Setup_Type", "")), "iloc"
            )
            else str(
                selected_row.get("Trend", selected_row.get("Setup_Type", ""))
            ).lower()
        )
        if "counter-trend" in setup_name or "fibo" in setup_name:
            # Safely check if the columns actually exist in the dataframe before trying to plot the Zig-Zag
            swing_raw = selected_row.get("Swing_Low_Date", pd.Series([None]))
            swing_val = swing_raw.iloc[0] if hasattr(swing_raw, "iloc") else swing_raw
            if (
                "Swing_Low_Date" in selected_row.index
                and pd.notna(swing_val)
                and str(swing_val) != "N/A"
            ):
                try:
                    swing_low_date = (
                        selected_row["Swing_Low_Date"].iloc[0]
                        if hasattr(selected_row["Swing_Low_Date"], "iloc")
                        else selected_row.get("Swing_Low_Date")
                    )
                    swing_low_price = float(
                        selected_row["Swing_Low_Price"].iloc[0]
                        if hasattr(selected_row["Swing_Low_Price"], "iloc")
                        else selected_row.get("Swing_Low_Price")
                    )
                    swing_high_date = (
                        selected_row["Swing_High_Date"].iloc[0]
                        if hasattr(selected_row["Swing_High_Date"], "iloc")
                        else selected_row.get("Swing_High_Date")
                    )
                    swing_high_price = float(
                        selected_row["Swing_High_Price"].iloc[0]
                        if hasattr(selected_row["Swing_High_Price"], "iloc")
                        else selected_row.get("Swing_High_Price")
                    )
                    leg2_date = (
                        selected_row["Leg2_Date"].iloc[0]
                        if hasattr(selected_row["Leg2_Date"], "iloc")
                        else selected_row.get("Leg2_Date")
                    )
                    leg2_price = float(
                        selected_row["Leg2_Price"].iloc[0]
                        if hasattr(selected_row["Leg2_Price"], "iloc")
                        else selected_row.get("Leg2_Price")
                    )

                    # Draw the Zig-Zag (3 Legs)
                    fig.add_trace(
                        go.Scatter(
                            x=[swing_low_date, swing_high_date, leg2_date],
                            y=[swing_low_price, swing_high_price, leg2_price],
                            mode="lines+markers+text",
                            line=dict(color="magenta", width=4),
                            marker=dict(size=10, color="magenta", symbol="circle"),
                            text=["Swing Low", "Swing High", "Leg 2"],
                            textposition="top center",
                            name="3-Leg Fibo",
                        )
                    )

                    # Calculate and draw exact Fibo levels
                    fibo_range = swing_high_price - swing_low_price
                    if fibo_range > 0:
                        # 0 Level
                        fig.add_hline(
                            y=swing_high_price,
                            line_dash="dash",
                            line_color="rgba(255,255,255,0.4)",
                            annotation_text="0",
                            annotation_position="top left",
                        )
                        # 0.382 Level
                        fig.add_hline(
                            y=swing_high_price - (0.382 * fibo_range),
                            line_dash="dash",
                            line_color="rgba(255,255,255,0.4)",
                            annotation_text="0.382",
                            annotation_position="top left",
                        )
                        # 0.5 Level
                        fig.add_hline(
                            y=swing_high_price - (0.500 * fibo_range),
                            line_dash="dash",
                            line_color="rgba(255,255,255,0.4)",
                            annotation_text="0.5",
                            annotation_position="top left",
                        )
                        # 0.618 Level (Highlighted Entry Point)
                        fig.add_hline(
                            y=swing_high_price - (0.618 * fibo_range),
                            line_dash="solid",
                            line_color="cyan",
                            annotation_text="Fibo Entry Point (0.618)",
                            annotation_font_color="cyan",
                            annotation_position="top left",
                        )
                        # 1.0 Level
                        fig.add_hline(
                            y=swing_low_price,
                            line_dash="dash",
                            line_color="rgba(255,255,255,0.4)",
                            annotation_text="1.0",
                            annotation_position="bottom left",
                        )

                        # Shaded Area between 0.382 and 0.618
                        fig.add_hrect(
                            y0=swing_high_price - (0.382 * fibo_range),
                            y1=swing_high_price - (0.618 * fibo_range),
                            fillcolor="yellow",
                            opacity=0.15,
                            layer="below",
                        )

                        # Add literal Stop & Target from DataFrame for complete context
                        if pd.notna(stop_loss) and float(stop_loss) > 0:
                            fig.add_hline(
                                y=float(stop_loss),
                                line_dash="solid",
                                line_color="red",
                                annotation_text=f"Stop: {float(stop_loss):.2f}",
                                annotation_font_color="red",
                                annotation_position="bottom left",
                            )
                        if pd.notna(target) and float(target) > 0:
                            fig.add_hline(
                                y=float(target),
                                line_dash="solid",
                                line_color="green",
                                annotation_text=f"Target: {float(target):.2f}",
                                annotation_font_color="green",
                                annotation_position="top left",
                            )

                except Exception as e:
                    import streamlit as st

                    st.warning(
                        f"Warning: Missing or invalid Fibo coordinates. Plotting standard levels instead. ({e})"
                    )
                    # Fallback on exception
                    if pd.notna(entry) and float(entry) > 0:
                        fig.add_hline(
                            y=float(entry),
                            line_dash="dash",
                            line_color="cyan",
                            annotation_text=f"Entry: {float(entry):.2f}",
                            annotation_position="top left",
                        )
                    if pd.notna(stop_loss) and float(stop_loss) > 0:
                        fig.add_hline(
                            y=float(stop_loss),
                            line_dash="solid",
                            line_color="red",
                            annotation_text=f"Stop: {float(stop_loss):.2f}",
                            annotation_position="bottom left",
                        )
                    if pd.notna(target) and float(target) > 0:
                        fig.add_hline(
                            y=float(target),
                            line_dash="solid",
                            line_color="green",
                            annotation_text=f"Target: {float(target):.2f}",
                            annotation_position="top left",
                        )
            else:
                # Fallback: Just draw the regular lines if Fibo columns are missing or N/A
                import streamlit as st

                st.info(
                    "Fibo coordinates not found or marked N/A. Showing standard entry/stop lines."
                )
                if pd.notna(entry) and float(entry) > 0:
                    fig.add_hline(
                        y=float(entry),
                        line_dash="dash",
                        line_color="cyan",
                        annotation_text=f"Entry: {float(entry):.2f}",
                        annotation_position="top left",
                    )
                if pd.notna(stop_loss) and float(stop_loss) > 0:
                    fig.add_hline(
                        y=float(stop_loss),
                        line_dash="solid",
                        line_color="red",
                        annotation_text=f"Stop: {float(stop_loss):.2f}",
                        annotation_position="bottom left",
                    )
                if pd.notna(target) and float(target) > 0:
                    fig.add_hline(
                        y=float(target),
                        line_dash="solid",
                        line_color="green",
                        annotation_text=f"Target: {float(target):.2f}",
                        annotation_position="top left",
                    )
        else:
            # Standard/Generic Level Overlays (Momentum / Nick Shawn)
            if pd.notna(entry) and float(entry) > 0:
                fig.add_hline(
                    y=float(entry),
                    line_dash="dash",
                    line_color="cyan",
                    annotation_text=f"Entry: {float(entry):.2f}",
                    annotation_position="top left",
                )
            if pd.notna(stop_loss) and float(stop_loss) > 0:
                fig.add_hline(
                    y=float(stop_loss),
                    line_dash="solid",
                    line_color="red",
                    annotation_text=f"Stop: {float(stop_loss):.2f}",
                    annotation_position="bottom left",
                )
            if pd.notna(target) and float(target) > 0:
                fig.add_hline(
                    y=float(target),
                    line_dash="solid",
                    line_color="green",
                    annotation_text=f"Target: {float(target):.2f}",
                    annotation_position="top left",
                )

        fig.update_layout(
            template="plotly_dark",
            xaxis_rangeslider_visible=False,
            height=400,
            margin=dict(l=20, r=20, t=30, b=20),
            paper_bgcolor="rgba(0,0,0,0)",
            plot_bgcolor="rgba(0,0,0,0)",
            dragmode="pan",  # Enable panning by default instead of zooming
        )

        # Unlock axis ranges for interactive scrolling
        if not df.empty:
            end_time = df.index[-1]

            if selected_tf == "1d":
                # Daily: show last 60 days
                zoom_start = end_time - pd.Timedelta(days=60)
            elif selected_tf == "15m":
                # 15m: show last 48 hours
                zoom_start = end_time - pd.Timedelta(hours=48)
            elif selected_tf == "1wk":
                zoom_start = df.index[0]
            else:
                # Default zoom: last 3 trading days
                unique_dates = df.index.normalize().unique()
                if len(unique_dates) >= 3:
                    zoom_start = unique_dates[-3]
                else:
                    zoom_start = df.index[0]

            if zoom_start < df.index[0]:
                zoom_start = df.index[0]

            fig.update_xaxes(fixedrange=False, range=[zoom_start, end_time])
        else:
            fig.update_xaxes(fixedrange=False)

        fig.update_yaxes(fixedrange=False)
        return fig
    except Exception as e:
        return go.Figure().update_layout(
            title=f"Chart Error: {str(e)}", template="plotly_dark"
        )


# Removed caching to ensure real-time update of scan results
def load_data(strategy_name):
    if strategy_name == "Qullamaggie":
        filename = "momentum_candidates.csv"
    elif strategy_name == "Nick Shawn":
        filename = "nick_shawn_candidates.csv"
    else:
        filename = "fibo_candidates.csv"

    base_dir = os.path.dirname(os.path.abspath(__file__))
    filepath = os.path.join(base_dir, filename)

    if not os.path.exists(filepath):
        return None
    try:
        # Explicit encoding for Windows compatibility with emojis
        df = pd.read_csv(filepath, encoding="utf-8-sig")
        # Move Signal_Status to the front for immediate visibility
        if "Signal_Status" in df.columns:
            cols = df.columns.tolist()
            # Position it at index 2 (Ticker, Market, Signal_Status...)
            cols.insert(2, cols.pop(cols.index("Signal_Status")))
            df = df[cols]
        print(f"[DEBUG] Loaded {filename}, columns: {df.columns.tolist()}")
        return df
    except:
        return None


def render_tradingview_chart(tv_symbol, interval="D", height=750):
    """Generates the HTML string for the TradingView Advanced Chart widget."""
    container_id = (
        f"tv_chart_{interval}_{tv_symbol.replace(':', '_').replace('=', '_')}"
    )

    # Building JS string precisely with explicit variable injection
    js_config = (
        "{"
        + f"""
        "autosize": false,
        "width": "100%",
        "height": {height},
        "symbol": "{tv_symbol}",
        "interval": "{interval}",
        "timezone": "Etc/UTC",
        "theme": "dark",
        "style": "1",
        "locale": "en",
        "toolbar_bg": "#f1f3f6",
        "enable_publishing": false,
        "hide_top_toolbar": false,
        "allow_symbol_change": true,
        "container_id": "{container_id}"
    """
        + "}"
    )

    return f"""
    <div class="tradingview-widget-container" style="height:100%;width:100%">
      <div id="{container_id}" style="height:100%;width:100%"></div>
      <script type="text/javascript" src="https://s3.tradingview.com/tv.js"></script>
      <script type="text/javascript">
      new TradingView.widget({js_config});
      </script>
    </div>
    """


def get_quality_stars(row):
    check_cols = [c for c in row.index if str(c).startswith("Check_")]
    status = str(row.get("Signal_Status", ""))

    if len(check_cols) > 0:
        passed = sum(1 for c in check_cols if row.get(c) == True)
        return f"{passed}/{len(check_cols)} Passed"
    else:
        if "Active" in status or "🚀" in status:
            return "⭐⭐⭐⭐⭐"
        elif "Close" in status or "🔥" in status:
            return "⭐⭐⭐⭐"
        else:
            return "⭐⭐⭐"


def get_trade_type(row):
    try:
        e = float(row.get("Entry", 0))
        s = float(row.get("Stop_Loss", 0))
        if e > s:
            return "LONG 📈"
        elif e < s:
            return "SHORT 📉"
        return "N/A"
    except:
        return "N/A"


def format_dataframe(df):
    """Formats the dataframe for display in Streamlit."""
    if df.empty:
        return df

    # 1. Remove duplicate columns if any exist
    df = df.loc[:, ~df.columns.duplicated()].copy()

    # 2. Drop duplicates explicitly while accounting for different strategy structures
    subset_cols = ["Ticker", "Entry"]
    if "Setup_Type" in df.columns:
        subset_cols.append("Setup_Type")
    elif "Trend" in df.columns:
        subset_cols.append("Trend")

    df = df.drop_duplicates(subset=subset_cols).reset_index(drop=True)

    display_df = df.copy()

    # 1. Format Prices
    for col in [
        "Close",
        "Entry",
        "Stop_Loss",
        "Target",
        "ADR_20%",
        "Vol_SMA_30",
        "EMA_10",
    ]:
        if col in display_df.columns:
            # We round other indicators, but add $ to prices
            if col in ["Close", "Entry", "Stop_Loss", "Target"]:
                display_df[col] = pd.to_numeric(display_df[col], errors="coerce").apply(
                    lambda x: f"${x:.2f}" if pd.notna(x) else "N/A"
                )
            else:
                display_df[col] = pd.to_numeric(display_df[col], errors="coerce").apply(
                    lambda x: f"{x:.2f}" if pd.notna(x) else "N/A"
                )

    # 2. Add Type and Quality if not present
    if "Type" not in display_df.columns:
        display_df.insert(2, "Type", display_df.apply(get_trade_type, axis=1))

    if "Quality" not in display_df.columns:
        display_df.insert(3, "Quality", display_df.apply(get_quality_stars, axis=1))

    # Clean up check columns for display
    check_cols = [c for c in display_df.columns if str(c).startswith("Check_")]
    display_df = display_df.drop(columns=check_cols, errors="ignore")

    # Position Win_Rate dynamically if it exists
    if "Win_Rate" in display_df.columns:
        cols = display_df.columns.tolist()
        # Move Win_Rate to immediately follow Quality
        quality_idx = cols.index("Quality") if "Quality" in cols else 3
        cols.insert(quality_idx + 1, cols.pop(cols.index("Win_Rate")))
        display_df = display_df[cols]

    return display_df


def highlight_rows(row):
    """Pandas Styler function to color rows based on signal status."""
    status = str(row.get("Signal_Status", ""))
    # Green tint for Active
    if "Active" in status or "🚀" in status:
        return ["background-color: rgba(0, 255, 136, 0.15)"] * len(row)
    # Orange tint for Close
    elif "Close" in status or "🔥" in status:
        return ["background-color: rgba(255, 171, 0, 0.15)"] * len(row)
    return [""] * len(row)


# --- SIDEBAR (Controls) ---
with st.sidebar:
    st.title("⚙️ Terminal Controls")
    strategy = st.selectbox(
        "Market Strategy", ["Qullamaggie", "Nick Shawn", "Fibonacci Counter-Trend"]
    )

    market_list = ["All", "S&P 500", "NASDAQ", "Indices", "Commodities"]
    selected_market = st.selectbox("Market Sector", market_list)

    st.divider()
    st.subheader("🔍 Advanced Filters")
    ticker_search = st.text_input("Search Ticker", "").upper()

    status_filter = st.multiselect(
        "Signal Status",
        ["🚀 Active", "🔥 Close", "⏳ Building"],
        default=["🚀 Active", "🔥 Close", "⏳ Building"],
    )

    type_filter = st.multiselect(
        "Trade Type", ["Long", "Short"], default=["Long", "Short"]
    )

    st.divider()
    if st.button("🚀 Run Market Scan", use_container_width=True):
        with st.spinner("Scanning..."):
            try:
                run_scanner()
                st.success("Scan complete!")
                st.rerun()
            except Exception as e:
                st.error(f"Error: {e}")

# --- MAIN SCREEN ---
st.title("📟 PRO Terminal")

# Load candidates based on strategy
candidates_df = load_data(strategy)

filtered_df = pd.DataFrame()
if candidates_df is not None and not candidates_df.empty:
    filtered_df = candidates_df.copy()

    # 1. Market Filter
    if selected_market != "All":
        filtered_df = filtered_df[filtered_df["Market"] == selected_market]

    # 2. Ticker Search
    if ticker_search:
        filtered_df = filtered_df[
            filtered_df["Ticker"].str.contains(ticker_search, na=False)
        ]

    # 3. Status Filter (Robust matching)
    if status_filter:
        # Create a combined regex pattern from selected statuses
        # Statuses in CSV might be '🚀 Active' or '🔥 Close' etc.
        pattern = "|".join(
            [
                s.replace("🚀 ", "").replace("🔥 ", "").replace("⏳ ", "")
                for s in status_filter
            ]
        )
        filtered_df = filtered_df[
            filtered_df["Signal_Status"].str.contains(pattern, case=False, na=False)
        ]

    # 4. Trade Type Filter
    if type_filter and not filtered_df.empty:
        # Determine trade type on the fly for filtering if not in CSV
        # Or check if Entry > Stop_Loss logic
        def get_type(row):
            try:
                e, s = float(row["Entry"]), float(row["Stop_Loss"])
                return "Long" if e > s else "Short" if e < s else "N/A"
            except:
                return "N/A"

        filtered_df["__Trade_Type"] = filtered_df.apply(get_type, axis=1)
        filtered_df = filtered_df[filtered_df["__Trade_Type"].isin(type_filter)]
        filtered_df = filtered_df.drop(columns=["__Trade_Type"])

    st.subheader(f"Candidates: {strategy} ({selected_market})")

    # Reorder columns for better visibility
    cols = filtered_df.columns.tolist()
    if "Signal_Status" in cols:
        cols.insert(2, cols.pop(cols.index("Signal_Status")))
    filtered_df = filtered_df[cols]

    # --- Dynamic Filters ---
    st.markdown("### 🔍 Filter Opportunities")
    col1, col2 = st.columns(2)

    if not filtered_df.empty:
        with col1:
            # We map Setup_Type if it exists; otherwise Type (Long/Short) or Trend
            filter_col = (
                "Setup_Type"
                if "Setup_Type" in filtered_df.columns
                else "Trend"
                if "Trend" in filtered_df.columns
                else "Type"
            )
            if filter_col in filtered_df.columns:
                setup_options = filtered_df[filter_col].dropna().unique().tolist()
                selected_setups = st.multiselect(
                    f"Trade Type ({filter_col}):",
                    options=setup_options,
                    default=setup_options,
                )
                filtered_df = filtered_df[filtered_df[filter_col].isin(selected_setups)]

        with col2:
            if "Signal_Status" in filtered_df.columns:
                status_options = filtered_df["Signal_Status"].dropna().unique().tolist()
                selected_statuses = st.multiselect(
                    "Signal Status:", options=status_options, default=status_options
                )
                filtered_df = filtered_df[
                    filtered_df["Signal_Status"].isin(selected_statuses)
                ]

    # Render interactive st.dataframe
    selected_ticker = None
    ticker_data = None

    if filtered_df.empty:
        st.info("No candidates found matching current filters.")
    else:
        st.markdown("<br>", unsafe_allow_html=True)

        # 1. Bulletproof: Enforce unique columns and index on the source Dataframe
        filtered_df = filtered_df.loc[:, ~filtered_df.columns.duplicated()].copy()
        filtered_df.reset_index(drop=True, inplace=True)

        # 2. Format for display
        display_df = format_dataframe(filtered_df)

        # 3. Apply Pandas styling. Do NOT set Ticker as index! Numeric index must remain unique.
        styled_df = display_df.style.apply(highlight_rows, axis=1)

        # 4. Render dataframe with row selection, hiding the numeric index visually
        event = st.dataframe(
            styled_df,
            use_container_width=True,
            height=400,
            on_select="rerun",
            selection_mode="single-row",
            hide_index=True,
        )

        # 5. Extract exactly the selected row via the numeric row index
        if (
            "selection" in event
            and "rows" in event["selection"]
            and len(event["selection"]["rows"]) > 0
        ):
            row_index = event["selection"]["rows"][0]
            selected_ticker = display_df.iloc[row_index]["Ticker"]
            # Fetch EXACT original row mapping (solves duplicate ticker selection issue)
            ticker_data = filtered_df.iloc[row_index]

    if selected_ticker is not None and ticker_data is not None:
        st.divider()
        st.markdown(f"### Analyzing: {selected_ticker}")

        # --- Position Size Calculator ---
        st.markdown("### 💰 Risk Management Calculator")
        risk_amount = st.number_input(
            "How much money are you willing to risk on this trade? ($)",
            min_value=1.0,
            value=100.0,
            step=10.0,
        )

        try:
            entry_price = float(ticker_data.get("Entry", 0))
            stop_loss = float(ticker_data.get("Stop_Loss", 0))

            if pd.notna(entry_price) and pd.notna(stop_loss) and entry_price > 0:
                risk_per_share = abs(entry_price - stop_loss)

                if risk_per_share > 0:
                    position_size = int(risk_amount / risk_per_share)
                    total_capital_needed = position_size * entry_price

                    st.info(f"**Action Plan:** To risk exactly **${risk_amount:,.2f}**")
                    col1, col2, col3 = st.columns(3)
                    col1.metric("Buy (Shares/Units)", f"{position_size}")
                    col2.metric("Risk per Share", f"${risk_per_share:,.2f}")
                    col3.metric(
                        "Total Capital Required", f"${total_capital_needed:,.2f}"
                    )
                else:
                    st.warning(
                        "Entry and Stop Loss are identical. Cannot calculate position size."
                    )
            else:
                st.warning("Missing Entry or Stop Loss data for this setup.")
        except Exception as e:
            st.error(f"Could not calculate position size. Error: {e}")

        # Tabs for layout organization
        tab1, tab2 = st.tabs(["📈 Chart & Trading Plan", "📰 Real-Time News"])

        with tab1:
            # Grid for Metrics
            m_col1, m_col2, m_col3 = st.columns(3)
            entry_val = (
                f"${ticker_data['Entry']:.2f}"
                if pd.notnull(ticker_data.get("Entry"))
                else "N/A"
            )
            stop_val = (
                f"${ticker_data['Stop_Loss']:.2f}"
                if pd.notnull(ticker_data.get("Stop_Loss"))
                else "N/A"
            )
            target_val = (
                f"${ticker_data['Target']:.2f}"
                if pd.notnull(ticker_data.get("Target"))
                else "N/A"
            )

            with m_col1:
                st.metric("🟢 Entry Price", entry_val)
            with m_col2:
                st.metric("🔴 Stop Loss", stop_val)
            with m_col3:
                st.metric("🎯 Take Profit", target_val)

            # Checklist
            with st.expander("✅ Strict Strategy Checklist", expanded=True):
                if strategy == "Qullamaggie":
                    st.markdown(
                        "- [ ] Is the stock breaking out on high volume?\n- [ ] Is the overall market trend bullish?\n- [ ] Am I risking max 1% of my account?"
                    )
                elif strategy == "Nick Shawn":
                    st.markdown(
                        "- [ ] Did the 1-Hour chart show a clear rejection?\n- [ ] Is the Stop Loss placed safely below the zone?\n- [ ] Am I risking max 1% of my account?"
                    )
                elif strategy == "Fibonacci Counter-Trend":
                    st.markdown(
                        "- [ ] Has Leg 3 reached the -0.618 extension precisely?\n- [ ] Was the retracement between 0.382 and 0.75?\n- [ ] Am I risking max 1% of my account?"
                    )

            # Verification Chart (Plotly Overlay)
            st.divider()

            st.markdown("### 📊 Chart Controls")
            ctrl_col1, ctrl_col2 = st.columns([1, 2])
            with ctrl_col1:
                selected_tf = st.selectbox(
                    "Timeframe", options=["1d", "1wk", "1h", "15m"], index=0
                )
            with ctrl_col2:
                show_mas = st.checkbox("Show Moving Averages (10, 20, 50)", value=False)

            st.markdown("### 🔍 Algorithm Verification")
            v_fig = render_verification_chart(ticker_data, selected_tf, show_mas)

            if v_fig:
                st.plotly_chart(v_fig, use_container_width=True)
            else:
                st.info("Loading high-fidelity verification data...")

            st.divider()

            # Map ticker to TradingView symbol
            tv_symbol = tv_symbol_map.get(selected_ticker, selected_ticker)

            # Chart Controls & Display
            chart_height = st.slider(
                "Chart Height", 400, 1200, 750, 50, key="height_slider"
            )

            st.markdown(f"#### 🌍 Technical View: {selected_ticker} (Daily)")
            components.html(
                render_tradingview_chart(tv_symbol, "D", chart_height),
                height=chart_height,
            )

            if strategy in ["Nick Shawn", "Fibonacci Counter-Trend"]:
                st.markdown(f"#### 🕒 Entry View: {selected_ticker} (1-Hour)")
                components.html(
                    render_tradingview_chart(tv_symbol, "60", chart_height),
                    height=chart_height,
                )

        with tab2:
            st.subheader(f"📰 Real-Time Catalysts: {selected_ticker}")
            news = get_rss_news(selected_ticker)
            if news:
                for item in news:
                    st.markdown(f"🔥 **[{item['title']}]({item['link']})**")
                    st.caption(f"🕒 {item['pubDate']}")
            else:
                st.info("Searching for headlines...")

    else:
        st.info("Select a row in the table to view details.")

elif candidates_df is None:
    st.warning("Initialize Terminal: Run Scan in Sidebar")
else:
    st.info("No candidates matching criteria.")
