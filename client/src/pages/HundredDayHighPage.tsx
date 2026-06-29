import React, { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Layout, Loading, ErrorMessage, Empty, DatePicker, BackfillDialog } from '../components';
import { MarketSentimentCard } from '../components/common/MarketSentimentCard';
import { hundredDayHighApi } from '../services/api';
import type {
  HundredDayHigh,
  HundredDayHighStats,
  HundredDayHighBacktestConfig,
  HundredDayHighBacktestResult,
} from '../types';

type TabType = 'scan' | 'signal' | 'backtest';

const HundredDayHighPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('scan');

  const [selectedDate, setSelectedDate] = useState<string>(() => dayjs().format('YYYYMMDD'));
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [list, setList] = useState<HundredDayHigh[]>([]);
  const [stats, setStats] = useState<HundredDayHighStats | null>(null);

  const [showBackfillDialog, setShowBackfillDialog] = useState(false);

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const defaultStartDate = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
  const endDateObj = new Date(now);
  endDateObj.setDate(endDateObj.getDate() - 3);
  const defaultEndDate = endDateObj.toISOString().split('T')[0];

  const [backtestStartDate, setBacktestStartDate] = useState(defaultStartDate);
  const [backtestEndDate, setBacktestEndDate] = useState(defaultEndDate);
  const [backtesting, setBacktesting] = useState(false);
  const [showTrades, setShowTrades] = useState(false);

  const [backtestConfig, setBacktestConfig] = useState<HundredDayHighBacktestConfig>({
    signalFilter: 'high_score',
    minScore: 70,
    basePosition: 50000,
    lowRiskPositionFactor: 1.2,
    mediumRiskPositionFactor: 1,
    highRiskPositionFactor: 0.7,
    stopLossPercent: 0.05,
    takeProfitPercent: 0.15,
    maxHoldDays: 3,
    maxTradesPerDay: 3,
  });
  const [backtestResult, setBacktestResult] = useState<HundredDayHighBacktestResult | null>(null);

  const fetchDates = async () => {
    try {
      const response = await hundredDayHighApi.getDates();
      if (response.success) {
        setAvailableDates(response.data);
        if (response.data.length > 0 && !selectedDate) {
          setSelectedDate(response.data[0].replace(/-/g, ''));
        }
      }
    } catch (err) {
      console.error('获取日期列表失败:', err);
    }
  };

  const fetchList = async (date?: string) => {
    setLoading(true);
    setError(null);
    try {
      const [listRes, statsRes] = await Promise.all([
        hundredDayHighApi.getList(date),
        hundredDayHighApi.getStats(date),
      ]);

      if (listRes.success) {
        setList(listRes.data);
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

  const handleScan = async () => {
    setScanning(true);
    setError(null);
    try {
      const response = await hundredDayHighApi.scan(selectedDate);
      if (response.success) {
        const count = response.data.count || 0;
        alert(`扫描完成，发现 ${count} 只百日新高股票`);
        await Promise.all([fetchList(selectedDate), fetchDates()]);
      }
    } catch (err) {
      setError('扫描失败: ' + (err as Error).message);
    } finally {
      setScanning(false);
    }
  };

  const handleBacktest = async () => {
    setBacktesting(true);
    setError(null);
    setBacktestResult(null);

    try {
      const response = await hundredDayHighApi.backtest(
        backtestStartDate.replace(/-/g, ''),
        backtestEndDate.replace(/-/g, ''),
        backtestConfig
      );

      if (response.success) {
        setBacktestResult(response.data);
      } else {
        setError(response.message || '回测失败');
      }
    } catch (err) {
      setError('回测失败: ' + (err as Error).message);
    } finally {
      setBacktesting(false);
    }
  };

  useEffect(() => {
    fetchDates();
  }, []);

  useEffect(() => {
    if (activeTab === 'scan' && selectedDate) {
      fetchList(selectedDate);
    }
  }, [activeTab, selectedDate]);

  const formatTurnover = (value: number) => {
    if (!value) return '-';
    if (value >= 100000000) return `${(value / 100000000).toFixed(2)}亿`;
    if (value >= 10000) return `${(value / 10000).toFixed(2)}万`;
    return value.toFixed(2);
  };

  const formatExitReason = (reason: string) => {
    const map: Record<string, string> = {
      stop_loss: '止损',
      take_profit: '止盈',
      max_days: '持仓到期',
      data_end: '数据截止',
    };
    return map[reason] || reason;
  };

  const goToDetail = (stockCode: string) => {
    window.open(`https://www.iwencai.com/unifiedwap/result?querytype=stock&w=${stockCode}`, '_blank');
  };

  const getBacktestStockLink = (stockCode: string) => {
    return `https://www.iwencai.com/screener/result?w=${encodeURIComponent(stockCode)}&querytype=stock&sign=${Date.now()}`;
  };

  const sortedList = useMemo(
    () => [...list].sort((a, b) => (b.strategyScore || 0) - (a.strategyScore || 0)),
    [list]
  );

  return (
    <Layout>
      <div className="space-y-3 sm:space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">📈 百日新高</h1>
            <p className="text-xs sm:text-sm text-gray-500 mt-1 hidden sm:block">
              涨幅突破 + 百日新高 + 量价趋势评分
            </p>
          </div>

          <button
            onClick={() => setShowBackfillDialog(true)}
            className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            补录历史
          </button>
        </div>

        <div className="bg-white rounded-lg shadow">
          <div className="border-b border-gray-200 overflow-x-auto">
            <nav className="flex -mb-px min-w-max">
              <button
                onClick={() => setActiveTab('scan')}
                className={`px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium border-b-2 transition whitespace-nowrap ${
                  activeTab === 'scan'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                📊 扫描候选
              </button>
              <button
                onClick={() => setActiveTab('signal')}
                className={`px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium border-b-2 transition whitespace-nowrap ${
                  activeTab === 'signal'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                🔥 生成信号
              </button>
              <button
                onClick={() => setActiveTab('backtest')}
                className={`px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium border-b-2 transition whitespace-nowrap ${
                  activeTab === 'backtest'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                📈 历史回测
              </button>
            </nav>
          </div>

          <MarketSentimentCard
            dateStr={selectedDate}
            title="当前市场情绪"
            showRecentAverage={true}
            recentDays={5}
            className="rounded-none sm:rounded-xl"
          />

          <div className="p-3 sm:p-6">
            {activeTab === 'scan' && (
              <div className="space-y-6">
                <div className="flex items-center gap-4 flex-wrap">
                  <DatePicker
                    value={selectedDate}
                    onChange={setSelectedDate}
                    availableDates={availableDates}
                    placeholder="选择日期"
                  />

                  <button
                    onClick={handleScan}
                    disabled={scanning}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    {scanning && (
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    )}
                    {scanning ? '扫描中...' : '开始扫描'}
                  </button>
                </div>

                {stats && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg p-4">
                      <div className="text-3xl font-bold text-blue-600">{stats.total}</div>
                      <div className="text-sm text-gray-600">候选数量</div>
                    </div>
                    <div className="bg-gradient-to-r from-green-50 to-green-100 rounded-lg p-4">
                      <div className="text-3xl font-bold text-green-600">{stats.highQualityCount}</div>
                      <div className="text-sm text-gray-600">高质量(≥70)</div>
                    </div>
                    <div className="bg-gradient-to-r from-orange-50 to-orange-100 rounded-lg p-4">
                      <div className="text-3xl font-bold text-orange-600">{stats.firstBoardCount}</div>
                      <div className="text-sm text-gray-600">首板数量</div>
                    </div>
                    <div className="bg-gradient-to-r from-purple-50 to-purple-100 rounded-lg p-4">
                      <div className="text-3xl font-bold text-purple-600">{stats.avgScore?.toFixed(1) || '-'}</div>
                      <div className="text-sm text-gray-600">平均评分</div>
                    </div>
                  </div>
                )}

                {loading ? (
                  <Loading />
                ) : error ? (
                  <ErrorMessage message={error} />
                ) : sortedList.length === 0 ? (
                  <Empty message="暂无百日新高股票数据，请先执行扫描" />
                ) : (
                  <div className="bg-white rounded-lg shadow overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">序号</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">代码</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">名称</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">涨幅</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">成交额</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">量比</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">策略分</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">风险</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">行业/概念</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {sortedList.map((stock, index) => (
                          <tr
                            key={`${stock.date}-${stock.stockCode}`}
                            onClick={() => goToDetail(stock.stockCode)}
                            className="hover:bg-gray-50 cursor-pointer"
                          >
                            <td className="px-4 py-3 text-sm text-gray-500">{index + 1}</td>
                            <td className="px-4 py-3 text-sm font-medium text-blue-600">{stock.stockCode}</td>
                            <td className="px-4 py-3 text-sm text-gray-900">{stock.stockName}</td>
                            <td className="px-4 py-3 text-sm text-right">
                              <span className={stock.changePercent >= 0 ? 'text-red-600' : 'text-green-600'}>
                                {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent?.toFixed(2)}%
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-gray-600">{formatTurnover(stock.turnover)}</td>
                            <td className="px-4 py-3 text-sm text-right text-gray-600">{stock.volumeRatio?.toFixed(2)}x</td>
                            <td className="px-4 py-3 text-sm text-center text-gray-700">{stock.strategyScore?.toFixed(0) || '-'}</td>
                            <td className="px-4 py-3 text-sm text-center">
                              <span
                                className={`px-2 py-1 rounded text-xs ${
                                  stock.riskLevel === 'low'
                                    ? 'bg-green-100 text-green-800'
                                    : stock.riskLevel === 'medium'
                                      ? 'bg-yellow-100 text-yellow-800'
                                      : 'bg-red-100 text-red-800'
                                }`}
                              >
                                {stock.riskLevel === 'low' ? '低' : stock.riskLevel === 'medium' ? '中' : '高'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600 max-w-[240px] truncate">
                              {stock.industry || '-'} / {stock.concept || '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'signal' && (
              <div className="space-y-6">
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <h3 className="text-base font-semibold text-amber-800">信号生成功能预留</h3>
                  <p className="text-sm text-amber-700 mt-2">
                    按你的要求，“生成信号”服务暂未实现。当前仅保留 Tab 入口，后续可接入专用接口：
                    <span className="font-medium">生成信号、查看信号列表、信号统计、批量补录</span>。
                  </p>
                </div>

                <div className="bg-white border rounded-lg p-6">
                  <h4 className="font-medium text-gray-900 mb-3">建议后续补齐的接口</h4>
                  <ul className="list-disc pl-5 text-sm text-gray-600 space-y-1">
                    <li>POST /api/hundred-day-high/signal/generate</li>
                    <li>GET /api/hundred-day-high/signal/list</li>
                    <li>GET /api/hundred-day-high/signal/stats</li>
                    <li>POST /api/hundred-day-high/signal/batch-generate</li>
                  </ul>
                </div>
              </div>
            )}

            {activeTab === 'backtest' && (
              <div className="space-y-6">
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-4">回测参数配置</h3>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">开始日期</label>
                      <input
                        type="date"
                        value={backtestStartDate}
                        onChange={(e) => setBacktestStartDate(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">结束日期</label>
                      <input
                        type="date"
                        value={backtestEndDate}
                        onChange={(e) => setBacktestEndDate(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">信号筛选</label>
                      <select
                        value={backtestConfig.signalFilter}
                        onChange={(e) => setBacktestConfig({
                          ...backtestConfig,
                          signalFilter: e.target.value as HundredDayHighBacktestConfig['signalFilter'],
                        })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="high_score">高评分</option>
                        <option value="first_board">仅首板</option>
                        <option value="low_risk">仅低风险</option>
                        <option value="all">全部</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">最低评分</label>
                      <input
                        type="number"
                        value={backtestConfig.minScore}
                        onChange={(e) => setBacktestConfig({ ...backtestConfig, minScore: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">标准仓位(元)</label>
                      <input
                        type="number"
                        value={backtestConfig.basePosition}
                        onChange={(e) => setBacktestConfig({ ...backtestConfig, basePosition: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">低风险系数</label>
                      <input
                        type="number"
                        step="0.01"
                        value={backtestConfig.lowRiskPositionFactor}
                        onChange={(e) => setBacktestConfig({ ...backtestConfig, lowRiskPositionFactor: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">中风险系数</label>
                      <input
                        type="number"
                        step="0.01"
                        value={backtestConfig.mediumRiskPositionFactor}
                        onChange={(e) => setBacktestConfig({ ...backtestConfig, mediumRiskPositionFactor: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">高风险系数</label>
                      <input
                        type="number"
                        step="0.01"
                        value={backtestConfig.highRiskPositionFactor}
                        onChange={(e) => setBacktestConfig({ ...backtestConfig, highRiskPositionFactor: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">止损(%)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={backtestConfig.stopLossPercent * 100}
                        onChange={(e) => setBacktestConfig({ ...backtestConfig, stopLossPercent: Number(e.target.value) / 100 })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">止盈(%)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={backtestConfig.takeProfitPercent * 100}
                        onChange={(e) => setBacktestConfig({ ...backtestConfig, takeProfitPercent: Number(e.target.value) / 100 })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">最大持仓天数</label>
                      <input
                        type="number"
                        value={backtestConfig.maxHoldDays}
                        onChange={(e) => setBacktestConfig({ ...backtestConfig, maxHoldDays: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">单日最多交易</label>
                      <input
                        type="number"
                        value={backtestConfig.maxTradesPerDay}
                        onChange={(e) => setBacktestConfig({ ...backtestConfig, maxTradesPerDay: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-center">
                  <button
                    onClick={handleBacktest}
                    disabled={backtesting}
                    className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 text-lg"
                  >
                    {backtesting && (
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    )}
                    {backtesting ? '回测中...' : '🚀 开始回测'}
                  </button>
                </div>

                {error && <ErrorMessage message={error} />}

                {backtestResult && (
                  <div className="space-y-6">
                    <div className="bg-white rounded-lg shadow p-6">
                      <h3 className="text-lg font-semibold mb-4">📊 回测结果 - 百日新高策略</h3>

                      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                        <div className="text-center p-4 bg-gray-50 rounded-lg">
                          <div className="text-2xl font-bold text-gray-900">{backtestResult.totalTrades}</div>
                          <div className="text-sm text-gray-500">总交易次数</div>
                        </div>
                        <div className="text-center p-4 bg-gray-50 rounded-lg">
                          <div className={`text-2xl font-bold ${backtestResult.winRate >= 50 ? 'text-red-600' : 'text-green-600'}`}>
                            {backtestResult.winRate}%
                          </div>
                          <div className="text-sm text-gray-500">胜率</div>
                        </div>
                        <div className="text-center p-4 bg-gray-50 rounded-lg">
                          <div className={`text-2xl font-bold ${backtestResult.totalProfitAmount >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {backtestResult.totalProfitAmount >= 0 ? '+' : ''}{backtestResult.totalProfitAmount.toLocaleString()}元
                          </div>
                          <div className="text-sm text-gray-500">总收益</div>
                        </div>
                        <div className="text-center p-4 bg-gray-50 rounded-lg">
                          <div className={`text-2xl font-bold ${backtestResult.avgProfitPercent >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {backtestResult.avgProfitPercent >= 0 ? '+' : ''}{backtestResult.avgProfitPercent}%
                          </div>
                          <div className="text-sm text-gray-500">平均收益率</div>
                        </div>
                        <div className="text-center p-4 bg-gray-50 rounded-lg">
                          <div className="text-2xl font-bold text-gray-900">{backtestResult.profitLossRatio}</div>
                          <div className="text-sm text-gray-500">盈亏比</div>
                        </div>
                        <div className="text-center p-4 bg-gray-50 rounded-lg">
                          <div className="text-2xl font-bold text-orange-600">-{backtestResult.maxDrawdownPercent}%</div>
                          <div className="text-sm text-gray-500">最大回撤</div>
                        </div>
                      </div>

                      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-500">盈利次数:</span>
                          <span className="font-medium text-red-600">{backtestResult.winTrades}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">亏损次数:</span>
                          <span className="font-medium text-green-600">{backtestResult.lossTrades}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">平均盈利:</span>
                          <span className="font-medium text-red-600">+{backtestResult.avgWinPercent}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">平均亏损:</span>
                          <span className="font-medium text-green-600">{backtestResult.avgLossPercent}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">总投入资金:</span>
                          <span className="font-medium">{backtestResult.totalInvested.toLocaleString()}元</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">最大单笔仓位:</span>
                          <span className="font-medium">{backtestResult.maxPosition.toLocaleString()}元</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">平均持仓:</span>
                          <span className="font-medium">{backtestResult.avgHoldDays}天</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">最大连胜:</span>
                          <span className="font-medium">{backtestResult.maxConsecutiveWins}次</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">最大连亏:</span>
                          <span className="font-medium">{backtestResult.maxConsecutiveLosses}次</span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white rounded-lg shadow overflow-hidden">
                      <div className="p-4 border-b flex items-center justify-between">
                        <h3 className="text-lg font-semibold">交易明细</h3>
                        <button
                          onClick={() => setShowTrades(!showTrades)}
                          className="text-sm text-blue-600 hover:text-blue-800"
                        >
                          {showTrades ? '收起' : `展开 (${backtestResult.trades?.length || 0} 笔)`}
                        </button>
                      </div>

                      {showTrades && backtestResult.trades && (
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">代码</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">名称</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">量比</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">策略分</th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">买入日</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">买入价</th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">卖出日</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">卖出价</th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">风险</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">风险系数</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">投入仓位</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">收益率</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">收益额</th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">退出原因</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {backtestResult.trades.map((trade, index) => (
                                <tr key={`${trade.stockCode}-${trade.buyDate}-${index}`} className="hover:bg-gray-50">
                                  <td className="px-4 py-3 text-sm font-medium text-blue-600">
                                    <a
                                      href={getBacktestStockLink(trade.stockCode)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="hover:underline"
                                    >
                                      {trade.stockCode}
                                    </a>
                                  </td>
                                  <td className="px-4 py-3 text-sm text-gray-900">{trade.stockName}</td>
                                  <td className="px-4 py-3 text-sm text-right text-gray-700">
                                    {trade.volumeRatio > 0 ? `${trade.volumeRatio.toFixed(2)}x` : '-'}
                                  </td>
                                  <td className="px-4 py-3 text-sm text-right text-gray-700">
                                    {(trade.strategyScore ?? trade.score ?? 0).toFixed(0)}
                                  </td>
                                  <td className="px-4 py-3 text-sm text-center text-gray-600">{trade.buyDate}</td>
                                  <td className="px-4 py-3 text-sm text-right text-gray-900">{trade.buyPrice.toFixed(2)}</td>
                                  <td className="px-4 py-3 text-sm text-center text-gray-600">{trade.exitDate}</td>
                                  <td className="px-4 py-3 text-sm text-right text-gray-900">{trade.exitPrice.toFixed(2)}</td>
                                  <td className="px-4 py-3 text-sm text-center">
                                    <span
                                      className={`px-2 py-1 rounded text-xs ${
                                        trade.riskLevel === 'low'
                                          ? 'bg-green-100 text-green-800'
                                          : trade.riskLevel === 'medium'
                                            ? 'bg-yellow-100 text-yellow-800'
                                            : 'bg-red-100 text-red-800'
                                      }`}
                                    >
                                      {trade.riskLevel === 'low' ? '低' : trade.riskLevel === 'medium' ? '中' : '高'}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-sm text-right text-gray-700">{trade.riskFactor.toFixed(2)}x</td>
                                  <td className="px-4 py-3 text-sm text-right text-gray-700">{trade.position.toLocaleString()}</td>
                                  <td className="px-4 py-3 text-sm text-right">
                                    <span className={`font-medium ${trade.profitPercent >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                                      {trade.profitPercent >= 0 ? '+' : ''}{trade.profitPercent}%
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-sm text-right">
                                    <span className={`font-medium ${trade.profitAmount >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                                      {trade.profitAmount >= 0 ? '+' : ''}{trade.profitAmount.toLocaleString()}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-sm text-center">
                                    <span
                                      className={`px-2 py-1 rounded text-xs ${
                                        trade.exitReason === 'take_profit'
                                          ? 'bg-red-100 text-red-800'
                                          : trade.exitReason === 'stop_loss'
                                            ? 'bg-green-100 text-green-800'
                                            : 'bg-gray-100 text-gray-800'
                                      }`}
                                    >
                                      {formatExitReason(trade.exitReason)}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <BackfillDialog
          isOpen={showBackfillDialog}
          scanEndpoint="/api/hundred-day-high/scan"
          strategyName="百日新高"
          onClose={() => {
            setShowBackfillDialog(false);
            fetchDates();
          }}
        />
      </div>
    </Layout>
  );
};

export default HundredDayHighPage;
