import React, { useState, useMemo } from 'react';
import { Search, Filter, ChevronUp, ChevronDown } from 'lucide-react';

const STATUS_COLORS = {
    'Active': { bg: 'rgba(0, 255, 136, 0.12)', border: 'rgba(0, 255, 136, 0.3)' },
    'Close': { bg: 'rgba(255, 171, 0, 0.12)', border: 'rgba(255, 171, 0, 0.3)' },
    'Building': { bg: 'rgba(100, 100, 100, 0.1)', border: 'rgba(100, 100, 100, 0.3)' },
};

const getStatusStyle = (status) => {
    const s = String(status || '');
    for (const [key, style] of Object.entries(STATUS_COLORS)) {
        if (s.includes(key)) return style;
    }
    return {};
};

const ScannerTable = ({ results, selectedTicker, onSelectTicker }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [typeFilter, setTypeFilter] = useState('all');
    const [sortCol, setSortCol] = useState(null);
    const [sortDir, setSortDir] = useState('asc');

    const { rows = [], columns = [] } = results || {};

    // Extract unique statuses and types for filters
    const statuses = useMemo(() => {
        const set = new Set();
        rows.forEach(r => { if (r.Signal_Status) set.add(String(r.Signal_Status)); });
        return Array.from(set);
    }, [rows]);

    const types = useMemo(() => {
        const set = new Set();
        rows.forEach(r => { if (r.Type) set.add(String(r.Type)); });
        return Array.from(set);
    }, [rows]);

    // Filter + search
    const filteredRows = useMemo(() => {
        let result = rows;

        if (searchTerm) {
            const term = searchTerm.toUpperCase();
            result = result.filter(r => String(r.Ticker || '').toUpperCase().includes(term));
        }

        if (statusFilter !== 'all') {
            result = result.filter(r => String(r.Signal_Status || '').includes(statusFilter));
        }

        if (typeFilter !== 'all') {
            result = result.filter(r => String(r.Type || '').includes(typeFilter));
        }

        // Sort
        if (sortCol) {
            result = [...result].sort((a, b) => {
                let va = a[sortCol], vb = b[sortCol];
                // Try numeric
                const na = parseFloat(va), nb = parseFloat(vb);
                if (!isNaN(na) && !isNaN(nb)) {
                    return sortDir === 'asc' ? na - nb : nb - na;
                }
                // String sort
                va = String(va || ''); vb = String(vb || '');
                return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
            });
        }

        return result;
    }, [rows, searchTerm, statusFilter, typeFilter, sortCol, sortDir]);

    const handleSort = (col) => {
        if (sortCol === col) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortCol(col);
            setSortDir('asc');
        }
    };

    // Pretty column names
    const colLabel = (col) => {
        const map = {
            Signal_Status: 'Signal',
            Stop_Loss: 'Stop',
            Win_Rate: 'Win Rate',
            Strategy_Label: 'Setup',
        };
        return map[col] || col;
    };

    const formatCell = (col, val) => {
        if (val == null || val === '' || val === 'nan') return '—';
        if (['Close', 'Entry', 'Stop_Loss', 'Target'].includes(col)) {
            const n = parseFloat(val);
            return isNaN(n) ? val : `$${n.toFixed(2)}`;
        }
        return String(val);
    };

    if (!rows || rows.length === 0) {
        return (
            <div className="scanner-table-empty">
                No scan results yet. Run a scan first.
            </div>
        );
    }

    return (
        <div className="scanner-table-container">
            {/* Filters Row */}
            <div className="table-filters">
                <div className="filter-search">
                    <Search size={14} />
                    <input
                        type="text"
                        placeholder="Search ticker..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="filter-group">
                    <Filter size={12} />
                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                        <option value="all">All Signals</option>
                        {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>

                <div className="filter-group">
                    <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                        <option value="all">All Types</option>
                        {types.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </div>

                <span className="result-count">{filteredRows.length} results</span>
            </div>

            {/* Table */}
            <div className="table-scroll">
                <table className="scanner-table">
                    <thead>
                        <tr>
                            {columns.map(col => (
                                <th key={col} onClick={() => handleSort(col)}>
                                    <span>{colLabel(col)}</span>
                                    {sortCol === col && (
                                        sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                                    )}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {filteredRows.map((row, i) => {
                            const statusStyle = getStatusStyle(row.Signal_Status);
                            const isSelected = row.Ticker === selectedTicker;
                            return (
                                <tr
                                    key={`${row.Ticker}-${i}`}
                                    className={isSelected ? 'selected' : ''}
                                    style={{ backgroundColor: statusStyle.bg || 'transparent' }}
                                    onClick={() => onSelectTicker(row.Ticker)}
                                >
                                    {columns.map(col => (
                                        <td key={col} className={col === 'Ticker' ? 'ticker-cell' : ''}>
                                            {formatCell(col, row[col])}
                                        </td>
                                    ))}
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
