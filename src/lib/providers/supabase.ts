import { createClient } from '@supabase/supabase-js';
import { Market, MarketProvider, MarketRow } from './types';

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
   */
  async getMarkets(limit: number = 10): Promise<Market[]> {
    try {
      const { data, error } = await this.supabase
        .from('markets')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Supabase error:', error);
        throw new Error(`Failed to fetch markets: ${error.message}`);
      }

      if (!data) {
        return [];
      }

      // Normalize database rows to Market type
      return data.map((row: MarketRow) => this.normalizeMarket(row));
    } catch (error) {
      console.error('Error fetching markets from Supabase:', error);
      throw error;
    }
  }

  /**
   * Normalize database row to Market type
   */
  private normalizeMarket(row: MarketRow): Market {
    return {
      id: row.id,
      title: row.title,
      url: row.url,
      yesPrice: row.yes_price ?? 0,
      volumeUsd: row.volume_usd ?? undefined,
    };
  }
}
