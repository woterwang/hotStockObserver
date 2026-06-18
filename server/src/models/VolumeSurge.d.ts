import mongoose, { Document } from 'mongoose';
export interface IVolumeSurge {
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
    strategyScore?: number;
    baseScore?: number;
    marketBonus?: number;
    boardBonus?: number;
    riskLevel?: 'low' | 'medium' | 'high';
    nextDay1Change?: number;
    nextDay2Change?: number;
    nextDay3Change?: number;
    maxProfitIn3Days?: number;
    maxLossIn3Days?: number;
}
export interface VolumeSurgeDocument extends Omit<IVolumeSurge, '_id'>, Document {
}
export declare const VolumeSurge: mongoose.Model<VolumeSurgeDocument, {}, {}, {}, mongoose.Document<unknown, {}, VolumeSurgeDocument, {}, {}> & VolumeSurgeDocument & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
