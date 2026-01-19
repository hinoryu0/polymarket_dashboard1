import { SupabaseMarketProvider } from './supabase';
import { MarketProvider } from './types';

/**
 * Get the configured market provider
 * Currently returns Supabase provider, but can be extended to support other providers
 */
export function getMarketProvider(): MarketProvider {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'Missing Supabase configuration. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables.'
    );
  }

  return new SupabaseMarketProvider(supabaseUrl, supabaseKey);
}

export * from './types';
export { SupabaseMarketProvider };
