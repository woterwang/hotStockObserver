import { logger } from '../utils';
// ==================== 1. 类型定义（Input/Output Schema）====================
interface KLineItem {
  date: string; // 日期
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
export class TrendScorer {
  private static readonly MAX_SCORE = 100;
  private static readonly TREND_SCORE_MAX = 15;
  private static readonly ADAPTIVE_LOOKBACK = 120;

  /** 计算K线趋势得分 总分数 0-100分 最终压缩到0-30分 */
  static calculate (kline: KLineItem[]): { score: number; tag: AnalysisOutput['trendTag'] } {
    const normalizedKline = this.normalizeKlineOrder(kline);
    if (normalizedKline.length < 20) {
      return { score: 0, tag: 'DownTrend' };
    }

    // 打印当前使用的K线范围，归一化后固定为最新在前
    logger.info(`[TrendScorer] K线范围（最新->最早）：${normalizedKline[0].date} - ${normalizedKline[normalizedKline.length - 1].date}`);

    // ==============================================
    // 维度1：价格趋势得分 0~40
    // ==============================================
    let priceScore = 0;

    // 1. 连续新高（封顶20）
    const newHigh5d = this.countConsecutiveNewHigh(normalizedKline, 5);
    const newHigh20d = this.countConsecutiveNewHigh(normalizedKline, 20);
    if (newHigh20d >= 5) priceScore += 20;
    else if (newHigh20d >= 3) priceScore += 15;
    else if (newHigh5d >= 5) priceScore += 10;
    else if (newHigh5d >= 3) priceScore += 5;
    priceScore = Math.min(priceScore, 20);

    // 2. 高低点序列 0~10
    const highLowScore = this.calcHighLowScore(normalizedKline, 10);
    priceScore += highLowScore;

    // 3. 周期涨幅 0~8
    const change5 = this.calcChange(normalizedKline, 5);
    const change10 = this.calcChange(normalizedKline, 10);
    const change5Series = this.buildChangeSeries(normalizedKline, 5, this.ADAPTIVE_LOOKBACK);
    const change10Series = this.buildChangeSeries(normalizedKline, 10, this.ADAPTIVE_LOOKBACK);
    const change5Q60 = this.getQuantile(change5Series, 0.6, 0.03);
    const change5Q80 = this.getQuantile(change5Series, 0.8, 0.10);
    const change5Q95 = this.getQuantile(change5Series, 0.95, 0.20);
    const change10Q60 = this.getQuantile(change10Series, 0.6, 0.05);
    const change10Q80 = this.getQuantile(change10Series, 0.8, 0.15);
    const change10Q95 = this.getQuantile(change10Series, 0.95, 0.30);
    if (change5 >= change5Q80 && change5 <= change5Q95) priceScore += 8;
    else if (change5 >= change5Q60) priceScore += 5;
    if (change10 >= change10Q80 && change10 <= change10Q95) priceScore += 8;
    else if (change10 >= change10Q60) priceScore += 5;
    priceScore = Math.min(priceScore, 40);

    // ==============================================
    // 维度2：均线趋势得分 0~35
    // ==============================================
    let maScore = 0;
    const ma5 = this.calcMA(normalizedKline, 5);
    const ma10 = this.calcMA(normalizedKline, 10);
    const ma20 = this.calcMA(normalizedKline, 20);
    const ma60 = this.calcMA(normalizedKline, 60);
    const close = normalizedKline[0].close;

    // 1. 均线多头排列 0~15
    if (ma5 !== null && ma10 !== null && ma20 !== null) {
      if (ma60 !== null && ma5 > ma10 && ma10 > ma20 && ma20 > ma60) maScore += 15;
      else if (ma5 > ma10 && ma10 > ma20) maScore += 10;
    }

    // 2. 均线斜率 0~15
    const slope5 = this.calcSlope(ma5, this.calcMA(normalizedKline, 5, 1));
    const slope10 = this.calcSlope(ma10, this.calcMA(normalizedKline, 10, 1));
    const slope20 = this.calcSlope(ma20, this.calcMA(normalizedKline, 20, 1));
    const slope5Series = this.buildSlopeSeries(normalizedKline, 5, this.ADAPTIVE_LOOKBACK);
    const slope10Series = this.buildSlopeSeries(normalizedKline, 10, this.ADAPTIVE_LOOKBACK);
    const slope20Series = this.buildSlopeSeries(normalizedKline, 20, this.ADAPTIVE_LOOKBACK);
    const slope5Q60 = this.getQuantile(slope5Series, 0.6, 0.005);
    const slope5Q80 = this.getQuantile(slope5Series, 0.8, 0.008);
    const slope10Q60 = this.getQuantile(slope10Series, 0.6, 0.003);
    const slope10Q80 = this.getQuantile(slope10Series, 0.8, 0.005);
    const slope20Q60 = this.getQuantile(slope20Series, 0.6, 0.002);
    const slope20Q80 = this.getQuantile(slope20Series, 0.8, 0.0035);
    if (slope5 > slope5Q80) maScore += 5;
    else if (slope5 > slope5Q60) maScore += 3;
    if (slope10 > slope10Q80) maScore += 5;
    else if (slope10 > slope10Q60) maScore += 3;
    if (slope20 > slope20Q80) maScore += 5;
    else if (slope20 > slope20Q60) maScore += 3;

    // 3. 价格位置 0~12
    if (ma5 !== null && ma10 !== null && ma20 !== null) {
      if (ma60 !== null && close > ma5 && close > ma10 && close > ma20 && close > ma60) maScore += 12;
      else if (close > ma5 && close > ma10 && close > ma20) maScore += 8;
    }

    // 4. 均线发散度 0~5
    if (ma5 !== null && ma20 !== null && ma20 !== 0) {
      const divergence = (ma5 - ma20) / ma20;
      const divergenceSeries = this.buildMADivergenceSeries(normalizedKline, 5, 20, this.ADAPTIVE_LOOKBACK);
      const divergenceQ50 = this.getQuantile(divergenceSeries, 0.5, 0.01);
      const divergenceQ85 = this.getQuantile(divergenceSeries, 0.85, 0.03);
      if (divergence >= divergenceQ50 && divergence <= divergenceQ85) maScore += 5;
    }
    maScore = Math.min(maScore, 35);

    // ==============================================
    // 维度3：成交量趋势 0~25
    // ==============================================
    let volScore = 0;
    const avg5Vol = this.calcAvgVol(normalizedKline, 5);
    const avg20Vol = this.calcAvgVol(normalizedKline, 20);
    const volRatio = avg20Vol > 0 ? (avg5Vol / avg20Vol) : 0;
    const volRatioSeries = this.buildVolRatioSeries(normalizedKline, this.ADAPTIVE_LOOKBACK);
    const volQ30 = this.getQuantile(volRatioSeries, 0.3, 0.8);
    const volQ60 = this.getQuantile(volRatioSeries, 0.6, 1.2);
    const volQ80 = this.getQuantile(volRatioSeries, 0.8, 2.0);
    const volQ95 = this.getQuantile(volRatioSeries, 0.95, 3.0);

    // 量能趋势
    if (volRatio >= volQ80 && volRatio <= volQ95) volScore += 10;
    else if (volRatio >= volQ60) volScore += 8;

    // 量价同步
    const syncDays = this.countUpDaysWithBigVol(normalizedKline, 10);
    if (syncDays >= 7) volScore += 7;
    else if (syncDays >= 5) volScore += 4;

    // 放量上涨 > 下跌最大量 *1.5
    if (this.checkStrongUpVolume(normalizedKline, 5)) volScore += 5;

    // 连续放量
    if (this.isConsecutiveVolumeUp(normalizedKline, 3)) volScore += 5;
    else if (this.isConsecutiveVolumeUp(normalizedKline, 2)) volScore += 3;

    // 量能排除规则
    const weakVolThreshold = Math.min(volQ30, 0.9);
    if (volRatio < weakVolThreshold) volScore = 0;
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
    // 趋势评分映射为10分制，保留高分段区分度
    const trendScore = TrendScorer.toBuySignalScore(total, normalizedKline);
    logger.info(`[TrendScorer] 趋势评分: 总分${total} 转换为 ${trendScore}，其中价格评分占比为 ${priceScore}，均线评分占比为 ${maScore}，成交量评分占比为 ${volScore}`);
    return { score: trendScore, tag: trendTag };
  }

  static toBuySignalScore (rawTrendScore: number, kline: KLineItem[]): number {
    const normalizedKline = this.normalizeKlineOrder(kline);
    // 趋势评分映射为10分制，保留高分段区分度
    rawTrendScore = Math.round(rawTrendScore * 0.3);
    // // 如果是百日新高，给予额外加分

    // if (this.isHundredDayNewHigh(normalizedKline)) {
    //   logger.info(`[TrendScorer] 100日新高，直接给定最高趋势评分`);
    //   rawTrendScore += 5;
    // }

    // if (this.isSixtyDayNewHigh(normalizedKline)) {
    //   logger.info(`[TrendScorer] 60日新高，给予额外趋势评分`);
    //   rawTrendScore += 2;
    // }
    return rawTrendScore;
  }

  // 是否为百日新高
  static isHundredDayNewHigh (kline: KLineItem[]): boolean {
    const normalizedKline = this.normalizeKlineOrder(kline);
    if (normalizedKline.length < 100) return false;
    const recentKline = normalizedKline.slice(0, 100);
    const lineCount = recentKline.length;
    const currentLine = recentKline[0];
    const recentHigh = Math.max(...recentKline.slice(1).map(item => item.high));
    logger.info(`[TrendScorer] 最近${lineCount}日最高价: ${recentHigh}, 当日${currentLine.date}最高价格: ${currentLine.high}`);
    return currentLine.high >= recentHigh;
  }

  // 是否为60日新高
  static isSixtyDayNewHigh (kline: KLineItem[]): boolean {
    const normalizedKline = this.normalizeKlineOrder(kline);
    if (normalizedKline.length < 60) return false;
    const recentKline = normalizedKline.slice(0, 60);
    const lineCount = recentKline.length;
    const currentLine = recentKline[0];
    const recentHigh = Math.max(...recentKline.slice(1).map(item => item.high));
    logger.info(`[TrendScorer] 最近${lineCount}日最高价: ${recentHigh}, 当日${currentLine.date}最高价格: ${currentLine.high}`);
    return currentLine.high >= recentHigh;
  }

  // 是否为20日新高
  static isTwentyDayNewHigh (kline: KLineItem[]): boolean {
    const normalizedKline = this.normalizeKlineOrder(kline);
    if (normalizedKline.length < 20) return false;
    const recentKline = normalizedKline.slice(0, 20);
    const lineCount = recentKline.length;
    const currentLine = recentKline[0];
    const recentHigh = Math.max(...recentKline.slice(1).map(item => item.high));
    logger.info(`[TrendScorer] 最近${lineCount}日最高价: ${recentHigh}, 当日${currentLine.date}最高价格: ${currentLine.high}`);
    return currentLine.high >= recentHigh;
  }

  // ==================== 工具函数 ====================
  static normalizeKlineOrder (kline: KLineItem[] | null | undefined): KLineItem[] {
    if (!Array.isArray(kline) || kline.length === 0) {
      return [];
    }

    if (kline.length === 1) {
      return kline;
    }

    const firstDate = this.getDateSortKey(kline[0]?.date);
    const lastDate = this.getDateSortKey(kline[kline.length - 1]?.date);
    if (Number.isFinite(firstDate) && Number.isFinite(lastDate) && firstDate < lastDate) {
      logger.info(`[TrendScorer] 检测到升序K线，已自动转换为倒序`);
      return [...kline].reverse();
    }

    return kline;
  }

  static getDateSortKey (date: string | undefined): number {
    if (!date) return Number.NaN;

    const normalized = String(date).replace(/\D/g, '');
    if (normalized) {
      const numeric = Number(normalized);
      if (Number.isFinite(numeric)) {
        return numeric;
      }
    }

    const timestamp = Date.parse(String(date));
    return Number.isFinite(timestamp) ? timestamp : Number.NaN;
  }

  static calcMA (kline: KLineItem[], n: number, skip = 0): number | null {
    if (kline.length < skip + n) return null;
    const slice = kline.slice(skip, skip + n);
    if (slice.length === 0) return null;
    return slice.reduce((s, c) => s + c.close, 0) / slice.length;
  }

  static calcSlope (current: number | null, prev: number | null): number {
    if (current === null || prev === null || prev === 0) return 0;
    return (current - prev) / prev;
  }

  static calcChange (kline: KLineItem[], n: number): number {
    if (kline.length < n) return 0;
    return (kline[0].close - kline[n - 1].close) / kline[n - 1].close;
  }

  static calcAvgVol (kline: KLineItem[], n: number, skip = 0): number {
    const slice = kline.slice(skip, skip + n);
    if (slice.length === 0) return 0;
    return slice.reduce((s, c) => s + c.volume, 0) / slice.length;
  }

  static countConsecutiveNewHigh (kline: KLineItem[], days: number): number {
    let count = 0;
    for (let i = 0; i + days < kline.length; i++) {
      const window = kline.slice(i + 1, i + 1 + days);
      if (window.length < days) break;
      const high = Math.max(...window.map(x => x.high));
      if (kline[i].high > high) {
        count++;
      } else {
        break;
      }
    }
    return count;
  }

  static calcHighLowScore (kline: KLineItem[], n: number): number {
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

  static countUpDaysWithBigVol (kline: KLineItem[], n: number): number {
    let count = 0;
    for (let i = 0; i < n - 1; i++) {
      const isUp = kline[i].close > kline[i + 1].close;
      const volBigger = kline[i].volume > kline[i + 1].volume;
      if (isUp && volBigger) count++;
    }
    return count;
  }

  static checkStrongUpVolume (kline: KLineItem[], n: number): boolean {
    let maxUpVol = 0, maxDownVol = 0;
    for (let i = 0; i < n - 1; i++) {
      const isUp = kline[i].close > kline[i + 1].close;
      const vol = kline[i].volume;
      if (isUp) maxUpVol = Math.max(maxUpVol, vol);
      else maxDownVol = Math.max(maxDownVol, vol);
    }
    return maxUpVol > maxDownVol * 1.5;
  }

  static isConsecutiveVolumeUp (kline: KLineItem[], n: number): boolean {
    for (let i = 0; i < n - 1; i++) {
      if (kline[i].volume <= kline[i + 1].volume) return false;
    }
    return true;
  }

  static getQuantile (values: number[], quantile: number, fallback: number): number {
    if (!values || values.length === 0) return fallback;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * quantile)));
    const value = sorted[idx];
    return Number.isFinite(value) ? value : fallback;
  }

  static buildChangeSeries (kline: KLineItem[], n: number, lookback: number): number[] {
    const series: number[] = [];
    const maxOffset = Math.min(lookback, kline.length - n);
    for (let offset = 1; offset <= maxOffset; offset++) {
      const current = kline[offset - 1]?.close;
      const base = kline[offset + n - 1]?.close;
      if (!current || !base || base === 0) continue;
      series.push((current - base) / base);
    }
    return series;
  }

  static buildSlopeSeries (kline: KLineItem[], maPeriod: number, lookback: number): number[] {
    const series: number[] = [];
    for (let offset = 1; offset <= lookback; offset++) {
      const current = this.calcMA(kline, maPeriod, offset - 1);
      const prev = this.calcMA(kline, maPeriod, offset);
      const slope = this.calcSlope(current, prev);
      if (Number.isFinite(slope)) series.push(slope);
    }
    return series;
  }

  static buildVolRatioSeries (kline: KLineItem[], lookback: number): number[] {
    const series: number[] = [];
    for (let offset = 0; offset < lookback; offset++) {
      const avg5 = this.calcAvgVol(kline, 5, offset);
      const avg20 = this.calcAvgVol(kline, 20, offset);
      if (avg20 <= 0) continue;
      const ratio = avg5 / avg20;
      if (Number.isFinite(ratio)) series.push(ratio);
    }
    return series;
  }

  static buildMADivergenceSeries (kline: KLineItem[], shortPeriod: number, longPeriod: number, lookback: number): number[] {
    const series: number[] = [];
    for (let offset = 0; offset < lookback; offset++) {
      const shortMA = this.calcMA(kline, shortPeriod, offset);
      const longMA = this.calcMA(kline, longPeriod, offset);
      if (shortMA === null || longMA === null || longMA === 0) continue;
      const divergence = (shortMA - longMA) / longMA;
      if (Number.isFinite(divergence)) series.push(divergence);
    }
    return series;
  }

  static calcMACD (kline: KLineItem[], shortPeriod: number, longPeriod: number, signalPeriod: number, offset: number): number {
    const shortMA = this.calcMA(kline, shortPeriod, offset);
    const longMA = this.calcMA(kline, longPeriod, offset);
    const macd = shortMA - longMA;
  }
}