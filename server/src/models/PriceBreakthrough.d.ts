import mongoose, { Document } from 'mongoose';
export interface IPriceBreakthrough {
    _id?: string;
    date: string;
    stockCode: string;
    stockName: string;
    currentPrice: number;
    changePercent: number;
    turnover: number;
    prevDayTurnover: number;
    turnoverRatio: number;
    high188: number;
    breakTime?: string;
    riseReason?: string;
    sector?: string;
    concept?: string[];
}
export interface PriceBreakthroughDocument extends Omit<IPriceBreakthrough, '_id'>, Document {
}
export declare const PriceBreakthrough: mongoose.Model<PriceBreakthroughDocument, {}, {}, {}, mongoose.Document<unknown, {}, PriceBreakthroughDocument, {}, {}> & PriceBreakthroughDocument & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
