/**
 * Data Ingestion CLI Script for Polymarket Markets
 *
 * This script is a thin wrapper around the shared ingestion logic.
 * It's designed to run in GitHub Actions every 5 minutes or can be run manually.
 *
 * The core logic is in src/lib/ingestion/runIngestion.ts and is shared
 * with the API route at /api/snapshot/run (for manual triggering).
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
    console.log(`Fetched (total): ${result.fetchedMarketsTotal}`);
    console.log(`Filtered (inactive): ${result.filteredInactiveCount}`);
    console.log(`Filtered (sports): ${result.filteredSportsCount}`);
    console.log(`Kept (total): ${result.keptMarketsTotal}`);
    console.log(`Markets upserted: ${result.marketsUpserted}`);
    console.log('\n--- Categorization ---');
    console.log(`Categorized markets: ${result.categorizedMarkets}`);
    console.log(`Allowed category markets: ${result.allowedCategoryMarkets}`);
    console.log(`Excluded category markets: ${result.excludedCategoryMarkets}`);
    console.log('\n--- Snapshots ---');
    console.log(`Snapshots inserted: ${result.snapshotsInserted}`);
    console.log(`Snapshots skipped (category): ${result.snapshotsSkippedByCategory}`);
    console.log(`Snapshots skipped (price range): ${result.snapshotsSkippedByPrice}`);
    console.log(`Last snapshot: ${result.lastSnapshotCreatedAt || 'N/A'}`);

    // Show category breakdown
    if (result.categoryBreakdown && Object.keys(result.categoryBreakdown).length > 0) {
      console.log('\n--- Category Breakdown ---');
      const sorted = Object.entries(result.categoryBreakdown).sort((a, b) => b[1] - a[1]);
      for (const [cat, count] of sorted) {
        console.log(`  ${cat}: ${count}`);
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('=== Data Ingestion Failed ===');
    console.error(error);
    process.exit(1);
  }
}

// Run the script
main();
