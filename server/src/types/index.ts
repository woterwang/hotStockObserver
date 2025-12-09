export interface Stock {
  code: string;
  name: string;
  market: string;
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
