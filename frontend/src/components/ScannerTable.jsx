import React from 'react';

const STRATEGY_COLORS = {
    'Fibonacci': '#8b5cf6',
    'Nick Shawn': '#3fb950',
    'Qullamaggie': '#a78bfa',
};

const SIDE_COLORS = { LONG: '#3fb950', SHORT: '#f85149' };

const getDistColor = (dist) => {
    const abs = Math.abs(dist);
    if (abs < 1) return '#3fb950'; // Green
    if (abs < 3) return '#f0883e'; // Yellow/Orange
    return '#8b949e';             // Gray
};

const ScannerTable = ({ results, selectedTicker, onSelectTicker }) => {
    // Always render table headers, even if results are initializing
    const items = results || [];

    return (
        <div className="scanner-table-wrapper">
            <div className="scanner-table-scroll">
                <table className="scanner-table">
                    <thead>
                        <tr>
                            <th>Ticker</th>
                            <th>Price</th>
                            <th>Side</th>
                            <th>Strategy</th>
                            <th>Dist %</th>
                            <th>Win Rate</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((r, i) => {
                            const isSelected = r.ticker === selectedTicker;
                            const dist = r.dist_percent;
                            const hasData = r.price > 0 && r.strategy !== 'Waiting...';
                            const distColor = hasData ? getDistColor(dist) : '#8b949e';

                            return (
                                <tr key={`${r.ticker}-${i}`}
                                    className={`scanner-row ${isSelected ? 'selected' : ''}`}
                                    onClick={() => onSelectTicker(r.ticker)}>
                                    <td className="ticker-cell">{r.ticker}</td>
                                    <td className="price-cell">
                                        {r.price > 0 ? `$${r.price.toFixed(2)}` : <span className="placeholder-text">$0.00</span>}
                                    </td>
                                    <td style={{
                                        color: r.side && r.side !== 'NEUTRAL' ? SIDE_COLORS[r.side] : '#8b949e',
                                        fontWeight: 700
                                    }}>
                                        {r.side === 'LONG' ? '▲ BUY' : r.side === 'SHORT' ? '▼ SELL' : '—'}
                                    </td>
                                    <td>
                                        <span className="strategy-badge" style={{
                                            color: STRATEGY_COLORS[r.strategy] || '#8b949e',
                                            borderColor: STRATEGY_COLORS[r.strategy] || '#8b949e',
                                            opacity: r.strategy === 'Waiting...' ? 0.5 : 1
                                        }}>
                                            {r.strategy}
                                        </span>
                                    </td>
                                    <td style={{
                                        color: distColor,
                                        fontWeight: hasData && Math.abs(dist) < 1 ? 700 : 400
                                    }}>
                                        {!hasData ? '—' : (dist > 0 ? `+${dist.toFixed(2)}%` : `${dist.toFixed(2)}%`)}
                                    </td>
                                    <td className="winrate-cell">{r.win_rate}</td>
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
