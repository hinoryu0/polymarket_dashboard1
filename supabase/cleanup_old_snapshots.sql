-- Retention Cleanup for price_snapshots Table
-- Policy: Keep only snapshots from the last 48 hours
--
-- This cleanup is designed for Supabase Free tier limitations:
-- - Uses batched deletes to avoid statement timeouts
-- - Should be run BEFORE new snapshot insertion to prevent unbounded growth
--
-- Expected data volume:
-- - ~288 snapshots/day/market (5 min intervals)
-- - With 1000+ active markets, this keeps ~576,000 rows max
-- - Deleting older data keeps the table manageable

-- Index to make cleanup efficient (if not already exists)
-- This index is used for efficient deletion by created_at timestamp
CREATE INDEX IF NOT EXISTS idx_price_snapshots_created_at
  ON public.price_snapshots(created_at DESC);

-- Single delete statement (for manual execution or simple cleanup)
-- For automated use, the TypeScript script handles batching
DELETE FROM public.price_snapshots
WHERE created_at < now() - interval '48 hours';

-- Verify cleanup (optional, run separately)
-- SELECT count(*) as remaining_snapshots,
--        min(created_at) as oldest,
--        max(created_at) as newest
-- FROM public.price_snapshots;
