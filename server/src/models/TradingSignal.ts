import mongoose, { Schema, Document } from 'mongoose';

/**
 * 入场条件检查状态
 */
export interface EntryConditions {
  // 价格相关
  openAboveDay2Avg: boolean;           // 开盘价 > Day2均价
  openChangeInRange: boolean;          // 开盘涨幅在 -5% ~ 5% 之间
  openAboveDay2Low: boolean;           // 开盘价不破Day2最低价
  
  // 量能相关
  day2VolumeOk: boolean;               // Day2成交量 ≤ Day1成交量的1.1倍
  
  // 技术形态
  day2CloseInUpperHalf: boolean;       // Day2收盘价在K线上半部分
  day2NoLongUpperShadow: boolean;      // Day2没有长上影线（< 2%）
}

/**
 * 卖出条件设置
 */
export interface ExitConditions {
  stopLossPrice: number;               // 止损价（Day2最低价下方1-2%）
  stopLossPercent: number;             // 止损幅度 %
  takeProfitPrice: number;             // 止盈价
  takeProfitPercent: number;           // 止盈幅度 %
  altStopLossPrice: number;            // 备选止损（Day1收盘价）
}

/**
 * 交易信号状态
 */
export type SignalStatus = 
  | 'pending'        // 待观察（Day3开盘前）
  | 'ready'          // 可入场（条件满足）
  | 'partial'        // 部分满足
  | 'rejected'       // 不满足（条件未达标）
  | 'entered'        // 已入场
  | 'exited'         // 已退出
  | 'expired';       // 已过期

/**
 * 策略类型
 */
export type StrategyType = 
  | 'breakthrough_3day'   // 价格突破三天确认模式
  | 'volume_surge'        // 放量大涨策略
  | 'volume_breakout'     // 放量突破策略（预留）
  | 'ma_crossover'        // 均线金叉策略（预留）
  | 'limit_up_follow'     // 涨停追踪策略（预留）
  | 'other';              // 其他策略

/**
 * 策略信息配置
 */
export const STRATEGY_INFO: Record<StrategyType, { name: string; description: string; color: string }> = {
  breakthrough_3day: {
    name: '突破三天',
    description: '价格突破188日新高后三天确认模式',
    color: 'blue',
  },
  volume_surge: {
    name: '放量大涨',
    description: '放量大涨次日追踪策略',
    color: 'orange',
  },
  volume_breakout: {
    name: '放量突破',
    description: '放量突破关键价位策略',
    color: 'green',
  },
  ma_crossover: {
    name: '均线金叉',
    description: '均线金叉买入策略',
    color: 'purple',
  },
  limit_up_follow: {
    name: '涨停追踪',
    description: '涨停板次日追踪策略',
    color: 'red',
  },
  other: {
    name: '其他',
    description: '其他策略',
    color: 'gray',
  },
};

/**
 * 交易信号接口
 */
export interface ITradingSignal {
  _id?: string;
  
  // 策略信息
  strategy: StrategyType;              // 策略类型
  
  // 基本信息
  signalDate: string;                  // 信号生成日期（Day3），YYYYMMDD 字符串
  stockCode: string;                   // 股票代码
  stockName: string;                   // 股票名称
  
  // 三天数据
  day1Date: string;                    // Day1 突破日，YYYYMMDD 字符串
  day1Open: number;                    // Day1 开盘价
  day1Close: number;                   // Day1 收盘价
  day1High: number;                    // Day1 最高价
  day1Low: number;                     // Day1 最低价
  day1Change: number;                  // Day1 涨幅 %
  day1Volume: number;                  // Day1 成交量
  day1Turnover: number;                // Day1 成交额
  
  day2Date: string;                    // Day2 确认日，YYYYMMDD 字符串
  day2Open: number;                    // Day2 开盘价
  day2Close: number;                   // Day2 收盘价
  day2High: number;                    // Day2 最高价
  day2Low: number;                     // Day2 最低价
  day2Change: number;                  // Day2 涨幅 %
  day2Volume: number;                  // Day2 成交量
  day2Turnover: number;                // Day2 成交额
  day2Avg: number;                     // Day2 均价
  
  day3Open?: number;                   // Day3 开盘价（集合竞价后获取）
  day3OpenChange?: number;             // Day3 开盘涨幅 %
  
  // 突破信息
  high188: number;                     // 188日最高价
  
  // 入场条件
  entryConditions?: EntryConditions;   // 入场条件检查结果
  entryScore?: number;                 // 入场评分（满足条件数）
  
  // 卖出条件
  exitConditions?: ExitConditions;     // 卖出条件设置
  
  // 状态
  status: SignalStatus;                // 信号状态
  
  // 交易结果（如果已入场）
  entryPrice?: number;                 // 实际入场价
  entryTime?: Date;                    // 入场时间（保持 Date 类型，因为需要精确时间）
  exitPrice?: number;                  // 实际退出价
  exitTime?: Date;                     // 退出时间（保持 Date 类型）
  exitReason?: string;                 // 退出原因
  profitPercent?: number;              // 收益率 %
  
  // 市场情绪（信号生成时的情绪评分）
  marketSentimentScore?: number;       // 情绪评分
  marketSentimentAdvice?: string;      // 情绪建议
  suggestedPosition?: number;          // 建议仓位比例 0-1
  
  // 风险标记（放量大涨策略专用）
  riskLevel?: 'low' | 'medium' | 'high';  // 风险等级
  riskReasons?: string[];              // 风险原因列表
  day1TurnoverRate?: number;           // Day1 换手率 %
  isLimitUp?: boolean;                 // Day1 是否涨停
  
  // 其他信息
  sector?: string;                     // 所属板块
  concept?: string[];                  // 概念板块
  riseReason?: string;                 // 上涨原因
  notes?: string;                      // 备注
}

export interface TradingSignalDocument extends Omit<ITradingSignal, '_id'>, Document {}

const TradingSignalSchema = new Schema<TradingSignalDocument>(
  {
    // 策略类型
    strategy: {
      type: String,
      enum: ['breakthrough_3day', 'volume_surge', 'volume_breakout', 'ma_crossover', 'limit_up_follow', 'other'],
      default: 'breakthrough_3day',
      index: true,
    },
    signalDate: {
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
    
    // Day1 数据
    day1Date: { type: String, required: true },
    day1Open: { type: Number, default: 0 },
    day1Close: { type: Number, default: 0 },
    day1High: { type: Number, default: 0 },
    day1Low: { type: Number, default: 0 },
    day1Change: { type: Number, default: 0 },
    day1Volume: { type: Number, default: 0 },
    day1Turnover: { type: Number, default: 0 },
    
    // Day2 数据
    day2Date: { type: String, required: true },
    day2Open: { type: Number, default: 0 },
    day2Close: { type: Number, default: 0 },
    day2High: { type: Number, default: 0 },
    day2Low: { type: Number, default: 0 },
    day2Change: { type: Number, default: 0 },
    day2Volume: { type: Number, default: 0 },
    day2Turnover: { type: Number, default: 0 },
    day2Avg: { type: Number, default: 0 },
    
    // Day3 数据
    day3Open: { type: Number },
    day3OpenChange: { type: Number },
    
    // 突破信息
    high188: { type: Number, default: 0 },
    
    // 入场条件
    entryConditions: {
      type: Schema.Types.Mixed,
      default: {},
    },
    entryScore: { type: Number, default: 0 },
    
    // 卖出条件
    exitConditions: {
      type: Schema.Types.Mixed,
      default: {},
    },
    
    // 状态
    status: {
      type: String,
      enum: ['pending', 'ready', 'partial', 'rejected', 'entered', 'exited', 'expired'],
      default: 'pending',
    },
    
    // 交易结果
    entryPrice: { type: Number },
    entryTime: { type: Date },
    exitPrice: { type: Number },
    exitTime: { type: Date },
    exitReason: { type: String },
    profitPercent: { type: Number },
    
    // 市场情绪
    marketSentimentScore: { type: Number },
    marketSentimentAdvice: { type: String },
    suggestedPosition: { type: Number },
    
    // 风险标记（放量大涨策略专用）
    riskLevel: { type: String, enum: ['low', 'medium', 'high'] },
    riskReasons: { type: [String], default: [] },
    day1TurnoverRate: { type: Number },
    isLimitUp: { type: Boolean },
    
    // 其他
    sector: { type: String, default: '' },
    concept: { type: [String], default: [] },
    riseReason: { type: String, default: '' },
    notes: { type: String, default: '' },
  },
  {
    timestamps: true,
  }
);

// 索引
TradingSignalSchema.index({ signalDate: 1, stockCode: 1, strategy: 1 }, { unique: true });
TradingSignalSchema.index({ signalDate: 1, status: 1 });
TradingSignalSchema.index({ signalDate: 1, entryScore: -1 });
TradingSignalSchema.index({ strategy: 1, signalDate: 1 });

export const TradingSignal = mongoose.model<TradingSignalDocument>(
  'TradingSignal',
  TradingSignalSchema
);
