import React, { useEffect, useRef, memo } from 'react';
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
    return ts; // already seconds or a date string
}

function normalizeOhlc(ohlc) {
    return ohlc.map(d => ({
        ...d,
        time: ensureUnixSeconds(d.time),
    }));
}

// ── Fibo level colors ──
const FIBO_COLORS = {
    '0':     { color: 'rgba(176,184,200,0.5)', label: '0.0',   style: LineStyle.Dashed },
    '0.382': { color: '#e8a020',               label: '0.382', style: LineStyle.Dashed },
    '0.5':   { color: 'rgba(176,184,200,0.5)', label: '0.5',   style: LineStyle.Dashed },
    '0.618': { color: '#FFD700',               label: '0.618', style: LineStyle.Solid  },
    '1':     { color: 'rgba(176,184,200,0.5)', label: '1.0',   style: LineStyle.Dashed },
};

// ─────────────────────────────────────────────────────────────────────
//  drawFiboOverlays — uses addLineSeries so everything can be removed
// ─────────────────────────────────────────────────────────────────────
function drawFiboOverlays(chart, candleSeries, data, overlayLinesRef) {
    // 1. Remove ALL old overlay series
    overlayLinesRef.current.forEach(s => {
        try { chart.removeSeries(s); } catch (_) { /* already removed */ }
    });
    overlayLinesRef.current = [];

    if (!data || !data.ohlc || data.ohlc.length < 2) return;

    const ohlc = normalizeOhlc(data.ohlc);
    const firstTime = ohlc[0].time;
    const lastTime  = ohlc[ohlc.length - 1].time;

    const addHorizontalLine = (price, title, color, lineStyle = LineStyle.Dashed, lineWidth = 1) => {
        const s = chart.addLineSeries({
            color,
            lineWidth,
            lineStyle,
            priceLineVisible: false,
            lastValueVisible: true,
            crosshairMarkerVisible: false,
            title,
        });
        s.setData([
            { time: firstTime, value: price },
            { time: lastTime,  value: price },
        ]);
        overlayLinesRef.current.push(s);
        return s;
    };

    // 2. Draw Fibonacci levels
    if (data.overlays?.fibo?.levels) {
        const lvls = data.overlays.fibo.levels;
        for (const [key, price] of Object.entries(lvls)) {
            const cfg = FIBO_COLORS[key];
            if (cfg && price != null) {
                addHorizontalLine(
                    price,
                    cfg.label,
                    cfg.color,
                    cfg.style,
                    key === '0.618' ? 2 : 1
                );
            }
        }
    }

    // 3. Draw Zigzag legs (magenta)
    if (data.overlays?.fibo?.legs) {
        const legs = data.overlays.fibo.legs;
        const points = [
            legs.leg1_start && { time: ensureUnixSeconds(legs.leg1_start.date), value: legs.leg1_start.price },
            legs.leg1_end   && { time: ensureUnixSeconds(legs.leg1_end.date),   value: legs.leg1_end.price },
            legs.leg2_end   && { time: ensureUnixSeconds(legs.leg2_end.date),   value: legs.leg2_end.price },
        ].filter(Boolean);

        // Sort by time and deduplicate
        points.sort((a, b) => {
            const ta = typeof a.time === 'number' ? a.time : new Date(a.time).getTime();
            const tb = typeof b.time === 'number' ? b.time : new Date(b.time).getTime();
            return ta - tb;
        });
        const seen = new Set();
        const unique = points.filter(p => {
            const k = String(p.time);
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
        });

        if (unique.length > 1) {
            const zigzag = chart.addLineSeries({
                color: '#ff00ff',
                lineWidth: 3,
                lineStyle: LineStyle.Solid,
                crosshairMarkerVisible: false,
                lastValueVisible: false,
                priceLineVisible: false,
                title: '',
            });
            zigzag.setData(unique);
            overlayLinesRef.current.push(zigzag);
        }
    }

    // 4. Draw Entry (Blue), Stop (Red), Target (Green) as line series
    if (data.overlays?.predictions) {
        const p = data.overlays.predictions;
        if (p.entry != null) {
            addHorizontalLine(p.entry, 'Entry', '#0088ff', LineStyle.Solid, 2);
        }
        if (p.stop_loss != null) {
            addHorizontalLine(p.stop_loss, 'Stop', '#ef5350', LineStyle.Solid, 2);
        }
        if (p.target != null) {
            addHorizontalLine(p.target, 'Target', '#00C851', LineStyle.Solid, 2);
        }
    }

    // 5. Draw Nick Shawn S/R zones
    if (data.overlays?.nick_shawn) {
        const ns = data.overlays.nick_shawn;
        if (ns.support_zone) {
            addHorizontalLine(ns.support_zone.low,  'S-Low',  '#4CAF50', LineStyle.Dashed, 1);
            addHorizontalLine(ns.support_zone.high, 'S-High', '#4CAF50', LineStyle.Dashed, 1);
        }
        if (ns.resistance_zone) {
            addHorizontalLine(ns.resistance_zone.low,  'R-Low',  '#F44336', LineStyle.Dashed, 1);
            addHorizontalLine(ns.resistance_zone.high, 'R-High', '#F44336', LineStyle.Dashed, 1);
        }
    }

    // 6. Draw Qullamaggie breakout
    if (data.overlays?.qullamaggie?.breakout_level) {
        addHorizontalLine(data.overlays.qullamaggie.breakout_level, 'Breakout', '#FFD700', LineStyle.Solid, 2);
    }

    // 7. Support / Resistance
    if (data.overlays?.support != null) {
        addHorizontalLine(data.overlays.support, 'Support', '#4CAF50', LineStyle.Dashed, 1);
    }
    if (data.overlays?.resistance != null) {
        addHorizontalLine(data.overlays.resistance, 'Resistance', '#F44336', LineStyle.Dashed, 1);
    }

    // ── 8. Markers (Entry/Exit arrows) on the candle series ──
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
                text: isLong
                    ? `▲ LONG Entry ${p.entry.toFixed(2)}`
                    : `▼ SHORT Entry ${p.entry.toFixed(2)}`,
                size: 1,
            });
        }
        // Sort markers by time (required by lightweight-charts)
        markers.sort((a, b) => {
            const ta = typeof a.time === 'number' ? a.time : new Date(a.time).getTime();
            const tb = typeof b.time === 'number' ? b.time : new Date(b.time).getTime();
            return ta - tb;
        });
        candleSeries.setMarkers(markers);
    }
}

// ─────────────────────────────────────────────────────────────────────
//  ProChart Component
// ─────────────────────────────────────────────────────────────────────
const ProChart = ({ data, ticker, interval = '1d' }) => {
    const chartContainerRef = useRef(null);
    const chartRef = useRef(null);
    const candleSeriesRef = useRef(null);
    const volumeSeriesRef = useRef(null);
    const overlayLinesRef = useRef([]);    // ← tracks all overlay line series
    const resizeObserverRef = useRef(null);

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

        // Candlestick series
        const candleSeries = chart.addCandlestickSeries({
            upColor: '#26a69a',
            downColor: '#ef5350',
            borderVisible: false,
            wickUpColor: '#26a69a',
            wickDownColor: '#ef5350',
        });

        chartRef.current = chart;
        candleSeriesRef.current = candleSeries;

        // ── ResizeObserver: auto-resize on container changes ──
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
        };
    }, []); // mount once

    // ── Update data + redraw overlays when `data` changes ──
    useEffect(() => {
        const chart = chartRef.current;
        const candleSeries = candleSeriesRef.current;
        if (!chart || !candleSeries) return;
        if (!data || !data.ohlc || data.ohlc.length === 0) return;

        // Normalize timestamps
        const ohlc = normalizeOhlc(data.ohlc);

        // Set candle data
        candleSeries.setData(ohlc);

        // Volume histogram
        if (ohlc[0] && 'volume' in data.ohlc[0]) {
            // Remove old volume series if exists
            if (volumeSeriesRef.current) {
                try { chart.removeSeries(volumeSeriesRef.current); } catch (_) {}
            }
            const volSeries = chart.addHistogramSeries({
                color: '#26a69a',
                priceFormat: { type: 'volume' },
                priceScaleId: '',
                scaleMargins: { top: 0.8, bottom: 0 },
            });
            volumeSeriesRef.current = volSeries;
            const volData = ohlc.map((d, i) => ({
                time: d.time,
                value: data.ohlc[i].volume,
                color: d.close >= d.open ? 'rgba(38,166,154,0.3)' : 'rgba(239,83,80,0.3)',
            }));
            volSeries.setData(volData);
        }

        // ── Draw all overlays (Fibo, Entry/Stop/Target, Markers) ──
        drawFiboOverlays(chart, candleSeries, { ...data, ohlc }, overlayLinesRef);

        // Fit content and scroll to latest
        chart.timeScale().fitContent();
        requestAnimationFrame(() => {
            chartRef.current?.timeScale().scrollToRealTime();
        });

    }, [data]); // re-run whenever data/overlays change (triggered by row click or symbol change)

    return (
        <div style={{ position: 'relative', height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{
                padding: '10px 15px',
                background: '#1e222d',
                borderBottom: '1px solid #2B3139',
                display: 'flex',
                alignItems: 'center',
                gap: '15px'
            }}>
                <span style={{ color: '#fff', fontSize: '18px', fontWeight: 'bold' }}>{toDisplay(ticker)}</span>
                <span style={{ color: '#8b929e', fontSize: '14px' }}>{interval.toUpperCase()}</span>
            </div>
            <div ref={chartContainerRef} style={{ flex: 1, width: '100%' }} />
        </div>
    );
};

export default memo(ProChart);
