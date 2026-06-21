import mongoose, { Document } from 'mongoose';
/**
 * 买入信号模型
 * 用于记录和跟踪每个标的的买入时机判断
 */
export interface IBuySignal {
    _id?: string;
    date: string;
    stockCode: string;
    stockName: string;
    strategyType: 'volume_surge' | 'breakthrough' | 'limit_up' | 'ma_crossover' | 'concept_resonance';
    strategyName: string;
    sourceId?: string;
    selectionDate: string;
    selectionScore: number;
    openPrice: number;
    openChangePercent: number;
    openVolumeRatio: number;
    auctionAmount: number;
    auctionAmountRatio: number;
    volumeRatio: number;
    firstBarChange?: number;
    first15MinHigh?: number;
    first15MinLow?: number;
    first15MinVolume?: number;
    indexOpenChange: number;
    indexMorningTrend: 'up' | 'down' | 'flat';
    marketMood: number;
    sectorName: string;
    sectorOpenChange: number;
    sectorLimitUpCount: number;
    sectorLeader: boolean;
    isLimitUp: boolean;
    sealAmount?: number;
    sealRatio?: number;
    openTimes?: number;
    distanceToMa5: number;
    distanceToMa10: number;
    distanceToMa20: number;
    distanceToPressure: number;
    openStrengthScore: number;
    volumeConfirmScore: number;
    auctionScore: number;
    marketEnvScore: number;
    sectorLinkScore: number;
    sealStrengthScore: number;
    technicalScore: number;
    trendScore: number;
    totalBuyScore: number;
    buySignal: 'strong_buy' | 'buy' | 'hold' | 'pass';
    suggestedPosition: number;
    suggestedPrice: number;
    stopLossPrice: number;
    takeProfitPrice: number;
    buyReason: string;
    riskWarning: string[];
    executed: boolean;
    executedPrice?: number;
    executedTime?: Date;
    day1ClosePrice?: number;
    day1CloseChange?: number;
    day1HighChange?: number;
    day1LowChange?: number;
    day2CloseChange?: number;
    day3CloseChange?: number;
    maxProfitIn3Days?: number;
    maxLossIn3Days?: number;
    finalProfit?: number;
    resultStatus: 'pending' | 'profit' | 'loss' | 'breakeven';
}
export interface BuySignalDocument extends Omit<IBuySignal, '_id'>, Document {
}
export declare const BuySignal: mongoose.Model<BuySignalDocument, {}, {}, {}, mongoose.Document<unknown, {}, BuySignalDocument, {}, {}> & BuySignalDocument & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
