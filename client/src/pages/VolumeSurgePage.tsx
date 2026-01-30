import React, { useEffect, useState } from 'react';
import { Layout, Loading, ErrorMessage, Empty, DatePicker, BackfillDialog } from '../components';
import { volumeSurgeApi } from '../services/api';
import type { VolumeSurge, VolumeSurgeHistory, VolumeSurgeStats } from '../types';

/**
 * 放量大涨页面
 * 展示符合放量大涨条件的股票
 */
const VolumeSurgePage: React.FC = () => {
  const [surgeList, setSurgeList] = useState<VolumeSurge[]>([]);
  const [history, setHistory] = useState<VolumeSurgeHistory[]>([]);
  const [stats, setStats] = useState<VolumeSurgeStats | null>(null);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'today' | 'history'>('today');
  const [showBackfillDialog, setShowBackfillDialog] = useState(false);

  // 获取可用日期列表
  const fetchDates = async () => {
    try {
      const response = await volumeSurgeApi.getDates();
      if (response.success) {
        setAvailableDates(response.data);
        if (response.data.length > 0 && !selectedDate) {
          setSelectedDate(response.data[0].replace(/-/g, ''));
        } else if (response.data.length === 0) {
          setLoading(false);
        }
      }
    } catch (err) {
      console.error('获取日期列表失败:', err);
      setLoading(false);
    }
  };

  // 获取统计数据
  const fetchStats = async (date?: string) => {
    try {
      const response = await volumeSurgeApi.getStats(date);
      if (response.success) {
        setStats(response.data);
      }
    } catch (err) {
      console.error('获取统计数据失败:', err);
    }
  };

  // 获取列表
  const fetchList = async (date?: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await volumeSurgeApi.getList(date);
      if (response.success) {
        setSurgeList(response.data);
      } else {
        setError('获取数据失败');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // 获取历史记录
  const fetchHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await volumeSurgeApi.getHistory(30);
      if (response.success) {
        setHistory(response.data);
      } else {
        setError('获取历史数据失败');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // 手动触发扫描（使用当前选中的日期）
  const handleScan = async () => {
    setScanning(true);
    try {
      const response = await volumeSurgeApi.scan(selectedDate);
      if (response.success) {
        const count = response.data.count || 0;
        alert(`扫描完成，发现 ${count} 只放量大涨股票`);
        fetchList(selectedDate);
        fetchStats(selectedDate);
        fetchDates();
      }
    } catch (err) {
      alert('扫描失败: ' + (err as Error).message);
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    fetchDates();
  }, []);

  useEffect(() => {
    if (viewMode === 'today' && selectedDate) {
      fetchList(selectedDate);
      fetchStats(selectedDate);
    } else if (viewMode === 'history') {
      fetchHistory();
    }
  }, [viewMode, selectedDate]);

  // 格式化成交额
  const formatTurnover = (value: number) => {
    if (!value) return '-';
    if (value >= 100000000) {
      return (value / 100000000).toFixed(2) + '亿';
    } else if (value >= 10000) {
      return (value / 10000).toFixed(2) + '万';
    }
    return value.toFixed(2);
  };

  // 跳转到同花顺个股页面（外部链接）
  const goToDetail = (stockCode: string) => {
    const url = `https://www.iwencai.com/unifiedwap/result?querytype=stock&w=${stockCode}`;
    window.open(url, '_blank');
  };

  return (
    <Layout>
      <div className="space-y-4">
        {/* 页面标题 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">强势资金突破</h1>
            <p className="text-sm text-gray-500 mt-1">
              策略核心：成交额前200 + 涨幅&gt;7% + 创20日新高 + 上影线&lt;3%
            </p>
          </div>
          <button
            onClick={handleScan}
            disabled={scanning}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {scanning && (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            )}
            {scanning ? '扫描中...' : '立即扫描'}
          </button>
        </div>

        {/* 视图切换和日期选择 */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('today')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                viewMode === 'today'
                  ? 'bg-white text-blue-600 shadow'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              按日期查看
            </button>
            <button
              onClick={() => setViewMode('history')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                viewMode === 'history'
                  ? 'bg-white text-blue-600 shadow'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              历史汇总
            </button>
          </div>

          {viewMode === 'today' && (
            <DatePicker
              value={selectedDate}
              onChange={setSelectedDate}
              availableDates={availableDates}
              placeholder="选择日期"
            />
          )}

          {/* 补录按钮 */}
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

        {/* 补录对话框 */}
        <BackfillDialog
          isOpen={showBackfillDialog}
          onClose={() => {
            setShowBackfillDialog(false);
            fetchDates(); // 刷新日期列表
          }}
          onConfirm={async () => {}}
        />

        {/* 分析仪表盘 - 仅在按日期查看模式且有统计数据时显示 */}
        {viewMode === 'today' && stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 市场情绪卡片 */}
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-500">市场情绪</h3>
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                  stats.marketInfo.sentiment >= 60 ? 'bg-green-100 text-green-800' :
                  stats.marketInfo.sentiment >= 40 ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {stats.marketInfo.sentiment >= 60 ? '积极' :
                   stats.marketInfo.sentiment >= 40 ? '中性' : '谨慎'}
                </span>
              </div>
              <div className="mt-2 flex items-baseline">
                <span className="text-3xl font-bold text-gray-900">{stats.marketInfo.sentiment}</span>
                <span className="ml-1 text-sm text-gray-500">分</span>
              </div>
              <div className="mt-2 text-xs text-gray-500">
                涨停数: <span className="font-medium text-gray-700">{stats.marketInfo.limitUpCount}</span> |
                大盘趋势: <span className={`font-medium ${stats.marketInfo.indexAboveMa20 ? 'text-green-600' : 'text-red-600'}`}>
                  {stats.marketInfo.indexAboveMa20 ? '上升' : '下降'}
                </span>
              </div>
              <div className="mt-2 text-xs">
                <span className={`font-medium ${
                  stats.marketInfo.advice === 'aggressive' ? 'text-green-600' :
                  stats.marketInfo.advice === 'normal' ? 'text-blue-600' : 'text-red-600'
                }`}>
                  建议: {stats.marketInfo.advice === 'aggressive' ? '积极参与' :
                         stats.marketInfo.advice === 'normal' ? '正常操作' : '谨慎减仓'}
                </span>
              </div>
            </div>

            {/* 策略得分卡片 */}
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-500">策略得分</h3>
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                  stats.avgScore >= 70 ? 'bg-green-100 text-green-800' :
                  stats.avgScore >= 50 ? 'bg-yellow-100 text-yellow-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  平均
                </span>
              </div>
              <div className="mt-2 flex items-baseline">
                <span className="text-3xl font-bold text-gray-900">{stats.avgScore.toFixed(1)}</span>
                <span className="ml-1 text-sm text-gray-500">分</span>
              </div>
              <div className="mt-2 text-xs text-gray-500">
                最高: <span className="font-medium text-green-600">{stats.maxScore}</span> |
                最低: <span className="font-medium text-red-600">{stats.minScore}</span>
              </div>
              <div className="mt-2 text-xs text-gray-500">
                高质量: <span className="font-medium text-green-600">{stats.highQualityCount}</span> 只 (≥70分)
              </div>
            </div>

            {/* 风险分布卡片 */}
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-500">风险分布</h3>
                <span className="text-sm font-medium text-gray-700">共 {stats.total} 只</span>
              </div>
              <div className="mt-3 space-y-2">
                <div className="flex items-center">
                  <span className="w-16 text-xs text-gray-500">低风险</span>
                  <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-green-500 rounded-full"
                      style={{ width: `${stats.total > 0 ? (stats.riskDistribution.low / stats.total * 100) : 0}%` }}
                    />
                  </div>
                  <span className="ml-2 text-xs font-medium text-green-600">{stats.riskDistribution.low}</span>
                </div>
                <div className="flex items-center">
                  <span className="w-16 text-xs text-gray-500">中风险</span>
                  <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-yellow-500 rounded-full"
                      style={{ width: `${stats.total > 0 ? (stats.riskDistribution.medium / stats.total * 100) : 0}%` }}
                    />
                  </div>
                  <span className="ml-2 text-xs font-medium text-yellow-600">{stats.riskDistribution.medium}</span>
                </div>
                <div className="flex items-center">
                  <span className="w-16 text-xs text-gray-500">高风险</span>
                  <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-red-500 rounded-full"
                      style={{ width: `${stats.total > 0 ? (stats.riskDistribution.high / stats.total * 100) : 0}%` }}
                    />
                  </div>
                  <span className="ml-2 text-xs font-medium text-red-600">{stats.riskDistribution.high}</span>
                </div>
              </div>
            </div>

            {/* 行业分布卡片 */}
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-500">热门行业</h3>
                <span className="text-xs text-gray-400">TOP 5</span>
              </div>
              <div className="mt-3 space-y-2">
                {stats.industryDistribution.slice(0, 5).map((item, index) => (
                  <div key={item.name} className="flex items-center justify-between">
                    <div className="flex items-center">
                      <span className={`w-5 h-5 flex items-center justify-center text-xs font-medium rounded ${
                        index === 0 ? 'bg-red-100 text-red-600' :
                        index === 1 ? 'bg-orange-100 text-orange-600' :
                        index === 2 ? 'bg-yellow-100 text-yellow-600' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {index + 1}
                      </span>
                      <span className="ml-2 text-sm text-gray-700 truncate max-w-[100px]">{item.name}</span>
                    </div>
                    <span className="text-sm font-medium text-gray-900">{item.count} 只</span>
                  </div>
                ))}
                {stats.industryDistribution.length === 0 && (
                  <div className="text-xs text-gray-400 text-center py-2">暂无数据</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 内容区域 */}
        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorMessage message={error} />
        ) : viewMode === 'today' ? (
          // 当日列表视图
          surgeList.length === 0 ? (
            <Empty message="暂无放量大涨股票数据" />
          ) : (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      序号
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      股票代码
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      名称
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      当前价格
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      涨幅
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      成交额
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      量比
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      换手率
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      策略分
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      风险
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      行业/概念
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {surgeList.map((stock, index) => (
                    <tr
                      key={stock.stockCode}
                      onClick={() => goToDetail(stock.stockCode)}
                      className="hover:bg-gray-50 cursor-pointer"
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                        {index + 1}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-blue-600">
                        {stock.stockCode}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {stock.stockName}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900">
                        {stock.price.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right">
                        <span
                          className={`font-medium ${
                            stock.changePercent >= 0
                              ? 'text-red-600'
                              : 'text-green-600'
                          }`}
                        >
                          {stock.changePercent >= 0 ? '+' : ''}
                          {stock.changePercent.toFixed(2)}%
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 font-medium">
                        {formatTurnover(stock.turnover)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right">
                        <span
                          className={`font-medium ${
                            stock.volumeRatio >= 2
                              ? 'text-red-600'
                              : stock.volumeRatio >= 1.5
                              ? 'text-orange-500'
                              : 'text-gray-600'
                          }`}
                        >
                          {stock.volumeRatio.toFixed(2)}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-600">
                        {stock.turnoverRate.toFixed(2)}%
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-center">
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded text-xs font-bold ${
                            (stock.strategyScore || 0) >= 70
                              ? 'bg-green-100 text-green-700'
                              : (stock.strategyScore || 0) >= 50
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {stock.strategyScore || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-center">
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            stock.riskLevel === 'low'
                              ? 'bg-green-100 text-green-700'
                              : stock.riskLevel === 'medium'
                              ? 'bg-yellow-100 text-yellow-700'
                              : stock.riskLevel === 'high'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {stock.riskLevel === 'low' ? '低' : 
                           stock.riskLevel === 'medium' ? '中' : 
                           stock.riskLevel === 'high' ? '高' : '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">
                        {stock.industry} / {stock.concept}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          // 历史汇总视图
          history.length === 0 ? (
            <Empty message="暂无历史数据" />
          ) : (
            <div className="space-y-4">
              {history.map((day) => (
                <div
                  key={day.date}
                  className="bg-white rounded-lg shadow overflow-hidden"
                >
                  <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
                    <h3 className="font-medium text-gray-900">{day.date}</h3>
                    <span className="text-sm text-gray-500">
                      共 <span className="font-medium text-blue-600">{day.count}</span> 只
                    </span>
                  </div>
                  <div className="p-4">
                    <div className="flex flex-wrap gap-2">
                      {day.stocks.slice(0, 10).map((stock) => (
                        <button
                          key={stock.stockCode}
                          onClick={() => goToDetail(stock.stockCode)}
                          className="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-sm transition"
                        >
                          <span className="font-medium text-gray-900">
                            {stock.stockName}
                          </span>
                          <span
                            className={`${
                              stock.changePercent >= 0
                                ? 'text-red-600'
                                : 'text-green-600'
                            }`}
                          >
                            {stock.changePercent >= 0 ? '+' : ''}
                            {stock.changePercent.toFixed(1)}%
                          </span>
                        </button>
                      ))}
                      {day.stocks.length > 10 && (
                        <span onClick={
                          () => alert('请切换到按日期查看模式，查看更多股票详情。')
                        } className="inline-flex items-center px-3 py-1 text-sm text-gray-500">
                          +{day.stocks.length - 10} 更多
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </Layout>
  );
};

export default VolumeSurgePage;
