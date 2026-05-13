/**
 * 主线共振（Concept Resonance）策略 - 数据模型
 * 
 * 该策略在 VolumeSurge 基础上增加了板块共振维度
 */
import mongoose, { Schema, Document } from 'mongoose';

/**
 * 主线共振策略数据接口
 */
export interface IConceptResonance {
  _id?: string;
  date: string;  // 日期字符串 YYYYMMDD 格式
  stockCode: string;
  stockName: string;
  price: number;
  changePercent: number;
  volumeRatio: number;
  turnover: number;           // 成交额（亿）
  turnoverRate: number;       // 换手率 %
  industry: string;
  concept: string;
  status: 'pending' | 'success' | 'failed';
  
  // ========================================
  // K线形态指标（继承自 VolumeSurge）
  // ========================================
  amplitude?: number;         // 振幅 %
  upperShadow?: number;       // 上影线 %
  lowerShadow?: number;       // 下影线 %
  
  // 量能指标
  volumeRatioTo5Day?: number; // 成交量/5日均量 倍数
  
  // 趋势指标
  aboveMa10?: boolean;        // 是否站上10日均线
  is20DayHigh?: boolean;      // 是否创20日新高
  isBottomRising?: boolean;   // 今日低点是否高于5日最低价
  
  // ========================================
  // 首板/连板标记（继承自 VolumeSurge）
  // ========================================
  isLimitUp?: boolean;        // 是否涨停
  isFirstBoard?: boolean;     // 是否首板
  continuousBoardCount?: number;  // 连板天数
  limitUpReason?: string;     // 涨停原因/题材
  
  // ========================================
  // 市场环境指标（继承自 VolumeSurge）
  // ========================================
  marketSentimentScore?: number;  // 当日市场情绪评分 0-100
  marketLimitUpCount?: number;    // 当日全市场涨停数
  indexAboveMa20?: boolean;       // 上证指数是否站上20日均线
  marketAdvice?: string;          // 市场建议
  
  // ========================================
  // 🆕 板块共振指标（主线共振策略核心）
  // ========================================
  /** 命中的热点概念列表 */
  hitHotConcepts?: string[];
  /** 主概念名称 */
  primaryConcept?: string | null;
  /** 是否为板块龙头 */
  isConceptLeader?: boolean;
  /** 龙头所属概念列表 */
  leaderInConcepts?: string[];
  /** 板块共振评分 (0-60) */
  conceptScore?: number;
  /** 评分明细 */
  conceptScoreDetail?: {
    hotScore: number;       // 热度分 (0-20)
    strengthScore: number;  // 强度分 (0-15)
    positionScore: number;  // 地位分 (0-25)
  };
  /** 主概念涨停家数 */
  conceptLimitUpCount?: number;
  /** 主概念涨跌幅 */
  conceptChangeRatio?: number;
  /** 主概念上涨家数比例 */
  conceptRiseRatio?: number;
  
  // ========================================
  // 💯 策略评分
  // ========================================
  /** 量价基础评分 (0-100) - 来自原 VolumeSurge 逻辑 */
  baseScore?: number;
  /** 市场环境加分 (-20 ~ +15) */
  marketBonus?: number;
  /** 首板/连板加分 (0 ~ +15) */
  boardBonus?: number;
  /** 综合策略评分 = baseScore + marketBonus + boardBonus + conceptScore * beta */
  strategyScore?: number;
  /** β 调节系数 */
  betaCoefficient?: number;
  /** 风险等级 */
  riskLevel?: 'low' | 'medium' | 'high';
  /** 风险标签 */
  riskTags?: string[];
  
  // ========================================
  // 开盘数据相关字段
  // ========================================
  /** 开盘强度评分 */
  openStrengthScore?: number;
  /** 竞价抢筹评分 */
  auctionScore?: number;
  /** 开盘总评分 */
  openingTotalScore?: number;
  
  // ========================================
  // 跟踪相关
  // ========================================
  nextDay1Change?: number;    // T+1 涨跌幅
  nextDay2Change?: number;    // T+2 涨跌幅
  nextDay3Change?: number;    // T+3 涨跌幅
  maxProfitIn3Days?: number;  // 3日内最大涨幅
  maxLossIn3Days?: number;    // 3日内最大回撤
}

export interface ConceptResonanceDocument extends Omit<IConceptResonance, '_id'>, Document {}

const ConceptResonanceSchema = new Schema<ConceptResonanceDocument>(
  {
    date: { type: String, required: true, index: true },
    stockCode: { type: String, required: true, index: true },
    stockName: { type: String, required: true },
    price: { type: Number, required: true },
    changePercent: { type: Number, required: true },
    volumeRatio: { type: Number, required: true },
    turnover: { type: Number, default: 0 },
    turnoverRate: { type: Number, required: true },
    industry: { type: String, default: '' },
    concept: { type: String, default: '' },
    status: { type: String, enum: ['pending', 'success', 'failed'], default: 'pending' },
    
    // K线形态指标
    amplitude: { type: Number, default: 0 },
    upperShadow: { type: Number, default: 0 },
    lowerShadow: { type: Number, default: 0 },
    
    // 量能指标
    volumeRatioTo5Day: { type: Number, default: 0 },
    
    // 趋势指标
    aboveMa10: { type: Boolean, default: false },
    is20DayHigh: { type: Boolean, default: false },
    isBottomRising: { type: Boolean, default: false },
    
    // 首板/连板标记
    isLimitUp: { type: Boolean, default: false },
    isFirstBoard: { type: Boolean, default: false },
    continuousBoardCount: { type: Number, default: 0 },
    limitUpReason: { type: String, default: '' },
    
    // 市场环境指标
    marketSentimentScore: { type: Number, default: 0 },
    marketLimitUpCount: { type: Number, default: 0 },
    indexAboveMa20: { type: Boolean, default: false },
    marketAdvice: { type: String, default: 'normal' },
    
    // 🆕 板块共振指标
    hitHotConcepts: { type: [String], default: [] },
    primaryConcept: { type: String, default: null },
    isConceptLeader: { type: Boolean, default: false },
    leaderInConcepts: { type: [String], default: [] },
    conceptScore: { type: Number, default: 0 },
    conceptScoreDetail: {
      hotScore: { type: Number, default: 0 },
      strengthScore: { type: Number, default: 0 },
      positionScore: { type: Number, default: 0 },
    },
    conceptLimitUpCount: { type: Number, default: 0 },
    conceptChangeRatio: { type: Number, default: 0 },
    conceptRiseRatio: { type: Number, default: 0 },
    
    // 策略评分
    baseScore: { type: Number, default: 0 },
    marketBonus: { type: Number, default: 0 },
    boardBonus: { type: Number, default: 0 },
    strategyScore: { type: Number, default: 0 },
    betaCoefficient: { type: Number, default: 0.5 },
    riskLevel: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    riskTags: { type: [String], default: [] },
    
    // 开盘数据相关字段
    openStrengthScore: { type: Number, default: 0 },
    auctionScore: { type: Number, default: 0 },
    openingTotalScore: { type: Number, default: 0 },
    
    // 跟踪相关
    nextDay1Change: { type: Number },
    nextDay2Change: { type: Number },
    nextDay3Change: { type: Number },
    maxProfitIn3Days: { type: Number },
    maxLossIn3Days: { type: Number },
  },
  { timestamps: true }
);

// 复合索引
ConceptResonanceSchema.index({ date: 1, stockCode: 1 }, { unique: true });
// 评分索引（便于按评分排序查询）
ConceptResonanceSchema.index({ date: 1, strategyScore: -1 });
// 龙头索引（便于快速查询龙头股）
ConceptResonanceSchema.index({ date: 1, isConceptLeader: 1 });

export const ConceptResonance = mongoose.model<ConceptResonanceDocument>('ConceptResonance', ConceptResonanceSchema);