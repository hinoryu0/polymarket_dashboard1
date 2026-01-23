import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type WindowType = '1h' | '6h' | '24h';

const WINDOW_HOURS: Record<WindowType, number> = {
  '1h': 1,
  '6h': 6,
  '24h': 24,
};

// Tolerance ranges for finding past snapshot (in minutes)
// How far from targetTime we'll accept a snapshot
const WINDOW_TOLERANCE: Record<WindowType, number> = {
  '1h': 30,    // +/- 30 minutes for 1h window
  '6h': 120,   // +/- 2 hours for 6h window
  '24h': 360,  // +/- 6 hours for 24h window
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
    const debugMarketId = searchParams.get('debugMarketId'); // Optional debug param

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
    const toleranceMinutes = WINDOW_TOLERANCE[window];
    const now = new Date();

    // Initialize Supabase client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch all snapshots from recent history (cover up to 48h to handle 24h window + buffer)
    // This prevents loading too much data while ensuring we have enough history
    const lookbackHours = Math.max(hoursAgo * 2, 48); // At least 48h lookback
    const oldestTime = new Date(now.getTime() - lookbackHours * 60 * 60 * 1000);

    const { data: snapshots, error: snapshotsError } = await supabase
      .from('price_snapshots')
      .select('market_id, yes_price, created_at')
      .not('yes_price', 'is', null)
      .gte('created_at', oldestTime.toISOString())
      .order('created_at', { ascending: false });

    if (snapshotsError) {
      throw new Error(`Failed to fetch snapshots: ${snapshotsError.message}`);
    }

    if (!snapshots || snapshots.length === 0) {
      console.warn('No snapshots found in database');
      return NextResponse.json({
        window,
        limit,
        generatedAt: now.toISOString(),
        topGainers: [],
        topLosers: [],
      });
    }

    // Group snapshots by market_id
    const snapshotsByMarket = new Map<string, Array<{ yes_price: number; created_at: string }>>();
    snapshots.forEach((snap) => {
      if (snap.yes_price === null) return;

      if (!snapshotsByMarket.has(snap.market_id)) {
        snapshotsByMarket.set(snap.market_id, []);
      }
      snapshotsByMarket.get(snap.market_id)!.push({
        yes_price: snap.yes_price,
        created_at: snap.created_at,
      });
    });

    // Process each market to find latest and closest past snapshot
    const marketData = new Map<string, {
      latest: number;
      latest_time: string;
      past: number;
      past_time: string;
    }>();

    snapshotsByMarket.forEach((marketSnapshots, marketId) => {
      if (marketSnapshots.length === 0) return;

      // Sort by time descending (most recent first)
      marketSnapshots.sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      // Latest snapshot is the first one (most recent)
      const latest = marketSnapshots[0];
      const latestTime = new Date(latest.created_at);

      // Calculate target time for this specific market
      const targetTime = new Date(latestTime.getTime() - hoursAgo * 60 * 60 * 1000);
      const targetTimeMs = targetTime.getTime();
      const toleranceMs = toleranceMinutes * 60 * 1000;

      // Find snapshot closest to targetTime (minimum absolute difference)
      let closestSnapshot: typeof marketSnapshots[0] | null = null;
      let minTimeDiff = Infinity;

      for (const snap of marketSnapshots) {
        const snapTime = new Date(snap.created_at).getTime();
        const timeDiff = Math.abs(snapTime - targetTimeMs);

        if (timeDiff < minTimeDiff) {
          minTimeDiff = timeDiff;
          closestSnapshot = snap;
        }
      }

      // Check if closest snapshot is within tolerance
      if (closestSnapshot && minTimeDiff <= toleranceMs) {
        // Debug logging for specific market
        if (debugMarketId && marketId === debugMarketId) {
          console.log(`\n=== DEBUG: Market ${marketId} ===`);
          console.log(`Latest snapshot: ${latest.created_at} (price: ${latest.yes_price})`);
          console.log(`Target time: ${targetTime.toISOString()} (${hoursAgo}h ago from latest)`);
          console.log(`Closest past snapshot: ${closestSnapshot.created_at} (price: ${closestSnapshot.yes_price})`);
          console.log(`Time difference: ${Math.round(minTimeDiff / 60000)} minutes (tolerance: ${toleranceMinutes} min)`);
          console.log(`Change: ${((latest.yes_price - closestSnapshot.yes_price) * 100).toFixed(2)} pp`);
        }

        marketData.set(marketId, {
          latest: latest.yes_price,
          latest_time: latest.created_at,
          past: closestSnapshot.yes_price,
          past_time: closestSnapshot.created_at,
        });
      } else {
        // Debug logging for skipped market
        if (debugMarketId && marketId === debugMarketId) {
          console.log(`\n=== DEBUG: Market ${marketId} (SKIPPED) ===`);
          console.log(`Latest snapshot: ${latest.created_at} (price: ${latest.yes_price})`);
          console.log(`Target time: ${targetTime.toISOString()} (${hoursAgo}h ago from latest)`);
          console.log(`Closest snapshot found: ${closestSnapshot?.created_at || 'none'}`);
          console.log(`Time difference: ${Math.round(minTimeDiff / 60000)} minutes (tolerance: ${toleranceMinutes} min)`);
          console.log(`REASON: No snapshot within tolerance window`);
        }
      }
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

      const { latest, latest_time, past, past_time } = priceData;

      // Skip if past_price is 0 (would cause divide by zero)
      if (past === 0) return;

      // Calculate age in minutes between snapshots
      const latestDate = new Date(latest_time);
      const pastDate = new Date(past_time);
      const age_minutes = Math.round((latestDate.getTime() - pastDate.getTime()) / 60000);

      const change_abs = latest - past;
      const change_pct = (change_abs / past) * 100;
      const change_pp = change_abs * 100; // Probability points (change in percentage points)

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

    // Step 5: Sort by change_pp (percentage points) and limit
    const topGainers = movers
      .filter((m) => m.change_pp > 0)
      .sort((a, b) => b.change_pp - a.change_pp)
      .slice(0, limit);

    const topLosers = movers
      .filter((m) => m.change_pp < 0)
      .sort((a, b) => a.change_pp - b.change_pp)
      .slice(0, limit);

    console.log(`Movers computed for window=${window}, total_markets_with_data=${movers.length}, gainers=${topGainers.length}, losers=${topLosers.length}`);

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
