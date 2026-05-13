/*
 * @Author: hp.com
 * @Date: 2025-12-06 11:54:09
 * @LastEditors: WRG
 * @LastEditTime: 2025-12-28 20:38:26
 * @😍: 😃😃
 */
import React, { useEffect, useState } from 'react';
import { Layout, IndexList, HotStockTable, HotConceptTable,SectorList, Loading, ErrorMessage, Empty } from '../components';
import HistoryConceptPage from '../components/stock/HistoryConceptTable';
import { stockApi } from '../services/api';
import type { MarketOverview } from '../types';

/**
 * 首页 - 信息概览
 */
const HomePage: React.FC = () => {
  const [data, setData] = useState<MarketOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'stocks' | 'concepts' | 'history'>('stocks');

  const fetchData = async () => {
    if(!data?.updateTime){
      setLoading(true);
    }
    setError(null);
    try {
      const response = await stockApi.getOverview();
      if (response.success) {
        setData(response.data);
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
    // 每5分钟刷新一次
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <Layout>
        <Loading text="正在加载市场数据..." />
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

  if (!data) {
    return (
      <Layout>
        <Empty message="暂无数据" />
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        {/* 大盘指数 */}
        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-3 sm:mb-4">📊 大盘指数</h2>
          <IndexList indices={data.indices} />
        </section>

        <div className="flex flex-col lg:grid lg:grid-cols-3 gap-4 sm:gap-6">
          {/* 增加tab： 🔥 热搜股票 Top 20 | 🔥 热搜板块 Top 20*/}
          {/* 热搜板块Top20 */}
          <div className="lg:col-span-2 order-1 lg:order-none">
            <div className="card">
              <div className="border-b border-gray-200 overflow-x-auto">
                <nav className="flex space-x-4 sm:space-x-8 whitespace-nowrap px-1">
                  <button
                    onClick={() => setActiveTab('stocks')}
                    className={`py-3 sm:py-4 px-1 text-center border-b-2 font-medium text-sm transition-colors ${
                      activeTab === 'stocks'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    🔥 热搜股票
                  </button>
                  <button
                    onClick={() => setActiveTab('concepts')}
                    className={`py-3 sm:py-4 px-1 text-center border-b-2 font-medium text-sm transition-colors ${
                      activeTab === 'concepts'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    🔥 热搜板块
                  </button>
                  <button
                    onClick={() => setActiveTab('history')}
                    className={`py-3 sm:py-4 px-1 text-center border-b-2 font-medium text-sm transition-colors ${
                      activeTab === 'history'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    📅 历史热搜
                  </button>
                </nav>
              </div>
              <div className="mt-2 text-xs text-gray-400 sm:hidden px-1">
                * 左右滑动查看表格详情
              </div>
              {activeTab === 'stocks' ? (
                data.hotStocks.length > 0 ? (
                  <HotStockTable stocks={data.hotStocks} showRank={true} />
                ) : (
                  <Empty message="暂无热搜股票数据" />
                )
              ) : activeTab === 'concepts' ? (
                data.hotConcepts.length > 0 ? (
                  <HotConceptTable concepts={data.hotConcepts} showRank={true} />
                ) : (
                  <Empty message="暂无热搜板块数据" />
                )
              ) : activeTab === 'history' ? (
                data.sectors.length > 0 ? (
                  <HistoryConceptPage />
                ) : (
                  <Empty message="暂无板块数据" />
                )
              ) : null}
            </div>
          </div>
          
          {/* 右侧栏 */}
          <div className="space-y-4 sm:space-y-6 order-2 lg:order-none">
            {/* 热门板块 */}
            <div className="card">
              <h3 className="card-header">📈 热门板块</h3>
              {data.sectors.length > 0 ? (
                <SectorList sectors={data.sectors} />
              ) : (
                <Empty message="暂无板块数据" />
              )}
            </div>

            {/* 强势股 */}
            <div className="card">
              <h3 className="card-header">💪 强势股（涨幅 &gt; 5%）</h3>
              {data.strongStocks.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2">
                  {data.strongStocks.slice(0, 10).map((stock) => (
                    <div
                      key={stock.stockCode}
                      className="flex items-center justify-between py-2 px-3 bg-red-50 rounded-lg"
                    >
                      <div>
                        <div className="font-medium text-sm">{stock.stockName}</div>
                        <div className="text-xs text-gray-500">{stock.stockCode}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-rise font-bold">
                          +{stock.changePercent.toFixed(2)}%
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty message="暂无强势股" />
              )}
            </div>
          </div>
        </div>

        {/* 更新时间 */}
        <div className="mt-8 text-center text-xs sm:text-sm text-gray-400 pb-4">
          数据最后更新: {new Date(data.updateTime).toLocaleString()}
        </div>
      </div>
    </Layout>
  );
};

export default HomePage;