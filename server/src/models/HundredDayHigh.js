"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HundredDayHigh = void 0;
const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const HundredDayHighSchema = new Schema({
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
    amplitude: { type: Number, default: 0 },
    upperShadow: { type: Number, default: 0 },
    lowerShadow: { type: Number, default: 0 },
    volume: { type: Number, default: 0 },
    volumeRatioTo5Day: { type: Number, default: 0 },
    aboveMa10: { type: Boolean, default: false },
    is20DayHigh: { type: Boolean, default: false },
    isBottomRising: { type: Boolean, default: false },
    isLimitUp: { type: Boolean, default: false },
    isFirstBoard: { type: Boolean, default: false },
    continuousBoardCount: { type: Number, default: 0 },
    limitUpReason: { type: String, default: '' },
    marketSentimentScore: { type: Number, default: 0 },
    marketLimitUpCount: { type: Number, default: 0 },
    indexAboveMa20: { type: Boolean, default: false },
    marketAdvice: { type: String, default: 'normal' },
    strategyScore: { type: Number, default: 0 },
    baseScore: { type: Number, default: 0 },
    marketBonus: { type: Number, default: 0 },
    boardBonus: { type: Number, default: 0 },
    riskLevel: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    marketCapitalization: { type: Number, default: 0 },
    listingDays: { type: Number, default: 0 },
    nextDay1Change: { type: Number },
    nextDay2Change: { type: Number },
    nextDay3Change: { type: Number },
    maxProfitIn3Days: { type: Number },
    maxLossIn3Days: { type: Number },
    addScoreLogs: { type: String, default: '' },
}, { timestamps: true });
HundredDayHighSchema.index({ date: 1, stockCode: 1 }, { unique: true });
exports.HundredDayHigh = mongoose.models.HundredDayHigh || mongoose.model('HundredDayHigh', HundredDayHighSchema);