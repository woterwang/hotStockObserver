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
exports.MarketIndex = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const MarketIndexSchema = new mongoose_1.Schema({
    date: {
        type: Date,
        required: true,
        index: true,
    },
    indexCode: {
        type: String,
        required: true,
        index: true,
    },
    indexName: {
        type: String,
        required: true,
    },
    currentPoint: {
        type: Number,
        default: 0,
    },
    changePercent: {
        type: Number,
        default: 0,
    },
    changePoint: {
        type: Number,
        default: 0,
    },
    volume: {
        type: Number,
        default: 0,
    },
    turnover: {
        type: Number,
        default: 0,
    },
    high: {
        type: Number,
        default: 0,
    },
    low: {
        type: Number,
        default: 0,
    },
    open: {
        type: Number,
        default: 0,
    },
    preClose: {
        type: Number,
        default: 0,
    },
    amplitude: {
        type: Number,
        default: 0,
    },
}, {
    timestamps: true,
});
// 复合索引：日期+指数代码唯一
MarketIndexSchema.index({ date: 1, indexCode: 1 }, { unique: true });
exports.MarketIndex = mongoose_1.default.model('MarketIndex', MarketIndexSchema);
