import { createClient } from '@supabase/supabase-js';
import { Market, MarketProvider, MarketRow, MarketsResponse } from './types';

/**
 * Supabase-based market provider
 * Fetches market data from Supabase database
 */
export class SupabaseMarketProvider implements MarketProvider {
  private supabase;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Fetch markets from Supabase, ordered by most recently updated
   * Excludes markets with NULL yes_price
   */
  async getMarkets(limit: number = 10): Promise<MarketsResponse> {
    try {
      const { data, error } = await this.supabase
        .from('markets')
        .select('*')
        .not('yes_price', 'is', null)
        .order('updated_at', { ascending: false })
        .order('volume_usd', { ascending: false, nullsFirst: false })
        .limit(limit);

      if (error) {
        console.error('Supabase error:', error);
        throw new Error(`Failed to fetch markets: ${error.message}`);
      }

      if (!data || data.length === 0) {
        return { markets: [], lastUpdatedAt: null };
      }

      // Normalize database rows to Market type
      const markets = data.map((row: MarketRow) => this.normalizeMarket(row));

      // Calculate lastUpdatedAt from the most recent updated_at
      const lastUpdatedAt = data.reduce((latest: string | null, row: MarketRow) => {
        if (!latest || row.updated_at > latest) {
          return row.updated_at;
        }
        return latest;
      }, null);

      return { markets, lastUpdatedAt };
    } catch (error) {
      console.error('Error fetching markets from Supabase:', error);
      throw error;
    }
  }

  /**
   * Normalize database row to Market type
   * Override URL to use search fallback to prevent 404s
   */
  private normalizeMarket(row: MarketRow): Market {
    // Always use search URL to prevent 404s on event/market pages
    const searchUrl = `https://polymarket.com/search?q=${encodeURIComponent(row.title)}`;

    return {
      id: row.id,
      title: row.title,
      url: searchUrl,
      yesPrice: row.yes_price ?? 0,
      volumeUsd: row.volume_usd ?? undefined,
    };
  }
}
