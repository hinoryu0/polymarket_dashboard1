-- ============================================================================
-- Polymarket Dashboard - Complete Database Schema
-- ============================================================================
-- This schema includes all tables required for the dashboard:
-- 1. markets - Market metadata
-- 2. price_snapshots - Historical price data (time series)
-- 3. movers_cache - Pre-computed movers for fast API responses
--
-- Run this in Supabase SQL Editor to set up the database.
-- ============================================================================

-- ============================================================================
-- 1. Markets Table
-- ============================================================================
-- Stores market metadata fetched from Polymarket/Gamma API

CREATE TABLE IF NOT EXISTS markets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  yes_price NUMERIC,
  volume_usd NUMERIC,
  category TEXT,  -- Market category (politics, crypto, sports, etc.)
  tags TEXT[],    -- Array of tags for categorization
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Indexes for markets table
CREATE INDEX IF NOT EXISTS idx_markets_updated_at ON markets(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_markets_category ON markets(category);
CREATE INDEX IF NOT EXISTS idx_markets_volume ON markets(volume_usd DESC NULLS LAST);

-- Auto-update trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_markets_updated_at BEFORE UPDATE ON markets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Disable RLS for simplicity (enable in production if needed)
ALTER TABLE markets DISABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2. Price Snapshots Table
-- ============================================================================
-- Stores historical price snapshots for computing price movements

CREATE TABLE IF NOT EXISTS price_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id TEXT NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  yes_price NUMERIC NOT NULL,
  volume_usd NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Indexes for price_snapshots table
-- Critical: These indexes make movers computation fast
CREATE INDEX IF NOT EXISTS idx_snapshots_market_created ON price_snapshots(market_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_created ON price_snapshots(created_at DESC);

-- Composite index for efficient past snapshot lookups
CREATE INDEX IF NOT EXISTS idx_snapshots_market_time_range ON price_snapshots(market_id, created_at)
  WHERE created_at > (now() - interval '48 hours');

-- Disable RLS
ALTER TABLE price_snapshots DISABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 3. Movers Cache Table
-- ============================================================================
-- Stores pre-computed movers for fast API responses
-- Updated every 15 minutes by GitHub Actions

CREATE TABLE IF NOT EXISTS movers_cache (
  window_key TEXT PRIMARY KEY,  -- '1h', '6h', or '24h'
  generated_at TIMESTAMP WITH TIME ZONE NOT NULL,
  params JSONB,  -- Computation parameters (filters, thresholds, etc.)
  top_gainers JSONB NOT NULL DEFAULT '[]'::jsonb,
  top_losers JSONB NOT NULL DEFAULT '[]'::jsonb
);

-- Disable RLS
ALTER TABLE movers_cache DISABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Function to get database statistics (useful for /api/health)
CREATE OR REPLACE FUNCTION get_db_stats()
RETURNS TABLE (
  markets_total BIGINT,
  markets_with_price BIGINT,
  snapshots_total BIGINT,
  snapshots_last_hour BIGINT,
  oldest_snapshot TIMESTAMP WITH TIME ZONE,
  newest_snapshot TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM markets),
    (SELECT COUNT(*) FROM markets WHERE yes_price IS NOT NULL),
    (SELECT COUNT(*) FROM price_snapshots),
    (SELECT COUNT(*) FROM price_snapshots WHERE created_at > now() - interval '1 hour'),
    (SELECT MIN(created_at) FROM price_snapshots),
    (SELECT MAX(created_at) FROM price_snapshots);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Maintenance: Cleanup old snapshots
-- ============================================================================
-- Function to batch-delete old snapshots (retention policy: 48 hours)
-- This prevents database bloat on Supabase Free tier

CREATE OR REPLACE FUNCTION cleanup_old_snapshots(
  retention_hours INTEGER DEFAULT 48,
  batch_size INTEGER DEFAULT 10000
)
RETURNS TABLE (deleted_count BIGINT) AS $$
DECLARE
  total_deleted BIGINT := 0;
  batch_deleted BIGINT;
  cutoff_time TIMESTAMP WITH TIME ZONE;
BEGIN
  cutoff_time := now() - (retention_hours || ' hours')::interval;
  
  LOOP
    -- Delete one batch
    DELETE FROM price_snapshots
    WHERE ctid IN (
      SELECT ctid
      FROM price_snapshots
      WHERE created_at < cutoff_time
      LIMIT batch_size
    );
    
    GET DIAGNOSTICS batch_deleted = ROW_COUNT;
    total_deleted := total_deleted + batch_deleted;
    
    -- Exit if no more rows to delete
    EXIT WHEN batch_deleted = 0;
  END LOOP;
  
  RETURN QUERY SELECT total_deleted;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Initial Data (Optional)
-- ============================================================================
-- Initialize movers_cache with empty entries for each window

INSERT INTO movers_cache (window_key, generated_at, params, top_gainers, top_losers)
VALUES
  ('1h', now(), '{"window_minutes": 60}'::jsonb, '[]'::jsonb, '[]'::jsonb),
  ('6h', now(), '{"window_minutes": 360}'::jsonb, '[]'::jsonb, '[]'::jsonb),
  ('24h', now(), '{"window_minutes": 1440}'::jsonb, '[]'::jsonb, '[]'::jsonb)
ON CONFLICT (window_key) DO NOTHING;

-- ============================================================================
-- Schema Setup Complete!
-- ============================================================================
-- Next steps:
-- 1. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in GitHub Secrets
-- 2. Run GitHub Actions workflow to start data ingestion
-- 3. Check /api/health to verify data is flowing
-- 4. Open the dashboard to see markets and movers
-- ============================================================================
