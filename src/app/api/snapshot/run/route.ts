import { NextResponse } from 'next/server';
import {
  fetchFromGammaAPI,
  isMarketActive,
  normalizeMarket,
  upsertMarketsToSupabase,
  insertPriceSnapshots,
} from '../../../../scripts/fetch-markets';

/**
 * Verify authentication via header or query parameter
 */
function verifyAuth(request: Request): { authorized: boolean; error?: string } {
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret) {
    return { authorized: false, error: 'CRON_SECRET not configured on server' };
  }

  // Check header first (for manual POST requests)
  const headerSecret = request.headers.get('x-cron-secret');
  if (headerSecret && headerSecret === expectedSecret) {
    return { authorized: true };
  }

  // Check query parameter (for Vercel Cron GET requests)
  const url = new URL(request.url);
  const querySecret = url.searchParams.get('secret');
  if (querySecret && querySecret === expectedSecret) {
    return { authorized: true };
  }

  return {
    authorized: false,
    error: 'Unauthorized: Invalid or missing authentication (x-cron-secret header or secret query param)'
  };
}

/**
 * Execute snapshot ingestion logic
 */
async function executeSnapshot() {
  console.log('=== Snapshot Trigger START ===');
  const startTime = new Date();

  // Step 1: Fetch markets from Gamma API
  const gammaMarkets = await fetchFromGammaAPI();
  console.log(`Fetched ${gammaMarkets.length} markets from Gamma API`);

  if (gammaMarkets.length === 0) {
    return {
      ok: false,
      error: 'No markets received from Gamma API',
      ranAt: startTime.toISOString(),
      marketsUpserted: 0,
      snapshotsInserted: 0,
    };
  }

  // Step 2: Filter to active markets
  const activeMarkets = gammaMarkets.filter(isMarketActive);
  console.log(`Active markets: ${activeMarkets.length}/${gammaMarkets.length}`);

  if (activeMarkets.length === 0) {
    return {
      ok: false,
      error: 'No active markets after filtering',
      ranAt: startTime.toISOString(),
      marketsUpserted: 0,
      snapshotsInserted: 0,
    };
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

  console.log('=== Snapshot Trigger END ===');

  return {
    ok: true,
    ranAt: startTime.toISOString(),
    marketsUpserted,
    snapshotsInserted,
  };
}

/**
 * GET /api/snapshot/run
 * Triggered by Vercel Cron every 5 minutes
 * Protected by secret query parameter
 */
export async function GET(request: Request) {
  try {
    // Verify authentication
    const auth = verifyAuth(request);
    if (!auth.authorized) {
      return NextResponse.json(
        { error: auth.error },
        { status: auth.error?.includes('not configured') ? 500 : 401 }
      );
    }

    // Execute snapshot
    const result = await executeSnapshot();
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (error) {
    console.error('Error in GET /api/snapshot/run:', error);
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

/**
 * POST /api/snapshot/run
 * Manually trigger market data ingestion and snapshot creation
 * Protected by x-cron-secret header or secret query parameter
 */
export async function POST(request: Request) {
  try {
    // Verify authentication
    const auth = verifyAuth(request);
    if (!auth.authorized) {
      return NextResponse.json(
        { error: auth.error },
        { status: auth.error?.includes('not configured') ? 500 : 401 }
      );
    }

    // Execute snapshot
    const result = await executeSnapshot();
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (error) {
    console.error('Error in POST /api/snapshot/run:', error);
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
