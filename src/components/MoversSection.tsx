'use client';

import { useState, useEffect } from 'react';

type WindowType = '1h' | '6h' | '24h';

type MoverData = {
  market_id: string;
  title: string;
  slug: string | null;
  volume_usd: number | null;
  latest_price: number;
  past_price: number;
  change_abs: number;
  change_pct: number;
  change_pp: number; // Probability points
};

type MoversApiResponse = {
  window: string;
  limit: number;
  generatedAt: string;
  topGainers: MoverData[];
  topLosers: MoverData[];
  error?: string;
};

export default function MoversSection() {
  const [window, setWindow] = useState<WindowType>('24h');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gainers, setGainers] = useState<MoverData[]>([]);
  const [losers, setLosers] = useState<MoverData[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const fetchMovers = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/movers?window=${window}&limit=10`);
      const data: MoversApiResponse = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch movers');
      }

      setGainers(data.topGainers);
      setLosers(data.topLosers);
      setLastUpdated(data.generatedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setGainers([]);
      setLosers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMovers();
  }, [window]);

  const formatPrice = (price: number): string => {
    return `${(price * 100).toFixed(1)}%`;
  };

  const formatChange = (change: number): string => {
    const sign = change >= 0 ? '+' : '';
    return `${sign}${change.toFixed(1)}pp`;
  };

  const formatVolume = (volume: number | null): string => {
    if (volume === null || volume === undefined) return '—';
    if (volume >= 1000000) {
      return `$${(volume / 1000000).toFixed(1)}M`;
    }
    if (volume >= 1000) {
      return `$${(volume / 1000).toFixed(1)}K`;
    }
    return `$${volume.toFixed(0)}`;
  };

  const formatTimestamp = (timestamp: string | null): string => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - date.getTime()) / 60000);

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes === 1) return '1 min ago';
    if (diffMinutes < 60) return `${diffMinutes} min ago`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours === 1) return '1 hour ago';
    return `${diffHours} hours ago`;
  };

  const getMarketUrl = (mover: MoverData): string => {
    // Use search fallback to prevent 404s (same as V0)
    return `https://polymarket.com/search?q=${encodeURIComponent(mover.title)}`;
  };

  const MoverRow = ({ mover, isGainer }: { mover: MoverData; isGainer: boolean }) => (
    <a
      href={getMarketUrl(mover)}
      target="_blank"
      rel="noopener noreferrer"
      className="block px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">
            {mover.title}
          </p>
          <p className="text-xs text-gray-500">
            {formatPrice(mover.latest_price)} • {formatVolume(mover.volume_usd)}
          </p>
        </div>
        <div className="text-right">
          <p className={`text-sm font-semibold ${isGainer ? 'text-green-600' : 'text-red-600'}`}>
            {formatChange(mover.change_pp)}
          </p>
        </div>
      </div>
    </a>
  );

  const MoverPanel = ({
    title,
    data,
    isGainer
  }: {
    title: string;
    data: MoverData[];
    isGainer: boolean;
  }) => (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="px-4 py-3 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      </div>
      <div className="divide-y divide-gray-100">
        {loading ? (
          // Loading skeleton
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-4 py-3">
              <div className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
              </div>
            </div>
          ))
        ) : error ? (
          <div className="px-4 py-8 text-center text-sm text-red-600">
            {error}
          </div>
        ) : data.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500">
            Not enough snapshot history for this window yet
          </div>
        ) : (
          data.map((mover) => (
            <MoverRow key={mover.market_id} mover={mover} isGainer={isGainer} />
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="mt-8">
      {/* Section Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-3">
          Price Movers
        </h2>

        {/* Window Selector */}
        <div className="flex items-center gap-4">
          <div className="inline-flex bg-gray-100 rounded-lg p-1">
            {(['1h', '6h', '24h'] as WindowType[]).map((w) => (
              <button
                key={w}
                onClick={() => setWindow(w)}
                disabled={loading}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  window === w
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                } disabled:opacity-50`}
              >
                {w}
              </button>
            ))}
          </div>
          {lastUpdated && !loading && (
            <p className="text-xs text-gray-500">
              Updated {formatTimestamp(lastUpdated)}
            </p>
          )}
        </div>
      </div>

      {/* Movers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <MoverPanel title="Top Gainers" data={gainers} isGainer={true} />
        <MoverPanel title="Top Losers" data={losers} isGainer={false} />
      </div>
    </div>
  );
}
