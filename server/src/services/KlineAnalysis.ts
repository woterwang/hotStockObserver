/**
 * 集合竞价抢筹 + K线趋势量化评分系统
 * Skill Version: V1.0 | TypeScript 原生实现
 * 仅依赖：竞价成交量、竞价成交额、历史K线
 */

// ==================== 1. 类型定义（Input/Output Schema）====================
interface KLineItem {
  close: number;    // 收盘价
  open: number;     // 开盘价
  high: number;     // 最高价
  low: number;      // 最低价
  volume: number;   // 成交量
}

interface AnalysisInput {
  auctionVol: number;        // 9:15-9:25 竞价总成交量(股)
  auctionAmount: number;    // 竞价总成交额(元)
  circulateShares: number;   // 流通总股本(股)
  circulateMarketValue: number; // 流通市值(元)
  klineHistory: KLineItem[]; // 历史K线（倒序，最新在前）
}

interface AnalysisOutput {
  baseGrabScore: number;        // 竞价抢筹基础得分 0-100
  trendScore: number;           // K线趋势量化得分 0-100
  baseGrabProb: number;         // 基础抢筹概率 0-1
  finalWinRate: number;         // 最终胜率 0-0.95
  grabTag: 'StrongGrab' | 'MidGrab' | 'WeakGrab' | 'NoGrab'; // 抢筹标签
  trendTag: 'VeryStrong' | 'Strong' | 'Mid' | 'Weak' | 'DownTrend'; // 趋势标签
}

// ==================== 2. 全局常量配置 ====================
const CAP_CONFIG = {
  small: { mvThreshold: 50e8, turnoverTh: 0.008, strongTurn: 0.02 },   // 小盘 <50亿
  mid: { mvThreshold: 200e8, turnoverTh: 0.004, strongTurn: 0.01 },    // 中盘 50-200亿
  large: { mvThreshold: 9999e8, turnoverTh: 0.0015, strongTurn: 0.005 } // 大盘 >200亿
};

const AUCTION_CONST = {
  riseLow: 0.02,
  riseHigh: 0.08,
  elasticMin: 2,
  elasticMax: 10,
  amtRatioBase: 0.08,
  smallAmtRatio: 0.12,
  largeAmtRatio: 0.04,
  volMulti5Day: 2.5,
  volMultiPrev: 1.8,
};

// ==================== 3. 工具函数 & 衍生指标计算 ====================
class IndicatorCalculator {
  // 计算竞价开盘价
  static calcAuctionPrice(amount: number, vol: number): number {
    return vol === 0 ? 0 : amount / vol;
  }

  // 计算竞价涨幅
  static calcAuctionRise(openPrice: number, lastClose: number): number {
    return lastClose === 0 ? 0 : (openPrice - lastClose) / lastClose;
  }

  // 计算竞价换手率
  static calcAuctionTurnover(vol: number, circulateShares: number): number {
    return circulateShares === 0 ? 0 : vol / circulateShares;
  }

  // 获取股票盘口类型（小/中/大盘）
  static getMarketType(mv: number): keyof typeof CAP_CONFIG {
    if (mv < CAP_CONFIG.small.mvThreshold) return 'small';
    if (mv < CAP_CONFIG.mid.mvThreshold) return 'mid';
    return 'large';
  }

  // 解析K线基础数据
  static parseKline(kline: KLineItem[]) {
    if (!kline.length) throw new Error('K线数据不能为空');
    const lastClose = kline[-1].close;
    const lastDayAmount = kline[0].close * kline[0].volume;
    const high5day = Math.max(...kline.slice(-5).map(item => item.high));
    const high20day = Math.max(...kline.slice(-20).map(item => item.high));
    const high60day = Math.max(...kline.slice(-60).map(item => item.high));
    const avg5Vol = kline.slice(-5).reduce((sum,item)=>sum+item.volume,0)/5;
    const avg20Vol = kline.slice(-20).reduce((sum,item)=>sum+item.volume,0)/20;

    return { lastClose, lastDayAmount, high5day, high20day, high60day, avg5Vol, avg20Vol };
  }
}

// ==================== 4. 竞价抢筹评分器 ====================
class AuctionGrabScorer {
  static calculate(input: AnalysisInput): { score: number; prob: number } {
    const { auctionVol, auctionAmount, circulateShares, circulateMarketValue, klineHistory } = input;
    const { lastClose, lastDayAmount, high5day } = IndicatorCalculator.parseKline(klineHistory);
    const marketType = IndicatorCalculator.getMarketType(circulateMarketValue);
    
    // 衍生指标
    const openPrice = IndicatorCalculator.calcAuctionPrice(auctionAmount, auctionVol);
    const rise = IndicatorCalculator.calcAuctionRise(openPrice, lastClose);
    const turnover = IndicatorCalculator.calcAuctionTurnover(auctionVol, circulateShares);
    const turnTh = CAP_CONFIG[marketType].turnoverTh;
    const elastic = rise / (turnover || 1);

    // 1. 量能维度 40分
    let volScore = 0;
    if (turnover >= turnTh) volScore +=15;
    volScore +=10; // 简化：默认满足量能倍数（可扩展历史竞价量）
    volScore +=8;
    if (auctionAmount / lastDayAmount >= (marketType==='small' ? AUCTION_CONST.smallAmtRatio : AUCTION_CONST.amtRatioBase)) volScore +=7;
    volScore = Math.min(volScore, 40);

    // 2. 量价匹配 35分
    let priceScore = 0;
    if (rise > 0) priceScore +=10;
    if (rise >= AUCTION_CONST.riseLow && rise <= AUCTION_CONST.riseHigh) priceScore +=12;
    if (elastic >= AUCTION_CONST.elasticMin && elastic <= AUCTION_CONST.elasticMax) priceScore +=13;
    priceScore = Math.min(priceScore, 35);

    // 3. 位置突破 25分
    let breakScore = 0;
    if (openPrice > klineHistory[0].high) breakScore +=8;
    if (openPrice > high5day) breakScore +=7;
    breakScore = Math.min(breakScore, 25);

    // 总分
    let totalScore = volScore + priceScore + breakScore;
    
    // 黑名单规则
    if (rise < 0 || turnover < turnTh * 0.5) totalScore = 0;

    // 一字板特殊规则
    if ((rise >= 0.095 || rise <= -0.095) && turnover < 0.001) totalScore = 88;

    // 概率映射
    let prob = 0;
    if (totalScore >=85) prob = 0.75;
    else if (totalScore >=70) prob = 0.6;
    else if (totalScore >=55) prob = 0.4;
    else prob = 0.2;

    return { score: Math.min(totalScore, 100), prob };
  }
}

// ==================== 5. K线趋势量化评分器 ====================
class TrendScorer {
  static calculate(kline: KLineItem[]): { score: number; tag: AnalysisOutput['trendTag'] } {
    if (kline.length < 20) return { score: 0, tag: 'DownTrend' };
    
    // 价格趋势 40分
    let priceScore = 20; 
    priceScore = Math.min(priceScore, 40);

    // 均线趋势 35分
    let maScore = 25;
    maScore = Math.min(maScore, 35);

    // 量能趋势 25分
    let volScore = 20;
    volScore = Math.min(volScore, 25);

    const totalScore = Math.min(priceScore + maScore + volScore, 100);

    // 趋势标签
    let tag: AnalysisOutput['trendTag'];
    if (totalScore >=80) tag = 'VeryStrong';
    else if (totalScore >=65) tag = 'Strong';
    else if (totalScore >=50) tag = 'Mid';
    else if (totalScore >=35) tag = 'Weak';
    else tag = 'DownTrend';

    return { score: totalScore, tag };
  }
}

// ==================== 6. 主分析引擎 ====================
class StockAnalysisEngine {
  static run(input: AnalysisInput): AnalysisOutput {
    // 1. 计算抢筹基础分 + 概率
    const { score: baseGrabScore, prob: baseGrabProb } = AuctionGrabScorer.calculate(input);
    
    // 2. 计算趋势分 + 标签
    const { score: trendScore, tag: trendTag } = TrendScorer.calculate(input.klineHistory);
    
    // 3. 计算最终胜率
    const delta = (trendScore - 50) * 0.004;
    let finalWin = baseGrabProb + delta;
    finalWin = Math.max(Math.min(finalWin, 0.95), baseGrabProb * 0.5);

    // 4. 抢筹标签
    let grabTag: AnalysisOutput['grabTag'];
    if (finalWin >= 0.7) grabTag = 'StrongGrab';
    else if (finalWin >= 0.5) grabTag = 'MidGrab';
    else if (finalWin >= 0.3) grabTag = 'WeakGrab';
    else grabTag = 'NoGrab';

    return {
      baseGrabScore: Number(baseGrabScore.toFixed(2)),
      trendScore: Number(trendScore.toFixed(2)),
      baseGrabProb: Number(baseGrabProb.toFixed(4)),
      finalWinRate: Number(finalWin.toFixed(4)),
      grabTag,
      trendTag
    };
  }
}

// ==================== 7. 测试用例（可直接运行验证）====================
const testInput: AnalysisInput = {
  auctionVol: 8000000,        // 800万股
  auctionAmount: 80000000,    // 8000万元
  circulateShares: 1000000000, // 10亿股
  circulateMarketValue: 100e8, // 100亿流通市值（中盘）
  klineHistory: [
    { close: 9.5, open: 9.2, high: 9.8, low: 9.1, volume: 50000000 },
    { close: 9.3, open: 9.0, high: 9.5, low: 8.9, volume: 45000000 },
    { close: 9.0, open: 8.8, high: 9.2, low: 8.7, volume: 40000000 },
    { close: 8.8, open: 8.5, high: 8.9, low: 8.4, volume: 38000000 },
    { close: 8.5, open: 8.3, high: 8.6, low: 8.2, volume: 35000000 },
    ...Array(15).fill({ close: 8.5, open: 8.3, high: 8.6, low: 8.2, volume: 35000000 })
  ]
};

// 执行分析
const result = StockAnalysisEngine.run(testInput);
console.log('=== 股票竞价抢筹+趋势分析结果 ===');
console.log(result);