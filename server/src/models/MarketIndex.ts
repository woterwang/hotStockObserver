import mongoose, { Schema, Document } from 'mongoose';
import { MarketIndex as IMarketIndex } from '../types';

export interface MarketIndexDocument extends Omit<IMarketIndex, '_id'>, Document {}

const MarketIndexSchema = new Schema<MarketIndexDocument>(
  {
    date: {
      type: Date,
      required: true,
      index: true,
    },
    indexCode: {
      type: String,
      required: true,
      index: true,
    },
    indexName: {
      type: String,
      required: true,
    },
    currentPoint: {
      type: Number,
      default: 0,
    },
    changePercent: {
      type: Number,
      default: 0,
    },
    changePoint: {
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
    high: {
      type: Number,
      default: 0,
    },
    low: {
      type: Number,
      default: 0,
    },
    open: {
      type: Number,
      default: 0,
    },
    preClose: {
      type: Number,
      default: 0,
    },
    amplitude: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// 复合索引：日期+指数代码唯一
MarketIndexSchema.index({ date: 1, indexCode: 1 }, { unique: true });

export const MarketIndex =
  (mongoose.models.MarketIndex as mongoose.Model<MarketIndexDocument>) ||
  mongoose.model<MarketIndexDocument>('MarketIndex', MarketIndexSchema);
