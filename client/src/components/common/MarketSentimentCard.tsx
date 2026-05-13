import React, { useEffect, useState, useCallback } from 'react';
import { moodApi } from '../../services/api';
import type { MarketMood, RecentAverageMood } from '../../types';

// 情绪等级配置
const getSentimentStyle = (strong: number) => {
  if (strong >= 70) return { bg: 'bg-emerald-500', ring: 'text-emerald-500', gradient: 'from-emerald-50 to-emerald-100', border: 'border-emerald-200', text: 'text-emerald-700', label: '情绪高涨', barColor: 'bg-emerald-400' };
  if (strong >= 50) return { bg: 'bg-blue-500', ring: 'text-blue-500', gradient: 'from-blue-50 to-blue-100', border: 'border-blue-200', text: 'text-blue-700', label: '情绪正常', barColor: 'bg-blue-400' };
  if (strong >= 30) return { bg: 'bg-amber-500', ring: 'text-amber-500', gradient: 'from-amber-50 to-amber-100', border: 'border-amber-200', text: 'text-amber-700', label: '情绪偏弱', barColor: 'bg-amber-400' };
  return { bg: 'bg-rose-500', ring: 'text-rose-500', gradient: 'from-rose-50 to-rose-100', border: 'border-rose-200', text: 'text-rose-700', label: '情绪极弱', barColor: 'bg-rose-400' };
};

const getTrendStyle = (trend: 'up' | 'down' | 'stable') => {
  if (trend === 'up') return { icon: '↗', label: '走强', color: 'text-red-500', bg: 'bg-red-50' };
  if (trend === 'down') return { icon: '↘', label: '走弱', color: 'text-green-500', bg: 'bg-green-50' };
  return { icon: '→', label: '平稳', color: 'text-gray-500', bg: 'bg-gray-50' };
};

// SVG 圆环进度组件
const CircularProgress: React.FC<{ value: number; size?: number; strokeWidth?: number; className?: string }> = ({
  value, size = 88, strokeWidth = 6, className = '',
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(value, 100) / 100) * circumference;
  const style = getSentimentStyle(value);

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor"
          strokeWidth={strokeWidth} className="text-gray-100" />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor"
          strokeWidth={strokeWidth} strokeLinecap="round" strokeDasharray={circumference}
          strokeDashoffset={offset} className={`${style.ring} transition-all duration-700 ease-out`} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-gray-800 leading-none">{value}</span>
        <span className={`text-[10px] font-medium mt-0.5 ${style.text}`}>{style.label}</span>
      </div>
    </div>
  );
};

export interface MarketSentimentCardProps {
  dateStr: string;
  showTitle?: boolean;
  title?: string;
  showDate?: boolean;
  autoLoad?: boolean;
  className?: string;
  onDataLoaded?: (mood: MarketMood | null) => void;
  externalData?: MarketMood | null;
  externalLoading?: boolean;
  showRecentAverage?: boolean;
  recentDays?: number;
}

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
  showRecentAverage = true,
  recentDays = 5,
}) => {
  const [mood, setMood] = useState<MarketMood | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentAverage, setRecentAverage] = useState<RecentAverageMood | null>(null);
  const [recentLoading, setRecentLoading] = useState(false);

  const fetchMood = useCallback(async () => {
    if (!dateStr || dateStr.length !== 8) { setMood(null); setError('无效的日期格式'); return; }
    setLoading(true); setError(null);
    try {
      const response = await moodApi.getByDate(dateStr);
      if (response.success && response.data) { setMood(response.data); onDataLoaded?.(response.data); }
      else { setMood(null); onDataLoaded?.(null); }
    } catch (err) {
      console.error('获取情绪失败:', err); setMood(null); setError('获取情绪数据失败'); onDataLoaded?.(null);
    } finally { setLoading(false); }
  }, [dateStr, onDataLoaded]);

  const fetchRecentAverage = useCallback(async () => {
    setRecentLoading(true);
    try {
      const response = await moodApi.getRecentAverage(recentDays, dateStr);
      if (response.success && response.data) setRecentAverage(response.data);
    } catch (err) { console.error('获取近期平均情绪失败:', err); }
    finally { setRecentLoading(false); }
  }, [recentDays, dateStr]);

  useEffect(() => {
    if (autoLoad && dateStr && externalData === undefined) fetchMood();
  }, [autoLoad, dateStr, fetchMood, externalData]);

  useEffect(() => {
    if (showRecentAverage && dateStr) fetchRecentAverage();
  }, [showRecentAverage, dateStr, fetchRecentAverage]);

  const displayData = externalData !== undefined ? externalData : mood;
  const isLoading = externalLoading !== undefined ? externalLoading : loading;

  const formatDate = (date: string) => {
    if (!date || date.length !== 8) return date || '';
    return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
  };

  const sentimentStyle = displayData ? getSentimentStyle(displayData.strong) : null;

  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden ${className}`}>
      {/* 标题栏 */}
      {showTitle && (
        <div className="px-5 pt-4 pb-2 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800 flex items-center gap-1.5">
            <span className="w-1 h-4 bg-blue-500 rounded-full inline-block" />
            {title}
          </h2>
          <div className="flex items-center gap-2">
            {showDate && dateStr && (
              <span className="text-xs text-gray-400">{formatDate(dateStr)}</span>
            )}
            {isLoading && (
              <span className="flex items-center gap-1 text-xs text-gray-400">
                <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                加载中
              </span>
            )}
          </div>
        </div>
      )}

      {error && !displayData ? (
        <div className="text-red-500 text-center py-8 text-sm">{error}</div>
      ) : displayData ? (
        <div className="px-5 pb-4">
          {/* ====== 核心区：圆环 + 指标 ====== */}
          <div className="flex items-center gap-6">
            {/* 左侧：情绪圆环 */}
            <CircularProgress value={displayData.strong} />

            {/* 右侧：三个核心指标 */}
            <div className="flex-1 grid grid-cols-3 gap-3">
              <div className={`rounded-lg p-3 bg-gradient-to-br from-red-50 to-orange-50 border border-red-100`}>
                <div className="text-xl font-bold text-red-600 leading-none">{displayData.ztjs}</div>
                <div className="text-[11px] text-gray-500 mt-1.5">涨停家数</div>
              </div>
              <div className={`rounded-lg p-3 bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-100`}>
                <div className="text-xl font-bold text-purple-600 leading-none">{displayData.lbgd}<span className="text-sm font-medium ml-0.5">板</span></div>
                <div className="text-[11px] text-gray-500 mt-1.5">连板高度</div>
              </div>
              <div className={`rounded-lg p-3 bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100`}>
                <div className="text-xl font-bold text-emerald-600 leading-none">{displayData.dfNum}</div>
                <div className="text-[11px] text-gray-500 mt-1.5">大幅回撤</div>
              </div>
            </div>
          </div>

          {/* ====== 近N日平均 + 趋势图 ====== */}
          {showRecentAverage && recentAverage && recentAverage.days > 0 && (
            <div className={`mt-4 rounded-lg border ${sentimentStyle?.border || 'border-gray-100'} bg-gradient-to-r ${sentimentStyle?.gradient || 'from-gray-50 to-gray-100'} p-4`}>
              {/* 头部：标题 + 趋势标签 */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-gray-600">
                  近 {recentAverage.days} 个交易日
                  <span className="text-gray-400 ml-1.5">
                    {formatDate(recentAverage.dateRange.start)} ~ {formatDate(recentAverage.dateRange.end)}
                  </span>
                </span>
                {(() => {
                  const ts = getTrendStyle(recentAverage.trend);
                  return (
                    <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-medium ${ts.color} ${ts.bg}`}>
                      {ts.icon} {ts.label}
                    </span>
                  );
                })()}
              </div>

              {/* 中间：对比数据 (今日 vs 均值) */}
              <div className="grid grid-cols-4 gap-2 text-center">
                <div>
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-lg font-bold text-gray-800">{recentAverage.avgStrong}</span>
                    {displayData && (
                      <span className={`text-[10px] font-medium ${
                        displayData.strong > recentAverage.avgStrong ? 'text-red-500' :
                        displayData.strong < recentAverage.avgStrong ? 'text-green-500' : 'text-gray-400'
                      }`}>
                        {displayData.strong > recentAverage.avgStrong ? '▲' :
                         displayData.strong < recentAverage.avgStrong ? '▼' : '—'}
                        {displayData.strong !== recentAverage.avgStrong &&
                          Math.abs(displayData.strong - recentAverage.avgStrong)}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-gray-500">均情绪</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-red-600">{recentAverage.avgZtjs}</div>
                  <div className="text-[10px] text-gray-500">均涨停</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-purple-600">{recentAverage.avgLbgd}</div>
                  <div className="text-[10px] text-gray-500">均连板</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-emerald-600">{recentAverage.avgDfNum}</div>
                  <div className="text-[10px] text-gray-500">均回撤</div>
                </div>
              </div>

              {/* 底部：趋势条形图 */}
              {recentAverage.detail.length > 0 && (
                <div className="mt-3 pt-3 border-t border-white/60">
                  <div className="flex items-end gap-1.5 justify-center h-12">
                    {[...recentAverage.detail].reverse().map((item, idx) => {
                      const pct = Math.max(15, (item.strong / 100) * 100);
                      const barStyle = getSentimentStyle(item.strong);
                      const isToday = item.day === dateStr;
                      return (
                        <div key={idx} className="flex flex-col items-center flex-1 max-w-[40px] group relative">
                          {/* tooltip */}
                          <div className="absolute -top-7 left-1/2 -translate-x-1/2 hidden group-hover:flex items-center px-1.5 py-0.5 rounded bg-gray-800 text-white text-[10px] whitespace-nowrap z-10 shadow">
                            {item.strong}
                          </div>
                          <div
                            className={`w-full rounded-sm ${barStyle.barColor} ${isToday ? 'ring-2 ring-offset-1 ring-blue-400' : ''} transition-all duration-300`}
                            style={{ height: `${pct}%` }}
                          />
                          <div className={`text-[9px] mt-1 ${isToday ? 'text-blue-600 font-bold' : 'text-gray-400'}`}>
                            {item.day.slice(6, 8)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
          {showRecentAverage && recentLoading && !recentAverage && (
            <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50 p-4 text-center text-xs text-gray-400">
              正在加载近期情绪数据...
            </div>
          )}
        </div>
      ) : (
        <div className="text-gray-400 text-center py-10 text-sm">
          {isLoading ? '加载中...' : '暂无情绪数据'}
        </div>
      )}
    </div>
  );
};

export default MarketSentimentCard;
