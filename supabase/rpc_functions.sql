-- RPC function to get accurate snapshot statistics for last N hours
-- This avoids client-side counting and pagination limits

CREATE OR REPLACE FUNCTION get_snapshot_stats_last_48h(hours_ago INTEGER DEFAULT 48)
RETURNS TABLE (
  total_snapshots BIGINT,
  distinct_markets BIGINT,
  newest_snapshot_at TIMESTAMPTZ,
  oldest_snapshot_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_snapshots,
    COUNT(DISTINCT market_id)::BIGINT AS distinct_markets,
    MAX(created_at) AS newest_snapshot_at,
    MIN(created_at) AS oldest_snapshot_at
  FROM price_snapshots
  WHERE created_at >= NOW() - (hours_ago || ' hours')::INTERVAL
    AND yes_price IS NOT NULL;
END;
$$;

-- Grant execute permission to anon and authenticated users
GRANT EXECUTE ON FUNCTION get_snapshot_stats_last_48h TO anon, authenticated;

-- Example usage:
-- SELECT * FROM get_snapshot_stats_last_48h(48);
