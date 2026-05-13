import axios from 'axios';
import type { 
  ApiResponse, 
  MarketOverview, 
  HotStock, 
  PeriodStats, 
  StockDetail,
  MarketIndex,
  Sector,
  StockNews,
  PriceBreakthrough,
  BreakthroughHistory,
  VolumeSurge,
  VolumeSurgeHistory,
  VolumeSurgeStats,
  BuySignal,
  BuySignalStats,
  MarketSentiment,
  MarketMood,
  RecentAverageMood,
  ConceptResonance,
  ConceptResonanceStats,
  ConceptLeader,
  ConceptResonanceBacktestResult,
  ConceptResonanceBacktestConfig,
  ThsConceptHotRankResult
} from '../types';

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.message || error.message || fallback;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
};

// 创建axios实例
const api = axios.create({
  baseURL: '/api',
  timeout: 0,  // 不设置超时，等待直到响应或报错
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器
api.interceptors.request.use(
  (config) => {
    // 可以在这里添加token等
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器
api.interceptors.response.use(
  (response) => {
    return response.data;
  },
  (error) => {
    console.error('API Error:', error);
    return Promise.reject(error);
  }
);

/**
 * 股票相关API
 */
export const stockApi = {
  // 获取市场概览
  getOverview: (): Promise<ApiResponse<MarketOverview>> => {
    return api.get('/market/overview');
  },

  // 获取热搜股票列表
  getHotStocks: (params?: { limit?: number; date?: string }): Promise<ApiResponse<HotStock[]>> => {
    return api.get('/stocks/hot', { params });
  },

  // 获取阶段统计
  getPeriodStats: (days: number = 7): Promise<ApiResponse<PeriodStats[]>> => {
    return api.get('/stocks/period-stats', { params: { days } });
  },

  // 获取股票详情
  getStockDetail: (code: string): Promise<ApiResponse<StockDetail>> => {
    return api.get(`/stocks/${code}`);
  },

  // 获取股票历史记录
  getStockHistory: (code: string, days: number = 30): Promise<ApiResponse<HotStock[]>> => {
    return api.get(`/stocks/${code}/history`, { params: { days } });
  },

  // 获取股票新闻
  getStockNews: (code: string, limit: number = 20): Promise<ApiResponse<StockNews[]>> => {
    return api.get(`/stocks/${code}/news`, { params: { limit } });
  },

  // 获取强势股
  getStrongStocks: (minChange: number = 5, limit: number = 10): Promise<ApiResponse<HotStock[]>> => {
    return api.get('/stocks/strong', { params: { minChange, limit } });
  },

  // 搜索股票
  searchStocks: (keyword: string): Promise<ApiResponse<HotStock[]>> => {
    return api.get('/stocks/search', { params: { keyword } });
  },
};

/**
 * 市场相关API
 */
export const marketApi = {
  // 获取大盘指数
  getIndices: (date?: string): Promise<ApiResponse<MarketIndex[]>> => {
    return api.get('/market/indices', { params: { date } });
  },

  // 获取热门板块
  getHotSectors: (limit: number = 10): Promise<ApiResponse<Sector[]>> => {
    return api.get('/market/sectors', { params: { limit } });
  },
  
  /**
   * 获取历史概念热度排行
   */
  getHistoryConceptRank: async (date: string, type: 'concept' | 'industry' = 'concept'): Promise<ApiResponse<ThsConceptHotRankResult>> => {
    try {
      const response = await axios.get(`/api/market/concepts/history/${date}/${type}`);
      return response.data;
    } catch (error) {
      console.error('获取历史概念热度排行失败:', error);
      throw new Error(getErrorMessage(error, '获取历史概念热度排行失败'));
    }
  },

  /**
   * 获取可用的历史数据日期列表
   */
  getHistoryConceptDates: async (): Promise<ApiResponse<string[]>> => {
    try {
      const response = await axios.get('/api/market/concepts/history/dates');
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error, '获取历史数据日期列表失败'));
    }
  }
};

/**
 * 市场情绪数据API
 */
export const moodApi = {
  // 获取指定日期的情绪数据
  getByDate: (dateStr: string): Promise<ApiResponse<MarketMood>> => {
    return api.get(`/market/mood/${dateStr}`);
  },

  // 获取最新的情绪数据
  getLatest: (): Promise<ApiResponse<MarketMood>> => {
    return api.get('/market/mood');
  },

  // 获取最近N个交易日的平均情绪数据
  getRecentAverage: (days: number = 5, fromDate?: string): Promise<ApiResponse<RecentAverageMood>> => {
    const params = new URLSearchParams({ days: String(days) });
    if (fromDate) params.set('fromDate', fromDate);
    return api.get(`/market/mood/recent-average?${params.toString()}`);
  },
};

/**
 * 管理相关API
 */
export const adminApi = {
  // 手动更新数据
  manualUpdate: (): Promise<ApiResponse<{ message: string }>> => {
    return api.post('/admin/update');
  },
};

/**
 * 价格突破相关API
 */
export const breakthroughApi = {
  // 手动触发扫描
  scan: (date?: string): Promise<ApiResponse<{ count: number }>> => {
    return api.post('/breakthrough/scan', { date });
  },

  // 获取突破列表
  getList: (date?: string, limit: number = 50): Promise<ApiResponse<PriceBreakthrough[]>> => {
    return api.get('/breakthrough/list', { params: { date, limit } });
  },

  // 获取历史记录
  getHistory: (days: number = 30): Promise<ApiResponse<BreakthroughHistory[]>> => {
    return api.get('/breakthrough/history', { params: { days } });
  },

  // 获取可用日期列表
  getDates: (): Promise<ApiResponse<string[]>> => {
    return api.get('/breakthrough/dates');
  },
};

/**
 * 放量大涨API
 */
export const volumeSurgeApi = {
  // 手动触发扫描
  scan: (date?: string): Promise<ApiResponse<{ count: number }>> => {
    return api.post('/volume-surge/scan', { date });
  },

  // 获取列表
  getList: (date?: string): Promise<ApiResponse<VolumeSurge[]>> => {
    return api.get('/volume-surge/list', { params: { date } });
  },

  // 获取历史记录
  getHistory: (days: number = 30): Promise<ApiResponse<VolumeSurgeHistory[]>> => {
    return api.get('/volume-surge/history', { params: { days } });
  },

  // 获取可用日期列表
  getDates: (): Promise<ApiResponse<string[]>> => {
    return api.get('/volume-surge/dates');
  },

  // 获取统计数据
  getStats: (date?: string): Promise<ApiResponse<VolumeSurgeStats>> => {
    return api.get('/volume-surge/stats', { params: { date } });
  },
};

/**
 * 买入信号API
 */
export const buySignalApi = {
  // 生成买入信号
  generate: (date?: string): Promise<ApiResponse<{ count: number; signals: BuySignal[] }>> => {
    return api.post('/buy-signal/generate', { date });
  },

  // 批量生成历史日期买入信号
  batchGenerate: (startDate: string, endDate: string): Promise<ApiResponse<{
    totalDays: number;
    successDays: number;
    failedDays: number;
    totalGenerated: number;
    details: { date: string; count: number; error?: string }[];
  }>> => {
    return api.post('/buy-signal/batch-generate', { startDate, endDate });
  },

  // 获取可用日期列表
  getAvailableDates: (): Promise<ApiResponse<{ date: string; hasSignal: boolean; surgeCount: number }[]>> => {
    return api.get('/buy-signal/available-dates');
  },

  // 获取信号列表
  getList: (date?: string, signal?: string): Promise<ApiResponse<BuySignal[]>> => {
    return api.get('/buy-signal/list', { params: { date, signal } });
  },

  // 获取统计数据
  getStats: (date?: string): Promise<ApiResponse<BuySignalStats>> => {
    return api.get('/buy-signal/stats', { params: { date } });
  },

  // 删除指定日期的买入信号数据
  deleteByDate: (dateStr: string): Promise<ApiResponse<{ message: string }>> => {
    return api.delete('/buy-signal/deleteByDate', { params: { date: dateStr } });
  },
};

/**
 * 市场情绪API
 */
export const sentimentApi = {
  // 获取指定日期情绪数据
  getByDate: (dateStr: string): Promise<ApiResponse<MarketSentiment>> => {
    console.log('Fetching sentiment for date:', dateStr);
    return api.get(`/sentiment/date/${dateStr}`);
  },

  // 获取最近N天情绪数据
  getRecent: (days: number = 30): Promise<ApiResponse<{ count: number; sentiments: MarketSentiment[] }>> => {
    return api.get('/sentiment/recent', { params: { days } });
  },

  // 获取情绪趋势
  getTrend: (days: number = 5): Promise<ApiResponse<any>> => {
    return api.get('/sentiment/trend', { params: { days } });
  },

  // 获取交易建议
  getAdvice: (date?: string): Promise<ApiResponse<{ date: string; shouldExecute: boolean; reason: string }>> => {
    return api.get('/sentiment/advice', { params: { date } });
  },

  // 手动触发获取情绪数据
  fetch: (date?: string): Promise<ApiResponse<MarketSentiment>> => {
    return api.post('/sentiment/fetch', { date });
  },
};

/**
 * 主线共振策略API (Concept Resonance)
 */
export const conceptResonanceApi = {
  // 手动触发扫描
  scan: (date?: string, deep?: boolean): Promise<ApiResponse<{ count: number; leaders: number }>> => {
    return api.post('/concept-resonance/scan', { date, deep });
  },

  // 获取候选标的列表
  getList: (date?: string, leaderOnly?: boolean,filter?:string): Promise<ApiResponse<ConceptResonance[]>> => {
    return api.get('/concept-resonance/list', { params: { date, leaderOnly ,filter, _t: Date.now() } });
  },

  // 获取统计数据
  getStats: (date?: string): Promise<ApiResponse<ConceptResonanceStats>> => {
    return api.get('/concept-resonance/stats', { params: { date , _t: Date.now()} });
  },

  // 获取概念龙头
  getLeaders: (date?: string): Promise<ApiResponse<ConceptLeader[]>> => {
    return api.get('/concept-resonance/leaders', { params: { date , _t: Date.now()} });
  },

  // 获取可用日期列表
  getDates: (): Promise<ApiResponse<string[]>> => {
    return api.get('/concept-resonance/dates');
  },

  // 获取配置
  getConfig: (): Promise<ApiResponse<any>> => {
    return api.get('/concept-resonance/config');
  },

  // 清除数据
  clear: (date?: string): Promise<ApiResponse<{ deleted: number }>> => {
    return api.delete('/concept-resonance/clear', { params: { date } });
  },

  // 回测
  backtest: (
    startDate: string, 
    endDate: string, 
    config: Partial<ConceptResonanceBacktestConfig>
  ): Promise<ApiResponse<ConceptResonanceBacktestResult>> => {
    return api.post('/concept-resonance/backtest', { startDate, endDate, config });
  },
};

export default api;
