import React, { useEffect, useRef, memo } from 'react';

// Map yfinance symbols to TradingView format
const SYMBOL_MAP = {
    'ES=F': 'CME_MINI:ES1!',
    'NQ=F': 'CME_MINI:NQ1!',
    'YM=F': 'CBOT_MINI:YM1!',
    'CL=F': 'NYMEX:CL1!',
    'GC=F': 'COMEX:GC1!',
    'BRK-B': 'NYSE:BRK.B',
};

const toTVSymbol = (ticker) => {
    if (SYMBOL_MAP[ticker]) return SYMBOL_MAP[ticker];
    // Default: assume NASDAQ for tech, but TradingView resolves automatically
    return ticker;
};

const TradingViewWidget = ({ symbol = 'AAPL', interval = 'D' }) => {
    const containerRef = useRef(null);

    useEffect(() => {
        if (!containerRef.current) return;

        // Clear previous widget
        containerRef.current.innerHTML = '';

        const tvSymbol = toTVSymbol(symbol);

        // Map our intervals to TradingView format
        const tvInterval = {
            '1m': '1', '5m': '5', '15m': '15',
            '1h': '60', '4h': '240',
            '1d': 'D', '1wk': 'W',
        }[interval] || 'D';

        const script = document.createElement('script');
        script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
        script.type = 'text/javascript';
        script.async = true;
        script.innerHTML = JSON.stringify({
            autosize: true,
            symbol: tvSymbol,
            interval: tvInterval,
            timezone: 'exchange',
            theme: 'dark',
            style: '1',
            locale: 'en',
            allow_symbol_change: true,
            details: true,
            hotlist: true,
            calendar: true,
            hide_top_toolbar: false,
            hide_legend: false,
            save_image: true,
            support_host: 'https://www.tradingview.com',
            backgroundColor: 'rgba(13, 17, 23, 1)',
            gridColor: 'rgba(33, 38, 45, 0.6)',
        });

        const widgetDiv = document.createElement('div');
        widgetDiv.className = 'tradingview-widget-container__widget';
        widgetDiv.style.height = '100%';
        widgetDiv.style.width = '100%';

        containerRef.current.appendChild(widgetDiv);
        containerRef.current.appendChild(script);

        return () => {
            if (containerRef.current) {
                containerRef.current.innerHTML = '';
            }
        };
    }, [symbol, interval]);

    return (
        <div
            className="tradingview-widget-container"
            ref={containerRef}
            style={{ height: '100%', width: '100%' }}
        />
    );
};

export default memo(TradingViewWidget);
