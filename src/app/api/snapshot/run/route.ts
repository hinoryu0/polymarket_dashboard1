import { NextResponse } from 'next/server';
import { runIngestion } from '@/lib/ingestion/runIngestion';

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

    console.log('=== Snapshot Trigger START (Vercel Cron) ===');
    const startTime = new Date();

    // Execute ingestion
    const result = await runIngestion();

    console.log('=== Snapshot Trigger END ===');

    return NextResponse.json({
      ok: true,
      ranAt: startTime.toISOString(),
      marketsUpserted: result.marketsUpserted,
      snapshotsInserted: result.snapshotsInserted,
    });
  } catch (error) {
    console.error('Error in GET /api/snapshot/run:', error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to run snapshot',
        ranAt: new Date().toISOString(),
        marketsUpserted: 0,
        snapshotsInserted: 0,
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

    console.log('=== Snapshot Trigger START (Manual) ===');
    const startTime = new Date();

    // Execute ingestion
    const result = await runIngestion();

    console.log('=== Snapshot Trigger END ===');

    return NextResponse.json({
      ok: true,
      ranAt: startTime.toISOString(),
      marketsUpserted: result.marketsUpserted,
      snapshotsInserted: result.snapshotsInserted,
    });
  } catch (error) {
    console.error('Error in POST /api/snapshot/run:', error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to run snapshot',
        ranAt: new Date().toISOString(),
        marketsUpserted: 0,
        snapshotsInserted: 0,
      },
      { status: 500 }
    );
  }
}
