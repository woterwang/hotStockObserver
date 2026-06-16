import mongoose, { Schema, Document } from 'mongoose';

/**
 * 市场情绪评分权重
 */
export const SENTIMENT_WEIGHTS = {
  limitUp: 0.30,      // 涨停数权重
  limitDown: 0.20,    // 跌停数权重
  upDownRatio: 0.25,  // 涨跌比权重
  maxBoard: 0.25,     // 最高连板权重
};

/**
 * 市场情绪等级
 */
export type SentimentLevel = 'high' | 'medium' | 'low' | 'extreme_low';

/**
 * 交易建议
 */
export type TradingAdvice = 
  | 'normal'        // 正常交易
  | 'reduce'        // 降低仓位
  | 'pause'         // 暂停交易
  | 'aggressive';   // 激进加仓

/**
 * 市场情绪接口
 */
export interface IMarketSentiment {
  _id?: string;
  
  // 日期
  date: Date;
  dateStr: string;           // YYYYMMDD 格式
  
  // 核心数据
  limitUpCount: number;      // 涨停数（非ST、非北交所）
  limitDownCount: number;    // 跌停数（非ST、非北交所）
  upCount: number;           // 上涨家数
  downCount: number;         // 下跌家数
  flatCount: number;         // 平盘家数
  upDownRatio: number;       // 涨跌比 = 上涨/下跌
  
  // 连板数据
  maxContinuousBoard: number;  // 最高连板数
  board2Count: number;         // 2连板数量
  board3Count: number;         // 3连板及以上数量
  
  // 炸板数据
  limitUpOpenCount: number;    // 曾涨停（涨停后打开）
  blastRate: number;           // 炸板率 = 曾涨停 / (涨停+曾涨停) * 100
  
  // 资金流向
  northMoney?: number;         // 北向资金净流入（亿元）
  mainNetInflow?: number;      // 主力净流入（亿元）
  
  // 评分
  score: number;               // 综合评分 0-100
  level: SentimentLevel;       // 情绪等级
  advice: TradingAdvice;       // 交易建议
  
  // 备注
  notes?: string;
}

export interface MarketSentimentDocument extends Omit<IMarketSentiment, '_id'>, Document {}

const MarketSentimentSchema = new Schema<MarketSentimentDocument>(
  {
    date: {
      type: Date,
      required: true,
      index: true,
    },
    dateStr: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    
    // 核心数据
    limitUpCount: { type: Number, default: 0 },
    limitDownCount: { type: Number, default: 0 },
    upCount: { type: Number, default: 0 },
    downCount: { type: Number, default: 0 },
    flatCount: { type: Number, default: 0 },
    upDownRatio: { type: Number, default: 1 },
    
    // 连板数据
    maxContinuousBoard: { type: Number, default: 0 },
    board2Count: { type: Number, default: 0 },
    board3Count: { type: Number, default: 0 },
    
    // 炸板数据
    limitUpOpenCount: { type: Number, default: 0 },
    blastRate: { type: Number, default: 0 },
    
    // 资金流向
    northMoney: { type: Number },
    mainNetInflow: { type: Number },
    
    // 评分
    score: { type: Number, default: 50 },
    level: {
      type: String,
      enum: ['high', 'medium', 'low', 'extreme_low'],
      default: 'medium',
    },
    advice: {
      type: String,
      enum: ['normal', 'reduce', 'pause', 'aggressive'],
      default: 'normal',
    },
    
    notes: { type: String, default: '' },
  },
  {
    timestamps: true,
  }
);

export const MarketSentiment = mongoose.model<MarketSentimentDocument>(
  'MarketSentiment',
  MarketSentimentSchema
);

/**
 * 计算情绪评分
 */
export function calculateSentimentScore(data: {
  limitUpCount: number;
  limitDownCount: number;
  upDownRatio: number;
  maxContinuousBoard: number;
  blastRate?: number;
}): {
  score: number;
  level: SentimentLevel;
  advice: TradingAdvice;
} {
  let score = 50; // 基准分

  // === 涨停数评分 (权重30%) ===
  if (data.limitUpCount >= 100) {
    score += 25;
  } else if (data.limitUpCount >= 80) {
    score += 20;
  } else if (data.limitUpCount >= 60) {
    score += 15;
  } else if (data.limitUpCount >= 40) {
    score += 5;
  } else if (data.limitUpCount >= 20) {
    score -= 5;
  } else {
    score -= 15;
  }

  // === 跌停数评分 (权重20%) ===
  if (data.limitDownCount >= 50) {
    score -= 20;
  } else if (data.limitDownCount >= 30) {
    score -= 15;
  } else if (data.limitDownCount >= 15) {
    score -= 5;
  } else if (data.limitDownCount <= 5) {
    score += 5;
  }

  // === 涨跌比评分 (权重25%) ===
  if (data.upDownRatio >= 4) {
    score += 20;
  } else if (data.upDownRatio >= 3) {
    score += 15;
  } else if (data.upDownRatio >= 2) {
    score += 10;
  } else if (data.upDownRatio >= 1) {
    score += 0;
  } else if (data.upDownRatio >= 0.5) {
    score -= 10;
  } else {
    score -= 20;
  }

  // === 连板高度评分 (权重25%) ===
  if (data.maxContinuousBoard >= 10) {
    score += 15;
  } else if (data.maxContinuousBoard >= 7) {
    score += 12;
  } else if (data.maxContinuousBoard >= 5) {
    score += 8;
  } else if (data.maxContinuousBoard >= 3) {
    score += 0;
  } else {
    score -= 10;
  }

  // === 炸板率惩罚 ===
  if (data.blastRate !== undefined) {
    if (data.blastRate >= 50) {
      score -= 10;
    } else if (data.blastRate >= 30) {
      score -= 5;
    }
  }

  // 限制在 0-100 范围
  score = Math.max(0, Math.min(100, score));

  // 确定等级
  let level: SentimentLevel;
  let advice: TradingAdvice;

  if (score >= 70) {
    level = 'high';
    advice = 'aggressive';
  } else if (score >= 55) {
    level = 'medium';
    advice = 'normal';
  } else if (score >= 40) {
    level = 'low';
    advice = 'reduce';
  } else {
    level = 'extreme_low';
    advice = 'pause';
  }

  return { score, level, advice };
}
