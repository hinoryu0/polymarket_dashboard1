import { NextResponse } from 'next/server';
import {
  fetchFromGammaAPI,
  isMarketActive,
  normalizeMarket,
  upsertMarketsToSupabase,
  insertPriceSnapshots,
} from '../../../../scripts/fetch-markets';

/**
 * POST /api/snapshot/run
 * Manually trigger market data ingestion and snapshot creation
 * Protected by x-cron-secret header
 */
export async function POST(request: Request) {
  try {
    // Security: Check x-cron-secret header
    const cronSecret = request.headers.get('x-cron-secret');
    const expectedSecret = process.env.CRON_SECRET;

    if (!expectedSecret) {
      return NextResponse.json(
        { error: 'CRON_SECRET not configured on server' },
        { status: 500 }
      );
    }

    if (!cronSecret || cronSecret !== expectedSecret) {
      return NextResponse.json(
        { error: 'Unauthorized: Invalid or missing x-cron-secret header' },
        { status: 401 }
      );
    }

    console.log('=== Manual Snapshot Trigger START ===');
    const startTime = new Date();

    // Step 1: Fetch markets from Gamma API
    const gammaMarkets = await fetchFromGammaAPI();
    console.log(`Fetched ${gammaMarkets.length} markets from Gamma API`);

    if (gammaMarkets.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: 'No markets received from Gamma API',
          ranAt: startTime.toISOString(),
          marketsUpserted: 0,
          snapshotsInserted: 0,
        },
        { status: 200 }
      );
    }

    // Step 2: Filter to active markets
    const activeMarkets = gammaMarkets.filter(isMarketActive);
    console.log(`Active markets: ${activeMarkets.length}/${gammaMarkets.length}`);

    if (activeMarkets.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: 'No active markets after filtering',
          ranAt: startTime.toISOString(),
          marketsUpserted: 0,
          snapshotsInserted: 0,
        },
        { status: 200 }
      );
    }

    // Step 3: Normalize markets
    const normalizedMarkets = activeMarkets.map(normalizeMarket);

    // Remove temporary _urlSource field before upserting
    const marketsForDb = normalizedMarkets.map(({ _urlSource, ...market }) => market);

    // Step 4: Upsert markets to Supabase
    await upsertMarketsToSupabase(marketsForDb);
    const marketsUpserted = marketsForDb.length;
    console.log(`Markets upserted: ${marketsUpserted}`);

    // Step 5: Insert price snapshots
    const snapshotsInserted = await insertPriceSnapshots(marketsForDb);
    console.log(`Snapshots inserted: ${snapshotsInserted}`);

    console.log('=== Manual Snapshot Trigger END ===');

    return NextResponse.json({
      ok: true,
      ranAt: startTime.toISOString(),
      marketsUpserted,
      snapshotsInserted,
    });
  } catch (error) {
    console.error('Error in /api/snapshot/run:', error);

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to run snapshot',
        ranAt: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
