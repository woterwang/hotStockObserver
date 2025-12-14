import { useState, useEffect, useCallback } from 'react';
import { Layout, MarketSentimentCard } from '../components';
import type { MarketMood } from '../types';

// 入场条件
interface EntryConditions {
  openAboveDay2Avg: boolean;
  openChangeInRange: boolean;
  openAboveDay2Low: boolean;
  day2VolumeOk: boolean;
  day2CloseInUpperHalf: boolean;
  day2NoLongUpperShadow: boolean;
}

// 卖出条件
interface ExitConditions {
  stopLossPrice: number;
  stopLossPercent: number;
  takeProfitPrice: number;
  takeProfitPercent: number;
  altStopLossPrice: number;
}

// 策略类型
type StrategyType = 'breakthrough_3day' | 'volume_surge' | 'volume_breakout' | 'ma_crossover' | 'limit_up_follow' | 'other';

// 策略配置
const STRATEGY_INFO: Record<StrategyType, { name: string; description: string; color: string; bgColor: string }> = {
  breakthrough_3day: {
    name: '突破三天',
    description: '价格突破188日新高后三天确认模式',
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
  volume_surge: {
    name: '放量大涨',
    description: '放量大涨次日追踪策略',
    color: 'text-orange-600',
    bgColor: 'bg-orange-100',
  },
  volume_breakout: {
    name: '放量突破',
    description: '放量突破关键价位策略',
    color: 'text-green-600',
    bgColor: 'bg-green-100',
  },
  ma_crossover: {
    name: '均线金叉',
    description: '均线金叉买入策略',
    color: 'text-purple-600',
    bgColor: 'bg-purple-100',
  },
  limit_up_follow: {
    name: '涨停追踪',
    description: '涨停板次日追踪策略',
    color: 'text-red-600',
    bgColor: 'bg-red-100',
  },
  other: {
    name: '其他',
    description: '其他策略',
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
  },
};

// 交易信号
interface TradingSignal {
  _id: string;
  strategy?: StrategyType;
  signalDate: string;
  stockCode: string;
  stockName: string;
  day1Date: string;
  day1Close: number;
  day1Change: number;
  day2Date: string;
  day2Open: number;
  day2Close: number;
  day2High: number;
  day2Low: number;
  day2Change: number;
  day2Avg: number;
  day3Open?: number;
  day3OpenChange?: number;
  entryConditions?: EntryConditions;
  entryScore?: number;
  exitConditions?: ExitConditions;
  status: string;
  sector?: string;
  riseReason?: string;
  // 放量大涨策略专用字段
  riskLevel?: 'low' | 'medium' | 'high';
  riskReasons?: string[];
  day1TurnoverRate?: number;
  isLimitUp?: boolean;
  suggestedPosition?: number;
  marketSentimentScore?: number;
}

// 状态样式
const statusStyles: Record<string, { bg: string; text: string; label: string }> = {
  ready: { bg: 'bg-green-100', text: 'text-green-800', label: '可入场 ✓' },
  partial: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: '部分满足' },
  pending: { bg: 'bg-blue-100', text: 'text-blue-800', label: '待更新' },
  rejected: { bg: 'bg-red-100', text: 'text-red-800', label: '不满足' },
  entered: { bg: 'bg-purple-100', text: 'text-purple-800', label: '已入场' },
  exited: { bg: 'bg-gray-100', text: 'text-gray-800', label: '已退出' },
  expired: { bg: 'bg-gray-100', text: 'text-gray-500', label: '已过期' },
};

export default function SignalPage() {
  const [signals, setSignals] = useState<TradingSignal[]>([]);
  const [mood, setMood] = useState<MarketMood | null>(null);
  const [loading, setLoading] = useState(false);
  const [moodLoading, setMoodLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().slice(0, 10).replace(/-/g, '')
  );
  const [day2Date, setDay2Date] = useState<string | null>(null); // Day2日期，用于显示情绪
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyType | 'all'>('all'); // 策略筛选
  const [summary, setSummary] = useState({
    total: 0,
    ready: 0,
    partial: 0,
    pending: 0,
    rejected: 0,
  });
  const [filter, setFilter] = useState<string>('all');
  const [selectedSignal, setSelectedSignal] = useState<TradingSignal | null>(null);

  // 加载信号数据
  const fetchSignals = useCallback(async () => {
    setLoading(true);
    try {
      const strategyParam = selectedStrategy !== 'all' ? `&strategy=${selectedStrategy}` : '';
      const response = await fetch(`/api/signals/today?date=${selectedDate}${strategyParam}`);
      const data = await response.json();
      
      if (data.success) {
        setSignals(data.data.signals || []);
        setSummary(data.data.summary || { total: 0, ready: 0, partial: 0, pending: 0, rejected: 0 });
        // 保存 Day2 日期用于获取情绪
        if (data.data.day2DateStr) {
          setDay2Date(data.data.day2DateStr);
        } else {
          setDay2Date(null);
        }
      }
    } catch (error) {
      console.error('获取信号失败:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, selectedStrategy]);

  // 加载情绪数据（使用 Day2 日期）
  const fetchMood = useCallback(async () => {
    // 如果没有 Day2 日期，不获取情绪
    if (!day2Date) {
      setMood(null);
      return;
    }
    
    setMoodLoading(true);
    try {
      const response = await fetch(`/api/market/mood/${day2Date}`);
      const data = await response.json();
      
      if (data.success) {
        setMood(data.data);
      } else {
        setMood(null);
      }
    } catch (error) {
      console.error('获取情绪失败:', error);
      setMood(null);
    } finally {
      setMoodLoading(false);
    }
  }, [day2Date]);

  // 手动触发生成信号
  const handleGenerateSignals = async () => {
    if (!confirm(`确定要生成 ${selectedDate} 的入场信号吗？\n\n选择的日期 ${selectedDate} 为入场日（Day3），\n系统会自动往前推算 Day1（突破日）和 Day2（确认日）。`)) {
      return;
    }
    
    setLoading(true);
    try {
      const response = await fetch('/api/signals/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate }),
      });
      const data = await response.json();
      
      if (data.success) {
        const { count, day1, day2 } = data.data;
        alert(`成功生成 ${count} 个信号\n\nDay1(突破日): ${day1}\nDay2(确认日): ${day2}\nDay3(入场日): ${selectedDate}`);
        fetchSignals();
      } else {
        alert(`生成失败: ${data.message}`);
      }
    } catch (error) {
      alert('生成信号失败');
    } finally {
      setLoading(false);
    }
  };

  // 手动更新入场条件
  const handleUpdateEntry = async () => {
    if (!confirm(`确定要更新 ${selectedDate} 的入场条件吗？\n\n这将获取 Day3 开盘价并判断入场条件。`)) {
      return;
    }
    
    setLoading(true);
    try {
      const response = await fetch('/api/signals/update-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate }),
      });
      const data = await response.json();
      
      if (data.success) {
        alert(`更新完成: 可入场=${data.data.ready}, 部分满足=${data.data.partial}, 不满足=${data.data.rejected}`);
        fetchSignals();
      } else {
        alert(`更新失败: ${data.message}`);
      }
    } catch (error) {
      alert('更新入场条件失败');
    } finally {
      setLoading(false);
    }
  };

  // 手动获取情绪数据（获取 Day2 的情绪）
  const handleFetchMood = async () => {
    // 如果没有 day2Date，需要先有信号才能知道 Day2
    const dateToFetch = day2Date || selectedDate;
    
    setMoodLoading(true);
    try {
      const response = await fetch(`/api/market/mood/${dateToFetch}`);
      const data = await response.json();
      
      if (data.success) {
        setMood(data.data);
        alert(`情绪数据获取成功（${dateToFetch}），大盘情绪: ${data.data.strong}`);
      } else {
        alert(`获取失败: ${data.message}`);
      }
    } catch (error) {
      alert('获取情绪数据失败');
    } finally {
      setMoodLoading(false);
    }
  };

  // 初始加载信号
  useEffect(() => {
    fetchSignals();
  }, [fetchSignals]);

  // 当 day2Date 变化时加载情绪
  useEffect(() => {
    fetchMood();
  }, [fetchMood]);

  // 过滤信号
  const filteredSignals = signals.filter(s => {
    if (filter === 'all') return true;
    return s.status === filter;
  });

  // 渲染入场条件检查
  const renderEntryConditions = (conditions: EntryConditions | undefined) => {
    if (!conditions) return <span className="text-gray-400">未检查</span>;
    
    const items = [
      { key: 'openAboveDay2Avg', label: '开盘>Day2均价', value: conditions.openAboveDay2Avg },
      { key: 'openChangeInRange', label: '开盘涨幅±5%', value: conditions.openChangeInRange },
      { key: 'openAboveDay2Low', label: '不破Day2低点', value: conditions.openAboveDay2Low },
      { key: 'day2VolumeOk', label: 'Day2量≤1.1倍', value: conditions.day2VolumeOk },
      { key: 'day2CloseInUpperHalf', label: 'Day2收上半部', value: conditions.day2CloseInUpperHalf },
      { key: 'day2NoLongUpperShadow', label: 'Day2无长上影', value: conditions.day2NoLongUpperShadow },
    ];

    return (
      <div className="grid grid-cols-2 gap-1 text-xs">
        {items.map(item => (
          <div key={item.key} className={`flex items-center ${item.value ? 'text-green-600' : 'text-red-500'}`}>
            <span className="mr-1">{item.value ? '✓' : '✗'}</span>
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <Layout>
      <div className="p-6">
        {/* 标题和控制区 */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">📊 突破追踪三日信号</h1>
          
          <div className="flex flex-wrap items-center gap-4">
            {/* 策略选择 */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">策略:</label>
              <select
                value={selectedStrategy}
                onChange={(e) => setSelectedStrategy(e.target.value as StrategyType | 'all')}
                className="border rounded px-3 py-1.5 text-sm"
              >
                <option value="all">全部策略</option>
                {Object.entries(STRATEGY_INFO).map(([key, info]) => (
                  <option key={key} value={key}>{info.name}</option>
                ))}
              </select>
            </div>
            
            {/* 日期选择 */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">日期:</label>
              <input
                type="date"
                value={selectedDate.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')}
                onChange={(e) => setSelectedDate(e.target.value.replace(/-/g, ''))}
                className="border rounded px-3 py-1.5 text-sm"
              />
            </div>

            {/* 操作按钮 */}
            <button
              onClick={fetchSignals}
              disabled={loading}
              className="px-4 py-1.5 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 disabled:opacity-50"
            >
              {loading ? '加载中...' : '刷新'}
            </button>
            
            <button
              onClick={handleGenerateSignals}
              disabled={loading}
              className="px-4 py-1.5 bg-green-500 text-white rounded text-sm hover:bg-green-600 disabled:opacity-50"
            >
              生成信号
            </button>
            
            <button
              onClick={handleUpdateEntry}
              disabled={loading}
              className="px-4 py-1.5 bg-orange-500 text-white rounded text-sm hover:bg-orange-600 disabled:opacity-50"
            >
              更新入场条件
            </button>

            <button
              onClick={handleFetchMood}
              disabled={moodLoading}
              className="px-4 py-1.5 bg-purple-500 text-white rounded text-sm hover:bg-purple-600 disabled:opacity-50"
            >
              获取情绪
            </button>
          </div>
        </div>

        {/* 市场情绪卡片 */}
        <MarketSentimentCard
          dateStr={day2Date || ''}
          title="市场情绪"
          showDate={!!day2Date}
          externalData={mood}
          externalLoading={moodLoading}
          className="mb-6"
        />

        {/* 统计和筛选 */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-6">
              <span className="text-gray-600">总计: <strong>{summary.total}</strong></span>
              <span className="text-green-600">可入场: <strong>{summary.ready}</strong></span>
              <span className="text-yellow-600">部分满足: <strong>{summary.partial}</strong></span>
              <span className="text-blue-600">待更新: <strong>{summary.pending}</strong></span>
              <span className="text-red-600">不满足: <strong>{summary.rejected}</strong></span>
            </div>
            
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">筛选:</label>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="border rounded px-3 py-1.5 text-sm"
              >
                <option value="all">全部</option>
                <option value="ready">可入场</option>
                <option value="partial">部分满足</option>
                <option value="pending">待更新</option>
                <option value="rejected">不满足</option>
              </select>
            </div>
          </div>
        </div>

        {/* 信号列表 */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {loading ? (
            <div className="text-center py-12 text-gray-400">加载中...</div>
          ) : filteredSignals.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              暂无信号数据
              <p className="text-sm mt-2">请先点击"生成信号"按钮生成入场信号</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">股票</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">状态</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Day1涨幅</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Day2涨幅</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Day3开盘</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">评分/风险</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">止损价</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">止盈价</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">操作</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredSignals.map((signal) => {
                    const strategyInfo = signal.strategy ? STRATEGY_INFO[signal.strategy] : STRATEGY_INFO.breakthrough_3day;
                    // 风险等级样式
                    const riskStyles = {
                      low: { bg: 'bg-green-100', text: 'text-green-700', label: '低风险' },
                      medium: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: '中风险' },
                      high: { bg: 'bg-red-100', text: 'text-red-700', label: '高风险' },
                    };
                    const isVolumeSurge = signal.strategy === 'volume_surge';
                    return (
                    <tr key={signal._id} className={`hover:bg-gray-50 ${signal.status === 'ready' ? 'bg-green-50' : ''} ${signal.riskLevel === 'high' ? 'bg-red-50' : ''}`}>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-900">{signal.stockName}</span>
                              <span className={`px-1.5 py-0.5 text-xs rounded ${strategyInfo.bgColor} ${strategyInfo.color}`}>
                                {strategyInfo.name}
                              </span>
                              {signal.isLimitUp && (
                                <span className="px-1 py-0.5 text-xs rounded bg-red-500 text-white">涨停</span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500">
                              {signal.stockCode}
                              {isVolumeSurge && signal.day1TurnoverRate && (
                                <span className="ml-2 text-blue-500">换手:{signal.day1TurnoverRate.toFixed(1)}%</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded ${statusStyles[signal.status]?.bg} ${statusStyles[signal.status]?.text}`}>
                          {statusStyles[signal.status]?.label || signal.status}
                        </span>
                      </td>
                      <td className={`px-4 py-3 whitespace-nowrap text-right text-sm ${signal.day1Change >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                        {signal.day1Change >= 0 ? '+' : ''}{signal.day1Change.toFixed(2)}%
                      </td>
                      <td className={`px-4 py-3 whitespace-nowrap text-right text-sm ${signal.day2Change >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                        {signal.day2Change >= 0 ? '+' : ''}{signal.day2Change.toFixed(2)}%
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        {signal.day3Open ? (
                          <div>
                            <div className="text-sm font-medium">{signal.day3Open.toFixed(2)}</div>
                            <div className={`text-xs ${(signal.day3OpenChange || 0) >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                              {(signal.day3OpenChange || 0) >= 0 ? '+' : ''}{(signal.day3OpenChange || 0).toFixed(2)}%
                            </div>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-sm">--</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        {isVolumeSurge && signal.riskLevel ? (
                          <div title={signal.riskReasons?.join('\n') || ''}>
                            <span className={`px-2 py-1 text-xs rounded ${riskStyles[signal.riskLevel].bg} ${riskStyles[signal.riskLevel].text}`}>
                              {riskStyles[signal.riskLevel].label}
                            </span>
                            {signal.suggestedPosition && (
                              <div className="text-xs text-gray-500 mt-1">
                                建议{(signal.suggestedPosition * 100).toFixed(0)}%仓
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className={`text-lg font-bold ${(signal.entryScore || 0) >= 5 ? 'text-green-600' : (signal.entryScore || 0) >= 4 ? 'text-yellow-600' : 'text-red-500'}`}>
                            {signal.entryScore || 0}/6
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-red-500">
                        {signal.exitConditions?.stopLossPrice?.toFixed(2) || '--'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-green-500">
                        {signal.exitConditions?.takeProfitPrice?.toFixed(2) || '--'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <button
                          onClick={() => setSelectedSignal(signal)}
                          className="text-blue-500 hover:text-blue-700 text-sm"
                        >
                          详情
                        </button>
                      </td>
                    </tr>
                  );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 详情弹窗 */}
        {selectedSignal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setSelectedSignal(null)}>
            <div className="bg-white rounded-lg shadow-xl p-6 max-w-lg w-full mx-4" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold">
                  {selectedSignal.stockName} ({selectedSignal.stockCode})
                </h3>
                <button onClick={() => setSelectedSignal(null)} className="text-gray-400 hover:text-gray-600">
                  ✕
                </button>
              </div>
              
              {/* 状态 */}
              <div className="mb-4">
                <span className={`px-3 py-1 rounded ${statusStyles[selectedSignal.status]?.bg} ${statusStyles[selectedSignal.status]?.text}`}>
                  {statusStyles[selectedSignal.status]?.label || selectedSignal.status}
                </span>
                <span className="ml-2 text-gray-500">评分: {selectedSignal.entryScore}/6</span>
              </div>

              {/* 三天数据 */}
              <div className="grid grid-cols-3 gap-4 mb-4 text-center">
                <div className="bg-gray-50 p-3 rounded">
                  <div className="text-xs text-gray-500">Day1 突破日</div>
                  <div className={`text-lg font-bold ${selectedSignal.day1Change >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                    {selectedSignal.day1Change >= 0 ? '+' : ''}{selectedSignal.day1Change.toFixed(2)}%
                  </div>
                  <div className="text-xs text-gray-400">收盘 {selectedSignal.day1Close.toFixed(2)}</div>
                </div>
                <div className="bg-gray-50 p-3 rounded">
                  <div className="text-xs text-gray-500">Day2 确认日</div>
                  <div className={`text-lg font-bold ${selectedSignal.day2Change >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                    {selectedSignal.day2Change >= 0 ? '+' : ''}{selectedSignal.day2Change.toFixed(2)}%
                  </div>
                  <div className="text-xs text-gray-400">收盘 {selectedSignal.day2Close.toFixed(2)}</div>
                </div>
                <div className="bg-gray-50 p-3 rounded">
                  <div className="text-xs text-gray-500">Day3 入场日</div>
                  {selectedSignal.day3Open ? (
                    <>
                      <div className={`text-lg font-bold ${(selectedSignal.day3OpenChange || 0) >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                        {(selectedSignal.day3OpenChange || 0) >= 0 ? '+' : ''}{(selectedSignal.day3OpenChange || 0).toFixed(2)}%
                      </div>
                      <div className="text-xs text-gray-400">开盘 {selectedSignal.day3Open.toFixed(2)}</div>
                    </>
                  ) : (
                    <div className="text-gray-400">待更新</div>
                  )}
                </div>
              </div>

              {/* 入场条件 */}
              <div className="mb-4">
                <div className="text-sm font-medium text-gray-700 mb-2">入场条件检查:</div>
                {renderEntryConditions(selectedSignal.entryConditions)}
              </div>

              {/* 止盈止损 */}
              {selectedSignal.exitConditions && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-red-50 p-3 rounded">
                    <div className="text-xs text-gray-500">止损价</div>
                    <div className="text-lg font-bold text-red-500">
                      {selectedSignal.exitConditions.stopLossPrice.toFixed(2)}
                    </div>
                    <div className="text-xs text-gray-400">
                      Day2低点下方2%
                    </div>
                  </div>
                  <div className="bg-green-50 p-3 rounded">
                    <div className="text-xs text-gray-500">止盈价</div>
                    <div className="text-lg font-bold text-green-500">
                      {selectedSignal.exitConditions.takeProfitPrice.toFixed(2)}
                    </div>
                    <div className="text-xs text-gray-400">
                      +10% 止盈
                    </div>
                  </div>
                </div>
              )}

              {/* 板块信息 */}
              {(selectedSignal.sector || selectedSignal.riseReason) && (
                <div className="mt-4 text-sm text-gray-500">
                  {selectedSignal.sector && <div>板块: {selectedSignal.sector}</div>}
                  {selectedSignal.riseReason && <div>原因: {selectedSignal.riseReason}</div>}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
