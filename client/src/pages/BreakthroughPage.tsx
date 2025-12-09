import React, { useEffect, useState } from 'react';
import { Layout, Loading, ErrorMessage, Empty } from '../components';
import { breakthroughApi } from '../services/api';
import type { PriceBreakthrough, BreakthroughHistory } from '../types';

/**
 * 价格突破页面
 * 展示符合三天突破确认条件的股票
 * day1: 涨幅>8%，股价创188日新高
 * day2: 涨跌幅>-3%且<3%，最高价>day1最高价
 * day3: 开盘价>day2当日均价，开盘涨幅<3%且>-5%
 */
const BreakthroughPage: React.FC = () => {
  const [breakthroughList, setBreakthroughList] = useState<PriceBreakthrough[]>([]);
  const [history, setHistory] = useState<BreakthroughHistory[]>([]);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'today' | 'history'>('today');

  // 获取可用日期列表
  const fetchDates = async () => {
    try {
      const response = await breakthroughApi.getDates();
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

  // 获取突破列表
  const fetchList = async (date?: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await breakthroughApi.getList(date);
      if (response.success) {
        setBreakthroughList(response.data);
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
      const response = await breakthroughApi.getHistory(30);
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

  // 手动触发扫描
  const handleScan = async () => {
    setScanning(true);
    try {
      const response = await breakthroughApi.scan();
      if (response.success) {
        // 注意：count 直接在 response 上，不是 response.data.count
        const count = (response as any).count || 0;
        alert(`扫描完成，发现 ${count} 只突破股票`);
        fetchList(selectedDate);
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
    } else if (viewMode === 'history') {
      fetchHistory();
    }
  }, [viewMode, selectedDate]);

  // 格式化成交额
  const formatTurnover = (value: number) => {
    if (value >= 100000000) {
      return (value / 100000000).toFixed(2) + '亿';
    } else if (value >= 10000) {
      return (value / 10000).toFixed(2) + '万';
    }
    return value.toFixed(2);
  };

  // 跳转到同花顺个股页面（外部链接）
  const goToDetail = (stockCode: string) => {
    // 同花顺个股页面链接
    const url = `https://stockpage.10jqka.com.cn/${stockCode}/`;
    window.open(url, '_blank');
  };

  return (
    <Layout>
      <div className="space-y-4">
        {/* 页面标题 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">价格突破</h1>
            <p className="text-sm text-gray-500 mt-1">
              三天突破确认模式：day1涨幅大于8%创188日新高 → day2确认 → day3入场
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

          {viewMode === 'today' && availableDates.length > 0 && (
            <select
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {availableDates.map((date) => (
                <option key={date} value={date.replace(/-/g, '')}>
                  {date}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* 内容区域 */}
        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorMessage message={error} />
        ) : viewMode === 'today' ? (
          // 当日列表视图
          breakthroughList.length === 0 ? (
            <Empty message="暂无突破股票数据" />
          ) : (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
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
                      188日高
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      上涨原因
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {breakthroughList.map((stock) => (
                    <tr
                      key={stock.stockCode}
                      onClick={() => goToDetail(stock.stockCode)}
                      className="hover:bg-gray-50 cursor-pointer"
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-blue-600">
                        {stock.stockCode}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {stock.stockName}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900">
                        {stock.currentPrice.toFixed(2)}
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
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-600">
                        {formatTurnover(stock.turnover)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right">
                        <span
                          className={`font-medium ${
                            stock.turnoverRatio >= 1.5
                              ? 'text-red-600'
                              : stock.turnoverRatio >= 1
                              ? 'text-orange-500'
                              : 'text-gray-600'
                          }`}
                        >
                          {stock.turnoverRatio.toFixed(2)}x
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-600">
                        {stock.high188.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">
                        {stock.riseReason || '-'}
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
                        <span className="inline-flex items-center px-3 py-1 text-sm text-gray-500">
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

export default BreakthroughPage;
