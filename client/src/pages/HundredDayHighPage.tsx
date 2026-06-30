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
  HundredDayHighSignal,
  HundredDayHighSignalStats,
  HundredDayHighSignalDateItem,
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

  const [signalList, setSignalList] = useState<HundredDayHighSignal[]>([]);
  const [signalStats, setSignalStats] = useState<HundredDayHighSignalStats | null>(null);
  const [signalLoading, setSignalLoading] = useState(false);
  const [signalGenerating, setSignalGenerating] = useState(false);
  const [signalError, setSignalError] = useState<string | null>(null);
  const [signalMinScore, setSignalMinScore] = useState(40);
  const [showSignalBatchDialog, setShowSignalBatchDialog] = useState(false);
  const [signalBatchStartDate, setSignalBatchStartDate] = useState('');
  const [signalBatchEndDate, setSignalBatchEndDate] = useState('');
  const [signalBatchGenerating, setSignalBatchGenerating] = useState(false);
  const [signalBatchProgress, setSignalBatchProgress] = useState('');
  const [signalAvailableDates, setSignalAvailableDates] = useState<HundredDayHighSignalDateItem[]>([]);

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
    selectionScore: 40,
    totalBuyScore: 40,
    basePosition: 50000,
    lowRiskPositionFactor: 1.2,
    mediumRiskPositionFactor: 1,
    highRiskPositionFactor: 0.7,
    stopLossPercent: 0.08,
    takeProfitPercent: 0.5,
    maxHoldDays: 10,
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

  const fetchSignalData = async (date?: string) => {
    setSignalLoading(true);
    setSignalError(null);

    try {
      const [listRes, statsRes] = await Promise.all([
        hundredDayHighApi.getSignalList(date),
        hundredDayHighApi.getSignalStats(date),
      ]);

      if (listRes.success) {
        setSignalList(listRes.data);
      }
      if (statsRes.success) {
        setSignalStats(statsRes.data);
      }
    } catch (err) {
      setSignalError((err as Error).message);
    } finally {
      setSignalLoading(false);
    }
  };

  const handleGenerateSignal = async () => {
    setSignalGenerating(true);
    setSignalError(null);

    try {
      const response = await hundredDayHighApi.generateSignal(selectedDate, signalMinScore);
      if (response.success) {
        alert(`成功生成 ${response.data.count} 条百日新高买入信号`);
        await fetchSignalData(selectedDate);
      }
    } catch (err) {
      setSignalError('生成信号失败: ' + (err as Error).message);
    } finally {
      setSignalGenerating(false);
    }
  };

  const handleOpenSignalBatchDialog = async () => {
    setShowSignalBatchDialog(true);
    setSignalBatchProgress('');

    try {
      const response = await hundredDayHighApi.getSignalAvailableDates();
      if (response.success) {
        setSignalAvailableDates(response.data);
        const pendingDates = response.data.filter((item) => !item.hasSignal);
        const targetDates = pendingDates.length > 0 ? pendingDates : response.data;

        if (targetDates.length > 0) {
          setSignalBatchEndDate(targetDates[0].date.replace(/-/g, ''));
          setSignalBatchStartDate(targetDates[targetDates.length - 1].date.replace(/-/g, ''));
        }
      }
    } catch (err) {
      setSignalError('获取可用日期失败: ' + (err as Error).message);
    }
  };

  const handleBatchGenerateSignal = async () => {
    if (!signalBatchStartDate || !signalBatchEndDate) {
      alert('请选择日期范围');
      return;
    }

    setSignalBatchGenerating(true);
    setSignalBatchProgress('正在批量生成中，请稍候...');

    try {
      const response = await hundredDayHighApi.batchGenerateSignal(signalBatchStartDate, signalBatchEndDate, signalMinScore);
      if (response.success) {
        const { successDays, failedDays, totalGenerated } = response.data;
        setSignalBatchProgress(`完成! ${successDays}天成功, ${failedDays}天失败, 共生成${totalGenerated}条信号`);
        alert(response.message);
        setShowSignalBatchDialog(false);
        await fetchSignalData(selectedDate);
      }
    } catch (err) {
      const message = (err as Error).message;
      setSignalBatchProgress(`批量生成失败: ${message}`);
      setSignalError('批量生成失败: ' + message);
    } finally {
      setSignalBatchGenerating(false);
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

  useEffect(() => {
    if (activeTab === 'signal' && selectedDate) {
      fetchSignalData(selectedDate);
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

  const getSignalBadge = (signal: string) => {
    switch (signal) {
      case 'strong_buy':
        return { text: '强烈买入', bg: 'bg-red-100', color: 'text-red-700' };
      case 'buy':
        return { text: '建议买入', bg: 'bg-green-100', color: 'text-green-700' };
      case 'hold':
        return { text: '观望', bg: 'bg-yellow-100', color: 'text-yellow-700' };
      case 'pass':
        return { text: '放弃', bg: 'bg-gray-100', color: 'text-gray-700' };
      default:
        return { text: signal, bg: 'bg-gray-100', color: 'text-gray-700' };
    }
  };

  const formatDateForInput = (dateStr: string) => {
    if (!dateStr || dateStr.length !== 8) {
      return '';
    }
    return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
  };

  const sortedList = useMemo(
    () => [...list].sort((a, b) => (b.strategyScore || 0) - (a.strategyScore || 0)),
    [list]
  );

  const sortedSignalList = useMemo(
    () => [...signalList].sort((a, b) => (b.totalBuyScore || 0) - (a.totalBuyScore || 0)),
    [signalList]
  );

  const tabButtonClass = (tab: TabType) => (
    `px-3 sm:px-5 py-2.5 text-xs sm:text-sm font-medium rounded-lg transition whitespace-nowrap ${
      activeTab === tab
        ? 'bg-white text-gray-900 shadow-sm border border-gray-200'
        : 'text-gray-600 hover:text-gray-900'
    }`
  );

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-5">
        <div className="rounded-2xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 p-4 sm:p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
            <div>
              <p className="text-xs sm:text-sm font-medium text-blue-600">策略看板</p>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">百日新高</h1>
              <p className="text-xs sm:text-sm text-gray-500 mt-1 hidden sm:block">
              涨幅突破 + 百日新高 + 量价趋势评分
              </p>
            </div>

            <button
              onClick={() => setShowBackfillDialog(true)}
              className="px-4 py-2.5 text-gray-700 bg-white hover:bg-gray-100 border border-gray-200 rounded-lg transition flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              补录历史
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-3 sm:px-6 pt-3 sm:pt-4 border-b border-gray-100 overflow-x-auto">
            <nav className="flex min-w-max gap-2 rounded-xl bg-gray-100 p-1">
              <button
                onClick={() => setActiveTab('scan')}
                className={tabButtonClass('scan')}
              >
                📊 扫描候选
              </button>
              <button
                onClick={() => setActiveTab('signal')}
                className={tabButtonClass('signal')}
              >
                🔥 生成信号
              </button>
              <button
                onClick={() => setActiveTab('backtest')}
                className={tabButtonClass('backtest')}
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
            className="rounded-xl border border-gray-100"
          />

          <div className="p-4 sm:p-6">
            {activeTab === 'scan' && (
              <div className="space-y-6">
                <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-4">
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
                </div>

                {stats && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white border border-gray-200 rounded-xl p-4">
                      <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
                      <div className="text-sm text-gray-600">候选数量</div>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-xl p-4">
                      <div className="text-2xl font-bold text-emerald-600">{stats.highQualityCount}</div>
                      <div className="text-sm text-gray-600">高质量(≥70)</div>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-xl p-4">
                      <div className="text-2xl font-bold text-amber-600">{stats.firstBoardCount}</div>
                      <div className="text-sm text-gray-600">首板数量</div>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-xl p-4">
                      <div className="text-2xl font-bold text-indigo-600">{stats.avgScore?.toFixed(1) || '-'}</div>
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
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
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
                <div className="bg-gray-50/70 border border-gray-200 rounded-xl p-4">
                  <div className="flex flex-wrap items-end gap-4">
                    <DatePicker
                      value={selectedDate}
                      onChange={setSelectedDate}
                      placeholder="选择信号日期"
                    />

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">最低策略分</label>
                      <input
                        type="number"
                        value={signalMinScore}
                        onChange={(e) => setSignalMinScore(Number(e.target.value))}
                        className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <button
                      onClick={() => fetchSignalData(selectedDate)}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                    >
                      🔄 刷新
                    </button>

                    <button
                      onClick={handleGenerateSignal}
                      disabled={signalGenerating}
                      className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {signalGenerating && (
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                      )}
                      {signalGenerating ? '生成中...' : '生成信号'}
                    </button>

                    <button
                      onClick={handleOpenSignalBatchDialog}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2"
                    >
                      📅 批量生成
                    </button>
                  </div>
                </div>

                {showSignalBatchDialog && (
                  <div className="fixed inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center z-50 px-3">
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-2xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-bold text-gray-900">批量生成百日新高信号</h2>
                        <button
                          onClick={() => setShowSignalBatchDialog(false)}
                          className="text-gray-500 hover:text-gray-700"
                        >
                          ✕
                        </button>
                      </div>

                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">开始日期</label>
                            <input
                              type="date"
                              value={formatDateForInput(signalBatchStartDate)}
                              onChange={(e) => setSignalBatchStartDate(e.target.value.replace(/-/g, ''))}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">结束日期</label>
                            <input
                              type="date"
                              value={formatDateForInput(signalBatchEndDate)}
                              onChange={(e) => setSignalBatchEndDate(e.target.value.replace(/-/g, ''))}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">可用信号日期（根据前一交易日候选推导）</label>
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
                                {signalAvailableDates.slice(0, 30).map((item) => (
                                  <tr key={item.date} className={item.hasSignal ? 'bg-green-50' : 'bg-yellow-50'}>
                                    <td className="px-4 py-2 text-sm text-gray-900">{item.date}</td>
                                    <td className="px-4 py-2 text-sm text-gray-600">{item.candidateCount} 只</td>
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
                          <p className="text-xs text-gray-500 mt-1">显示最近30个日期，黄色表示待生成，绿色表示已生成</p>
                        </div>

                        {signalBatchProgress && (
                          <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
                            {signalBatchProgress}
                          </div>
                        )}

                        <div className="flex justify-end gap-3 pt-4 border-t">
                          <button
                            onClick={() => setShowSignalBatchDialog(false)}
                            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                          >
                            取消
                          </button>
                          <button
                            onClick={handleBatchGenerateSignal}
                            disabled={signalBatchGenerating || !signalBatchStartDate || !signalBatchEndDate}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                          >
                            {signalBatchGenerating && (
                              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                            )}
                            {signalBatchGenerating ? '生成中...' : '开始批量生成'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {signalStats && (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                      <div className="text-2xl font-bold text-gray-900">{signalStats.total}</div>
                      <div className="text-sm text-gray-500">总信号数</div>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                      <div className="text-2xl font-bold text-red-600">{signalStats.strongBuy}</div>
                      <div className="text-sm text-red-700">强烈买入</div>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                      <div className="text-2xl font-bold text-green-600">{signalStats.buy}</div>
                      <div className="text-sm text-green-700">建议买入</div>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                      <div className="text-2xl font-bold text-yellow-600">{signalStats.hold}</div>
                      <div className="text-sm text-yellow-700">观望</div>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                      <div className="text-2xl font-bold text-gray-600">{signalStats.pass}</div>
                      <div className="text-sm text-gray-700">放弃</div>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                      <div className="text-2xl font-bold text-blue-600">{signalStats.avgScore.toFixed(1)}</div>
                      <div className="text-sm text-blue-700">平均买入分</div>
                    </div>
                  </div>
                )}

                {signalLoading ? (
                  <Loading />
                ) : signalError ? (
                  <ErrorMessage message={signalError} />
                ) : sortedSignalList.length === 0 ? (
                  <Empty message="暂无百日新高买入信号，请先执行生成" />
                ) : (
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">序号</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">代码</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">名称</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">信号</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">买入分</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">策略分</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">开盘涨幅</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">开盘量比</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">建议仓位</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">建议价</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">止损价</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">止盈价</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">风险提示</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {sortedSignalList.map((signal, index) => {
                          const signalBadge = getSignalBadge(signal.buySignal);
                          return (
                            <tr key={`${signal.date}-${signal.stockCode}`} className="hover:bg-gray-50">
                              <td className="px-4 py-3 text-sm text-gray-500">{index + 1}</td>
                              <td className="px-4 py-3 text-sm font-medium text-blue-600">
                                <button
                                  onClick={() => goToDetail(signal.stockCode)}
                                  className="hover:underline"
                                >
                                  {signal.stockCode}
                                </button>
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-900">{signal.stockName}</td>
                              <td className="px-4 py-3 text-sm text-center">
                                <span className={`px-2 py-1 rounded text-xs ${signalBadge.bg} ${signalBadge.color}`}>
                                  {signalBadge.text}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-sm text-right text-gray-700">{signal.totalBuyScore?.toFixed(1)}</td>
                              <td className="px-4 py-3 text-sm text-right text-gray-700">{signal.selectionScore?.toFixed(1)}</td>
                              <td className="px-4 py-3 text-sm text-right text-gray-700">
                                {signal.openChangePercent >= 0 ? '+' : ''}{signal.openChangePercent?.toFixed(2)}%
                              </td>
                              <td className="px-4 py-3 text-sm text-right text-gray-700">{signal.openVolumeRatio?.toFixed(2)}</td>
                              <td className="px-4 py-3 text-sm text-right text-gray-700">{signal.suggestedPosition}%</td>
                              <td className="px-4 py-3 text-sm text-right text-gray-700">{signal.suggestedPrice?.toFixed(2)}</td>
                              <td className="px-4 py-3 text-sm text-right text-gray-700">{signal.stopLossPrice?.toFixed(2)}</td>
                              <td className="px-4 py-3 text-sm text-right text-gray-700">{signal.takeProfitPrice?.toFixed(2)}</td>
                              <td
                                className="px-4 py-3 text-sm text-gray-600 max-w-[320px] truncate"
                                title={signal.riskWarning?.join('；') || ''}
                              >
                                {signal.riskWarning?.[0] || '-'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'backtest' && (
              <div className="space-y-6">
                <div className="bg-gray-50/70 border border-gray-200 rounded-xl p-4 sm:p-5">
                  <h3 className="font-semibold text-gray-900 mb-4">回测参数配置</h3>
                  <p className="text-xs sm:text-sm text-gray-500 mb-4">建议先在小区间试跑，再扩大日期范围，提升回测体验与效率。</p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
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
                      <label className="block text-sm font-medium text-gray-700 mb-1">最低选股分</label>
                      <input
                        type="number"
                        value={backtestConfig.selectionScore}
                        onChange={(e) => setBacktestConfig({ ...backtestConfig, selectionScore: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">最低买入分</label>
                      <input
                        type="number"
                        value={backtestConfig.totalBuyScore}
                        onChange={(e) => setBacktestConfig({ ...backtestConfig, totalBuyScore: Number(e.target.value) })}
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
                    className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 text-base sm:text-lg"
                  >
                    {backtesting && (
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    )}
                    {backtesting ? '回测中...' : '开始回测'}
                  </button>
                </div>

                {error && <ErrorMessage message={error} />}

                {backtestResult && (
                  <div className="space-y-6">
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
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

                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
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
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">买入分</th>
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
                                    {typeof trade.totalBuyScore === 'number' ? trade.totalBuyScore.toFixed(1) : '-'}
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
