/**
 * Trader-Grade Keyword Dictionary for Market Categorization
 *
 * Used to categorize Polymarket markets into allowed categories.
 * Each category has primary keywords (high confidence) and secondary keywords (lower confidence).
 *
 * IMPORTANT:
 * - Sports keywords are used for HARD EXCLUSION
 * - Do NOT use generic tokens like "vs", "match", "game", "score", "goals" (too aggressive)
 * - Keywords should be specific enough to avoid false positives
 */

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
  | 'sports';

/**
 * Keywords that HARD EXCLUDE a market (sports).
 * If any of these match, category = 'sports' immediately.
 */
export const SPORTS_KEYWORDS: string[] = [
  // Major leagues
  'nba', 'nfl', 'mlb', 'nhl', 'ufc', 'mma', 'mls', 'epl', 'ucl',
  'premier league', 'champions league', 'la liga', 'serie a', 'bundesliga',
  'ligue 1', 'eredivisie', 'liga mx',

  // Major tournaments
  'world cup', 'euro 2024', 'euro 2025', 'copa america', 'euros',
  'super bowl', 'world series', 'stanley cup', 'march madness',
  'nba finals', 'nfl playoffs', 'mlb playoffs', 'nhl playoffs',
  'wimbledon', 'us open tennis', 'french open', 'australian open',
  'olympics', 'olympic games', 'paralympics',

  // Soccer/Football teams (Europe)
  'chelsea', 'arsenal', 'liverpool', 'man city', 'manchester city',
  'manchester united', 'man united', 'tottenham', 'spurs',
  'barcelona', 'real madrid', 'atletico madrid', 'bayern', 'bayern munich',
  'juventus', 'juve', 'psg', 'paris saint-germain', 'inter milan',
  'ac milan', 'napoli', 'roma', 'borussia dortmund', 'dortmund',
  'ajax', 'benfica', 'porto', 'sporting', 'celtic', 'rangers',

  // NBA teams
  'lakers', 'celtics', 'warriors', 'bulls', 'knicks', 'nets', 'heat',
  'bucks', 'suns', 'mavericks', 'mavs', 'nuggets', 'clippers',
  'sixers', '76ers', 'rockets', 'spurs', 'thunder', 'grizzlies',
  'pelicans', 'timberwolves', 'blazers', 'jazz', 'kings', 'hawks',
  'hornets', 'magic', 'pistons', 'pacers', 'cavs', 'cavaliers', 'raptors', 'wizards',

  // NFL teams
  'chiefs', 'eagles', 'cowboys', 'patriots', '49ers', 'niners',
  'packers', 'steelers', 'ravens', 'bills', 'dolphins', 'jets',
  'bengals', 'browns', 'titans', 'colts', 'texans', 'jaguars',
  'chargers', 'raiders', 'broncos', 'seahawks', 'cardinals', 'rams',
  'bears', 'lions', 'vikings', 'saints', 'falcons', 'panthers',
  'buccaneers', 'bucs', 'commanders', 'giants',

  // MLB teams
  'yankees', 'dodgers', 'red sox', 'cubs', 'mets', 'astros',
  'braves', 'phillies', 'padres', 'mariners', 'orioles', 'rays',
  'blue jays', 'twins', 'guardians', 'white sox', 'tigers', 'royals',
  'angels', 'athletics', 'rangers', 'giants', 'cardinals', 'brewers',
  'reds', 'pirates', 'rockies', 'diamondbacks', 'marlins', 'nationals',

  // NHL teams (common ones)
  'maple leafs', 'canadiens', 'bruins', 'rangers', 'penguins',
  'blackhawks', 'red wings', 'flyers', 'capitals', 'lightning',
  'avalanche', 'golden knights', 'oilers', 'flames', 'canucks',

  // Sports-specific terms (but not too generic)
  'quarterback', 'touchdown', 'rushing yards', 'passing yards',
  'three-pointer', 'slam dunk', 'free throw', 'rebound',
  'home run', 'strikeout', 'batting average', 'era',
  'hat trick', 'penalty kick', 'clean sheet', 'golden boot',
  'knockout', 'submission', 'unanimous decision', 'split decision',
  'grand slam', 'ace', 'break point', 'set point',
  'podium', 'pole position', 'pit stop', 'fastest lap',
  'draft pick', 'free agent', 'trade deadline', 'mvp award',
  'ballon d\'or', 'heisman',
];

/**
 * Category keyword definitions.
 * Each category has primary (high confidence, +2) and secondary (lower confidence, +1) keywords.
 */
export const CATEGORY_KEYWORDS: Record<Exclude<MarketCategory, 'sports'>, {
  primary: string[];
  secondary: string[];
}> = {
  crypto: {
    primary: [
      // Major coins & ecosystems
      'bitcoin', 'btc', 'satoshi', 'sats', 'lightning network',
      'ethereum', 'eth', 'gwei', 'gas fee', 'eip',
      'solana', 'sol',
      'ton', 'the open network', 'toncoin',
      'avalanche', 'avax',
      'polygon', 'matic',
      'chainlink', 'link',
      'arbitrum', 'arb',
      'optimism', 'op token',
      'base chain', 'base network',
      'sui', 'sui network',
      'aptos', 'apt',
      'cardano', 'ada',
      'ripple', 'xrp',
      'bnb', 'binance coin', 'bsc',
      'dogecoin', 'doge',
      'shiba', 'shib',
      'pepe', 'bonk', 'wif', 'memecoin', 'meme coin',
      'litecoin', 'ltc',
      'polkadot', 'dot',
      'cosmos', 'atom',
      'near', 'near protocol',
      'fantom', 'ftm',
      'hedera', 'hbar',
      'algorand', 'algo',
      'tron', 'trx',
      'stellar', 'xlm',
      'vechain', 'vet',
      'filecoin', 'fil',
      'render', 'rndr',
      'injective', 'inj',
      'sei', 'sei network',
      'celestia', 'tia',
      'jup', 'jupiter dex',
      'pyth', 'pyth network',
      'jito',
      'raydium', 'ray',
      'orca',
      'marinade',

      // DeFi & stablecoins
      'stablecoin', 'usdt', 'tether', 'usdc', 'dai', 'frax', 'lusd', 'tusd',
      'depeg', 'depegged', 'peg',
      'defi', 'decentralized finance',
      'dex', 'decentralized exchange',
      'amm', 'automated market maker',
      'liquidity pool', 'lp token', 'impermanent loss',
      'yield farming', 'yield aggregator', 'apy', 'apr',
      'lending protocol', 'borrow rate', 'collateral ratio',
      'liquidation', 'health factor',
      'uniswap', 'uni',
      'aave',
      'maker', 'makerdao', 'mkr',
      'compound', 'comp',
      'curve', 'crv',
      'lido', 'steth', 'liquid staking',
      'eigenlayer', 'restaking',
      'pendle',
      'gmx',
      'dydx',
      'synthetix', 'snx',
      'balancer', 'bal',
      '1inch',
      'sushiswap', 'sushi',
      'pancakeswap', 'cake',
      'trader joe',
      'velodrome',
      'aerodrome',

      // Metrics & events
      'fdv', 'fully diluted', 'fully diluted valuation',
      'mcap', 'market cap', 'circulating supply', 'total supply', 'max supply',
      'token unlock', 'unlock schedule', 'vesting', 'cliff', 'vesting schedule',
      'airdrop', 'airdrop claim', 'airdrop snapshot', 'retroactive airdrop',
      'tge', 'token generation event', 'token launch',
      'presale', 'private sale', 'seed round', 'public sale', 'ido', 'ieo', 'ico',
      'staking', 'stake', 'validator', 'delegation', 'slashing',
      'restaking', 'restaked',
      'token burn', 'burn mechanism', 'deflationary',
      'halving', 'bitcoin halving', 'block reward',
      'ath', 'all-time high', 'atl', 'all-time low',
      'btc dominance', 'eth dominance', 'altseason', 'alt season',
      'inflows', 'outflows', 'exchange inflows', 'exchange outflows',
      'whale', 'whale alert', 'large transaction',
      'on-chain', 'onchain', 'blockchain data',
      'tvl', 'total value locked',
      'gas price', 'gas spike',
      'mev', 'maximal extractable value',
      'layer 2', 'l2', 'rollup', 'zk rollup', 'optimistic rollup',
      'bridge', 'cross-chain', 'multichain',

      // Regulation & institutions
      'sec crypto', 'cftc crypto', 'crypto regulation',
      'bitcoin etf', 'spot etf', 'etf approval', 'etf filing', 'etf deadline',
      'coinbase', 'kraken', 'binance', 'okx', 'bybit', 'bitget', 'kucoin',
      'ftx', 'sbf', 'sam bankman', 'alameda',
      'blackrock bitcoin', 'fidelity bitcoin', 'grayscale', 'gbtc', 'ethe',
      'bitwise', 'vaneck', 'ark invest crypto', 'invesco bitcoin',
      'microstrategy', 'saylor',
      'tether attestation', 'usdt reserves',
      'crypto custody', 'cold storage', 'hardware wallet',
      'crypto exchange', 'cex', 'centralized exchange',
      'crypto tax', 'crypto taxation',
      'cbdc', 'central bank digital',
      'crypto ban', 'crypto legal',
    ],
    secondary: [
      'crypto', 'cryptocurrency', 'blockchain', 'web3', 'nft',
      'token', 'altcoin', 'coin',
      'mining', 'miner', 'hash rate', 'hashrate',
      'wallet', 'metamask', 'phantom', 'ledger', 'trezor',
      'smart contract', 'solidity', 'evm',
      'dao', 'governance token', 'governance proposal',
      'protocol', 'mainnet', 'testnet', 'devnet',
      'node', 'rpc', 'api',
      'mempool', 'confirmation', 'block time',
      'fork', 'hard fork', 'soft fork',
      'rugpull', 'rug pull', 'scam',
      'pump', 'dump', 'pump and dump',
    ],
  },

  politics: {
    primary: [
      // Elections & voting
      'election', 'elections', 'vote', 'voting', 'voter', 'ballot', 'turnout',
      'electoral college', 'electoral vote', 'popular vote',
      'midterm', 'midterms', 'runoff', 'special election',
      'primary', 'primaries', 'caucus', 'caucuses',
      'general election', 'presidential election',

      // Offices & institutions
      'president', 'presidential', 'presidency',
      'prime minister', 'pm',
      'vice president', 'vp',
      'governor', 'gubernatorial',
      'senator', 'senate', 'congressional', 'congress',
      'house of representatives', 'house speaker', 'speaker of the house',
      'parliament', 'parliamentary', 'mp',
      'supreme court', 'scotus', 'justice',
      'attorney general', 'doj',
      'cabinet', 'secretary of state', 'secretary of defense',

      // Campaigns & parties
      'campaign', 'nominee', 'nomination', 'candidacy', 'candidate',
      'poll', 'polling', 'pollster', 'approval rating', 'favorability',
      'democrat', 'democratic', 'dnc',
      'republican', 'gop', 'rnc',
      'conservative', 'labour', 'tory', 'tories', 'liberal',
      'progressive', 'moderate', 'centrist',
      'swing state', 'battleground', 'swing voter',
      'red state', 'blue state', 'purple state',

      // Key figures (US)
      'trump', 'donald trump', 'maga',
      'biden', 'joe biden',
      'harris', 'kamala',
      'desantis', 'ron desantis',
      'newsom', 'gavin newsom',
      'pence', 'mike pence',
      'pelosi', 'nancy pelosi',
      'mcconnell', 'mitch mcconnell',
      'schumer', 'chuck schumer',
      'aoc', 'ocasio-cortez',
      'vivek', 'ramaswamy',
      'haley', 'nikki haley',
      'rfk', 'robert kennedy',

      // Key figures (International)
      'macron', 'starmer', 'sunak', 'trudeau', 'modi', 'lula', 'milei',
      'orban', 'meloni', 'scholz', 'von der leyen',

      // Legal & institutional
      'impeachment', 'impeach',
      'indictment', 'indicted', 'arraignment',
      'conviction', 'convicted', 'acquittal', 'verdict',
      'pardon', 'commute', 'clemency',
      'executive order', 'veto', 'override',
      'filibuster', 'cloture',
      'legislation', 'bill', 'law passed', 'act of congress',
      'constitutional', 'amendment',
      'court ruling', 'court decision', 'overturn',
      'roe v wade', 'dobbs',
      'january 6', 'jan 6', 'capitol riot',
    ],
    secondary: [
      'political', 'politician', 'politics',
      'partisan', 'bipartisan', 'nonpartisan',
      'lobbyist', 'lobbying', 'pac', 'super pac',
      'endorsement', 'endorsed',
      'debate', 'town hall',
      'inauguration', 'sworn in',
      'state of the union', 'sotu',
      'lame duck',
      'gerrymandering', 'redistricting',
    ],
  },

  geopolitics: {
    primary: [
      // Conflict & military
      'war', 'warfare', 'invasion', 'invade',
      'offensive', 'counter-offensive', 'counteroffensive',
      'missile', 'missiles', 'rocket', 'rockets',
      'drone', 'drones', 'drone strike', 'uav',
      'airstrike', 'air strike', 'bombing', 'bombardment',
      'artillery', 'shelling',
      'troops', 'military', 'army', 'navy', 'air force',
      'special forces', 'special operations',
      'tank', 'tanks', 'armored',
      'nuclear weapon', 'nuclear warhead', 'icbm', 'ballistic missile',
      'chemical weapon', 'biological weapon',

      // Peace & diplomacy
      'ceasefire', 'cease-fire', 'truce',
      'peace deal', 'peace agreement', 'peace talks', 'peace negotiations',
      'armistice', 'surrender',
      'treaty', 'accord', 'pact',
      'diplomatic', 'diplomacy', 'diplomat',
      'summit', 'bilateral', 'multilateral',
      'negotiations', 'negotiate',

      // Organizations
      'nato', 'north atlantic treaty',
      'eu', 'european union', 'brussels',
      'un', 'united nations', 'security council', 'unsc',
      'g7', 'g20',
      'asean', 'african union', 'arab league',
      'iaea', 'nuclear agency',
      'who', 'world health organization',
      'imf', 'world bank',

      // Sanctions & trade
      'sanctions', 'sanction', 'sanctioned',
      'embargo', 'oil embargo', 'trade embargo',
      'tariff', 'tariffs', 'trade war',
      'export ban', 'import ban',

      // Ukraine/Russia
      'ukraine', 'ukrainian', 'kyiv', 'kiev',
      'russia', 'russian', 'moscow', 'kremlin',
      'putin', 'zelensky', 'zelenskyy',
      'crimea', 'donbas', 'donetsk', 'luhansk', 'kherson', 'zaporizhzhia',
      'bakhmut', 'mariupol', 'kharkiv', 'odesa', 'odessa',
      'wagner', 'prigozhin',

      // Middle East
      'israel', 'israeli', 'tel aviv', 'jerusalem',
      'gaza', 'gaza strip', 'west bank',
      'hamas', 'hezbollah', 'houthi', 'houthis',
      'netanyahu', 'bibi',
      'iran', 'iranian', 'tehran', 'ayatollah', 'khamenei',
      'nuclear deal', 'jcpoa', 'iran nuclear',
      'syria', 'syrian', 'damascus', 'assad',
      'yemen', 'yemeni', 'sanaa',
      'lebanon', 'lebanese', 'beirut',
      'iraq', 'iraqi', 'baghdad',
      'saudi', 'saudi arabia', 'riyadh', 'mbs', 'mohammed bin salman',
      'uae', 'emirates', 'abu dhabi', 'dubai',
      'qatar', 'doha',
      'jordan', 'egypt', 'cairo', 'sisi',
      'turkey', 'turkish', 'ankara', 'erdogan',

      // Asia
      'china', 'chinese', 'beijing', 'prc',
      'taiwan', 'taiwanese', 'taipei',
      'xi jinping', 'xi', 'ccp', 'chinese communist',
      'south china sea', 'taiwan strait',
      'north korea', 'dprk', 'pyongyang', 'kim jong un', 'kim jong-un',
      'south korea', 'rok', 'seoul',
      'japan', 'japanese', 'tokyo',
      'india', 'indian', 'new delhi',
      'pakistan', 'pakistani', 'islamabad',
      'afghanistan', 'afghan', 'kabul', 'taliban',
      'myanmar', 'burma',
      'philippines', 'manila',
      'vietnam', 'hanoi',
      'indonesia', 'jakarta',

      // Other
      'border', 'territorial', 'territory',
      'annexation', 'annex', 'occupied', 'occupation',
      'coup', 'coup d\'etat', 'military coup',
      'regime', 'regime change', 'overthrow',
      'insurgent', 'insurgency', 'rebel', 'rebellion',
      'terrorism', 'terrorist', 'terror attack',
    ],
    secondary: [
      'geopolitical', 'geopolitics',
      'foreign policy', 'foreign minister', 'foreign affairs',
      'international', 'global',
      'conflict', 'tension', 'crisis', 'escalation', 'de-escalation',
      'ally', 'allies', 'alliance',
      'enemy', 'adversary', 'rival',
      'defense', 'defence', 'security',
      'intelligence', 'spy', 'espionage',
      'humanitarian', 'aid', 'relief',
      'refugee', 'refugees', 'displaced',
    ],
  },

  economy: {
    primary: [
      // Inflation & prices
      'inflation', 'inflationary', 'deflationary', 'deflation',
      'cpi', 'consumer price index', 'pce', 'core inflation',
      'price index', 'price level',
      'cost of living', 'purchasing power',
      'stagflation', 'hyperinflation', 'disinflation',

      // Employment
      'unemployment', 'unemployment rate', 'jobless', 'jobless rate',
      'jobs report', 'job growth', 'job losses',
      'payrolls', 'nonfarm payrolls', 'nonfarm',
      'initial claims', 'jobless claims', 'continuing claims',
      'labor market', 'labor force', 'participation rate',
      'hiring', 'layoffs', 'layoff', 'job cuts',
      'wage growth', 'wages', 'average hourly earnings',

      // GDP & growth
      'gdp', 'gross domestic product', 'gdp growth', 'gdp print',
      'recession', 'recessionary',
      'soft landing', 'hard landing', 'no landing',
      'economic growth', 'economic contraction', 'economic expansion',
      'q1 gdp', 'q2 gdp', 'q3 gdp', 'q4 gdp',

      // Central banks & rates
      'fed', 'federal reserve', 'fomc',
      'powell', 'jay powell', 'jerome powell',
      'interest rate', 'interest rates', 'fed funds', 'fed funds rate',
      'rate cut', 'rate cuts', 'rate hike', 'rate hikes',
      'basis points', 'bps', '25bps', '50bps', '75bps',
      'monetary policy', 'hawkish', 'dovish', 'pivot',
      'quantitative easing', 'qe', 'quantitative tightening', 'qt',
      'balance sheet', 'fed balance sheet',
      'ecb', 'european central bank', 'lagarde',
      'boe', 'bank of england', 'bailey',
      'boj', 'bank of japan',
      'pboc', 'people\'s bank of china',

      // Bonds & yields
      'treasury', 'treasuries', 'treasury yield', 'treasury bond',
      'yield', 'yields', 'bond yield',
      '10-year', '10 year', '10y', 'ten year',
      '2-year', '2 year', '2y', 'two year',
      '30-year', '30 year', '30y',
      'yield curve', 'curve inversion', 'inverted curve', 'uninversion',
      'bond market', 'fixed income',

      // Commodities
      'oil', 'oil price', 'crude oil', 'crude',
      'brent', 'brent crude', 'wti', 'west texas intermediate',
      'gas prices', 'gasoline', 'natural gas', 'lng',
      'opec', 'opec+',
      'gold', 'gold price', 'silver', 'precious metals',
      'copper', 'commodity', 'commodities',

      // Housing
      'housing', 'housing market', 'home prices', 'house prices',
      'mortgage', 'mortgage rates', '30-year mortgage',
      'existing home sales', 'new home sales', 'housing starts',

      // Currency
      'usd', 'us dollar', 'dollar', 'dollar index', 'dxy',
      'euro', 'eur', 'eurusd',
      'gbp', 'pound', 'sterling',
      'yen', 'jpy', 'usdjpy',
      'yuan', 'cny', 'renminbi', 'rmb',
      'currency', 'forex', 'fx',
      'exchange rate',

      // Fiscal
      'debt ceiling', 'debt limit',
      'government shutdown', 'shutdown',
      'fiscal', 'fiscal policy', 'fiscal deficit', 'deficit',
      'surplus', 'budget',
      'national debt', 'debt to gdp',
      'stimulus', 'stimulus check',
      'yellen', 'janet yellen', 'treasury secretary',
    ],
    secondary: [
      'economy', 'economic', 'economist',
      'macro', 'macroeconomic',
      'data', 'economic data', 'data release',
      'forecast', 'projection', 'estimate',
      'consumer', 'consumer spending', 'retail sales',
      'business', 'business cycle',
      'trade', 'trade balance', 'trade deficit', 'trade surplus',
      'export', 'exports', 'import', 'imports',
      'manufacturing', 'pmi', 'ism',
      'services', 'services pmi',
      'confidence', 'consumer confidence', 'business confidence',
      'sentiment', 'economic sentiment',
    ],
  },

  finance: {
    primary: [
      // Earnings & fundamentals
      'earnings', 'earnings report', 'earnings call', 'quarterly earnings',
      'eps', 'earnings per share',
      'revenue', 'revenues', 'top line',
      'profit', 'profits', 'net income', 'bottom line',
      'guidance', 'outlook', 'forecast',
      'beat', 'miss', 'beat estimates', 'miss estimates',
      'margin', 'margins', 'profit margin', 'gross margin', 'operating margin',
      'growth', 'revenue growth', 'yoy', 'year over year', 'qoq',

      // IPOs & deals
      'ipo', 'initial public offering', 'going public', 'direct listing', 'spac',
      'listing', 'listed', 'delist', 'delisting',
      'valuation', 'valued at', 'worth',
      'unicorn', 'decacorn',
      'merger', 'acquisition', 'm&a', 'acquire', 'acquired',
      'buyout', 'leveraged buyout', 'lbo', 'takeover',
      'spin-off', 'spinoff', 'divestiture',
      'tender offer',

      // Distress & restructuring
      'bankruptcy', 'chapter 11', 'chapter 7',
      'restructuring', 'debt restructuring',
      'default', 'defaulted', 'credit default',
      'downgrade', 'upgrade', 'credit rating', 'junk',
      'insolvency', 'insolvent', 'liquidation',

      // Stocks & indices
      'stock', 'stocks', 'share', 'shares', 'equity', 'equities',
      's&p', 's&p 500', 'sp500', 'spx', 'spy',
      'nasdaq', 'nasdaq 100', 'qqq', 'tech stocks',
      'dow', 'dow jones', 'djia',
      'russell', 'russell 2000', 'small cap',
      'index', 'indices',
      'market cap', 'market capitalization', 'mcap',
      'pe ratio', 'p/e', 'price to earnings',
      'ps ratio', 'price to sales',
      'pb ratio', 'price to book',
      'dividend', 'dividends', 'dividend yield', 'payout',
      'buyback', 'share buyback', 'repurchase',
      'split', 'stock split', 'reverse split',

      // Trading & market dynamics
      'bull', 'bullish', 'bull market', 'rally',
      'bear', 'bearish', 'bear market', 'selloff', 'sell-off',
      'correction', 'crash', 'plunge', 'tank', 'tanking',
      'all-time high', 'record high', 'new high', 'ath',
      '52-week high', '52-week low',
      'volatility', 'vix', 'fear index',
      'short', 'short selling', 'short interest', 'short squeeze',
      'margin call', 'forced liquidation',
      'options', 'calls', 'puts', 'strike price', 'expiry', 'expiration',
      'futures', 'futures contract',
      'etf', 'exchange traded fund',
      'hedge fund', 'hedging',
      'institutional', 'retail investor',
      'inflow', 'inflows', 'outflow', 'outflows',

      // Regulation & institutions
      'sec', 'securities', 'securities and exchange',
      'finra', 'cftc',
      'wall street', 'main street',
      'fed', 'federal reserve',
      'insider trading', 'market manipulation',
    ],
    secondary: [
      'market', 'markets', 'financial', 'finance',
      'investor', 'investment', 'investing',
      'trading', 'trade', 'trader',
      'portfolio', 'asset', 'assets',
      'risk', 'risk-on', 'risk-off',
      'capital', 'capital markets',
      'banking', 'bank', 'banks',
      'private equity', 'pe', 'venture capital', 'vc',
      'analyst', 'analysts', 'rating', 'price target',
    ],
  },

  technology: {
    primary: [
      // AI & ML
      'ai', 'artificial intelligence',
      'openai', 'chatgpt', 'gpt', 'gpt-4', 'gpt-5', 'gpt4', 'gpt5',
      'claude', 'anthropic',
      'gemini', 'bard',
      'llm', 'large language model',
      'machine learning', 'ml', 'deep learning',
      'neural network', 'transformer',
      'generative ai', 'gen ai',
      'agi', 'artificial general intelligence',
      'diffusion model', 'stable diffusion', 'midjourney', 'dall-e', 'sora',
      'copilot', 'github copilot',
      'ai safety', 'ai alignment', 'ai regulation',

      // Big tech
      'google', 'alphabet', 'googl', 'goog',
      'microsoft', 'msft', 'azure',
      'apple', 'aapl', 'iphone', 'ipad', 'mac', 'macbook',
      'app store', 'ios', 'macos',
      'amazon', 'amzn', 'aws', 'amazon web services', 'prime',
      'meta', 'facebook', 'fb', 'instagram', 'whatsapp', 'threads',
      'netflix', 'nflx',

      // Social & media
      'tiktok', 'bytedance', 'tiktok ban',
      'twitter', 'x', 'x.com',
      'snap', 'snapchat',
      'youtube', 'yt',
      'spotify',
      'discord',
      'reddit', 'ipo reddit',
      'pinterest',
      'linkedin',

      // Elon companies
      'tesla', 'tsla', 'model 3', 'model y', 'cybertruck', 'fsd', 'autopilot',
      'spacex', 'starship', 'falcon', 'starlink',
      'elon musk', 'elon',
      'neuralink', 'boring company', 'xai',

      // Chips & hardware
      'nvidia', 'nvda', 'gpu', 'cuda', 'h100', 'a100', 'blackwell',
      'amd', 'radeon', 'ryzen', 'epyc',
      'intel', 'intc',
      'tsmc', 'taiwan semiconductor',
      'arm', 'arm holdings',
      'qualcomm', 'qcom', 'snapdragon',
      'broadcom', 'avgo',
      'asml',
      'semiconductor', 'chip', 'chips', 'chipmaker',
      'foundry', 'fab',
      'chip shortage', 'chip ban', 'export controls',

      // Software & cloud
      'cloud', 'cloud computing', 'saas', 'paas', 'iaas',
      'salesforce', 'crm',
      'oracle', 'orcl',
      'adobe', 'adbe',
      'sap',
      'servicenow', 'now',
      'snowflake', 'snow',
      'databricks',
      'palantir', 'pltr',
      'crowdstrike', 'crwd',
      'datadog', 'ddog',
      'mongodb', 'mdb',
      'software', 'enterprise software',

      // Hardware & devices
      'iphone', 'ipad', 'macbook', 'apple watch', 'airpods',
      'android', 'pixel', 'samsung galaxy',
      'vision pro', 'ar', 'vr', 'mixed reality', 'headset',
      'wearable', 'wearables', 'smartwatch',
      'pc', 'laptop', 'desktop', 'computer',

      // Mobility & EVs
      'ev', 'electric vehicle', 'electric car',
      'autonomous', 'self-driving', 'robotaxi', 'fsd',
      'waymo', 'cruise', 'zoox', 'mobileye',
      'rivian', 'rivn', 'lucid', 'lcid',
      'nio', 'xpeng', 'byd', 'li auto',
      'charging', 'ev charging', 'supercharger',
      'battery', 'lithium', 'solid state battery',

      // Telecom & connectivity
      '5g', '6g', 'wireless', 'spectrum',
      'starlink', 'satellite internet',
      'fiber', 'broadband',

      // Cyber
      'cybersecurity', 'cyber', 'hack', 'hacked', 'hacker',
      'breach', 'data breach', 'ransomware', 'malware',
      'outage', 'down', 'service outage',
      'ddos', 'cyber attack', 'cyberattack',

      // Regulation
      'antitrust', 'monopoly', 'anti-competitive',
      'tech regulation', 'big tech',
      'section 230', 'content moderation',
      'gdpr', 'data privacy', 'privacy',
    ],
    secondary: [
      'tech', 'technology', 'technical',
      'startup', 'startups', 'silicon valley',
      'innovation', 'innovative', 'disruptive',
      'digital', 'digitization',
      'platform', 'ecosystem',
      'app', 'application', 'mobile app',
      'developer', 'developers', 'dev',
      'api', 'sdk',
      'algorithm', 'algorithmic',
      'data', 'big data', 'analytics',
      'automation', 'automate',
      'robotics', 'robot',
    ],
  },

  world: {
    primary: [
      // Natural disasters
      'earthquake', 'quake', 'seismic', 'richter', 'magnitude',
      'tsunami',
      'hurricane', 'typhoon', 'cyclone', 'tropical storm',
      'tornado', 'tornadoes',
      'flood', 'flooding', 'flash flood',
      'wildfire', 'wildfire', 'forest fire', 'bushfire',
      'drought',
      'volcano', 'volcanic', 'eruption',
      'landslide', 'mudslide',
      'avalanche',
      'heat wave', 'heatwave', 'cold snap', 'polar vortex',

      // Climate
      'climate', 'climate change', 'global warming',
      'carbon', 'carbon emissions', 'greenhouse gas', 'co2',
      'net zero', 'carbon neutral', 'decarbonization',
      'paris agreement', 'cop28', 'cop29', 'climate summit',
      'renewable', 'renewable energy', 'solar', 'wind power',
      'fossil fuel', 'coal', 'oil', 'natural gas',
      'ev', 'electric vehicle',
      'sustainability', 'sustainable',

      // Health & pandemics
      'pandemic', 'epidemic', 'outbreak',
      'virus', 'viral', 'infectious', 'contagious',
      'covid', 'coronavirus', 'sars', 'mers',
      'vaccine', 'vaccination', 'vaccinated', 'booster',
      'lockdown', 'quarantine', 'isolation',
      'who', 'world health organization', 'cdc',
      'monkeypox', 'mpox', 'bird flu', 'h5n1', 'avian flu',
      'disease x',

      // Humanitarian
      'humanitarian', 'humanitarian crisis',
      'famine', 'hunger', 'starvation', 'food crisis',
      'refugee', 'refugees', 'displaced', 'asylum',
      'migration', 'migrants', 'immigration',
      'aid', 'relief', 'rescue',
      'death toll', 'casualties', 'fatalities',
      'red cross', 'un relief', 'unhcr',

      // Social movements
      'protest', 'protests', 'demonstration', 'rally',
      'riot', 'riots', 'unrest', 'civil unrest',
      'strike', 'general strike', 'labor strike',
      'revolution', 'uprising',
      'movement', 'activism', 'activist',

      // Crime & security
      'shooting', 'mass shooting', 'gun violence',
      'terror', 'terrorist', 'terrorism', 'attack',
      'bombing', 'explosion',
      'assassination', 'assassinated',
      'kidnapping', 'hostage',
      'cartel', 'drug trafficking',
    ],
    secondary: [
      'global', 'worldwide', 'international', 'world',
      'foreign', 'overseas',
      'disaster', 'emergency', 'crisis', 'catastrophe',
      'affected', 'impact', 'impacted',
      'recovery', 'rebuilding', 'reconstruction',
      'warning', 'alert', 'evacuation',
      'ngo', 'charity', 'donation',
    ],
  },

  culture: {
    primary: [
      // Awards
      'oscar', 'oscars', 'academy award', 'academy awards',
      'grammy', 'grammys',
      'emmy', 'emmys',
      'golden globe', 'golden globes',
      'bafta', 'baftas',
      'tony', 'tonys', 'tony award',
      'cannes', 'sundance', 'venice film',
      'best picture', 'best director', 'best actor', 'best actress',
      'album of the year', 'song of the year', 'record of the year',

      // Entertainment
      'box office', 'opening weekend', 'blockbuster',
      'movie', 'film', 'cinema',
      'streaming', 'netflix', 'disney+', 'hbo max', 'amazon prime',
      'album', 'single', 'chart', 'billboard',
      'concert', 'tour', 'festival',
      'coachella', 'glastonbury', 'lollapalooza',
      'super bowl halftime', 'met gala',
      'premiere', 'release', 'debut',
      'sequel', 'franchise', 'remake', 'reboot',

      // Media & trends
      'viral', 'trending', 'meme', 'social media',
      'influencer', 'content creator', 'youtuber', 'streamer', 'twitch',
      'podcast', 'podcaster',
      'tiktok', 'instagram', 'twitter', 'x',
    ],
    secondary: [
      'entertainment', 'celebrity', 'star', 'famous',
      'hollywood', 'bollywood',
      'music', 'musician', 'artist', 'band',
      'tv', 'television', 'show', 'series',
      'drama', 'comedy', 'thriller', 'horror',
      'documentary', 'docuseries',
      'novel', 'book', 'author', 'bestseller',
      'art', 'artist', 'exhibition', 'museum',
    ],
  },

  celebrities: {
    primary: [
      // Musicians
      'taylor swift', 'swifties', 'eras tour',
      'beyonce', 'beyhive',
      'drake', 'drizzy',
      'kanye', 'ye', 'yeezy',
      'rihanna', 'fenty',
      'ed sheeran',
      'adele',
      'bad bunny',
      'the weeknd',
      'billie eilish',
      'dua lipa',
      'harry styles',
      'ariana grande',
      'post malone',
      'travis scott',
      'doja cat',
      'sza',
      'kendrick lamar',
      'j cole',

      // Actors
      'leonardo dicaprio', 'dicaprio',
      'tom cruise',
      'brad pitt',
      'johnny depp',
      'will smith',
      'dwayne johnson', 'the rock',
      'ryan reynolds',
      'keanu reeves',
      'margot robbie',
      'scarlett johansson',
      'jennifer lawrence',
      'zendaya',
      'timothee chalamet',
      'tom holland',
      'florence pugh',

      // Influencers & media
      'kardashian', 'kardashians',
      'kylie jenner', 'kendall jenner', 'kim kardashian',
      'mrbeast', 'mr beast',
      'pewdiepie',
      'logan paul', 'jake paul',
      'joe rogan',

      // Athletes (as celebrities, not sports markets)
      'lebron james', 'lebron',
      'cristiano ronaldo', 'ronaldo',
      'lionel messi', 'messi',
      'serena williams',
      'tiger woods',
      'tom brady',
      'michael jordan', 'mj',
      'conor mcgregor',

      // Business celebrities
      'elon musk', 'musk',
      'jeff bezos', 'bezos',
      'mark zuckerberg', 'zuck',
      'bill gates',
      'warren buffett',

      // Royals
      'prince harry', 'meghan markle', 'meghan',
      'prince william', 'kate middleton', 'kate',
      'king charles', 'queen elizabeth',
      'royal family', 'royals', 'windsor',
    ],
    secondary: [
      'celebrity', 'celebrities', 'celeb',
      'famous', 'fame', 'star', 'stars',
      'a-list', 'household name',
      'wedding', 'married', 'divorce', 'divorced',
      'dating', 'relationship', 'couple', 'split', 'breakup',
      'pregnant', 'pregnancy', 'baby', 'child',
      'scandal', 'controversy', 'controversial',
      'net worth', 'rich list', 'billionaire',
      'red carpet', 'paparazzi',
      'interview', 'exclusive',
    ],
  },
};
