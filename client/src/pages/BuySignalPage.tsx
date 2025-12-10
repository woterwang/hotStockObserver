import React, { useEffect, useState } from 'react';
import { Layout, Loading, ErrorMessage, Empty, DatePicker } from '../components';
import { buySignalApi } from '../services/api';
import type { BuySignal, BuySignalStats } from '../types';
import dayjs from 'dayjs';

/**
 * 买入信号页面
 * 展示买入时机量化分析结果
 */
const BuySignalPage: React.FC = () => {
  const [signals, setSignals] = useState<BuySignal[]>([]);
  const [stats, setStats] = useState<BuySignalStats | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(() => dayjs().format('YYYYMMDD'));
  const [filterSignal, setFilterSignal] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    fetchSignals(selectedDate);
  }, [selectedDate]);

  // 过滤信号
  const filteredSignals = filterSignal === 'all' 
    ? signals 
    : signals.filter(s => s.buySignal === filterSignal);

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
          </div>
        </div>

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
        <div className="flex items-center gap-2 flex-wrap">
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
