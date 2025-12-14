import React, { useEffect, useState, useCallback } from 'react';
import { sentimentApi } from '../../services/api';
import type { MarketSentiment } from '../../types';

// 情绪等级样式
const sentimentStyles: Record<string, { bg: string; text: string; label: string }> = {
  high: { bg: 'bg-green-500', text: 'text-white', label: '情绪高涨' },
  medium: { bg: 'bg-blue-500', text: 'text-white', label: '情绪正常' },
  low: { bg: 'bg-yellow-500', text: 'text-white', label: '情绪偏弱' },
  extreme_low: { bg: 'bg-red-500', text: 'text-white', label: '情绪极弱' },
};

// 建议样式
const adviceStyles: Record<string, { color: string; label: string }> = {
  aggressive: { color: 'text-green-600', label: '可加仓' },
  normal: { color: 'text-blue-600', label: '正常操作' },
  reduce: { color: 'text-yellow-600', label: '降低仓位' },
  pause: { color: 'text-red-600', label: '暂停交易' },
};

export interface MarketSentimentCardProps {
  /** 日期，格式 YYYYMMDD */
  dateStr: string;
  /** 是否显示标题 */
  showTitle?: boolean;
  /** 自定义标题 */
  title?: string;
  /** 是否显示日期 */
  showDate?: boolean;
  /** 是否自动加载（当提供 externalData 时自动禁用） */
  autoLoad?: boolean;
  /** 额外的 className */
  className?: string;
  /** 数据加载完成回调 */
  onDataLoaded?: (sentiment: MarketSentiment | null) => void;
  /** 外部传入的情绪数据（传入时组件不会自动加载，由外部管理数据） */
  externalData?: MarketSentiment | null;
  /** 外部加载状态 */
  externalLoading?: boolean;
}

/**
 * 市场情绪卡片组件
 * 
 * @example
 * // 基础用法 - 自动加载指定日期的情绪数据
 * <MarketSentimentCard dateStr="20231214" />
 * 
 * // 自定义标题
 * <MarketSentimentCard dateStr="20231214" title="Day2 市场情绪" />
 * 
 * // 不显示标题
 * <MarketSentimentCard dateStr="20231214" showTitle={false} />
 * 
 * // 使用外部数据（由父组件管理数据加载）
 * <MarketSentimentCard dateStr={day2Date} externalData={sentiment} externalLoading={loading} />
 */
export const MarketSentimentCard: React.FC<MarketSentimentCardProps> = ({
  dateStr,
  showTitle = true,
  title = '市场情绪',
  showDate = true,
  autoLoad = true,
  className = '',
  onDataLoaded,
  externalData,
  externalLoading,
}) => {
  const [sentiment, setSentiment] = useState<MarketSentiment | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 获取情绪数据
  const fetchSentiment = useCallback(async () => {
    if (!dateStr || dateStr.length !== 8) {
      setSentiment(null);
      setError('无效的日期格式');
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const response = await sentimentApi.getByDate(dateStr);
      
      if (response.success && response.data) {
        setSentiment(response.data);
        onDataLoaded?.(response.data);
      } else {
        setSentiment(null);
        onDataLoaded?.(null);
      }
    } catch (err) {
      console.error('获取情绪失败:', err);
      setSentiment(null);
      setError('获取情绪数据失败');
      onDataLoaded?.(null);
    } finally {
      setLoading(false);
    }
  }, [dateStr, onDataLoaded]);

  // 自动加载（仅当没有提供外部数据时）
  useEffect(() => {
    if (autoLoad && dateStr && externalData === undefined) {
      fetchSentiment();
    }
  }, [autoLoad, dateStr, fetchSentiment, externalData]);

  // 使用外部数据或内部数据
  const displayData = externalData !== undefined ? externalData : sentiment;
  const isLoading = externalLoading !== undefined ? externalLoading : loading;

  // 格式化日期显示
  const formatDate = (date: string) => {
    if (!date || date.length !== 8) return date || '';
    return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
  };

  return (
    <div className={`bg-white rounded-lg shadow p-4 ${className}`}>
      {showTitle && (
        <h2 className="text-lg font-semibold mb-3 flex items-center">
          🎯 {title}
          {showDate && dateStr && (
            <span className="ml-2 text-sm font-normal text-gray-500">
              （{formatDate(dateStr)}）
            </span>
          )}
          {isLoading && <span className="ml-2 text-sm text-gray-400">加载中...</span>}
        </h2>
      )}
      
      {error && !displayData ? (
        <div className="text-red-500 text-center py-4">{error}</div>
      ) : displayData ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{displayData.score}</div>
            <div className="text-xs text-gray-500">综合评分</div>
          </div>
          <div className="text-center">
            <div className={`inline-block px-2 py-1 rounded text-sm ${sentimentStyles[displayData.level]?.bg || 'bg-gray-500'} ${sentimentStyles[displayData.level]?.text || 'text-white'}`}>
              {sentimentStyles[displayData.level]?.label || displayData.level}
            </div>
            <div className="text-xs text-gray-500 mt-1">情绪等级</div>
          </div>
          <div className="text-center">
            <div className={`text-lg font-semibold ${adviceStyles[displayData.advice]?.color || 'text-gray-600'}`}>
              {adviceStyles[displayData.advice]?.label || displayData.advice}
            </div>
            <div className="text-xs text-gray-500">交易建议</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-red-500">{displayData.limitUpCount}</div>
            <div className="text-xs text-gray-500">涨停数</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-green-500">{displayData.limitDownCount}</div>
            <div className="text-xs text-gray-500">跌停数</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold">{displayData.upDownRatio}</div>
            <div className="text-xs text-gray-500">涨跌比</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-purple-600">{displayData.maxContinuousBoard}板</div>
            <div className="text-xs text-gray-500">最高连板</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-orange-500">{displayData.blastRate}%</div>
            <div className="text-xs text-gray-500">炸板率</div>
          </div>
        </div>
      ) : (
        <div className="text-gray-400 text-center py-4">
          {isLoading ? '加载中...' : '暂无情绪数据'}
        </div>
      )}
    </div>
  );
};

export default MarketSentimentCard;
