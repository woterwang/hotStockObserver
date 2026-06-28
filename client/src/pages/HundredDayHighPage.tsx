import React, { useEffect, useState } from 'react';
import { Layout, Loading, ErrorMessage, Empty, DatePicker } from '../components';
import { hundredDayHighApi } from '../services/api';
import type { HundredDayHigh, HundredDayHighHistory, HundredDayHighStats } from '../types';

const HundredDayHighPage: React.FC = () => {
  const [list, setList] = useState<HundredDayHigh[]>([]);
  const [history, setHistory] = useState<HundredDayHighHistory[]>([]);
  const [stats, setStats] = useState<HundredDayHighStats | null>(null);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'today' | 'history'>('today');

  const fetchDates = async () => {
    try {
      const response = await hundredDayHighApi.getDates();
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

  const fetchStats = async (date?: string) => {
    try {
      const response = await hundredDayHighApi.getStats(date);
      if (response.success) {
        setStats(response.data);
      }
    } catch (err) {
      console.error('获取统计数据失败:', err);
    }
  };

  const fetchList = async (date?: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await hundredDayHighApi.getList(date);
      if (response.success) {
        setList(response.data);
      } else {
        setError('获取数据失败');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await hundredDayHighApi.getHistory(30);
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

  const handleScan = async () => {
    setScanning(true);
    try {
      const response = await hundredDayHighApi.scan(selectedDate);
      if (response.success) {
        const count = response.data.count || 0;
        alert(`扫描完成，发现 ${count} 只百日新高股票`);
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

  const formatTurnover = (value: number) => {
    if (!value) return '-';
    if (value >= 100000000) return (value / 100000000).toFixed(2) + '亿';
    if (value >= 10000) return (value / 10000).toFixed(2) + '万';
    return value.toFixed(2);
  };

  const goToDetail = (stockCode: string) => {
    const url = `https://www.iwencai.com/unifiedwap/result?querytype=stock&w=${stockCode}`;
    window.open(url, '_blank');
  };

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">百日新高</h1>
            <p className="text-sm text-gray-500 mt-1">
              策略核心：涨幅&gt;8% + 突破前100交易日新高 + 量价趋势评分
            </p>
          </div>
          <button
            onClick={handleScan}
            disabled={scanning}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {scanning ? '扫描中...' : '立即扫描'}
          </button>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('today')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                viewMode === 'today' ? 'bg-white text-blue-600 shadow' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              按日期查看
            </button>
            <button
              onClick={() => setViewMode('history')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                viewMode === 'history' ? 'bg-white text-blue-600 shadow' : 'text-gray-600 hover:text-gray-900'
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
        </div>

        {viewMode === 'today' && stats && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-sm text-gray-500">候选数量</div>
              <div className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-sm text-gray-500">平均评分</div>
              <div className="text-2xl font-bold text-blue-600 mt-1">{stats.avgScore?.toFixed(1)}</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-sm text-gray-500">高质量(≥70)</div>
              <div className="text-2xl font-bold text-green-600 mt-1">{stats.highQualityCount}</div>
            </div>
          </div>
        )}

        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorMessage message={error} />
        ) : viewMode === 'today' ? (
          list.length === 0 ? (
            <Empty message="暂无百日新高股票数据" />
          ) : (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">序号</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">股票代码</th>
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
                  {list.map((stock, index) => (
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
                        <span className={`px-2 py-1 rounded text-xs ${
                          stock.riskLevel === 'low'
                            ? 'bg-green-100 text-green-800'
                            : stock.riskLevel === 'medium'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-red-100 text-red-800'
                        }`}>
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
          )
        ) : (
          history.length === 0 ? (
            <Empty message="暂无历史数据" />
          ) : (
            <div className="space-y-4">
              {history.map((item) => (
                <div key={item.date} className="bg-white rounded-lg shadow p-4">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-gray-900">{item.date}</div>
                    <div className="text-sm text-gray-500">共 {item.count} 只</div>
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

export default HundredDayHighPage;
