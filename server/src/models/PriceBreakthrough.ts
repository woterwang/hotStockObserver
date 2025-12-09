import mongoose, { Schema, Document } from 'mongoose';

// 价格突破记录接口
export interface IPriceBreakthrough {
  _id?: string;
  date: Date;                    // 突破日期
  stockCode: string;             // 股票代码
  stockName: string;             // 股票名称
  currentPrice: number;          // 突破时价格
  changePercent: number;         // 当日涨幅(%)
  turnover: number;              // 成交额（元）
  prevDayTurnover: number;       // 前一日成交额（元）
  turnoverRatio: number;         // 成交额比（当日/前一日）
  high188: number;               // 188日最高价
  breakTime?: string;            // 突破时间（如有）
  riseReason?: string;           // 上涨原因
  sector?: string;               // 所属板块
  concept?: string[];            // 概念板块
}

export interface PriceBreakthroughDocument extends Omit<IPriceBreakthrough, '_id'>, Document {}

const PriceBreakthroughSchema = new Schema<PriceBreakthroughDocument>(
  {
    date: {
      type: Date,
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
      required: true,
    },
    changePercent: {
      type: Number,
      required: true,
    },
    turnover: {
      type: Number,
      default: 0,
    },
    prevDayTurnover: {
      type: Number,
      default: 0,
    },
    turnoverRatio: {
      type: Number,
      default: 0,
    },
    high188: {
      type: Number,
      default: 0,
    },
    breakTime: {
      type: String,
      default: '',
    },
    riseReason: {
      type: String,
      default: '',
    },
    sector: {
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
PriceBreakthroughSchema.index({ date: 1, stockCode: 1 }, { unique: true });
// 日期+涨幅排序索引
PriceBreakthroughSchema.index({ date: 1, changePercent: -1 });

export const PriceBreakthrough = mongoose.model<PriceBreakthroughDocument>(
  'PriceBreakthrough',
  PriceBreakthroughSchema
);
