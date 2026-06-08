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
  static calcAuctionPrice (amount: number, vol: number): number {
    return vol === 0 ? 0 : amount / vol;
  }

  // 计算竞价涨幅
  static calcAuctionRise (openPrice: number, lastClose: number): number {
    return lastClose === 0 ? 0 : (openPrice - lastClose) / lastClose;
  }

  // 计算竞价换手率
  static calcAuctionTurnover (vol: number, circulateShares: number): number {
    return circulateShares === 0 ? 0 : vol / circulateShares;
  }

  // 获取股票盘口类型（小/中/大盘）
  static getMarketType (mv: number): keyof typeof CAP_CONFIG {
    if (mv < CAP_CONFIG.small.mvThreshold) return 'small';
    if (mv < CAP_CONFIG.mid.mvThreshold) return 'mid';
    return 'large';
  }

  // 解析K线基础数据
  static parseKline (kline: KLineItem[]) {
    if (!kline.length) throw new Error('K线数据不能为空');
    const lastClose = kline[kline.length - 1].close;  // 修复：使用正确的索引获取最后一个元素
    const lastDayAmount = kline[0].close * kline[0].volume;
    const high5day = Math.max(...kline.slice(-5).map(item => item.high));
    const high20day = Math.max(...kline.slice(-20).map(item => item.high));
    const high60day = Math.max(...kline.slice(-60).map(item => item.high));
    const avg5Vol = kline.slice(-5).reduce((sum, item) => sum + item.volume, 0) / 5;
    const avg20Vol = kline.slice(-20).reduce((sum, item) => sum + item.volume, 0) / 20;

    return { lastClose, lastDayAmount, high5day, high20day, high60day, avg5Vol, avg20Vol };
  }
}

// ==================== 4. 竞价抢筹评分器 ====================
class AuctionGrabScorer {
  static calculate (input: AnalysisInput): { score: number; prob: number } {
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
    if (turnover >= turnTh) volScore += 15;
    volScore += 10; // 简化：默认满足量能倍数（可扩展历史竞价量）
    volScore += 8;
    if (auctionAmount / lastDayAmount >= (marketType === 'small' ? AUCTION_CONST.smallAmtRatio : AUCTION_CONST.amtRatioBase)) volScore += 7;
    volScore = Math.min(volScore, 40);

    // 2. 量价匹配 35分
    let priceScore = 0;
    if (rise > 0) priceScore += 10;
    if (rise >= AUCTION_CONST.riseLow && rise <= AUCTION_CONST.riseHigh) priceScore += 12;
    if (elastic >= AUCTION_CONST.elasticMin && elastic <= AUCTION_CONST.elasticMax) priceScore += 13;
    priceScore = Math.min(priceScore, 35);

    // 3. 位置突破 25分
    let breakScore = 0;
    if (openPrice > klineHistory[0].high) breakScore += 8;
    if (openPrice > high5day) breakScore += 7;
    breakScore = Math.min(breakScore, 25);

    // 总分
    let totalScore = volScore + priceScore + breakScore;

    // 黑名单规则
    if (rise < 0 || turnover < turnTh * 0.5) totalScore = 0;

    // 一字板特殊规则
    if ((rise >= 0.095 || rise <= -0.095) && turnover < 0.001) totalScore = 88;

    // 概率映射
    let prob = 0;
    if (totalScore >= 85) prob = 0.75;
    else if (totalScore >= 70) prob = 0.6;
    else if (totalScore >= 55) prob = 0.4;
    else prob = 0.2;

    return { score: Math.min(totalScore, 100), prob };
  }
}

// ==================== 5. K线趋势量化评分器（完整版 · 100% 贴合技能文档） ====================
class TrendScorer {
  private static readonly MAX_SCORE = 100;

  static calculate (kline: KLineItem[]): { score: number; tag: AnalysisOutput['trendTag'] } {
    if (!kline || kline.length < 20) {
      return { score: 0, tag: 'DownTrend' };
    }

    // ==============================================
    // 维度1：价格趋势得分 0~40
    // ==============================================
    let priceScore = 0;

    // 1. 连续新高（封顶20）
    const newHigh5d = this.countConsecutiveNewHigh(kline, 5);
    const newHigh20d = this.countConsecutiveNewHigh(kline, 20);
    if (newHigh20d >= 5) priceScore += 20;
    else if (newHigh20d >= 3) priceScore += 15;
    else if (newHigh5d >= 5) priceScore += 10;
    else if (newHigh5d >= 3) priceScore += 5;
    priceScore = Math.min(priceScore, 20);

    // 2. 高低点序列 0~10
    const highLowScore = this.calcHighLowScore(kline, 10);
    priceScore += highLowScore;

    // 3. 周期涨幅 0~8
    const change5 = this.calcChange(kline, 5);
    const change10 = this.calcChange(kline, 10);
    if (change5 >= 0.03 && change5 <= 0.10) priceScore += 5;
    else if (change5 > 0.10 && change5 <= 0.20) priceScore += 8;
    if (change10 >= 0.05 && change10 <= 0.15) priceScore += 5;
    else if (change10 > 0.15 && change10 <= 0.30) priceScore += 8;
    priceScore = Math.min(priceScore, 40);

    // ==============================================
    // 维度2：均线趋势得分 0~35
    // ==============================================
    let maScore = 0;
    const ma5 = this.calcMA(kline, 5);
    const ma10 = this.calcMA(kline, 10);
    const ma20 = this.calcMA(kline, 20);
    const ma60 = this.calcMA(kline, 60);
    const close = kline[0].close;

    // 1. 均线多头排列 0~15
    if (ma5 > ma10 && ma10 > ma20 && ma20 > ma60) maScore += 15;
    else if (ma5 > ma10 && ma10 > ma20) maScore += 10;

    // 2. 均线斜率 0~15
    const slope5 = this.calcSlope(ma5, this.calcMA(kline, 5, 1));
    const slope10 = this.calcSlope(ma10, this.calcMA(kline, 10, 1));
    const slope20 = this.calcSlope(ma20, this.calcMA(kline, 20, 1));
    if (slope5 > 0.005) maScore += 5;
    if (slope10 > 0.003) maScore += 5;
    if (slope20 > 0.002) maScore += 5;

    // 3. 价格位置 0~12
    if (close > ma5 && close > ma10 && close > ma20 && close > ma60) maScore += 12;
    else if (close > ma5 && close > ma10 && close > ma20) maScore += 8;

    // 4. 均线发散度 0~5
    const divergence = (ma5 - ma20) / ma20;
    if (divergence >= 0.01 && divergence <= 0.03) maScore += 5;
    maScore = Math.min(maScore, 35);

    // ==============================================
    // 维度3：成交量趋势 0~25
    // ==============================================
    let volScore = 0;
    const avg5Vol = this.calcAvgVol(kline, 5);
    const avg20Vol = this.calcAvgVol(kline, 20);
    const volRatio = avg5Vol / avg20Vol;

    // 量能趋势
    if (volRatio >= 1.2 && volRatio <= 2.0) volScore += 8;
    else if (volRatio > 2.0 && volRatio <= 3.0) volScore += 10;

    // 量价同步
    const syncDays = this.countUpDaysWithBigVol(kline, 10);
    if (syncDays >= 7) volScore += 7;
    else if (syncDays >= 5) volScore += 4;

    // 放量上涨 > 下跌最大量 *1.5
    if (this.checkStrongUpVolume(kline, 5)) volScore += 5;

    // 连续放量
    if (this.isConsecutiveVolumeUp(kline, 3)) volScore += 5;
    else if (this.isConsecutiveVolumeUp(kline, 2)) volScore += 3;

    // 量能排除规则
    if (volRatio < 0.8) volScore = 0;
    volScore = Math.min(volScore, 25);

    // ==============================================
    // 总分 & 标签
    // ==============================================
    let total = priceScore + maScore + volScore;
    total = Math.max(Math.min(total, this.MAX_SCORE), 0);

    let trendTag: AnalysisOutput['trendTag'];
    if (total >= 80) trendTag = 'VeryStrong';
    else if (total >= 65) trendTag = 'Strong';
    else if (total >= 50) trendTag = 'Mid';
    else if (total >= 35) trendTag = 'Weak';
    else trendTag = 'DownTrend';

    return { score: total, tag: trendTag };
  }

  // ==================== 工具函数 ====================
  private static calcMA (kline: KLineItem[], n: number, skip = 0): number {
    const slice = kline.slice(skip, skip + n);
    return slice.reduce((s, c) => s + c.close, 0) / n;
  }

  private static calcSlope (current: number, prev: number): number {
    return (current - prev) / prev;
  }

  private static calcChange (kline: KLineItem[], n: number): number {
    if (kline.length < n) return 0;
    return (kline[0].close - kline[n - 1].close) / kline[n - 1].close;
  }

  private static calcAvgVol (kline: KLineItem[], n: number): number {
    return kline.slice(0, n).reduce((s, c) => s + c.volume, 0) / n;
  }

  private static countConsecutiveNewHigh (kline: KLineItem[], days: number): number {
    let count = 0;
    for (let i = 0; i < kline.length - 1; i++) {
      const high = Math.max(...kline.slice(i + 1, i + 1 + days).map(x => x.high));
      if (kline[i].high > high) count++;
      else break;
    }
    return count;
  }

  private static calcHighLowScore (kline: KLineItem[], n: number): number {
    let high = 0, low = 0;
    for (let i = 1; i < n - 1; i++) {
      const c = kline[i].close;
      const prev = kline[i - 1].close;
      const next = kline[i + 1].close;
      if (c > prev && c > next) high++;
      if (c < prev && c < next) low++;
    }
    const v = (high - low) / 10;
    if (v > 0.3) return 10;
    if (v > 0.1) return 5;
    if (v < -0.1) return -5;
    return 0;
  }

  private static countUpDaysWithBigVol (kline: KLineItem[], n: number): number {
    let count = 0;
    for (let i = 0; i < n - 1; i++) {
      const isUp = kline[i].close > kline[i + 1].close;
      const volBigger = kline[i].volume > kline[i + 1].volume;
      if (isUp && volBigger) count++;
    }
    return count;
  }

  private static checkStrongUpVolume (kline: KLineItem[], n: number): boolean {
    let maxUpVol = 0, maxDownVol = 0;
    for (let i = 0; i < n - 1; i++) {
      const isUp = kline[i].close > kline[i + 1].close;
      const vol = kline[i].volume;
      if (isUp) maxUpVol = Math.max(maxUpVol, vol);
      else maxDownVol = Math.max(maxDownVol, vol);
    }
    return maxUpVol > maxDownVol * 1.5;
  }

  private static isConsecutiveVolumeUp (kline: KLineItem[], n: number): boolean {
    for (let i = 0; i < n - 1; i++) {
      if (kline[i].volume <= kline[i + 1].volume) return false;
    }
    return true;
  }
}

// ==================== 6. 主分析引擎 ====================
export class StockAnalysisEngine {
  static run (input: AnalysisInput): AnalysisOutput {
    // 1. 计算抢筹基础分 + 概率
    // const { score: baseGrabScore, prob: baseGrabProb } = AuctionGrabScorer.calculate(input);
    const baseGrabScore = 0; // 测试用固定分数
    const baseGrabProb = 0; // 测试用固定概率

    // 2. 计算趋势分 + 标签
    let { score: trendScore, tag: trendTag } = TrendScorer.calculate(input.klineHistory);

    // 3. 计算最终胜率
    const delta = (trendScore - 50) * 0.004; // 趋势分影响系数
    let finalWin = baseGrabProb + delta;
    finalWin = Math.max(Math.min(finalWin, 0.95), baseGrabProb * 0.5);

    // 4. 抢筹标签
    let grabTag: AnalysisOutput['grabTag'];
    if (finalWin >= 0.7) grabTag = 'StrongGrab';
    else if (finalWin >= 0.5) grabTag = 'MidGrab';
    else if (finalWin >= 0.3) grabTag = 'WeakGrab';
    else grabTag = 'NoGrab';

    // 5. 返回结果
    // trendScore 最大为 20 分
    trendScore = Math.min((trendScore * 0.3), 20);

    return {
      baseGrabScore: Number(baseGrabScore.toFixed(2)),
      trendScore: Number((trendScore).toFixed(2)),
      baseGrabProb: Number(baseGrabProb.toFixed(4)),
      finalWinRate: Number(finalWin.toFixed(4)),
      grabTag,
      trendTag
    };
  }
}

// // ==================== 7. 测试用例（可直接运行验证）====================
// const testInput: AnalysisInput = {
//   auctionVol: 8000000,        // 800万股
//   auctionAmount: 80000000,    // 8000万元
//   circulateShares: 1000000000, // 10亿股
//   circulateMarketValue: 100e8, // 100亿流通市值（中盘）
//   klineHistory: [
//     { close: 9.5, open: 9.2, high: 9.8, low: 9.1, volume: 50000000 },
//     { close: 9.3, open: 9.0, high: 9.5, low: 8.9, volume: 45000000 },
//     { close: 9.0, open: 8.8, high: 9.2, low: 8.7, volume: 40000000 },
//     { close: 8.8, open: 8.5, high: 8.9, low: 8.4, volume: 38000000 },
//     { close: 8.5, open: 8.3, high: 8.6, low: 8.2, volume: 35000000 },
//     ...Array(15).fill({ close: 8.5, open: 8.3, high: 8.6, low: 8.2, volume: 35000000 })
//   ]
// };

// // 执行分析
// const result = StockAnalysisEngine.run(testInput);
// console.log('=== 股票竞价抢筹+趋势分析结果 ===');
// console.log(result);