/**
 * Market Categorization Module
 *
 * Categorizes Polymarket markets based on keywords in title/URL.
 * Used to filter snapshot ingestion to only allowed categories.
 *
 * Categories:
 * - politics: Elections, politicians, political events
 * - geopolitics: International relations, wars, treaties
 * - crypto: Cryptocurrency, blockchain, DeFi
 * - world: Global events, disasters, international news
 * - technology: Tech companies, AI, innovation
 * - economy: Economic indicators, jobs, GDP
 * - finance: Markets, stocks, IPOs, earnings
 * - culture: Entertainment, media, social trends
 * - celebrities: Famous people, influencers
 * - NULL: Excluded (sports, low-quality, uncertain)
 */

// ============================================================================
// Configuration: Allowed Categories
// ============================================================================

/**
 * Categories allowed for snapshot ingestion.
 * Markets not matching these categories will have category = NULL.
 */
export const ALLOWED_CATEGORIES = [
  'politics',
  'geopolitics',
  'crypto',
  'world',
  'technology',
  'economy',
  'finance',
] as const;

/**
 * Optional categories that can be toggled on/off.
 * Set to true to include in allowed categories.
 */
export const OPTIONAL_CATEGORIES = {
  culture: false,      // Entertainment, media, social trends
  celebrities: false,  // Famous people, influencers
} as const;

/**
 * Get the full list of currently allowed categories.
 */
export function getAllowedCategories(): string[] {
  const allowed: string[] = [...ALLOWED_CATEGORIES];

  // Add optional categories if enabled
  for (const [category, enabled] of Object.entries(OPTIONAL_CATEGORIES)) {
    if (enabled) {
      allowed.push(category);
    }
  }

  return allowed;
}

// ============================================================================
// Category Type
// ============================================================================

export type MarketCategory =
  | 'politics'
  | 'geopolitics'
  | 'crypto'
  | 'world'
  | 'technology'
  | 'economy'
  | 'finance'
  | 'culture'
  | 'celebrities'
  | null;

export type CategorizationResult = {
  category: MarketCategory;
  tags: string[];
  confidence: 'high' | 'medium' | 'low';
};

// ============================================================================
// Keyword Definitions
// ============================================================================

/**
 * Keywords that EXCLUDE a market (sports, gambling, etc.)
 * These take priority over category keywords.
 */
const EXCLUSION_KEYWORDS = [
  // Sports leagues
  'nba', 'nfl', 'mlb', 'nhl', 'ufc', 'mma', 'fifa', 'mls',
  'premier league', 'champions league', 'la liga', 'serie a', 'bundesliga',
  'world cup', 'euro 2024', 'euro 2025', 'copa america',
  'super bowl', 'world series', 'stanley cup', 'march madness',

  // Sports teams (major ones)
  'lakers', 'celtics', 'warriors', 'bulls', 'knicks', 'nets', 'heat', 'bucks',
  'yankees', 'dodgers', 'red sox', 'cubs', 'mets', 'astros',
  'chiefs', 'eagles', 'cowboys', 'patriots', '49ers', 'packers',
  'chelsea', 'arsenal', 'liverpool', 'man city', 'man united', 'tottenham',
  'real madrid', 'barcelona', 'bayern', 'juventus', 'psg', 'inter milan',

  // Sports terms
  'playoff', 'playoffs', 'championship game', 'finals mvp',
  'rushing yards', 'passing yards', 'touchdowns', 'home runs',
  'goals scored', 'assists', 'rebounds', 'three-pointers',

  // Entertainment/reality TV low quality
  'bachelor', 'bachelorette', 'love island', 'survivor',
  'big brother', 'american idol', 'the voice',
];

/**
 * Category keyword definitions.
 * Each category has primary keywords (high confidence) and secondary keywords (medium confidence).
 */
const CATEGORY_KEYWORDS: Record<string, { primary: string[]; secondary: string[] }> = {
  politics: {
    primary: [
      'election', 'president', 'presidential', 'senate', 'congress', 'house of representatives',
      'governor', 'mayor', 'primary', 'caucus', 'electoral college', 'electoral vote',
      'democrat', 'republican', 'gop', 'dnc', 'rnc', 'polling', 'poll', 'polls',
      'trump', 'biden', 'harris', 'desantis', 'newsom', 'pence', 'obama',
      'impeachment', 'indictment', 'conviction', 'pardon',
      'legislation', 'bill passed', 'veto', 'executive order',
      'supreme court', 'scotus', 'justice', 'roe v wade',
      'midterm', 'runoff', 'ballot', 'vote', 'voter', 'voting',
    ],
    secondary: [
      'political', 'politician', 'campaign', 'nomination', 'nominee',
      'approval rating', 'favorability', 'party', 'partisan',
      'conservative', 'liberal', 'progressive', 'moderate',
    ],
  },

  geopolitics: {
    primary: [
      'war', 'ceasefire', 'invasion', 'military', 'troops', 'missile', 'drone strike',
      'sanction', 'sanctions', 'embargo', 'tariff', 'tariffs',
      'nato', 'un', 'united nations', 'security council', 'g7', 'g20',
      'ukraine', 'russia', 'putin', 'zelensky', 'kyiv', 'crimea', 'donbas',
      'israel', 'gaza', 'hamas', 'hezbollah', 'netanyahu', 'palestinian',
      'china', 'taiwan', 'xi jinping', 'ccp', 'south china sea',
      'iran', 'nuclear deal', 'ayatollah', 'tehran',
      'north korea', 'kim jong', 'pyongyang', 'icbm',
      'syria', 'afghanistan', 'iraq', 'yemen', 'libya',
      'border', 'territorial', 'annexation', 'occupation',
    ],
    secondary: [
      'diplomatic', 'diplomacy', 'treaty', 'agreement', 'alliance',
      'conflict', 'tension', 'crisis', 'escalation', 'de-escalation',
      'foreign policy', 'international', 'geopolitical',
    ],
  },

  crypto: {
    primary: [
      'bitcoin', 'btc', 'ethereum', 'eth', 'solana', 'sol', 'xrp', 'ripple',
      'crypto', 'cryptocurrency', 'blockchain', 'defi', 'nft',
      'binance', 'coinbase', 'kraken', 'ftx', 'sbf', 'cz',
      'memecoin', 'meme coin', 'dogecoin', 'doge', 'shiba',
      'stablecoin', 'usdt', 'usdc', 'tether',
      'bitcoin etf', 'spot etf', 'crypto etf',
      'sec crypto', 'gensler', 'crypto regulation',
      'halving', 'mining', 'hash rate', 'proof of stake',
    ],
    secondary: [
      'token', 'altcoin', 'web3', 'dao', 'smart contract',
      'wallet', 'exchange', 'trading', 'liquidity',
    ],
  },

  technology: {
    primary: [
      'ai', 'artificial intelligence', 'openai', 'chatgpt', 'gpt-4', 'gpt-5', 'claude',
      'google', 'alphabet', 'microsoft', 'apple', 'amazon', 'meta', 'facebook',
      'nvidia', 'amd', 'intel', 'tsmc', 'chip', 'semiconductor',
      'tesla', 'elon musk', 'spacex', 'starlink', 'neuralink', 'boring company',
      'tiktok', 'tiktok ban', 'bytedance',
      'twitter', 'x.com', 'threads', 'instagram', 'snapchat',
      'app store', 'play store', 'antitrust', 'monopoly',
      'iphone', 'android', 'ios', 'vision pro', 'ar', 'vr',
      'self-driving', 'autonomous', 'robotaxi', 'waymo', 'cruise',
    ],
    secondary: [
      'tech', 'technology', 'software', 'hardware', 'startup', 'silicon valley',
      'data', 'cloud', 'saas', 'platform', 'digital',
      'cybersecurity', 'hack', 'breach', 'ransomware',
    ],
  },

  economy: {
    primary: [
      'inflation', 'cpi', 'pce', 'consumer price', 'price index',
      'fed', 'federal reserve', 'fomc', 'interest rate', 'rate cut', 'rate hike',
      'powell', 'yellen', 'treasury',
      'jobs report', 'unemployment', 'jobless', 'payroll', 'labor',
      'gdp', 'recession', 'growth', 'economic growth',
      'debt ceiling', 'government shutdown', 'fiscal', 'deficit', 'surplus',
      'trade deficit', 'trade balance', 'import', 'export',
    ],
    secondary: [
      'economy', 'economic', 'monetary', 'fiscal policy',
      'wage', 'income', 'consumer', 'spending', 'retail sales',
      'housing', 'real estate', 'mortgage', 'home prices',
    ],
  },

  finance: {
    primary: [
      'stock', 'stocks', 's&p', 's&p 500', 'sp500', 'nasdaq', 'dow jones', 'dow',
      'ipo', 'spac', 'merger', 'acquisition', 'm&a',
      'earnings', 'revenue', 'profit', 'eps', 'guidance',
      'market cap', 'valuation', 'pe ratio',
      'bankruptcy', 'chapter 11', 'default', 'debt restructuring',
      'bond', 'yield', 'treasury yield', '10-year', '2-year',
      'hedge fund', 'private equity', 'venture capital', 'vc',
      'wall street', 'sec', 'securities',
    ],
    secondary: [
      'market', 'markets', 'trading', 'investor', 'investment',
      'bullish', 'bearish', 'rally', 'crash', 'correction',
      'dividend', 'buyback', 'share price',
    ],
  },

  world: {
    primary: [
      'earthquake', 'tsunami', 'hurricane', 'typhoon', 'tornado', 'flood',
      'wildfire', 'climate', 'climate change', 'global warming', 'carbon',
      'pandemic', 'epidemic', 'outbreak', 'virus', 'vaccine', 'who',
      'refugee', 'migration', 'asylum', 'immigration',
      'terrorism', 'terrorist', 'attack', 'bombing',
      'coup', 'revolution', 'protest', 'uprising', 'civil war',
      'famine', 'drought', 'humanitarian', 'aid',
    ],
    secondary: [
      'global', 'worldwide', 'international', 'foreign',
      'disaster', 'emergency', 'crisis', 'catastrophe',
      'un', 'red cross', 'ngo',
    ],
  },

  culture: {
    primary: [
      'oscar', 'oscars', 'academy award', 'grammy', 'emmy', 'golden globe',
      'box office', 'movie', 'film', 'netflix', 'disney', 'hbo', 'streaming',
      'album', 'song', 'billboard', 'spotify', 'concert', 'tour',
      'super bowl halftime', 'met gala', 'coachella',
      'viral', 'trending', 'meme', 'social media',
    ],
    secondary: [
      'entertainment', 'celebrity', 'famous', 'star', 'hollywood',
      'music', 'tv show', 'series', 'premiere',
    ],
  },

  celebrities: {
    primary: [
      'taylor swift', 'beyonce', 'drake', 'kanye', 'ye', 'kardashian', 'jenner',
      'lebron', 'ronaldo', 'messi', 'brady',
      'bezos', 'zuckerberg', 'gates', 'buffett',
      'prince harry', 'meghan markle', 'royal family', 'king charles',
      'joe rogan', 'mr beast', 'pewdiepie', 'influencer',
    ],
    secondary: [
      'celebrity', 'famous', 'star', 'icon', 'legend',
      'wedding', 'divorce', 'dating', 'relationship',
    ],
  },
};

// ============================================================================
// Categorization Logic
// ============================================================================

/**
 * Check if a market should be excluded based on exclusion keywords.
 */
function shouldExclude(text: string): boolean {
  const lowerText = text.toLowerCase();

  for (const keyword of EXCLUSION_KEYWORDS) {
    if (lowerText.includes(keyword.toLowerCase())) {
      return true;
    }
  }

  return false;
}

/**
 * Find matching tags for a given text.
 */
function findMatchingTags(text: string, keywords: string[]): string[] {
  const lowerText = text.toLowerCase();
  const matches: string[] = [];

  for (const keyword of keywords) {
    if (lowerText.includes(keyword.toLowerCase())) {
      matches.push(keyword);
    }
  }

  return matches;
}

/**
 * Categorize a market based on its title and URL.
 *
 * @param title - The market title/question
 * @param url - The market URL (optional, for additional context)
 * @returns CategorizationResult with category, tags, and confidence
 */
export function categorizeMarket(title: string, url?: string): CategorizationResult {
  const text = `${title} ${url || ''}`.toLowerCase();

  // Step 1: Check exclusions first
  if (shouldExclude(text)) {
    return {
      category: null,
      tags: ['excluded'],
      confidence: 'high',
    };
  }

  // Step 2: Find category matches
  const categoryScores: Array<{
    category: MarketCategory;
    primaryMatches: string[];
    secondaryMatches: string[];
    score: number;
  }> = [];

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const primaryMatches = findMatchingTags(text, keywords.primary);
    const secondaryMatches = findMatchingTags(text, keywords.secondary);

    // Score: primary matches worth 2 points, secondary worth 1
    const score = primaryMatches.length * 2 + secondaryMatches.length;

    if (score > 0) {
      categoryScores.push({
        category: category as MarketCategory,
        primaryMatches,
        secondaryMatches,
        score,
      });
    }
  }

  // Step 3: No matches = NULL category (excluded)
  if (categoryScores.length === 0) {
    return {
      category: null,
      tags: ['uncategorized'],
      confidence: 'low',
    };
  }

  // Step 4: Sort by score (descending) and pick the best
  categoryScores.sort((a, b) => b.score - a.score);
  const best = categoryScores[0];

  // Combine all matched tags
  const allTags = Array.from(new Set([...best.primaryMatches, ...best.secondaryMatches]));

  // Determine confidence
  let confidence: 'high' | 'medium' | 'low';
  if (best.primaryMatches.length >= 2) {
    confidence = 'high';
  } else if (best.primaryMatches.length >= 1) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  return {
    category: best.category,
    tags: allTags.slice(0, 10), // Limit to 10 tags
    confidence,
  };
}

/**
 * Check if a category is allowed for snapshot ingestion.
 */
export function isCategoryAllowed(category: MarketCategory): boolean {
  if (category === null) {
    return false;
  }

  const allowed = getAllowedCategories();
  return allowed.includes(category);
}

/**
 * Batch categorize multiple markets.
 */
export function categorizeMarkets(
  markets: Array<{ title: string; url?: string }>
): Map<string, CategorizationResult> {
  const results = new Map<string, CategorizationResult>();

  for (const market of markets) {
    const key = `${market.title}|${market.url || ''}`;
    results.set(key, categorizeMarket(market.title, market.url));
  }

  return results;
}

/**
 * Get categorization statistics for a list of markets.
 */
export function getCategorizationStats(
  results: CategorizationResult[]
): {
  total: number;
  byCategory: Record<string, number>;
  allowed: number;
  excluded: number;
  byConfidence: Record<string, number>;
} {
  const stats = {
    total: results.length,
    byCategory: {} as Record<string, number>,
    allowed: 0,
    excluded: 0,
    byConfidence: {} as Record<string, number>,
  };

  for (const result of results) {
    // Count by category
    const categoryKey = result.category || 'null';
    stats.byCategory[categoryKey] = (stats.byCategory[categoryKey] || 0) + 1;

    // Count allowed vs excluded
    if (isCategoryAllowed(result.category)) {
      stats.allowed++;
    } else {
      stats.excluded++;
    }

    // Count by confidence
    stats.byConfidence[result.confidence] = (stats.byConfidence[result.confidence] || 0) + 1;
  }

  return stats;
}
