-- Price Snapshots Table for Historical Price Tracking
-- This table stores periodic snapshots of market prices for analysis

CREATE TABLE IF NOT EXISTS price_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id TEXT NOT NULL,
  yes_price NUMERIC NULL,
  volume_usd NUMERIC NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for fast querying by market and time
CREATE INDEX IF NOT EXISTS idx_price_snapshots_market_time
  ON price_snapshots(market_id, created_at DESC);

-- Optional: Add comment for documentation
COMMENT ON TABLE price_snapshots IS 'Historical price snapshots taken every 5 minutes during data ingestion';
COMMENT ON COLUMN price_snapshots.market_id IS 'Foreign key reference to markets.id';
COMMENT ON COLUMN price_snapshots.yes_price IS 'YES outcome price (0..1) at time of snapshot';
COMMENT ON COLUMN price_snapshots.volume_usd IS 'Trading volume in USD at time of snapshot';
COMMENT ON COLUMN price_snapshots.created_at IS 'Timestamp when snapshot was taken';
