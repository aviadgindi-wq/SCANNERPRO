import React, { useState, useEffect } from 'react';
import axios from 'axios';
import ProChart from './components/ProChart';
import ScannerTable from './components/ScannerTable';
import './index.css';

const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? window.location.origin
    : 'https://scannerpro.onrender.com';

const INTERVALS = [
    { value: '1m', label: '1m' },
    { value: '5m', label: '5m' },
    { value: '15m', label: '15m' },
    { value: '1h', label: '1H' },
    { value: '4h', label: '4H' },
    { value: '1d', label: 'D' },
    { value: '1wk', label: 'W' },
];

const WATCHLIST = [
    // --- CME Futures ---
    "ES=F", "NQ=F", "YM=F", "RTY=F", "GC=F", "CL=F", "SI=F", "HG=F", "NG=F", "RB=F", "HO=F", "ZC=F", "ZS=F", "ZW=F",
    // --- ETFs ---
    "SPY", "QQQ", "IWM", "DIA", "TLT", "XLK", "XLV", "XLF", "XLE", "XLI", "XLY", "XLP", "XLB", "XLU", "XLC", "XLRE",
    // --- Top 100 S&P 500 & Leaders ---
    "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "BRK-B", "LLY", "AVGO", "V", "JPM", "UNH", "MA", "WMT", "JNJ", "PG", "HD", "COST", "ORCL", "ABBV", "MRK", "BAC", "CVX", "CRM", "KO", "AMD", "PEP", "ADBE", "LIN", "TMO", "MCD", "CSCO", "DIS", "ABT", "TMUS", "WFC", "INTU", "GE", "QCOM", "CAT", "AMAT", "IBM", "MS", "AMGN", "VZ", "TXN", "NEE", "PM", "UNP", "HON", "ISRG", "BMY", "GS", "LOW", "SPGI", "RTX", "COP", "UPS", "LRCX", "ELV", "PGR", "BKNG", "C", "MU", "LMT", "TJX", "DE", "REGN", "PLD", "CI", "MDT", "SBUX", "MMC", "ADP", "SCHW", "SYK", "CB", "VRTX", "BSX", "ETN", "PANW", "SNPS", "ZTS", "MO", "FI", "AMT", "CDNS", "ICE", "ADI", "CME", "SHW", "KLAC", "DUK", "PGR", "ITW"
];

function App() {
    const [ticker, setTicker] = useState('AAPL');
    const [searchInput, setSearchInput] = useState('');
    const [interval, setIntervalState] = useState('1d');
    const [chartType, setChartType] = useState('candlestick');
    const [chartData, setChartData] = useState(null);

    // Initialize with placeholders for the entire WATCHLIST
    const [scanResults, setScanResults] = useState(
        WATCHLIST.map(sym => ({
            ticker: sym, price: 0, scale: '—', strategy: 'NEUTRAL', dist_percent: 0, signal: 'NEUTRAL', win_rate: '—'
        }))
    );

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [scanning, setScanning] = useState(false);
    const [scanMsg, setScanMsg] = useState('');
    const [scanStrategy, setScanStrategy] = useState('all');
    const [searching, setSearching] = useState(false);
    const [tableMinimized, setTableMinimized] = useState(false);
    const [filterMarket, setFilterMarket] = useState('all');
    const [filterSignal, setFilterSignal] = useState('all');
    const [showFibo, setShowFibo] = useState(true);

    // ── Load chart from backend ──
    const loadChart = async (symbol, intv) => {
        const i = intv || interval;
        setTicker(symbol);
        setLoading(true);
        setError(null);
        try {
            const querySymbol = symbol.includes('=') ? symbol : symbol;
            const res = await axios.get(`${API_BASE}/chart?ticker=${querySymbol}&interval=${i}&strategy=fibo`);
            setChartData(res.data);
        } catch (err) {
            setError(`Ticker ${symbol} not found`);
            setChartData(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadChart(ticker, interval); }, [interval]);

    // ── Auto-Scan on mount ──
    useEffect(() => {
        runMarketScan();
    }, []);

    // ── Market Scan (SMART UPDATE) ──
    const runMarketScan = async () => {
        if (scanning) return;
        setScanning(true);
        setScanMsg('Scanning...');
        try {
            const res = await axios.get(`${API_BASE}/scan-market?strategy=${scanStrategy}`);
            const data = Array.isArray(res.data) ? res.data : (res.data.results || []);

            // Merge logic: Update in-place to prevent table flicker/rebuild
            setScanResults(prev => {
                const newResults = [...prev];
                data.forEach(item => {
                    const idx = newResults.findIndex(r => r.ticker === item.ticker);
                    if (idx !== -1) {
                        newResults[idx] = { ...newResults[idx], ...item };
                    } else {
                        // If it's a new ticker not in hardcoded watchlist
                        newResults.push(item);
                    }
                });
                return newResults;
            });

            setScanMsg(`✅ ${data.length} items`);
            setTimeout(() => setScanMsg(''), 4000);
        } catch (err) {
            console.error(err);
            setScanMsg('❌ Failed');
            setTimeout(() => setScanMsg(''), 3000);
        }
        finally { setScanning(false); }
    };

    // ── Search-to-Analyze ──
    const handleSearch = async (e) => {
        e.preventDefault();
        const t = searchInput.trim().toUpperCase();
        if (!t) return;
        setSearching(true);
        try {
            const res = await axios.get(`${API_BASE}/scan-ticker?ticker=${t}&strategy=${scanStrategy}`);
            if (res.data.results?.length > 0) {
                const item = res.data.results[0];
                setScanResults(prev => {
                    const idx = prev.findIndex(r => r.ticker === t);
                    if (idx !== -1) {
                        const next = [...prev];
                        next[idx] = item;
                        return next;
                    }
                    return [item, ...prev];
                });
            }
            loadChart(t, interval);
        } catch (err) { console.error(err); }
        finally { setSearching(false); setSearchInput(''); }
    };

    // ── Row click → load chart with overlays ──
    const handleRowClick = (t) => { loadChart(t, interval); };

    // ── Filter ──
    const filtered = scanResults.filter(r => {
        if (filterMarket !== 'all') {
            const isFuture = r.ticker.includes('=F');
            if (filterMarket === 'futures' && !isFuture) return false;
            if (filterMarket === 'stocks' && isFuture) return false;
        }
        if (filterSignal !== 'all') {
            const sig = (r.signal || '').toUpperCase();
            if (filterSignal === 'active' && sig !== 'WATCH') return false;
            if (filterSignal === 'building' && sig !== 'NEUTRAL') return false;
        }
        return true;
    });

    return (
        <div className="app-container">
            {/* ── Header ── */}
            <header className="header">
                <div className="header-left">
                    <h1>PRO Scanner</h1>
                    {scanMsg && <span className="scan-status-msg">{scanMsg}</span>}
                </div>
                <div className="header-right">
                    <form className="search-form" onSubmit={handleSearch}>
                        <input type="text" value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            placeholder="Search ticker (ES=F, AAPL...)" className="search-input"
                            disabled={searching} />
                        <button type="submit" className="search-btn" disabled={searching}>
                            {searching ? '⏳' : '🔍'}
                        </button>
                    </form>

                    <div className="interval-pills">
                        {INTERVALS.map(iv => (
                            <button key={iv.value}
                                className={`pill ${interval === iv.value ? 'active' : ''}`}
                                onClick={() => setIntervalState(iv.value)}
                            >{iv.label}</button>
                        ))}
                    </div>

                    <select value={scanStrategy} onChange={(e) => setScanStrategy(e.target.value)}
                        className="strategy-dropdown-header">
                        <option value="all">All</option>
                        <option value="fibo">📐 Fibo</option>
                        <option value="qullamaggie">📈 Qulla</option>
                        <option value="nick_shawn">🎯 NS</option>
                    </select>

                    <button className={`market-scan-btn ${scanning ? 'scanning' : ''}`}
                        onClick={runMarketScan} disabled={scanning}>
                        {scanning ? <><span className="spinner"></span> Scanning...</> : '🚀 SCAN'}
                    </button>
                </div>
            </header>

            {/* ── 60/40 Dashboard ── */}
            <div className={`dashboard-layout ${tableMinimized ? 'table-hidden' : ''}`}>
                <main className="chart-panel">
                    <div className="chart-wrapper">
                        {/* Render ProChart unconditionally to prevent iframe unmounting & black flashes */}
                        <ProChart
                            data={chartData}
                            ticker={ticker}
                            showFibo={showFibo}
                            setShowFibo={setShowFibo}
                        />

                        {/* Overlay loading/error states on top of the chart */}
                        {loading && (
                            <div className="chart-loading-overlay" style={{
                                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                                background: 'rgba(19, 23, 34, 0.85)', zIndex: 10,
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff'
                            }}>
                                <div className="spinner" style={{ marginBottom: '15px', width: '40px', height: '40px', borderTopColor: '#26a69a' }}></div>
                                <span style={{ fontSize: '16px', fontWeight: 'bold' }}>Loading {ticker}...</span>
                            </div>
                        )}
                        {error && (
                            <div className="chart-loading-overlay" style={{
                                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                                background: 'rgba(19, 23, 34, 0.95)', zIndex: 10,
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#ff4444'
                            }}>
                                <span style={{ fontSize: '18px', fontWeight: 'bold' }}>⚠️ {error}</span>
                            </div>
                        )}
                    </div>
                </main>

                <section className={`table-panel ${tableMinimized ? 'minimized' : ''}`}>
                    <div className="table-panel-header">
                        <span className="table-panel-title">📊 Results ({filtered.length})</span>
                        <div className="table-filters-inline">
                            <select value={filterMarket} onChange={(e) => setFilterMarket(e.target.value)}
                                className="filter-select">
                                <option value="all">All Markets</option>
                                <option value="stocks">Stocks</option>
                                <option value="futures">CME Futures</option>
                            </select>
                            <select value={filterSignal} onChange={(e) => setFilterSignal(e.target.value)}
                                className="filter-select">
                                <option value="all">All Signals</option>
                                <option value="active">🟢 Active</option>
                                <option value="building">🔨 Building</option>
                            </select>
                        </div>
                        <button className="minimize-btn" onClick={() => setTableMinimized(m => !m)}>
                            {tableMinimized ? '▲ Show' : '▼ Hide'}
                        </button>
                    </div>
                    {!tableMinimized && (
                        <ScannerTable results={filtered} selectedTicker={ticker} onSelectTicker={handleRowClick} />
                    )}
                </section>
            </div>
        </div>
    );
}

export default App;
