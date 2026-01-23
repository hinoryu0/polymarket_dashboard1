import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/debug/snapshots
 * Returns snapshot health stats and sample data for debugging
 *
 * This is a read-only endpoint to help diagnose snapshot data issues
 * Uses SQL aggregates for accurate counts instead of client-side counting
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

    // Query 1: Get accurate aggregates using SQL (not limited by pagination)
    // Use rpc to execute raw SQL for COUNT(*) and COUNT(DISTINCT market_id)
    const { data: aggregates, error: aggregatesError } = await supabase.rpc(
      'get_snapshot_stats_last_48h',
      { hours_ago: 48 }
    ).single() as {
      data: {
        total_snapshots: number;
        distinct_markets: number;
        newest_snapshot_at: string;
        oldest_snapshot_at: string;
      } | null;
      error: any;
    };

    // If RPC doesn't exist, fall back to multiple queries
    let totalSnapshotsLast48h = 0;
    let totalDistinctMarketsLast48h = 0;
    let newestSnapshotAt: string | null = null;
    let oldestSnapshotAt: string | null = null;

    if (aggregatesError || !aggregates) {
      // Fallback: Use head: true with count: 'exact' for total count
      const { count: totalCount, error: countError } = await supabase
        .from('price_snapshots')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', hours48Ago.toISOString())
        .not('yes_price', 'is', null);

      if (countError) {
        throw new Error(`Failed to count snapshots: ${countError.message}`);
      }

      totalSnapshotsLast48h = totalCount || 0;

      // Get distinct market count using a separate query with select on market_id only
      const { data: distinctMarkets, error: distinctError } = await supabase
        .from('price_snapshots')
        .select('market_id')
        .gte('created_at', hours48Ago.toISOString())
        .not('yes_price', 'is', null);

      if (distinctError) {
        throw new Error(`Failed to fetch market IDs: ${distinctError.message}`);
      }

      // Count distinct on client side (this is the limitation we're working around)
      const distinctMarketIds = new Set(distinctMarkets?.map(s => s.market_id) || []);
      totalDistinctMarketsLast48h = distinctMarketIds.size;

      console.warn('RPC function get_snapshot_stats_last_48h not found, using fallback queries');
    } else {
      // Use RPC results
      totalSnapshotsLast48h = aggregates.total_snapshots || 0;
      totalDistinctMarketsLast48h = aggregates.distinct_markets || 0;
      newestSnapshotAt = aggregates.newest_snapshot_at || null;
      oldestSnapshotAt = aggregates.oldest_snapshot_at || null;
    }

    // Query 2: Get newest and oldest timestamps (if not from RPC)
    if (!newestSnapshotAt) {
      const { data: newestSnapshot, error: newestError } = await supabase
        .from('price_snapshots')
        .select('created_at')
        .not('yes_price', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1);

      if (newestError) {
        throw new Error(`Failed to fetch newest snapshot: ${newestError.message}`);
      }

      newestSnapshotAt = newestSnapshot?.[0]?.created_at || null;
    }

    if (!oldestSnapshotAt) {
      const { data: oldestSnapshot48h, error: oldestError } = await supabase
        .from('price_snapshots')
        .select('created_at')
        .gte('created_at', hours48Ago.toISOString())
        .not('yes_price', 'is', null)
        .order('created_at', { ascending: true })
        .limit(1);

      if (oldestError) {
        throw new Error(`Failed to fetch oldest snapshot: ${oldestError.message}`);
      }

      oldestSnapshotAt = oldestSnapshot48h?.[0]?.created_at || null;
    }

    // Query 3: Get 5 newest snapshots with details (sample data)
    const { data: newestSamples, error: newestSamplesError } = await supabase
      .from('price_snapshots')
      .select('market_id, created_at, yes_price')
      .not('yes_price', 'is', null)
      .order('created_at', { ascending: false })
      .limit(5);

    if (newestSamplesError) {
      throw new Error(`Failed to fetch newest samples: ${newestSamplesError.message}`);
    }

    // Query 4: Get 5 oldest snapshots within last 48h (sample data)
    const { data: oldestSamples, error: oldestSamplesError } = await supabase
      .from('price_snapshots')
      .select('market_id, created_at, yes_price')
      .gte('created_at', hours48Ago.toISOString())
      .not('yes_price', 'is', null)
      .order('created_at', { ascending: true })
      .limit(5);

    if (oldestSamplesError) {
      throw new Error(`Failed to fetch oldest samples: ${oldestSamplesError.message}`);
    }

    // Calculate time since newest snapshot
    const timeSinceNewestMinutes = newestSnapshotAt
      ? Math.round((now.getTime() - new Date(newestSnapshotAt).getTime()) / 60000)
      : null;

    // Build response
    const response = {
      generatedAt: now.toISOString(),
      lookbackWindow: '48 hours',
      tableName: 'price_snapshots',

      stats: {
        totalSnapshotsLast48h,
        totalDistinctMarketsLast48h,
        newestSnapshotAt,
        oldestSnapshotAt,
        timeSinceNewestMinutes,
        dataHealthStatus: totalSnapshotsLast48h > 0 ? 'OK' : 'NO_DATA',
      },

      newestSnapshots: newestSamples?.map(s => ({
        market_id: s.market_id,
        created_at: s.created_at,
        yes_price: s.yes_price,
        age_minutes: Math.round((now.getTime() - new Date(s.created_at).getTime()) / 60000),
      })) || [],

      oldestSnapshotsLast48h: oldestSamples?.map(s => ({
        market_id: s.market_id,
        created_at: s.created_at,
        yes_price: s.yes_price,
        age_minutes: Math.round((now.getTime() - new Date(s.created_at).getTime()) / 60000),
      })) || [],

      interpretation: {
        hasData: totalSnapshotsLast48h > 0,
        hasRecentData: timeSinceNewestMinutes !== null && timeSinceNewestMinutes < 120, // Within 2 hours
        hasEnoughMarkets: totalDistinctMarketsLast48h >= 10,
        recommendations: [] as string[],
      },

      _note: aggregatesError
        ? 'Using fallback queries (distinct market count may be inaccurate if >1000 results). Consider creating RPC function for accurate stats.'
        : 'Using SQL aggregates for accurate counts',
    };

    // Add recommendations based on health
    if (totalSnapshotsLast48h === 0) {
      response.interpretation.recommendations.push('No snapshots found! Run data ingestion to populate price_snapshots table.');
    } else if (timeSinceNewestMinutes && timeSinceNewestMinutes > 120) {
      response.interpretation.recommendations.push(`Newest snapshot is ${timeSinceNewestMinutes} minutes old. Consider running ingestion more frequently.`);
    }

    if (totalDistinctMarketsLast48h < 10) {
      response.interpretation.recommendations.push(`Only ${totalDistinctMarketsLast48h} distinct markets found. Expected hundreds of markets.`);
    }

    if (response.interpretation.hasData && response.interpretation.hasRecentData && response.interpretation.hasEnoughMarkets) {
      response.interpretation.recommendations.push('Snapshot data looks healthy! If /api/movers returns empty, check the tolerance settings or time window.');
    }

    console.log(`Snapshot health check: ${totalSnapshotsLast48h} snapshots, ${totalDistinctMarketsLast48h} markets, newest: ${newestSnapshotAt}`);

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in /api/debug/snapshots:', error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to fetch snapshot stats',
        generatedAt: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
