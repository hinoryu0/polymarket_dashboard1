/**
 * Shared types for market data ingestion
 */

// Types for Gamma API response
export type GammaMarket = {
  id: string;
  question: string;
  slug?: string;
  outcomes?: string[];
  outcomePrices?: string[];
  volume?: string;
  [key: string]: any;
};

export type MarketRecord = {
  id: string;
  title: string;
  url: string;
  yes_price: number | null;
  volume_usd: number | null;
  updated_at?: string;
  _urlSource?: string; // Temporary field for logging
};

export type IngestionResult = {
  marketsUpserted: number;
  snapshotsInserted: number;
};
