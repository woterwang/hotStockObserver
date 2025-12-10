import mongoose, { Schema, Document } from 'mongoose';

/**
 * 买入信号模型
 * 用于记录和跟踪每个标的的买入时机判断
 */
export interface IBuySignal {
  _id?: string;
  date: Date;                     // 信号日期（T+1日）
  stockCode: string;
  stockName: string;
  
  // ========================================
  // 📋 关联的选股数据
  // ========================================
  volumeSurgeId?: string;         // 关联的 VolumeSurge 记录ID
  selectionDate: Date;            // 选股日期（T日）
  selectionScore: number;         // 选股策略得分
  
  // ========================================
  // 🎯 开盘信号指标（集合竞价 9:25）
  // ========================================
  openPrice: number;              // 开盘价
  openChangePercent: number;      // 开盘涨幅 %
  openVolumeRatio: number;        // 开盘量比（9:30前5分钟成交量/昨日同期）
  auctionAmount: number;          // 集合竞价成交金额（万）
  auctionAmountRatio: number;     // 竞价金额/昨日成交额 %
  
  // ========================================
  // 📊 早盘确认指标（9:30-9:45）
  // ========================================
  firstBarChange?: number;        // 首根K线涨跌幅 %
  first15MinHigh?: number;        // 开盘15分钟最高价
  first15MinLow?: number;         // 开盘15分钟最低价
  first15MinVolume?: number;      // 开盘15分钟成交量
  
  // ========================================
  // 🌐 大盘环境（T+1日开盘）
  // ========================================
  indexOpenChange: number;        // 上证开盘涨跌幅 %
  indexMorningTrend: 'up' | 'down' | 'flat';  // 早盘趋势
  marketMood: number;             // 市场情绪 0-100
  
  // ========================================
  // 🔥 板块联动
  // ========================================
  sectorName: string;             // 所属板块
  sectorOpenChange: number;       // 板块开盘涨幅 %
  sectorLimitUpCount: number;     // 板块内涨停数
  sectorLeader: boolean;          // 是否板块领涨
  
  // ========================================
  // 💪 承接力度（涨停股专用）
  // ========================================
  isLimitUp: boolean;             // 是否涨停开盘
  sealAmount?: number;            // 封单金额（万）
  sealRatio?: number;             // 封单/成交额 比例
  openTimes?: number;             // 开板次数
  
  // ========================================
  // 📐 技术位置
  // ========================================
  distanceToMa5: number;          // 距离5日均线 %
  distanceToMa10: number;         // 距离10日均线 %
  distanceToMa20: number;         // 距离20日均线 %
  distanceToPressure: number;     // 距离最近压力位 %
  
  // ========================================
  // 💯 买入信号评分
  // ========================================
  openStrengthScore: number;      // 开盘强度分 (0-30)
  volumeConfirmScore: number;     // 量能确认分 (0-15)
  auctionScore: number;           // 竞价抢筹分 (0-15)
  marketEnvScore: number;         // 大盘环境分 (0-10)
  sectorLinkScore: number;        // 板块联动分 (0-10)
  sealStrengthScore: number;      // 承接力度分 (0-10)
  technicalScore: number;         // 技术位置分 (0-10)
  
  totalBuyScore: number;          // 买入信号总分 (0-100)
  
  // ========================================
  // 🚦 买入决策
  // ========================================
  buySignal: 'strong_buy' | 'buy' | 'hold' | 'pass';  // 买入信号
  suggestedPosition: number;      // 建议仓位 %
  suggestedPrice: number;         // 建议买入价
  stopLossPrice: number;          // 止损价
  takeProfitPrice: number;        // 止盈价
  buyReason: string;              // 买入理由
  riskWarning: string[];          // 风险提示
  
  // ========================================
  // 📈 实际执行与跟踪
  // ========================================
  executed: boolean;              // 是否已执行买入
  executedPrice?: number;         // 实际买入价
  executedTime?: Date;            // 实际买入时间
  
  // T+1/T+2/T+3 收益跟踪
  day1ClosePrice?: number;        // T+1 收盘价
  day1CloseChange?: number;       // T+1 收盘涨跌幅
  day1HighChange?: number;        // T+1 最高涨幅
  day1LowChange?: number;         // T+1 最低跌幅
  
  day2CloseChange?: number;       // T+2 收盘涨跌幅
  day3CloseChange?: number;       // T+3 收盘涨跌幅
  
  maxProfitIn3Days?: number;      // 3日内最高收益
  maxLossIn3Days?: number;        // 3日内最大回撤
  finalProfit?: number;           // 最终收益（按止盈止损计算）
  
  resultStatus: 'pending' | 'profit' | 'loss' | 'breakeven';  // 结果状态
}

export interface BuySignalDocument extends Omit<IBuySignal, '_id'>, Document {}

const BuySignalSchema = new Schema<BuySignalDocument>(
  {
    date: { type: Date, required: true, index: true },
    stockCode: { type: String, required: true, index: true },
    stockName: { type: String, required: true },
    
    // 关联数据
    volumeSurgeId: { type: String },
    selectionDate: { type: Date, required: true },
    selectionScore: { type: Number, default: 0 },
    
    // 开盘信号指标
    openPrice: { type: Number, required: true },
    openChangePercent: { type: Number, required: true },
    openVolumeRatio: { type: Number, default: 0 },
    auctionAmount: { type: Number, default: 0 },
    auctionAmountRatio: { type: Number, default: 0 },
    
    // 早盘确认指标
    firstBarChange: { type: Number },
    first15MinHigh: { type: Number },
    first15MinLow: { type: Number },
    first15MinVolume: { type: Number },
    
    // 大盘环境
    indexOpenChange: { type: Number, default: 0 },
    indexMorningTrend: { type: String, enum: ['up', 'down', 'flat'], default: 'flat' },
    marketMood: { type: Number, default: 50 },
    
    // 板块联动
    sectorName: { type: String, default: '' },
    sectorOpenChange: { type: Number, default: 0 },
    sectorLimitUpCount: { type: Number, default: 0 },
    sectorLeader: { type: Boolean, default: false },
    
    // 承接力度
    isLimitUp: { type: Boolean, default: false },
    sealAmount: { type: Number },
    sealRatio: { type: Number },
    openTimes: { type: Number },
    
    // 技术位置
    distanceToMa5: { type: Number, default: 0 },
    distanceToMa10: { type: Number, default: 0 },
    distanceToMa20: { type: Number, default: 0 },
    distanceToPressure: { type: Number, default: 0 },
    
    // 买入信号评分
    openStrengthScore: { type: Number, default: 0 },
    volumeConfirmScore: { type: Number, default: 0 },
    auctionScore: { type: Number, default: 0 },
    marketEnvScore: { type: Number, default: 0 },
    sectorLinkScore: { type: Number, default: 0 },
    sealStrengthScore: { type: Number, default: 0 },
    technicalScore: { type: Number, default: 0 },
    totalBuyScore: { type: Number, default: 0 },
    
    // 买入决策
    buySignal: { type: String, enum: ['strong_buy', 'buy', 'hold', 'pass'], default: 'hold' },
    suggestedPosition: { type: Number, default: 0 },
    suggestedPrice: { type: Number, default: 0 },
    stopLossPrice: { type: Number, default: 0 },
    takeProfitPrice: { type: Number, default: 0 },
    buyReason: { type: String, default: '' },
    riskWarning: [{ type: String }],
    
    // 执行与跟踪
    executed: { type: Boolean, default: false },
    executedPrice: { type: Number },
    executedTime: { type: Date },
    
    day1ClosePrice: { type: Number },
    day1CloseChange: { type: Number },
    day1HighChange: { type: Number },
    day1LowChange: { type: Number },
    day2CloseChange: { type: Number },
    day3CloseChange: { type: Number },
    
    maxProfitIn3Days: { type: Number },
    maxLossIn3Days: { type: Number },
    finalProfit: { type: Number },
    
    resultStatus: { type: String, enum: ['pending', 'profit', 'loss', 'breakeven'], default: 'pending' },
  },
  {
    timestamps: true,
    collection: 'buySignals',
  }
);

// 复合索引
BuySignalSchema.index({ date: 1, stockCode: 1 }, { unique: true });
BuySignalSchema.index({ buySignal: 1, date: -1 });
BuySignalSchema.index({ resultStatus: 1 });

export const BuySignal = mongoose.model<BuySignalDocument>('BuySignal', BuySignalSchema);
