-- Optimized RPC function to compute market movers efficiently in SQL
-- CRITICAL: Only scans last 48 hours of price_snapshots to avoid timeouts
--
-- Filters:
--   - Time range: Only snapshots from last 48 hours (matches retention policy)
--   - Big moves only: abs(change_pp) >= 10 (at least 10 percentage points movement)
--   - Price range: Excludes markets with latest price < 5% or > 95% (already decided)
--   - Volume: Window-dependent minimum volume to exclude low-liquidity junk markets
--     * 1h window: >= $1,000
--     * 6h window: >= $5,000
--     * 24h+ window: >= $15,000

CREATE OR REPLACE FUNCTION get_movers(
  window_minutes INTEGER DEFAULT 1440,
  limit_n INTEGER DEFAULT 20
)
RETURNS TABLE (
  market_id TEXT,
  latest_time TIMESTAMPTZ,
  past_time TIMESTAMPTZ,
  yes_now DOUBLE PRECISION,
  yes_past DOUBLE PRECISION,
  change_pp DOUBLE PRECISION,
  delta_minutes INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  max_abs_diff_seconds INTEGER;
  min_volume_usd NUMERIC;
BEGIN
  -- Calculate tolerance based on window size
  -- Tolerance = time distance allowed between past_time and target_time
  max_abs_diff_seconds := CASE
    WHEN window_minutes <= 60 THEN 90 * 60      -- 1h window: ±90 minutes
    WHEN window_minutes <= 360 THEN 180 * 60    -- 6h window: ±180 minutes (3h)
    WHEN window_minutes <= 1440 THEN 480 * 60   -- 24h window: ±480 minutes (8h)
    ELSE (window_minutes * 1.5)::INTEGER * 60   -- Larger windows: 1.5x window
  END;

  -- Calculate minimum volume based on window size
  min_volume_usd := CASE
    WHEN window_minutes <= 60 THEN 1000      -- 1h window: >= $1,000
    WHEN window_minutes <= 360 THEN 5000     -- 6h window: >= $5,000
    ELSE 15000                               -- 24h+ window: >= $15,000
  END;

  RETURN QUERY
  -- CRITICAL: First filter to only last 48 hours to avoid full table scan
  WITH recent_snapshots AS (
    SELECT
      ps.id,
      ps.market_id,
      ps.yes_price,
      ps.volume_usd,
      ps.created_at
    FROM public.price_snapshots ps
    WHERE ps.created_at >= now() - interval '48 hours'
      AND ps.yes_price IS NOT NULL
  ),
  latest_snapshots AS (
    -- Get the most recent snapshot per market (with volume)
    SELECT DISTINCT ON (rs.market_id)
      rs.market_id,
      rs.created_at AS latest_time,
      rs.yes_price AS yes_now,
      rs.volume_usd AS latest_volume
    FROM recent_snapshots rs
    ORDER BY rs.market_id, rs.created_at DESC
  ),
  target_times AS (
    -- Calculate target time (window ago) for each market
    -- Apply volume filter early to reduce work
    SELECT
      ls.market_id,
      ls.latest_time,
      ls.yes_now,
      ls.latest_volume,
      (ls.latest_time - (window_minutes || ' minutes')::INTERVAL) AS target_time
    FROM latest_snapshots ls
    WHERE ls.latest_volume IS NOT NULL
      AND ls.latest_volume >= min_volume_usd
  ),
  past_snapshots AS (
    -- Find the snapshot closest to target_time for each market
    -- ONLY include snapshots within tolerance of target_time
    SELECT DISTINCT ON (tt.market_id)
      tt.market_id,
      tt.latest_time,
      tt.yes_now,
      tt.latest_volume,
      tt.target_time,
      rs.created_at AS past_time,
      rs.yes_price AS yes_past,
      rs.volume_usd AS past_volume,
      ABS(EXTRACT(EPOCH FROM (rs.created_at - tt.target_time))) AS time_diff_seconds
    FROM target_times tt
    JOIN recent_snapshots rs ON rs.market_id = tt.market_id
    WHERE rs.created_at < tt.latest_time
      AND ABS(EXTRACT(EPOCH FROM (rs.created_at - tt.target_time))) <= max_abs_diff_seconds
    ORDER BY tt.market_id, ABS(EXTRACT(EPOCH FROM (rs.created_at - tt.target_time))) ASC
  ),
  computed_movers AS (
    -- Compute change and apply filters
    SELECT
      psnap.market_id,
      psnap.latest_time,
      psnap.past_time,
      psnap.yes_now::DOUBLE PRECISION AS yes_now,
      psnap.yes_past::DOUBLE PRECISION AS yes_past,
      ((psnap.yes_now - psnap.yes_past) * 100)::DOUBLE PRECISION AS change_pp,
      ROUND(EXTRACT(EPOCH FROM (psnap.latest_time - psnap.past_time)) / 60)::INTEGER AS delta_minutes
    FROM past_snapshots psnap
    WHERE psnap.yes_past IS NOT NULL
      AND psnap.yes_past > 0
      AND psnap.yes_now BETWEEN 0.05 AND 0.95
      AND ABS((psnap.yes_now - psnap.yes_past) * 100) >= 10
  )
  SELECT
    cm.market_id,
    cm.latest_time,
    cm.past_time,
    cm.yes_now,
    cm.yes_past,
    cm.change_pp,
    cm.delta_minutes
  FROM computed_movers cm
  ORDER BY ABS(cm.change_pp) DESC
  LIMIT limit_n;
END;
$$;

-- Grant execute permission to anon and authenticated users
GRANT EXECUTE ON FUNCTION get_movers TO anon, authenticated;

-- CRITICAL: Indexes for efficient 48h queries
-- These indexes are essential for the function to perform well
CREATE INDEX IF NOT EXISTS idx_price_snapshots_created_at
  ON public.price_snapshots(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_price_snapshots_market_created
  ON public.price_snapshots(market_id, created_at DESC);

-- Example usage:
-- SELECT * FROM get_movers(60, 20);   -- 1h window
-- SELECT * FROM get_movers(360, 20);  -- 6h window
-- SELECT * FROM get_movers(1440, 20); -- 24h window
