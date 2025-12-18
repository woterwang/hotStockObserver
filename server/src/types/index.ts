export interface Stock {
  code: string;
  name: string;
  market: string;
}

// HotStock 接口 - 数据库存储结构
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
  turnoverRate: number;
  rank: number;
  consecutiveDays: number;
  hotScore: number;
  sector: string;
  sectorCode: string;
  riseReason: string;
  concept: string[];
}

// MarketIndex 接口 - 市场指数
export interface MarketIndex {
  _id?: string;
  date: Date;
  indexCode: string;
  indexName: string;
  currentPoint: number;
  changePercent: number;
  changePoint: number;
  volume: number;
  turnover: number;
  high: number;
  low: number;
  open: number;
  preClose: number;
  amplitude: number;
}

// Sector 接口 - 板块数据
export interface Sector {
  _id?: string;
  date: Date;
  sectorCode: string;
  sectorName: string;
  changePercent: number;
  turnover: number;
  leadingStocks: string[];
  stockCount: number;
  riseCount: number;
  fallCount: number;
}

// StockNews 接口 - 股票新闻
export interface StockNews {
  _id?: string;
  stockCode: string;
  title: string;
  summary: string;
  content: string;
  source: string;
  url: string;
  publishTime: Date;
  sentiment: string;
  createdAt?: Date;
}

export interface HotStockData {
  code: string;
  name: string;
  market: string;
  rank: number;
  rankChange: number;
  hotValue: number;
  price: number;
  changePercent: number;
  turnoverRate: number;
  sector: string;
  conceptPlates: string[];
  consecutiveDays: number;
  tags: string[];
  fetchTime: Date;
  tradingDate: string;
}

export interface MarketIndexData {
  code: string;
  name: string;
  price: number;
  changePercent: number;
  changeAmount: number;
  volume: number;
  amount: number;
  fetchTime: Date;
}

export interface SectorData {
  name: string;
  changePercent: number;
  leadingStock: string;
  leadingStockChange: number;
  stockCount: number;
  fetchTime: Date;
}

export interface StockNewsData {
  stockCode: string;
  title: string;
  summary: string;
  source: string;
  publishTime: Date;
  url: string;
}

export interface THSHotStockResponse {
  status_code: number;
  status_msg: string;
  data: {
    stock_list: THSStockItem[];
  };
}

export interface THSStockItem {
  code: string;
  name: string;
  market: string;
  order: number;
  hot_value: string;
  rate: string;
  rise_and_fall: string;
}

export interface PeriodStats {
  stockCode: string;
  stockName: string;
  consecutiveDays: number;  // 连续上榜天数
  totalTurnover: number;
  avgTurnover: number;
  startPrice: number;
  endPrice: number;
  totalChangePercent: number;
  maxChangePercent: number;
  minChangePercent: number;
  avgRank: number;
  trendData: Array<{
    date: Date;
    price: number;
    changePercent: number;
    turnover: number;
    rank: number;
  }>;
}
