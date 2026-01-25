/**
 * Retention Cleanup Script for price_snapshots Table
 *
 * Policy: Delete snapshots older than 48 hours to prevent unbounded DB growth.
 *
 * IMPORTANT: This is BEST-EFFORT cleanup. It will NOT fail the workflow.
 * - Uses SQL RPC function for reliable batched deletes
 * - Has a hard runtime limit (60 seconds)
 * - Always exits with code 0 (even on errors)
 *
 * Requires SQL function: public.delete_old_snapshots_batch(cutoff_ts, batch_size)
 * See: supabase/delete_old_snapshots.sql
 *
 * Usage:
 *   npm run cleanup-snapshots
 *   # or directly:
 *   tsx scripts/cleanupSnapshots.ts
 *
 * Environment variables required:
 *   SUPABASE_URL - Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY - Service role key (for write access)
 */

import { createClient } from '@supabase/supabase-js';

// Configuration
const RETENTION_HOURS = 48;
const BATCH_SIZE = 5000; // Delete in batches to avoid timeouts
const MAX_RUNTIME_MS = 60 * 1000; // Hard stop after 60 seconds
const BATCH_DELAY_MS = 250; // Delay between batches to reduce load

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Run the cleanup using SQL RPC function
 * Returns normally even on errors (best-effort)
 */
async function runCleanup(): Promise<void> {
  const startTime = Date.now();

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║        SNAPSHOT CLEANUP (BEST-EFFORT via RPC)              ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`Started at: ${new Date().toISOString()}`);

  // Validate environment
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.warn('⚠️ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY - skipping cleanup');
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Calculate cutoff time
  const cutoffDate = new Date(Date.now() - RETENTION_HOURS * 60 * 60 * 1000);
  const cutoffTime = cutoffDate.toISOString();

  console.log(`\nConfiguration:`);
  console.log(`  Retention: ${RETENTION_HOURS} hours`);
  console.log(`  Cutoff: ${cutoffTime}`);
  console.log(`  Batch size: ${BATCH_SIZE}`);
  console.log(`  Max runtime: ${MAX_RUNTIME_MS / 1000}s`);
  console.log(`  Batch delay: ${BATCH_DELAY_MS}ms`);

  let totalDeleted = 0;
  let batches = 0;

  try {
    // Try to count rows (optional, don't fail if this errors)
    try {
      const { count, error: countError } = await supabase
        .from('price_snapshots')
        .select('*', { count: 'exact', head: true })
        .lt('created_at', cutoffTime);

      if (!countError && count !== null) {
        console.log(`\nRows older than ${RETENTION_HOURS}h: ${count}`);
      }
    } catch {
      console.log(`\nCould not count rows (non-fatal)`);
    }

    console.log(`\nStarting batched deletion via RPC...`);

    // Batch delete loop using RPC
    while (true) {
      // Check runtime limit
      const elapsed = Date.now() - startTime;
      if (elapsed >= MAX_RUNTIME_MS) {
        console.log(`\n⏱️ Runtime limit reached (${MAX_RUNTIME_MS / 1000}s) - stopping cleanup`);
        break;
      }

      // Call RPC function to delete a batch
      const { data: deletedCount, error: rpcError } = await supabase.rpc(
        'delete_old_snapshots_batch',
        {
          cutoff_ts: cutoffTime,
          batch_size: BATCH_SIZE,
        }
      );

      if (rpcError) {
        console.warn(`\n⚠️ RPC error: ${rpcError.message}`);
        console.warn(`   Code: ${rpcError.code}`);
        console.warn(`   Details: ${JSON.stringify(rpcError.details || rpcError)}`);
        console.log(`   Stopping cleanup (best-effort)`);
        break;
      }

      const deleted = typeof deletedCount === 'number' ? deletedCount : 0;

      if (deleted === 0) {
        console.log(`\n✅ No more rows to delete`);
        break;
      }

      totalDeleted += deleted;
      batches++;

      console.log(`  Batch ${batches}: deleted ${deleted} rows (total: ${totalDeleted})`);

      // If we got fewer than BATCH_SIZE, we're done
      if (deleted < BATCH_SIZE) {
        console.log(`\n✅ All old rows deleted`);
        break;
      }

      // Small delay between batches to reduce DB load
      await sleep(BATCH_DELAY_MS);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.warn(`\n⚠️ Cleanup error (non-fatal): ${errorMessage}`);
    if (error instanceof Error && error.stack) {
      console.warn(`   Stack: ${error.stack.split('\n').slice(0, 3).join('\n')}`);
    }
  }

  const durationMs = Date.now() - startTime;

  console.log(`\n════════════════════════════════════════════════════════════`);
  console.log(`CLEANUP SUMMARY:`);
  console.log(`  Total deleted: ${totalDeleted} rows`);
  console.log(`  Batches: ${batches}`);
  console.log(`  Duration: ${durationMs}ms (${(durationMs / 1000).toFixed(2)}s)`);
  console.log(`  Status: ${totalDeleted > 0 ? '✅ Success' : 'ℹ️ No rows deleted'}`);
  console.log(`════════════════════════════════════════════════════════════`);
}

/**
 * Main execution - ALWAYS exits with code 0
 */
async function main() {
  try {
    await runCleanup();
  } catch (error) {
    // Catch any unexpected errors - still exit 0
    console.error('Unexpected error in cleanup:', error);
  }

  // ALWAYS exit 0 - cleanup is best-effort, never fails the workflow
  console.log('\nCleanup complete (best-effort) - exiting with code 0');
  process.exit(0);
}

// Run the script
main();
