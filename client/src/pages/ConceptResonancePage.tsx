import React, { useEffect, useState } from 'react';
import { Layout, Loading, ErrorMessage, Empty, DatePicker } from '../components';
import { conceptResonanceApi } from '../services/api';
import type { 
  ConceptResonance, 
  ConceptResonanceStats, 
  ConceptLeader,
  ConceptResonanceBacktestConfig,
  ConceptResonanceBacktestResult
} from '../types';
import dayjs from 'dayjs';

// Tab 类型
type TabType = 'scan' | 'signal' | 'backtest';

/**
 * 主线共振策略页面
 * 包含：手动扫描、买入信号、历史回测
 */
const ConceptResonancePage: React.FC = () => {
  // 当前 Tab
  const [activeTab, setActiveTab] = useState<TabType>('scan');
  
  // 通用状态
  const [selectedDate, setSelectedDate] = useState<string>(() => dayjs().format('YYYYMMDD'));
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // 扫描结果
  const [candidates, setCandidates] = useState<ConceptResonance[]>([]);
  const [stats, setStats] = useState<ConceptResonanceStats | null>(null);
  const [leaders, setLeaders] = useState<ConceptLeader[]>([]);
  const [scanning, setScanning] = useState(false);
  const [deepScan, setDeepScan] = useState(false);
  
  // 信号筛选
  const [filterLeaderOnly, setFilterLeaderOnly] = useState(false);
  const [filterMinScore, setFilterMinScore] = useState(88);
  
  // 回测相关
  const [backtestConfig, setBacktestConfig] = useState<ConceptResonanceBacktestConfig>({
    signalFilter: 'high_score',
    minConceptScore: 30,
    minTotalScore: 70,
    basePosition: 50000,
    stopLossPercent: 0.05,
    takeProfitPercent: 0.15,
    maxHoldDays: 3,
    leaderBonus: 0.5,
  });
  const [backtestResult, setBacktestResult] = useState<ConceptResonanceBacktestResult | null>(null);
  const [backtesting, setBacktesting] = useState(false);
  const [showTrades, setShowTrades] = useState(false);
  
  // 回测日期范围
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const defaultStartDate = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
  const endDateObj = new Date(now);
  endDateObj.setDate(endDateObj.getDate() - 3);
  const defaultEndDate = endDateObj.toISOString().split('T')[0];
  
  const [backtestStartDate, setBacktestStartDate] = useState(defaultStartDate);
  const [backtestEndDate, setBacktestEndDate] = useState(defaultEndDate);

  // 获取可用日期
  const fetchDates = async () => {
    try {
      const response = await conceptResonanceApi.getDates();
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

  // 获取候选标的列表
  const fetchList = async (date?: string) => {
    setLoading(true);
    setError(null);
    try {
      const [listRes, statsRes, leadersRes] = await Promise.all([
        conceptResonanceApi.getList(date, filterLeaderOnly),
        conceptResonanceApi.getStats(date),
        conceptResonanceApi.getLeaders(date),
      ]);
      
      if (listRes.success) setCandidates(listRes.data);
      if (statsRes.success) setStats(statsRes.data);
      if (leadersRes.success) setLeaders(leadersRes.data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  //获取买入信号列表
  const fetchSignals = async (date?: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await conceptResonanceApi.getList(date,false,'buySignal');
      if (response.success) {
        setCandidates(response.data);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // 手动扫描
  const handleScan = async () => {
    setScanning(true);
    setError(null);
    try {
      const response = await conceptResonanceApi.scan(selectedDate, deepScan);
      if (response.success) {
        alert(`扫描完成！发现 ${response.data.count} 个候选标的，其中龙头 ${response.data.leaders} 个`);
        fetchList(selectedDate);
        fetchDates();
      }
    } catch (err) {
      setError('扫描失败: ' + (err as Error).message);
    } finally {
      setScanning(false);
    }
  };

  // 执行回测
  const handleBacktest = async () => {
    setBacktesting(true);
    setError(null);
    setBacktestResult(null);
    
    try {
      const response = await conceptResonanceApi.backtest(
        backtestStartDate.replace(/-/g, ''),
        backtestEndDate.replace(/-/g, ''),
        backtestConfig
      );
      
      if (response.success) {
        setBacktestResult(response.data);
      } else {
        setError(response.message || '回测失败');
      }
    } catch (err) {
      setError('回测失败: ' + (err as Error).message);
    } finally {
      setBacktesting(false);
    }
  };

  // 初始加载
  useEffect(() => {
    fetchDates();
  }, []);

  // 切换日期或筛选条件时重新加载
  useEffect(() => {
    if (activeTab !== 'backtest' && selectedDate) {
      // fetchList(selectedDate);
      if(activeTab==='scan'){
        fetchList(selectedDate);
      }
      if(activeTab==='signal'){
        fetchSignals();
      }
    }
  }, [selectedDate, filterLeaderOnly, activeTab]);

  // 格式化成交额
  const formatTurnover = (value: number) => {
    if (!value) return '-';
    if (value >= 100000000) return (value / 100000000).toFixed(2) + '亿';
    if (value >= 10000) return (value / 10000).toFixed(2) + '万';
    return value.toFixed(2);
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

  // 跳转到同花顺
  const goToDetail = (stockCode: string) => {
    window.open(`https://www.iwencai.com/unifiedwap/result?querytype=stock&w=${stockCode}`, '_blank');
  };

  // 过滤后的候选标的
  const filteredCandidates = candidates.filter(c => {
    if (filterLeaderOnly && !c.isConceptLeader) return false;
    if ((c.strategyScore || 0) < filterMinScore) return false;
    return true;
  });

  return (
    <Layout>
      <div className="space-y-4">
        {/* 页面标题 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">🎯 主线共振</h1>
            <p className="text-sm text-gray-500 mt-1">
              量价突破 + 板块概念共振 | 识别主流热点中的龙头标的
            </p>
          </div>
        </div>

        {/* Tab 切换 */}
        <div className="bg-white rounded-lg shadow">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              <button
                onClick={() => setActiveTab('scan')}
                className={`px-6 py-4 text-sm font-medium border-b-2 transition ${
                  activeTab === 'scan'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                📊 扫描候选
              </button>
              <button
                onClick={() => setActiveTab('signal')}
                className={`px-6 py-4 text-sm font-medium border-b-2 transition ${
                  activeTab === 'signal'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                🔥 买入信号
              </button>
              <button
                onClick={() => setActiveTab('backtest')}
                className={`px-6 py-4 text-sm font-medium border-b-2 transition ${
                  activeTab === 'backtest'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                📈 历史回测
              </button>
            </nav>
          </div>

          {/* Tab 内容 */}
          <div className="p-6">
            {/* ==================== 扫描候选 Tab ==================== */}
            {activeTab === 'scan' && (
              <div className="space-y-6">
                {/* 扫描控制栏 */}
                <div className="flex items-center gap-4 flex-wrap">
                  <DatePicker
                    value={selectedDate}
                    onChange={setSelectedDate}
                    availableDates={availableDates}
                    placeholder="选择日期"
                  />
                  
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={deepScan}
                      onChange={(e) => setDeepScan(e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    深度扫描（获取完整概念数据）
                  </label>
                  
                  <button
                    onClick={handleScan}
                    disabled={scanning}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    {scanning && (
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    )}
                    {scanning ? '扫描中...' : '开始扫描'}
                  </button>
                </div>

                {/* 统计卡片 */}
                {stats && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg p-4">
                      <div className="text-3xl font-bold text-blue-600">{stats.total}</div>
                      <div className="text-sm text-gray-600">候选标的</div>
                    </div>
                    <div className="bg-gradient-to-r from-red-50 to-red-100 rounded-lg p-4">
                      <div className="text-3xl font-bold text-red-600">{stats.leaderCount}</div>
                      <div className="text-sm text-gray-600">概念龙头</div>
                    </div>
                    <div className="bg-gradient-to-r from-green-50 to-green-100 rounded-lg p-4">
                      <div className="text-3xl font-bold text-green-600">{stats.avgConceptScore?.toFixed(1) || '-'}</div>
                      <div className="text-sm text-gray-600">平均概念分</div>
                    </div>
                    <div className="bg-gradient-to-r from-purple-50 to-purple-100 rounded-lg p-4">
                      <div className="text-3xl font-bold text-purple-600">{stats.avgTotalScore?.toFixed(1) || '-'}</div>
                      <div className="text-sm text-gray-600">平均总分</div>
                    </div>
                  </div>
                )}

                {/* 龙头列表 */}
                {leaders.length > 0 && (
                  <div className="bg-red-50 rounded-lg p-4">
                    <h3 className="text-lg font-semibold text-red-800 mb-3">🔥 今日概念龙头</h3>
                    <div className="flex flex-wrap gap-2">
                      {leaders.map((leader, idx) => (
                        <button
                          key={idx}
                          onClick={() => goToDetail(leader.stockCode)}
                          className="px-3 py-2 bg-white rounded-lg shadow-sm hover:shadow-md transition flex items-center gap-2"
                        >
                          <span className="font-medium text-gray-900">{leader.stockName}</span>
                          <span className="text-xs text-gray-500">{leader.conceptName}</span>
                          <span className={`text-sm font-medium ${leader.changePercent >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {leader.changePercent >= 0 ? '+' : ''}{leader.changePercent?.toFixed(2)}%
                          </span>
                          {leader.isLimitUp && <span className="text-xs bg-red-500 text-white px-1 rounded">涨停</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 候选标的列表 */}
                {loading ? (
                  <Loading />
                ) : error ? (
                  <ErrorMessage message={error} />
                ) : candidates.length === 0 ? (
                  <Empty message="暂无候选标的，请先执行扫描" />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">排序</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">代码</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">名称</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">主概念</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">龙头</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">涨幅</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">成交额</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">策略分</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">概念分</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">总分</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">风险</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {candidates.map((item, idx) => (
                          <tr key={idx} className="hover:bg-gray-50 cursor-pointer" onClick={() => goToDetail(item.stockCode)}>
                            <td className="px-4 py-3 text-sm font-medium">{idx+1}</td>
                            <td className="px-4 py-3 text-sm font-medium text-blue-600">{item.stockCode}</td>
                            <td className="px-4 py-3 text-sm text-gray-900">{item.stockName}</td>
                            <td className="px-4 py-3 text-sm text-center">
                              <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                                {item.primaryConcept || '-'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              {item.isConceptLeader ? (
                                <span className="text-red-500 font-bold">🔥</span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-right">
                              <span className={item.changePercent >= 0 ? 'text-red-600' : 'text-green-600'}>
                                {item.changePercent >= 0 ? '+' : ''}{item.changePercent?.toFixed(2)}%
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-gray-600">
                              {formatTurnover(item.turnover)}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${
                                item.conceptScore >= 40 ? 'bg-red-100 text-red-800' :
                                item.conceptScore >= 25 ? 'bg-orange-100 text-orange-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {item.conceptScore?.toFixed(0) || '-'}
                              </span>
                            </td><td className="px-4 py-3 text-center">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${
                                (Number(item.strategyScore) - item.conceptScore) >= 40 ? 'bg-red-100 text-red-800' :
                                (Number(item.strategyScore) - item.conceptScore) >= 25 ? 'bg-orange-100 text-orange-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {(Number(item.strategyScore) - item.conceptScore) || '-'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${
                                (item.strategyScore || 0) >= 80 ? 'bg-red-100 text-red-800' :
                                (item.strategyScore || 0) >= 70 ? 'bg-orange-100 text-orange-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {item.strategyScore?.toFixed(0) || '-'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`px-2 py-1 rounded text-xs ${
                                item.riskLevel === 'low' ? 'bg-green-100 text-green-800' :
                                item.riskLevel === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-red-100 text-red-800'
                              }`}>
                                {item.riskLevel === 'low' ? '低' : item.riskLevel === 'medium' ? '中' : '高'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ==================== 买入信号 Tab ==================== */}
            {activeTab === 'signal' && (
              <div className="space-y-6">
                {/* 筛选控制栏 */}
                <div className="flex items-center gap-4 flex-wrap">
                  <DatePicker
                    value={selectedDate}
                    onChange={setSelectedDate}
                    // availableDates={availableDates}
                    placeholder="选择日期"
                  />
                  
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={filterLeaderOnly}
                      onChange={(e) => setFilterLeaderOnly(e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    仅显示龙头
                  </label>
                  
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">最低总分:</span>
                    <input
                      type="number"
                      value={filterMinScore}
                      onChange={(e) => setFilterMinScore(Number(e.target.value))}
                      className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                      min={0}
                      max={100}
                    />
                  </div>
                  
                  <button
                    onClick={() => fetchSignals(selectedDate)}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2"
                  >
                    🔄 刷新
                  </button>
                </div>

                {/* 信号统计 */}
                {stats && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white border rounded-lg p-4 text-center">
                      <div className="text-3xl font-bold text-gray-900">{filteredCandidates.length}</div>
                      <div className="text-sm text-gray-500">可买入信号</div>
                    </div>
                    <div className="bg-white border rounded-lg p-4 text-center">
                      <div className="text-3xl font-bold text-red-600">
                        {filteredCandidates.filter(c => c.isConceptLeader).length}
                      </div>
                      <div className="text-sm text-gray-500">龙头标的</div>
                    </div>
                    <div className="bg-white border rounded-lg p-4 text-center">
                      <div className="text-3xl font-bold text-green-600">
                        {filteredCandidates.filter(c => c.riskLevel === 'low').length}
                      </div>
                      <div className="text-sm text-gray-500">低风险</div>
                    </div>
                    <div className="bg-white border rounded-lg p-4 text-center">
                      <div className="text-3xl font-bold text-blue-600">
                        {filteredCandidates.filter(c => (c.strategyScore || 0) >= 80).length}
                      </div>
                      <div className="text-sm text-gray-500">高评分(≥80)</div>
                    </div>
                  </div>
                )}

                {/* 买入信号列表 */}
                {loading ? (
                  <Loading />
                ) : error ? (
                  <ErrorMessage message={error} />
                ) : filteredCandidates.length === 0 ? (
                  <Empty message="暂无符合条件的买入信号" />
                ) : (
                  <div className="space-y-4">
                    {filteredCandidates.map((item, idx) => (
                      <div
                        key={idx}
                        className={`bg-white border rounded-lg p-4 hover:shadow-md transition cursor-pointer ${
                          item.isConceptLeader ? 'border-red-300 bg-red-50' : ''
                        }`}
                        onClick={() => goToDetail(item.stockCode)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="">{idx + 1}.</span>
                                <span className="font-bold text-lg text-gray-900">{item.stockName}</span>
                                <span className="text-sm text-gray-500">{item.stockCode}</span>
                                {item.isConceptLeader && (
                                  <span className="px-2 py-0.5 bg-red-500 text-white text-xs rounded">龙头</span>
                                )}
                                {item.isLimitUp && (
                                  <span className="px-2 py-0.5 bg-red-600 text-white text-xs rounded">涨停</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-sm text-blue-600">📌 {item.primaryConcept}</span>
                                {item.hitHotConcepts?.slice(0, 3).map((c, i) => (
                                  <span key={i} className="text-xs bg-gray-100 text-gray-600 px-1 rounded">{c}</span>
                                ))}
                              </div>
                            </div>
                          </div>
                          
                          <div className="text-right">
                            <div className={`text-2xl font-bold ${item.changePercent >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                              {item.changePercent >= 0 ? '+' : ''}{item.changePercent?.toFixed(2)}%
                            </div>
                            <div className="text-sm text-gray-500">¥{item.price?.toFixed(2)}</div>
                          </div>
                        </div>
                        
                        <div className="mt-3 flex items-center gap-4 text-sm">
                          <div className="flex items-center gap-1">
                            <span className="text-gray-500">总分:</span>
                            <span className={`font-bold ${
                              (item.strategyScore || 0) >= 80 ? 'text-red-600' : 
                              (item.strategyScore || 0) >= 70 ? 'text-orange-600' : 'text-gray-600'
                            }`}>{item.strategyScore?.toFixed(0)}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-gray-500">概念分:</span>
                            <span className="font-medium text-blue-600">{item.conceptScore?.toFixed(0)}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-gray-500">开盘强度分:</span>
                            <span className="font-medium text-blue-600">{item.openStrengthScore?.toFixed(0)}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-gray-500">竞价抢筹分:</span>
                            <span className="font-medium text-blue-600">{item.auctionScore?.toFixed(0)}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-gray-500">量比:</span>
                            <span className="font-medium">{item.volumeRatio?.toFixed(2)}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-gray-500">成交额:</span>
                            <span className="font-medium">{formatTurnover(item.turnover)}</span>
                          </div>
                          <div className={`px-2 py-0.5 rounded text-xs ${
                            item.riskLevel === 'low' ? 'bg-green-100 text-green-800' :
                            item.riskLevel === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {item.riskLevel === 'low' ? '低风险' : item.riskLevel === 'medium' ? '中风险' : '高风险'}
                          </div>
                        </div>
                        
                        {item.conceptScoreDetail && (
                          <div className="mt-2 text-xs text-gray-500">
                            评分明细: 热度{item.conceptScoreDetail.hotScore} + 强度{item.conceptScoreDetail.strengthScore} + 地位{item.conceptScoreDetail.positionScore}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ==================== 历史回测 Tab ==================== */}
            {activeTab === 'backtest' && (
              <div className="space-y-6">
                {/* 回测参数 */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-4">回测参数配置</h3>
                  
                  {/* 日期范围 */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">开始日期</label>
                      <input
                        type="date"
                        value={backtestStartDate}
                        onChange={(e) => setBacktestStartDate(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">结束日期</label>
                      <input
                        type="date"
                        value={backtestEndDate}
                        onChange={(e) => setBacktestEndDate(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">信号筛选</label>
                      <select
                        value={backtestConfig.signalFilter}
                        onChange={(e) => setBacktestConfig({ ...backtestConfig, signalFilter: e.target.value as any })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="leader_only">仅龙头</option>
                        <option value="high_score">高评分</option>
                        <option value="all">全部</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">最低总分</label>
                      <input
                        type="number"
                        value={backtestConfig.minTotalScore}
                        onChange={(e) => setBacktestConfig({ ...backtestConfig, minTotalScore: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  
                  {/* 交易参数 */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">标准仓位(元)</label>
                      <input
                        type="number"
                        value={backtestConfig.basePosition}
                        onChange={(e) => setBacktestConfig({ ...backtestConfig, basePosition: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">止损(%)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={backtestConfig.stopLossPercent * 100}
                        onChange={(e) => setBacktestConfig({ ...backtestConfig, stopLossPercent: Number(e.target.value) / 100 })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">止盈(%)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={backtestConfig.takeProfitPercent * 100}
                        onChange={(e) => setBacktestConfig({ ...backtestConfig, takeProfitPercent: Number(e.target.value) / 100 })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">最大持仓天数</label>
                      <input
                        type="number"
                        value={backtestConfig.maxHoldDays}
                        onChange={(e) => setBacktestConfig({ ...backtestConfig, maxHoldDays: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>

                {/* 执行按钮 */}
                <div className="flex justify-center">
                  <button
                    onClick={handleBacktest}
                    disabled={backtesting}
                    className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 text-lg"
                  >
                    {backtesting && (
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    )}
                    {backtesting ? '回测中...' : '🚀 开始回测'}
                  </button>
                </div>

                {/* 错误提示 */}
                {error && <ErrorMessage message={error} />}

                {/* 回测结果 */}
                {backtestResult && (
                  <div className="space-y-6">
                    {/* 统计概览 */}
                    <div className="bg-white rounded-lg shadow p-6">
                      <h3 className="text-lg font-semibold mb-4">📊 回测结果 - 主线共振策略</h3>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                        <div className="text-center p-4 bg-gray-50 rounded-lg">
                          <div className="text-2xl font-bold text-gray-900">{backtestResult.totalTrades}</div>
                          <div className="text-sm text-gray-500">总交易次数</div>
                        </div>
                        <div className="text-center p-4 bg-gray-50 rounded-lg">
                          <div className={`text-2xl font-bold ${backtestResult.winRate >= 50 ? 'text-red-600' : 'text-green-600'}`}>
                            {backtestResult.winRate}%
                          </div>
                          <div className="text-sm text-gray-500">胜率</div>
                        </div>
                        <div className="text-center p-4 bg-gray-50 rounded-lg">
                          <div className={`text-2xl font-bold ${backtestResult.totalProfitAmount >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {backtestResult.totalProfitAmount >= 0 ? '+' : ''}{backtestResult.totalProfitAmount?.toLocaleString()}元
                          </div>
                          <div className="text-sm text-gray-500">总收益</div>
                        </div>
                        <div className="text-center p-4 bg-gray-50 rounded-lg">
                          <div className={`text-2xl font-bold ${backtestResult.avgProfitPercent >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {backtestResult.avgProfitPercent >= 0 ? '+' : ''}{backtestResult.avgProfitPercent}%
                          </div>
                          <div className="text-sm text-gray-500">平均收益率</div>
                        </div>
                        <div className="text-center p-4 bg-gray-50 rounded-lg">
                          <div className="text-2xl font-bold text-gray-900">{backtestResult.profitLossRatio}</div>
                          <div className="text-sm text-gray-500">盈亏比</div>
                        </div>
                        <div className="text-center p-4 bg-gray-50 rounded-lg">
                          <div className="text-2xl font-bold text-orange-600">-{backtestResult.maxDrawdownPercent}%</div>
                          <div className="text-sm text-gray-500">最大回撤</div>
                        </div>
                      </div>

                      {/* 详细数据 */}
                      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-500">盈利次数:</span>
                          <span className="font-medium text-red-600">{backtestResult.winTrades}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">亏损次数:</span>
                          <span className="font-medium text-green-600">{backtestResult.lossTrades}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">平均盈利:</span>
                          <span className="font-medium text-red-600">+{backtestResult.avgWinPercent}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">平均亏损:</span>
                          <span className="font-medium text-green-600">{backtestResult.avgLossPercent}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">总投入资金:</span>
                          <span className="font-medium">{backtestResult.totalInvested?.toLocaleString()}元</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">平均持仓:</span>
                          <span className="font-medium">{backtestResult.avgHoldDays}天</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">最大连胜:</span>
                          <span className="font-medium">{backtestResult.maxConsecutiveWins}次</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">最大连亏:</span>
                          <span className="font-medium">{backtestResult.maxConsecutiveLosses}次</span>
                        </div>
                      </div>

                      {/* 龙头胜率 */}
                      {backtestResult.leaderWinRate !== undefined && (
                        <div className="mt-4 p-3 bg-red-50 rounded-lg">
                          <span className="text-sm text-gray-600">🔥 龙头标的胜率: </span>
                          <span className="font-bold text-red-600">{backtestResult.leaderWinRate}%</span>
                        </div>
                      )}
                    </div>

                    {/* 交易明细 */}
                    <div className="bg-white rounded-lg shadow overflow-hidden">
                      <div className="p-4 border-b flex items-center justify-between">
                        <h3 className="text-lg font-semibold">交易明细</h3>
                        <button
                          onClick={() => setShowTrades(!showTrades)}
                          className="text-sm text-blue-600 hover:text-blue-800"
                        >
                          {showTrades ? '收起' : `展开 (${backtestResult.trades?.length || 0} 笔)`}
                        </button>
                      </div>

                      {showTrades && backtestResult.trades && (
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">代码</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">名称</th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">概念</th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">龙头</th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">买入日</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">买入价</th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">卖出日</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">卖出价</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">收益率</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">收益额</th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">退出原因</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {backtestResult.trades.map((trade, index) => (
                                <tr key={index} className="hover:bg-gray-50">
                                  <td className="px-4 py-3 text-sm font-medium text-blue-600">{trade.stockCode}</td>
                                  <td className="px-4 py-3 text-sm text-gray-900">{trade.stockName}</td>
                                  <td className="px-4 py-3 text-sm text-center">
                                    <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                                      {trade.conceptName}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    {trade.isLeader ? '🔥' : '-'}
                                  </td>
                                  <td className="px-4 py-3 text-sm text-center text-gray-600">{trade.buyDate}</td>
                                  <td className="px-4 py-3 text-sm text-right text-gray-900">{trade.buyPrice?.toFixed(2)}</td>
                                  <td className="px-4 py-3 text-sm text-center text-gray-600">{trade.sellDate}</td>
                                  <td className="px-4 py-3 text-sm text-right text-gray-900">{trade.sellPrice?.toFixed(2)}</td>
                                  <td className="px-4 py-3 text-sm text-right">
                                    <span className={`font-medium ${trade.profitPercent >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                                      {trade.profitPercent >= 0 ? '+' : ''}{trade.profitPercent}%
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-sm text-right">
                                    <span className={`font-medium ${trade.profitAmount >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                                      {trade.profitAmount >= 0 ? '+' : ''}{trade.profitAmount?.toLocaleString()}
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
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default ConceptResonancePage;
