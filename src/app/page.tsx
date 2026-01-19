'use client';

import { useState, useEffect } from 'react';
import { Market } from '@/lib/providers/types';

type ApiResponse = {
  success: boolean;
  markets: Market[];
  error?: string;
};

export default function Dashboard() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMarkets = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/markets');
      const data: ApiResponse = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch markets');
      }

      setMarkets(data.markets);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setMarkets([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMarkets();
  }, []);

  const formatPrice = (price: number | undefined): string => {
    if (price === undefined || price === null) return '—';
    return `${(price * 100).toFixed(1)}%`;
  };

  const formatVolume = (volume: number | undefined): string => {
    if (volume === undefined || volume === null) return '—';
    return `$${volume.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Polymarket Dashboard
          </h1>
          <p className="text-gray-600 mb-6">
            Top movers / Inefficiency scanner
          </p>
          <button
            onClick={fetchMarkets}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="text-center py-12">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
            <p className="mt-4 text-gray-600">Loading markets...</p>
          </div>
        )}

        {/* Error State */}
        {!loading && error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <p className="text-red-800 font-semibold mb-3">Error: {error}</p>
            <button
              onClick={fetchMarkets}
              className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && markets.length === 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
            <p className="text-yellow-800 font-semibold">No markets found</p>
            <p className="text-yellow-600 text-sm mt-2">
              Run the data ingestion script to populate markets
            </p>
          </div>
        )}

        {/* Markets List */}
        {!loading && !error && markets.length > 0 && (
          <div className="space-y-4">
            {markets.map((market) => (
              <div
                key={market.id}
                className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow"
              >
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      {market.title}
                    </h3>
                    <div className="flex gap-6 text-sm text-gray-600">
                      <div>
                        <span className="font-medium">Yes Price:</span>{' '}
                        <span className="text-green-600 font-semibold">
                          {formatPrice(market.yesPrice)}
                        </span>
                      </div>
                      <div>
                        <span className="font-medium">Volume:</span>{' '}
                        {formatVolume(market.volumeUsd)}
                      </div>
                    </div>
                  </div>
                  {market.url && market.url.startsWith('https://polymarket.com/') ? (
                    <a
                      href={market.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors whitespace-nowrap"
                    >
                      Open
                    </a>
                  ) : (
                    <div className="text-center">
                      <button
                        disabled
                        className="bg-gray-400 text-white font-semibold py-2 px-4 rounded-lg cursor-not-allowed whitespace-nowrap"
                      >
                        Open
                      </button>
                      <p className="text-xs text-gray-500 mt-1">No link</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
