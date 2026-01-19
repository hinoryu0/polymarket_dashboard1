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
};

// Configuration
const GAMMA_API_URL = 'https://gamma-api.polymarket.com/markets';
const FETCH_TIMEOUT = 10000; // 10 seconds
const MAX_RETRIES = 1;

/**
 * Fetch markets from Gamma API with timeout and retry
 */
async function fetchFromGammaAPI(retryCount = 0): Promise<GammaMarket[]> {
  try {
    console.log(`Fetching markets from Gamma API (attempt ${retryCount + 1})...`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    const response = await fetch(GAMMA_API_URL, {
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
 * Normalize Gamma API market data to our database format
 */
function normalizeMarket(gammaMarket: GammaMarket): MarketRecord {
  // Extract yes price (first outcome price, usually "Yes")
  let yesPrice: number | null = null;
  if (gammaMarket.outcomePrices && gammaMarket.outcomePrices.length > 0) {
    const priceStr = gammaMarket.outcomePrices[0];
    const parsed = parseFloat(priceStr);
    if (!isNaN(parsed)) {
      yesPrice = parsed;
    }
  }

  // Extract volume
  let volumeUsd: number | null = null;
  if (gammaMarket.volume) {
    const parsed = parseFloat(gammaMarket.volume);
    if (!isNaN(parsed)) {
      volumeUsd = parsed;
    }
  }

  // Build market URL
  const slug = gammaMarket.slug || gammaMarket.id;
  const url = `https://polymarket.com/event/${slug}`;

  return {
    id: gammaMarket.id,
    title: gammaMarket.question || 'Untitled Market',
    url,
    yes_price: yesPrice,
    volume_usd: volumeUsd,
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

    if (gammaMarkets.length === 0) {
      console.warn('No markets received from Gamma API');
      return;
    }

    // Normalize to our format
    const normalizedMarkets = gammaMarkets.map(normalizeMarket);

    // Upsert to Supabase
    await upsertMarketsToSupabase(normalizedMarkets);

    console.log('=== Data Ingestion Completed Successfully ===');
    console.log(`Total markets processed: ${normalizedMarkets.length}`);
  } catch (error) {
    console.error('=== Data Ingestion Failed ===');
    console.error(error);
    process.exit(1);
  }
}

// Run the script
main();
