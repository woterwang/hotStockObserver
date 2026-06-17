import mongoose, { Document } from 'mongoose';
/**
 * 市场情绪评分权重
 */
export declare const SENTIMENT_WEIGHTS: {
    limitUp: number;
    limitDown: number;
    upDownRatio: number;
    maxBoard: number;
};
/**
 * 市场情绪等级
 */
export type SentimentLevel = 'high' | 'medium' | 'low' | 'extreme_low';
/**
 * 交易建议
 */
export type TradingAdvice = 'normal' | 'reduce' | 'pause' | 'aggressive';
/**
 * 市场情绪接口
 */
export interface IMarketSentiment {
    _id?: string;
    date: Date;
    dateStr: string;
    limitUpCount: number;
    limitDownCount: number;
    upCount: number;
    downCount: number;
    flatCount: number;
    upDownRatio: number;
    maxContinuousBoard: number;
    board2Count: number;
    board3Count: number;
    limitUpOpenCount: number;
    blastRate: number;
    northMoney?: number;
    mainNetInflow?: number;
    score: number;
    level: SentimentLevel;
    advice: TradingAdvice;
    notes?: string;
}
export interface MarketSentimentDocument extends Omit<IMarketSentiment, '_id'>, Document {
}
export declare const MarketSentiment: mongoose.Model<MarketSentimentDocument, {}, {}, {}, mongoose.Document<unknown, {}, MarketSentimentDocument, {}, {}> & MarketSentimentDocument & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
/**
 * 计算情绪评分
 */
export declare function calculateSentimentScore(data: {
    limitUpCount: number;
    limitDownCount: number;
    upDownRatio: number;
    maxContinuousBoard: number;
    blastRate?: number;
}): {
    score: number;
    level: SentimentLevel;
    advice: TradingAdvice;
};
