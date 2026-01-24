/**
 * Core ingestion logic for Polymarket market data
 * Can be called from both API routes (Vercel) and CLI scripts (GitHub Actions)
 */

import { createClient } from '@supabase/supabase-js';
import type { GammaMarket, MarketRecord, IngestionResult } from './types';

// Configuration
const GAMMA_API_URL = 'https://gamma-api.polymarket.com/markets';
const FETCH_TIMEOUT = 15000; // 15 seconds (increased for pagination)
const MAX_RETRIES = 1;
const PAGE_SIZE = 100; // Fetch 100 markets per page

/**
 * Fetch a single page of markets from Gamma API with timeout and retry
 */
async function fetchPageFromGammaAPI(offset: number, retryCount = 0): Promise<GammaMarket[]> {
  try {
    const queryParams = `?active=true&closed=false&limit=${PAGE_SIZE}&offset=${offset}`;
    console.log(`Fetching page at offset ${offset} (attempt ${retryCount + 1})...`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    const response = await fetch(`${GAMMA_API_URL}${queryParams}`, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Gamma API returned status ${response.status}`);
    }

    const data = await response.json();

    // Handle different response formats
    const markets = Array.isArray(data) ? data : (data.markets || []);

    console.log(`Fetched ${markets.length} markets at offset ${offset}`);
    return markets;
  } catch (error) {
    console.error(`Error fetching page at offset ${offset} (attempt ${retryCount + 1}):`, error);

    // Retry once if this was the first attempt
    if (retryCount < MAX_RETRIES) {
      console.log('Retrying...');
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
      return fetchPageFromGammaAPI(offset, retryCount + 1);
    }

    throw error;
  }
}

/**
 * Fetch ALL markets from Gamma API using pagination
 * Continues fetching until no more results are returned
 */
export async function fetchFromGammaAPI(): Promise<GammaMarket[]> {
  console.log('Starting to fetch ALL markets from Gamma API with pagination...');

  const allMarkets: GammaMarket[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const pageMarkets = await fetchPageFromGammaAPI(offset);

    if (pageMarkets.length === 0) {
      // No more markets to fetch
      hasMore = false;
      console.log(`No more markets at offset ${offset}. Pagination complete.`);
    } else {
      allMarkets.push(...pageMarkets);
      offset += pageMarkets.length;

      // If we got fewer markets than the page size, we're on the last page
      if (pageMarkets.length < PAGE_SIZE) {
        hasMore = false;
        console.log(`Received ${pageMarkets.length} markets (less than page size). Last page reached.`);
      } else {
        console.log(`Total markets fetched so far: ${allMarkets.length}. Continuing...`);
        // Add a small delay between requests to be respectful to the API
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }

  console.log(`Successfully fetched ${allMarkets.length} total markets from Gamma API`);
  return allMarkets;
}

/**
 * Check if a market is currently active and tradeable
 */
export function isMarketActive(market: GammaMarket): boolean {
  // Filter out explicitly closed/resolved/archived markets
  if (market.closed === true || market.active === false) return false;
  if (market.resolved === true || market.archived === true) return false;

  // Filter out markets that have ended
  if (market.endDate || market.end_date || market.endDateIso) {
    const endDate = new Date(market.endDate || market.end_date || market.endDateIso);
    if (endDate < new Date()) return false;
  }

  return true;
}

/**
 * Check if a market is sports-related
 * Uses heuristics based on tags, categories, and title keywords
 */
export function isSportsMarket(market: GammaMarket): boolean {
  // Check tags (if present)
  if (market.tags && Array.isArray(market.tags)) {
    const tagsStr = market.tags.join(' ').toLowerCase();
    if (tagsStr.includes('sports') ||
        tagsStr.includes('nfl') ||
        tagsStr.includes('nba') ||
        tagsStr.includes('mlb') ||
        tagsStr.includes('nhl') ||
        tagsStr.includes('soccer') ||
        tagsStr.includes('football') ||
        tagsStr.includes('basketball') ||
        tagsStr.includes('baseball') ||
        tagsStr.includes('hockey')) {
      return true;
    }
  }

  // Check category (if present)
  if (market.category) {
    const categoryStr = market.category.toLowerCase();
    if (categoryStr.includes('sports') ||
        categoryStr.includes('nfl') ||
        categoryStr.includes('nba') ||
        categoryStr.includes('mlb') ||
        categoryStr.includes('nhl') ||
        categoryStr.includes('soccer') ||
        categoryStr.includes('football') ||
        categoryStr.includes('basketball') ||
        categoryStr.includes('baseball') ||
        categoryStr.includes('hockey')) {
      return true;
    }
  }

  // Check title/question for sports keywords
  const title = (market.question || '').toLowerCase();

  // Common sports patterns
  const sportsPatterns = [
    /\b(nfl|nba|mlb|nhl|ufc|mma|fifa)\b/,
    /\b(super bowl|world series|stanley cup|world cup)\b/,
    /\b(playoff|championship|league|division|conference)\b.*\b(win|winner|champion)/,
    /\b(team|teams)\b.*\b(win|score|beat|defeat)/,
    /\b(player|athlete)\b.*\b(score|points|goals|touchdowns)/,
    /\b(game|match)\b.*\b(win|score|result)/,
  ];

  for (const pattern of sportsPatterns) {
    if (pattern.test(title)) {
      return true;
    }
  }

  return false;
}

/**
 * Normalize Gamma API market data to our database format
 */
export function normalizeMarket(gammaMarket: GammaMarket, debugMarketId?: string): MarketRecord {
  const isDebugMarket = debugMarketId && gammaMarket.id === debugMarketId;

  if (isDebugMarket) {
    console.log('\n========================================');
    console.log('🔍 DEBUG MODE - Raw Gamma API Payload');
    console.log('========================================');
    console.log('Market ID:', gammaMarket.id);
    console.log('Question/Title:', gammaMarket.question || gammaMarket.title || 'N/A');
    console.log('Slug:', gammaMarket.slug || 'N/A');
    console.log('\n--- RAW API FIELDS ---');
    console.log('outcomes (raw):', JSON.stringify(gammaMarket.outcomes, null, 2));
    console.log('outcomePrices (raw):', JSON.stringify(gammaMarket.outcomePrices, null, 2));
    console.log('\n--- TOKEN/PRICE FIELDS (if exists) ---');
    console.log('tokens:', JSON.stringify(gammaMarket.tokens, null, 2));
    console.log('bestBid:', gammaMarket.bestBid);
    console.log('bestAsk:', gammaMarket.bestAsk);
    console.log('lastPrice:', gammaMarket.lastPrice);
    console.log('\n--- VOLUME FIELDS ---');
    console.log('volume:', gammaMarket.volume);
    console.log('volumeNum:', gammaMarket.volumeNum);
    console.log('volumeUSD:', gammaMarket.volumeUSD);
    console.log('volume24h:', gammaMarket.volume24h);
    console.log('volume24hr:', gammaMarket.volume24hr);
    console.log('\n--- ALL AVAILABLE KEYS ---');
    console.log(Object.keys(gammaMarket).sort().join(', '));
    console.log('========================================\n');
  }

  // Extract yes price
  // Gamma API returns outcomes and outcomePrices as STRINGIFIED JSON arrays
  // Example: outcomes = '["Yes", "No"]', outcomePrices = '["0.65", "0.35"]'
  let yesPrice: number | null = null;

  try {
    // Parse stringified arrays
    let outcomes: string[] = [];
    let prices: string[] = [];

    if (typeof gammaMarket.outcomes === 'string') {
      outcomes = JSON.parse(gammaMarket.outcomes);
    } else if (Array.isArray(gammaMarket.outcomes)) {
      outcomes = gammaMarket.outcomes;
    }

    if (typeof gammaMarket.outcomePrices === 'string') {
      prices = JSON.parse(gammaMarket.outcomePrices);
    } else if (Array.isArray(gammaMarket.outcomePrices)) {
      prices = gammaMarket.outcomePrices;
    }

    if (isDebugMarket) {
      console.log('📊 PARSED ARRAYS:');
      console.log('  outcomes:', outcomes);
      console.log('  prices:', prices);
    }

    // Find the "Yes" outcome (case-insensitive)
    if (outcomes.length > 0 && prices.length > 0) {
      const yesIndex = outcomes.findIndex(
        outcome => outcome.toLowerCase().trim() === 'yes'
      );

      if (isDebugMarket) {
        console.log('  yesIndex:', yesIndex);
      }

      if (yesIndex !== -1 && yesIndex < prices.length) {
        const priceStr = prices[yesIndex];
        const parsed = parseFloat(priceStr);
        // Validate: must be a number AND between 0 and 1 (inclusive)
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
          yesPrice = parsed;
          if (isDebugMarket) {
            console.log(`  ✅ Found Yes at index ${yesIndex}: "${priceStr}" → ${parsed}`);
          }
        } else if (isDebugMarket) {
          console.log(`  ❌ Invalid price at Yes index ${yesIndex}: "${priceStr}" → ${parsed} (out of range 0-1)`);
        }
      } else if (isDebugMarket) {
        console.log('  ❌ No "Yes" outcome found in outcomes array');
      }
    } else if (isDebugMarket) {
      console.log('  ⚠️  Empty outcomes or prices array');
    }
  } catch (error) {
    // Failed to parse - yesPrice remains null
    console.warn(`Failed to parse outcomes/prices for market ${gammaMarket.id}:`, error);
  }

  // Extract volume
  let volumeUsd: number | null = null;
  if (gammaMarket.volume) {
    const parsed = parseFloat(gammaMarket.volume);
    if (!isNaN(parsed)) {
      volumeUsd = parsed;
    }
  }

  if (isDebugMarket) {
    console.log('\n💰 VOLUME EXTRACTION:');
    console.log('  Using field: gammaMarket.volume');
    console.log('  Raw value:', gammaMarket.volume);
    console.log('  Parsed volumeUsd:', volumeUsd);
  }

  if (isDebugMarket) {
    console.log('\n✅ FINAL MAPPED VALUES:');
    console.log('  yes_price:', yesPrice);
    console.log('  volume_usd:', volumeUsd);
    console.log('========================================\n');
  }

  // Build market URL using priority order to avoid 404s
  let url = '';
  let urlSource = 'unknown';
  const title = gammaMarket.question || 'Untitled Market';

  // Priority A (best): Use direct link field from Gamma API
  if (gammaMarket.url && typeof gammaMarket.url === 'string' && gammaMarket.url.includes('polymarket.com')) {
    url = gammaMarket.url;
    urlSource = 'Priority A (API url field)';
  } else if (gammaMarket.marketUrl && typeof gammaMarket.marketUrl === 'string' && gammaMarket.marketUrl.includes('polymarket.com')) {
    url = gammaMarket.marketUrl;
    urlSource = 'Priority A (API marketUrl field)';
  } else if (gammaMarket.eventUrl && typeof gammaMarket.eventUrl === 'string' && gammaMarket.eventUrl.includes('polymarket.com')) {
    url = gammaMarket.eventUrl;
    urlSource = 'Priority A (API eventUrl field)';
  } else if (gammaMarket.link && typeof gammaMarket.link === 'string' && gammaMarket.link.includes('polymarket.com')) {
    url = gammaMarket.link;
    urlSource = 'Priority A (API link field)';
  }
  // Priority B: Use slug (known to work with event pages)
  else if (gammaMarket.slug && gammaMarket.slug.trim()) {
    url = `https://polymarket.com/event/${gammaMarket.slug.trim()}`;
    urlSource = 'Priority B (event slug)';
  }
  // Priority C (fallback, always works): Generate search URL from title
  else {
    url = `https://polymarket.com/search?q=${encodeURIComponent(title)}`;
    urlSource = 'Priority C (search fallback)';
  }

  return {
    id: gammaMarket.id,
    title,
    url,
    yes_price: yesPrice,
    volume_usd: volumeUsd,
    _urlSource: urlSource, // Temporary field for logging
  };
}

/**
 * Upsert markets into Supabase
 */
export async function upsertMarketsToSupabase(markets: MarketRecord[]): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase configuration. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log(`Upserting ${markets.length} markets to Supabase...`);

  const { data, error } = await supabase
    .from('markets')
    .upsert(markets, { onConflict: 'id' });

  if (error) {
    throw new Error(`Supabase upsert error: ${error.message}`);
  }

  console.log(`Successfully upserted ${markets.length} markets to Supabase`);
}

/**
 * Insert price snapshots into Supabase
 * Only inserts snapshots for markets with valid yes_price
 */
export async function insertPriceSnapshots(markets: MarketRecord[]): Promise<number> {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase configuration. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const debugMarketId = process.env.DEBUG_MARKET_ID;

  // Filter markets to only those with valid yes_price
  const snapshotsToInsert = markets
    .filter(market => {
      // Only include if market_id exists and yes_price is a valid number
      return (
        market.id &&
        market.id.trim() !== '' &&
        market.yes_price !== null &&
        market.yes_price !== undefined &&
        typeof market.yes_price === 'number' &&
        !isNaN(market.yes_price)
      );
    })
    .map(market => ({
      market_id: market.id,
      yes_price: market.yes_price,
      volume_usd: market.volume_usd,
      // created_at will default to now() in database
    }));

  if (snapshotsToInsert.length === 0) {
    console.log('No valid snapshots to insert (no markets with valid yes_price)');
    return 0;
  }

  // Debug output for specific market
  if (debugMarketId) {
    const debugSnapshot = snapshotsToInsert.find(s => s.market_id === debugMarketId);
    if (debugSnapshot) {
      console.log('\n========================================');
      console.log('🔍 DEBUG - Snapshot to be inserted for', debugMarketId);
      console.log('========================================');
      console.log('market_id:', debugSnapshot.market_id);
      console.log('yes_price:', debugSnapshot.yes_price);
      console.log('volume_usd:', debugSnapshot.volume_usd);
      console.log('========================================\n');
    } else {
      console.log(`\n⚠️  DEBUG - Market ${debugMarketId} NOT found in snapshots (filtered out due to invalid yes_price)\n`);
    }
  }

  console.log(`Inserting ${snapshotsToInsert.length} price snapshots...`);

  const { data, error } = await supabase
    .from('price_snapshots')
    .insert(snapshotsToInsert);

  if (error) {
    throw new Error(`Snapshot insertion error: ${error.message}`);
  }

  console.log(`Successfully inserted ${snapshotsToInsert.length} price snapshots`);
  return snapshotsToInsert.length;
}

/**
 * Create snapshots for ALL markets in the database
 * This runs after market upsert to ensure we have snapshots for all markets, not just newly fetched ones
 */
export async function createSnapshotsForAllMarkets(): Promise<{
  totalProcessed: number;
  snapshotsCreated: number;
  skippedNoPrice: number;
  errors: number;
}> {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase configuration. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const debugMarketId = process.env.DEBUG_MARKET_ID;

  console.log('\n=== Creating Snapshots for All Markets ===');

  const BATCH_SIZE = 500; // Process 500 markets per batch
  let offset = 0;
  let totalProcessed = 0;
  let snapshotsCreated = 0;
  let skippedNoPrice = 0;
  let errors = 0;
  let hasMore = true;

  while (hasMore) {
    // Fetch a batch of markets from Supabase
    const { data: markets, error: fetchError } = await supabase
      .from('markets')
      .select('id, yes_price, volume_usd')
      .range(offset, offset + BATCH_SIZE - 1)
      .order('id', { ascending: true }); // Consistent ordering for pagination

    if (fetchError) {
      console.error(`Error fetching markets batch at offset ${offset}:`, fetchError.message);
      errors++;
      break;
    }

    if (!markets || markets.length === 0) {
      hasMore = false;
      break;
    }

    console.log(`Processing batch: offset=${offset}, count=${markets.length}`);

    // Filter markets with valid yes_price
    const validMarkets = markets.filter(m => {
      if (m.yes_price === null || m.yes_price === undefined || typeof m.yes_price !== 'number' || isNaN(m.yes_price)) {
        skippedNoPrice++;
        return false;
      }
      return true;
    });

    if (validMarkets.length > 0) {
      // Prepare snapshots for insertion
      const snapshots = validMarkets.map(m => ({
        market_id: m.id,
        yes_price: m.yes_price,
        volume_usd: m.volume_usd,
        // created_at will default to now() in database
      }));

      // Debug output for specific market in this batch
      if (debugMarketId) {
        const debugSnapshot = snapshots.find(s => s.market_id === debugMarketId);
        if (debugSnapshot) {
          console.log('\n========================================');
          console.log('🔍 DEBUG - Snapshot from ALL MARKETS batch for', debugMarketId);
          console.log('========================================');
          console.log('market_id:', debugSnapshot.market_id);
          console.log('yes_price:', debugSnapshot.yes_price);
          console.log('volume_usd:', debugSnapshot.volume_usd);
          console.log('========================================\n');
        }
      }

      // Insert snapshots for this batch
      const { error: insertError } = await supabase
        .from('price_snapshots')
        .insert(snapshots);

      if (insertError) {
        console.error(`Error inserting snapshots batch at offset ${offset}:`, insertError.message);
        errors++;
        // Continue with next batch even if this one fails
      } else {
        snapshotsCreated += snapshots.length;
        console.log(`  ✓ Inserted ${snapshots.length} snapshots (skipped ${markets.length - validMarkets.length} with null price)`);
      }
    } else {
      console.log(`  ⊘ Skipped entire batch - no markets with valid yes_price`);
    }

    totalProcessed += markets.length;
    offset += BATCH_SIZE;

    // If we got fewer markets than BATCH_SIZE, we've reached the end
    if (markets.length < BATCH_SIZE) {
      hasMore = false;
    }
  }

  console.log('\n=== Snapshot Creation Complete ===');
  console.log(`Total markets processed: ${totalProcessed}`);
  console.log(`Snapshots created: ${snapshotsCreated}`);
  console.log(`Skipped (no price): ${skippedNoPrice}`);
  console.log(`Errors: ${errors}`);

  return {
    totalProcessed,
    snapshotsCreated,
    skippedNoPrice,
    errors,
  };
}

/**
 * Deduplicate markets by unique id
 * If duplicate ids exist, keeps the last occurrence (most recent data)
 * This prevents the Postgres error: "ON CONFLICT DO UPDATE command cannot affect row a second time"
 */
export function deduplicateMarketsById(markets: MarketRecord[]): MarketRecord[] {
  const marketMap = new Map<string, MarketRecord>();

  for (const market of markets) {
    // Use Map to ensure only one entry per id
    // If id already exists, this will overwrite with the latest occurrence
    marketMap.set(market.id, market);
  }

  return Array.from(marketMap.values());
}

/**
 * Main ingestion function that can be called from API routes or CLI scripts
 */
export async function runIngestion(): Promise<IngestionResult> {
  console.log('=== Polymarket Data Ingestion Starting ===');

  // Check for debug mode
  const debugMarketId = process.env.DEBUG_MARKET_ID;
  if (debugMarketId) {
    console.log(`\n🔍 DEBUG MODE ENABLED for market_id: ${debugMarketId}\n`);
  }

  // Fetch ALL markets from Gamma API (with pagination)
  const gammaMarkets = await fetchFromGammaAPI();
  const fetchedMarketsTotal = gammaMarkets.length;
  console.log(`Total fetched: ${fetchedMarketsTotal}`);

  if (fetchedMarketsTotal === 0) {
    console.warn('No markets received from Gamma API');
    return {
      marketsUpserted: 0,
      snapshotsInserted: 0,
      fetchedMarketsTotal: 0,
      keptMarketsTotal: 0,
      filteredInactiveCount: 0,
      filteredSportsCount: 0,
      lastSnapshotCreatedAt: null,
    };
  }

  // Filter out inactive markets
  const activeMarkets = gammaMarkets.filter(isMarketActive);
  const filteredInactiveCount = fetchedMarketsTotal - activeMarkets.length;
  console.log(`Active markets: ${activeMarkets.length} (filtered out ${filteredInactiveCount} inactive markets)`);

  // Filter out sports markets
  const nonSportsMarkets = activeMarkets.filter(market => !isSportsMarket(market));
  const filteredSportsCount = activeMarkets.length - nonSportsMarkets.length;
  console.log(`Non-sports markets: ${nonSportsMarkets.length} (filtered out ${filteredSportsCount} sports markets)`);

  const keptMarketsTotal = nonSportsMarkets.length;

  if (keptMarketsTotal === 0) {
    console.warn('No markets remaining after filtering');
    return {
      marketsUpserted: 0,
      snapshotsInserted: 0,
      fetchedMarketsTotal,
      keptMarketsTotal: 0,
      filteredInactiveCount,
      filteredSportsCount,
      lastSnapshotCreatedAt: null,
    };
  }

  // Normalize to our format
  const normalizedMarkets = nonSportsMarkets.map(m => normalizeMarket(m, debugMarketId));

  // Count markets with valid yes_price
  const marketsWithPrice = normalizedMarkets.filter(m => m.yes_price !== null);
  console.log(`Markets with valid yes_price: ${marketsWithPrice.length}/${normalizedMarkets.length}`);

  // Show 3 sample markets with extracted prices
  if (marketsWithPrice.length > 0) {
    console.log('\nSample markets with extracted prices:');
    marketsWithPrice.slice(0, 3).forEach((market, idx) => {
      const pricePercent = ((market.yes_price || 0) * 100).toFixed(1);
      console.log(`  ${idx + 1}. "${market.title.substring(0, 60)}..." → ${pricePercent}%`);
    });
  } else {
    console.warn('⚠️  WARNING: No markets have valid yes_price! Check API response structure.');
  }

  // Show 3 sample URLs with their sources (for debugging)
  console.log('\nSample URLs with sources:');
  normalizedMarkets.slice(0, 3).forEach((market, idx) => {
    const titleShort = market.title.substring(0, 50);
    console.log(`  ${idx + 1}. "${titleShort}..." → ${market.url} (source: ${market._urlSource || 'unknown'})`);
  });

  // Remove temporary _urlSource field before upserting to Supabase
  const marketsForDb = normalizedMarkets.map(({ _urlSource, ...market }) => market);

  // Deduplicate markets by id to avoid Supabase upsert conflict error
  // "ON CONFLICT DO UPDATE command cannot affect row a second time"
  const beforeDedupeCount = marketsForDb.length;
  const deduplicatedMarkets = deduplicateMarketsById(marketsForDb);
  const afterDedupeCount = deduplicatedMarkets.length;
  const duplicatesRemoved = beforeDedupeCount - afterDedupeCount;

  console.log('\n=== Deduplication Summary ===');
  console.log(`Markets before deduplication: ${beforeDedupeCount}`);
  console.log(`Markets after deduplication: ${afterDedupeCount}`);
  console.log(`Duplicate markets removed: ${duplicatesRemoved}`);
  if (duplicatesRemoved > 0) {
    console.log(`⚠️  WARNING: Found ${duplicatesRemoved} duplicate market(s)! This may indicate an issue with the API or pagination logic.`);
  }

  // Upsert to Supabase
  await upsertMarketsToSupabase(deduplicatedMarkets);
  console.log(`Markets upserted: ${deduplicatedMarkets.length}`);

  // Insert price snapshots for ALL markets in database (not just newly fetched ones)
  // This ensures we maintain historical price tracking for all markets
  const snapshotStats = await createSnapshotsForAllMarkets();

  // Get current timestamp for last snapshot
  const lastSnapshotCreatedAt = snapshotStats.snapshotsCreated > 0 ? new Date().toISOString() : null;

  console.log('=== Data Ingestion Completed Successfully ===');
  console.log(`Summary: Fetched ${fetchedMarketsTotal}, Kept ${keptMarketsTotal}, Upserted ${deduplicatedMarkets.length}, Snapshots ${snapshotStats.snapshotsCreated}`);

  const result: IngestionResult = {
    marketsUpserted: deduplicatedMarkets.length,
    snapshotsInserted: snapshotStats.snapshotsCreated,
    fetchedMarketsTotal,
    keptMarketsTotal,
    filteredInactiveCount,
    filteredSportsCount,
    lastSnapshotCreatedAt,
  };

  // Store the result for /api/health to read
  await saveIngestionResult(result);

  return result;
}

/**
 * Save ingestion result to a file for /api/health to read
 * This allows the health endpoint to show stats from the last ingestion run
 */
async function saveIngestionResult(result: IngestionResult): Promise<void> {
  try {
    // Only save in Node.js environment (not in browser/edge runtime)
    if (typeof process !== 'undefined' && process.versions && process.versions.node) {
      const fs = await import('fs/promises');
      const path = await import('path');

      // Store in project root or tmp directory
      const filePath = path.join(process.cwd(), '.last-ingestion.json');
      await fs.writeFile(filePath, JSON.stringify(result, null, 2), 'utf-8');
      console.log(`Saved ingestion stats to ${filePath}`);
    }
  } catch (error) {
    // Don't fail the ingestion if we can't save the stats file
    console.warn('Failed to save ingestion stats file:', error);
  }
}
