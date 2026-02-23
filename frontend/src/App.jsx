import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import TradingChart from './components/TradingChart';
import Toolbar from './components/Toolbar';
import ScannerTable from './components/ScannerTable';
import './index.css';

// Dynamic API URL: localhost for dev, Render URL for production
const API_BASE = window.location.hostname === 'localhost'
    ? 'http://127.0.0.1:8000'
    : 'https://scannerpro.onrender.com';

function App() {
    const [ticker, setTicker] = useState('AAPL');
    const [searchInput, setSearchInput] = useState('');
    const [interval, setIntervalState] = useState('1d');
    const [chartType, setChartType] = useState('candlestick');
    const [strategy, setStrategy] = useState('none');
    const [showMAs, setShowMAs] = useState(false);
    const [chartData, setChartData] = useState(null);
    const [scanResults, setScanResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [scanning, setScanning] = useState(false);
    const [scanMsg, setScanMsg] = useState('');
    const [scanStrategy, setScanStrategy] = useState('all');
    const [searching, setSearching] = useState(false);

    // ── Load chart for any ticker (ONE function for all clicks) ──
    const loadChartData = async (symbol) => {
        setTicker(symbol);
        setLoading(true);
        setError(null);
        try {
            const response = await axios.get(
                `${API_BASE}/chart?ticker=${symbol}&interval=${interval}&strategy=${strategy}`
            );
            setChartData(response.data);
        } catch (err) {
            setError(err.response?.data?.detail || err.message || 'Error');
            setChartData(null);
        } finally {
            setLoading(false);
        }
    };

    // Load chart on ticker/interval/strategy change
    useEffect(() => { loadChartData(ticker); }, [ticker, interval, strategy]);

    // ── Search-to-Analyze: scan single ticker ──
    const handleSearch = async (e) => {
        e.preventDefault();
        const t = searchInput.trim().toUpperCase();
        if (!t) return;
        setSearching(true);
        try {
            const res = await axios.get(`${API_BASE}/scan-ticker?ticker=${t}&strategy=${scanStrategy}`);
            if (res.data.results && res.data.results.length > 0) {
                // Add to TOP of table (remove old entries for same ticker)
                setScanResults(prev => [
                    ...res.data.results,
                    ...prev.filter(r => r.ticker !== t)
                ]);
            }
            loadChartData(t);
        } catch (err) {
            console.error('Search error:', err);
        } finally {
            setSearching(false);
            setSearchInput('');
        }
    };

    // ── Market Scan: scan top 50 tickers ──
    const runMarketScan = async () => {
        if (scanning) return;
        setScanning(true);
        setScanMsg('Scanning top 50...');
        try {
            const res = await axios.get(`${API_BASE}/scan-market?strategy=${scanStrategy}`);
            setScanResults(res.data.results || []);
            setScanMsg(`✅ Found ${res.data.count} setups`);
            setTimeout(() => setScanMsg(''), 4000);
        } catch (err) {
            setScanMsg('❌ Scan failed');
            setTimeout(() => setScanMsg(''), 3000);
        } finally {
            setScanning(false);
        }
    };

    // ── Click any table row → load chart ──
    const handleRowClick = (t) => { loadChartData(t); };

    return (
        <div className="app-container">
            <header className="header">
                <div className="header-left">
                    <h1>PRO Scanner</h1>
                    {scanMsg && <span className="scan-status-msg">{scanMsg}</span>}
                </div>
                <div className="header-right">
                    {/* Search-to-Analyze */}
                    <form className="search-form" onSubmit={handleSearch}>
                        <input
                            type="text"
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            placeholder="Analyze ticker..."
                            className="search-input"
                            disabled={searching}
                        />
                        <button type="submit" className="search-btn" disabled={searching}>
                            {searching ? '⏳' : '🔍'}
                        </button>
                    </form>

                    {/* Strategy Selector */}
                    <select
                        value={scanStrategy}
                        onChange={(e) => setScanStrategy(e.target.value)}
                        className="strategy-dropdown-header"
                    >
                        <option value="all">All Strategies</option>
                        <option value="fibo">📐 Fibonacci</option>
                        <option value="qullamaggie">📈 Qullamaggie</option>
                        <option value="nick_shawn">🎯 Nick Shawn</option>
                    </select>

                    {/* Market Scan Button */}
                    <button
                        className={`market-scan-btn ${scanning ? 'scanning' : ''}`}
                        onClick={runMarketScan}
                        disabled={scanning}
                    >
                        {scanning ? <><span className="spinner"></span> Scanning...</> : '🚀 MARKET SCAN'}
                    </button>
                </div>
            </header>

            <Toolbar
                interval={interval}
                setInterval={setIntervalState}
                chartType={chartType}
                setChartType={setChartType}
                strategy={strategy}
                setStrategy={setStrategy}
                showMAs={showMAs}
                setShowMAs={setShowMAs}
            />

            {/* Unified Scanner Table */}
            <ScannerTable
                results={scanResults}
                selectedTicker={ticker}
                onSelectTicker={handleRowClick}
            />

            {/* Chart */}
            <main className="main-content">
                <div className="chart-wrapper">
                    {loading && <div className="loading">Loading {ticker}...</div>}
                    {error && <div className="error">{error}</div>}
                    {!loading && !error && chartData && (
                        <TradingChart data={chartData} chartType={chartType} showMAs={showMAs} />
                    )}
                </div>
            </main>
        </div>
    );
}

export default App;
