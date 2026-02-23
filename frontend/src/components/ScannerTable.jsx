import React from 'react';

const STRATEGY_COLORS = {
    'Fibonacci': '#8b5cf6',
    'Qullamaggie': '#3fb950',
    'Nick Shawn': '#f0883e',
};

const DIR_COLORS = { LONG: '#3fb950', SHORT: '#f85149' };

const getDirection = (setup) => {
    if (!setup || setup === '—') return '—';
    if (setup.includes('LONG')) return 'LONG';
    if (setup.includes('SHORT')) return 'SHORT';
    return '—';
};

const ScannerTable = ({ results, selectedTicker, onSelectTicker }) => {
    if (!results || results.length === 0) {
        return (
            <div className="scanner-table-empty">
                <span>📊 No results — use 🔍 to analyze a ticker or 🚀 to scan the market</span>
            </div>
        );
    }

    // ── Dedup: merge same ticker into single row with multiple strategies ──
    const dedupMap = new Map();
    for (const r of results) {
        if (!dedupMap.has(r.ticker)) {
            // Store first occurrence, init strategies array
            dedupMap.set(r.ticker, {
                ...r,
                strategies: r.strategy !== '—' ? [r.strategy] : []
            });
        } else {
            // Append strategy badge if unique
            const existing = dedupMap.get(r.ticker);
            if (r.strategy !== '—' && !existing.strategies.includes(r.strategy)) {
                existing.strategies.push(r.strategy);
            }
            // Preserve win_rate if the first one missed it but a subsequent one has it
            if ((!existing.win_rate || existing.win_rate === '—') && r.win_rate && r.win_rate !== '—') {
                existing.win_rate = r.win_rate;
            }
        }
    }
    const deduped = Array.from(dedupMap.values());

    return (
        <div className="scanner-table-wrapper">
            <div className="scanner-table-scroll">
                <table className="scanner-table">
                    <thead>
                        <tr>
                            <th>Ticker</th>
                            <th>Direction</th>
                            <th>Strategies</th>
                            <th>Signal</th>
                            <th>Entry</th>
                            <th>Stop</th>
                            <th>Target</th>
                            <th>Dist %</th>
                            <th>Win Rate</th>
                        </tr>
                    </thead>
                    <tbody>
                        {deduped.map((r, i) => {
                            const isSelected = r.ticker === selectedTicker;
                            const dir = getDirection(r.setup);
                            const dirColor = DIR_COLORS[dir] || '#8b949e';

                            // If no strategy, Fallback
                            const strats = r.strategies.length > 0 ? r.strategies : ['—'];

                            return (
                                <tr key={`${r.ticker}-${i}`}
                                    className={`scanner-row ${isSelected ? 'selected' : ''}`}
                                    onClick={() => onSelectTicker(r.ticker)}>
                                    <td className="ticker-cell">{r.ticker}</td>
                                    <td style={{ color: dirColor, fontWeight: 700 }}>
                                        {dir === 'LONG' ? '▲ LONG' : dir === 'SHORT' ? '▼ SHORT' : '—'}
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                                            {strats.map(s => {
                                                const c = STRATEGY_COLORS[s] || '#8b949e';
                                                return (
                                                    <span key={s} className="strategy-badge" style={{ color: c, borderColor: c }}>
                                                        {s}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    </td>
                                    <td className="signal-cell">{r.signal}</td>
                                    <td>{r.entry != null ? `$${r.entry}` : '—'}</td>
                                    <td>{r.stop_loss != null ? `$${r.stop_loss}` : '—'}</td>
                                    <td>{r.target != null ? `$${r.target}` : '—'}</td>
                                    <td className={r.dist_pct > 0 ? 'above' : 'below'}>
                                        {r.dist_pct != null ? `${r.dist_pct > 0 ? '+' : ''}${r.dist_pct}%` : '—'}
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
