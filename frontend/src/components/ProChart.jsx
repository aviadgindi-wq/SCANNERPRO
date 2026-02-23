import React, { useEffect, useRef, useState, useCallback, memo } from 'react';
import { createChart, CrosshairMode, LineStyle } from 'lightweight-charts';

// ── Exchange:Symbol display mapping ──
const EXCHANGE_MAP = {
    'ES=F': 'CME:ES1!', 'ES': 'CME:ES1!',
    'MES=F': 'CME:MES1!', 'MES': 'CME:MES1!',
    'NQ=F': 'CME:NQ1!', 'NQ': 'CME:NQ1!',
    'MNQ=F': 'CME:MNQ1!', 'MNQ': 'CME:MNQ1!',
    'YM=F': 'CBOT:YM1!', 'YM': 'CBOT:YM1!',
    'CL=F': 'NYMEX:CL1!', 'CL': 'NYMEX:CL1!',
    'GC=F': 'COMEX:GC1!', 'GC': 'COMEX:GC1!',
    'BRK-B': 'NYSE:BRK.B',
};

const toDisplay = (t) => {
    if (!t) return 'AAPL';
    const upT = t.toUpperCase();
    return EXCHANGE_MAP[upT] || upT;
};

// ── Ensure all timestamps are Unix SECONDS (not ms) ──
function ensureUnixSeconds(ts) {
    if (typeof ts === 'number' && ts > 1e10) return Math.floor(ts / 1000);
    return ts;
}

function normalizeOhlc(ohlc) {
    return ohlc.map(d => ({
        ...d,
        time: ensureUnixSeconds(d.time),
    }));
}

// ─────────────────────────────────────────────────────────────────────
//  Indicator Calculation Engine
// ─────────────────────────────────────────────────────────────────────

/** Simple Moving Average */
function calcSMA(closes, period) {
    const result = [];
    for (let i = 0; i < closes.length; i++) {
        if (i < period - 1) { result.push(null); continue; }
        let sum = 0;
        for (let j = i - period + 1; j <= i; j++) sum += closes[j];
        result.push(sum / period);
    }
    return result;
}

/** Exponential Moving Average */
function calcEMA(closes, period) {
    const result = [];
    const k = 2 / (period + 1);
    let ema = null;
    for (let i = 0; i < closes.length; i++) {
        if (i < period - 1) { result.push(null); continue; }
        if (ema === null) {
            // seed with SMA
            let sum = 0;
            for (let j = i - period + 1; j <= i; j++) sum += closes[j];
            ema = sum / period;
        } else {
            ema = closes[i] * k + ema * (1 - k);
        }
        result.push(ema);
    }
    return result;
}

/** Relative Strength Index */
function calcRSI(closes, period = 14) {
    const result = [];
    if (closes.length < period + 1) return closes.map(() => null);

    let avgGain = 0, avgLoss = 0;

    // First pass: initial avg
    for (let i = 1; i <= period; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff >= 0) avgGain += diff; else avgLoss += Math.abs(diff);
    }
    avgGain /= period;
    avgLoss /= period;

    // Pad nulls for initial bars
    for (let i = 0; i <= period; i++) result.push(null);

    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result[period] = 100 - 100 / (1 + rs);

    // Smoothed
    for (let i = period + 1; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        const gain = diff >= 0 ? diff : 0;
        const loss = diff < 0 ? Math.abs(diff) : 0;
        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
        const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
        result.push(rsi);
    }
    return result;
}

/** VWAP (Volume Weighted Average Price) — resets each day */
function calcVWAP(ohlc) {
    const result = [];
    let cumVol = 0, cumTP = 0, lastDay = null;
    for (const bar of ohlc) {
        const dayKey = typeof bar.time === 'string' ? bar.time : new Date(bar.time * 1000).toISOString().slice(0, 10);
        if (dayKey !== lastDay) { cumVol = 0; cumTP = 0; lastDay = dayKey; }
        const tp = (bar.high + bar.low + bar.close) / 3;
        const vol = bar.volume || 0;
        cumTP += tp * vol;
        cumVol += vol;
        result.push(cumVol > 0 ? cumTP / cumVol : null);
    }
    return result;
}

// ── Color palette for rotating indicator colors ──
const INDICATOR_COLORS = [
    '#2196F3', // blue
    '#FF9800', // orange
    '#9C27B0', // purple
    '#00BCD4', // cyan
    '#E91E63', // pink
    '#8BC34A', // lime
    '#FF5722', // deep orange
    '#607D8B', // blue grey
    '#FFEB3B', // yellow
    '#4CAF50', // green
];

// ── Known quick-add presets ──
const QUICK_INDICATORS = [
    { label: 'SMA 20', type: 'SMA', period: 20 },
    { label: 'SMA 50', type: 'SMA', period: 50 },
    { label: 'SMA 200', type: 'SMA', period: 200 },
    { label: 'EMA 9', type: 'EMA', period: 9 },
    { label: 'EMA 21', type: 'EMA', period: 21 },
    { label: 'RSI 14', type: 'RSI', period: 14 },
    { label: 'VWAP', type: 'VWAP', period: 0 },
];

// ── Parse user input like "SMA 50", "EMA 200", "RSI 14", "VWAP" ──
function parseIndicatorInput(input) {
    const trimmed = input.trim().toUpperCase();
    if (trimmed === 'VWAP') return { type: 'VWAP', period: 0, label: 'VWAP' };
    const match = trimmed.match(/^(SMA|EMA|RSI)\s*(\d+)$/);
    if (!match) return null;
    const type = match[1];
    const period = parseInt(match[2], 10);
    if (period < 1 || period > 500) return null;
    return { type, period, label: `${type} ${period}` };
}

// ── Fibo level colors ──
const FIBO_COLORS = {
    '0': { color: 'rgba(176,184,200,0.5)', label: '0.0', style: LineStyle.Dashed },
    '0.382': { color: '#e8a020', label: '0.382', style: LineStyle.Dashed },
    '0.5': { color: 'rgba(176,184,200,0.5)', label: '0.5', style: LineStyle.Dashed },
    '0.618': { color: '#FFD700', label: '0.618', style: LineStyle.Solid },
    '1': { color: 'rgba(176,184,200,0.5)', label: '1.0', style: LineStyle.Dashed },
};

// ─────────────────────────────────────────────────────────────────────
//  drawFiboOverlays — uses addLineSeries so everything can be removed
// ─────────────────────────────────────────────────────────────────────
function drawFiboOverlays(chart, candleSeries, data, overlayLinesRef) {
    overlayLinesRef.current.forEach(s => {
        try { chart.removeSeries(s); } catch (_) { }
    });
    overlayLinesRef.current = [];

    if (!data || !data.ohlc || data.ohlc.length < 2) return;

    const ohlc = normalizeOhlc(data.ohlc);
    const firstTime = ohlc[0].time;
    const lastTime = ohlc[ohlc.length - 1].time;

    const addHorizontalLine = (price, title, color, lineStyle = LineStyle.Dashed, lineWidth = 1) => {
        const s = chart.addLineSeries({
            color, lineWidth, lineStyle,
            priceLineVisible: false, lastValueVisible: true,
            crosshairMarkerVisible: false, title,
        });
        s.setData([
            { time: firstTime, value: price },
            { time: lastTime, value: price },
        ]);
        overlayLinesRef.current.push(s);
        return s;
    };

    // Fibonacci levels
    if (data.overlays?.fibo?.levels) {
        const lvls = data.overlays.fibo.levels;
        for (const [key, price] of Object.entries(lvls)) {
            const cfg = FIBO_COLORS[key];
            if (cfg && price != null) {
                addHorizontalLine(price, cfg.label, cfg.color, cfg.style, key === '0.618' ? 2 : 1);
            }
        }
    }

    // Zigzag legs (magenta)
    if (data.overlays?.fibo?.legs) {
        const legs = data.overlays.fibo.legs;
        const points = [
            legs.leg1_start && { time: ensureUnixSeconds(legs.leg1_start.date), value: legs.leg1_start.price },
            legs.leg1_end && { time: ensureUnixSeconds(legs.leg1_end.date), value: legs.leg1_end.price },
            legs.leg2_end && { time: ensureUnixSeconds(legs.leg2_end.date), value: legs.leg2_end.price },
        ].filter(Boolean);
        points.sort((a, b) => {
            const ta = typeof a.time === 'number' ? a.time : new Date(a.time).getTime();
            const tb = typeof b.time === 'number' ? b.time : new Date(b.time).getTime();
            return ta - tb;
        });
        const seen = new Set();
        const unique = points.filter(p => { const k = String(p.time); if (seen.has(k)) return false; seen.add(k); return true; });
        if (unique.length > 1) {
            const zigzag = chart.addLineSeries({
                color: '#ff00ff', lineWidth: 3, lineStyle: LineStyle.Solid,
                crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false, title: '',
            });
            zigzag.setData(unique);
            overlayLinesRef.current.push(zigzag);
        }
    }

    // Entry (Blue), Stop (Red), Target (Green)
    if (data.overlays?.predictions) {
        const p = data.overlays.predictions;
        if (p.entry != null) addHorizontalLine(p.entry, 'Entry', '#0088ff', LineStyle.Solid, 2);
        if (p.stop_loss != null) addHorizontalLine(p.stop_loss, 'Stop', '#ef5350', LineStyle.Solid, 2);
        if (p.target != null) addHorizontalLine(p.target, 'Target', '#00C851', LineStyle.Solid, 2);
    }

    // Nick Shawn S/R zones
    if (data.overlays?.nick_shawn) {
        const ns = data.overlays.nick_shawn;
        if (ns.support_zone) {
            addHorizontalLine(ns.support_zone.low, 'S-Low', '#4CAF50', LineStyle.Dashed, 1);
            addHorizontalLine(ns.support_zone.high, 'S-High', '#4CAF50', LineStyle.Dashed, 1);
        }
        if (ns.resistance_zone) {
            addHorizontalLine(ns.resistance_zone.low, 'R-Low', '#F44336', LineStyle.Dashed, 1);
            addHorizontalLine(ns.resistance_zone.high, 'R-High', '#F44336', LineStyle.Dashed, 1);
        }
    }

    // Qullamaggie breakout
    if (data.overlays?.qullamaggie?.breakout_level) {
        addHorizontalLine(data.overlays.qullamaggie.breakout_level, 'Breakout', '#FFD700', LineStyle.Solid, 2);
    }

    // Support / Resistance
    if (data.overlays?.support != null) addHorizontalLine(data.overlays.support, 'Support', '#4CAF50', LineStyle.Dashed, 1);
    if (data.overlays?.resistance != null) addHorizontalLine(data.overlays.resistance, 'Resistance', '#F44336', LineStyle.Dashed, 1);

    // Markers
    if (candleSeries && data.overlays?.predictions) {
        const p = data.overlays.predictions;
        const markers = [];
        if (p.entry != null && ohlc.length > 0) {
            const lastCandle = ohlc[ohlc.length - 1];
            const isLong = p.entry > (p.stop_loss ?? 0);
            markers.push({
                time: lastCandle.time,
                position: isLong ? 'belowBar' : 'aboveBar',
                color: '#0088ff',
                shape: isLong ? 'arrowUp' : 'arrowDown',
                text: isLong ? `▲ LONG Entry ${p.entry.toFixed(2)}` : `▼ SHORT Entry ${p.entry.toFixed(2)}`,
                size: 1,
            });
        }
        markers.sort((a, b) => {
            const ta = typeof a.time === 'number' ? a.time : new Date(a.time).getTime();
            const tb = typeof b.time === 'number' ? b.time : new Date(b.time).getTime();
            return ta - tb;
        });
        candleSeries.setMarkers(markers);
    }
}

// ─────────────────────────────────────────────────────────────────────
//  drawIndicators — SMA, EMA, RSI, VWAP series with ref tracking
// ─────────────────────────────────────────────────────────────────────
function drawIndicators(chart, ohlc, activeIndicators, indicatorSeriesRef) {
    // Remove old indicator series
    indicatorSeriesRef.current.forEach(s => {
        try { chart.removeSeries(s); } catch (_) { }
    });
    indicatorSeriesRef.current = [];

    if (!ohlc || ohlc.length < 2 || activeIndicators.length === 0) return;

    const closes = ohlc.map(d => d.close);

    activeIndicators.forEach((ind, idx) => {
        const color = INDICATOR_COLORS[idx % INDICATOR_COLORS.length];

        if (ind.type === 'SMA' || ind.type === 'EMA') {
            const values = ind.type === 'SMA' ? calcSMA(closes, ind.period) : calcEMA(closes, ind.period);
            const lineData = ohlc
                .map((d, i) => values[i] != null ? { time: d.time, value: values[i] } : null)
                .filter(Boolean);

            if (lineData.length > 0) {
                const s = chart.addLineSeries({
                    color,
                    lineWidth: 1,
                    lineStyle: LineStyle.Solid,
                    priceLineVisible: false,
                    lastValueVisible: true,
                    crosshairMarkerVisible: false,
                    title: ind.label,
                });
                s.setData(lineData);
                indicatorSeriesRef.current.push(s);
            }
        }

        if (ind.type === 'RSI') {
            const values = calcRSI(closes, ind.period);
            const lineData = ohlc
                .map((d, i) => values[i] != null ? { time: d.time, value: values[i] } : null)
                .filter(Boolean);

            if (lineData.length > 0) {
                // RSI on its own price scale at bottom
                const s = chart.addLineSeries({
                    color,
                    lineWidth: 1,
                    lineStyle: LineStyle.Solid,
                    priceLineVisible: false,
                    lastValueVisible: true,
                    crosshairMarkerVisible: false,
                    title: ind.label,
                    priceScaleId: 'rsi',
                    priceFormat: { type: 'custom', formatter: v => v.toFixed(1) },
                });
                s.setData(lineData);
                indicatorSeriesRef.current.push(s);

                // Configure RSI price scale to sit at bottom
                chart.priceScale('rsi').applyOptions({
                    scaleMargins: { top: 0.8, bottom: 0.0 },
                    borderVisible: true,
                    borderColor: '#2B3139',
                });

                // Overbought / Oversold reference lines
                const addRefLine = (val, refColor) => {
                    const rs = chart.addLineSeries({
                        color: refColor,
                        lineWidth: 1,
                        lineStyle: LineStyle.Dotted,
                        priceLineVisible: false,
                        lastValueVisible: false,
                        crosshairMarkerVisible: false,
                        title: '',
                        priceScaleId: 'rsi',
                    });
                    rs.setData([
                        { time: ohlc[0].time, value: val },
                        { time: ohlc[ohlc.length - 1].time, value: val },
                    ]);
                    indicatorSeriesRef.current.push(rs);
                };
                addRefLine(70, 'rgba(239,83,80,0.4)');   // overbought
                addRefLine(30, 'rgba(38,166,154,0.4)');   // oversold
            }
        }

        if (ind.type === 'VWAP') {
            const values = calcVWAP(ohlc);
            const lineData = ohlc
                .map((d, i) => values[i] != null ? { time: d.time, value: values[i] } : null)
                .filter(Boolean);

            if (lineData.length > 0) {
                const s = chart.addLineSeries({
                    color: '#E040FB',
                    lineWidth: 2,
                    lineStyle: LineStyle.Solid,
                    priceLineVisible: false,
                    lastValueVisible: true,
                    crosshairMarkerVisible: false,
                    title: 'VWAP',
                });
                s.setData(lineData);
                indicatorSeriesRef.current.push(s);
            }
        }
    });
}

// ─────────────────────────────────────────────────────────────────────
//  ProChart Component
// ─────────────────────────────────────────────────────────────────────
const ProChart = ({ data, ticker, interval = '1d', showFibo, setShowFibo }) => {
    const chartContainerRef = useRef(null);
    const chartRef = useRef(null);
    const candleSeriesRef = useRef(null);
    const volumeSeriesRef = useRef(null);
    const overlayLinesRef = useRef([]);
    const indicatorSeriesRef = useRef([]);
    const resizeObserverRef = useRef(null);
    const cachedOhlcRef = useRef([]);

    // ── Indicator state ──
    const [activeIndicators, setActiveIndicators] = useState([]);
    const [indicatorInput, setIndicatorInput] = useState('');

    const addIndicator = useCallback((ind) => {
        setActiveIndicators(prev => {
            if (prev.find(i => i.label === ind.label)) return prev; // no duplicates
            return [...prev, ind];
        });
    }, []);

    const removeIndicator = useCallback((label) => {
        setActiveIndicators(prev => prev.filter(i => i.label !== label));
    }, []);

    const handleIndicatorSubmit = useCallback((e) => {
        e.preventDefault();
        const parsed = parseIndicatorInput(indicatorInput);
        if (parsed) {
            addIndicator(parsed);
            setIndicatorInput('');
        }
    }, [indicatorInput, addIndicator]);

    // ── Create the chart ONCE on mount ──
    useEffect(() => {
        if (!chartContainerRef.current) return;

        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: 'solid', color: '#131722' },
                textColor: '#B2B5BE',
            },
            grid: {
                vertLines: { color: 'rgba(42, 46, 57, 0.5)' },
                horzLines: { color: 'rgba(42, 46, 57, 0.5)' },
            },
            crosshair: { mode: CrosshairMode.Normal },
            rightPriceScale: {
                borderColor: '#2B3139',
                scaleMargins: { top: 0.08, bottom: 0.08 },
                autoScale: true,
            },
            timeScale: {
                borderColor: '#2B3139',
                timeVisible: true,
                secondsVisible: false,
            },
            handleScroll: true,
            handleScale: true,
            width: chartContainerRef.current.clientWidth,
            height: chartContainerRef.current.clientHeight,
        });

        const candleSeries = chart.addCandlestickSeries({
            upColor: '#26a69a',
            downColor: '#ef5350',
            borderVisible: false,
            wickUpColor: '#26a69a',
            wickDownColor: '#ef5350',
        });

        chartRef.current = chart;
        candleSeriesRef.current = candleSeries;

        // ResizeObserver
        const ro = new ResizeObserver(() => {
            if (chartContainerRef.current && chartRef.current) {
                chartRef.current.resize(
                    chartContainerRef.current.clientWidth,
                    chartContainerRef.current.clientHeight
                );
            }
        });
        ro.observe(chartContainerRef.current);
        resizeObserverRef.current = ro;

        return () => {
            ro.disconnect();
            chart.remove();
            chartRef.current = null;
            candleSeriesRef.current = null;
            volumeSeriesRef.current = null;
            overlayLinesRef.current = [];
            indicatorSeriesRef.current = [];
        };
    }, []);

    // ── Update candle data + overlays when data changes ──
    useEffect(() => {
        const chart = chartRef.current;
        const candleSeries = candleSeriesRef.current;
        if (!chart || !candleSeries) return;
        if (!data || !data.ohlc || data.ohlc.length === 0) return;

        const ohlc = normalizeOhlc(data.ohlc);
        cachedOhlcRef.current = ohlc;

        candleSeries.setData(ohlc);

        // Volume histogram
        if (ohlc[0] && 'volume' in data.ohlc[0]) {
            if (volumeSeriesRef.current) {
                try { chart.removeSeries(volumeSeriesRef.current); } catch (_) { }
            }
            const volSeries = chart.addHistogramSeries({
                color: '#26a69a',
                priceFormat: { type: 'volume' },
                priceScaleId: '',
                scaleMargins: { top: 0.8, bottom: 0 },
            });
            volumeSeriesRef.current = volSeries;
            volSeries.setData(ohlc.map((d, i) => ({
                time: d.time,
                value: data.ohlc[i].volume,
                color: d.close >= d.open ? 'rgba(38,166,154,0.3)' : 'rgba(239,83,80,0.3)',
            })));
        }

        // Draw Fibo overlays
        if (showFibo && data) {
            drawFiboOverlays(chart, candleSeries, { ...data, ohlc }, overlayLinesRef);
        } else {
            // Instant removal when toggled OFF
            overlayLinesRef.current.forEach(s => {
                try { chart.removeSeries(s); } catch (_) { }
            });
            overlayLinesRef.current = [];
        }

        // Draw indicators with current selection
        drawIndicators(chart, ohlc, activeIndicators, indicatorSeriesRef);

        chart.timeScale().fitContent();
        requestAnimationFrame(() => {
            chartRef.current?.timeScale().scrollToRealTime();
        });
    }, [data, showFibo]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Redraw indicators when activeIndicators changes (without touching candles) ──
    useEffect(() => {
        const chart = chartRef.current;
        if (!chart || cachedOhlcRef.current.length === 0) return;
        drawIndicators(chart, cachedOhlcRef.current, activeIndicators, indicatorSeriesRef);
    }, [activeIndicators]);

    return (
        <div style={{ position: 'relative', height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* ── Chart Header Bar ── */}
            <div style={{
                padding: '6px 15px',
                background: '#1e222d',
                borderBottom: '1px solid #2B3139',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                flexWrap: 'wrap',
            }}>
                {/* Symbol + interval */}
                <span style={{ color: '#fff', fontSize: '18px', fontWeight: 'bold' }}>{toDisplay(ticker)}</span>
                <span style={{ color: '#8b929e', fontSize: '14px' }}>{interval.toUpperCase()}</span>

                {/* Divider */}
                <span style={{ width: '1px', height: '20px', background: '#2B3139' }} />

                {/* Quick-add indicator pills */}
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {QUICK_INDICATORS.map(qi => {
                        const isActive = activeIndicators.some(a => a.label === qi.label);
                        return (
                            <button
                                key={qi.label}
                                onClick={() => isActive ? removeIndicator(qi.label) : addIndicator(qi)}
                                style={{
                                    padding: '2px 8px',
                                    fontSize: '11px',
                                    fontFamily: 'monospace',
                                    borderRadius: '4px',
                                    border: `1px solid ${isActive ? '#2196F3' : '#3a3f4b'}`,
                                    background: isActive ? 'rgba(33,150,243,0.15)' : 'transparent',
                                    color: isActive ? '#2196F3' : '#8b929e',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s',
                                }}
                            >
                                {qi.label}
                            </button>
                        );
                    })}
                </div>

                {/* Fibonacci Toggle */}
                <button
                    onClick={() => setShowFibo(!showFibo)}
                    style={{
                        padding: '3px 10px',
                        fontSize: '11px',
                        fontWeight: 'bold',
                        borderRadius: '4px',
                        border: 'none',
                        background: showFibo ? '#2563eb' : '#3a3f4b',
                        color: showFibo ? '#fff' : '#8b929e',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        marginLeft: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                    }}
                >
                    <span style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: showFibo ? '#10b981' : '#6b7280'
                    }} />
                    FIBO
                </button>

                {/* Custom indicator input */}
                <form onSubmit={handleIndicatorSubmit} style={{ display: 'flex', gap: '4px' }}>
                    <input
                        type="text"
                        value={indicatorInput}
                        onChange={e => setIndicatorInput(e.target.value)}
                        placeholder="SMA 100, EMA 200…"
                        style={{
                            width: '120px',
                            padding: '3px 8px',
                            fontSize: '11px',
                            fontFamily: 'monospace',
                            background: '#131722',
                            border: '1px solid #3a3f4b',
                            borderRadius: '4px',
                            color: '#B2B5BE',
                            outline: 'none',
                        }}
                    />
                    <button
                        type="submit"
                        style={{
                            padding: '3px 8px',
                            fontSize: '11px',
                            background: '#2196F3',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                        }}
                    >+</button>
                </form>

                {/* Active indicator tags (removable) */}
                {activeIndicators.filter(a => !QUICK_INDICATORS.some(q => q.label === a.label)).map((ind, idx) => (
                    <span
                        key={ind.label}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 8px',
                            fontSize: '11px',
                            fontFamily: 'monospace',
                            borderRadius: '4px',
                            background: 'rgba(33,150,243,0.12)',
                            color: INDICATOR_COLORS[(QUICK_INDICATORS.length + idx) % INDICATOR_COLORS.length],
                            border: `1px solid ${INDICATOR_COLORS[(QUICK_INDICATORS.length + idx) % INDICATOR_COLORS.length]}44`,
                        }}
                    >
                        {ind.label}
                        <span
                            onClick={() => removeIndicator(ind.label)}
                            style={{ cursor: 'pointer', color: '#ef5350', fontWeight: 'bold', marginLeft: '2px' }}
                        >×</span>
                    </span>
                ))}
            </div>

            {/* ── Chart Canvas ── */}
            <div ref={chartContainerRef} style={{ flex: 1, width: '100%' }} />
        </div>
    );
};

export default memo(ProChart);
