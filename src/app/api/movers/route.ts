import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type WindowType = '1h' | '6h' | '24h';

const WINDOW_MINUTES: Record<WindowType, number> = {
  '1h': 60,
  '6h': 360,
  '24h': 1440,
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
  change_pp: number;
  latest_time: string;
  past_time: string;
  delta_minutes: number;
};

type RpcMoverRow = {
  market_id: string;
  latest_time: string;
  past_time: string;
  yes_now: number;
  yes_past: number;
  change_pp: number;
  delta_minutes: number;
};

// Price range filter: exclude markets that are "already decided" (near 0 or 1)
const MIN_PRICE = 0.05; // 5%
const MAX_PRICE = 0.95; // 95%

/**
 * GET /api/movers
 * Returns top gainers/losers based on price changes over time window
 * Uses SQL RPC function for efficient processing across entire price_snapshots table
 * Filters: Excludes markets with latest price < 5% or > 95% (already decided)
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
    const windowMinutes = WINDOW_MINUTES[window];
    const now = new Date();

    // Initialize Supabase client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Call RPC function to compute movers in SQL
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      'get_movers',
      {
        window_minutes: windowMinutes,
        limit_n: limit * 10  // Get more data, we'll split and limit in JS
      }
    ) as { data: RpcMoverRow[] | null; error: any };

    if (rpcError) {
      throw new Error(`RPC error: ${rpcError.message}`);
    }

    if (!rpcData || rpcData.length === 0) {
      console.log(`No movers data returned from RPC for window=${window}`);
      return NextResponse.json({
        window,
        limit,
        generatedAt: now.toISOString(),
        topGainers: [],
        topLosers: [],
      });
    }

    // Fetch market metadata for all markets in results
    const marketIds = rpcData.map(row => row.market_id);
    const { data: markets, error: marketsError } = await supabase
      .from('markets')
      .select('id, title, url, volume_usd')
      .in('id', marketIds);

    if (marketsError) {
      throw new Error(`Failed to fetch market metadata: ${marketsError.message}`);
    }

    // Create market lookup map
    const marketMap = new Map(markets?.map(m => [m.id, m]) || []);

    // Transform RPC results into MoverData format
    const movers: MoverData[] = rpcData
      .map(row => {
        const market = marketMap.get(row.market_id);
        if (!market) return null;

        const change_abs = row.yes_now - row.yes_past;
        const change_pct = (change_abs / row.yes_past) * 100;

        // Extract slug from URL if possible (for backward compatibility)
        let slug: string | null = null;
        if (market.url && market.url.includes('/event/')) {
          const match = market.url.match(/\/event\/([^/?]+)/);
          slug = match ? match[1] : null;
        }

        return {
          market_id: row.market_id,
          title: market.title,
          slug,
          volume_usd: market.volume_usd,
          latest_price: row.yes_now,
          past_price: row.yes_past,
          change_abs,
          change_pct,
          change_pp: row.change_pp,
          latest_time: row.latest_time,
          past_time: row.past_time,
          delta_minutes: row.delta_minutes,
        };
      })
      .filter((m): m is MoverData => m !== null)
      // Filter out "already decided" markets (price < 5% or > 95%)
      // This is a backup filter in case SQL function doesn't have the filter applied
      .filter((m) => m.latest_price >= MIN_PRICE && m.latest_price <= MAX_PRICE);

    // Split into gainers and losers, then limit
    const topGainers = movers
      .filter((m) => m.change_pp > 0)
      .sort((a, b) => b.change_pp - a.change_pp)
      .slice(0, limit);

    const topLosers = movers
      .filter((m) => m.change_pp < 0)
      .sort((a, b) => a.change_pp - b.change_pp)
      .slice(0, limit);

    console.log(
      `Movers computed (SQL RPC) for window=${window}: ` +
      `${movers.length} total (5-95% filter applied), ${topGainers.length} gainers, ${topLosers.length} losers`
    );

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
