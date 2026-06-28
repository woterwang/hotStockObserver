import React, { useEffect, useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { Layout, Loading, ErrorMessage, Empty } from '../components';
import { backtestAnalysisApi } from '../services/api';
import type {
  BacktestResultData,
  BacktestResultFileItem,
  BacktestTradeRecord,
} from '../types';

interface GroupStat {
  label: string;
  count: number;
  winRate: number;
  avgProfitPercent: number;
  avgProfitAmount: number;
}

interface RangeBucket {
  label: string;
  min: number;
  max: number;
}

const EXIT_REASON_LABELS: Record<string, string> = {
  stop_loss: '止损',
  take_profit: '止盈',
  max_days: '持仓到期',
  market_panic: '市场恐慌',
  data_end: '数据结束',
};

const formatCompactDate = (raw: string): string => {
  if (raw.length === 8) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  }
  return raw;
};

const toNumberText = (value: number | undefined, digits = 2): string => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '-';
  }
  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
};

const toSignedPercent = (value: number | undefined): string => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '-';
  }
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(2)}%`;
};

const getValueColorClass = (value: number | undefined): string => {
  if (typeof value !== 'number') {
    return 'text-gray-700';
  }
  if (value > 0) {
    return 'text-red-500';
  }
  if (value < 0) {
    return 'text-green-600';
  }
  return 'text-gray-700';
};

const buildRangeStats = (
  trades: BacktestTradeRecord[],
  buckets: RangeBucket[],
  valueGetter: (trade: BacktestTradeRecord) => number | undefined
): GroupStat[] => {
  return buckets.map((bucket) => {
    const bucketTrades = trades.filter((trade) => {
      const value = valueGetter(trade);
      return typeof value === 'number' && value >= bucket.min && value < bucket.max;
    });

    const count = bucketTrades.length;
    if (count === 0) {
      return {
        label: bucket.label,
        count: 0,
        winRate: 0,
        avgProfitPercent: 0,
        avgProfitAmount: 0,
      };
    }

    const wins = bucketTrades.filter((trade) => trade.profitPercent > 0).length;
    const totalPercent = bucketTrades.reduce((sum, trade) => sum + trade.profitPercent, 0);
    const totalAmount = bucketTrades.reduce((sum, trade) => sum + trade.profitAmount, 0);

    return {
      label: bucket.label,
      count,
      winRate: (wins / count) * 100,
      avgProfitPercent: totalPercent / count,
      avgProfitAmount: totalAmount / count,
    };
  });
};

const BacktestAnalysisPage: React.FC = () => {
  const [fileList, setFileList] = useState<BacktestResultFileItem[]>([]);
  const [selectedFile, setSelectedFile] = useState('');
  const [result, setResult] = useState<BacktestResultData | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [loadingResult, setLoadingResult] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFileList = async () => {
    setLoadingFiles(true);
    setError(null);
    try {
      const response = await backtestAnalysisApi.getResultFiles();
      if (!response.success) {
        throw new Error(response.message || '加载回测文件列表失败');
      }

      const files = response.data;
      setFileList(files);

      if (files.length > 0) {
        setSelectedFile((current) => current || files[0].fileName);
      } else {
        setSelectedFile('');
        setResult(null);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingFiles(false);
    }
  };

  const fetchResultByFile = async (fileName: string) => {
    setLoadingResult(true);
    setError(null);
    try {
      const response = await backtestAnalysisApi.getResultByFile(fileName);
      if (!response.success) {
        throw new Error(response.message || '加载回测结果失败');
      }
      setResult(response.data);
    } catch (err) {
      setError((err as Error).message);
      setResult(null);
    } finally {
      setLoadingResult(false);
    }
  };

  useEffect(() => {
    fetchFileList();
  }, []);

  useEffect(() => {
    if (!selectedFile) {
      return;
    }
    fetchResultByFile(selectedFile);
  }, [selectedFile]);

  const trades = useMemo(() => result?.trades ?? [], [result]);

  const normalizedEquityCurve = useMemo(() => {
    const sortedTrades = [...trades].sort((a, b) => a.sellDate.localeCompare(b.sellDate));
    let cumulative = 0;
    return sortedTrades.map((trade) => {
      cumulative += trade.profitAmount;
      return {
        date: formatCompactDate(trade.sellDate),
        equity: Math.round(cumulative * 100) / 100,
      };
    });
  }, [trades]);

  const monthlyStats = useMemo(() => {
    const monthMap = new Map<string, { profitAmount: number; count: number; wins: number }>();

    trades.forEach((trade) => {
      if (trade.sellDate.length < 6) {
        return;
      }
      const monthKey = `${trade.sellDate.slice(0, 4)}-${trade.sellDate.slice(4, 6)}`;
      const current = monthMap.get(monthKey) ?? { profitAmount: 0, count: 0, wins: 0 };
      current.profitAmount += trade.profitAmount;
      current.count += 1;
      if (trade.profitPercent > 0) {
        current.wins += 1;
      }
      monthMap.set(monthKey, current);
    });

    return [...monthMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, stat]) => ({
        month,
        profitAmount: Math.round(stat.profitAmount * 100) / 100,
        winRate: stat.count > 0 ? (stat.wins / stat.count) * 100 : 0,
      }));
  }, [trades]);

  const profitDistribution = useMemo(() => {
    const bins: RangeBucket[] = [
      { label: '< -20%', min: Number.NEGATIVE_INFINITY, max: -20 },
      { label: '-20% ~ -10%', min: -20, max: -10 },
      { label: '-10% ~ -5%', min: -10, max: -5 },
      { label: '-5% ~ 0%', min: -5, max: 0 },
      { label: '0% ~ 5%', min: 0, max: 5 },
      { label: '5% ~ 10%', min: 5, max: 10 },
      { label: '10% ~ 20%', min: 10, max: 20 },
      { label: '20% ~ 40%', min: 20, max: 40 },
      { label: '>= 40%', min: 40, max: Number.POSITIVE_INFINITY },
    ];

    return bins.map((bin) => ({
      label: bin.label,
      count: trades.filter((trade) => trade.profitPercent >= bin.min && trade.profitPercent < bin.max).length,
    }));
  }, [trades]);

  const exitReasonStats = useMemo(() => {
    const reasonMap = new Map<string, BacktestTradeRecord[]>();
    trades.forEach((trade) => {
      const key = trade.exitReason || 'unknown';
      const list = reasonMap.get(key) ?? [];
      list.push(trade);
      reasonMap.set(key, list);
    });

    return [...reasonMap.entries()]
      .map(([reason, reasonTrades]) => {
        const count = reasonTrades.length;
        const wins = reasonTrades.filter((trade) => trade.profitPercent > 0).length;
        const totalPercent = reasonTrades.reduce((sum, trade) => sum + trade.profitPercent, 0);
        const totalAmount = reasonTrades.reduce((sum, trade) => sum + trade.profitAmount, 0);
        return {
          label: EXIT_REASON_LABELS[reason] || reason,
          count,
          winRate: count > 0 ? (wins / count) * 100 : 0,
          avgProfitPercent: count > 0 ? totalPercent / count : 0,
          avgProfitAmount: count > 0 ? totalAmount / count : 0,
        };
      })
      .sort((a, b) => b.count - a.count);
  }, [trades]);

  const holdDayStats = useMemo(() => {
    const buckets: RangeBucket[] = [
      { label: '1-2天', min: 1, max: 3 },
      { label: '3-5天', min: 3, max: 6 },
      { label: '6-10天', min: 6, max: 11 },
      { label: '>10天', min: 11, max: Number.POSITIVE_INFINITY },
    ];

    return buildRangeStats(trades, buckets, (trade) => trade.holdDays);
  }, [trades]);

  const scoreStats = useMemo(() => {
    const buckets: RangeBucket[] = [
      { label: '<30', min: Number.NEGATIVE_INFINITY, max: 30 },
      { label: '30-40', min: 30, max: 40 },
      { label: '40-50', min: 40, max: 50 },
      { label: '50-60', min: 50, max: 60 },
      { label: '>=60', min: 60, max: Number.POSITIVE_INFINITY },
    ];

    return buildRangeStats(trades, buckets, (trade) => trade.buySignalScore);
  }, [trades]);

  const moodStats = useMemo(() => {
    const buckets: RangeBucket[] = [
      { label: '<20', min: Number.NEGATIVE_INFINITY, max: 20 },
      { label: '20-40', min: 20, max: 40 },
      { label: '40-60', min: 40, max: 60 },
      { label: '60-80', min: 60, max: 80 },
      { label: '>=80', min: 80, max: Number.POSITIVE_INFINITY },
    ];

    return buildRangeStats(trades, buckets, (trade) => trade.marketMood);
  }, [trades]);

  const equityOption = useMemo(() => {
    return {
      tooltip: {
        trigger: 'axis',
      },
      grid: {
        left: '3%',
        right: '3%',
        top: '12%',
        bottom: '6%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: normalizedEquityCurve.map((item) => item.date),
      },
      yAxis: {
        type: 'value',
        name: '累计盈亏(元)',
      },
      series: [
        {
          name: '累计盈亏',
          type: 'line',
          smooth: true,
          data: normalizedEquityCurve.map((item) => item.equity),
          lineStyle: {
            width: 2,
            color: '#2563eb',
          },
          areaStyle: {
            color: 'rgba(37, 99, 235, 0.12)',
          },
        },
      ],
    };
  }, [normalizedEquityCurve]);

  const monthlyOption = useMemo(() => {
    return {
      tooltip: {
        trigger: 'axis',
      },
      grid: {
        left: '3%',
        right: '3%',
        top: '12%',
        bottom: '6%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: monthlyStats.map((item) => item.month),
      },
      yAxis: {
        type: 'value',
        name: '月度盈亏(元)',
      },
      series: [
        {
          name: '月度盈亏',
          type: 'bar',
          data: monthlyStats.map((item) => item.profitAmount),
          itemStyle: {
            color: '#0ea5e9',
          },
        },
      ],
    };
  }, [monthlyStats]);

  const distributionOption = useMemo(() => {
    return {
      tooltip: {
        trigger: 'axis',
      },
      grid: {
        left: '3%',
        right: '3%',
        top: '12%',
        bottom: '6%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: profitDistribution.map((item) => item.label),
      },
      yAxis: {
        type: 'value',
        name: '交易笔数',
      },
      series: [
        {
          name: '收益分布',
          type: 'bar',
          data: profitDistribution.map((item) => item.count),
          itemStyle: {
            color: '#14b8a6',
          },
        },
      ],
    };
  }, [profitDistribution]);

  const configSummary = useMemo(() => {
    if (!result) {
      return [] as Array<{ label: string; value: string }>;
    }

    const { config } = result;
    const summary: Array<{ label: string; value: string }> = [];

    if (typeof config.signalFilter === 'string') {
      summary.push({ label: '信号过滤', value: config.signalFilter });
    }
    if (typeof config.minSignalScore === 'number') {
      summary.push({ label: '最低信号分', value: `${config.minSignalScore}` });
    }
    if (typeof config.maxHoldDays === 'number') {
      summary.push({ label: '最大持仓天数', value: `${config.maxHoldDays}天` });
    }
    if (typeof config.stopLossPercent === 'number') {
      summary.push({ label: '止损比例', value: `${(config.stopLossPercent * 100).toFixed(2)}%` });
    }
    if (typeof config.takeProfitPercent === 'number') {
      summary.push({ label: '止盈比例', value: `${(config.takeProfitPercent * 100).toFixed(2)}%` });
    }
    if (typeof config.maxBuyCount === 'number') {
      summary.push({ label: '每日最多买入', value: `${config.maxBuyCount}只` });
    }

    return summary;
  }, [result]);

  const recentTrades = useMemo(() => {
    return [...trades]
      .sort((a, b) => b.buyDate.localeCompare(a.buyDate))
      .slice(0, 120);
  }, [trades]);

  const isPageLoading = loadingFiles || (loadingResult && !result);

  if (isPageLoading) {
    return (
      <Layout>
        <Loading text="正在加载回测结果分析..." />
      </Layout>
    );
  }

  if (error && !result) {
    return (
      <Layout>
        <ErrorMessage message={error} onRetry={fetchFileList} />
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">回测结果分析</h1>
            <p className="text-sm text-gray-500 mt-1">从 backtest_cache 加载历史结果，按收益、时间、风险与信号质量多维分析。</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedFile}
              onChange={(event) => setSelectedFile(event.target.value)}
              className="min-w-[320px] rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              disabled={fileList.length === 0}
            >
              {fileList.map((file) => (
                <option key={file.fileName} value={file.fileName}>
                  {file.fileName}
                </option>
              ))}
            </select>
            <button
              onClick={fetchFileList}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
            >
              刷新
            </button>
          </div>
        </div>

        {fileList.length === 0 ? (
          <div className="card">
            <Empty message="backtest_cache 暂无回测结果文件" />
          </div>
        ) : null}

        {result ? (
          <>
            <div className="card">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="text-sm text-gray-600">
                  区间: <span className="font-medium text-gray-900">{formatCompactDate(result.startDate)} ~ {formatCompactDate(result.endDate)}</span>
                </div>
                {selectedFile ? (
                  <div className="text-xs text-gray-500">
                    文件: {selectedFile}
                  </div>
                ) : null}
              </div>

              {configSummary.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {configSummary.map((item) => (
                    <span
                      key={item.label}
                      className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700"
                    >
                      {item.label}: {item.value}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
              <div className="card text-center">
                <div className="text-xs text-gray-500">总交易</div>
                <div className="text-xl font-bold text-gray-900">{result.totalTrades}</div>
              </div>
              <div className="card text-center">
                <div className="text-xs text-gray-500">胜率</div>
                <div className="text-xl font-bold text-red-500">{toNumberText(result.winRate)}%</div>
              </div>
              <div className="card text-center">
                <div className="text-xs text-gray-500">总收益率</div>
                <div className={`text-xl font-bold ${getValueColorClass(result.totalProfitPercent)}`}>{toSignedPercent(result.totalProfitPercent)}</div>
              </div>
              <div className="card text-center">
                <div className="text-xs text-gray-500">总收益额</div>
                <div className={`text-xl font-bold ${getValueColorClass(result.totalProfitAmount)}`}>{toNumberText(result.totalProfitAmount)}</div>
              </div>
              <div className="card text-center">
                <div className="text-xs text-gray-500">盈亏比</div>
                <div className="text-xl font-bold text-gray-900">{toNumberText(result.profitLossRatio)}</div>
              </div>
              <div className="card text-center">
                <div className="text-xs text-gray-500">最大回撤</div>
                <div className="text-xl font-bold text-green-600">{toNumberText(result.maxDrawdownPercent)}%</div>
              </div>
              <div className="card text-center">
                <div className="text-xs text-gray-500">平均持仓</div>
                <div className="text-xl font-bold text-gray-900">{toNumberText(result.avgHoldDays, 1)}天</div>
              </div>
              <div className="card text-center">
                <div className="text-xs text-gray-500">最大连亏</div>
                <div className="text-xl font-bold text-green-600">{result.maxConsecutiveLosses}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div className="card">
                <h3 className="card-header">累计权益曲线</h3>
                {normalizedEquityCurve.length > 0 ? (
                  <ReactECharts option={equityOption} style={{ height: '320px' }} />
                ) : (
                  <Empty message="暂无权益曲线数据" />
                )}
              </div>
              <div className="card">
                <h3 className="card-header">月度收益分布</h3>
                {monthlyStats.length > 0 ? (
                  <ReactECharts option={monthlyOption} style={{ height: '320px' }} />
                ) : (
                  <Empty message="暂无月度收益数据" />
                )}
              </div>
            </div>

            <div className="card">
              <h3 className="card-header">单笔收益区间分布</h3>
              {profitDistribution.length > 0 ? (
                <ReactECharts option={distributionOption} style={{ height: '300px' }} />
              ) : (
                <Empty message="暂无收益分布数据" />
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div className="card">
                <h3 className="card-header">维度一: 按退出原因</h3>
                <div className="overflow-x-auto">
                  <table className="stock-table">
                    <thead>
                      <tr>
                        <th>退出原因</th>
                        <th>样本数</th>
                        <th>胜率</th>
                        <th>平均收益率</th>
                        <th>平均收益额</th>
                      </tr>
                    </thead>
                    <tbody>
                      {exitReasonStats.map((item) => (
                        <tr key={item.label}>
                          <td>{item.label}</td>
                          <td>{item.count}</td>
                          <td>{toNumberText(item.winRate)}%</td>
                          <td className={getValueColorClass(item.avgProfitPercent)}>{toSignedPercent(item.avgProfitPercent)}</td>
                          <td className={getValueColorClass(item.avgProfitAmount)}>{toNumberText(item.avgProfitAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="card">
                <h3 className="card-header">维度二: 按持仓天数</h3>
                <div className="overflow-x-auto">
                  <table className="stock-table">
                    <thead>
                      <tr>
                        <th>持仓分组</th>
                        <th>样本数</th>
                        <th>胜率</th>
                        <th>平均收益率</th>
                        <th>平均收益额</th>
                      </tr>
                    </thead>
                    <tbody>
                      {holdDayStats.map((item) => (
                        <tr key={item.label}>
                          <td>{item.label}</td>
                          <td>{item.count}</td>
                          <td>{toNumberText(item.winRate)}%</td>
                          <td className={getValueColorClass(item.avgProfitPercent)}>{toSignedPercent(item.avgProfitPercent)}</td>
                          <td className={getValueColorClass(item.avgProfitAmount)}>{toNumberText(item.avgProfitAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="card">
                <h3 className="card-header">维度三: 按买入信号分</h3>
                <div className="overflow-x-auto">
                  <table className="stock-table">
                    <thead>
                      <tr>
                        <th>分数分组</th>
                        <th>样本数</th>
                        <th>胜率</th>
                        <th>平均收益率</th>
                        <th>平均收益额</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scoreStats.map((item) => (
                        <tr key={item.label}>
                          <td>{item.label}</td>
                          <td>{item.count}</td>
                          <td>{toNumberText(item.winRate)}%</td>
                          <td className={getValueColorClass(item.avgProfitPercent)}>{toSignedPercent(item.avgProfitPercent)}</td>
                          <td className={getValueColorClass(item.avgProfitAmount)}>{toNumberText(item.avgProfitAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="card">
                <h3 className="card-header">维度四: 按市场情绪分</h3>
                <div className="overflow-x-auto">
                  <table className="stock-table">
                    <thead>
                      <tr>
                        <th>情绪分组</th>
                        <th>样本数</th>
                        <th>胜率</th>
                        <th>平均收益率</th>
                        <th>平均收益额</th>
                      </tr>
                    </thead>
                    <tbody>
                      {moodStats.map((item) => (
                        <tr key={item.label}>
                          <td>{item.label}</td>
                          <td>{item.count}</td>
                          <td>{toNumberText(item.winRate)}%</td>
                          <td className={getValueColorClass(item.avgProfitPercent)}>{toSignedPercent(item.avgProfitPercent)}</td>
                          <td className={getValueColorClass(item.avgProfitAmount)}>{toNumberText(item.avgProfitAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="card">
              <h3 className="card-header">交易明细 (最新120笔)</h3>
              {recentTrades.length > 0 ? (
                <div className="overflow-x-auto max-h-[480px]">
                  <table className="stock-table">
                    <thead>
                      <tr>
                        <th>买入日期</th>
                        <th>卖出日期</th>
                        <th>股票</th>
                        <th>买入价</th>
                        <th>卖出价</th>
                        <th>持仓</th>
                        <th>收益率</th>
                        <th>收益额</th>
                        <th>退出原因</th>
                        <th>信号分</th>
                        <th>情绪</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentTrades.map((trade, index) => (
                        <tr key={`${trade.stockCode}-${trade.buyDate}-${index}`}>
                          <td>{formatCompactDate(trade.buyDate)}</td>
                          <td>{formatCompactDate(trade.sellDate)}</td>
                          <td>
                            <div className="font-medium">{trade.stockName}</div>
                            <div className="text-xs text-gray-500">{trade.stockCode}</div>
                          </td>
                          <td>{toNumberText(trade.buyPrice)}</td>
                          <td>{toNumberText(trade.sellPrice)}</td>
                          <td>{trade.holdDays}天</td>
                          <td className={getValueColorClass(trade.profitPercent)}>{toSignedPercent(trade.profitPercent)}</td>
                          <td className={getValueColorClass(trade.profitAmount)}>{toNumberText(trade.profitAmount)}</td>
                          <td>{EXIT_REASON_LABELS[trade.exitReason] || trade.exitReason}</td>
                          <td>{typeof trade.buySignalScore === 'number' ? toNumberText(trade.buySignalScore) : '-'}</td>
                          <td>{typeof trade.marketMood === 'number' ? toNumberText(trade.marketMood, 0) : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty message="暂无交易明细数据" />
              )}
            </div>
          </>
        ) : null}

        {error && result ? (
          <div className="card">
            <ErrorMessage message={error} onRetry={() => fetchResultByFile(selectedFile)} />
          </div>
        ) : null}
      </div>
    </Layout>
  );
};

export default BacktestAnalysisPage;
