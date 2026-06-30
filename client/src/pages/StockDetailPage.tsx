import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout, Loading, ErrorMessage, Empty, Chart } from '../components';
import { stockApi } from '../services/api';
import type { StockDetail, HotStock } from '../types';

/**
 * 股票详情页
 */
const StockDetailPage: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<StockDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    if (!code) return;
    
    setLoading(true);
    setError(null);
    try {
      const response = await stockApi.getStockDetail(code);
      if (response.success) {
        setDetail(response.data);
      } else {
        setError('获取数据失败');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [code]);

  // K线图配置
  const getKlineOptions = (history: HotStock[]) => {
    const dates = history.map((d) => d.date.split('T')[0]);
    const prices = history.map((d) => d.currentPrice);
    const changePercents = history.map((d) => d.changePercent);

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'cross',
        },
      },
      legend: {
        data: ['价格', '涨跌幅'],
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: dates,
        axisLabel: {
          rotate: 45,
        },
      },
      yAxis: [
        {
          type: 'value',
          name: '价格',
          position: 'left',
          scale: true,
        },
        {
          type: 'value',
          name: '涨跌幅(%)',
          position: 'right',
          axisLabel: {
            formatter: '{value}%',
          },
        },
      ],
      series: [
        {
          name: '价格',
          type: 'line',
          data: prices,
          smooth: true,
          lineStyle: {
            color: '#3b82f6',
            width: 2,
          },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(59, 130, 246, 0.3)' },
                { offset: 1, color: 'rgba(59, 130, 246, 0.05)' },
              ],
            },
          },
          itemStyle: {
            color: '#3b82f6',
          },
        },
        {
          name: '涨跌幅',
          type: 'bar',
          yAxisIndex: 1,
          data: changePercents,
          itemStyle: {
            color: (params: { value: number }) => {
              return params.value >= 0 ? '#ef4444' : '#22c55e';
            },
          },
        },
      ],
    };
  };

  // 成交额图表配置
  const getTurnoverOptions = (history: HotStock[]) => {
    const dates = history.map((d) => d.date.split('T')[0]);
    const turnovers = history.map((d) => d.turnover / 100000000); // 转换为亿

    return {
      tooltip: {
        trigger: 'axis',
        formatter: (params: { name: string; value: number }[]) => {
          return `${params[0].name}<br/>成交额: ${params[0].value.toFixed(2)}亿`;
        },
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: dates,
        axisLabel: {
          rotate: 45,
        },
      },
      yAxis: {
        type: 'value',
        name: '成交额(亿)',
      },
      series: [
        {
          type: 'bar',
          data: turnovers,
          itemStyle: {
            color: '#8b5cf6',
          },
        },
      ],
    };
  };

  if (loading) {
    return (
      <Layout>
        <Loading text="正在加载股票详情..." />
      </Layout>
    );
  }

  if (error || !detail || !detail.basic) {
    return (
      <Layout>
        <ErrorMessage message={error || '未找到该股票'} onRetry={fetchData} />
      </Layout>
    );
  }

  const { basic, history, news } = detail;

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        {/* 返回按钮和标题 */}
        <div className="flex items-center space-x-2 sm:space-x-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 text-gray-500 hover:text-gray-700 active:bg-gray-100 rounded-full transition-colors"
          >
            ← <span className="hidden sm:inline">返回</span>
          </button>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800 truncate">
            {basic.stockName}
            <span className="text-gray-400 text-base sm:text-lg ml-2 font-normal">({basic.stockCode})</span>
          </h1>
        </div>

        {/* 基本信息卡片 */}
        <div className="card">
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
            <div className="text-center p-2 rounded-lg bg-gray-50 sm:bg-transparent">
              <div
                className={`text-xl sm:text-3xl font-bold font-mono ${
                  basic.changePercent >= 0 ? 'text-rise' : 'text-fall'
                }`}
              >
                {basic.currentPrice.toFixed(2)}
              </div>
              <div className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-wider">最新价</div>
            </div>
            <div className="text-center p-2 rounded-lg bg-gray-50 sm:bg-transparent">
              <div
                className={`text-lg sm:text-xl font-bold font-mono ${
                  basic.changePercent >= 0 ? 'text-rise' : 'text-fall'
                }`}
              >
                {basic.changePercent >= 0 ? '+' : ''}{basic.changePercent.toFixed(2)}%
              </div>
              <div className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-wider">涨跌幅</div>
            </div>
            <div className="text-center p-2 rounded-lg bg-gray-50 sm:bg-transparent">
              <div className="text-lg sm:text-xl font-bold text-gray-800 font-mono">
                {(basic.turnover / 100000000).toFixed(2)}亿
              </div>
              <div className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-wider">成交额</div>
            </div>
            <div className="text-center p-2 rounded-lg bg-gray-50 sm:bg-transparent">
              <div className="text-lg sm:text-xl font-bold text-blue-500 font-mono">{basic.rank}</div>
              <div className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-wider">热搜排名</div>
            </div>
            <div className="text-center p-2 rounded-lg bg-gray-50 sm:bg-transparent">
              <div className="text-lg sm:text-xl font-bold text-orange-500 font-mono">
                {basic.consecutiveDays}天
              </div>
              <div className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-wider">连续上榜</div>
            </div>
            <div className="text-center p-2 rounded-lg bg-gray-50 sm:bg-transparent">
              <div className="text-lg sm:text-xl font-bold text-purple-500 font-mono">
                {basic.hotScore || '-'}
              </div>
              <div className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-wider">热度分数</div>
            </div>
          </div>

          {/* 上涨原因 */}
          {basic.riseReason && (
            <div className="mt-4 p-3 bg-orange-50 rounded-lg">
              <span className="text-sm font-medium text-orange-600">上涨原因: </span>
              <span className="text-sm text-gray-700">{basic.riseReason}</span>
            </div>
          )}

          {/* 概念标签 */}
          {basic.concept && basic.concept.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {basic.concept.map((c, i) => (
                <span key={i} className="tag tag-concept">
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 图表区域 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 价格走势 */}
          <div className="card">
            <h3 className="card-header">📈 价格走势</h3>
            {history.length > 0 ? (
              <Chart option={getKlineOptions(history)} style={{ height: '300px' }} />
            ) : (
              <Empty message="暂无历史数据" />
            )}
          </div>

          {/* 成交额走势 */}
          <div className="card">
            <h3 className="card-header">💰 成交额走势</h3>
            {history.length > 0 ? (
              <Chart option={getTurnoverOptions(history)} style={{ height: '300px' }} />
            ) : (
              <Empty message="暂无历史数据" />
            )}
          </div>
        </div>

        {/* 历史上榜记录 */}
        <div className="card">
          <h3 className="card-header">📅 历史上榜记录</h3>
          {history.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="stock-table">
                <thead>
                  <tr>
                    <th>日期</th>
                    <th className="text-right">价格</th>
                    <th className="text-right">涨跌幅</th>
                    <th className="text-right">成交额</th>
                    <th className="text-center">排名</th>
                  </tr>
                </thead>
                <tbody>
                  {history.slice().reverse().map((record) => (
                    <tr key={record.date}>
                      <td>{record.date.split('T')[0]}</td>
                      <td
                        className={`text-right font-mono ${
                          record.changePercent >= 0 ? 'text-rise' : 'text-fall'
                        }`}
                      >
                        {record.currentPrice.toFixed(2)}
                      </td>
                      <td
                        className={`text-right font-mono ${
                          record.changePercent >= 0 ? 'text-rise' : 'text-fall'
                        }`}
                      >
                        {record.changePercent >= 0 ? '+' : ''}
                        {record.changePercent.toFixed(2)}%
                      </td>
                      <td className="text-right text-gray-600">
                        {(record.turnover / 100000000).toFixed(2)}亿
                      </td>
                      <td className="text-center">{record.rank}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty message="暂无历史记录" />
          )}
        </div>

        {/* 相关新闻 */}
        <div className="card">
          <h3 className="card-header">📰 相关新闻</h3>
          {news.length > 0 ? (
            <div className="space-y-3">
              {news.map((item) => (
                <a
                  key={item._id}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block p-3 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-800 hover:text-blue-500">
                        {item.title}
                      </h4>
                      {item.summary && (
                        <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                          {item.summary}
                        </p>
                      )}
                    </div>
                    <div className="ml-4 text-xs text-gray-400 whitespace-nowrap">
                      {new Date(item.publishTime).toLocaleDateString()}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <Empty message="暂无相关新闻" />
          )}
        </div>
      </div>
    </Layout>
  );
};

export default StockDetailPage;
