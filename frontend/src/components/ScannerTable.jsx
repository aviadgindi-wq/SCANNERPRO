import React, { useState, useMemo } from 'react';

const STRATEGY_COLORS = {
    'Fibonacci': '#8b5cf6',
    'Nick Shawn': '#3fb950',
    'Qullamaggie': '#a78bfa',
    'NEUTRAL': '#8b949e'
};

const SIDE_COLORS = { LONG: '#3fb950', SHORT: '#f85149', NEUTRAL: '#8b949e' };

const getDistColor = (dist) => {
    const abs = Math.abs(dist);
    if (abs < 1) return '#3fb950'; // Green
    if (abs < 3) return '#f0883e'; // Yellow/Orange
    return '#8b949e';             // Gray
};

const ScannerTable = ({ results, selectedTicker, onSelectTicker }) => {
    const [strategyFilter, setStrategyFilter] = useState('ALL');
    const [sortConfig, setSortConfig] = useState({ key: 'dist_percent', direction: 'asc' });

    const handleSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const sortedAndFilteredItems = useMemo(() => {
        let items = [...(results || [])];

        // 1. Filter
        if (strategyFilter !== 'ALL') {
            items = items.filter(r => r.strategy === strategyFilter);
        }

        // 2. Sort
        items.sort((a, b) => {
            let valA = a[sortConfig.key];
            let valB = b[sortConfig.key];

            // Normalize for comparison
            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();

            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return items;
    }, [results, strategyFilter, sortConfig]);

    const tabs = ['ALL', 'Fibonacci', 'Nick Shawn', 'Qullamaggie'];

    return (
        <div className="scanner-table-wrapper">
            {/* Filter Tabs */}
            <div className="strategy-filters">
                {tabs.map(tab => (
                    <button
                        key={tab}
                        className={`filter-tab ${strategyFilter === tab ? 'active' : ''}`}
                        onClick={() => setStrategyFilter(tab)}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            <div className="scanner-table-scroll">
                <table className="scanner-table">
                    <thead>
                        <tr>
                            <th onClick={() => handleSort('ticker')} className="sortable-header">
                                Ticker {sortConfig.key === 'ticker' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                            </th>
                            <th>Price</th>
                            <th>Side</th>
                            <th>Strategy</th>
                            <th onClick={() => handleSort('dist_percent')} className="sortable-header">
                                Dist % {sortConfig.key === 'dist_percent' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                            </th>
                            <th>Win Rate</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedAndFilteredItems.map((r, i) => {
                            const isSelected = r.ticker === selectedTicker;
                            const dist = r.dist_percent;
                            const hasData = r.price > 0 && r.strategy !== 'NEUTRAL';
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
                                        }}>
                                            {r.strategy}
                                        </span>
                                    </td>
                                    <td style={{
                                        color: distColor,
                                        fontWeight: hasData && Math.abs(dist) < 1 ? 700 : 400
                                    }}>
                                        {r.price === 0 ? '—' : (dist > 0 ? `+${dist.toFixed(2)}%` : `${dist.toFixed(2)}%`)}
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
