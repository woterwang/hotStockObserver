import { useState, useEffect, useCallback } from 'react';

interface UseFetchResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * 通用数据获取Hook
 */
export function useFetch<T>(
  fetchFn: () => Promise<{ success: boolean; data: T }>,
  deps: unknown[] = []
): UseFetchResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchFn();
      if (response.success) {
        setData(response.data);
      } else {
        throw new Error('请求失败');
      }
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [fetchFn]);

  useEffect(() => {
    fetch();
  }, [...deps, fetch]);

  return { data, loading, error, refetch: fetch };
}

/**
 * 股价涨跌颜色Hook
 */
export function usePriceColor(value: number): string {
  if (value > 0) return 'text-rise';
  if (value < 0) return 'text-fall';
  return 'text-flat';
}

/**
 * 格式化数字
 */
export function useFormatNumber() {
  const formatPercent = (value: number): string => {
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  };

  const formatPrice = (value: number): string => {
    return value.toFixed(2);
  };

  const formatTurnover = (value: number): string => {
    if (value >= 100000000) {
      return `${(value / 100000000).toFixed(2)}亿`;
    }
    if (value >= 10000) {
      return `${(value / 10000).toFixed(2)}万`;
    }
    return value.toFixed(2);
  };

  const formatVolume = (value: number): string => {
    if (value >= 10000) {
      return `${(value / 10000).toFixed(2)}万手`;
    }
    return `${value}手`;
  };

  return { formatPercent, formatPrice, formatTurnover, formatVolume };
}
