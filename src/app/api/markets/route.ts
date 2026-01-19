import { NextResponse } from 'next/server';
import { getMarketProvider } from '@/lib/providers';

/**
 * GET /api/markets
 * Returns list of markets from Supabase
 */
export async function GET(request: Request) {
  try {
    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 10;

    // Validate limit
    if (isNaN(limit) || limit < 1 || limit > 100) {
      return NextResponse.json(
        { error: 'Invalid limit parameter. Must be between 1 and 100.' },
        { status: 400 }
      );
    }

    // Get market provider and fetch markets
    const provider = getMarketProvider();
    const { markets, lastUpdatedAt } = await provider.getMarkets(limit);

    // Return markets as JSON with lastUpdatedAt
    return NextResponse.json({
      success: true,
      count: markets.length,
      lastUpdatedAt,
      markets,
    });
  } catch (error) {
    console.error('Error in /api/markets:', error);

    // Always return valid JSON, never crash
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch markets',
        markets: [],
      },
      { status: 500 }
    );
  }
}
