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
  category?: string | null;  // Market category (politics, crypto, etc.) or null if excluded
  tags?: string[] | null;    // Array of keyword tags for the market
  updated_at?: string;
  _urlSource?: string;       // Temporary field for logging
  _categorizationConfidence?: string; // Temporary field for logging
};

export type IngestionResult = {
  marketsUpserted: number;
  snapshotsInserted: number;
  snapshotsSkippedByCategory: number;  // Snapshots skipped due to excluded category
  snapshotsSkippedByPrice: number;     // Snapshots skipped due to price filter
  fetchedMarketsTotal: number;
  keptMarketsTotal: number;
  filteredInactiveCount: number;
  filteredSportsCount: number;
  // Categorization stats
  categorizedMarkets: number;          // Markets with non-null category
  allowedCategoryMarkets: number;      // Markets in allowed categories
  excludedCategoryMarkets: number;     // Markets excluded by category
  categoryBreakdown: Record<string, number>; // Count per category
  lastSnapshotCreatedAt: string | null;
};
