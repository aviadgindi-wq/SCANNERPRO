import React, { useState, useEffect } from 'react';
import axios from 'axios';
import ProChart from './components/ProChart';
import ScannerTable from './components/ScannerTable';
import './index.css';

const API_BASE = window.location.hostname === 'localhost'
    ? 'http://127.0.0.1:8000'
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

function App() {
    const [ticker, setTicker] = useState('AAPL');
    const [searchInput, setSearchInput] = useState('');
    const [interval, setIntervalState] = useState('1d');
    const [chartType, setChartType] = useState('candlestick');
    const [chartData, setChartData] = useState(null);
    const [scanResults, setScanResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [scanning, setScanning] = useState(false);
    const [scanMsg, setScanMsg] = useState('');
    const [scanStrategy, setScanStrategy] = useState('all');
    const [searching, setSearching] = useState(false);
    const [tableMinimized, setTableMinimized] = useState(false);
    const [filterMarket, setFilterMarket] = useState('all');
    const [filterSignal, setFilterSignal] = useState('all');

    // ── Load chart from backend (with overlays!) ──
    const loadChart = async (symbol, intv) => {
        const i = intv || interval;
        setTicker(symbol);
        setLoading(true);
        setError(null);

        // Map Futures to YF format for backend fetching
        const mappedSymbols = {
            'ES': 'ES=F', 'MES': 'MES=F',
            'NQ': 'NQ=F', 'MNQ': 'MNQ=F',
            'YM': 'YM=F', 'CL': 'CL=F', 'GC': 'GC=F'
        };
        const querySymbol = mappedSymbols[symbol.toUpperCase()] || symbol;

        try {
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

    // ── Search-to-Analyze ──
    const handleSearch = async (e) => {
        e.preventDefault();
        const t = searchInput.trim().toUpperCase();
        if (!t) return;
        setSearching(true);
        try {
            const res = await axios.get(`${API_BASE}/scan-ticker?ticker=${t}&strategy=${scanStrategy}`);
            if (res.data.results?.length > 0) {
                setScanResults(prev => [...res.data.results, ...prev.filter(r => r.ticker !== t)]);
            }
            loadChart(t, interval);
        } catch (err) { console.error(err); }
        finally { setSearching(false); setSearchInput(''); }
    };

    // ── Market Scan ──
    const runMarketScan = async () => {
        if (scanning) return;
        setScanning(true);
        setScanMsg('Scanning...');
        try {
            const res = await axios.get(`${API_BASE}/scan-market?strategy=${scanStrategy}`);
            setScanResults(res.data.results || []);
            setScanMsg(`✅ ${res.data.count || 0} setups`);
            setTimeout(() => setScanMsg(''), 4000);
        } catch { setScanMsg('❌ Failed'); setTimeout(() => setScanMsg(''), 3000); }
        finally { setScanning(false); }
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
            const sig = (r.signal || '').toLowerCase();
            if (filterSignal === 'active' && !sig.includes('active') && !sig.includes('entry') && !sig.includes('support') && !sig.includes('resistance')) return false;
            if (filterSignal === 'building' && !sig.includes('building') && !sig.includes('close') && !sig.includes('pullback')) return false;
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
                        <ProChart data={chartData} ticker={ticker} />

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
