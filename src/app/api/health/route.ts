import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/health
 * Returns health/debug information about the markets data
 */
export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Missing Supabase configuration',
        },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get total markets count
    const { count: marketsTotal, error: countError } = await supabase
      .from('markets')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      throw new Error(`Failed to count markets: ${countError.message}`);
    }

    // Get markets with valid yes_price count
    const { count: marketsWithPrice, error: priceCountError } = await supabase
      .from('markets')
      .select('*', { count: 'exact', head: true })
      .not('yes_price', 'is', null);

    if (priceCountError) {
      throw new Error(`Failed to count markets with price: ${priceCountError.message}`);
    }

    // Get the most recent updated_at timestamp
    const { data: latestMarket, error: latestError } = await supabase
      .from('markets')
      .select('updated_at')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (latestError && latestError.code !== 'PGRST116') {
      // PGRST116 is "no rows returned", which is ok
      throw new Error(`Failed to get latest market: ${latestError.message}`);
    }

    const lastMarketUpdatedAt = latestMarket?.updated_at || null;

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      marketsTotal: marketsTotal ?? 0,
      marketsWithPrice: marketsWithPrice ?? 0,
      lastMarketUpdatedAt,
    });
  } catch (error) {
    console.error('Error in /api/health:', error);

    // Always return valid JSON, never crash
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to get health status',
      },
      { status: 500 }
    );
  }
}
