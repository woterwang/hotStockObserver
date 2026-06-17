/**
 * 主线共振（Concept Resonance）策略 - 数据模型
 *
 * 该策略在 VolumeSurge 基础上增加了板块共振维度
 */
import mongoose, { Document } from 'mongoose';
/**
 * 主线共振策略数据接口
 */
export interface IConceptResonance {
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
        hotScore: number;
        strengthScore: number;
        positionScore: number;
    };
    /** 主概念涨停家数 */
    conceptLimitUpCount?: number;
    /** 主概念涨跌幅 */
    conceptChangeRatio?: number;
    /** 主概念上涨家数比例 */
    conceptRiseRatio?: number;
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
    /** 开盘强度评分 */
    openStrengthScore?: number;
    /** 竞价抢筹评分 */
    auctionScore?: number;
    /** 开盘总评分 */
    openingTotalScore?: number;
    nextDay1Change?: number;
    nextDay2Change?: number;
    nextDay3Change?: number;
    maxProfitIn3Days?: number;
    maxLossIn3Days?: number;
}
export interface ConceptResonanceDocument extends Omit<IConceptResonance, '_id'>, Document {
}
export declare const ConceptResonance: mongoose.Model<ConceptResonanceDocument, {}, {}, {}, mongoose.Document<unknown, {}, ConceptResonanceDocument, {}, {}> & ConceptResonanceDocument & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
