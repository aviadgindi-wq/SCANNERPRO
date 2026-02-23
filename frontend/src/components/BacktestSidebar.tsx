import React, { useState, useMemo } from 'react';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { TradeResult } from '@/lib/fiboEngine';
import { cn } from '@/lib/utils';

// Inline date range type to avoid react-day-picker import conflicts
interface LocalDateRange {
  from: Date | undefined;
  to?: Date | undefined;
}

interface BacktestSidebarProps {
  completedTrades: TradeResult[];
  symbol: string;
  onJumpToTrade: (trade: TradeResult) => void;
  collapsed: boolean;
  onToggle: () => void;
}

export function BacktestSidebar({
  completedTrades,
  symbol,
  onJumpToTrade,
  collapsed,
  onToggle,
}: BacktestSidebarProps) {
  const [dateRange, setDateRange] = useState<LocalDateRange | undefined>(undefined);
  const [selectedTradeIdx, setSelectedTradeIdx] = useState<number | null>(null);

  const filteredTrades = useMemo(() => {
    if (!dateRange?.from) {
      const cutoff = subDays(new Date(), 7).getTime() / 1000;
      return completedTrades.filter(t => t.entryTime >= cutoff);
    }
    const from = startOfDay(dateRange.from).getTime() / 1000;
    const to = endOfDay(dateRange.to ?? dateRange.from).getTime() / 1000;
    return completedTrades.filter(t => t.entryTime >= from && t.entryTime <= to);
  }, [completedTrades, dateRange]);

  const stats = useMemo(() => {
    const wins = filteredTrades.filter(t => t.isWin).length;
    const losses = filteredTrades.filter(t => !t.isWin).length;
    const totalPnl = filteredTrades.reduce((acc, t) => acc + t.pnlTicks, 0);
    const winRate = filteredTrades.length > 0 ? (wins / filteredTrades.length) * 100 : 0;
    return { total: filteredTrades.length, wins, losses, winRate, totalPnl };
  }, [filteredTrades]);

  const handleTradeClick = (trade: TradeResult, idx: number) => {
    setSelectedTradeIdx(idx);
    onJumpToTrade(trade);
  };

  if (collapsed) {
    return (
      <div
        className="flex flex-col items-center py-3 gap-3 border-l shrink-0"
        style={{ width: '40px', backgroundColor: '#0d1017', borderColor: '#1e2a38' }}
      >
        <button
          onClick={onToggle}
          className="p-1 rounded transition-colors"
          style={{ color: '#556677' }}
          title="Open Backtest Panel"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span
          className="text-xs"
          style={{
            color: '#556677',
            writingMode: 'vertical-rl',
            fontFamily: 'JetBrains Mono, monospace',
            letterSpacing: '0.1em',
          }}
        >
          BACKTEST
        </span>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col border-l shrink-0"
      style={{
        width: '280px',
        backgroundColor: '#0d1017',
        borderColor: '#1e2a38',
        fontFamily: 'JetBrains Mono, monospace',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b shrink-0"
        style={{ borderColor: '#1e2a38' }}
      >
        <span className="text-xs font-semibold tracking-widest" style={{ color: '#8899aa' }}>
          BACKTEST
        </span>
        <button
          onClick={onToggle}
          className="p-1 rounded transition-colors"
          style={{ color: '#556677' }}
          title="Collapse"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Date Range Picker */}
      <div className="px-3 py-2 border-b shrink-0" style={{ borderColor: '#1e2a38' }}>
        <div className="text-xs mb-1.5 tracking-wider" style={{ color: '#556677' }}>DATE RANGE</div>
        <div className="flex items-center gap-1.5">
          <Popover>
            <PopoverTrigger asChild>
              <button
                className="flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded text-xs text-left transition-colors"
                style={{
                  backgroundColor: '#131820',
                  border: '1px solid #1e2a38',
                  color: dateRange?.from ? '#b0b8c8' : '#556677',
                }}
              >
                <CalendarIcon className="w-3 h-3 shrink-0" />
                <span className="truncate">
                  {dateRange?.from
                    ? dateRange.to
                      ? `${format(dateRange.from, 'MMM d')} – ${format(dateRange.to, 'MMM d')}`
                      : format(dateRange.from, 'MMM d, yyyy')
                    : 'Last 7 days'}
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent
              className="w-auto p-0"
              align="end"
              style={{ backgroundColor: '#0d1017', border: '1px solid #1e2a38', zIndex: 50 }}
            >
              <Calendar
                mode="range"
                selected={dateRange as any}
                onSelect={(val: any) => setDateRange(val)}
                initialFocus
                className="pointer-events-auto"
                disabled={{ after: new Date() }}
              />
            </PopoverContent>
          </Popover>
          {dateRange && (
            <button
              onClick={() => setDateRange(undefined)}
              className="p-1 rounded transition-colors shrink-0"
              style={{ color: '#556677' }}
              title="Clear range"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="px-3 py-2 border-b shrink-0" style={{ borderColor: '#1e2a38' }}>
        <div className="text-xs mb-2 tracking-wider" style={{ color: '#556677' }}>
          {dateRange?.from ? 'PERIOD STATS' : 'LAST 7 DAYS'}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <StatCell label="TOTAL" value={String(stats.total)} />
          <StatCell
            label="WIN RATE"
            value={`${stats.winRate.toFixed(0)}%`}
            color={stats.winRate >= 50 ? '#00ff88' : '#e03030'}
          />
          <StatCell label="WINS" value={String(stats.wins)} color="#00ff88" />
          <StatCell label="LOSSES" value={String(stats.losses)} color="#e03030" />
          <div className="col-span-2">
            <StatCell
              label="TOTAL P&L"
              value={`${stats.totalPnl >= 0 ? '+' : ''}${stats.totalPnl}T`}
              color={stats.totalPnl >= 0 ? '#00ff88' : '#e03030'}
            />
          </div>
        </div>
      </div>

      {/* Trade List */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div
          className="px-3 py-1.5 text-xs tracking-wider sticky top-0"
          style={{ color: '#556677', backgroundColor: '#0d1017', borderBottom: '1px solid #1e2a38' }}
        >
          TRADES ({filteredTrades.length})
        </div>

        {filteredTrades.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs" style={{ color: '#556677' }}>
            No trades in this period
          </div>
        ) : (
          <div>
            {filteredTrades.map((trade, idx) => {
              const isSelected = selectedTradeIdx === idx;
              const sign = trade.pnlTicks >= 0 ? '+' : '';
              const entryDate = new Date(trade.entryTime * 1000);

              return (
                <button
                  key={`${trade.entryTime}-${idx}`}
                  onClick={() => handleTradeClick(trade, idx)}
                  className="w-full text-left px-3 py-2.5 transition-colors"
                  style={{
                    backgroundColor: isSelected ? 'rgba(0,255,136,0.06)' : 'transparent',
                    borderLeft: isSelected ? '2px solid #00ff88' : '2px solid transparent',
                    borderBottom: '1px solid #1e2a38',
                  }}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs" style={{ color: '#8899aa' }}>
                      {format(entryDate, 'MMM d, HH:mm')}
                    </span>
                    <span
                      className="text-xs font-semibold"
                      style={{ color: trade.isWin ? '#00ff88' : '#e03030' }}
                    >
                      {sign}{trade.pnlTicks}T
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: '#334455' }}>
                      {trade.exitReason.replace(/_/g, ' ')}
                    </span>
                    <span
                      className="text-xs px-1 rounded"
                      style={{
                        color: trade.isWin ? '#00ff88' : '#e03030',
                        backgroundColor: trade.isWin ? 'rgba(0,255,136,0.1)' : 'rgba(224,48,48,0.1)',
                      }}
                    >
                      {trade.isWin ? 'WIN' : 'LOSS'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div
      className="rounded px-2 py-1.5"
      style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid #1e2a38' }}
    >
      <div className="text-xs mb-0.5" style={{ color: '#556677' }}>{label}</div>
      <div className="text-sm font-semibold tabular-nums" style={{ color: color ?? '#b0b8c8' }}>
        {value}
      </div>
    </div>
  );
}
