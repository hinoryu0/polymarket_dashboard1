import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type WindowType = '1h' | '6h' | '24h';

const WINDOW_HOURS: Record<WindowType, number> = {
  '1h': 1,
  '6h': 6,
  '24h': 24,
};

type SnapshotData = {
  market_id: string;
  latest_price: number | null;
  past_price: number | null;
  title: string;
  slug: string | null;
  volume_usd: number | null;
};

type MoverData = {
  market_id: string;
  title: string;
  slug: string | null;
  volume_usd: number | null;
  latest_price: number;
  past_price: number;
  change_abs: number;
  change_pct: number;
};

/**
 * GET /api/movers
 * Returns top gainers/losers based on price changes over time window
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const windowParam = searchParams.get('window') || '24h';
    const limitParam = searchParams.get('limit') || '10';

    // Validate window
    if (!['1h', '6h', '24h'].includes(windowParam)) {
      return NextResponse.json(
        { error: 'Invalid window parameter. Must be 1h, 6h, or 24h.' },
        { status: 400 }
      );
    }

    // Validate limit
    const limit = parseInt(limitParam, 10);
    if (isNaN(limit) || limit < 1 || limit > 50) {
      return NextResponse.json(
        { error: 'Invalid limit parameter. Must be between 1 and 50.' },
        { status: 400 }
      );
    }

    const window = windowParam as WindowType;
    const hoursAgo = WINDOW_HOURS[window];

    // Calculate target time (window ago)
    const now = new Date();
    const targetTime = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);

    // Initialize Supabase client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Step 1: Get latest snapshot per market (most recent yes_price)
    const { data: latestSnapshots, error: latestError } = await supabase
      .from('price_snapshots')
      .select('market_id, yes_price, created_at')
      .not('yes_price', 'is', null)
      .order('created_at', { ascending: false });

    if (latestError) {
      throw new Error(`Failed to fetch latest snapshots: ${latestError.message}`);
    }

    // Step 2: Get past snapshots (closest to target time, but not after)
    const { data: pastSnapshots, error: pastError } = await supabase
      .from('price_snapshots')
      .select('market_id, yes_price, created_at')
      .not('yes_price', 'is', null)
      .lte('created_at', targetTime.toISOString())
      .order('created_at', { ascending: false });

    if (pastError) {
      throw new Error(`Failed to fetch past snapshots: ${pastError.message}`);
    }

    // Process snapshots to get latest and past prices per market
    const marketData = new Map<string, { latest: number | null; past: number | null }>();

    // Get latest price per market (first occurrence in desc order)
    const latestByMarket = new Map<string, number>();
    latestSnapshots?.forEach((snap) => {
      if (!latestByMarket.has(snap.market_id) && snap.yes_price !== null) {
        latestByMarket.set(snap.market_id, snap.yes_price);
      }
    });

    // Get past price per market (first occurrence in desc order <= target time)
    const pastByMarket = new Map<string, number>();
    pastSnapshots?.forEach((snap) => {
      if (!pastByMarket.has(snap.market_id) && snap.yes_price !== null) {
        pastByMarket.set(snap.market_id, snap.yes_price);
      }
    });

    // Combine data
    const allMarketIds = new Set([
      ...Array.from(latestByMarket.keys()),
      ...Array.from(pastByMarket.keys())
    ]);
    allMarketIds.forEach((marketId) => {
      marketData.set(marketId, {
        latest: latestByMarket.get(marketId) || null,
        past: pastByMarket.get(marketId) || null,
      });
    });

    // Step 3: Fetch market metadata for all markets with price data
    const marketIds = Array.from(marketData.keys());
    const { data: markets, error: marketsError } = await supabase
      .from('markets')
      .select('id, title, url, volume_usd')
      .in('id', marketIds);

    if (marketsError) {
      throw new Error(`Failed to fetch market metadata: ${marketsError.message}`);
    }

    // Step 4: Compute movers
    const movers: MoverData[] = [];

    markets?.forEach((market) => {
      const priceData = marketData.get(market.id);
      if (!priceData) return;

      const { latest, past } = priceData;

      // Skip if missing prices or past_price is 0/null
      if (latest === null || past === null || past === 0) return;

      const change_abs = latest - past;
      const change_pct = (change_abs / past) * 100;

      // Extract slug from URL if possible (for backward compatibility)
      let slug: string | null = null;
      if (market.url && market.url.includes('/event/')) {
        const match = market.url.match(/\/event\/([^/?]+)/);
        slug = match ? match[1] : null;
      }

      movers.push({
        market_id: market.id,
        title: market.title,
        slug,
        volume_usd: market.volume_usd,
        latest_price: latest,
        past_price: past,
        change_abs,
        change_pct,
      });
    });

    // Step 5: Sort and limit
    const topGainers = movers
      .filter((m) => m.change_abs > 0)
      .sort((a, b) => b.change_abs - a.change_abs)
      .slice(0, limit);

    const topLosers = movers
      .filter((m) => m.change_abs < 0)
      .sort((a, b) => a.change_abs - b.change_abs)
      .slice(0, limit);

    console.log(`Movers computed for window=${window}, markets=${movers.length}`);

    return NextResponse.json({
      window,
      limit,
      generatedAt: now.toISOString(),
      topGainers,
      topLosers,
    });
  } catch (error) {
    console.error('Error in /api/movers:', error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to compute movers',
      },
      { status: 500 }
    );
  }
}
