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
exports.PriceBreakthrough = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const PriceBreakthroughSchema = new mongoose_1.Schema({
    date: {
        type: String, // YYYYMMDD 格式
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
}, {
    timestamps: true,
});
// 复合索引：日期+股票代码唯一
PriceBreakthroughSchema.index({ date: 1, stockCode: 1 }, { unique: true });
// 日期+涨幅排序索引
PriceBreakthroughSchema.index({ date: 1, changePercent: -1 });
exports.PriceBreakthrough = mongoose_1.default.model('PriceBreakthrough', PriceBreakthroughSchema);
