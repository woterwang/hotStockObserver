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

// 价格突破
export interface PriceBreakthrough {
  _id?: string;
  date: string;
  stockCode: string;
  stockName: string;
  industry: string;
  concept: string;
  price: number;
  changePercent: number;
  breakthroughPrice: number; // 突破价（day1最高价）
  day1Date: string;
  day1Change: number;
  day2Date: string;
  day2Change: number;
  day3Open: number;
  status: 'pending' | 'success' | 'failed'; // 状态：等待验证、成功获利、失败止损
  maxProfit?: number; // 最大获利
  holdDays?: number; // 持仓天数
}

export interface BreakthroughHistory {
  date: string;
  count: number;
  successCount: number;
  avgProfit: number;
  stocks: PriceBreakthrough[];
}

// 放量大涨
export interface VolumeSurge {
  _id?: string;
  date: string;
  stockCode: string;
  stockName: string;
  industry: string;
  concept: string;
  price: number;
  changePercent: number;
  volumeRatio: number; // 量比
  turnover: number; // 新增：成交额
  turnoverRate: number; // 换手率
  status: 'pending' | 'success' | 'failed';
  nextDayOpen?: number;
  nextDayHigh?: number;
  nextDayLow?: number;
  nextDayClose?: number;
  profit?: number;
  // 新增分析字段
  amplitude?: number; // 振幅
  upperShadow?: number; // 上影线
  lowerShadow?: number; // 下影线
  volumeRatioTo5Day?: number; // 量能倍数(相对5日均量)
  isLimitUp?: boolean; // 是否涨停
  isFirstBoard?: boolean; // 是否首板
  continuousBoardCount?: number; // 连板数
  limitUpReason?: string; // 涨停原因
  strategyScore?: number; // 策略总分
  baseScore?: number; // 基础分
  marketBonus?: number; // 市场加分
  boardBonus?: number; // 连板加分
  riskLevel?: 'low' | 'medium' | 'high'; // 风险等级
  marketSentimentScore?: number; // 市场情绪分
  marketLimitUpCount?: number; // 市场涨停数
  indexAboveMa20?: boolean; // 指数是否在MA20上方
  marketAdvice?: string; // 市场建议
}

// 放量大涨统计
export interface VolumeSurgeStats {
  total: number;
  highQualityCount: number;
  lowRiskCount: number;
  avgScore: number;
  maxScore: number;
  minScore: number;
  riskDistribution: {
    low: number;
    medium: number;
    high: number;
  };
  industryDistribution: { name: string; count: number }[];
  marketInfo: {
    sentiment: number;
    limitUpCount: number;
    indexAboveMa20: boolean;
    advice: string;
  };
}

export interface VolumeSurgeHistory {
  date: string;
  count: number;
  successCount: number;
  avgProfit: number;
  stocks: VolumeSurge[];
}

// 买入信号
export interface BuySignal {
  _id?: string;
  date: string;
  stockCode: string;
  stockName: string;
  
  // 策略关联
  strategyType: 'volume_surge' | 'breakthrough' | 'limit_up' | 'ma_crossover';
  strategyName: string;
  sourceId?: string;
  selectionDate: string;
  selectionScore: number;
  
  // 开盘信号指标
  openPrice: number;
  openChangePercent: number;
  openVolumeRatio: number;
  auctionAmount: number;
  auctionAmountRatio: number;
  
  // 大盘环境
  indexOpenChange: number;
  indexMorningTrend: 'up' | 'down' | 'flat';
  marketMood: number;
  
  // 板块联动
  sectorName: string;
  sectorOpenChange: number;
  sectorLimitUpCount: number;
  sectorLeader: boolean;
  
  // 承接力度
  isLimitUp: boolean;
  sealAmount?: number;
  sealRatio?: number;
  openTimes?: number;
  
  // 技术位置
  distanceToMa5: number;
  distanceToMa10: number;
  distanceToMa20: number;
  distanceToPressure: number;
  
  // 评分
  openStrengthScore: number;
  volumeConfirmScore: number;
  auctionScore: number;
  marketEnvScore: number;
  sectorLinkScore: number;
  sealStrengthScore: number;
  technicalScore: number;
  totalBuyScore: number;
  
  // 买入决策
  buySignal: 'strong_buy' | 'buy' | 'hold' | 'pass';
  suggestedPosition: number;
  suggestedPrice: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  buyReason: string;
  riskWarning: string[];
  
  // 跟踪
  executed: boolean;
  resultStatus: 'pending' | 'profit' | 'loss' | 'breakeven';
  day1CloseChange?: number;
  maxProfitIn3Days?: number;
  finalProfit?: number;
}

// 买入信号统计
export interface BuySignalStats {
  total: number;
  strongBuy: number;
  buy: number;
  hold: number;
  pass: number;
  avgScore: number;
}

// 市场情绪
export interface MarketSentiment {
  dateStr: string;
  limitUpCount: number;
  limitDownCount: number;
  upCount: number;
  downCount: number;
  upDownRatio: number;
  maxContinuousBoard: number;
  blastRate: number;
  score: number;
  level: 'high' | 'medium' | 'low' | 'extreme_low';
  advice: 'aggressive' | 'normal' | 'reduce' | 'pause';
}

// 市场情绪数据（来自 market_mood.json）
export interface MarketMood {
  day: string;      // 日期 YYYYMMDD
  strong: number;   // 大盘情绪（综合强度）0-100
  ztjs: number;     // 涨停家数
  lbgd: number;     // 连板高度
  dfNum: number;    // 大幅回撤数量
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
