-- Batched delete function for price_snapshots cleanup
-- Deletes rows older than cutoff in small batches to avoid timeouts
--
-- Usage from Node:
--   supabase.rpc('delete_old_snapshots_batch', { cutoff_ts: '2024-01-01T00:00:00Z', batch_size: 5000 })
--
-- Returns: number of rows deleted in this batch

CREATE OR REPLACE FUNCTION public.delete_old_snapshots_batch(
  cutoff_ts TIMESTAMPTZ,
  batch_size INT DEFAULT 5000
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INT;
BEGIN
  -- Delete a batch of old rows using ctid for efficient batch limiting
  WITH del AS (
    DELETE FROM public.price_snapshots
    WHERE ctid IN (
      SELECT ctid
      FROM public.price_snapshots
      WHERE created_at < cutoff_ts
      ORDER BY created_at ASC
      LIMIT batch_size
    )
    RETURNING 1
  )
  SELECT count(*) INTO deleted_count FROM del;

  RETURN deleted_count;
END;
$$;

-- Grant execute to service_role (used by GitHub Actions)
GRANT EXECUTE ON FUNCTION public.delete_old_snapshots_batch(TIMESTAMPTZ, INT) TO service_role;

-- Ensure index exists for efficient cleanup queries
CREATE INDEX IF NOT EXISTS idx_price_snapshots_created_at
  ON public.price_snapshots(created_at);

-- Example usage:
-- SELECT delete_old_snapshots_batch(now() - interval '48 hours', 5000);
