/**
 * Categories Module - Market Categorization for Polymarket
 *
 * This module provides:
 * - Market categorization based on keywords
 * - Allowlist filtering for snapshot ingestion
 * - Sports detection for hard exclusion
 */

export {
  categorizeMarket,
  categorizeMarkets,
  isCategoryAllowed,
  getAllowedCategories,
  getCategorizationStats,
  ALLOWED_CATEGORIES,
  OPTIONAL_CATEGORIES,
  type MarketCategory,
  type CategorizationResult,
} from './categorizeMarket';

export {
  SPORTS_KEYWORDS,
  CATEGORY_KEYWORDS,
} from './keywords';
