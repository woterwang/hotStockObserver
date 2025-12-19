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

// ==========================================
// 主线共振策略 (Concept Resonance)
// ==========================================

// 概念信息
export interface ConceptInfo {
  code: string;
  name: string;
  changePercent: number;
  rank?: number;
  limitUpCount?: number;
  components?: { code: string; name: string }[];
}

// 主线共振候选标的
export interface ConceptResonance {
  _id?: string;
  date: string;
  stockCode: string;
  stockName: string;
  industry: string;
  concept: string;
  price: number;
  changePercent: number;
  volumeRatio: number;
  turnover: number;
  turnoverRate: number;
  
  // 概念共振字段
  hitHotConcepts: string[];           // 命中的热门概念列表
  primaryConcept?: string;            // 主概念名称
  isConceptLeader: boolean;           // 是否为概念龙头
  conceptScore: number;               // 概念共振得分
  conceptScoreDetail?: {              // 评分明细
    hotScore: number;                 // 热度分
    strengthScore: number;            // 强度分
    positionScore: number;            // 地位分
  };
  
  // 继承自 VolumeSurge 的字段
  amplitude?: number;
  upperShadow?: number;
  lowerShadow?: number;
  volumeRatioTo5Day?: number;
  isLimitUp?: boolean;
  isFirstBoard?: boolean;
  continuousBoardCount?: number;
  limitUpReason?: string;
  strategyScore?: number;
  baseScore?: number;
  marketBonus?: number;
  boardBonus?: number;
  riskLevel?: 'low' | 'medium' | 'high';
  
  // 状态
  status: 'pending' | 'success' | 'failed';
  nextDayOpen?: number;
  nextDayHigh?: number;
  nextDayLow?: number;
  nextDayClose?: number;
  profit?: number;
}

// 主线共振统计
export interface ConceptResonanceStats {
  total: number;
  leaderCount: number;               // 龙头数量
  avgConceptScore: number;           // 平均概念分
  avgTotalScore: number;             // 平均总分
  conceptDistribution: { name: string; count: number }[];  // 概念分布
  riskDistribution: {
    low: number;
    medium: number;
    high: number;
  };
}

// 概念龙头
export interface ConceptLeader {
  stockCode: string;
  stockName: string;
  conceptName: string;
  conceptScore: number;
  totalScore: number;
  changePercent: number;
  isLimitUp: boolean;
}

// 主线共振回测配置
export interface ConceptResonanceBacktestConfig {
  signalFilter: 'leader_only' | 'high_score' | 'all';  // 过滤条件
  minConceptScore: number;           // 最低概念分
  minTotalScore: number;             // 最低总分
  basePosition: number;              // 基础仓位
  stopLossPercent: number;           // 止损比例
  takeProfitPercent: number;         // 止盈比例
  maxHoldDays: number;               // 最大持仓天数
  leaderBonus: number;               // 龙头加仓比例
}

// 主线共振回测结果
export interface ConceptResonanceBacktestResult {
  startDate: string;
  endDate: string;
  config: ConceptResonanceBacktestConfig;
  totalTrades: number;
  winTrades: number;
  lossTrades: number;
  winRate: number;
  totalProfitAmount: number;
  totalProfitPercent: number;
  avgProfitPercent: number;
  avgWinPercent: number;
  avgLossPercent: number;
  profitLossRatio: number;
  totalInvested: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  maxProfit: number;
  maxLoss: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  avgHoldDays: number;
  leaderWinRate?: number;            // 龙头胜率
  conceptWinRates?: { concept: string; winRate: number; count: number }[];  // 各概念胜率
  trades: ConceptResonanceTradeRecord[];
}

// 主线共振交易记录
export interface ConceptResonanceTradeRecord {
  stockCode: string;
  stockName: string;
  conceptName: string;
  isLeader: boolean;
  conceptScore: number;
  totalScore: number;
  buyDate: string;
  buyPrice: number;
  sellDate: string;
  sellPrice: number;
  holdDays: number;
  position: number;
  profitPercent: number;
  profitAmount: number;
  exitReason: 'stop_loss' | 'take_profit' | 'max_days' | 'data_end';
}

