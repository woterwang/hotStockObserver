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
exports.MarketSentiment = exports.SENTIMENT_WEIGHTS = void 0;
exports.calculateSentimentScore = calculateSentimentScore;
const mongoose_1 = __importStar(require("mongoose"));
/**
 * 市场情绪评分权重
 */
exports.SENTIMENT_WEIGHTS = {
    limitUp: 0.30, // 涨停数权重
    limitDown: 0.20, // 跌停数权重
    upDownRatio: 0.25, // 涨跌比权重
    maxBoard: 0.25, // 最高连板权重
};
const MarketSentimentSchema = new mongoose_1.Schema({
    date: {
        type: Date,
        required: true,
        index: true,
    },
    dateStr: {
        type: String,
        required: true,
        unique: true,
        index: true,
    },
    // 核心数据
    limitUpCount: { type: Number, default: 0 },
    limitDownCount: { type: Number, default: 0 },
    upCount: { type: Number, default: 0 },
    downCount: { type: Number, default: 0 },
    flatCount: { type: Number, default: 0 },
    upDownRatio: { type: Number, default: 1 },
    // 连板数据
    maxContinuousBoard: { type: Number, default: 0 },
    board2Count: { type: Number, default: 0 },
    board3Count: { type: Number, default: 0 },
    // 炸板数据
    limitUpOpenCount: { type: Number, default: 0 },
    blastRate: { type: Number, default: 0 },
    // 资金流向
    northMoney: { type: Number },
    mainNetInflow: { type: Number },
    // 评分
    score: { type: Number, default: 50 },
    level: {
        type: String,
        enum: ['high', 'medium', 'low', 'extreme_low'],
        default: 'medium',
    },
    advice: {
        type: String,
        enum: ['normal', 'reduce', 'pause', 'aggressive'],
        default: 'normal',
    },
    notes: { type: String, default: '' },
}, {
    timestamps: true,
});
exports.MarketSentiment = mongoose_1.default.model('MarketSentiment', MarketSentimentSchema);
/**
 * 计算情绪评分
 */
function calculateSentimentScore(data) {
    let score = 50; // 基准分
    // === 涨停数评分 (权重30%) ===
    if (data.limitUpCount >= 100) {
        score += 25;
    }
    else if (data.limitUpCount >= 80) {
        score += 20;
    }
    else if (data.limitUpCount >= 60) {
        score += 15;
    }
    else if (data.limitUpCount >= 40) {
        score += 5;
    }
    else if (data.limitUpCount >= 20) {
        score -= 5;
    }
    else {
        score -= 15;
    }
    // === 跌停数评分 (权重20%) ===
    if (data.limitDownCount >= 50) {
        score -= 20;
    }
    else if (data.limitDownCount >= 30) {
        score -= 15;
    }
    else if (data.limitDownCount >= 15) {
        score -= 5;
    }
    else if (data.limitDownCount <= 5) {
        score += 5;
    }
    // === 涨跌比评分 (权重25%) ===
    if (data.upDownRatio >= 4) {
        score += 20;
    }
    else if (data.upDownRatio >= 3) {
        score += 15;
    }
    else if (data.upDownRatio >= 2) {
        score += 10;
    }
    else if (data.upDownRatio >= 1) {
        score += 0;
    }
    else if (data.upDownRatio >= 0.5) {
        score -= 10;
    }
    else {
        score -= 20;
    }
    // === 连板高度评分 (权重25%) ===
    if (data.maxContinuousBoard >= 10) {
        score += 15;
    }
    else if (data.maxContinuousBoard >= 7) {
        score += 12;
    }
    else if (data.maxContinuousBoard >= 5) {
        score += 8;
    }
    else if (data.maxContinuousBoard >= 3) {
        score += 0;
    }
    else {
        score -= 10;
    }
    // === 炸板率惩罚 ===
    if (data.blastRate !== undefined) {
        if (data.blastRate >= 50) {
            score -= 10;
        }
        else if (data.blastRate >= 30) {
            score -= 5;
        }
    }
    // 限制在 0-100 范围
    score = Math.max(0, Math.min(100, score));
    // 确定等级
    let level;
    let advice;
    if (score >= 70) {
        level = 'high';
        advice = 'aggressive';
    }
    else if (score >= 55) {
        level = 'medium';
        advice = 'normal';
    }
    else if (score >= 40) {
        level = 'low';
        advice = 'reduce';
    }
    else {
        level = 'extreme_low';
        advice = 'pause';
    }
    return { score, level, advice };
}
