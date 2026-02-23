import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import TradingChart from './components/TradingChart';
import Toolbar from './components/Toolbar';
import ScannerTable from './components/ScannerTable';
import MarketScanPanel from './components/MarketScanPanel';
import './index.css';

const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:8000' : '';

const STRATEGY_MAP = {
    'none': 'qullamaggie',
    'fibo': 'fibo',
    'nick_shawn': 'nick_shawn',
    'qullamaggie': 'qullamaggie',
};

function App() {
    const [ticker, setTicker] = useState('AAPL');
    const [searchInput, setSearchInput] = useState('AAPL');
    const [interval, setIntervalState] = useState('1d');
    const [chartType, setChartType] = useState('candlestick');
    const [strategy, setStrategy] = useState('none');
    const [showMAs, setShowMAs] = useState(false);
    const [chartData, setChartData] = useState(null);
    const [results, setResults] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [scanning, setScanning] = useState(false);
    const [scanMsg, setScanMsg] = useState('');
    const [tableCollapsed, setTableCollapsed] = useState(false);
    const [sidebarVisible, setSidebarVisible] = useState(false);
    const pollRef = useRef(null);

    const fetchChart = async (symbol, intv, strat) => {
        setLoading(true);
        setError(null);
        try {
            const response = await axios.get(
                `${API_BASE}/chart?ticker=${symbol}&interval=${intv}&strategy=${strat}`
            );
            setChartData(response.data);
        } catch (err) {
            setError(err.response?.data?.detail || err.message || 'Error fetching data');
            setChartData(null);
        } finally {
            setLoading(false);
        }
    };

    const fetchResults = async (strat) => {
        try {
            const csvStrategy = STRATEGY_MAP[strat] || 'qullamaggie';
            const response = await axios.get(`${API_BASE}/results?strategy=${csvStrategy}`);
            setResults(response.data);
        } catch (err) {
            console.error('Error fetching results:', err);
        }
    };

    useEffect(() => { fetchChart(ticker, interval, strategy); }, [ticker, interval, strategy]);
    useEffect(() => { fetchResults(strategy); }, [strategy]);

    // Poll scan status for background full scan
    useEffect(() => {
        if (scanning) {
            pollRef.current = setInterval(async () => {
                try {
                    const res = await axios.get(`${API_BASE}/scan-status`);
                    setScanMsg(res.data.message || '');
                    if (!res.data.running) {
                        setScanning(false);
                        setScanMsg('✅ Complete!');
                        clearInterval(pollRef.current);
                        fetchResults(strategy);
                        setTimeout(() => setScanMsg(''), 4000);
                    }
                } catch { /* ignore */ }
            }, 2000);
        }
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [scanning]);

    const handleSearch = (e) => {
        e.preventDefault();
        if (searchInput.trim()) setTicker(searchInput.trim().toUpperCase());
    };

    const handleSelectTicker = (t) => { setTicker(t); setSearchInput(t); };

    const runScanner = async () => {
        if (scanning) return;
        setScanning(true);
        setScanMsg('⏳ Scanning...');
        try { await axios.post(`${API_BASE}/run-scan`); }
        catch { setScanning(false); setScanMsg('❌ Failed'); setTimeout(() => setScanMsg(''), 3000); }
    };

    return (
        <div className="app-container">
            <header className="header">
                <div className="header-left">
                    <h1>PRO Scanner Terminal</h1>
                </div>
                <div className="header-right">
                    {scanMsg && <span className="scan-status-msg">{scanMsg}</span>}
                    <form className="controls" onSubmit={handleSearch}>
                        <input
                            type="text"
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            placeholder="Ticker"
                        />
                        <button type="submit">Scan</button>
                    </form>
                    <button
                        className={`run-scanner-btn ${scanning ? 'scanning' : ''}`}
                        onClick={runScanner}
                        disabled={scanning}
                    >
                        {scanning ? <><span className="spinner"></span> Scanning...</> : '🔍 Full Scan'}
                    </button>
                    <button
                        className="run-scanner-btn market"
                        onClick={() => setSidebarVisible(v => !v)}
                    >
                        🎯 Market Scan
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

            {/* Scanner Results Table */}
            <ScannerTable
                results={results}
                selectedTicker={ticker}
                onSelectTicker={handleSelectTicker}
                collapsed={tableCollapsed}
                onToggleCollapse={() => setTableCollapsed(c => !c)}
            />

            {/* Chart + Sidebar */}
            <div className="content-row">
                <main className={`main-content ${tableCollapsed ? 'expanded' : ''}`}>
                    <div className="chart-wrapper">
                        {loading && <div className="loading">Loading {ticker}...</div>}
                        {error && <div className="error">{error}</div>}
                        {!loading && !error && chartData && (
                            <TradingChart data={chartData} chartType={chartType} showMAs={showMAs} />
                        )}
                    </div>
                </main>

                <MarketScanPanel
                    onSelectTicker={handleSelectTicker}
                    visible={sidebarVisible}
                    onToggle={() => setSidebarVisible(v => !v)}
                />
            </div>
        </div>
    );
}

export default App;
