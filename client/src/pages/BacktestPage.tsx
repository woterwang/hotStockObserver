import React, { useState, useEffect } from 'react';
import { Layout, Loading, ErrorMessage } from '../components';

// 回测配置接口
interface BacktestConfig {
  stopLossPercent: number;
  takeProfitPercent: number;
  maxHoldDays: number;
  useDay2LowAsStopLoss: boolean;
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
  // 获取当年的默认日期范围
  const currentYear = new Date().getFullYear();
  const defaultStartDate = `${currentYear}-01-01`;
  const today = new Date().toISOString().split('T')[0];

  // 表单状态 - 日期格式 YYYY-MM-DD 用于日历控件
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(today);
  const [config, setConfig] = useState<BacktestConfig>({
    stopLossPercent: -5,
    takeProfitPercent: 10,
    maxHoldDays: 3,  // 默认3天，符合短线策略
    useDay2LowAsStopLoss: true,
  });

  // 日期格式转换：YYYY-MM-DD -> YYYYMMDD
  const formatDateForApi = (dateStr: string): string => {
    return dateStr.replace(/-/g, '');
  };

  // 结果状态
  const [result, setResult] = useState<BacktestResult | null>(null);
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

    try {
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
        // 回测后刷新缓存统计
        fetchCacheStats();
      } else {
        setError(data.message || '回测失败');
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
            价格突破三天确认模式 - 回测分析
          </p>
        </div>

        {/* 配置面板 */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">回测参数</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 日期范围 - 使用日历选择器 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                开始日期
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                max={endDate}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                结束日期
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate}
                max={new Date().toISOString().split('T')[0]}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* 止损 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                止损比例 (%)
              </label>
              <input
                type="number"
                value={config.stopLossPercent}
                onChange={(e) => setConfig({ ...config, stopLossPercent: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* 止盈 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                止盈比例 (%)
              </label>
              <input
                type="number"
                value={config.takeProfitPercent}
                onChange={(e) => setConfig({ ...config, takeProfitPercent: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* 最大持仓天数 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                最大持仓天数
              </label>
              <input
                type="number"
                value={config.maxHoldDays}
                onChange={(e) => setConfig({ ...config, maxHoldDays: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Day2 止损 */}
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
      </div>
    </Layout>
  );
};

export default BacktestPage;
