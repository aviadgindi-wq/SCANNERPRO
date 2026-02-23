import React, { useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import {
  createChart,
  IChartApi,
  Time,
  LineStyle,
  ColorType,
  CandlestickData,
  LineData,
  SeriesMarker,
} from 'lightweight-charts';
import { Candle, FiboSetup, FiboLevels, TradeResult, SetupDirection } from '@/lib/fiboEngine';
import { toast } from '@/hooks/use-toast';

interface TradingChartProps {
  candles: Candle[];
  setup: FiboSetup;
  symbol: string;
  currentPrice: number | null;
  hardStop: boolean;
}

export interface TradingChartHandle {
  jumpToTime: (time: number) => void;
}

// Fibo level color map (for current/active setup)
const LEVEL_COLORS: Record<string, string> = {
  level_1_0: '#b0b8c8',
  level_0382: '#e8a020',
  level_0_0: '#b0b8c8',
  level_075: '#20c8c8',
  level_neg0618: '#20c8c8',
  level_neg1_0: '#e03030',
};

const LEVEL_LABELS: Record<string, string> = {
  level_1_0: '1.0',
  level_0382: '0.382',
  level_0_0: '0.0',
  level_075: '0.75',
  level_neg0618: '-0.618',
  level_neg1_0: '-1.0',
};

export const TradingChart = forwardRef<TradingChartHandle, TradingChartProps>(
  function TradingChart({ candles, setup, symbol, currentPrice, hardStop }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const candleSeriesRef = useRef<ReturnType<IChartApi['addCandlestickSeries']> | null>(null);
    const fiboLinesRef = useRef<ReturnType<IChartApi['addLineSeries']>[]>([]);
    const legLinesRef = useRef<ReturnType<IChartApi['addLineSeries']>[]>([]);
    const notifiedTradesRef = useRef<Set<string>>(new Set());

    // Expose jump method
    useImperativeHandle(ref, () => ({
      jumpToTime: (time: number) => {
        if (!chartRef.current || candles.length === 0) return;
        const windowHalf = 25 * 15 * 60; // 25 bars of 15min
        const from = Math.max(candles[0].time, time - windowHalf) as Time;
        const to = Math.min(candles[candles.length - 1].time, time + windowHalf) as Time;
        chartRef.current.timeScale().setVisibleRange({ from, to });
      },
    }));

    // Initialize chart once
    useEffect(() => {
      if (!containerRef.current) return;

      const chart = createChart(containerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: '#0f1115' },
          textColor: '#8899aa',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
        },
        grid: {
          vertLines: { color: '#1a2030', style: LineStyle.Solid },
          horzLines: { color: '#1a2030', style: LineStyle.Solid },
        },
        crosshair: {
          vertLine: { color: '#334455', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#1a2535' },
          horzLine: { color: '#334455', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#1a2535' },
        },
        rightPriceScale: {
          borderColor: '#1e2a38',
          scaleMargins: { top: 0.08, bottom: 0.08 },
          autoScale: true,
        },
        timeScale: {
          borderColor: '#1e2a38',
          timeVisible: true,
          secondsVisible: false,
        },
        handleScroll: true,
        handleScale: true,
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
      });

      const candleSeries = chart.addCandlestickSeries({
        upColor: '#26a69a',
        downColor: '#ef5350',
        borderUpColor: '#26a69a',
        borderDownColor: '#ef5350',
        wickUpColor: '#26a69a',
        wickDownColor: '#ef5350',
      });

      chartRef.current = chart;
      candleSeriesRef.current = candleSeries;

      const ro = new ResizeObserver(() => {
        if (containerRef.current && chartRef.current) {
          chartRef.current.resize(
            containerRef.current.clientWidth,
            containerRef.current.clientHeight
          );
        }
      });
      ro.observe(containerRef.current);

      return () => {
        ro.disconnect();
        chart.remove();
        chartRef.current = null;
        candleSeriesRef.current = null;
        fiboLinesRef.current = [];
        legLinesRef.current = [];
      };
    }, []);

    // Update candle data + fit content on symbol change
    useEffect(() => {
      if (!candleSeriesRef.current || candles.length === 0) return;

      const data: CandlestickData[] = candles.map(c => ({
        time: c.time as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));

      candleSeriesRef.current.setData(data);

      // Reset price scale and scroll to latest bar
      if (chartRef.current) {
        chartRef.current.timeScale().fitContent();
        // Use rAF so fitContent() resets the price scale first,
        // then scrollToRealTime() snaps to the right edge
        requestAnimationFrame(() => {
          chartRef.current?.timeScale().scrollToRealTime();
        });
      }
    }, [candles]);

    // Draw overlays: current setup + historical trades
    const drawFiboOverlays = useCallback(() => {
      if (!chartRef.current) return;

      // Remove old lines
      fiboLinesRef.current.forEach(s => { try { chartRef.current?.removeSeries(s); } catch {} });
      fiboLinesRef.current = [];
      legLinesRef.current.forEach(s => { try { chartRef.current?.removeSeries(s); } catch {} });
      legLinesRef.current = [];

      if (candles.length < 2) return;

      const firstTime = candles[0].time as Time;
      const lastTime = candles[candles.length - 1].time as Time;

      // --- Draw HISTORICAL completed trades (clamped to their trade window) ---
      for (const trade of setup.completedTrades) {
        const tradeStart = trade.setupStartTime as Time;
        const tradeEnd = trade.setupEndTime as Time;

        const levelEntries = Object.entries(trade.levels) as [keyof FiboLevels, number][];
        for (const [key, price] of levelEntries) {
          const color = LEVEL_COLORS[key] ?? '#888';
          const label = LEVEL_LABELS[key] ?? key;
          const s = chartRef.current!.addLineSeries({
            color,
            lineWidth: 2,
            lineStyle: key === 'level_1_0' || key === 'level_0_0' ? LineStyle.Solid : LineStyle.Dashed,
            priceLineVisible: false,
            lastValueVisible: false,
            title: label,
            crosshairMarkerVisible: false,
          });
          s.setData([
            { time: tradeStart, value: price },
            { time: tradeEnd, value: price },
          ] as LineData[]);
          fiboLinesRef.current.push(s);
        }

        // Historical leg lines (dimmed)
        for (const leg of trade.legs) {
          const legLine = chartRef.current!.addLineSeries({
            color: '#00ff88',
            lineWidth: 3,
            lineStyle: LineStyle.Solid,
            priceLineVisible: false,
            lastValueVisible: false,
            title: '',
            crosshairMarkerVisible: false,
          });
          legLine.setData([
            { time: leg.startTime as Time, value: leg.startPrice },
            { time: leg.endTime as Time, value: leg.endPrice },
          ] as LineData[]);
          legLinesRef.current.push(legLine);
        }
      }

      // --- Draw ACTIVE / CURRENT setup (full opacity, projected to right edge) ---
      // Do NOT draw if invalidated — the engine will find a new pivot pair next tick
      if (setup.levels && setup.state !== 'INVALIDATED') {
        const levels = setup.levels;
        const levelEntries = Object.entries(levels) as [keyof FiboLevels, number][];
        for (const [key, price] of levelEntries) {
          const color = LEVEL_COLORS[key] ?? '#888';
          const label = LEVEL_LABELS[key] ?? key;

          const lineSeries = chartRef.current!.addLineSeries({
            color,
            lineWidth: 2,
            lineStyle: key === 'level_1_0' || key === 'level_0_0' ? LineStyle.Solid : LineStyle.Dashed,
            priceLineVisible: false,
            lastValueVisible: true,
            title: label,
            crosshairMarkerVisible: false,
          });

          lineSeries.setData([
            { time: firstTime, value: price },
            { time: lastTime, value: price },
          ] as LineData[]);
          fiboLinesRef.current.push(lineSeries);
        }

        // Active leg lines
        for (const leg of setup.legs) {
          const legLine = chartRef.current!.addLineSeries({
            color: '#00ff88',
            lineWidth: 3,
            lineStyle: LineStyle.Solid,
            priceLineVisible: false,
            lastValueVisible: false,
            title: `Leg ${leg.legNum}`,
            crosshairMarkerVisible: false,
          });
          legLine.setData([
            { time: leg.startTime as Time, value: leg.startPrice },
            { time: leg.endTime as Time, value: leg.endPrice },
          ] as LineData[]);
          legLinesRef.current.push(legLine);
        }

        // --- Projected Entry / TP / SL for forming setups (LEG2_COMPLETE or LEG3_FORMING) ---
        const isForming = setup.state === 'LEG2_COMPLETE' || setup.state === 'LEG3_FORMING';
        if (isForming) {
          const entryPrice = levels.level_neg0618;
          const slPrice = levels.level_neg1_0;
          const slDistance = Math.abs(entryPrice - slPrice);
          const isBearish = setup.setupDirection === 'bearish' || !setup.setupDirection;
          const tpPrice = isBearish
            ? entryPrice + slDistance / 3   // LONG: TP above
            : entryPrice - slDistance / 3;  // SHORT: TP below

          const entryLine = chartRef.current!.addLineSeries({
            color: '#20c8c8', lineWidth: 1, lineStyle: LineStyle.Dashed,
            priceLineVisible: false, lastValueVisible: true,
            title: isBearish ? 'ENTRY (LONG)' : 'ENTRY (SHORT)', crosshairMarkerVisible: false,
          });
          entryLine.setData([
            { time: firstTime, value: entryPrice },
            { time: lastTime, value: entryPrice },
          ] as LineData[]);
          fiboLinesRef.current.push(entryLine);

          const tpLine = chartRef.current!.addLineSeries({
            color: '#00ff88', lineWidth: 1, lineStyle: LineStyle.Dashed,
            priceLineVisible: false, lastValueVisible: true, title: 'TP', crosshairMarkerVisible: false,
          });
          tpLine.setData([
            { time: firstTime, value: tpPrice },
            { time: lastTime, value: tpPrice },
          ] as LineData[]);
          fiboLinesRef.current.push(tpLine);

          const slLine = chartRef.current!.addLineSeries({
            color: '#e03030', lineWidth: 1, lineStyle: LineStyle.Dashed,
            priceLineVisible: false, lastValueVisible: true, title: 'SL', crosshairMarkerVisible: false,
          });
          slLine.setData([
            { time: firstTime, value: slPrice },
            { time: lastTime, value: slPrice },
          ] as LineData[]);
          fiboLinesRef.current.push(slLine);
        }

        // Active trade SL & TP lines (when trade is live)
        if (setup.activeTrade) {
          const tradeStart = setup.activeTrade.entryTime as Time;

          const slLine = chartRef.current!.addLineSeries({
            color: setup.activeTrade.isBreakEven ? '#f59e0b' : '#e03030',
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            priceLineVisible: false,
            lastValueVisible: true,
            title: setup.activeTrade.isBreakEven ? 'BE' : 'SL',
            crosshairMarkerVisible: false,
          });
          slLine.setData([
            { time: tradeStart, value: setup.activeTrade.currentSL },
            { time: lastTime, value: setup.activeTrade.currentSL },
          ] as LineData[]);
          fiboLinesRef.current.push(slLine);

          const tpLine = chartRef.current!.addLineSeries({
            color: '#00ff88',
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            priceLineVisible: false,
            lastValueVisible: true,
            title: 'TP',
            crosshairMarkerVisible: false,
          });
          tpLine.setData([
            { time: tradeStart, value: setup.activeTrade.takeProfit },
            { time: lastTime, value: setup.activeTrade.takeProfit },
          ] as LineData[]);
          fiboLinesRef.current.push(tpLine);
        }
      }

      // --- Trade markers on candlestick series ---
      if (candleSeriesRef.current) {
        const markers: SeriesMarker<Time>[] = [];

        for (const trade of setup.completedTrades) {
          const sign = trade.pnlTicks >= 0 ? '+' : '';
          const isLong = trade.direction === 'long';
          // Entry arrow
          markers.push({
            time: trade.entryTime as Time,
            position: isLong ? 'belowBar' : 'aboveBar',
            color: '#20c8c8',
            shape: isLong ? 'arrowUp' : 'arrowDown',
            text: isLong ? `▲ LONG ${trade.entryPrice.toFixed(2)}` : `▼ SHORT ${trade.entryPrice.toFixed(2)}`,
            size: 1,
          });
          // Exit arrow
          markers.push({
            time: trade.exitTime as Time,
            position: isLong ? 'aboveBar' : 'belowBar',
            color: trade.isWin ? '#00ff88' : '#e03030',
            shape: isLong ? 'arrowDown' : 'arrowUp',
            text: `${trade.isWin ? '✓ TP' : '✗ SL'} ${sign}${trade.pnlTicks}T`,
            size: 1,
          });
        }

        markers.sort((a, b) => (a.time as number) - (b.time as number));
        candleSeriesRef.current.setMarkers(markers);
      }
    }, [candles, setup]);

    useEffect(() => {
      drawFiboOverlays();
    }, [drawFiboOverlays]);

    // Toast notifications for new events
    useEffect(() => {
      if (setup.state === 'TRADE_ACTIVE' && setup.activeTrade) {
        const key = `entry-${setup.activeTrade.entryTime}`;
        if (!notifiedTradesRef.current.has(key)) {
          notifiedTradesRef.current.add(key);
          toast({
            title: `Signal Triggered — Short @ ${setup.activeTrade.entryPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
            description: `SL: ${setup.activeTrade.stopLoss.toFixed(2)} | TP: ${setup.activeTrade.takeProfit.toFixed(2)}`,
            duration: 5000,
          });
        }
      }

      if (setup.state === 'INVALIDATED' && setup.invalidationReason) {
        const key = `invalid-${setup.invalidationReason}`;
        if (!notifiedTradesRef.current.has(key)) {
          notifiedTradesRef.current.add(key);
          toast({
            title: `Setup Invalidated: ${setup.invalidationReason}`,
            variant: 'destructive',
            duration: 5000,
          });
        }
      }

      for (const trade of setup.completedTrades) {
        const key = `trade-${trade.entryTime}-${trade.exitTime}`;
        if (!notifiedTradesRef.current.has(key)) {
          notifiedTradesRef.current.add(key);
          const sign = trade.pnlTicks >= 0 ? '+' : '';
          toast({
            title: trade.isWin
              ? `✓ Take Profit Hit — ${sign}${trade.pnlTicks} ticks`
              : `✗ Stop Loss Hit — ${sign}${trade.pnlTicks} ticks`,
            description: `Exit @ ${trade.exitPrice.toFixed(2)} | ${trade.exitReason}`,
            variant: trade.isWin ? 'default' : 'destructive',
            duration: 8000,
          });
        }
      }

      if (setup.activeTrade?.isBreakEven) {
        const key = `be-${setup.activeTrade.entryTime}`;
        if (!notifiedTradesRef.current.has(key)) {
          notifiedTradesRef.current.add(key);
          toast({
            title: 'Break-Even Activated',
            description: 'Stop Loss moved to entry price.',
            duration: 4000,
          });
        }
      }
    }, [setup]);

    const stateColor = {
      IDLE: '#556677',
      LEG1_COMPLETE: '#b0b8c8',
      LEG2_FORMING: '#e8a020',
      LEG2_COMPLETE: '#e8a020',
      LEG3_FORMING: '#20c8c8',
      TRADE_ACTIVE: '#00ff88',
      INVALIDATED: '#e03030',
    }[setup.state] ?? '#888';

    return (
      <div className="relative w-full h-full">
        <div ref={containerRef} className="w-full h-full" />

        {/* State badge */}
        <div
          className="absolute top-3 left-3 flex items-center gap-2 px-3 py-1.5 rounded"
          style={{ backgroundColor: 'rgba(15,17,21,0.85)', border: `1px solid ${stateColor}33` }}
        >
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: stateColor }} />
          <span
            className="text-xs font-medium tracking-wider"
            style={{ color: stateColor, fontFamily: 'JetBrains Mono, monospace' }}
          >
            {setup.state.replace(/_/g, ' ')}
          </span>
          {setup.invalidationReason && (
            <span className="text-xs ml-1" style={{ color: '#e03030' }}>— {setup.invalidationReason}</span>
          )}
        </div>

        {/* Active trade info panel */}
        {setup.activeTrade && (
          <div
            className="absolute top-3 right-4 flex flex-col gap-1 px-3 py-2 rounded text-xs"
            style={{
              backgroundColor: 'rgba(15,17,21,0.9)',
              border: '1px solid rgba(0,255,136,0.3)',
              fontFamily: 'JetBrains Mono, monospace',
            }}
          >
            <div className="flex justify-between gap-4">
              <span style={{ color: '#556677' }}>ENTRY</span>
              <span style={{ color: '#00ff88' }}>
                {setup.activeTrade.entryPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span style={{ color: '#556677' }}>SL</span>
              <span style={{ color: setup.activeTrade.isBreakEven ? '#f59e0b' : '#e03030' }}>
                {setup.activeTrade.currentSL.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span style={{ color: '#556677' }}>TP</span>
              <span style={{ color: '#00ff88' }}>{setup.activeTrade.takeProfit.toFixed(2)}</span>
            </div>
            {currentPrice != null && (
              <div
                className="flex justify-between gap-4 border-t mt-1 pt-1"
                style={{ borderColor: 'rgba(255,255,255,0.1)' }}
              >
                <span style={{ color: '#556677' }}>NOW</span>
                <span style={{ color: '#b0b8c8' }}>
                  {currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}
            {setup.activeTrade.isBreakEven && (
              <div className="text-center text-xs mt-1" style={{ color: '#f59e0b' }}>
                ◆ BREAK-EVEN
              </div>
            )}
          </div>
        )}

        {/* Completed trades tally */}
        {setup.completedTrades.length > 0 && (
          <div
            className="absolute bottom-6 left-3 flex flex-col gap-1 px-3 py-2 rounded text-xs"
            style={{
              backgroundColor: 'rgba(15,17,21,0.85)',
              border: '1px solid rgba(255,255,255,0.1)',
              fontFamily: 'JetBrains Mono, monospace',
              maxHeight: '160px',
              overflowY: 'auto',
            }}
          >
            <div className="mb-1 tracking-wider" style={{ color: '#556677' }}>COMPLETED TRADES</div>
            {setup.completedTrades.slice(-5).map((t, i) => {
              const sign = t.pnlTicks >= 0 ? '+' : '';
              return (
                <div key={i} className="flex items-center gap-3">
                  <span style={{ color: t.isWin ? '#00ff88' : '#e03030' }}>{t.isWin ? '▲' : '▼'}</span>
                  <span style={{ color: '#b0b8c8' }}>{t.exitPrice.toFixed(2)}</span>
                  <span style={{ color: t.isWin ? '#00ff88' : '#e03030' }}>{sign}{t.pnlTicks}T</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Loading state */}
        {candles.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              <div className="text-2xl mb-2" style={{ color: '#00ff88' }}>⬡</div>
              <div className="text-sm" style={{ color: '#556677' }}>Fetching {symbol} data…</div>
            </div>
          </div>
        )}
      </div>
    );
  }
);
