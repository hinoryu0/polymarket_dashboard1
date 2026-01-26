/**
 * Market Categorization Module
 *
 * Categorizes Polymarket markets based on keywords in title/URL.
 * Used to filter snapshot ingestion to only allowed categories.
 *
 * Key features:
 * - Sports keywords trigger HARD EXCLUDE immediately
 * - Confidence scoring: primary keywords = +2, secondary = +1
 * - If highest score < 2, category = null (excluded as unknown)
 * - Returns matched tags for debugging
 */

import {
  type MarketCategory,
  SPORTS_KEYWORDS,
  CATEGORY_KEYWORDS,
} from './keywords';

// Re-export types for convenience
export type { MarketCategory };

// ============================================================================
// Configuration: Allowed Categories
// ============================================================================

/**
 * Categories allowed for snapshot ingestion by default.
 * Markets with category = null or not in this set will be excluded.
 */
export const ALLOWED_CATEGORIES = new Set<MarketCategory>([
  'politics',
  'geopolitics',
  'crypto',
  'world',
  'technology',
  'economy',
  'finance',
]);

/**
 * Optional categories that can be toggled on/off.
 * Set to true to include in allowed categories.
 */
export const OPTIONAL_CATEGORIES: Record<string, boolean> = {
  culture: false,      // Entertainment, media, social trends
  celebrities: false,  // Famous people, influencers
};

/**
 * Get the full set of currently allowed categories.
 */
export function getAllowedCategories(): Set<string> {
  const allowed = new Set<string>(ALLOWED_CATEGORIES);

  // Add optional categories if enabled
  for (const [category, enabled] of Object.entries(OPTIONAL_CATEGORIES)) {
    if (enabled) {
      allowed.add(category);
    }
  }

  return allowed;
}

/**
 * Check if a category is allowed for snapshot ingestion.
 */
export function isCategoryAllowed(category: MarketCategory | null): boolean {
  if (category === null) return false;
  if (category === 'sports') return false; // Sports always excluded
  return getAllowedCategories().has(category);
}

// ============================================================================
// Categorization Result Type
// ============================================================================

export type CategorizationResult = {
  category: MarketCategory | null;
  tags: string[];
  confidence: number;
  reason: string;
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Normalize text for matching: lowercase, trim whitespace
 */
function normalizeText(text: string | null | undefined): string {
  return (text || '').toLowerCase().trim();
}

/**
 * Find all matching keywords in text.
 * Returns array of matched keywords.
 */
function findMatchingKeywords(text: string, keywords: string[]): string[] {
  const matches: string[] = [];

  for (const keyword of keywords) {
    // Use word boundary matching for short keywords to avoid false positives
    // For longer keywords (3+ words or 10+ chars), use simple includes
    const keywordLower = keyword.toLowerCase();

    if (keywordLower.length < 10 && !keywordLower.includes(' ')) {
      // Short single-word keyword: use word boundary
      const regex = new RegExp(`\\b${escapeRegex(keywordLower)}\\b`, 'i');
      if (regex.test(text)) {
        matches.push(keyword);
      }
    } else {
      // Longer keyword or multi-word: use simple includes
      if (text.includes(keywordLower)) {
        matches.push(keyword);
      }
    }
  }

  return matches;
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================================
// Main Categorization Function
// ============================================================================

/**
 * Categorize a market based on its title and URL.
 *
 * Algorithm:
 * 1. Normalize input text (lowercase title + url)
 * 2. Check for sports keywords first (HARD EXCLUDE)
 * 3. Score each category: primary = +2, secondary = +1
 * 4. Pick category with highest score
 * 5. If highest score < 2, return null (unknown/excluded)
 *
 * @param title - The market title/question
 * @param url - The market URL (optional, for additional context)
 * @returns CategorizationResult with category, tags, confidence, and reason
 */
export function categorizeMarket(
  title: string,
  url?: string | null
): CategorizationResult {
  const normalizedTitle = normalizeText(title);
  const normalizedUrl = normalizeText(url);
  const fullText = `${normalizedTitle} ${normalizedUrl}`;

  // Step 1: Check for sports keywords (HARD EXCLUDE)
  const sportsMatches = findMatchingKeywords(fullText, SPORTS_KEYWORDS);
  if (sportsMatches.length > 0) {
    return {
      category: 'sports',
      tags: sportsMatches.slice(0, 10),
      confidence: sportsMatches.length * 2, // High confidence
      reason: 'matched_sports_keywords',
    };
  }

  // Step 2: Score each category
  const categoryScores: Array<{
    category: Exclude<MarketCategory, 'sports'>;
    primaryMatches: string[];
    secondaryMatches: string[];
    score: number;
  }> = [];

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const primaryMatches = findMatchingKeywords(fullText, keywords.primary);
    const secondaryMatches = findMatchingKeywords(fullText, keywords.secondary);

    // Score: primary = +2, secondary = +1
    const score = primaryMatches.length * 2 + secondaryMatches.length;

    if (score > 0) {
      categoryScores.push({
        category: category as Exclude<MarketCategory, 'sports'>,
        primaryMatches,
        secondaryMatches,
        score,
      });
    }
  }

  // Step 3: No matches = null category (excluded as unknown)
  if (categoryScores.length === 0) {
    return {
      category: null,
      tags: [],
      confidence: 0,
      reason: 'no_keyword_matches',
    };
  }

  // Step 4: Sort by score (descending) and pick the best
  categoryScores.sort((a, b) => b.score - a.score);
  const best = categoryScores[0];

  // Step 5: If highest score < 2, return null (weak match = excluded)
  if (best.score < 2) {
    // Combine tags from the weak match for debugging
    const allTags = Array.from(
      new Set([...best.primaryMatches, ...best.secondaryMatches])
    );

    return {
      category: null,
      tags: allTags.slice(0, 10),
      confidence: best.score,
      reason: 'weak_match_score_below_threshold',
    };
  }

  // Step 6: Strong match - return the category
  const allTags = Array.from(
    new Set([...best.primaryMatches, ...best.secondaryMatches])
  );

  return {
    category: best.category,
    tags: allTags.slice(0, 10),
    confidence: best.score,
    reason: 'matched_category_keywords',
  };
}

// ============================================================================
// Batch Categorization & Statistics
// ============================================================================

/**
 * Batch categorize multiple markets.
 */
export function categorizeMarkets(
  markets: Array<{ id: string; title: string; url?: string | null }>
): Map<string, CategorizationResult> {
  const results = new Map<string, CategorizationResult>();

  for (const market of markets) {
    results.set(market.id, categorizeMarket(market.title, market.url));
  }

  return results;
}

/**
 * Get categorization statistics for a list of results.
 */
export function getCategorizationStats(results: CategorizationResult[]): {
  total: number;
  byCategory: Record<string, number>;
  allowed: number;
  excluded: number;
  excludedBySports: number;
  excludedByUnknown: number;
  excludedByNotAllowlisted: number;
  avgConfidence: number;
} {
  const stats = {
    total: results.length,
    byCategory: {} as Record<string, number>,
    allowed: 0,
    excluded: 0,
    excludedBySports: 0,
    excludedByUnknown: 0,
    excludedByNotAllowlisted: 0,
    avgConfidence: 0,
  };

  let totalConfidence = 0;

  for (const result of results) {
    // Count by category
    const categoryKey = result.category || 'null';
    stats.byCategory[categoryKey] = (stats.byCategory[categoryKey] || 0) + 1;

    // Count allowed vs excluded
    if (isCategoryAllowed(result.category)) {
      stats.allowed++;
    } else {
      stats.excluded++;

      // Breakdown exclusion reasons
      if (result.category === 'sports') {
        stats.excludedBySports++;
      } else if (result.category === null) {
        stats.excludedByUnknown++;
      } else {
        stats.excludedByNotAllowlisted++;
      }
    }

    totalConfidence += result.confidence;
  }

  stats.avgConfidence = results.length > 0 ? totalConfidence / results.length : 0;

  return stats;
}

// ============================================================================
// Index Export
// ============================================================================

export { SPORTS_KEYWORDS, CATEGORY_KEYWORDS } from './keywords';
