import React, { useState, useMemo } from 'react';
import { Search, Filter, ChevronUp, ChevronDown, ChevronRight, Minimize2, Maximize2 } from 'lucide-react';

const STATUS_COLORS = {
    'Active': { bg: 'rgba(0, 255, 136, 0.12)' },
    'Close': { bg: 'rgba(255, 171, 0, 0.12)' },
    'Building': { bg: 'rgba(100, 100, 100, 0.1)' },
};

const getStatusStyle = (status) => {
    const s = String(status || '');
    for (const [key, style] of Object.entries(STATUS_COLORS)) {
        if (s.includes(key)) return style;
    }
    return {};
};

const ScannerTable = ({ results, selectedTicker, onSelectTicker, collapsed, onToggleCollapse }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [typeFilter, setTypeFilter] = useState('all');
    const [sortCol, setSortCol] = useState(null);
    const [sortDir, setSortDir] = useState('asc');

    const { rows = [], columns = [] } = results || {};

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
        if (sortCol) {
            result = [...result].sort((a, b) => {
                let va = a[sortCol], vb = b[sortCol];
                const na = parseFloat(va), nb = parseFloat(vb);
                if (!isNaN(na) && !isNaN(nb)) return sortDir === 'asc' ? na - nb : nb - na;
                va = String(va || ''); vb = String(vb || '');
                return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
            });
        }
        return result;
    }, [rows, searchTerm, statusFilter, typeFilter, sortCol, sortDir]);

    const handleSort = (col) => {
        if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortCol(col); setSortDir('asc'); }
    };

    const colLabel = (col) => ({
        Signal_Status: 'Signal', Stop_Loss: 'Stop', Win_Rate: 'Win Rate', Strategy_Label: 'Setup',
    }[col] || col);

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
                No scan results yet. Click <strong>🔍 Run Market Scan</strong> to scan.
            </div>
        );
    }

    return (
        <div className={`scanner-table-container ${collapsed ? 'collapsed' : ''}`}>
            {/* Collapsed bar */}
            <div className="table-collapsed-bar" onClick={onToggleCollapse}>
                {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                <span className="collapsed-label">Scanner Results</span>
                <span className="collapsed-count">{filteredRows.length} results</span>
                {selectedTicker && collapsed && (
                    <span className="collapsed-selected">📌 {selectedTicker}</span>
                )}
                {collapsed ? <Maximize2 size={13} className="collapse-icon" /> : <Minimize2 size={13} className="collapse-icon" />}
            </div>

            {/* Expandable content with smooth slide */}
            <div className="table-body-wrapper">
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
        </div>
    );
};

export default ScannerTable;
