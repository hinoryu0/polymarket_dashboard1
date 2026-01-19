-- Polymarket Markets Table
-- This table stores market data fetched from Polymarket/Gamma API

CREATE TABLE IF NOT EXISTS markets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  yes_price NUMERIC,
  volume_usd NUMERIC,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create index on updated_at for efficient sorting by recent updates
CREATE INDEX IF NOT EXISTS idx_markets_updated_at ON markets(updated_at DESC);

-- Optional: Add a trigger to automatically update updated_at on row changes
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_markets_updated_at BEFORE UPDATE ON markets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS) - Optional for V0
-- You can disable RLS for simplicity or enable with permissive read policy
-- ALTER TABLE markets ENABLE ROW LEVEL SECURITY;

-- Allow anonymous read access (if RLS is enabled)
-- CREATE POLICY "Allow anonymous read access" ON markets
--   FOR SELECT
--   USING (true);

-- For V0, you can disable RLS to keep it simple:
ALTER TABLE markets DISABLE ROW LEVEL SECURITY;
