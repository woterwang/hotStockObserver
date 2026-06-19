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
exports.VolumeSurge = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const VolumeSurgeSchema = new mongoose_1.Schema({
    date: { type: String, required: true, index: true }, // YYYYMMDD 格式
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
    // 量能指标
    volume: { type: Number, default: 0 },
    volumeRatioTo5Day: { type: Number, default: 0 },
    // 趋势指标
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
    // 策略评分
    strategyScore: { type: Number, default: 0 },
    baseScore: { type: Number, default: 0 },
    marketBonus: { type: Number, default: 0 },
    boardBonus: { type: Number, default: 0 },
    riskLevel: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    // 跟踪相关
    nextDay1Change: { type: Number },
    nextDay2Change: { type: Number },
    nextDay3Change: { type: Number },
    maxProfitIn3Days: { type: Number },
    maxLossIn3Days: { type: Number },
    addScoreLogs: { type: String, default: '' },
}, { timestamps: true });
// 复合索引
VolumeSurgeSchema.index({ date: 1, stockCode: 1 }, { unique: true });
exports.VolumeSurge = mongoose_1.default.model('VolumeSurge', VolumeSurgeSchema);
