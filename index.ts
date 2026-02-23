import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const symbol = url.searchParams.get('symbol');
    const interval = url.searchParams.get('interval') || '15m';
    const range = url.searchParams.get('range') || '5d';
    const mode = url.searchParams.get('mode') || 'candles'; // 'candles' | 'quote'

    if (!symbol) {
      return new Response(JSON.stringify({ error: 'Missing symbol parameter' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (mode === 'quote') {
      // Fetch current quote for intrabar simulation
      const quoteUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d&includePrePost=false`;
      
      const response = await fetch(quoteUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      if (!response.ok) {
        throw new Error(`Yahoo Finance quote error: ${response.status}`);
      }

      const data = await response.json();
      const result = data?.chart?.result?.[0];
      
      if (!result) {
        throw new Error('No quote data returned');
      }

      const meta = result.meta;
      const currentPrice = meta?.regularMarketPrice ?? meta?.chartPreviousClose ?? null;
      const timestamp = meta?.regularMarketTime ?? Math.floor(Date.now() / 1000);

      return new Response(JSON.stringify({
        symbol,
        price: currentPrice,
        timestamp,
        marketState: meta?.marketState ?? 'UNKNOWN',
        currency: meta?.currency ?? 'USD',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch OHLCV candles
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}&includePrePost=false`;

    const response = await fetch(yahooUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!response.ok) {
      throw new Error(`Yahoo Finance error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const result = data?.chart?.result?.[0];

    if (!result) {
      throw new Error('No chart data returned from Yahoo Finance');
    }

    const timestamps: number[] = result.timestamp ?? [];
    const ohlcv = result.indicators?.quote?.[0] ?? {};
    const opens: number[] = ohlcv.open ?? [];
    const highs: number[] = ohlcv.high ?? [];
    const lows: number[] = ohlcv.low ?? [];
    const closes: number[] = ohlcv.close ?? [];
    const volumes: number[] = ohlcv.volume ?? [];

    // Build candles array, filter out nulls
    const candles = timestamps
      .map((t, i) => ({
        time: t as number,
        open: opens[i],
        high: highs[i],
        low: lows[i],
        close: closes[i],
        volume: volumes[i],
      }))
      .filter(c => c.open != null && c.high != null && c.low != null && c.close != null)
      .sort((a, b) => a.time - b.time);

    const meta = result.meta;

    return new Response(JSON.stringify({
      symbol,
      interval,
      currency: meta?.currency ?? 'USD',
      exchangeName: meta?.exchangeName ?? '',
      candles,
      count: candles.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('yahoo-finance error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
