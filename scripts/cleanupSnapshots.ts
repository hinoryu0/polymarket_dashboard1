/**
 * Retention Cleanup Script for price_snapshots Table
 *
 * Policy: Delete snapshots older than 48 hours to prevent unbounded DB growth.
 * Designed for Supabase Free tier:
 * - Uses batched deletes to avoid statement timeouts
 * - Logs progress and timing for monitoring
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
const MAX_ITERATIONS = 100; // Safety limit to prevent infinite loops

interface CleanupResult {
  totalDeleted: number;
  batches: number;
  durationMs: number;
  error: string | null;
}

/**
 * Run the cleanup with batched deletes for safety
 */
async function runCleanup(): Promise<CleanupResult> {
  const startTime = Date.now();

  // Validate environment
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return {
      totalDeleted: 0,
      batches: 0,
      durationMs: 0,
      error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables',
    };
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const cutoffTime = new Date(Date.now() - RETENTION_HOURS * 60 * 60 * 1000).toISOString();

  console.log(`=== Snapshot Cleanup Started ===`);
  console.log(`Retention policy: ${RETENTION_HOURS} hours`);
  console.log(`Cutoff time: ${cutoffTime}`);
  console.log(`Batch size: ${BATCH_SIZE}`);

  let totalDeleted = 0;
  let batches = 0;

  try {
    // First, count how many rows will be deleted (for logging)
    const { count: toDeleteCount, error: countError } = await supabase
      .from('price_snapshots')
      .select('*', { count: 'exact', head: true })
      .lt('created_at', cutoffTime);

    if (countError) {
      console.warn(`Warning: Could not count rows to delete: ${countError.message}`);
    } else {
      console.log(`Rows to delete: ${toDeleteCount ?? 'unknown'}`);
    }

    // Batch delete loop
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      // Find IDs of old rows to delete (batch)
      const { data: oldRows, error: selectError } = await supabase
        .from('price_snapshots')
        .select('id')
        .lt('created_at', cutoffTime)
        .limit(BATCH_SIZE);

      if (selectError) {
        throw new Error(`Failed to select old rows: ${selectError.message}`);
      }

      if (!oldRows || oldRows.length === 0) {
        console.log(`No more rows to delete after ${batches} batches`);
        break;
      }

      const idsToDelete = oldRows.map((row) => row.id);

      // Delete the batch
      const { error: deleteError } = await supabase
        .from('price_snapshots')
        .delete()
        .in('id', idsToDelete);

      if (deleteError) {
        throw new Error(`Failed to delete batch: ${deleteError.message}`);
      }

      totalDeleted += idsToDelete.length;
      batches++;

      console.log(`Batch ${batches}: Deleted ${idsToDelete.length} rows (total: ${totalDeleted})`);

      // If we got fewer than BATCH_SIZE, we're done
      if (oldRows.length < BATCH_SIZE) {
        break;
      }
    }

    const durationMs = Date.now() - startTime;

    console.log(`=== Cleanup Complete ===`);
    console.log(`Total deleted: ${totalDeleted} rows`);
    console.log(`Batches: ${batches}`);
    console.log(`Duration: ${durationMs}ms (${(durationMs / 1000).toFixed(2)}s)`);

    return {
      totalDeleted,
      batches,
      durationMs,
      error: null,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    console.error(`=== Cleanup Failed ===`);
    console.error(`Error: ${errorMessage}`);
    console.error(`Deleted before failure: ${totalDeleted} rows in ${batches} batches`);

    return {
      totalDeleted,
      batches,
      durationMs,
      error: errorMessage,
    };
  }
}

/**
 * Main execution
 */
async function main() {
  const result = await runCleanup();

  if (result.error) {
    console.error(`Cleanup failed: ${result.error}`);
    process.exit(1);
  }

  // Success
  process.exit(0);
}

// Run the script
main();
