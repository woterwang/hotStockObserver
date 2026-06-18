import mongoose, { Schema, Document } from 'mongoose';
import { HotStock as IHotStock } from '../types';

export interface HotStockDocument extends Omit<IHotStock, '_id'>, Document {}

const HotStockSchema = new Schema<HotStockDocument>(
  {
    date: {
      type: String,
      required: true,
      index: true,
    },
    stockCode: {
      type: String,
      required: true,
      index: true,
    },
    stockName: {
      type: String,
      required: true,
    },
    currentPrice: {
      type: Number,
      default: 0,
    },
    changePercent: {
      type: Number,
      default: 0,
    },
    changeAmount: {
      type: Number,
      default: 0,
    },
    volume: {
      type: Number,
      default: 0,
    },
    turnover: {
      type: Number,
      default: 0,
    },
    rank: {
      type: Number,
      required: true,
    },
    consecutiveDays: {
      type: Number,
      default: 1,
    },
    hotScore: {
      type: Number,
      default: 0,
    },
    sector: {
      type: String,
      default: '',
    },
    sectorCode: {
      type: String,
      default: '',
    },
    riseReason: {
      type: String,
      default: '',
    },
    concept: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// 复合索引：日期+股票代码唯一
HotStockSchema.index({ date: 1, stockCode: 1 }, { unique: true });
// 日期+排名索引
HotStockSchema.index({ date: 1, rank: 1 });
// 连续上榜天数索引
HotStockSchema.index({ consecutiveDays: -1 });

export const HotStock = mongoose.model<HotStockDocument>('HotStock', HotStockSchema);
