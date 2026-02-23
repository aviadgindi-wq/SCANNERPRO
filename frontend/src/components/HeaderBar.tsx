import React from 'react';
import { RefreshCw, Wifi, WifiOff, Loader2 } from 'lucide-react';
import { ConnectionStatus } from '@/hooks/useYahooFinance';
import { cn } from '@/lib/utils';

export const SYMBOLS = [
  { value: 'MES=F', label: 'MES', name: 'Micro S&P 500' },
  { value: 'MNQ=F', label: 'MNQ', name: 'Micro Nasdaq 100' },
  { value: 'M2K=F', label: 'M2K', name: 'Micro Russell 2000' },
  { value: 'MYM=F', label: 'MYM', name: 'Micro Dow' },
  { value: 'MGC=F', label: 'MGC', name: 'Micro Gold' },
  { value: 'MCL=F', label: 'MCL', name: 'Micro Crude Oil' },
];

interface HeaderBarProps {
  symbol: string;
  onSymbolChange: (symbol: string) => void;
  pivotLookback: number;
  onPivotLookbackChange: (value: number) => void;
  hardStop: boolean;
  onHardStopChange: (value: boolean) => void;
  status: ConnectionStatus;
  currentPrice: number | null;
  lastUpdate: Date | null;
  onRefresh: () => void;
}

export function HeaderBar({
  symbol,
  onSymbolChange,
  pivotLookback,
  onPivotLookbackChange,
  hardStop,
  onHardStopChange,
  status,
  currentPrice,
  lastUpdate,
  onRefresh,
}: HeaderBarProps) {
  const symInfo = SYMBOLS.find(s => s.value === symbol);

  return (
    <header
      className="flex items-center gap-3 px-4 border-b shrink-0"
      style={{
        height: '48px',
        backgroundColor: '#0d1017',
        borderColor: 'hsl(var(--border))',
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 mr-2">
        <span
          className="text-sm font-bold tracking-widest"
          style={{ color: 'hsl(var(--fibo-leg-color))', fontFamily: 'JetBrains Mono, monospace' }}
        >
          FIBО
        </span>
        <span className="text-xs text-muted-foreground tracking-wider">EDGE</span>
      </div>

      <div className="w-px h-5 bg-border" />

      {/* Symbol Switcher */}
      <div className="flex items-center gap-1">
        {SYMBOLS.map(s => (
          <button
            key={s.value}
            onClick={() => onSymbolChange(s.value)}
            title={s.name}
            className={cn(
              'px-2 py-1 rounded text-xs font-medium transition-all duration-100',
              'font-mono tracking-wider',
              symbol === s.value
                ? 'text-black'
                : 'text-muted-foreground hover:text-foreground'
            )}
            style={{
              backgroundColor: symbol === s.value ? 'hsl(var(--fibo-leg-color))' : 'transparent',
              fontFamily: 'JetBrains Mono, monospace',
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="w-px h-5 bg-border" />

      {/* Pivot Lookback */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Pivot</span>
        <input
          type="number"
          min={5}
          max={100}
          value={pivotLookback}
          onChange={e => onPivotLookbackChange(Math.max(5, Math.min(100, parseInt(e.target.value) || 20)))}
          className="w-14 text-center text-xs rounded px-2 py-1 outline-none focus:ring-1 focus:ring-primary"
          style={{
            backgroundColor: 'hsl(var(--input))',
            color: 'hsl(var(--foreground))',
            border: '1px solid hsl(var(--border))',
            fontFamily: 'JetBrains Mono, monospace',
          }}
        />
        <span className="text-xs text-muted-foreground">bars</span>
      </div>

      <div className="w-px h-5 bg-border" />

      {/* Hard Stop / Soft Stop Toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onHardStopChange(!hardStop)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-all duration-150',
            hardStop
              ? 'text-red-300'
              : 'text-muted-foreground hover:text-foreground'
          )}
          style={{
            backgroundColor: hardStop ? 'rgba(180,30,30,0.25)' : 'hsl(var(--muted))',
            border: hardStop ? '1px solid rgba(220,50,50,0.4)' : '1px solid hsl(var(--border))',
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: hardStop ? '#ef4444' : '#6b7280' }}
          />
          {hardStop ? 'HARD STOP' : 'SOFT STOP'}
        </button>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Current Price */}
      {currentPrice != null && (
        <div
          className="text-sm tabular-nums"
          style={{
            color: 'hsl(var(--fibo-leg-color))',
            fontFamily: 'JetBrains Mono, monospace',
          }}
        >
          {currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
        </div>
      )}

      <div className="w-px h-5 bg-border" />

      {/* Refresh */}
      <button
        onClick={onRefresh}
        className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
        title="Refresh data"
      >
        <RefreshCw className="w-3.5 h-3.5" />
      </button>

      {/* Connection Status */}
      <div className="flex items-center gap-1.5">
        {status === 'live' && (
          <>
            <Wifi className="w-3.5 h-3.5" style={{ color: 'hsl(var(--status-live))' }} />
            <span className="text-xs" style={{ color: 'hsl(var(--status-live))' }}>LIVE</span>
          </>
        )}
        {status === 'connecting' && (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: 'hsl(var(--status-connecting))' }} />
            <span className="text-xs" style={{ color: 'hsl(var(--status-connecting))' }}>CONNECTING</span>
          </>
        )}
        {status === 'error' && (
          <>
            <WifiOff className="w-3.5 h-3.5" style={{ color: 'hsl(var(--status-error))' }} />
            <span className="text-xs" style={{ color: 'hsl(var(--status-error))' }}>ERROR</span>
          </>
        )}
      </div>

      {/* Last update */}
      {lastUpdate && (
        <span
          className="text-xs text-muted-foreground tabular-nums hidden xl:block"
          style={{ fontFamily: 'JetBrains Mono, monospace' }}
        >
          {lastUpdate.toLocaleTimeString()}
        </span>
      )}
    </header>
  );
}
