import { NextResponse } from 'next/server';
import { runIngestion } from '@/lib/ingestion/runIngestion';

/**
 * Verify authentication via header
 * In production, requires x-cron-secret header
 * In development, authentication is optional
 */
function verifyAuth(request: Request): { authorized: boolean; error?: string } {
  const isDevelopment = process.env.NODE_ENV !== 'production';

  // In development, allow access without authentication
  if (isDevelopment) {
    return { authorized: true };
  }

  // In production, require authentication
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    console.warn('CRON_SECRET not configured - snapshot endpoint is unprotected in production');
    return { authorized: true }; // Allow but warn
  }

  // Check x-cron-secret header
  const headerSecret = request.headers.get('x-cron-secret');
  if (headerSecret && headerSecret === expectedSecret) {
    return { authorized: true };
  }

  return {
    authorized: false,
    error: 'Unauthorized: Missing or invalid x-cron-secret header'
  };
}

/**
 * POST /api/snapshot/run
 * Manually trigger market data ingestion and snapshot creation
 *
 * Authentication:
 * - Development: No authentication required
 * - Production: Requires x-cron-secret header (optional - warns if not configured)
 *
 * This endpoint can be triggered manually for debugging or testing.
 * It does NOT rely on Vercel Cron.
 */
export async function POST(request: Request) {
  try {
    // Verify authentication
    const auth = verifyAuth(request);
    if (!auth.authorized) {
      return NextResponse.json(
        { error: auth.error },
        { status: 401 }
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
