import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactECharts from 'echarts-for-react';
import { Layout, Loading, ErrorMessage, Empty } from '../components';
import { stockApi } from '../services/api';
import type { PeriodStats } from '../types';

/**
 * 阶段统计页面
 */
const StatsPage: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<PeriodStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(7);
  const [selectedStock, setSelectedStock] = useState<PeriodStats | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await stockApi.getPeriodStats(days);
      if (response.success) {
        setStats(response.data);
        if (response.data.length > 0 && !selectedStock) {
          setSelectedStock(response.data[0]);
        }
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
  }, [days]);

  const getChartOptions = (stock: PeriodStats) => {
    const dates = stock.trendData.map((d) => d.date.split('T')[0]);
    const prices = stock.trendData.map((d) => d.price);
    const changePercents = stock.trendData.map((d) => d.changePercent);

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

  if (loading) {
    return (
      <Layout>
        <Loading text="正在加载阶段统计..." />
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <ErrorMessage message={error} onRetry={fetchData} />
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* 标题和筛选 */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-800">📈 阶段统计</h1>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-500">统计周期:</span>
            {[2, 3, 5, 7, 14, 30].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1 rounded-lg text-sm ${
                  days === d
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {d}天
              </button>
            ))}
          </div>
        </div>

        {stats.length === 0 ? (
          <Empty message={`最近${days}天暂无持续热搜的股票`} />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 股票列表 */}
            <div className="card">
              <h3 className="card-header">持续热搜股票</h3>
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {stats.map((stock) => (
                  <div
                    key={stock.stockCode}
                    onClick={() => setSelectedStock(stock)}
                    className={`p-3 rounded-lg cursor-pointer transition-colors ${
                      selectedStock?.stockCode === stock.stockCode
                        ? 'bg-blue-50 border border-blue-200'
                        : 'bg-gray-50 hover:bg-gray-100'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{stock.stockName}</div>
                        <div className="text-xs text-gray-500">{stock.stockCode}</div>
                      </div>
                      <div className="text-right">
                        <div
                          className={`font-mono ${
                            stock.totalChangePercent >= 0 ? 'text-rise' : 'text-fall'
                          }`}
                        >
                          {stock.totalChangePercent >= 0 ? '+' : ''}
                          {stock.totalChangePercent.toFixed(2)}%
                        </div>
                        <div className="text-xs text-gray-500">
                          连续{stock.consecutiveDays}天
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 图表和详情 */}
            <div className="lg:col-span-2 space-y-6">
              {selectedStock && (
                <>
                  {/* 趋势图表 */}
                  <div className="card">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold">
                        {selectedStock.stockName} ({selectedStock.stockCode})
                      </h3>
                      <button
                        onClick={() => navigate(`/stock/${selectedStock.stockCode}`)}
                        className="text-sm text-blue-500 hover:text-blue-600"
                      >
                        查看详情 →
                      </button>
                    </div>
                    {selectedStock.trendData.length > 0 ? (
                      <ReactECharts
                        option={getChartOptions(selectedStock)}
                        style={{ height: '300px' }}
                      />
                    ) : (
                      <Empty message="暂无趋势数据" />
                    )}
                  </div>

                  {/* 统计信息 */}
                  <div className="card">
                    <h3 className="card-header">统计信息</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center p-3 bg-gray-50 rounded-lg">
                        <div className="text-2xl font-bold text-blue-500">
                          {selectedStock.consecutiveDays}
                        </div>
                        <div className="text-xs text-gray-500">连续上榜天数</div>
                      </div>
                      <div className="text-center p-3 bg-gray-50 rounded-lg">
                        <div className="text-2xl font-bold">{selectedStock.avgRank}</div>
                        <div className="text-xs text-gray-500">平均排名</div>
                      </div>
                      <div className="text-center p-3 bg-gray-50 rounded-lg">
                        <div
                          className={`text-2xl font-bold ${
                            selectedStock.maxChangePercent >= 0 ? 'text-rise' : 'text-fall'
                          }`}
                        >
                          {selectedStock.maxChangePercent >= 0 ? '+' : ''}
                          {selectedStock.maxChangePercent.toFixed(2)}%
                        </div>
                        <div className="text-xs text-gray-500">最大涨幅</div>
                      </div>
                      <div className="text-center p-3 bg-gray-50 rounded-lg">
                        <div
                          className={`text-2xl font-bold ${
                            selectedStock.minChangePercent >= 0 ? 'text-rise' : 'text-fall'
                          }`}
                        >
                          {selectedStock.minChangePercent >= 0 ? '+' : ''}
                          {selectedStock.minChangePercent.toFixed(2)}%
                        </div>
                        <div className="text-xs text-gray-500">最大跌幅</div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default StatsPage;
