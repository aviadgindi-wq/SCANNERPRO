import React, { useState } from 'react';
import axios from 'axios';
import { Radar, Loader, ChevronLeft, ChevronRight } from 'lucide-react';

const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:8000' : '';

const STRATEGIES = [
    { value: 'all', label: '🌐 All Strategies' },
    { value: 'fibo', label: '📐 Fibonacci' },
    { value: 'qullamaggie', label: '📈 Qullamaggie' },
    { value: 'nick_shawn', label: '🎯 Nick Shawn' },
];

const STRATEGY_COLORS = {
    'Fibonacci': '#8b5cf6',
    'Qullamaggie': '#3fb950',
    'Nick Shawn': '#f0883e',
};

const MarketScanPanel = ({ onSelectTicker, visible, onToggle }) => {
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [scanned, setScanned] = useState(false);
    const [selectedStrategy, setSelectedStrategy] = useState('all');
    const [resultStrategy, setResultStrategy] = useState('');

    const runMarketScan = async () => {
        setLoading(true);
        setScanned(false);
        try {
            const res = await axios.get(`${API_BASE}/scan-market?strategy=${selectedStrategy}`);
            setResults(res.data.results || []);
            setResultStrategy(res.data.strategy || selectedStrategy);
            setScanned(true);
        } catch (err) {
            console.error('Market scan error:', err);
        } finally {
            setLoading(false);
        }
    };

    if (!visible) {
        return (
            <button className="sidebar-toggle-btn" onClick={onToggle} title="Open Market Scanner">
                <ChevronLeft size={14} />
            </button>
        );
    }

    return (
        <aside className="market-scan-panel">
            <div className="panel-header">
                <div className="panel-title">
                    <Radar size={14} />
                    <span>Market Scanner</span>
                </div>
                <button className="panel-close" onClick={onToggle}><ChevronRight size={14} /></button>
            </div>

            {/* Strategy Selector */}
            <div className="strategy-selector">
                <select
                    value={selectedStrategy}
                    onChange={(e) => setSelectedStrategy(e.target.value)}
                    className="strategy-dropdown"
                >
                    {STRATEGIES.map(s => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                </select>
            </div>

            <button
                className="scan-market-btn"
                onClick={runMarketScan}
                disabled={loading}
            >
                {loading ? (
                    <><Loader size={14} className="spin-icon" /> Scanning Top 50...</>
                ) : (
                    <><Radar size={14} /> Scan Market</>
                )}
            </button>

            {scanned && (
                <div className="scan-summary">
                    Found <strong>{results.length}</strong> setups
                    {resultStrategy !== 'all' && <> for <strong>{resultStrategy}</strong></>}
                </div>
            )}

            {scanned && results.length === 0 && (
                <div className="no-results">No active setups found for this strategy.</div>
            )}

            <div className="scan-cards">
                {results.map((r, i) => {
                    const stratColor = STRATEGY_COLORS[r.strategy] || '#8b949e';
                    return (
                        <div
                            key={`${r.ticker}-${r.strategy}-${i}`}
                            className="scan-card"
                            onClick={() => onSelectTicker(r.ticker)}
                        >
                            <div className="card-top">
                                <span className="card-ticker">{r.ticker}</span>
                                <span className="card-strategy-badge" style={{ borderColor: stratColor, color: stratColor }}>
                                    {r.strategy}
                                </span>
                            </div>

                            <div className="card-leg">{r.leg_status}</div>

                            <div className="card-prices">
                                <div className="card-price">
                                    <span className="label">Close</span>
                                    <span className="value">${r.close}</span>
                                </div>
                                <div className="card-price">
                                    <span className="label">Entry</span>
                                    <span className="value entry">${r.entry}</span>
                                </div>
                                <div className="card-price">
                                    <span className="label">Distance</span>
                                    <span className={`value ${r.dist_pct > 0 ? 'above' : 'below'}`}>
                                        {r.dist_pct > 0 ? '+' : ''}{r.dist_pct}%
                                    </span>
                                </div>
                            </div>

                            <div className="card-levels">
                                <span className={r.type.includes('LONG') ? 'long-tag' : 'short-tag'}>
                                    {r.type}
                                </span>
                                <span>SL: ${r.stop_loss} | TP: ${r.target}</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </aside>
    );
};

export default MarketScanPanel;
