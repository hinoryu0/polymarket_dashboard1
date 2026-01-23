import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type WindowType = '1h' | '6h' | '24h';

const WINDOW_HOURS: Record<WindowType, number> = {
  '1h': 1,
  '6h': 6,
  '24h': 24,
};

// Tolerance ranges for each window (in minutes)
const WINDOW_TOLERANCE: Record<WindowType, { min: number; max: number }> = {
  '1h': { min: 45, max: 75 },   // 45-75 minutes ago
  '6h': { min: 300, max: 420 }, // 5-7 hours ago
  '24h': { min: 1320, max: 1560 }, // 22-26 hours ago
};

type SnapshotData = {
  market_id: string;
  latest_price: number | null;
  latest_time: string | null;
  past_price: number | null;
  past_time: string | null;
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
  change_pp: number;    // Probability points: change_abs * 100
  latest_time: string;  // Debug field
  past_time: string;    // Debug field
  age_minutes: number;  // Debug field
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

    // Process snapshots to get latest and past prices per market WITH timestamps
    const marketData = new Map<string, {
      latest: number | null;
      latest_time: string | null;
      past: number | null;
      past_time: string | null;
    }>();

    // Get latest price and timestamp per market (first occurrence in desc order)
    const latestByMarket = new Map<string, { price: number; time: string }>();
    latestSnapshots?.forEach((snap) => {
      if (!latestByMarket.has(snap.market_id) && snap.yes_price !== null) {
        latestByMarket.set(snap.market_id, {
          price: snap.yes_price,
          time: snap.created_at
        });
      }
    });

    // Get past price and timestamp per market (first occurrence in desc order <= target time)
    const pastByMarket = new Map<string, { price: number; time: string }>();
    pastSnapshots?.forEach((snap) => {
      if (!pastByMarket.has(snap.market_id) && snap.yes_price !== null) {
        pastByMarket.set(snap.market_id, {
          price: snap.yes_price,
          time: snap.created_at
        });
      }
    });

    // Combine data
    const allMarketIds = new Set([
      ...Array.from(latestByMarket.keys()),
      ...Array.from(pastByMarket.keys())
    ]);
    allMarketIds.forEach((marketId) => {
      const latest = latestByMarket.get(marketId);
      const past = pastByMarket.get(marketId);

      marketData.set(marketId, {
        latest: latest?.price || null,
        latest_time: latest?.time || null,
        past: past?.price || null,
        past_time: past?.time || null,
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

    // Step 4: Compute movers with tolerance checking
    const movers: MoverData[] = [];
    const tolerance = WINDOW_TOLERANCE[window];

    markets?.forEach((market) => {
      const priceData = marketData.get(market.id);
      if (!priceData) return;

      const { latest, latest_time, past, past_time } = priceData;

      // Skip if missing prices, timestamps, or past_price is 0/null
      if (latest === null || past === null || past === 0) return;
      if (!latest_time || !past_time) return;

      // Calculate age in minutes between snapshots
      const latestDate = new Date(latest_time);
      const pastDate = new Date(past_time);
      const age_minutes = Math.round((latestDate.getTime() - pastDate.getTime()) / 60000);

      // TOLERANCE CHECK: Skip if age is outside the acceptable range for this window
      if (age_minutes < tolerance.min || age_minutes > tolerance.max) {
        return; // Skip this market - data is too old or too recent
      }

      const change_abs = latest - past;
      const change_pct = (change_abs / past) * 100;
      const change_pp = change_abs * 100; // Probability points

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
        change_pp,
        latest_time,  // Debug field
        past_time,    // Debug field
        age_minutes,  // Debug field
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
