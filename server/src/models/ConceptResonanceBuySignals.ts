/**
 * 主线共振（Concept Resonance）策略 - 买入信号数据模型
 * 
 * 用于存储由 getBuySignalList 生成的买入信号数据
 */
import mongoose, { Schema, Document } from 'mongoose';

/**
 * 买入信号数据接口（与 ConceptResonance 相似，但用于存储信号）
 */
export interface IConceptResonanceBuySignal {
  _id?: string;
  date: string;  // 信号日期 YYYYMMDD 格式
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
  
  // K线形态指标
  amplitude?: number;
  upperShadow?: number;
  lowerShadow?: number;
  volumeRatioTo5Day?: number;
  aboveMa10?: boolean;
  is20DayHigh?: boolean;
  isBottomRising?: boolean;
  
  // 首板/连板标记
  isLimitUp?: boolean;
  isFirstBoard?: boolean;
  continuousBoardCount?: number;
  limitUpReason?: string;
  
  // 市场环境指标
  marketSentimentScore?: number;
  marketLimitUpCount?: number;
  indexAboveMa20?: boolean;
  marketAdvice?: string;
  
  // 板块共振指标
  hitHotConcepts?: string[];
  primaryConcept?: string | null;
  isConceptLeader?: boolean;
  leaderInConcepts?: string[];
  conceptScore?: number;
  conceptScoreDetail?: {
    hotScore: number;
    strengthScore: number;
    positionScore: number;
  };
  conceptLimitUpCount?: number;
  conceptChangeRatio?: number;
  conceptRiseRatio?: number;
  
  // 策略评分
  baseScore?: number;
  marketBonus?: number;
  boardBonus?: number;
  strategyScore?: number;
  betaCoefficient?: number;
  riskLevel?: 'low' | 'medium' | 'high';
  riskTags?: string[];
  
  // 开盘数据相关字段
  openStrengthScore?: number;
  auctionScore?: number;
  openingTotalScore?: number;
  
  // 跟踪相关
  nextDay1Change?: number;
  nextDay2Change?: number;
  nextDay3Change?: number;
  maxProfitIn3Days?: number;
  maxLossIn3Days?: number;
}

export interface ConceptResonanceBuySignalDocument extends Omit<IConceptResonanceBuySignal, '_id'>, Document {}

const ConceptResonanceBuySignalSchema = new Schema<ConceptResonanceBuySignalDocument>(
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
    volumeRatioTo5Day: { type: Number, default: 0 },
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
    
    // 板块共振指标
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

// 复合索引：同一日期下同一股票只能有一条信号
ConceptResonanceBuySignalSchema.index({ date: 1, stockCode: 1 }, { unique: true });
// 评分索引
ConceptResonanceBuySignalSchema.index({ date: 1, strategyScore: -1 });

export const ConceptResonanceBuySignals =
  (mongoose.models.ConceptResonanceBuySignals as mongoose.Model<ConceptResonanceBuySignalDocument>) ||
  mongoose.model<ConceptResonanceBuySignalDocument>('ConceptResonanceBuySignals', ConceptResonanceBuySignalSchema);
