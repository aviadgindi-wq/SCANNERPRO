import React from 'react';

const STRATEGY_COLORS = {
    'Fibonacci': '#8b5cf6',
    'Qullamaggie': '#3fb950',
    'Nick Shawn': '#f0883e',
};

const ScannerTable = ({ results, selectedTicker, onSelectTicker }) => {
    if (!results || results.length === 0) {
        return (
            <div className="scanner-table-empty">
                <span>📊 No results — use 🔍 to analyze a ticker or 🚀 to scan the market</span>
            </div>
        );
    }

    return (
        <div className="scanner-table-wrapper">
            <div className="scanner-table-scroll">
                <table className="scanner-table">
                    <thead>
                        <tr>
                            <th>Ticker</th>
                            <th>Strategy</th>
                            <th>Signal</th>
                            <th>Setup</th>
                            <th>Entry</th>
                            <th>Stop</th>
                            <th>Target</th>
                            <th>Dist %</th>
                            <th>Win Rate</th>
                        </tr>
                    </thead>
                    <tbody>
                        {results.map((r, i) => {
                            const isSelected = r.ticker === selectedTicker;
                            const stratColor = STRATEGY_COLORS[r.strategy] || '#8b949e';
                            return (
                                <tr key={`${r.ticker}-${r.strategy}-${i}`}
                                    className={`scanner-row ${isSelected ? 'selected' : ''}`}
                                    onClick={() => onSelectTicker(r.ticker)}>
                                    <td className="ticker-cell">{r.ticker}</td>
                                    <td>
                                        <span className="strategy-badge" style={{ color: stratColor, borderColor: stratColor }}>
                                            {r.strategy}
                                        </span>
                                    </td>
                                    <td className="signal-cell">{r.signal}</td>
                                    <td className={r.setup?.includes('LONG') ? 'long' : r.setup?.includes('SHORT') ? 'short' : ''}>
                                        {r.setup}
                                    </td>
                                    <td>{r.entry != null ? `$${r.entry}` : '—'}</td>
                                    <td>{r.stop_loss != null ? `$${r.stop_loss}` : '—'}</td>
                                    <td>{r.target != null ? `$${r.target}` : '—'}</td>
                                    <td className={r.dist_pct > 0 ? 'above' : 'below'}>
                                        {r.dist_pct > 0 ? '+' : ''}{r.dist_pct}%
                                    </td>
                                    <td className="winrate-cell">{r.win_rate || '—'}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default ScannerTable;
