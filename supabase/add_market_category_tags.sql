-- Migration: Add category and tags columns to markets table
-- Purpose: Enable allowlist-based filtering for snapshot ingestion
-- Run this in Supabase SQL Editor

-- Add category column (one of: politics, geopolitics, crypto, world, technology, economy, finance, culture, celebrities, NULL)
-- NULL means the market is excluded from snapshot ingestion
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'markets'
      AND column_name = 'category'
  ) THEN
    ALTER TABLE public.markets ADD COLUMN category TEXT NULL;
    RAISE NOTICE 'Added category column to markets table';
  ELSE
    RAISE NOTICE 'category column already exists';
  END IF;
END $$;

-- Add tags column (array of keywords/tags for the market)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'markets'
      AND column_name = 'tags'
  ) THEN
    ALTER TABLE public.markets ADD COLUMN tags TEXT[] NULL;
    RAISE NOTICE 'Added tags column to markets table';
  ELSE
    RAISE NOTICE 'tags column already exists';
  END IF;
END $$;

-- Create index on category for fast filtering
CREATE INDEX IF NOT EXISTS idx_markets_category ON public.markets(category);

-- Create GIN index on tags for efficient array queries
CREATE INDEX IF NOT EXISTS idx_markets_tags ON public.markets USING GIN(tags);

-- Verify the columns exist
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'markets'
  AND column_name IN ('category', 'tags');
