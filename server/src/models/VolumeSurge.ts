import mongoose, { Schema, Document } from 'mongoose';

export interface IVolumeSurge {
  _id?: string;
  date: string;  // 日期字符串 YYYYMMDD 格式，避免时区问题
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
  // 🚀 强势资金突破策略 - 新增字段
  // ========================================
  
  // K线形态指标
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
  // 🔥 进阶优化 - 首板/连板标记
  // ========================================
  isLimitUp?: boolean;        // 是否涨停
  isFirstBoard?: boolean;     // 是否首板（今日首次涨停，非连板）
  continuousBoardCount?: number;  // 连板天数（0=非连板，1=首板，2=2连板...）
  limitUpReason?: string;     // 涨停原因/题材
  
  // ========================================
  // 🌡️ 市场环境指标
  // ========================================
  marketSentimentScore?: number;  // 当日市场情绪评分 0-100
  marketLimitUpCount?: number;    // 当日全市场涨停数
  indexAboveMa20?: boolean;       // 上证指数是否站上20日均线
  marketAdvice?: string;          // 市场建议 (normal/reduce/pause/aggressive)
  
  // ========================================
  // 💯 策略评分（用于排序）
  // ========================================
  strategyScore?: number;         // 综合评分 0-100
  baseScore?: number;             // 基础评分（K线+量能）
  marketBonus?: number;           // 市场环境加分
  boardBonus?: number;            // 首板/连板加分
  riskLevel?: 'low' | 'medium' | 'high';  // 风险等级
  
  // 跟踪相关
  nextDay1Change?: number;    // T+1 涨跌幅
  nextDay2Change?: number;    // T+2 涨跌幅
  nextDay3Change?: number;    // T+3 涨跌幅
  maxProfitIn3Days?: number;  // 3日内最大涨幅
  maxLossIn3Days?: number;    // 3日内最大回撤
}

export interface VolumeSurgeDocument extends Omit<IVolumeSurge, '_id'>, Document {}

const VolumeSurgeSchema = new Schema<VolumeSurgeDocument>(
  {
    date: { type: String, required: true, index: true },  // YYYYMMDD 格式
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
    
    // 策略评分
    strategyScore: { type: Number, default: 0 },
    baseScore: { type: Number, default: 0 },
    marketBonus: { type: Number, default: 0 },
    boardBonus: { type: Number, default: 0 },
    riskLevel: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    
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
VolumeSurgeSchema.index({ date: 1, stockCode: 1 }, { unique: true });

export const VolumeSurge = mongoose.model<VolumeSurgeDocument>('VolumeSurge', VolumeSurgeSchema);
