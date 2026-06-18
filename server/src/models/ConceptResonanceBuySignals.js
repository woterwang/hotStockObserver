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
exports.ConceptResonanceBuySignals = void 0;
/**
 * 主线共振（Concept Resonance）策略 - 买入信号数据模型
 *
 * 用于存储由 getBuySignalList 生成的买入信号数据
 */
const mongoose_1 = __importStar(require("mongoose"));
const ConceptResonanceBuySignalSchema = new mongoose_1.Schema({
    date: { type: String, required: true, index: true },
    stockCode: { type: String, required: true, index: true },
    stockName: { type: String, required: true },
    price: { type: Number, required: true },
    changePercent: { type: Number, required: true },
    volumeRatio: { type: Number, required: true },
    turnover: { type: Number, default: 0 },
    turnoverRate: { type: Number, required: true },
    industry: { type: String, default: '' },
    concept: { type: String, default: '' },
    status: { type: String, enum: ['pending', 'success', 'failed'], default: 'pending' },
    // K线形态指标
    amplitude: { type: Number, default: 0 },
    upperShadow: { type: Number, default: 0 },
    lowerShadow: { type: Number, default: 0 },
    volumeRatioTo5Day: { type: Number, default: 0 },
    aboveMa10: { type: Boolean, default: false },
    is20DayHigh: { type: Boolean, default: false },
    isBottomRising: { type: Boolean, default: false },
    // 首板/连板标记
    isLimitUp: { type: Boolean, default: false },
    isFirstBoard: { type: Boolean, default: false },
    continuousBoardCount: { type: Number, default: 0 },
    limitUpReason: { type: String, default: '' },
    // 市场环境指标
    marketSentimentScore: { type: Number, default: 0 },
    marketLimitUpCount: { type: Number, default: 0 },
    indexAboveMa20: { type: Boolean, default: false },
    marketAdvice: { type: String, default: 'normal' },
    // 板块共振指标
    hitHotConcepts: { type: [String], default: [] },
    primaryConcept: { type: String, default: null },
    isConceptLeader: { type: Boolean, default: false },
    leaderInConcepts: { type: [String], default: [] },
    conceptScore: { type: Number, default: 0 },
    conceptScoreDetail: {
        hotScore: { type: Number, default: 0 },
        strengthScore: { type: Number, default: 0 },
        positionScore: { type: Number, default: 0 },
    },
    conceptLimitUpCount: { type: Number, default: 0 },
    conceptChangeRatio: { type: Number, default: 0 },
    conceptRiseRatio: { type: Number, default: 0 },
    // 策略评分
    baseScore: { type: Number, default: 0 },
    marketBonus: { type: Number, default: 0 },
    boardBonus: { type: Number, default: 0 },
    strategyScore: { type: Number, default: 0 },
    betaCoefficient: { type: Number, default: 0.5 },
    riskLevel: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    riskTags: { type: [String], default: [] },
    // 开盘数据相关字段
    openStrengthScore: { type: Number, default: 0 },
    auctionScore: { type: Number, default: 0 },
    openingTotalScore: { type: Number, default: 0 },
    // 跟踪相关
    nextDay1Change: { type: Number },
    nextDay2Change: { type: Number },
    nextDay3Change: { type: Number },
    maxProfitIn3Days: { type: Number },
    maxLossIn3Days: { type: Number },
}, { timestamps: true });
// 复合索引：同一日期下同一股票只能有一条信号
ConceptResonanceBuySignalSchema.index({ date: 1, stockCode: 1 }, { unique: true });
// 评分索引
ConceptResonanceBuySignalSchema.index({ date: 1, strategyScore: -1 });
exports.ConceptResonanceBuySignals = mongoose_1.default.model('ConceptResonanceBuySignals', ConceptResonanceBuySignalSchema);
