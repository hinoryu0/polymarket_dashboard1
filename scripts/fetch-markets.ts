/**
 * Data Ingestion CLI Script for Polymarket Markets
 *
 * This script is a thin wrapper around the shared ingestion logic.
 * It's designed to run in GitHub Actions every 5 minutes or can be run manually.
 *
 * The core logic is in src/lib/ingestion/runIngestion.ts and is shared
 * with the API route at /api/snapshot/run (for Vercel Cron).
 */

import { runIngestion } from '../src/lib/ingestion/runIngestion';

/**
 * Main execution function
 */
async function main() {
  try {
    const result = await runIngestion();

    // Log final summary
    console.log('\n=== Ingestion Summary ===');
    console.log(`Markets upserted: ${result.marketsUpserted}`);
    console.log(`Snapshots inserted: ${result.snapshotsInserted}`);

    process.exit(0);
  } catch (error) {
    console.error('=== Data Ingestion Failed ===');
    console.error(error);
    process.exit(1);
  }
}

// Run the script
main();
