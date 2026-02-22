import React, { useState, useEffect } from 'react';
import axios from 'axios';
import TradingChart from './components/TradingChart';
import Toolbar from './components/Toolbar';
import ScannerTable from './components/ScannerTable';
import './index.css';

const API_BASE = 'http://localhost:8000';

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

    // Fetch chart data
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

    // Fetch scan results table
    const fetchResults = async (strat) => {
        try {
            const csvStrategy = STRATEGY_MAP[strat] || 'qullamaggie';
            const response = await axios.get(`${API_BASE}/results?strategy=${csvStrategy}`);
            setResults(response.data);
        } catch (err) {
            console.error('Error fetching results:', err);
        }
    };

    useEffect(() => {
        fetchChart(ticker, interval, strategy);
    }, [ticker, interval, strategy]);

    useEffect(() => {
        fetchResults(strategy);
    }, [strategy]);

    const handleSearch = (e) => {
        e.preventDefault();
        if (searchInput.trim()) {
            setTicker(searchInput.trim().toUpperCase());
        }
    };

    const handleSelectTicker = (t) => {
        setTicker(t);
        setSearchInput(t);
    };

    return (
        <div className="app-container">
            <header className="header">
                <div className="header-left">
                    <h1>PRO Scanner Terminal</h1>
                </div>
                <form className="controls" onSubmit={handleSearch}>
                    <input
                        type="text"
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        placeholder="Ticker"
                    />
                    <button type="submit">Scan</button>
                </form>
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
            />

            {/* Chart Area */}
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
