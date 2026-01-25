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

// Sports/entertainment keywords to filter out (optional, applied gently)
const EXCLUDED_KEYWORDS = [
  'premier league', 'champions league', 'nba', 'nfl', 'mlb', 'nhl', 'ufc',
  'chelsea', 'arsenal', 'liverpool', 'lakers', 'yankees',
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

// Minimal mover data for cache storage
type MoverCacheItem = {
  market_id: string;
  title: string;
  slug: string | null;
  volume_usd: number;
  latest_price: number;
  past_price: number;
  change_pp: number;
  latest_time: string;
  past_time: string;
  delta_minutes: number;
};

type CacheEntry = {
  window_key: string;
  generated_at: string;
  params: Record<string, unknown>;
  top_gainers: MoverCacheItem[];
  top_losers: MoverCacheItem[];
};

// ============================================================================
// Helper Functions
// ============================================================================

function isExcludedMarket(title: string): boolean {
  const lowerTitle = (title || '').toLowerCase();
  return EXCLUDED_KEYWORDS.some(keyword => lowerTitle.includes(keyword.toLowerCase()));
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
): Promise<{ gainers: MoverCacheItem[]; losers: MoverCacheItem[]; stats: Record<string, number> }> {
  console.log(`\n========== Computing ${config.window_key} movers ==========`);
  console.log(`Window: ${config.window_minutes} minutes, Limit: ${config.limit}`);

  const stats: Record<string, number> = {};

  // Call RPC function
  console.log(`Calling RPC get_movers(${config.window_minutes}, ${config.limit * 5})...`);
  const { data: rpcData, error: rpcError } = await supabase.rpc('get_movers', {
    window_minutes: config.window_minutes,
    limit_n: config.limit * 5,  // Get extra to allow for filtering
  });

  if (rpcError) {
    console.error(`RPC ERROR: ${rpcError.message}`);
    console.error(`RPC error details:`, JSON.stringify(rpcError, null, 2));
    return { gainers: [], losers: [], stats: { rpc_error: 1 } };
  }

  // Debug: Show raw RPC response
  console.log(`RPC response type: ${typeof rpcData}`);
  console.log(`RPC response is array: ${Array.isArray(rpcData)}`);

  const rpcRows: RpcMoverRow[] = Array.isArray(rpcData) ? rpcData : [];
  stats.rpc_total = rpcRows.length;
  console.log(`RPC returned ${rpcRows.length} rows`);

  if (rpcRows.length === 0) {
    console.log('No rows returned from RPC - cache will be empty');
    return { gainers: [], losers: [], stats };
  }

  // Debug: Show first 3 raw RPC rows
  console.log('\nFirst 3 raw RPC rows:');
  for (let i = 0; i < Math.min(3, rpcRows.length); i++) {
    const row = rpcRows[i];
    console.log(`  [${i}] market_id=${row.market_id}, change_pp=${row.change_pp}, yes_now=${row.yes_now}, yes_past=${row.yes_past}`);
  }

  // Filter rows with valid numeric change_pp
  const validRows = rpcRows.filter(row => {
    const cp = Number(row.change_pp);
    return Number.isFinite(cp);
  });
  stats.valid_change_pp = validRows.length;
  console.log(`\nRows with valid numeric change_pp: ${validRows.length}`);

  if (validRows.length === 0) {
    console.log('No valid rows after change_pp validation');
    return { gainers: [], losers: [], stats };
  }

  // Fetch market metadata
  const marketIds = validRows.map(row => row.market_id);
  console.log(`Fetching metadata for ${marketIds.length} markets...`);

  const { data: markets, error: marketsError } = await supabase
    .from('markets')
    .select('id, title, url, volume_usd')
    .in('id', marketIds);

  if (marketsError) {
    console.error(`Markets fetch error: ${marketsError.message}`);
    // Continue without market metadata - use defaults
  }

  const safeMarkets = (markets ?? []) as Market[];
  const marketMap = new Map<string, Market>();
  for (const m of safeMarkets) {
    marketMap.set(m.id, m);
  }
  stats.markets_found = marketMap.size;
  console.log(`Markets with metadata: ${marketMap.size}`);

  // Transform to MoverCacheItem, applying minimal filtering
  const allMovers: MoverCacheItem[] = [];
  let excludedCount = 0;

  for (const row of validRows) {
    const market = marketMap.get(row.market_id);
    const title = market?.title || `Market ${row.market_id.slice(0, 8)}`;

    // Optional: Skip sports (but don't be too aggressive)
    if (market && isExcludedMarket(market.title)) {
      excludedCount++;
      continue;
    }

    const cp = Number(row.change_pp);
    const yesNow = Number(row.yes_now);
    const yesPast = Number(row.yes_past);

    allMovers.push({
      market_id: row.market_id,
      title: title,
      slug: market ? extractSlug(market.url) : null,
      volume_usd: market?.volume_usd ?? 0,
      latest_price: yesNow,
      past_price: yesPast,
      change_pp: cp,
      latest_time: row.latest_time,
      past_time: row.past_time,
      delta_minutes: Number(row.delta_minutes) || 0,
    });
  }

  stats.excluded_sports = excludedCount;
  stats.movers_total = allMovers.length;
  console.log(`\nMovers after processing: ${allMovers.length} (excluded ${excludedCount} sports)`);

  if (allMovers.length === 0) {
    console.log('No movers after processing');
    return { gainers: [], losers: [], stats };
  }

  // Debug: Show first 3 processed movers
  console.log('\nFirst 3 processed movers:');
  for (let i = 0; i < Math.min(3, allMovers.length); i++) {
    const m = allMovers[i];
    console.log(`  [${i}] ${m.market_id.slice(0, 8)}... change_pp=${m.change_pp.toFixed(2)}, yes_now=${m.latest_price.toFixed(3)}, yes_past=${m.past_price.toFixed(3)}`);
  }

  // Count gainers and losers
  const gainersAll = allMovers.filter(m => m.change_pp > 0);
  const losersAll = allMovers.filter(m => m.change_pp < 0);
  stats.gainers_count = gainersAll.length;
  stats.losers_count = losersAll.length;
  console.log(`\nGainers (change_pp > 0): ${gainersAll.length}`);
  console.log(`Losers (change_pp < 0): ${losersAll.length}`);

  // Sort and slice
  let gainers = gainersAll
    .sort((a, b) => b.change_pp - a.change_pp)
    .slice(0, config.limit);

  let losers = losersAll
    .sort((a, b) => a.change_pp - b.change_pp)
    .slice(0, config.limit);

  // FALLBACK: If both empty but movers exist, use abs(change_pp) top movers
  if (gainers.length === 0 && losers.length === 0 && allMovers.length > 0) {
    console.log('\n⚠️ FALLBACK: Using top movers by ABS(change_pp)');
    const topByAbs = allMovers
      .sort((a, b) => Math.abs(b.change_pp) - Math.abs(a.change_pp))
      .slice(0, config.limit * 2);

    gainers = topByAbs.filter(m => m.change_pp > 0).slice(0, config.limit);
    losers = topByAbs.filter(m => m.change_pp < 0).slice(0, config.limit);

    // If still no losers but have positive movers, just show gainers
    if (losers.length === 0 && gainers.length === 0) {
      // Put all in gainers as a last resort
      gainers = topByAbs.slice(0, config.limit);
    }
  }

  stats.final_gainers = gainers.length;
  stats.final_losers = losers.length;

  console.log(`\nFinal arrays: ${gainers.length} gainers, ${losers.length} losers`);

  // Debug: Show what we're writing
  if (gainers.length > 0) {
    console.log('\nTop 3 gainers to write:');
    for (let i = 0; i < Math.min(3, gainers.length); i++) {
      const g = gainers[i];
      console.log(`  [${i}] ${g.market_id.slice(0, 8)}... +${g.change_pp.toFixed(2)}pp "${g.title.slice(0, 40)}"`);
    }
  }
  if (losers.length > 0) {
    console.log('\nTop 3 losers to write:');
    for (let i = 0; i < Math.min(3, losers.length); i++) {
      const l = losers[i];
      console.log(`  [${i}] ${l.market_id.slice(0, 8)}... ${l.change_pp.toFixed(2)}pp "${l.title.slice(0, 40)}"`);
    }
  }

  return { gainers, losers, stats };
}

async function updateCache(
  supabase: AnySupabaseClient,
  entry: CacheEntry
): Promise<boolean> {
  console.log(`\nWriting cache for ${entry.window_key}...`);
  console.log(`  top_gainers.length = ${entry.top_gainers.length}`);
  console.log(`  top_losers.length = ${entry.top_losers.length}`);

  const { error } = await supabase
    .from('movers_cache')
    .upsert(entry, { onConflict: 'window_key' });

  if (error) {
    console.error(`Cache write ERROR: ${error.message}`);
    console.error(`Error details:`, JSON.stringify(error, null, 2));
    return false;
  }

  console.log(`✅ Cache written successfully for ${entry.window_key}`);
  return true;
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  const startTime = Date.now();
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         COMPUTE MOVERS CACHE - DEBUG MODE                  ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`Time: ${new Date().toISOString()}`);

  // Validate environment
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('ERROR: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  console.log(`Supabase URL: ${supabaseUrl.slice(0, 30)}...`);

  const supabase = createClient(supabaseUrl, supabaseKey);

  const results: Array<{ window: string; gainers: number; losers: number; success: boolean }> = [];

  for (const config of WINDOW_CONFIGS) {
    try {
      const windowStart = Date.now();
      const { gainers, losers, stats } = await computeMoversForWindow(supabase, config);

      const cacheEntry: CacheEntry = {
        window_key: config.window_key,
        generated_at: new Date().toISOString(),
        params: {
          window_minutes: config.window_minutes,
          limit_n: config.limit,
          filters_applied: ['48h_scan', 'numeric_validation'],
          stats: stats,
        },
        top_gainers: gainers,
        top_losers: losers,
      };

      const success = await updateCache(supabase, cacheEntry);

      const windowDuration = Date.now() - windowStart;
      console.log(`\n${config.window_key} completed in ${windowDuration}ms`);

      results.push({
        window: config.window_key,
        gainers: gainers.length,
        losers: losers.length,
        success,
      });
    } catch (error) {
      console.error(`\n❌ ERROR computing ${config.window_key}:`, error);
      results.push({
        window: config.window_key,
        gainers: 0,
        losers: 0,
        success: false,
      });
    }
  }

  const totalDuration = Date.now() - startTime;

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                    FINAL SUMMARY                           ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`Total duration: ${totalDuration}ms (${(totalDuration / 1000).toFixed(2)}s)`);
  console.log('\nResults per window:');
  for (const r of results) {
    const status = r.success ? '✅' : '❌';
    console.log(`  ${status} ${r.window}: ${r.gainers} gainers, ${r.losers} losers`);
  }

  // Exit with error if all windows failed
  const anySuccess = results.some(r => r.success && (r.gainers > 0 || r.losers > 0));
  if (!anySuccess) {
    console.log('\n⚠️ WARNING: No movers were cached for any window!');
  }

  process.exit(0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
