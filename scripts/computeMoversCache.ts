/**
 * Compute Movers Cache Script
 *
 * Computes market movers for all time windows and stores results in movers_cache table.
 * This replaces the expensive get_movers() RPC with a pre-computed cache.
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
  window: string;
  windowMinutes: number;
  lookbackHours: number;  // How far back to query snapshots
  minVolume: number;
  toleranceMinutes: number;  // Max allowed deviation from target time
};

const WINDOW_CONFIGS: WindowConfig[] = [
  { window: '1h', windowMinutes: 60, lookbackHours: 3, minVolume: 1000, toleranceMinutes: 90 },
  { window: '6h', windowMinutes: 360, lookbackHours: 12, minVolume: 5000, toleranceMinutes: 180 },
  { window: '24h', windowMinutes: 1440, lookbackHours: 48, minVolume: 15000, toleranceMinutes: 480 },
];

// Filters
const MIN_CHANGE_PP = 10;  // Minimum 10 percentage points change
const MIN_PRICE = 0.05;    // 5%
const MAX_PRICE = 0.95;    // 95%
const RESULTS_LIMIT = 20;  // Top N gainers and losers to store

// Excluded categories (keyword-based since markets table lacks category field)
const EXCLUDED_KEYWORDS = [
  // Sports
  'premier league', 'champions league', 'la liga', 'serie a', 'bundesliga',
  'nba', 'nfl', 'mlb', 'nhl', 'ufc', 'mls', 'epl', 'ucl',
  'world cup', 'euro 2024', 'copa america',
  'chelsea', 'arsenal', 'liverpool', 'man city', 'manchester', 'tottenham',
  'barcelona', 'real madrid', 'bayern', 'juventus', 'psg', 'inter milan',
  'lakers', 'celtics', 'warriors', 'bulls', 'knicks', 'nets',
  'chiefs', 'eagles', 'cowboys', 'patriots', '49ers',
  'yankees', 'dodgers', 'red sox', 'cubs', 'mets',
  'vs.', 'vs ', ' vs ', 'match', 'game ', 'score', 'goals',
  'touchdown', 'playoff', 'finals', 'championship', 'mvp',
  // Entertainment/Celebrity
  'grammy', 'oscar', 'emmy', 'golden globe', 'billboard',
  'kardashian', 'swift', 'beyonce', 'drake', 'kanye',
  'bachelor', 'bachelorette', 'survivor', 'idol',
];

// ============================================================================
// Types
// ============================================================================

type Snapshot = {
  id: string;
  market_id: string;
  yes_price: number;
  volume_usd: number;
  created_at: string;
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
  window_key: string;  // DB column name (window is reserved in Postgres)
  generated_at: string;
  params: {
    min_volume: number;
    min_change_pp: number;
    min_price: number;
    max_price: number;
    lookback_hours: number;
    tolerance_minutes: number;
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
): Promise<{ gainers: MoverData[]; losers: MoverData[]; stats: { snapshotsFetched: number; marketsProcessed: number } }> {
  const now = new Date();
  const lookbackTime = new Date(now.getTime() - config.lookbackHours * 60 * 60 * 1000);
  const targetTime = new Date(now.getTime() - config.windowMinutes * 60 * 1000);
  const toleranceMs = config.toleranceMinutes * 60 * 1000;

  console.log(`\n--- Computing ${config.window} movers ---`);
  console.log(`Lookback: ${config.lookbackHours}h (since ${lookbackTime.toISOString()})`);
  console.log(`Target time: ${targetTime.toISOString()} (±${config.toleranceMinutes}min tolerance)`);
  console.log(`Min volume: $${config.minVolume}`);

  // Fetch snapshots within lookback window (paginated)
  const allSnapshots: Snapshot[] = [];
  let offset = 0;
  const batchSize = 5000;

  while (true) {
    const { data: batch, error } = await supabase
      .from('price_snapshots')
      .select('id, market_id, yes_price, volume_usd, created_at')
      .gte('created_at', lookbackTime.toISOString())
      .not('yes_price', 'is', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + batchSize - 1);

    if (error) {
      throw new Error(`Failed to fetch snapshots: ${error.message}`);
    }

    if (!batch || batch.length === 0) break;

    allSnapshots.push(...(batch as Snapshot[]));
    offset += batchSize;

    if (batch.length < batchSize) break;
  }

  console.log(`Snapshots fetched: ${allSnapshots.length}`);

  if (allSnapshots.length === 0) {
    return { gainers: [], losers: [], stats: { snapshotsFetched: 0, marketsProcessed: 0 } };
  }

  // Group snapshots by market_id
  const snapshotsByMarket = new Map<string, Snapshot[]>();
  for (const snap of allSnapshots) {
    if (!snapshotsByMarket.has(snap.market_id)) {
      snapshotsByMarket.set(snap.market_id, []);
    }
    snapshotsByMarket.get(snap.market_id)!.push(snap);
  }

  console.log(`Unique markets: ${snapshotsByMarket.size}`);

  // Fetch market metadata
  const marketIds = Array.from(snapshotsByMarket.keys());
  const marketMap = new Map<string, Market>();

  // Fetch in batches of 500
  for (let i = 0; i < marketIds.length; i += 500) {
    const batchIds = marketIds.slice(i, i + 500);
    const { data: markets, error: marketsError } = await supabase
      .from('markets')
      .select('id, title, url, volume_usd')
      .in('id', batchIds);

    if (marketsError) {
      console.warn(`Warning: Failed to fetch market batch: ${marketsError.message}`);
      continue;
    }

    // Explicitly type the markets array to avoid TypeScript 'never' inference
    const safeMarkets = (markets ?? []) as Market[];
    for (const m of safeMarkets) {
      marketMap.set(m.id, m);
    }
  }

  console.log(`Markets with metadata: ${marketMap.size}`);

  // Compute movers
  const movers: MoverData[] = [];

  for (const [marketId, snapshots] of Array.from(snapshotsByMarket.entries())) {
    const market = marketMap.get(marketId);
    if (!market) continue;

    // Skip excluded categories
    if (isExcludedMarket(market.title, market.url)) continue;

    // Sort snapshots by time (newest first)
    snapshots.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // Get latest snapshot
    const latestSnap = snapshots[0];
    if (!latestSnap || latestSnap.yes_price === null) continue;

    // Check volume threshold
    const volume = latestSnap.volume_usd ?? market.volume_usd ?? 0;
    if (volume < config.minVolume) continue;

    // Check price range
    if (latestSnap.yes_price < MIN_PRICE || latestSnap.yes_price > MAX_PRICE) continue;

    // Find snapshot closest to target time (within tolerance)
    let pastSnap: Snapshot | null = null;
    let minDiff = Infinity;

    for (const snap of snapshots) {
      if (snap.id === latestSnap.id) continue;
      const snapTime = new Date(snap.created_at).getTime();
      const diff = Math.abs(snapTime - targetTime.getTime());

      if (diff <= toleranceMs && diff < minDiff) {
        minDiff = diff;
        pastSnap = snap;
      }
    }

    if (!pastSnap || pastSnap.yes_price === null || pastSnap.yes_price <= 0) continue;

    // Compute change
    const changePp = (latestSnap.yes_price - pastSnap.yes_price) * 100;

    // Check minimum change threshold
    if (Math.abs(changePp) < MIN_CHANGE_PP) continue;

    const latestTime = new Date(latestSnap.created_at);
    const pastTime = new Date(pastSnap.created_at);
    const deltaMinutes = Math.round((latestTime.getTime() - pastTime.getTime()) / 60000);

    movers.push({
      market_id: marketId,
      title: market.title,
      slug: extractSlug(market.url),
      volume_usd: volume,
      latest_price: latestSnap.yes_price,
      past_price: pastSnap.yes_price,
      change_abs: latestSnap.yes_price - pastSnap.yes_price,
      change_pct: ((latestSnap.yes_price - pastSnap.yes_price) / pastSnap.yes_price) * 100,
      change_pp: changePp,
      latest_time: latestSnap.created_at,
      past_time: pastSnap.created_at,
      delta_minutes: deltaMinutes,
    });
  }

  console.log(`Movers after filters: ${movers.length}`);

  // Split into gainers and losers
  const gainers = movers
    .filter(m => m.change_pp > 0)
    .sort((a, b) => b.change_pp - a.change_pp)
    .slice(0, RESULTS_LIMIT);

  const losers = movers
    .filter(m => m.change_pp < 0)
    .sort((a, b) => a.change_pp - b.change_pp)
    .slice(0, RESULTS_LIMIT);

  console.log(`Top gainers: ${gainers.length}, Top losers: ${losers.length}`);

  return {
    gainers,
    losers,
    stats: {
      snapshotsFetched: allSnapshots.length,
      marketsProcessed: snapshotsByMarket.size,
    },
  };
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

  const results: { window: string; gainers: number; losers: number; snapshotsFetched: number; marketsProcessed: number }[] = [];

  for (const config of WINDOW_CONFIGS) {
    try {
      const windowStart = Date.now();
      const { gainers, losers, stats } = await computeMoversForWindow(supabase, config);

      const cacheEntry: CacheEntry = {
        window_key: config.window,
        generated_at: new Date().toISOString(),
        params: {
          min_volume: config.minVolume,
          min_change_pp: MIN_CHANGE_PP,
          min_price: MIN_PRICE,
          max_price: MAX_PRICE,
          lookback_hours: config.lookbackHours,
          tolerance_minutes: config.toleranceMinutes,
        },
        top_gainers: gainers,
        top_losers: losers,
      };

      await updateCache(supabase, cacheEntry);

      const windowDuration = Date.now() - windowStart;
      console.log(`Cache updated for ${config.window} in ${windowDuration}ms`);

      results.push({
        window: config.window,
        gainers: gainers.length,
        losers: losers.length,
        snapshotsFetched: stats.snapshotsFetched,
        marketsProcessed: stats.marketsProcessed,
      });
    } catch (error) {
      console.error(`ERROR computing ${config.window}:`, error);
    }
  }

  const totalDuration = Date.now() - startTime;

  console.log('\n=== Compute Movers Cache Complete ===');
  console.log(`Total duration: ${totalDuration}ms (${(totalDuration / 1000).toFixed(2)}s)`);
  console.log('\nResults:');
  for (const r of results) {
    console.log(`  ${r.window}: ${r.gainers} gainers, ${r.losers} losers (${r.snapshotsFetched} snapshots, ${r.marketsProcessed} markets)`);
  }

  process.exit(0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
