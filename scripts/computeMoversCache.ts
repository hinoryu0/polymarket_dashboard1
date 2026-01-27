/**
 * Compute Movers Cache Script (NO RPC VERSION)
 *
 * Computes movers directly in Node.js by querying price_snapshots table.
 * Does NOT use the get_movers() RPC function (avoids Supabase Free plan timeouts).
 *
 * Key constraints:
 * - Queries only last 48 hours of data
 * - Past snapshot matching: ±30 minute tolerance from target time
 * - Limit: 10 gainers + 10 losers per window
 *
 * Algorithm:
 * 1. Fetch latest snapshots (last 3 hours) -> reduce to one per market
 * 2. Fetch past snapshots (capped at 48h) -> find closest to target_time per market
 * 3. Reject past snapshots outside ±30 min tolerance
 * 4. Calculate change_pp, apply filters (price range, volume, min change)
 * 5. Enrich with market metadata
 * 6. Apply category exclusion
 * 7. Sort and slice to top 10 gainers/losers
 * 8. Upsert to movers_cache (only if we have movers, else preserve cache)
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
  min_volume_usd: number;
  limit: number;
};

const WINDOW_CONFIGS: WindowConfig[] = [
  { window_key: '1h', window_minutes: 60, min_volume_usd: 1000, limit: 10 },
  { window_key: '6h', window_minutes: 360, min_volume_usd: 5000, limit: 10 },
  { window_key: '24h', window_minutes: 1440, min_volume_usd: 15000, limit: 10 },
];

// Price range filter: only show markets not "already decided"
const MIN_PRICE = 0.05;
const MAX_PRICE = 0.95;

// Big moves only: at least 10 percentage points
const MIN_CHANGE_PP = 10;

// Tolerance for past snapshot matching: ±30 minutes
const PAST_SNAPSHOT_TOLERANCE_MINUTES = 30;

// Maximum data scope: 48 hours (in minutes)
const MAX_DATA_SCOPE_MINUTES = 48 * 60; // 2880 minutes

// Sports/entertainment keywords to filter out (ONLY specific league/team names)
const EXCLUDED_KEYWORDS = [
  // Leagues only
  'premier league', 'champions league', 'la liga', 'serie a', 'bundesliga',
  'nba', 'nfl', 'mlb', 'nhl', 'ufc', 'mls',
  // Teams only (specific names)
  'chelsea', 'arsenal', 'liverpool', 'man city', 'tottenham',
  'lakers', 'celtics', 'warriors', 'yankees', 'dodgers',
];

// ============================================================================
// Types
// ============================================================================

type Snapshot = {
  market_id: string;
  created_at: string;
  yes_price: number;
  volume_usd: number | null;
};

type Market = {
  id: string;
  title: string;
  url: string;
  volume_usd: number | null;
};

type MoverCandidate = {
  market_id: string;
  latest_time: Date;
  past_time: Date;
  yes_now: number;
  yes_past: number;
  change_pp: number;
  delta_minutes: number;
  volume_usd: number;
};

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

type ComputeResult = {
  gainers: MoverCacheItem[];
  losers: MoverCacheItem[];
  stats: Record<string, number>;
  error: boolean;
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
// Data Fetching Functions
// ============================================================================

/**
 * Fetch latest snapshot per market (within last 3 hours)
 */
async function fetchLatestSnapshots(
  supabase: AnySupabaseClient
): Promise<{ snapshots: Map<string, Snapshot>; error: boolean }> {
  const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();

  console.log(`  Fetching snapshots since ${threeHoursAgo}...`);

  const { data, error } = await supabase
    .from('price_snapshots')
    .select('market_id, created_at, yes_price, volume_usd')
    .gt('created_at', threeHoursAgo)
    .order('created_at', { ascending: false });

  if (error) {
    console.error(`  ERROR fetching latest snapshots: ${error.message}`);
    return { snapshots: new Map(), error: true };
  }

  const rows = (data || []) as Snapshot[];
  console.log(`  Fetched ${rows.length} snapshots from last 3 hours`);

  // Reduce to latest per market
  const latestMap = new Map<string, Snapshot>();
  for (const row of rows) {
    if (!latestMap.has(row.market_id)) {
      latestMap.set(row.market_id, row);
    }
  }

  console.log(`  Unique markets with latest snapshot: ${latestMap.size}`);
  return { snapshots: latestMap, error: false };
}

/**
 * Fetch past snapshots for finding historical prices
 * Query snapshots within (window_minutes + 360) minutes to have enough data
 * Capped at MAX_DATA_SCOPE_MINUTES (48 hours) to limit query scope
 * 
 * OPTIMIZATION: Only fetches snapshots for markets that have a latest snapshot.
 * This dramatically reduces query size from millions to thousands of rows.
 */
async function fetchPastSnapshots(
  supabase: AnySupabaseClient,
  windowMinutes: number,
  marketIds: string[]
): Promise<{ snapshots: Snapshot[]; error: boolean }> {
  if (marketIds.length === 0) {
    console.log('  No market IDs to fetch past snapshots for');
    return { snapshots: [], error: false };
  }

  // Fetch snapshots from window_minutes + 6 hours ago to have enough range
  // Cap at 48 hours max to avoid querying too much data
  const rawLookbackMinutes = windowMinutes + 360;
  const lookbackMinutes = Math.min(rawLookbackMinutes, MAX_DATA_SCOPE_MINUTES);
  const cutoffTime = new Date(Date.now() - lookbackMinutes * 60 * 1000).toISOString();

  console.log(`  Fetching past snapshots since ${cutoffTime} (${lookbackMinutes} min lookback, capped at ${MAX_DATA_SCOPE_MINUTES} min)...`);
  console.log(`  Filtering by ${marketIds.length} market IDs from latest snapshots`);

  const { data, error } = await supabase
    .from('price_snapshots')
    .select('market_id, created_at, yes_price')
    .in('market_id', marketIds)
    .gt('created_at', cutoffTime)
    .order('created_at', { ascending: false });

  if (error) {
    console.error(`  ERROR fetching past snapshots: ${error.message}`);
    return { snapshots: [], error: true };
  }

  const rows = (data || []) as Snapshot[];
  console.log(`  Fetched ${rows.length} past snapshot candidates (filtered by market_id)`);
  return { snapshots: rows, error: false };
}

/**
 * Find the past snapshot closest to target_time for each market.
 * Only accepts snapshots within ±PAST_SNAPSHOT_TOLERANCE_MINUTES of target time.
 */
function findPastSnapshotsForMarkets(
  latestMap: Map<string, Snapshot>,
  pastSnapshots: Snapshot[],
  windowMinutes: number
): Map<string, Snapshot> {
  const pastMap = new Map<string, Snapshot>();
  const toleranceMs = PAST_SNAPSHOT_TOLERANCE_MINUTES * 60 * 1000;

  // Group past snapshots by market_id
  const pastByMarket = new Map<string, Snapshot[]>();
  for (const snap of pastSnapshots) {
    const existing = pastByMarket.get(snap.market_id) || [];
    existing.push(snap);
    pastByMarket.set(snap.market_id, existing);
  }

  let rejectedByTolerance = 0;

  // For each market with a latest snapshot, find the best past snapshot
  for (const [marketId, latestSnap] of Array.from(latestMap.entries())) {
    const latestTime = new Date(latestSnap.created_at).getTime();
    const targetTime = latestTime - windowMinutes * 60 * 1000;

    const candidates = pastByMarket.get(marketId) || [];

    let bestSnap: Snapshot | null = null;
    let bestDiff = Infinity;

    for (const snap of candidates) {
      const snapTime = new Date(snap.created_at).getTime();

      // Must be before latest time
      if (snapTime >= latestTime) continue;

      const diff = Math.abs(snapTime - targetTime);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestSnap = snap;
      }
    }

    // Only accept if within ±30 minute tolerance
    if (bestSnap && bestDiff <= toleranceMs) {
      pastMap.set(marketId, bestSnap);
    } else if (bestSnap) {
      // Had a candidate but it was outside tolerance
      rejectedByTolerance++;
    }
  }

  if (rejectedByTolerance > 0) {
    console.log(`  Rejected ${rejectedByTolerance} markets: past snapshot outside ±${PAST_SNAPSHOT_TOLERANCE_MINUTES}min tolerance`);
  }

  return pastMap;
}

/**
 * Fetch market metadata in batches
 */
async function fetchMarketMetadata(
  supabase: AnySupabaseClient,
  marketIds: string[]
): Promise<{ markets: Map<string, Market>; error: boolean }> {
  if (marketIds.length === 0) {
    return { markets: new Map(), error: false };
  }

  console.log(`  Fetching metadata for ${marketIds.length} markets...`);

  const marketMap = new Map<string, Market>();
  const batchSize = 500; // Safe batch size for Supabase

  for (let i = 0; i < marketIds.length; i += batchSize) {
    const batch = marketIds.slice(i, i + batchSize);

    const { data, error } = await supabase
      .from('markets')
      .select('id, title, url, volume_usd')
      .in('id', batch);

    if (error) {
      console.error(`  ERROR fetching market metadata batch ${i}: ${error.message}`);
      return { markets: new Map(), error: true };
    }

    const rows = (data || []) as Market[];
    for (const m of rows) {
      marketMap.set(m.id, m);
    }
  }

  console.log(`  Fetched metadata for ${marketMap.size} markets`);
  return { markets: marketMap, error: false };
}

// ============================================================================
// Main Computation Logic
// ============================================================================

async function computeMoversForWindow(
  supabase: AnySupabaseClient,
  config: WindowConfig
): Promise<ComputeResult> {
  console.log(`\n========== Computing ${config.window_key} movers ==========`);
  console.log(`Window: ${config.window_minutes} min, Volume threshold: $${config.min_volume_usd}, Limit: ${config.limit}`);

  const stats: Record<string, number> = {};

  // Step 1: Fetch latest snapshots
  console.log('\n[Step 1] Fetching latest snapshots...');
  const { snapshots: latestMap, error: latestError } = await fetchLatestSnapshots(supabase);
  if (latestError) {
    return { gainers: [], losers: [], stats: { fetch_latest_error: 1 }, error: true };
  }
  stats.latest_markets = latestMap.size;

  if (latestMap.size === 0) {
    console.log('  No latest snapshots found - cache will be empty');
    return { gainers: [], losers: [], stats, error: false };
  }

  // Step 2: Fetch past snapshots (only for markets with latest snapshots)
  console.log('\n[Step 2] Fetching past snapshots...');
  const marketIds = Array.from(latestMap.keys());
  const { snapshots: pastSnapshots, error: pastError } = await fetchPastSnapshots(supabase, config.window_minutes, marketIds);
  if (pastError) {
    return { gainers: [], losers: [], stats: { fetch_past_error: 1 }, error: true };
  }
  stats.past_snapshot_candidates = pastSnapshots.length;

  // Step 3: Match past snapshots to target times
  console.log('\n[Step 3] Finding best past snapshot per market...');
  const pastMap = findPastSnapshotsForMarkets(latestMap, pastSnapshots, config.window_minutes);
  stats.markets_with_past = pastMap.size;
  console.log(`  Found past snapshots for ${pastMap.size} markets`);

  // Step 4: Calculate movers and apply filters
  console.log('\n[Step 4] Calculating movers and applying filters...');
  const candidates: MoverCandidate[] = [];
  let filteredByPrice = 0;
  let filteredByChange = 0;
  let filteredByVolume = 0;
  let filteredByNullPrice = 0;

  for (const [marketId, latestSnap] of Array.from(latestMap.entries())) {
    const pastSnap = pastMap.get(marketId);
    if (!pastSnap) continue;

    const yesNow = latestSnap.yes_price;
    const yesPast = pastSnap.yes_price;
    const volumeUsd = latestSnap.volume_usd ?? 0;

    // Filter: null prices
    if (yesNow == null || yesPast == null) {
      filteredByNullPrice++;
      continue;
    }

    // Filter: price range (not already decided)
    if (yesNow < MIN_PRICE || yesNow > MAX_PRICE) {
      filteredByPrice++;
      continue;
    }

    // Calculate change
    const changePp = (yesNow - yesPast) * 100;

    // Filter: big moves only
    if (Math.abs(changePp) < MIN_CHANGE_PP) {
      filteredByChange++;
      continue;
    }

    // Filter: volume threshold
    if (volumeUsd < config.min_volume_usd) {
      filteredByVolume++;
      continue;
    }

    const latestTime = new Date(latestSnap.created_at);
    const pastTime = new Date(pastSnap.created_at);
    const deltaMinutes = Math.round((latestTime.getTime() - pastTime.getTime()) / 60000);

    candidates.push({
      market_id: marketId,
      latest_time: latestTime,
      past_time: pastTime,
      yes_now: yesNow,
      yes_past: yesPast,
      change_pp: changePp,
      delta_minutes: deltaMinutes,
      volume_usd: volumeUsd,
    });
  }

  stats.filtered_by_null_price = filteredByNullPrice;
  stats.filtered_by_price_range = filteredByPrice;
  stats.filtered_by_change = filteredByChange;
  stats.filtered_by_volume = filteredByVolume;
  stats.candidates_after_filters = candidates.length;

  console.log(`  Candidates after filters: ${candidates.length}`);
  console.log(`    - Filtered by null price: ${filteredByNullPrice}`);
  console.log(`    - Filtered by price range (${MIN_PRICE}-${MAX_PRICE}): ${filteredByPrice}`);
  console.log(`    - Filtered by change (<${MIN_CHANGE_PP}pp): ${filteredByChange}`);
  console.log(`    - Filtered by volume (<$${config.min_volume_usd}): ${filteredByVolume}`);

  if (candidates.length === 0) {
    console.log('  No candidates after filtering - cache will be empty');
    return { gainers: [], losers: [], stats, error: false };
  }

  // Step 5: Fetch market metadata
  console.log('\n[Step 5] Fetching market metadata...');
  const marketIds = candidates.map(c => c.market_id);
  const { markets: marketMap, error: marketError } = await fetchMarketMetadata(supabase, marketIds);
  if (marketError) {
    return { gainers: [], losers: [], stats: { fetch_metadata_error: 1 }, error: true };
  }
  stats.markets_with_metadata = marketMap.size;

  // Step 6: Apply category exclusion and build final movers
  console.log('\n[Step 6] Applying category filter and building movers...');
  const movers: MoverCacheItem[] = [];
  let excludedByCategory = 0;

  for (const c of candidates) {
    const market = marketMap.get(c.market_id);
    const title = market?.title || `Market ${c.market_id.slice(0, 8)}`;

    // Category filter
    if (market && isExcludedMarket(market.title)) {
      excludedByCategory++;
      continue;
    }

    movers.push({
      market_id: c.market_id,
      title: title,
      slug: market ? extractSlug(market.url) : null,
      volume_usd: c.volume_usd,
      latest_price: c.yes_now,
      past_price: c.yes_past,
      change_pp: c.change_pp,
      latest_time: c.latest_time.toISOString(),
      past_time: c.past_time.toISOString(),
      delta_minutes: c.delta_minutes,
    });
  }

  stats.excluded_by_category = excludedByCategory;
  stats.movers_total = movers.length;
  console.log(`  Excluded by category filter: ${excludedByCategory}`);
  console.log(`  Final movers: ${movers.length}`);

  if (movers.length === 0) {
    console.log('  No movers after category filter - cache will be empty');
    return { gainers: [], losers: [], stats, error: false };
  }

  // Step 7: Sort and slice
  console.log('\n[Step 7] Sorting and slicing to top movers...');
  const gainers = movers
    .filter(m => m.change_pp > 0)
    .sort((a, b) => b.change_pp - a.change_pp)
    .slice(0, config.limit);

  const losers = movers
    .filter(m => m.change_pp < 0)
    .sort((a, b) => a.change_pp - b.change_pp)
    .slice(0, config.limit);

  stats.final_gainers = gainers.length;
  stats.final_losers = losers.length;

  console.log(`  Top gainers: ${gainers.length}`);
  console.log(`  Top losers: ${losers.length}`);

  // Debug: Show top 3
  if (gainers.length > 0) {
    console.log('\n  Top 3 gainers:');
    for (let i = 0; i < Math.min(3, gainers.length); i++) {
      const g = gainers[i];
      console.log(`    [${i}] +${g.change_pp.toFixed(1)}pp "${g.title.slice(0, 50)}"`);
    }
  }
  if (losers.length > 0) {
    console.log('\n  Top 3 losers:');
    for (let i = 0; i < Math.min(3, losers.length); i++) {
      const l = losers[i];
      console.log(`    [${i}] ${l.change_pp.toFixed(1)}pp "${l.title.slice(0, 50)}"`);
    }
  }

  return { gainers, losers, stats, error: false };
}

async function updateCache(
  supabase: AnySupabaseClient,
  entry: CacheEntry
): Promise<boolean> {
  console.log(`\n[Upsert] Writing cache for ${entry.window_key}...`);
  console.log(`  top_gainers: ${entry.top_gainers.length}, top_losers: ${entry.top_losers.length}`);

  const { error } = await supabase
    .from('movers_cache')
    .upsert(entry, { onConflict: 'window_key' });

  if (error) {
    console.error(`  Cache write ERROR: ${error.message}`);
    return false;
  }

  console.log(`  Cache written successfully for ${entry.window_key}`);
  return true;
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  const startTime = Date.now();
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     COMPUTE MOVERS CACHE (NO RPC - Direct Query)          ║');
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

  const results: Array<{
    window: string;
    gainers: number;
    losers: number;
    status: 'updated' | 'skipped_error' | 'skipped_empty' | 'write_failed' | 'exception';
  }> = [];

  for (const config of WINDOW_CONFIGS) {
    try {
      const windowStart = Date.now();
      const { gainers, losers, stats, error } = await computeMoversForWindow(supabase, config);

      // If query error occurred, skip cache update to preserve existing data
      if (error) {
        console.log(`\n⏭️ Skipping cache update for ${config.window_key} due to computation failure`);
        results.push({
          window: config.window_key,
          gainers: 0,
          losers: 0,
          status: 'skipped_error',
        });
        continue;
      }

      // GUARD: Only update cache if we have actual movers data
      // If computation succeeded but result is empty, preserve existing cache
      if (gainers.length === 0 && losers.length === 0) {
        console.log(`\n⏭️ Skipping cache update for ${config.window_key} - no movers found (preserving existing cache)`);
        results.push({
          window: config.window_key,
          gainers: 0,
          losers: 0,
          status: 'skipped_empty',
        });
        continue;
      }

      // We have movers - update the cache
      console.log(`\n✅ Updating cache for ${config.window_key}: ${gainers.length} gainers, ${losers.length} losers`);

      const cacheEntry: CacheEntry = {
        window_key: config.window_key,
        generated_at: new Date().toISOString(),
        params: {
          window_minutes: config.window_minutes,
          limit: config.limit,
          min_volume_usd: config.min_volume_usd,
          min_price: MIN_PRICE,
          max_price: MAX_PRICE,
          min_change_pp: MIN_CHANGE_PP,
          stats: stats,
        },
        top_gainers: gainers,
        top_losers: losers,
      };

      const success = await updateCache(supabase, cacheEntry);

      const windowDuration = Date.now() - windowStart;
      console.log(`${config.window_key} completed in ${windowDuration}ms`);

      results.push({
        window: config.window_key,
        gainers: gainers.length,
        losers: losers.length,
        status: success ? 'updated' : 'write_failed',
      });
    } catch (err) {
      console.error(`\n❌ EXCEPTION computing ${config.window_key}:`, err);
      console.log(`⏭️ Skipping cache update for ${config.window_key} due to exception (preserving existing cache)`);
      results.push({
        window: config.window_key,
        gainers: 0,
        losers: 0,
        status: 'exception',
      });
    }
  }

  const totalDuration = Date.now() - startTime;

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                    FINAL SUMMARY                           ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`Total duration: ${totalDuration}ms (${(totalDuration / 1000).toFixed(2)}s)`);

  // Count by status
  const updated = results.filter(r => r.status === 'updated');
  const skippedError = results.filter(r => r.status === 'skipped_error');
  const skippedEmpty = results.filter(r => r.status === 'skipped_empty');
  const writeFailed = results.filter(r => r.status === 'write_failed');
  const exceptions = results.filter(r => r.status === 'exception');

  console.log('\n📊 Summary:');
  console.log(`  ✅ Successfully updated: ${updated.length}/${results.length} windows`);
  if (skippedError.length > 0) {
    console.log(`  ⏭️ Skipped (query error): ${skippedError.length} windows (previous cache preserved)`);
  }
  if (skippedEmpty.length > 0) {
    console.log(`  ⏭️ Skipped (empty result): ${skippedEmpty.length} windows (previous cache preserved)`);
  }
  if (writeFailed.length > 0) {
    console.log(`  ❌ Write failed: ${writeFailed.length} windows`);
  }
  if (exceptions.length > 0) {
    console.log(`  💥 Exceptions: ${exceptions.length} windows`);
  }

  console.log('\nResults per window:');
  for (const r of results) {
    let icon: string;
    let detail: string;
    switch (r.status) {
      case 'updated':
        icon = '✅';
        detail = `${r.gainers} gainers, ${r.losers} losers`;
        break;
      case 'skipped_error':
        icon = '⏭️';
        detail = 'SKIPPED - query error (previous cache preserved)';
        break;
      case 'skipped_empty':
        icon = '⏭️';
        detail = 'SKIPPED - no movers found (previous cache preserved)';
        break;
      case 'write_failed':
        icon = '❌';
        detail = 'cache write failed';
        break;
      case 'exception':
        icon = '💥';
        detail = 'exception occurred (previous cache preserved)';
        break;
    }
    console.log(`  ${icon} ${r.window}: ${detail}`);
  }

  // Determine exit status
  // Success: at least one window was updated with actual movers
  // Failure: no windows were updated (all had errors, exceptions, or empty results)
  const hasAnySuccess = updated.length > 0;
  const hasFailures = skippedError.length > 0 || writeFailed.length > 0 || exceptions.length > 0;

  if (updated.length === results.length) {
    console.log('\n🎉 All windows updated successfully!');
    process.exit(0);
  } else if (hasAnySuccess) {
    console.log(`\n⚠️ Partial success: ${updated.length}/${results.length} windows updated`);
    // Partial success is still exit 0 - we have some good data
    process.exit(0);
  } else if (skippedEmpty.length === results.length) {
    // All windows had no movers - this might be valid (no big moves right now)
    // But we preserve cache, so exit 0 but with warning
    console.log('\n⚠️ No movers found in any window - previous cache data preserved');
    console.log('   This may be normal if there are no significant price movements.');
    process.exit(0);
  } else if (hasFailures) {
    // Had actual failures (errors, exceptions, write failures)
    console.log('\n❌ FAILURE: No windows were updated successfully due to errors');
    console.log('   Previous cache data preserved. Check logs above for details.');
    process.exit(1);
  } else {
    console.log('\n❌ No windows were updated successfully');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
