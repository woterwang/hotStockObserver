import mongoose, { Schema, Document } from 'mongoose';

export interface IHundredDayHighSignal {
  _id?: string;
  date: string;
  stockCode: string;
  stockName: string;
  strategyType: 'hundred_day_high';
  strategyName: string;
  sourceId?: string;
  selectionDate: string;
  selectionScore: number;
  volumeRatio?: number;
  openPrice: number;
  openChangePercent: number;
  openVolumeRatio: number;
  auctionAmount: number;
  auctionAmountRatio: number;
  marketMood: number;
  sectorName: string;
  totalBuyScore: number;
  buySignal: 'strong_buy' | 'buy' | 'hold' | 'pass';
  suggestedPosition: number;
  suggestedPrice: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  buyReason: string;
  riskWarning: string[];
  [key: string]: unknown;
}

export interface HundredDayHighSignalDocument extends Omit<IHundredDayHighSignal, '_id'>, Document {}

const HundredDayHighSignalSchema = new Schema<HundredDayHighSignalDocument>(
  {
    date: { type: String, required: true, index: true },
    stockCode: { type: String, required: true, index: true },
    stockName: { type: String, required: true },
    strategyType: { type: String, enum: ['hundred_day_high'], default: 'hundred_day_high', index: true },
    strategyName: { type: String, default: '百日新高' },
    sourceId: { type: String },
    selectionDate: { type: String, required: true },
    selectionScore: { type: Number, default: 0 },
    volumeRatio: { type: Number, default: 0 },
    openPrice: { type: Number, required: true },
    openChangePercent: { type: Number, required: true },
    openVolumeRatio: { type: Number, default: 0 },
    auctionAmount: { type: Number, default: 0 },
    auctionAmountRatio: { type: Number, default: 0 },
    marketMood: { type: Number, default: 50 },
    sectorName: { type: String, default: '' },
    totalBuyScore: { type: Number, default: 0 },
    buySignal: { type: String, enum: ['strong_buy', 'buy', 'hold', 'pass'], default: 'hold' },
    suggestedPosition: { type: Number, default: 0 },
    suggestedPrice: { type: Number, default: 0 },
    stopLossPrice: { type: Number, default: 0 },
    takeProfitPrice: { type: Number, default: 0 },
    buyReason: { type: String, default: '' },
    riskWarning: [{ type: String }],
  },
  {
    timestamps: true,
    collection: 'hundredDayHighSignals',
    strict: false,
  }
);

HundredDayHighSignalSchema.index({ date: 1, stockCode: 1 }, { unique: true });
HundredDayHighSignalSchema.index({ buySignal: 1, date: -1 });

export const HundredDayHighSignal =
  (mongoose.models.HundredDayHighSignal as mongoose.Model<HundredDayHighSignalDocument>) ||
  mongoose.model<HundredDayHighSignalDocument>('HundredDayHighSignal', HundredDayHighSignalSchema);
