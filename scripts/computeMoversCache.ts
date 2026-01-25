/**
 * Compute Movers Cache Script
 *
 * Calls the optimized get_movers() RPC function and stores results in movers_cache table.
 * The RPC function only scans last 48 hours of snapshots (matching retention policy).
 *
 * Run by GitHub Actions every 15 minutes after snapshot ingestion.
 *
 * Usage:
 *   npm run compute-movers-cache
 *   # or directly:
 *   tsx scripts/computeMoversCache.ts
 *
 * Environment variables required:
 *   SUPABASE_URL - Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY - Service role key (for write access)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Use a generic Supabase client type to avoid strict schema inference issues
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any, any, any>;

// ============================================================================
// Configuration
// ============================================================================

type WindowConfig = {
  window_key: string;
  window_minutes: number;
  limit: number;
};

const WINDOW_CONFIGS: WindowConfig[] = [
  { window_key: '1h', window_minutes: 60, limit: 20 },
  { window_key: '6h', window_minutes: 360, limit: 20 },
  { window_key: '24h', window_minutes: 1440, limit: 20 },
];

// Sports/entertainment keywords to filter out
const EXCLUDED_KEYWORDS = [
  'premier league', 'champions league', 'la liga', 'serie a', 'bundesliga',
  'nba', 'nfl', 'mlb', 'nhl', 'ufc', 'mls', 'epl', 'ucl',
  'world cup', 'euro 2024', 'copa america',
  'chelsea', 'arsenal', 'liverpool', 'man city', 'manchester', 'tottenham',
  'barcelona', 'real madrid', 'bayern', 'juventus', 'psg', 'inter milan',
  'lakers', 'celtics', 'warriors', 'bulls', 'knicks', 'nets',
  'chiefs', 'eagles', 'cowboys', 'patriots', '49ers',
  'yankees', 'dodgers', 'red sox', 'cubs', 'mets',
  'vs.', 'vs ', ' vs ', 'match', 'game ', 'score', 'goals',
  'grammy', 'oscar', 'emmy', 'golden globe', 'billboard',
  'kardashian', 'swift', 'beyonce', 'drake', 'kanye',
];

// ============================================================================
// Types
// ============================================================================

type RpcMoverRow = {
  market_id: string;
  latest_time: string;
  past_time: string;
  yes_now: number;
  yes_past: number;
  change_pp: number;
  delta_minutes: number;
};

type Market = {
  id: string;
  title: string;
  url: string;
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
  change_pp: number;
  latest_time: string;
  past_time: string;
  delta_minutes: number;
};

type CacheEntry = {
  window_key: string;
  generated_at: string;
  params: {
    window_minutes: number;
    limit: number;
    filters: string[];
  };
  top_gainers: MoverData[];
  top_losers: MoverData[];
};

// ============================================================================
// Helper Functions
// ============================================================================

function isExcludedMarket(title: string, url: string): boolean {
  const textToCheck = `${title} ${url}`.toLowerCase();
  return EXCLUDED_KEYWORDS.some(keyword => textToCheck.includes(keyword.toLowerCase()));
}

function extractSlug(url: string): string | null {
  if (url && url.includes('/event/')) {
    const match = url.match(/\/event\/([^/?]+)/);
    return match ? match[1] : null;
  }
  return null;
}

// ============================================================================
// Main Computation Logic
// ============================================================================

async function computeMoversForWindow(
  supabase: AnySupabaseClient,
  config: WindowConfig
): Promise<{ gainers: MoverData[]; losers: MoverData[]; rpcCount: number }> {
  console.log(`\n--- Computing ${config.window_key} movers ---`);
  console.log(`Window: ${config.window_minutes} minutes, Limit: ${config.limit}`);

  // Call optimized RPC function (only scans last 48h)
  const { data: rpcData, error: rpcError } = await supabase.rpc('get_movers', {
    window_minutes: config.window_minutes,
    limit_n: config.limit * 3,  // Get extra to allow for filtering
  });

  if (rpcError) {
    console.error(`RPC error for ${config.window_key}: ${rpcError.message}`);
    return { gainers: [], losers: [], rpcCount: 0 };
  }

  const rpcRows = (rpcData ?? []) as RpcMoverRow[];
  console.log(`RPC returned: ${rpcRows.length} rows`);

  if (rpcRows.length === 0) {
    return { gainers: [], losers: [], rpcCount: 0 };
  }

  // Fetch market metadata for all markets
  const marketIds = rpcRows.map(row => row.market_id);
  const { data: markets, error: marketsError } = await supabase
    .from('markets')
    .select('id, title, url, volume_usd')
    .in('id', marketIds);

  if (marketsError) {
    console.error(`Failed to fetch markets: ${marketsError.message}`);
    return { gainers: [], losers: [], rpcCount: rpcRows.length };
  }

  const safeMarkets = (markets ?? []) as Market[];
  const marketMap = new Map<string, Market>();
  for (const m of safeMarkets) {
    marketMap.set(m.id, m);
  }

  console.log(`Markets with metadata: ${marketMap.size}`);

  // Transform RPC results into MoverData, filtering out excluded categories
  const movers: MoverData[] = [];
  for (const row of rpcRows) {
    const market = marketMap.get(row.market_id);
    if (!market) continue;

    // Skip excluded categories (sports, entertainment)
    if (isExcludedMarket(market.title, market.url)) continue;

    movers.push({
      market_id: row.market_id,
      title: market.title,
      slug: extractSlug(market.url),
      volume_usd: market.volume_usd,
      latest_price: row.yes_now,
      past_price: row.yes_past,
      change_abs: row.yes_now - row.yes_past,
      change_pct: row.yes_past > 0 ? ((row.yes_now - row.yes_past) / row.yes_past) * 100 : 0,
      change_pp: row.change_pp,
      latest_time: row.latest_time,
      past_time: row.past_time,
      delta_minutes: row.delta_minutes,
    });
  }

  console.log(`Movers after category filter: ${movers.length}`);

  // Split into gainers and losers
  const gainers = movers
    .filter(m => m.change_pp > 0)
    .sort((a, b) => b.change_pp - a.change_pp)
    .slice(0, config.limit);

  const losers = movers
    .filter(m => m.change_pp < 0)
    .sort((a, b) => a.change_pp - b.change_pp)
    .slice(0, config.limit);

  console.log(`Gainers: ${gainers.length}, Losers: ${losers.length}`);

  return { gainers, losers, rpcCount: rpcRows.length };
}

async function updateCache(
  supabase: AnySupabaseClient,
  entry: CacheEntry
): Promise<void> {
  const { error } = await supabase
    .from('movers_cache')
    .upsert(entry, { onConflict: 'window_key' });

  if (error) {
    throw new Error(`Failed to update cache for ${entry.window_key}: ${error.message}`);
  }
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  const startTime = Date.now();
  console.log('=== Compute Movers Cache Started ===');
  console.log(`Time: ${new Date().toISOString()}`);

  // Validate environment
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('ERROR: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const results: Array<{ window: string; gainers: number; losers: number; rpcCount: number }> = [];

  for (const config of WINDOW_CONFIGS) {
    try {
      const windowStart = Date.now();
      const { gainers, losers, rpcCount } = await computeMoversForWindow(supabase, config);

      const cacheEntry: CacheEntry = {
        window_key: config.window_key,
        generated_at: new Date().toISOString(),
        params: {
          window_minutes: config.window_minutes,
          limit: config.limit,
          filters: ['48h_retention', '10pp_min', '5-95%_price', 'volume_threshold', 'no_sports'],
        },
        top_gainers: gainers,
        top_losers: losers,
      };

      await updateCache(supabase, cacheEntry);

      const windowDuration = Date.now() - windowStart;
      console.log(`Cache updated for ${config.window_key} in ${windowDuration}ms`);

      results.push({
        window: config.window_key,
        gainers: gainers.length,
        losers: losers.length,
        rpcCount,
      });
    } catch (error) {
      console.error(`ERROR computing ${config.window_key}:`, error);
      results.push({
        window: config.window_key,
        gainers: 0,
        losers: 0,
        rpcCount: 0,
      });
    }
  }

  const totalDuration = Date.now() - startTime;

  console.log('\n=== Compute Movers Cache Complete ===');
  console.log(`Total duration: ${totalDuration}ms (${(totalDuration / 1000).toFixed(2)}s)`);
  console.log('\nResults:');
  for (const r of results) {
    console.log(`  ${r.window}: ${r.gainers} gainers, ${r.losers} losers (RPC returned ${r.rpcCount} rows)`);
  }

  process.exit(0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
