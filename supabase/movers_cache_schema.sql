-- Movers Cache Table
-- Stores pre-computed movers to avoid expensive RPC calls on demand
-- Updated periodically by GitHub Actions workflow (every 15 minutes)

-- Create the movers_cache table
CREATE TABLE IF NOT EXISTS public.movers_cache (
  window TEXT PRIMARY KEY,                          -- '1h', '6h', '24h'
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),  -- When cache was computed
  params JSONB NOT NULL DEFAULT '{}'::JSONB,        -- Computation parameters (filters, thresholds)
  top_gainers JSONB NOT NULL DEFAULT '[]'::JSONB,   -- Array of top gainers
  top_losers JSONB NOT NULL DEFAULT '[]'::JSONB     -- Array of top losers
);

-- Index for efficient queries by freshness
CREATE INDEX IF NOT EXISTS idx_movers_cache_generated_at
  ON public.movers_cache(generated_at DESC);

-- Disable RLS for simplicity (matches markets table approach)
ALTER TABLE public.movers_cache DISABLE ROW LEVEL SECURITY;

-- Grant read access to anon and authenticated roles
GRANT SELECT ON public.movers_cache TO anon, authenticated;

-- Grant write access to service role (for cache updates from GitHub Actions)
GRANT INSERT, UPDATE, DELETE ON public.movers_cache TO service_role;

-- Add comment describing the table
COMMENT ON TABLE public.movers_cache IS
  'Pre-computed movers cache to avoid expensive RPC calls. Updated every 15 minutes by GitHub Actions.';

COMMENT ON COLUMN public.movers_cache.window IS
  'Time window: 1h, 6h, or 24h';

COMMENT ON COLUMN public.movers_cache.params IS
  'JSON object with computation parameters: { min_volume, min_change_pp, price_range, etc. }';

COMMENT ON COLUMN public.movers_cache.top_gainers IS
  'JSON array of top gaining markets with full MoverData objects';

COMMENT ON COLUMN public.movers_cache.top_losers IS
  'JSON array of top losing markets with full MoverData objects';
