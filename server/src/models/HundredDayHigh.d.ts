import mongoose, { Document } from 'mongoose';
export interface IHundredDayHigh {
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
    volume?: number;
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
    marketCapitalization?: number;
    listingDays?: number;
    nextDay1Change?: number;
    nextDay2Change?: number;
    nextDay3Change?: number;
    maxProfitIn3Days?: number;
    maxLossIn3Days?: number;
    addScoreLogs?: string;
}
export interface HundredDayHighDocument extends Omit<IHundredDayHigh, '_id'>, Document {
}
export declare const HundredDayHigh: mongoose.Model<HundredDayHighDocument, {}, {}, {}, mongoose.Document<unknown, {}, HundredDayHighDocument, {}, {}> & HundredDayHighDocument & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;