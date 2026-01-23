import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/debug/snapshot-depth
 * Returns snapshot history depth per market to diagnose why /api/movers is empty
 *
 * This is a read-only endpoint to verify if snapshot history is accumulating per market
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

    // Allow configurable lookback window via query param (default 12h)
    const { searchParams } = new URL(request.url);
    const hoursParam = searchParams.get('hours') || '12';
    const hours = Math.min(Math.max(parseInt(hoursParam, 10), 1), 48); // Between 1-48 hours

    // Calculate lookback window
    const now = new Date();
    const hoursAgo = new Date(now.getTime() - hours * 60 * 60 * 1000);

    // Fetch all snapshots in the window
    const { data: snapshots, error: snapshotsError } = await supabase
      .from('price_snapshots')
      .select('market_id, created_at, yes_price')
      .gte('created_at', hoursAgo.toISOString())
      .not('yes_price', 'is', null);

    if (snapshotsError) {
      throw new Error(`Failed to fetch snapshots: ${snapshotsError.message}`);
    }

    const totalSnapshotsInWindow = snapshots?.length || 0;

    // Group snapshots by market_id and count
    const snapshotCountByMarket = new Map<string, number>();

    snapshots?.forEach(snap => {
      const currentCount = snapshotCountByMarket.get(snap.market_id) || 0;
      snapshotCountByMarket.set(snap.market_id, currentCount + 1);
    });

    // Calculate depth statistics
    let marketsWithAtLeast1Snapshot = 0;
    let marketsWithAtLeast2Snapshots = 0;
    let marketsWithAtLeast3Snapshots = 0;
    let marketsWithAtLeast5Snapshots = 0;
    let marketsWithAtLeast10Snapshots = 0;

    snapshotCountByMarket.forEach((count) => {
      if (count >= 1) marketsWithAtLeast1Snapshot++;
      if (count >= 2) marketsWithAtLeast2Snapshots++;
      if (count >= 3) marketsWithAtLeast3Snapshots++;
      if (count >= 5) marketsWithAtLeast5Snapshots++;
      if (count >= 10) marketsWithAtLeast10Snapshots++;
    });

    // Get top 10 markets by snapshot count
    const marketCountArray = Array.from(snapshotCountByMarket.entries())
      .map(([market_id, count]) => ({ market_id, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Get bottom 10 markets by snapshot count (markets with fewest snapshots)
    const bottomMarkets = Array.from(snapshotCountByMarket.entries())
      .map(([market_id, count]) => ({ market_id, count }))
      .sort((a, b) => a.count - b.count)
      .slice(0, 10);

    // Calculate percentages
    const totalMarkets = snapshotCountByMarket.size;
    const pct2Plus = totalMarkets > 0 ? (marketsWithAtLeast2Snapshots / totalMarkets) * 100 : 0;
    const pct3Plus = totalMarkets > 0 ? (marketsWithAtLeast3Snapshots / totalMarkets) * 100 : 0;
    const pct5Plus = totalMarkets > 0 ? (marketsWithAtLeast5Snapshots / totalMarkets) * 100 : 0;
    const pct10Plus = totalMarkets > 0 ? (marketsWithAtLeast10Snapshots / totalMarkets) * 100 : 0;

    // Calculate average snapshots per market
    const avgSnapshotsPerMarket = totalMarkets > 0
      ? totalSnapshotsInWindow / totalMarkets
      : 0;

    // Build response
    const response = {
      generatedAt: now.toISOString(),
      lookbackWindow: `${hours} hours`,
      lookbackStart: hoursAgo.toISOString(),
      lookbackEnd: now.toISOString(),

      summary: {
        totalSnapshotsInWindow,
        totalDistinctMarkets: totalMarkets,
        avgSnapshotsPerMarket: Math.round(avgSnapshotsPerMarket * 10) / 10,
      },

      depth: {
        marketsWithAtLeast1Snapshot,
        marketsWithAtLeast2Snapshots,
        marketsWithAtLeast3Snapshots,
        marketsWithAtLeast5Snapshots,
        marketsWithAtLeast10Snapshots,

        percentages: {
          with2Plus: Math.round(pct2Plus * 10) / 10,
          with3Plus: Math.round(pct3Plus * 10) / 10,
          with5Plus: Math.round(pct5Plus * 10) / 10,
          with10Plus: Math.round(pct10Plus * 10) / 10,
        },
      },

      topMarketsBySnapshotCount: marketCountArray,
      bottomMarketsBySnapshotCount: bottomMarkets,

      analysis: {
        moversRequirement: 'At least 2 snapshots per market',
        eligibleMarketsForMovers: marketsWithAtLeast2Snapshots,
        eligibilityRate: Math.round(pct2Plus * 10) / 10,
        recommendations: [] as string[],
      },
    };

    // Add recommendations
    if (totalSnapshotsInWindow === 0) {
      response.analysis.recommendations.push('No snapshots found in window! Run data ingestion.');
    } else if (avgSnapshotsPerMarket < 2) {
      response.analysis.recommendations.push(
        `Average snapshots per market (${avgSnapshotsPerMarket.toFixed(1)}) is less than 2. ` +
        `Wait for more ingestion runs to accumulate history.`
      );
    } else if (pct2Plus < 50) {
      response.analysis.recommendations.push(
        `Only ${pct2Plus.toFixed(1)}% of markets have 2+ snapshots. ` +
        `Problem: Snapshots may not be accumulating properly per market. ` +
        `Check if each ingestion run creates NEW snapshots or replaces old ones.`
      );
    } else if (pct2Plus < 90) {
      response.analysis.recommendations.push(
        `${pct2Plus.toFixed(1)}% of markets have 2+ snapshots. ` +
        `/api/movers should return some results, but coverage could be better.`
      );
    } else {
      response.analysis.recommendations.push(
        `Excellent! ${pct2Plus.toFixed(1)}% of markets have 2+ snapshots. ` +
        `/api/movers should work well. If still empty, check tolerance settings or market filtering.`
      );
    }

    // Specific warning if almost all markets have exactly 1 snapshot
    if (marketsWithAtLeast1Snapshot > 0 && pct2Plus < 10) {
      response.analysis.recommendations.push(
        `⚠️ CRITICAL: Most markets have only 1 snapshot! ` +
        `This means snapshots are NOT accumulating - each ingestion may be replacing instead of adding. ` +
        `Check the insertPriceSnapshots function for UPSERT vs INSERT behavior.`
      );
    }

    console.log(
      `Snapshot depth: ${totalSnapshotsInWindow} total, ${totalMarkets} markets, ` +
      `${marketsWithAtLeast2Snapshots} (${pct2Plus.toFixed(1)}%) with 2+ snapshots`
    );

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in /api/debug/snapshot-depth:', error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to fetch snapshot depth stats',
        generatedAt: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
