-- RPC function to compute market movers efficiently in SQL
-- This avoids pagination limits and processes ALL snapshots directly in the database
-- Enforces tolerance to ensure movers reflect actual movement within the requested window
-- Filters:
--   - Price range: Excludes markets with latest price < 5% or > 95% (already decided)
--   - Volume: Window-dependent minimum volume to exclude low-liquidity junk markets
--     * 1h window: >= $1,000
--     * 6h window: >= $5,000
--     * 24h+ window: >= $15,000

CREATE OR REPLACE FUNCTION get_movers(
  window_minutes INTEGER DEFAULT 1440,
  limit_n INTEGER DEFAULT 10
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
  -- Shorter windows = lower volume threshold (more responsive)
  -- Longer windows = higher volume threshold (more stable/liquid markets)
  min_volume_usd := CASE
    WHEN window_minutes <= 60 THEN 1000      -- 1h window: >= $1,000
    WHEN window_minutes <= 360 THEN 5000     -- 6h window: >= $5,000
    ELSE 15000                               -- 24h+ window: >= $15,000
  END;

  RETURN QUERY
  WITH latest_snapshots AS (
    -- Get the most recent snapshot per market (with volume)
    SELECT DISTINCT ON (ps.market_id)
      ps.market_id,
      ps.created_at AS latest_time,
      ps.yes_price AS yes_now,
      ps.volume_usd AS latest_volume
    FROM price_snapshots ps
    WHERE ps.yes_price IS NOT NULL
    ORDER BY ps.market_id, ps.created_at DESC
  ),
  target_times AS (
    -- Calculate target time (window ago) for each market
    -- Also apply volume filter early to reduce work
    SELECT
      market_id,
      latest_time,
      yes_now,
      latest_volume,
      (latest_time - (window_minutes || ' minutes')::INTERVAL) AS target_time
    FROM latest_snapshots
    WHERE latest_volume IS NOT NULL
      AND latest_volume >= min_volume_usd  -- Volume filter on latest snapshot
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
      ps.created_at AS past_time,
      ps.yes_price AS yes_past,
      ps.volume_usd AS past_volume,
      ABS(EXTRACT(EPOCH FROM (ps.created_at - tt.target_time))) AS time_diff_seconds
    FROM target_times tt
    JOIN price_snapshots ps ON ps.market_id = tt.market_id
    WHERE ps.yes_price IS NOT NULL
      AND ps.created_at < tt.latest_time  -- Must be before latest (not the same snapshot)
      AND ABS(EXTRACT(EPOCH FROM (ps.created_at - tt.target_time))) <= max_abs_diff_seconds  -- Within tolerance
    ORDER BY tt.market_id, ABS(EXTRACT(EPOCH FROM (ps.created_at - tt.target_time))) ASC
  )
  SELECT
    ps.market_id,
    ps.latest_time,
    ps.past_time,
    ps.yes_now,
    ps.yes_past,
    ((ps.yes_now - ps.yes_past) * 100)::DOUBLE PRECISION AS change_pp,
    ROUND(EXTRACT(EPOCH FROM (ps.latest_time - ps.past_time)) / 60)::INTEGER AS delta_minutes
  FROM past_snapshots ps
  WHERE ps.yes_past IS NOT NULL
    AND ps.yes_past > 0  -- Avoid divide by zero
    AND ps.yes_now BETWEEN 0.05 AND 0.95  -- Exclude "already decided" markets (5-95% filter)
  ORDER BY change_pp DESC;  -- Return all, client will split into gainers/losers
END;
$$;

-- Grant execute permission to anon and authenticated users
GRANT EXECUTE ON FUNCTION get_movers TO anon, authenticated;

-- Example usage:
-- Get movers for 1h window with limit 10:
-- SELECT * FROM get_movers(60, 10);
--
-- Get movers for 6h window:
-- SELECT * FROM get_movers(360, 10);
--
-- Get movers for 24h window:
-- SELECT * FROM get_movers(1440, 10);

-- Create index to speed up the query if not exists
CREATE INDEX IF NOT EXISTS idx_price_snapshots_market_created
  ON price_snapshots(market_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_price_snapshots_created
  ON price_snapshots(created_at DESC);
