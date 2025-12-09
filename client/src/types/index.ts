// 股票基本信息
export interface Stock {
  stockCode: string;
  stockName: string;
  currentPrice: number;
  changePercent: number;
  changeAmount: number;
  volume: number;
  turnover: number;
  high?: number;
  low?: number;
  open?: number;
  preClose?: number;
}

// 热搜股票
export interface HotStock {
  _id?: string;
  date: string;
  stockCode: string;
  stockName: string;
  currentPrice: number;
  changePercent: number;
  changeAmount: number;
  volume: number;
  turnover: number;
  rank: number;
  consecutiveDays: number;
  hotScore: number;
  sector: string;
  sectorCode: string;
  riseReason: string;
  concept: string[];
}

// 大盘指数
export interface MarketIndex {
  indexCode: string;
  indexName: string;
  currentPoint: number;
  changePercent: number;
  changePoint: number;
  volume?: number;
  turnover?: number;
  high?: number;
  low?: number;
  open?: number;
  amplitude?: number;
}

// 板块信息
export interface Sector {
  _id?: string;
  sectorCode: string;
  sectorName: string;
  changePercent: number;
  turnover: number;
  leadingStocks: string[];
  stockCount?: number;
  riseCount?: number;
  fallCount?: number;
}

// 股票新闻
export interface StockNews {
  _id?: string;
  stockCode: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  publishTime: string;
  sentiment: 'positive' | 'negative' | 'neutral';
}

// K线数据
export interface KlineData {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  turnover: number;
  changePercent: number;
}

// 分时数据
export interface MinuteData {
  time: string;
  price: number;
  volume: number;
  avgPrice: number;
}

// 阶段统计
export interface PeriodStats {
  stockCode: string;
  stockName: string;
  consecutiveDays: number;
  totalTurnover: number;
  avgTurnover: number;
  startPrice: number;
  endPrice: number;
  totalChangePercent: number;
  maxChangePercent: number;
  minChangePercent: number;
  avgRank: number;
  trendData: {
    date: string;
    price: number;
    changePercent: number;
    turnover: number;
    rank: number;
  }[];
}

// 价格突破记录
export interface PriceBreakthrough {
  _id?: string;
  date: string;
  stockCode: string;
  stockName: string;
  currentPrice: number;
  changePercent: number;
  turnover: number;
  prevDayTurnover: number;
  turnoverRatio: number;
  high188: number;
  breakTime?: string;
  riseReason?: string;
  sector?: string;
  concept?: string[];
}

// 价格突破历史（按日期分组）
export interface BreakthroughHistory {
  date: string;
  count: number;
  stocks: PriceBreakthrough[];
}

// 市场概览
export interface MarketOverview {
  indices: MarketIndex[];
  hotStocks: HotStock[];
  sectors: Sector[];
  strongStocks: HotStock[];
  updateTime: string;
}

// 股票详情
export interface StockDetail {
  basic: HotStock | null;
  history: HotStock[];
  news: StockNews[];
}

// API响应
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  total?: number;
  page?: number;
  pageSize?: number;
}
