import axios from 'axios';
import type { 
  ApiResponse, 
  MarketOverview, 
  HotStock, 
  PeriodStats, 
  StockDetail,
  MarketIndex,
  Sector,
  StockNews 
} from '../types';

// 创建axios实例
const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
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

export default api;
