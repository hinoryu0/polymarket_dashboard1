/**
 * Data Ingestion Script for Polymarket Markets
 *
 * This script fetches market data from Polymarket's Gamma API
 * and stores it in Supabase for consumption by the dashboard.
 *
 * Runs in GitHub Actions every 5 minutes or can be run manually.
 */

import { createClient } from '@supabase/supabase-js';

// Types for Gamma API response
type GammaMarket = {
  id: string;
  question: string;
  slug?: string;
  outcomes?: string[];
  outcomePrices?: string[];
  volume?: string;
  [key: string]: any;
};

type MarketRecord = {
  id: string;
  title: string;
  url: string;
  yes_price: number | null;
  volume_usd: number | null;
  updated_at?: string;
  _urlSource?: string; // Temporary field for logging
};

// Configuration
const GAMMA_API_URL = 'https://gamma-api.polymarket.com/markets';
const FETCH_TIMEOUT = 10000; // 10 seconds
const MAX_RETRIES = 1;

// Query parameters to fetch only active markets
const QUERY_PARAMS = '?active=true&closed=false&limit=100';

/**
 * Fetch markets from Gamma API with timeout and retry
 */
async function fetchFromGammaAPI(retryCount = 0): Promise<GammaMarket[]> {
  try {
    console.log(`Fetching markets from Gamma API (attempt ${retryCount + 1})...`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    const response = await fetch(`${GAMMA_API_URL}${QUERY_PARAMS}`, {
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

    console.log(`Successfully fetched ${markets.length} markets from Gamma API`);
    return markets;
  } catch (error) {
    console.error(`Error fetching from Gamma API (attempt ${retryCount + 1}):`, error);

    // Retry once if this was the first attempt
    if (retryCount < MAX_RETRIES) {
      console.log('Retrying...');
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
      return fetchFromGammaAPI(retryCount + 1);
    }

    throw error;
  }
}

/**
 * Check if a market is currently active and tradeable
 */
function isMarketActive(market: GammaMarket): boolean {
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
 * Normalize Gamma API market data to our database format
 */
function normalizeMarket(gammaMarket: GammaMarket): MarketRecord {
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

    // Find the "Yes" outcome (case-insensitive)
    if (outcomes.length > 0 && prices.length > 0) {
      const yesIndex = outcomes.findIndex(
        outcome => outcome.toLowerCase().trim() === 'yes'
      );

      if (yesIndex !== -1 && yesIndex < prices.length) {
        const priceStr = prices[yesIndex];
        const parsed = parseFloat(priceStr);
        // Validate: must be a number AND between 0 and 1 (inclusive)
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
          yesPrice = parsed;
        }
      }
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
async function upsertMarketsToSupabase(markets: MarketRecord[]): Promise<void> {
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
 * Main execution function
 */
async function main() {
  try {
    console.log('=== Polymarket Data Ingestion Starting ===');

    // Fetch markets from Gamma API
    const gammaMarkets = await fetchFromGammaAPI();
    console.log(`Total fetched: ${gammaMarkets.length}`);

    if (gammaMarkets.length === 0) {
      console.warn('No markets received from Gamma API');
      return;
    }

    // Filter to keep only active/tradeable markets
    const activeMarkets = gammaMarkets.filter(isMarketActive);
    console.log(`Total kept after filtering: ${activeMarkets.length} (filtered out ${gammaMarkets.length - activeMarkets.length} inactive markets)`);

    if (activeMarkets.length === 0) {
      console.warn('No active markets after filtering');
      return;
    }

    // Normalize to our format
    const normalizedMarkets = activeMarkets.map(normalizeMarket);

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

    // Upsert to Supabase
    await upsertMarketsToSupabase(marketsForDb);
    console.log(`Total upserted: ${normalizedMarkets.length}`);

    console.log('=== Data Ingestion Completed Successfully ===');
  } catch (error) {
    console.error('=== Data Ingestion Failed ===');
    console.error(error);
    process.exit(1);
  }
}

// Run the script
main();
