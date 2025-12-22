/*
 * @Author: hp.com
 * @Date: 2025-12-06 11:54:09
 * @LastEditors: WRG
 * @LastEditTime: 2025-12-20 13:11:23
 * @😍: 😃😃
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layout, IndexList, HotStockTable, HotConceptTable,SectorList, Loading, ErrorMessage, Empty } from '../components';
import { stockApi } from '../services/api';
import type { MarketOverview } from '../types';

/**
 * 首页 - 信息概览
 */
const HomePage: React.FC = () => {
  const [data, setData] = useState<MarketOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'stocks' | 'concepts'>('stocks');

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
      <div className="space-y-6">
        {/* 大盘指数 */}
        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-4">📊 大盘指数</h2>
          <IndexList indices={data.indices} />
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 增加tab： 🔥 热搜股票 Top 20 | 🔥 热搜板块 Top 20*/}
          {/* 热搜板块Top20 */}
          <div className="lg:col-span-2">
            <div className="card">
              <div className="border-b border-gray-200">
                <nav className="flex space-x-8">
                  <button
                    onClick={() => setActiveTab('stocks')}
                    className={`py-4 px-1 text-center border-b-2 font-medium text-sm ${
                      activeTab === 'stocks'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    🔥 热搜股票 Top 20
                  </button>
                  <button
                    onClick={() => setActiveTab('concepts')}
                    className={`py-4 px-1 text-center border-b-2 font-medium text-sm ${
                      activeTab === 'concepts'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    🔥 热搜板块 Top 20
                  </button>
                  <Link
                    to="/history-concept"
                    className="py-4 px-1 text-center border-b-2 font-medium text-sm border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  >
                    📅 历史热搜
                  </Link>
                </nav>
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
              ) : null}
            </div>
          </div>
          
          {/* 右侧栏 */}
          <div className="space-y-6">
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
              <h3 className="card-header">💪 强势股（涨幅&gt;5%）</h3>
              {data.strongStocks.length > 0 ? (
                <div className="space-y-2">
                  {data.strongStocks.slice(0, 5).map((stock) => (
                    <div
                      key={stock.stockCode}
                      className="flex items-center justify-between py-2 px-3 bg-red-50 rounded-lg"
                    >
                      <div>
                        <div className="font-medium text-sm">{stock.stockName}</div>
                        <div className="text-xs text-gray-500">{stock.stockCode}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-rise">
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
        <div className="text-center text-sm text-gray-400">
          数据更新时间: {new Date(data.updateTime).toLocaleString()}
        </div>
      </div>
    </Layout>
  );
};

export default HomePage;