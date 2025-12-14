import React, { useEffect, useState, useCallback } from 'react';
import { moodApi } from '../../services/api';
import type { MarketMood } from '../../types';

// 情绪等级样式（根据 strong 值判断）
const getSentimentStyle = (strong: number) => {
  if (strong >= 70) return { bg: 'bg-green-500', text: 'text-white', label: '情绪高涨' };
  if (strong >= 50) return { bg: 'bg-blue-500', text: 'text-white', label: '情绪正常' };
  if (strong >= 30) return { bg: 'bg-yellow-500', text: 'text-white', label: '情绪偏弱' };
  return { bg: 'bg-red-500', text: 'text-white', label: '情绪极弱' };
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
  onDataLoaded?: (mood: MarketMood | null) => void;
  /** 外部传入的情绪数据（传入时组件不会自动加载，由外部管理数据） */
  externalData?: MarketMood | null;
  /** 外部加载状态 */
  externalLoading?: boolean;
}

/**
 * 市场情绪卡片组件
 * 
 * 展示 market_mood.json 中的字段：
 * - strong: 大盘情绪（综合强度）
 * - ztjs: 涨停家数
 * - lbgd: 连板高度
 * - dfNum: 跌幅数量
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
  const [mood, setMood] = useState<MarketMood | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 获取情绪数据
  const fetchMood = useCallback(async () => {
    if (!dateStr || dateStr.length !== 8) {
      setMood(null);
      setError('无效的日期格式');
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const response = await moodApi.getByDate(dateStr);
      
      if (response.success && response.data) {
        setMood(response.data);
        onDataLoaded?.(response.data);
      } else {
        setMood(null);
        onDataLoaded?.(null);
      }
    } catch (err) {
      console.error('获取情绪失败:', err);
      setMood(null);
      setError('获取情绪数据失败');
      onDataLoaded?.(null);
    } finally {
      setLoading(false);
    }
  }, [dateStr, onDataLoaded]);

  // 自动加载（仅当没有提供外部数据时）
  useEffect(() => {
    if (autoLoad && dateStr && externalData === undefined) {
      fetchMood();
    }
  }, [autoLoad, dateStr, fetchMood, externalData]);

  // 使用外部数据或内部数据
  const displayData = externalData !== undefined ? externalData : mood;
  const isLoading = externalLoading !== undefined ? externalLoading : loading;

  // 格式化日期显示
  const formatDate = (date: string) => {
    if (!date || date.length !== 8) return date || '';
    return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
  };

  // 获取情绪样式
  const sentimentStyle = displayData ? getSentimentStyle(displayData.strong) : null;

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
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{displayData.strong}</div>
            <div className="text-xs text-gray-500">大盘情绪</div>
          </div>
          <div className="text-center">
            <div className={`inline-block px-2 py-1 rounded text-sm ${sentimentStyle?.bg} ${sentimentStyle?.text}`}>
              {sentimentStyle?.label}
            </div>
            <div className="text-xs text-gray-500 mt-1">情绪等级</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-red-500">{displayData.ztjs}</div>
            <div className="text-xs text-gray-500">涨停家数</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-purple-600">{displayData.lbgd}板</div>
            <div className="text-xs text-gray-500">连板高度</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-green-600">{displayData.dfNum}</div>
            <div className="text-xs text-gray-500">大幅回撤</div>
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
