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
exports.TradingSignal = exports.STRATEGY_INFO = void 0;
const mongoose_1 = __importStar(require("mongoose"));
/**
 * 策略信息配置
 */
exports.STRATEGY_INFO = {
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
const TradingSignalSchema = new mongoose_1.Schema({
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
        type: mongoose_1.Schema.Types.Mixed,
        default: {},
    },
    entryScore: { type: Number, default: 0 },
    // 卖出条件
    exitConditions: {
        type: mongoose_1.Schema.Types.Mixed,
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
}, {
    timestamps: true,
});
// 索引
TradingSignalSchema.index({ signalDate: 1, stockCode: 1, strategy: 1 }, { unique: true });
TradingSignalSchema.index({ signalDate: 1, status: 1 });
TradingSignalSchema.index({ signalDate: 1, entryScore: -1 });
TradingSignalSchema.index({ strategy: 1, signalDate: 1 });
exports.TradingSignal = mongoose_1.default.model('TradingSignal', TradingSignalSchema);
