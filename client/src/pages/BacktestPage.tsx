import React, { useState, useEffect } from 'react';
import { Layout, Loading, ErrorMessage } from '../components';

// 策略类型
type StrategyMode = 'breakthrough_3day' | 'buy_signal';

// 回测配置接口（突破三天）
interface BacktestConfig {
  stopLossPercent: number;
  takeProfitPercent: number;
  maxHoldDays: number;
  useDay2LowAsStopLoss: boolean;
}

// 买入信号回测配置接口
interface BuySignalBacktestConfig {
  // 策略来源固定为 volume_surge，不再支持配置
  signalFilter: 'strong_buy' | 'buy' | 'all';
  minSignalScore: number;
  basePosition: number;
  lowMoodPositionRatio: number;
  marketMoodThreshold: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  maxHoldDays: number;
  marketPanicThreshold: number;
  maxBuyCount: number;
}

// 交易记录接口
interface TradeRecord {
  stockCode: string;
  stockName: string;
  entryDate: string;
  entryPrice: number;
  exitDate: string;
  exitPrice: number;
  holdDays: number;
  profitPercent: number;
  exitReason: 'stop_loss' | 'take_profit' | 'max_days' | 'data_end';
  day1Date: string;
  day2Date: string;
}

// 买入信号交易记录
interface BuySignalTradeRecord {
  stockCode: string;
  stockName: string;
  strategyType: string;
  strategyName: string;
  buyDate: string;
  buyPrice: number;
  sellDate: string;
  sellPrice: number;
  holdDays: number;
  position: number;
  profitPercent: number;
  profitAmount: number;
  exitReason: 'stop_loss' | 'take_profit' | 'max_days' | 'market_panic' | 'data_end';
  buySignalScore: number;
  marketMood: number;
}

// 回测结果接口
interface BacktestResult {
  startDate: string;
  endDate: string;
  config: BacktestConfig;
  totalTrades: number;
  winTrades: number;
  lossTrades: number;
  winRate: number;
  totalProfitPercent: number;
  avgProfitPercent: number;
  avgWinPercent: number;
  avgLossPercent: number;
  profitLossRatio: number;
  maxProfit: number;
  maxLoss: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  avgHoldDays: number;
  trades: TradeRecord[];
}

// 买入信号回测结果
interface BuySignalBacktestResult {
  startDate: string;
  endDate: string;
  config: BuySignalBacktestConfig;
  totalTrades: number;
  winTrades: number;
  lossTrades: number;
  winRate: number;
  totalProfitAmount: number;
  totalProfitPercent: number;
  avgProfitPercent: number;
  avgWinPercent: number;
  avgLossPercent: number;
  profitLossRatio: number;
  totalInvested: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  maxProfit: number;
  maxLoss: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  avgHoldDays: number;
  equityCurve: { date: string; equity: number }[];
  trades: BuySignalTradeRecord[];
}

// 缓存统计接口
interface CacheStats {
  memoryCount: number;
  fileCount: number;
  totalSize: string;
}

const API_BASE = '/api';

/**
 * 策略回测页面
 */
const BacktestPage: React.FC = () => {
  // 获取当月的默认日期范围
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-11
  
  // 开始日期：当月1号
  const defaultStartDate = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
  
  // 结束日期：T-3（今天往前3天）
  const endDateObj = new Date(now);
  endDateObj.setDate(endDateObj.getDate() - 3);
  const defaultEndDate = endDateObj.toISOString().split('T')[0];

  // 策略模式
  const [strategyMode, setStrategyMode] = useState<StrategyMode>('buy_signal');

  // 表单状态 - 日期格式 YYYY-MM-DD 用于日历控件
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  
  // 突破三天策略配置
  const [config, setConfig] = useState<BacktestConfig>({
    stopLossPercent: -5,
    takeProfitPercent: 10,
    maxHoldDays: 3,
    useDay2LowAsStopLoss: true,
  });

  // 强势资金突破策略配置
  const [buySignalConfig, setBuySignalConfig] = useState<BuySignalBacktestConfig>({
    // 策略来源固定为 volume_surge，不再支持前端配置
    signalFilter: 'strong_buy',
    minSignalScore: 70,
    basePosition: 50000,
    lowMoodPositionRatio: 0.5,
    marketMoodThreshold: 50,
    stopLossPercent: 0.05,
    takeProfitPercent: 0.20,
    maxHoldDays: 3,
    marketPanicThreshold: 40,
    maxBuyCount:4,
  });

  // 日期格式转换：YYYY-MM-DD -> YYYYMMDD
  const formatDateForApi = (dateStr: string): string => {
    return dateStr.replace(/-/g, '');
  };

  // 结果状态
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [buySignalResult, setBuySignalResult] = useState<BuySignalBacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 显示交易明细
  const [showTrades, setShowTrades] = useState(false);

  // 缓存状态
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [clearingCache, setClearingCache] = useState(false);

  // 获取缓存统计
  const fetchCacheStats = async () => {
    try {
      const response = await fetch(`${API_BASE}/backtest/cache/stats`);
      const data = await response.json();
      if (data.success) {
        setCacheStats(data.data);
      }
    } catch (err) {
      console.error('获取缓存统计失败:', err);
    }
  };

  // 页面加载时获取缓存统计
  useEffect(() => {
    fetchCacheStats();
  }, []);

  // 清除缓存
  const handleClearCache = async () => {
    if (!confirm('确定要清除所有K线缓存吗？')) return;
    
    setClearingCache(true);
    try {
      const response = await fetch(`${API_BASE}/backtest/cache`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (data.success) {
        alert(`已清除 ${data.data.clearedFiles} 个缓存文件`);
        fetchCacheStats();
      }
    } catch (err) {
      alert('清除缓存失败');
    } finally {
      setClearingCache(false);
    }
  };

  // 执行回测
  const handleRunBacktest = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setBuySignalResult(null);

    try {
      if (strategyMode === 'breakthrough_3day') {
        // 突破三天策略回测
        const response = await fetch(`${API_BASE}/backtest/run`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            startDate: formatDateForApi(startDate), 
            endDate: formatDateForApi(endDate), 
            config 
          }),
        });

        const data = await response.json();

        if (data.success) {
          setResult(data.data);
          fetchCacheStats();
        } else {
          setError(data.message || '回测失败');
        }
      } else {
        // 强势资金突破策略回测
        const response = await fetch(`${API_BASE}/backtest/buy-signal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            startDate: formatDateForApi(startDate), 
            endDate: formatDateForApi(endDate), 
            config: buySignalConfig 
          }),
        });

        const data = await response.json();

        if (data.success) {
          setBuySignalResult(data.data);
          fetchCacheStats();
        } else {
          setError(data.message || '回测失败');
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // 格式化退出原因
  const formatExitReason = (reason: string) => {
    const map: Record<string, string> = {
      stop_loss: '止损',
      take_profit: '止盈',
      max_days: '持仓到期',
      data_end: '数据截止',
      market_panic: '市场恐慌',
    };
    return map[reason] || reason;
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* 页面标题 */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">策略回测</h1>
          <p className="text-sm text-gray-500 mt-1">
            多策略历史回测分析
          </p>
        </div>

        {/* 策略选择 */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">选择回测策略</h2>
          <div className="flex gap-4">
            <button
              onClick={() => setStrategyMode('buy_signal')}
              className={`px-4 py-2 rounded-lg border-2 transition-all ${
                strategyMode === 'buy_signal'
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="font-medium">🔥 强势资金突破</div>
              <div className="text-xs text-gray-500 mt-1">强势资金突破 / 价格突破</div>
            </button>
            <button
              onClick={() => setStrategyMode('breakthrough_3day')}
              className={`px-4 py-2 rounded-lg border-2 transition-all ${
                strategyMode === 'breakthrough_3day'
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="font-medium">📈 突破三天确认</div>
              <div className="text-xs text-gray-500 mt-1">价格突破三天确认模式</div>
            </button>
          </div>
        </div>

        {/* 配置面板 */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">回测参数</h2>
          
          {/* 公共日期选择 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">开始日期</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                max={endDate}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">结束日期</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate}
                max={new Date().toISOString().split('T')[0]}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* 强势资金突破策略参数 */}
          {strategyMode === 'buy_signal' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">标准仓位 (元)</label>
                <input
                  type="number"
                  value={buySignalConfig.basePosition}
                  onChange={(e) => setBuySignalConfig({ ...buySignalConfig, basePosition: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">止损比例 (%)</label>
                <input
                  type="number"
                  step="0.01"
                  value={buySignalConfig.stopLossPercent * 100}
                  onChange={(e) => setBuySignalConfig({ ...buySignalConfig, stopLossPercent: Number(e.target.value) / 100 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">止盈比例 (%)</label>
                <input
                  type="number"
                  step="0.01"
                  value={buySignalConfig.takeProfitPercent * 100}
                  onChange={(e) => setBuySignalConfig({ ...buySignalConfig, takeProfitPercent: Number(e.target.value) / 100 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">最大持仓天数</label>
                <input
                  type="number"
                  value={buySignalConfig.maxHoldDays}
                  onChange={(e) => setBuySignalConfig({ ...buySignalConfig, maxHoldDays: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">情绪阈值 (降仓)</label>
                <input
                  type="number"
                  value={buySignalConfig.marketMoodThreshold}
                  onChange={(e) => setBuySignalConfig({ ...buySignalConfig, marketMoodThreshold: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">恐慌阈值 (清仓)</label>
                <input
                  type="number"
                  value={buySignalConfig.marketPanicThreshold}
                  onChange={(e) => setBuySignalConfig({ ...buySignalConfig, marketPanicThreshold: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">信号评分门槛</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={buySignalConfig.minSignalScore}
                  onChange={(e) => setBuySignalConfig({ ...buySignalConfig, minSignalScore: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">每日最多买入数量</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={buySignalConfig.maxBuyCount}
                  onChange={(e) => setBuySignalConfig({ ...buySignalConfig, maxBuyCount: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          {/* 突破三天策略参数 */}
          {strategyMode === 'breakthrough_3day' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">止损比例 (%)</label>
                <input
                  type="number"
                  value={config.stopLossPercent}
                  onChange={(e) => setConfig({ ...config, stopLossPercent: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">止盈比例 (%)</label>
                <input
                  type="number"
                  value={config.takeProfitPercent}
                  onChange={(e) => setConfig({ ...config, takeProfitPercent: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">最大持仓天数</label>
                <input
                  type="number"
                  value={config.maxHoldDays}
                  onChange={(e) => setConfig({ ...config, maxHoldDays: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="useDay2Low"
                  checked={config.useDay2LowAsStopLoss}
                  onChange={(e) => setConfig({ ...config, useDay2LowAsStopLoss: e.target.checked })}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="useDay2Low" className="ml-2 text-sm text-gray-700">
                  使用 Day2 最低价作为止损位
                </label>
              </div>
            </div>
          )}

          {/* 执行按钮和缓存管理 */}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
            <button
              onClick={handleRunBacktest}
              disabled={loading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading && (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              )}
              {loading ? '回测中...' : '开始回测'}
            </button>

            {/* 缓存管理 */}
            <div className="flex items-center gap-4 text-sm text-gray-600">
              {cacheStats && (
                <span>
                  K线缓存: {cacheStats.fileCount} 只股票 ({cacheStats.totalSize})
                </span>
              )}
              <button
                onClick={handleClearCache}
                disabled={clearingCache}
                className="px-3 py-1 text-red-600 hover:text-red-700 hover:bg-red-50 rounded border border-red-300 disabled:opacity-50"
              >
                {clearingCache ? '清除中...' : '清除缓存'}
              </button>
            </div>
          </div>
        </div>

        {/* 错误提示 */}
        {error && <ErrorMessage message={error} />}

        {/* 加载中 */}
        {loading && (
          <div className="text-center py-12">
            <Loading />
            <p className="mt-4 text-gray-500">正在执行回测，请稍候...</p>
            <p className="text-sm text-gray-400 mt-2">回测需要获取每只股票的K线数据，可能需要几分钟</p>
          </div>
        )}

        {/* 回测结果 */}
        {result && (
          <div className="space-y-6">
            {/* 统计概览 */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">回测结果</h2>
              
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-gray-900">{result.totalTrades}</div>
                  <div className="text-sm text-gray-500">总交易次数</div>
                </div>
                
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className={`text-2xl font-bold ${result.winRate >= 50 ? 'text-red-600' : 'text-green-600'}`}>
                    {result.winRate}%
                  </div>
                  <div className="text-sm text-gray-500">胜率</div>
                </div>
                
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className={`text-2xl font-bold ${result.totalProfitPercent >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {result.totalProfitPercent >= 0 ? '+' : ''}{result.totalProfitPercent}%
                  </div>
                  <div className="text-sm text-gray-500">总收益率</div>
                </div>
                
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className={`text-2xl font-bold ${result.avgProfitPercent >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {result.avgProfitPercent >= 0 ? '+' : ''}{result.avgProfitPercent}%
                  </div>
                  <div className="text-sm text-gray-500">平均收益率</div>
                </div>
                
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-gray-900">{result.profitLossRatio}</div>
                  <div className="text-sm text-gray-500">盈亏比</div>
                </div>
                
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-gray-900">{result.avgHoldDays}天</div>
                  <div className="text-sm text-gray-500">平均持仓</div>
                </div>
              </div>

              {/* 详细数据 */}
              <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">盈利次数:</span>
                  <span className="font-medium text-red-600">{result.winTrades}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">亏损次数:</span>
                  <span className="font-medium text-green-600">{result.lossTrades}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">平均盈利:</span>
                  <span className="font-medium text-red-600">+{result.avgWinPercent}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">平均亏损:</span>
                  <span className="font-medium text-green-600">{result.avgLossPercent}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">最大盈利:</span>
                  <span className="font-medium text-red-600">+{result.maxProfit}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">最大亏损:</span>
                  <span className="font-medium text-green-600">{result.maxLoss}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">最大连胜:</span>
                  <span className="font-medium">{result.maxConsecutiveWins}次</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">最大连亏:</span>
                  <span className="font-medium">{result.maxConsecutiveLosses}次</span>
                </div>
              </div>
            </div>

            {/* 交易明细 */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="p-4 border-b flex items-center justify-between">
                <h2 className="text-lg font-semibold">交易明细</h2>
                <button
                  onClick={() => setShowTrades(!showTrades)}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  {showTrades ? '收起' : `展开 (${result.trades.length} 笔)`}
                </button>
              </div>

              {showTrades && (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">代码</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">名称</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">入场日</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">买入价</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">卖出日</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">卖出价</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">持仓</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">收益率</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">退出原因</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {result.trades.map((trade, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm font-medium text-blue-600">{trade.stockCode}</td>
                          <td className="px-4 py-3 text-sm text-gray-900">{trade.stockName}</td>
                          <td className="px-4 py-3 text-sm text-center text-gray-600">{trade.entryDate}</td>
                          <td className="px-4 py-3 text-sm text-right text-gray-900">{trade.entryPrice.toFixed(2)}</td>
                          <td className="px-4 py-3 text-sm text-center text-gray-600">{trade.exitDate}</td>
                          <td className="px-4 py-3 text-sm text-right text-gray-900">{trade.exitPrice.toFixed(2)}</td>
                          <td className="px-4 py-3 text-sm text-center text-gray-600">{trade.holdDays}天</td>
                          <td className="px-4 py-3 text-sm text-right">
                            <span className={`font-medium ${trade.profitPercent >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                              {trade.profitPercent >= 0 ? '+' : ''}{trade.profitPercent}%
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-center">
                            <span className={`px-2 py-1 rounded text-xs ${
                              trade.exitReason === 'take_profit' ? 'bg-red-100 text-red-800' :
                              trade.exitReason === 'stop_loss' ? 'bg-green-100 text-green-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
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

        {/* 强势资金突破策略回测结果 */}
        {buySignalResult && (
          <div className="space-y-6">
            {/* 统计概览 */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">
                回测结果 - 强势资金突破
              </h2>
              
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-gray-900">{buySignalResult.totalTrades}</div>
                  <div className="text-sm text-gray-500">总交易次数</div>
                </div>
                
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className={`text-2xl font-bold ${buySignalResult.winRate >= 50 ? 'text-red-600' : 'text-green-600'}`}>
                    {buySignalResult.winRate}%
                  </div>
                  <div className="text-sm text-gray-500">胜率</div>
                </div>
                
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className={`text-2xl font-bold ${buySignalResult.totalProfitAmount >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {buySignalResult.totalProfitAmount >= 0 ? '+' : ''}{buySignalResult.totalProfitAmount.toLocaleString()}元
                  </div>
                  <div className="text-sm text-gray-500">总收益金额</div>
                </div>
                
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className={`text-2xl font-bold ${buySignalResult.avgProfitPercent >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {buySignalResult.avgProfitPercent >= 0 ? '+' : ''}{buySignalResult.avgProfitPercent}%
                  </div>
                  <div className="text-sm text-gray-500">平均收益率</div>
                </div>
                
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-gray-900">{buySignalResult.profitLossRatio}</div>
                  <div className="text-sm text-gray-500">盈亏比</div>
                </div>
                
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-orange-600">-{buySignalResult.maxDrawdownPercent}%</div>
                  <div className="text-sm text-gray-500">最大回撤</div>
                </div>
              </div>

              {/* 详细数据 */}
              <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">盈利次数:</span>
                  <span className="font-medium text-red-600">{buySignalResult.winTrades}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">亏损次数:</span>
                  <span className="font-medium text-green-600">{buySignalResult.lossTrades}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">平均盈利:</span>
                  <span className="font-medium text-red-600">+{buySignalResult.avgWinPercent}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">平均亏损:</span>
                  <span className="font-medium text-green-600">{buySignalResult.avgLossPercent}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">总投入资金:</span>
                  <span className="font-medium">{buySignalResult.totalInvested.toLocaleString()}元</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">总收益率:</span>
                  <span className={`font-medium ${buySignalResult.totalProfitPercent >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {buySignalResult.totalProfitPercent >= 0 ? '+' : ''}{buySignalResult.totalProfitPercent}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">平均持仓:</span>
                  <span className="font-medium">{buySignalResult.avgHoldDays}天</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">最大连亏:</span>
                  <span className="font-medium">{buySignalResult.maxConsecutiveLosses}次</span>
                </div>
              </div>
            </div>

            {/* 交易明细 */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="p-4 border-b flex items-center justify-between">
                <h2 className="text-lg font-semibold">交易明细</h2>
                <button
                  onClick={() => setShowTrades(!showTrades)}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  {showTrades ? '收起' : `展开 (${buySignalResult.trades.length} 笔)`}
                </button>
              </div>

              {showTrades && (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">代码</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">名称</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">策略</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">评分</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">买入日</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">买入价</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">卖出日</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">卖出价</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">仓位</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">收益率</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">收益额</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">退出原因</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {buySignalResult.trades.map((trade, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm font-medium text-blue-600">{trade.stockCode}</td>
                          <td className="px-4 py-3 text-sm text-gray-900">{trade.stockName}</td>
                          <td className="px-4 py-3 text-sm text-center">
                            <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                              强势资金突破
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-center">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              trade.buySignalScore >= 80 ? 'bg-red-100 text-red-800' :
                              trade.buySignalScore >= 70 ? 'bg-orange-100 text-orange-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {trade.buySignalScore}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-center text-gray-600">{trade.buyDate}</td>
                          <td className="px-4 py-3 text-sm text-right text-gray-900">{trade.buyPrice.toFixed(2)}</td>
                          <td className="px-4 py-3 text-sm text-center text-gray-600">{trade.sellDate}</td>
                          <td className="px-4 py-3 text-sm text-right text-gray-900">{trade.sellPrice.toFixed(2)}</td>
                          <td className="px-4 py-3 text-sm text-right text-gray-600">{trade.position.toLocaleString()}</td>
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
                            <span className={`px-2 py-1 rounded text-xs ${
                              trade.exitReason === 'take_profit' ? 'bg-red-100 text-red-800' :
                              trade.exitReason === 'stop_loss' ? 'bg-green-100 text-green-800' :
                              trade.exitReason === 'market_panic' ? 'bg-orange-100 text-orange-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
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
    </Layout>
  );
};

export default BacktestPage;
