import React, { useEffect, useState } from 'react';
import { Layout, Loading, ErrorMessage, Empty, DatePicker } from '../components';
import { buySignalApi } from '../services/api';
import type { BuySignal, BuySignalStats } from '../types';
import dayjs from 'dayjs';

// 策略类型配置
const STRATEGY_CONFIG = {
  all: { label: '全部策略', icon: '📊', color: 'gray' },
  volume_surge: { label: '放量突破', icon: '📈', color: 'blue' },
  breakthrough: { label: '价格突破', icon: '🚀', color: 'purple' },
  limit_up: { label: '涨停板', icon: '🔝', color: 'red' },
  ma_crossover: { label: '均线金叉', icon: '✨', color: 'green' },
} as const;

type StrategyFilterType = keyof typeof STRATEGY_CONFIG;

/**
 * 买入信号页面
 * 展示买入时机量化分析结果
 */
const BuySignalPage: React.FC = () => {
  const [signals, setSignals] = useState<BuySignal[]>([]);
  const [stats, setStats] = useState<BuySignalStats | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(() => dayjs().format('YYYYMMDD'));
  const [filterSignal, setFilterSignal] = useState<string>('all');
  const [filterStrategy, setFilterStrategy] = useState<StrategyFilterType>('all');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // 批量生成相关状态
  const [showBatchDialog, setShowBatchDialog] = useState(false);
  const [batchStartDate, setBatchStartDate] = useState<string>('');
  const [batchEndDate, setBatchEndDate] = useState<string>('');
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [batchProgress, setBatchProgress] = useState<string>('');
  const [availableDates, setAvailableDates] = useState<{ date: string; hasSignal: boolean; surgeCount: number }[]>([]);

  // 获取信号列表
  const fetchSignals = async (date?: string) => {
    setLoading(true);
    setError(null);
    try {
      const [listRes, statsRes] = await Promise.all([
        buySignalApi.getList(date),
        buySignalApi.getStats(date),
      ]);
      
      if (listRes.success) {
        setSignals(listRes.data);
      }
      if (statsRes.success) {
        setStats(statsRes.data);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // 生成买入信号
  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const response = await buySignalApi.generate(selectedDate);
      if (response.success) {
        alert(`成功生成 ${response.data.count} 条买入信号`);
        fetchSignals(selectedDate);
      }
    } catch (err) {
      alert('生成失败: ' + (err as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  // 打开批量生成对话框
  const handleOpenBatchDialog = async () => {
    setShowBatchDialog(true);
    setBatchProgress('');
    try {
      const response = await buySignalApi.getAvailableDates();
      if (response.success) {
        setAvailableDates(response.data);
        // 默认选择没有信号的日期范围
        const noDates = response.data.filter(d => !d.hasSignal);
        if (noDates.length > 0) {
          setBatchEndDate(noDates[0].date.replace(/-/g, ''));
          setBatchStartDate(noDates[noDates.length - 1].date.replace(/-/g, ''));
        }
      }
    } catch (err) {
      console.error('获取可用日期失败:', err);
    }
  };

  // 批量生成买入信号
  const handleBatchGenerate = async () => {
    if (!batchStartDate || !batchEndDate) {
      alert('请选择日期范围');
      return;
    }
    
    setBatchGenerating(true);
    setBatchProgress('正在批量生成中，请稍候...');
    
    try {
      const response = await buySignalApi.batchGenerate(batchStartDate, batchEndDate);
      if (response.success) {
        const { successDays, failedDays, totalGenerated } = response.data;
        setBatchProgress(`完成! ${successDays}天成功, ${failedDays}天失败, 共生成${totalGenerated}条信号`);
        alert(response.message);
        setShowBatchDialog(false);
        fetchSignals(selectedDate);
      }
    } catch (err) {
      setBatchProgress('生成失败: ' + (err as Error).message);
      alert('批量生成失败: ' + (err as Error).message);
    } finally {
      setBatchGenerating(false);
    }
  };

  useEffect(() => {
    fetchSignals(selectedDate);
  }, [selectedDate]);

  // 过滤信号（支持信号类型和策略类型双重筛选）
  const filteredSignals = signals.filter(s => {
    // 信号类型筛选
    if (filterSignal !== 'all' && s.buySignal !== filterSignal) return false;
    // 策略类型筛选
    if (filterStrategy !== 'all' && s.strategyType !== filterStrategy) return false;
    return true;
  });

  // 获取信号标签样式
  const getSignalBadge = (signal: string) => {
    switch (signal) {
      case 'strong_buy':
        return { text: '强烈买入', bg: 'bg-red-100', color: 'text-red-700', icon: '🔥' };
      case 'buy':
        return { text: '建议买入', bg: 'bg-green-100', color: 'text-green-700', icon: '✅' };
      case 'hold':
        return { text: '观望', bg: 'bg-yellow-100', color: 'text-yellow-700', icon: '⏸️' };
      case 'pass':
        return { text: '放弃', bg: 'bg-gray-100', color: 'text-gray-700', icon: '❌' };
      default:
        return { text: signal, bg: 'bg-gray-100', color: 'text-gray-700', icon: '' };
    }
  };

  // 跳转到同花顺个股页面
  const goToDetail = (stockCode: string) => {
    const url = `https://stockpage.10jqka.com.cn/${stockCode}/`;
    window.open(url, '_blank');
  };

  return (
    <Layout>
      <div className="space-y-4">
        {/* 页面标题 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">买入信号</h1>
            <p className="text-sm text-gray-500 mt-1">
              T+1日开盘买入时机量化分析 | 7维度评分系统
            </p>
          </div>
          <div className="flex items-center gap-3">
            <DatePicker
              value={selectedDate}
              onChange={setSelectedDate}
              placeholder="选择日期"
            />
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {generating && (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              )}
              {generating ? '生成中...' : '生成信号'}
            </button>
            <button
              onClick={handleOpenBatchDialog}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-2"
            >
              📅 批量补录
            </button>
          </div>
        </div>

        {/* 批量生成对话框 */}
        {showBatchDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">📅 批量补录买入信号</h2>
                <button
                  onClick={() => setShowBatchDialog(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ✕
                </button>
              </div>
              
              <div className="space-y-4">
                {/* 日期范围选择 */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">开始日期</label>
                    <input
                      type="date"
                      value={batchStartDate ? `${batchStartDate.slice(0,4)}-${batchStartDate.slice(4,6)}-${batchStartDate.slice(6,8)}` : ''}
                      onChange={(e) => setBatchStartDate(e.target.value.replace(/-/g, ''))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">结束日期</label>
                    <input
                      type="date"
                      value={batchEndDate ? `${batchEndDate.slice(0,4)}-${batchEndDate.slice(4,6)}-${batchEndDate.slice(6,8)}` : ''}
                      onChange={(e) => setBatchEndDate(e.target.value.replace(/-/g, ''))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    />
                  </div>
                </div>

                {/* 可用日期列表 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">可用日期（有强势资金突破数据）</label>
                  <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">日期</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">候选数</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">状态</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {availableDates.slice(0, 30).map((item) => (
                          <tr key={item.date} className={item.hasSignal ? 'bg-green-50' : 'bg-yellow-50'}>
                            <td className="px-4 py-2 text-sm text-gray-900">{item.date}</td>
                            <td className="px-4 py-2 text-sm text-gray-600">{item.surgeCount} 条</td>
                            <td className="px-4 py-2">
                              {item.hasSignal ? (
                                <span className="text-xs text-green-600 font-medium">✅ 已生成</span>
                              ) : (
                                <span className="text-xs text-yellow-600 font-medium">⏳ 待生成</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    显示最近30个日期，黄色表示待生成，绿色表示已生成
                  </p>
                </div>

                {/* 进度提示 */}
                {batchProgress && (
                  <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
                    {batchProgress}
                  </div>
                )}

                {/* 操作按钮 */}
                <div className="flex justify-end gap-3 pt-4 border-t">
                  <button
                    onClick={() => setShowBatchDialog(false)}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleBatchGenerate}
                    disabled={batchGenerating || !batchStartDate || !batchEndDate}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {batchGenerating && (
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    )}
                    {batchGenerating ? '生成中...' : '开始批量生成'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 统计卡片 */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="bg-white rounded-lg shadow p-4 text-center">
              <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
              <div className="text-sm text-gray-500">总信号数</div>
            </div>
            <div className="bg-red-50 rounded-lg shadow p-4 text-center">
              <div className="text-2xl font-bold text-red-600">{stats.strongBuy}</div>
              <div className="text-sm text-red-700">🔥 强烈买入</div>
            </div>
            <div className="bg-green-50 rounded-lg shadow p-4 text-center">
              <div className="text-2xl font-bold text-green-600">{stats.buy}</div>
              <div className="text-sm text-green-700">✅ 建议买入</div>
            </div>
            <div className="bg-yellow-50 rounded-lg shadow p-4 text-center">
              <div className="text-2xl font-bold text-yellow-600">{stats.hold}</div>
              <div className="text-sm text-yellow-700">⏸️ 观望</div>
            </div>
            <div className="bg-gray-50 rounded-lg shadow p-4 text-center">
              <div className="text-2xl font-bold text-gray-600">{stats.pass}</div>
              <div className="text-sm text-gray-700">❌ 放弃</div>
            </div>
            <div className="bg-blue-50 rounded-lg shadow p-4 text-center">
              <div className="text-2xl font-bold text-blue-600">{stats.avgScore.toFixed(1)}</div>
              <div className="text-sm text-blue-700">平均得分</div>
            </div>
          </div>
        )}

        {/* 筛选按钮 */}
        <div className="space-y-3">
          {/* 策略类型筛选 */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-gray-500 font-medium">策略:</span>
            {(Object.entries(STRATEGY_CONFIG) as [StrategyFilterType, typeof STRATEGY_CONFIG[StrategyFilterType]][]).map(([key, config]) => (
              <button
                key={key}
                onClick={() => setFilterStrategy(key)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition flex items-center gap-1 ${
                  filterStrategy === key
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <span>{config.icon}</span>
                <span>{config.label}</span>
              </button>
            ))}
          </div>
          
          {/* 信号类型筛选 */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-gray-500 font-medium">信号:</span>
            {[
              { value: 'all', label: '全部' },
              { value: 'strong_buy', label: '🔥 强烈买入' },
              { value: 'buy', label: '✅ 建议买入' },
              { value: 'hold', label: '⏸️ 观望' },
              { value: 'pass', label: '❌ 放弃' },
            ].map(item => (
              <button
                key={item.value}
                onClick={() => setFilterSignal(item.value)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
                  filterSignal === item.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* 信号列表 */}
        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorMessage message={error} />
        ) : filteredSignals.length === 0 ? (
          <Empty message="暂无买入信号，请先生成信号" />
        ) : (
          <div className="space-y-4">
            {filteredSignals.map((signal) => {
              const badge = getSignalBadge(signal.buySignal);
              return (
                <div
                  key={`${signal.stockCode}-${signal.date}`}
                  className="bg-white rounded-lg shadow overflow-hidden hover:shadow-md transition cursor-pointer"
                  onClick={() => goToDetail(signal.stockCode)}
                >
                  {/* 头部 */}
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-1 rounded text-sm font-bold ${badge.bg} ${badge.color}`}>
                        {badge.icon} {badge.text}
                      </span>
                      {/* 策略类型标签 */}
                      {signal.strategyType && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          signal.strategyType === 'volume_surge' ? 'bg-blue-100 text-blue-700' :
                          signal.strategyType === 'breakthrough' ? 'bg-purple-100 text-purple-700' :
                          signal.strategyType === 'limit_up' ? 'bg-red-100 text-red-700' :
                          'bg-green-100 text-green-700'
                        }`}>
                          {STRATEGY_CONFIG[signal.strategyType as StrategyFilterType]?.icon}{' '}
                          {signal.strategyName || STRATEGY_CONFIG[signal.strategyType as StrategyFilterType]?.label}
                        </span>
                      )}
                      <span className="font-medium text-gray-900">{signal.stockName}</span>
                      <span className="text-sm text-gray-500">{signal.stockCode}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-2xl font-bold text-blue-600">{signal.totalBuyScore}</div>
                        <div className="text-xs text-gray-500">总分</div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-medium text-gray-900">{signal.suggestedPosition}%</div>
                        <div className="text-xs text-gray-500">建议仓位</div>
                      </div>
                    </div>
                  </div>

                  {/* 评分详情 */}
                  <div className="px-4 py-3 grid grid-cols-7 gap-2">
                    {[
                      { label: '开盘强度', score: signal.openStrengthScore, max: 30 },
                      { label: '量能确认', score: signal.volumeConfirmScore, max: 15 },
                      { label: '竞价抢筹', score: signal.auctionScore, max: 15 },
                      { label: '大盘环境', score: signal.marketEnvScore, max: 10 },
                      { label: '板块联动', score: signal.sectorLinkScore, max: 10 },
                      { label: '承接力度', score: signal.sealStrengthScore, max: 10 },
                      { label: '技术位置', score: signal.technicalScore, max: 10 },
                    ].map(item => (
                      <div key={item.label} className="text-center">
                        <div className="text-xs text-gray-500 mb-1">{item.label}</div>
                        <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              item.score / item.max >= 0.8 ? 'bg-green-500' :
                              item.score / item.max >= 0.5 ? 'bg-yellow-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${(item.score / item.max) * 100}%` }}
                          />
                        </div>
                        <div className="text-xs font-medium text-gray-700 mt-1">
                          {item.score}/{item.max}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* 关键指标 */}
                  <div className="px-4 py-3 bg-gray-50 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">开盘涨幅：</span>
                      <span className={`font-medium ${signal.openChangePercent >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {signal.openChangePercent >= 0 ? '+' : ''}{signal.openChangePercent.toFixed(2)}%
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">开盘量比：</span>
                      <span className="font-medium text-gray-900">{signal.openVolumeRatio.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">建议买入价：</span>
                      <span className="font-medium text-gray-900">¥{signal.suggestedPrice.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">止损价：</span>
                      <span className="font-medium text-red-600">¥{signal.stopLossPrice.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">止盈价：</span>
                      <span className="font-medium text-green-600">¥{signal.takeProfitPrice.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">板块：</span>
                      <span className="font-medium text-gray-900">{signal.sectorName || '-'}</span>
                    </div>
                  </div>

                  {/* 风险提示 */}
                  {signal.riskWarning && signal.riskWarning.length > 0 && (
                    <div className="px-4 py-2 bg-yellow-50 border-t border-yellow-100">
                      <div className="flex items-start gap-2">
                        <span className="text-yellow-600">⚠️</span>
                        <div className="text-sm text-yellow-800">
                          {signal.riskWarning.map((warning, index) => (
                            <span key={index}>
                              {warning.replace('⚠️ ', '')}
                              {index < signal.riskWarning.length - 1 && '；'}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 买入理由 */}
                  {signal.buyReason && (
                    <div className="px-4 py-2 bg-blue-50 border-t border-blue-100">
                      <div className="text-sm text-blue-800">
                        <span className="font-medium">💡 买入理由：</span>
                        {signal.buyReason}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default BuySignalPage;
