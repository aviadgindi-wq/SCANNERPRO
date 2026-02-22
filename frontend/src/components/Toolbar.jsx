import React from 'react';
import {
    BarChart3,
    CandlestickChart,
    LineChart,
    AreaChart,
    ActivitySquare,
    TrendingUp
} from 'lucide-react';

const TIMEFRAMES = [
    { label: '1m', value: '1m' },
    { label: '5m', value: '5m' },
    { label: '15m', value: '15m' },
    { label: '1H', value: '1h' },
    { label: '4H', value: '4h' },
    { label: 'D', value: '1d' },
    { label: 'W', value: '1wk' },
    { label: 'M', value: '1mo' },
];

const CHART_TYPES = [
    { label: 'Candles', value: 'candlestick', icon: CandlestickChart },
    { label: 'Bars', value: 'bar', icon: BarChart3 },
    { label: 'Line', value: 'line', icon: LineChart },
    { label: 'Area', value: 'area', icon: AreaChart },
    { label: 'Baseline', value: 'baseline', icon: ActivitySquare },
];

const STRATEGIES = [
    { label: 'No Overlay', value: 'none' },
    { label: '🔮 Fibonacci', value: 'fibo' },
    { label: '🎯 Nick Shawn', value: 'nick_shawn' },
    { label: '🚀 Qullamaggie', value: 'qullamaggie' },
];

const Toolbar = ({
    interval, setInterval,
    chartType, setChartType,
    strategy, setStrategy,
    showMAs, setShowMAs
}) => {
    return (
        <div className="toolbar">
            {/* Timeframe Group */}
            <div className="toolbar-group">
                <span className="toolbar-label">Timeframe</span>
                <div className="btn-group">
                    {TIMEFRAMES.map(tf => (
                        <button
                            key={tf.value}
                            className={`toolbar-btn ${interval === tf.value ? 'active' : ''}`}
                            onClick={() => setInterval(tf.value)}
                        >
                            {tf.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Separator */}
            <div className="toolbar-separator" />

            {/* Chart Type Group */}
            <div className="toolbar-group">
                <span className="toolbar-label">Chart</span>
                <div className="btn-group">
                    {CHART_TYPES.map(ct => {
                        const Icon = ct.icon;
                        return (
                            <button
                                key={ct.value}
                                className={`toolbar-btn icon-btn ${chartType === ct.value ? 'active' : ''}`}
                                onClick={() => setChartType(ct.value)}
                                title={ct.label}
                            >
                                <Icon size={16} />
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Separator */}
            <div className="toolbar-separator" />

            {/* Strategy Selector */}
            <div className="toolbar-group">
                <span className="toolbar-label">Strategy</span>
                <select
                    className="toolbar-select"
                    value={strategy}
                    onChange={(e) => setStrategy(e.target.value)}
                >
                    {STRATEGIES.map(s => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                </select>
            </div>

            {/* Separator */}
            <div className="toolbar-separator" />

            {/* MA Toggle */}
            <div className="toolbar-group">
                <button
                    className={`toolbar-btn ma-btn ${showMAs ? 'active' : ''}`}
                    onClick={() => setShowMAs(!showMAs)}
                >
                    <TrendingUp size={14} />
                    <span>MA</span>
                </button>
            </div>
        </div>
    );
};

export default Toolbar;
