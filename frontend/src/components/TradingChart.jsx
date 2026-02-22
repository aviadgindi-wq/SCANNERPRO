import React, { useEffect, useRef } from 'react';
import { createChart, CrosshairMode } from 'lightweight-charts';

const TradingChart = ({ data, chartType = 'candlestick', showMAs = false }) => {
    const chartContainerRef = useRef(null);
    const chartRef = useRef(null);

    useEffect(() => {
        if (!chartContainerRef.current || !data || !data.ohlc || data.ohlc.length === 0) return;

        // ── Create Chart ─────────────────────────────────────────────
        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: 'solid', color: '#0d1117' },
                textColor: '#c9d1d9',
            },
            grid: {
                vertLines: { color: '#21262d' },
                horzLines: { color: '#21262d' },
            },
            crosshair: { mode: CrosshairMode.Normal },
            rightPriceScale: { borderColor: '#30363d' },
            timeScale: { borderColor: '#30363d', timeVisible: true },
        });
        chartRef.current = chart;

        const formattedOhlc = data.ohlc.map(item => ({
            time: item.time,
            open: item.open,
            high: item.high,
            low: item.low,
            close: item.close,
        }));

        const lineData = data.ohlc.map(item => ({
            time: item.time,
            value: item.close,
        }));

        // ── Main Series (based on chartType) ─────────────────────────
        let mainSeries;

        if (chartType === 'candlestick') {
            mainSeries = chart.addCandlestickSeries({
                upColor: '#26a69a', downColor: '#ef5350',
                borderVisible: false,
                wickUpColor: '#26a69a', wickDownColor: '#ef5350',
            });
            mainSeries.setData(formattedOhlc);
        } else if (chartType === 'bar') {
            mainSeries = chart.addBarSeries({
                upColor: '#26a69a', downColor: '#ef5350',
            });
            mainSeries.setData(formattedOhlc);
        } else if (chartType === 'line') {
            mainSeries = chart.addLineSeries({
                color: '#2962FF', lineWidth: 2,
            });
            mainSeries.setData(lineData);
        } else if (chartType === 'area') {
            mainSeries = chart.addAreaSeries({
                topColor: 'rgba(41, 98, 255, 0.5)',
                bottomColor: 'rgba(41, 98, 255, 0.04)',
                lineColor: '#2962FF', lineWidth: 2,
            });
            mainSeries.setData(lineData);
        } else if (chartType === 'baseline') {
            const avgClose = lineData.reduce((s, d) => s + d.value, 0) / lineData.length;
            mainSeries = chart.addBaselineSeries({
                baseValue: { type: 'price', price: avgClose },
                topLineColor: '#26a69a', topFillColor1: 'rgba(38,166,154,0.28)',
                topFillColor2: 'rgba(38,166,154,0.05)',
                bottomLineColor: '#ef5350', bottomFillColor1: 'rgba(239,83,80,0.05)',
                bottomFillColor2: 'rgba(239,83,80,0.28)',
            });
            mainSeries.setData(lineData);
        }

        // ── Volume Histogram ─────────────────────────────────────────
        const volumeSeries = chart.addHistogramSeries({
            priceFormat: { type: 'volume' },
            priceScaleId: 'volume',
        });
        chart.priceScale('volume').applyOptions({
            scaleMargins: { top: 0.8, bottom: 0 },
        });
        const volumeData = data.ohlc.map(item => ({
            time: item.time,
            value: item.volume,
            color: item.close >= item.open ? 'rgba(38,166,154,0.3)' : 'rgba(239,83,80,0.3)',
        }));
        volumeSeries.setData(volumeData);

        // ── Moving Averages ──────────────────────────────────────────
        if (showMAs && data.overlays?.moving_averages) {
            const maColors = { ema10: '#2196F3', ema20: '#FF9800', ema50: '#9E9E9E' };
            const maWidths = { ema10: 1, ema20: 1, ema50: 1.5 };
            const maDash = { ema10: false, ema20: false, ema50: true };

            for (const [key, seriesData] of Object.entries(data.overlays.moving_averages)) {
                if (seriesData && seriesData.length > 0) {
                    const maSeries = chart.addLineSeries({
                        color: maColors[key] || '#888',
                        lineWidth: maWidths[key] || 1,
                        lineStyle: maDash[key] ? 1 : 0,
                        crosshairMarkerVisible: false,
                        lastValueVisible: false,
                        priceLineVisible: false,
                    });
                    maSeries.setData(seriesData);
                }
            }
        }

        // ── Helper: create price line on main series ─────────────────
        const addPriceLine = (price, title, color, dashed = true) => {
            if (mainSeries && price != null) {
                mainSeries.createPriceLine({
                    price, color,
                    lineWidth: 1,
                    lineStyle: dashed ? 1 : 0,
                    axisLabelVisible: true,
                    title,
                });
            }
        };

        // ── Helper: get valid time for overlays ───────────────────────
        const getValidTime = (dateStr) => {
            const found = data.ohlc.find(c => c.time === dateStr);
            if (found) return found.time;
            const targetDate = new Date(dateStr);
            let closest = data.ohlc[0].time;
            let minDiff = Infinity;
            for (let item of data.ohlc) {
                const t = typeof item.time === 'number' ? new Date(item.time * 1000) : new Date(item.time);
                const diff = Math.abs(t - targetDate);
                if (diff < minDiff) { minDiff = diff; closest = item.time; }
            }
            return closest;
        };

        // ── Support / Resistance ─────────────────────────────────────
        if (data.overlays?.support) {
            addPriceLine(data.overlays.support, 'Support', '#4CAF50', true);
        }
        if (data.overlays?.resistance) {
            addPriceLine(data.overlays.resistance, 'Resistance', '#F44336', true);
        }

        // ── Fibonacci Strategy ───────────────────────────────────────
        if (data.overlays?.fibo) {
            const { levels, legs } = data.overlays.fibo;

            // Zig-Zag line
            if (legs) {
                const zigzagSeries = chart.addLineSeries({
                    color: '#ff00ff', lineWidth: 3,
                    crosshairMarkerVisible: false,
                    lastValueVisible: false,
                    priceLineVisible: false,
                });
                const zigzagData = [
                    { time: getValidTime(legs.leg1_start.date), value: legs.leg1_start.price },
                    { time: getValidTime(legs.leg1_end.date), value: legs.leg1_end.price },
                    { time: getValidTime(legs.leg2_end.date), value: legs.leg2_end.price },
                ].sort((a, b) => {
                    const ta = typeof a.time === 'number' ? a.time : new Date(a.time).getTime();
                    const tb = typeof b.time === 'number' ? b.time : new Date(b.time).getTime();
                    return ta - tb;
                });
                const unique = [];
                const seen = new Set();
                for (const p of zigzagData) {
                    const k = String(p.time);
                    if (!seen.has(k)) { seen.add(k); unique.push(p); }
                }
                if (unique.length > 1) zigzagSeries.setData(unique);
            }

            // Fibo levels
            if (levels) {
                addPriceLine(levels['0'], '0.0', 'rgba(255,255,255,0.4)');
                addPriceLine(levels['0.382'], '0.382', 'rgba(255,255,255,0.4)');
                addPriceLine(levels['0.5'], '0.5', 'rgba(255,255,255,0.4)');
                addPriceLine(levels['0.618'], '0.618', '#00ffff');
                addPriceLine(levels['1'], '1.0', 'rgba(255,255,255,0.4)');
            }
        }

        // ── Nick Shawn Strategy ──────────────────────────────────────
        if (data.overlays?.nick_shawn) {
            const ns = data.overlays.nick_shawn;
            // Support zone band
            if (ns.support_zone) {
                addPriceLine(ns.support_zone.low, 'S-Zone Low', 'rgba(76,175,80,0.6)');
                addPriceLine(ns.support_zone.high, 'S-Zone High', 'rgba(76,175,80,0.6)');
            }
            // Resistance zone band
            if (ns.resistance_zone) {
                addPriceLine(ns.resistance_zone.low, 'R-Zone Low', 'rgba(244,67,54,0.6)');
                addPriceLine(ns.resistance_zone.high, 'R-Zone High', 'rgba(244,67,54,0.6)');
            }
        }

        // ── Qullamaggie Strategy ─────────────────────────────────────
        if (data.overlays?.qullamaggie) {
            const q = data.overlays.qullamaggie;
            if (q.breakout_level) {
                addPriceLine(q.breakout_level, 'Breakout', '#FFD700', false);
            }
        }

        // ── Predictions (Entry / Stop / Target) ──────────────────────
        if (data.overlays?.predictions) {
            const p = data.overlays.predictions;
            addPriceLine(p.entry, 'Entry', '#00ffff', false);
            addPriceLine(p.stop_loss, 'Stop Loss', '#ff4444', false);
            addPriceLine(p.target, 'Target', '#00C851', false);

            // Markers
            if (mainSeries && data.ohlc.length > 0) {
                const lastTime = data.ohlc[data.ohlc.length - 1].time;
                mainSeries.setMarkers([
                    {
                        time: lastTime,
                        position: 'aboveBar',
                        color: '#00ffff',
                        shape: 'arrowDown',
                        text: `Entry: ${p.entry}`,
                    },
                ]);
            }
        }

        // ── Resize + Fit ─────────────────────────────────────────────
        const handleResize = () => {
            if (chartContainerRef.current) {
                chart.applyOptions({
                    width: chartContainerRef.current.clientWidth,
                    height: chartContainerRef.current.clientHeight,
                });
            }
        };
        window.addEventListener('resize', handleResize);
        handleResize();

        if (data.ohlc.length > 80) {
            chart.timeScale().setVisibleLogicalRange({
                from: data.ohlc.length - 80,
                to: data.ohlc.length - 1,
            });
        } else {
            chart.timeScale().fitContent();
        }

        return () => {
            window.removeEventListener('resize', handleResize);
            chart.remove();
        };
    }, [data, chartType, showMAs]);

    return (
        <div
            ref={chartContainerRef}
            style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}
        />
    );
};

export default TradingChart;
