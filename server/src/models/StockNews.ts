import mongoose, { Schema, Document } from 'mongoose';
import { StockNews as IStockNews } from '../types';

export interface StockNewsDocument extends Omit<IStockNews, '_id'>, Document {}

const StockNewsSchema = new Schema<StockNewsDocument>(
  {
    stockCode: {
      type: String,
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
    },
    summary: {
      type: String,
      default: '',
    },
    content: {
      type: String,
      default: '',
    },
    source: {
      type: String,
      default: '',
    },
    url: {
      type: String,
      default: '',
    },
    publishTime: {
      type: Date,
      required: true,
      index: true,
    },
    sentiment: {
      type: String,
      enum: ['positive', 'negative', 'neutral'],
      default: 'neutral',
    },
  },
  {
    timestamps: true,
  }
);

// 股票代码+发布时间索引
StockNewsSchema.index({ stockCode: 1, publishTime: -1 });
// 标题唯一索引（避免重复新闻）
StockNewsSchema.index({ title: 1, stockCode: 1 }, { unique: true });

export const StockNews = mongoose.model<StockNewsDocument>('StockNews', StockNewsSchema);
