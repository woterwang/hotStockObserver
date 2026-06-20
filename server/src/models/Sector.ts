import mongoose, { Schema, Document } from 'mongoose';
import { Sector as ISector } from '../types';

export interface SectorDocument extends Omit<ISector, '_id'>, Document {}

const SectorSchema = new Schema<SectorDocument>(
  {
    date: {
      type: Date,
      required: true,
      index: true,
    },
    sectorCode: {
      type: String,
      required: true,
      index: true,
    },
    sectorName: {
      type: String,
      required: true,
    },
    changePercent: {
      type: Number,
      default: 0,
    },
    turnover: {
      type: Number,
      default: 0,
    },
    leadingStocks: {
      type: [String],
      default: [],
    },
    stockCount: {
      type: Number,
      default: 0,
    },
    riseCount: {
      type: Number,
      default: 0,
    },
    fallCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// 复合索引：日期+板块代码唯一
SectorSchema.index({ date: 1, sectorCode: 1 }, { unique: true });
// 日期+涨跌幅排序索引
SectorSchema.index({ date: 1, changePercent: -1 });

export const Sector =
  (mongoose.models.Sector as mongoose.Model<SectorDocument>) ||
  mongoose.model<SectorDocument>('Sector', SectorSchema);
