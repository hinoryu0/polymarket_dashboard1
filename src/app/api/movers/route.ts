import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type WindowType = '1h' | '6h' | '24h';

type MoverData = {
  market_id: string;
  title: string;
  slug: string | null;
  volume_usd: number | null;
  latest_price: number;
  past_price: number;
  change_abs: number;
  change_pct: number;
  change_pp: number;
  latest_time: string;
  past_time: string;
  delta_minutes: number;
};

type CacheRow = {
  window_key: string;
  generated_at: string;
  params: Record<string, unknown>;
  top_gainers: MoverData[];
  top_losers: MoverData[];
};

// Cache staleness threshold (30 minutes)
const CACHE_STALE_THRESHOLD_MS = 30 * 60 * 1000;

/**
 * GET /api/movers
 * Returns top gainers/losers based on price changes over time window
 * Reads ONLY from pre-computed movers_cache table (updated every 15 minutes)
 *
 * This endpoint does NOT call any RPC or compute movers on-demand.
 * If cache is missing or empty, it returns an error.
 *
 * Filters applied during cache computation:
 * - Time range: Only last 48 hours of snapshots
 * - Big moves: abs(change_pp) >= 10 (at least 10pp movement)
 * - Volume: Window-dependent minimum ($1k/1h, $5k/6h, $15k/24h)
 * - Price range: 5-95% (excludes "already decided" markets)
 * - Category: Excludes sports, entertainment, celebrity markets
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
    const now = new Date();

    // Initialize Supabase client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Read from movers_cache ONLY (no RPC calls)
    const { data: cacheData, error: cacheError } = await supabase
      .from('movers_cache')
      .select('*')
      .eq('window_key', window)
      .single();

    // Handle cache miss
    if (cacheError) {
      if (cacheError.code === 'PGRST116') {
        console.log(`Cache miss for window=${window}`);
        return NextResponse.json({
          window,
          limit,
          generatedAt: null,
          topGainers: [],
          topLosers: [],
          error: 'cache_missing',
          message: `No cached data for ${window} window. Cache is updated every 15 minutes.`,
        });
      }
      throw new Error(`Cache read error: ${cacheError.message}`);
    }

    const cache = cacheData as CacheRow;

    // Check if cache has data
    const hasGainers = cache.top_gainers && cache.top_gainers.length > 0;
    const hasLosers = cache.top_losers && cache.top_losers.length > 0;

    if (!hasGainers && !hasLosers) {
      console.log(`Cache empty for window=${window}`);
      return NextResponse.json({
        window,
        limit,
        generatedAt: cache.generated_at,
        topGainers: [],
        topLosers: [],
        error: 'cache_empty',
        message: `Cache exists but contains no movers for ${window} window. This may indicate insufficient price movements or data.`,
      });
    }

    // Check if cache is stale
    const cacheAge = now.getTime() - new Date(cache.generated_at).getTime();
    const isStale = cacheAge > CACHE_STALE_THRESHOLD_MS;

    // Apply limit to results
    const topGainers = (cache.top_gainers || []).slice(0, limit);
    const topLosers = (cache.top_losers || []).slice(0, limit);

    console.log(
      `Movers from cache for window=${window}: ` +
      `${topGainers.length} gainers, ${topLosers.length} losers, ` +
      `cache age: ${Math.round(cacheAge / 1000)}s${isStale ? ' (STALE)' : ''}`
    );

    const response: Record<string, unknown> = {
      window,
      limit,
      generatedAt: cache.generated_at,
      topGainers,
      topLosers,
    };

    if (isStale) {
      response.warning = 'cache_stale';
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in /api/movers:', error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to fetch movers',
      },
      { status: 500 }
    );
  }
}
