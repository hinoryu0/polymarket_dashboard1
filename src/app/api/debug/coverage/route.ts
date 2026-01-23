import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/debug/coverage
 * Returns snapshot coverage stats - how many markets have snapshots vs total markets
 *
 * This is a read-only endpoint to diagnose snapshot coverage issues
 */
export async function GET(request: Request) {
  try {
    // Initialize Supabase client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Calculate 48h lookback window
    const now = new Date();
    const hours48Ago = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    // Query 1: Get total count of markets
    const { count: totalMarkets, error: marketsCountError } = await supabase
      .from('markets')
      .select('*', { count: 'exact', head: true });

    if (marketsCountError) {
      throw new Error(`Failed to count markets: ${marketsCountError.message}`);
    }

    // Query 2: Get all market IDs from markets table (for finding missing ones)
    const { data: allMarkets, error: allMarketsError } = await supabase
      .from('markets')
      .select('id, title');

    if (allMarketsError) {
      throw new Error(`Failed to fetch all markets: ${allMarketsError.message}`);
    }

    // Query 3: Get distinct market_ids from snapshots in last 48h
    const { data: snapshotsLast48h, error: snapshotsError } = await supabase
      .from('price_snapshots')
      .select('market_id')
      .gte('created_at', hours48Ago.toISOString())
      .not('yes_price', 'is', null);

    if (snapshotsError) {
      throw new Error(`Failed to fetch snapshots: ${snapshotsError.message}`);
    }

    // Query 4: Get total count of snapshots in last 48h
    const totalSnapshotsLast48h = snapshotsLast48h?.length || 0;
    const marketIdsWithSnapshots = new Set(snapshotsLast48h?.map(s => s.market_id) || []);
    const totalMarketsWithSnapshotLast48h = marketIdsWithSnapshots.size;

    // Calculate coverage percentage
    const percentCoverageLast48h = totalMarkets && totalMarkets > 0
      ? ((totalMarketsWithSnapshotLast48h / totalMarkets) * 100)
      : 0;

    // Find markets WITHOUT snapshots in last 48h
    const marketsWithoutSnapshots = (allMarkets || [])
      .filter(m => !marketIdsWithSnapshots.has(m.id))
      .slice(0, 10); // Take first 10 examples

    // Build response
    const response = {
      generatedAt: now.toISOString(),
      lookbackWindow: '48 hours',
      tablesUsed: {
        markets: 'markets',
        snapshots: 'price_snapshots',
      },

      coverage: {
        totalMarkets: totalMarkets || 0,
        totalMarketsWithSnapshotLast48h,
        totalSnapshotsLast48h,
        percentCoverageLast48h: Math.round(percentCoverageLast48h * 100) / 100, // Round to 2 decimals
        marketsWithoutSnapshots: totalMarkets ? (totalMarkets - totalMarketsWithSnapshotLast48h) : 0,
      },

      exampleMarketsWithoutSnapshots: marketsWithoutSnapshots.map(m => ({
        market_id: m.id,
        title: m.title,
      })),

      healthStatus: {
        coverageLevel: percentCoverageLast48h >= 90 ? 'EXCELLENT' :
                       percentCoverageLast48h >= 50 ? 'MODERATE' :
                       percentCoverageLast48h >= 10 ? 'POOR' : 'CRITICAL',
        hasGoodCoverage: percentCoverageLast48h >= 90,
        recommendations: [] as string[],
      },
    };

    // Add recommendations based on coverage
    if (totalMarkets === 0) {
      response.healthStatus.recommendations.push('No markets found in database! Run ingestion to populate markets table.');
    } else if (totalSnapshotsLast48h === 0) {
      response.healthStatus.recommendations.push('No snapshots found! Run ingestion to create price_snapshots.');
    } else if (percentCoverageLast48h < 10) {
      response.healthStatus.recommendations.push(
        `CRITICAL: Only ${percentCoverageLast48h.toFixed(1)}% of markets have snapshots! ` +
        `Check if insertPriceSnapshots() is being called for all markets in ingestion.`
      );
    } else if (percentCoverageLast48h < 50) {
      response.healthStatus.recommendations.push(
        `POOR coverage: Only ${percentCoverageLast48h.toFixed(1)}% of markets have snapshots. ` +
        `Expected near 100%. Check ingestion logic for filtering or errors.`
      );
    } else if (percentCoverageLast48h < 90) {
      response.healthStatus.recommendations.push(
        `MODERATE coverage: ${percentCoverageLast48h.toFixed(1)}% of markets have snapshots. ` +
        `Some markets may be missing snapshots due to null yes_price or ingestion errors.`
      );
    } else {
      response.healthStatus.recommendations.push(
        `EXCELLENT coverage: ${percentCoverageLast48h.toFixed(1)}% of markets have snapshots!`
      );
    }

    // Add specific guidance for low coverage
    if (percentCoverageLast48h < 50 && marketsWithoutSnapshots.length > 0) {
      response.healthStatus.recommendations.push(
        `Check the example markets without snapshots to see if they have null yes_price ` +
        `or are being filtered out during ingestion.`
      );
    }

    console.log(
      `Coverage check: ${totalMarketsWithSnapshotLast48h}/${totalMarkets} markets (${percentCoverageLast48h.toFixed(1)}%) ` +
      `have snapshots in last 48h`
    );

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in /api/debug/coverage:', error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to fetch coverage stats',
        generatedAt: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
