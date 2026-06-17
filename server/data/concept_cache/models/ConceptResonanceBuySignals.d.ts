/**
 * 主线共振（Concept Resonance）策略 - 买入信号数据模型
 *
 * 用于存储由 getBuySignalList 生成的买入信号数据
 */
import mongoose, { Document } from 'mongoose';
/**
 * 买入信号数据接口（与 ConceptResonance 相似，但用于存储信号）
 */
export interface IConceptResonanceBuySignal {
    _id?: string;
    date: string;
    stockCode: string;
    stockName: string;
    price: number;
    changePercent: number;
    volumeRatio: number;
    turnover: number;
    turnoverRate: number;
    industry: string;
    concept: string;
    status: 'pending' | 'success' | 'failed';
    amplitude?: number;
    upperShadow?: number;
    lowerShadow?: number;
    volumeRatioTo5Day?: number;
    aboveMa10?: boolean;
    is20DayHigh?: boolean;
    isBottomRising?: boolean;
    isLimitUp?: boolean;
    isFirstBoard?: boolean;
    continuousBoardCount?: number;
    limitUpReason?: string;
    marketSentimentScore?: number;
    marketLimitUpCount?: number;
    indexAboveMa20?: boolean;
    marketAdvice?: string;
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
    baseScore?: number;
    marketBonus?: number;
    boardBonus?: number;
    strategyScore?: number;
    betaCoefficient?: number;
    riskLevel?: 'low' | 'medium' | 'high';
    riskTags?: string[];
    openStrengthScore?: number;
    auctionScore?: number;
    openingTotalScore?: number;
    nextDay1Change?: number;
    nextDay2Change?: number;
    nextDay3Change?: number;
    maxProfitIn3Days?: number;
    maxLossIn3Days?: number;
}
export interface ConceptResonanceBuySignalDocument extends Omit<IConceptResonanceBuySignal, '_id'>, Document {
}
export declare const ConceptResonanceBuySignals: mongoose.Model<ConceptResonanceBuySignalDocument, {}, {}, {}, mongoose.Document<unknown, {}, ConceptResonanceBuySignalDocument, {}, {}> & ConceptResonanceBuySignalDocument & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
