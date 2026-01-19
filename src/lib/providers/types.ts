/**
 * Normalized Market type used across the application
 */
export type Market = {
  id: string;
  title: string;
  url: string;
  yesPrice: number; // 0..1 (display as percentage)
  volumeUsd?: number;
};

/**
 * Markets response with metadata
 */
export type MarketsResponse = {
  markets: Market[];
  lastUpdatedAt: string | null;
};

/**
 * Data provider interface for fetching markets
 */
export interface MarketProvider {
  getMarkets(limit?: number): Promise<MarketsResponse>;
}

/**
 * Database row structure from Supabase
 */
export type MarketRow = {
  id: string;
  title: string;
  url: string;
  yes_price: number | null;
  volume_usd: number | null;
  updated_at: string;
};
