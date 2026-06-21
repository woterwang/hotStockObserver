"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.BuySignal = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const BuySignalSchema = new mongoose_1.Schema({
    date: { type: mongoose_1.Schema.Types.Mixed, required: true, index: true }, // 支持 Date 对象和 YYYYMMDD 字符串
    stockCode: { type: String, required: true, index: true },
    stockName: { type: String, required: true },
    // 关联数据 - 支持多策略
    strategyType: {
        type: String,
        enum: ['volume_surge', 'breakthrough', 'limit_up', 'ma_crossover'],
        required: true,
        index: true
    },
    strategyName: { type: String, required: true },
    sourceId: { type: String },
    selectionDate: { type: String, required: true }, // YYYYMMDD 格式
    selectionScore: { type: Number, default: 0 },
    // 开盘信号指标
    openPrice: { type: Number, required: true },
    openChangePercent: { type: Number, required: true },
    openVolumeRatio: { type: Number, default: 0 },
    auctionAmount: { type: Number, default: 0 },
    auctionAmountRatio: { type: Number, default: 0 },
    volumeRatio: { type: Number, default: 0 },
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
    trendScore: { type: Number, default: 0 },
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
}, {
    timestamps: true,
    collection: 'buySignals',
});
// 复合索引
BuySignalSchema.index({ date: 1, stockCode: 1 }, { unique: true });
BuySignalSchema.index({ buySignal: 1, date: -1 });
BuySignalSchema.index({ resultStatus: 1 });
exports.BuySignal = mongoose_1.default.model('BuySignal', BuySignalSchema);
