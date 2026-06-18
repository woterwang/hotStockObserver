import mongoose, { Document } from 'mongoose';
/**
 * 入场条件检查状态
 */
export interface EntryConditions {
    openAboveDay2Avg: boolean;
    openChangeInRange: boolean;
    openAboveDay2Low: boolean;
    day2VolumeOk: boolean;
    day2CloseInUpperHalf: boolean;
    day2NoLongUpperShadow: boolean;
}
/**
 * 卖出条件设置
 */
export interface ExitConditions {
    stopLossPrice: number;
    stopLossPercent: number;
    takeProfitPrice: number;
    takeProfitPercent: number;
    altStopLossPrice: number;
}
/**
 * 交易信号状态
 */
export type SignalStatus = 'pending' | 'ready' | 'partial' | 'rejected' | 'entered' | 'exited' | 'expired';
/**
 * 策略类型
 */
export type StrategyType = 'breakthrough_3day' | 'volume_surge' | 'volume_breakout' | 'ma_crossover' | 'limit_up_follow' | 'other';
/**
 * 策略信息配置
 */
export declare const STRATEGY_INFO: Record<StrategyType, {
    name: string;
    description: string;
    color: string;
}>;
/**
 * 交易信号接口
 */
export interface ITradingSignal {
    _id?: string;
    strategy: StrategyType;
    signalDate: string;
    stockCode: string;
    stockName: string;
    day1Date: string;
    day1Open: number;
    day1Close: number;
    day1High: number;
    day1Low: number;
    day1Change: number;
    day1Volume: number;
    day1Turnover: number;
    day2Date: string;
    day2Open: number;
    day2Close: number;
    day2High: number;
    day2Low: number;
    day2Change: number;
    day2Volume: number;
    day2Turnover: number;
    day2Avg: number;
    day3Open?: number;
    day3OpenChange?: number;
    high188: number;
    entryConditions?: EntryConditions;
    entryScore?: number;
    exitConditions?: ExitConditions;
    status: SignalStatus;
    entryPrice?: number;
    entryTime?: Date;
    exitPrice?: number;
    exitTime?: Date;
    exitReason?: string;
    profitPercent?: number;
    marketSentimentScore?: number;
    marketSentimentAdvice?: string;
    suggestedPosition?: number;
    riskLevel?: 'low' | 'medium' | 'high';
    riskReasons?: string[];
    day1TurnoverRate?: number;
    isLimitUp?: boolean;
    sector?: string;
    concept?: string[];
    riseReason?: string;
    notes?: string;
}
export interface TradingSignalDocument extends Omit<ITradingSignal, '_id'>, Document {
}
export declare const TradingSignal: mongoose.Model<TradingSignalDocument, {}, {}, {}, mongoose.Document<unknown, {}, TradingSignalDocument, {}, {}> & TradingSignalDocument & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
