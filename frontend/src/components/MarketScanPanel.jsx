import React, { useState } from 'react';
import axios from 'axios';
import { Radar, X, Loader, ChevronLeft, ChevronRight } from 'lucide-react';

const API_BASE = 'http://localhost:8000';

const MarketScanPanel = ({ onSelectTicker, visible, onToggle }) => {
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [scanned, setScanned] = useState(false);

    const runMarketScan = async () => {
        setLoading(true);
        setScanned(false);
        try {
            const res = await axios.get(`${API_BASE}/scan-market`);
            setResults(res.data.results || []);
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

            <button
                className="scan-market-btn"
                onClick={runMarketScan}
                disabled={loading}
            >
                {loading ? (
                    <><Loader size={14} className="spin-icon" /> Scanning Top 50...</>
                ) : (
                    <><Radar size={14} /> Scan Market (Fibo)</>
                )}
            </button>

            {scanned && results.length === 0 && (
                <div className="no-results">No active Fibo setups found.</div>
            )}

            <div className="scan-cards">
                {results.map((r, i) => (
                    <div
                        key={r.ticker}
                        className="scan-card"
                        onClick={() => onSelectTicker(r.ticker)}
                    >
                        <div className="card-top">
                            <span className="card-ticker">{r.ticker}</span>
                            <span className={`card-type ${r.type.includes('LONG') ? 'long' : 'short'}`}>
                                {r.type}
                            </span>
                        </div>

                        <div className="card-leg">{r.leg_status}</div>

                        <div className="card-prices">
                            <div className="card-price">
                                <span className="label">Close</span>
                                <span className="value">${r.close}</span>
                            </div>
                            <div className="card-price">
                                <span className="label">Entry (0.618)</span>
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
                            <span>SL: ${r.stop_loss}</span>
                            <span>TP: ${r.target}</span>
                        </div>
                    </div>
                ))}
            </div>
        </aside>
    );
};

export default MarketScanPanel;
