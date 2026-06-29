/**
 * 买入信号服务
 * 
 * 核心功能：
 * 1. 根据选股结果，在T+1日开盘时判断买入时机
 * 2. 计算买入信号评分
 * 3. 生成买入建议和风险提示
 * 4. 跟踪买入后的收益情况
 * 
 * 支持多策略:
 * - volume_surge: 放量突破策略
 * - breakthrough: 价格突破策略
 * - limit_up: 涨停板策略
 * - ma_crossover: 均线金叉策略
 */

import dayjs from 'dayjs';
import axios from 'axios';
import { BuySignal, IBuySignal } from '../models/BuySignal';
import { VolumeSurge } from '../models/VolumeSurge';
import { PriceBreakthrough } from '../models/PriceBreakthrough';
import { ConceptResonance } from '../models/ConceptResonance';
import { tradingCalendarService } from './tradingCalendarService';
import { marketMoodService } from './marketMoodService';
import { klineCacheService, CachedKline, fetchTencentRealTimeQuotes } from './klineCacheService';
import { logger } from '../utils';
import { writeToFile } from '../utils/writeToFile';
import { getStockTrendMinute } from './stockTrendService';
import { TrendScorer } from './TrendScorerService';
import { thsConceptHotRankService } from './thsConceptHotRankService';

// 策略类型定义
type StrategyType = 'volume_surge' | 'breakthrough' | 'limit_up' | 'ma_crossover' | 'concept_resonance' | 'hundred_day_high';

// 策略名称映射
const STRATEGY_NAMES: Record<StrategyType, string> = {
  volume_surge: '放量突破',
  breakthrough: '价格突破',
  limit_up: '涨停板',
  ma_crossover: '均线金叉',
  concept_resonance: '主线共振',
  hundred_day_high: '百日新高',
};

// 候选标的接口（统一各策略的数据结构）
interface StrategyCandidate {
  _id: string;
  stockCode: string;
  stockName: string;
  date: string;            // 日期字符串 YYYYMMDD
  strategyType: StrategyType;
  strategyName: string;
  score: number;           // 策略得分
  industry?: string;       // 行业/板块
  changePercent?: number;  // 当日涨幅
  strategyScore: number;  // 基础分
  marketMood?: number;     // 主线共振策略特有字段
  volumeRatio?: number;   // 当日成交量占比
}

// 格式化日期为 YYYYMMDD 字符串
function formatDateStr (date: Date | string): string {
  if (typeof date === 'string') {
    return date.replace(/-/g, '').slice(0, 8);
  }
  return dayjs(date).format('YYYYMMDD');
}

/**
 * 买入信号评分算法
 */
class BuySignalScorer {

  /**
   * 开盘强度评分 (满分30分)
   * 理想开盘涨幅：1% ~ 5%
   * - 过低(<1%): 资金不认可，信心不足
   * - 过高(>5%): 追高风险，获利盘抛压
   */
  static scoreOpenStrength (openChangePercent: number): { score: number; reason: string } {
    if (openChangePercent >= 1 && openChangePercent <= 3) {
      return { score: 30, reason: '开盘涨幅理想(1-3%)，强势延续且不追高' };
    } else if (openChangePercent > 3 && openChangePercent <= 5) {
      return { score: 20, reason: '开盘偏高(3-5%)，需注意追高风险' };
    } else if (openChangePercent > 5 && openChangePercent <= 7) {
      return { score: 15, reason: '开盘过高(5-7%)，追高风险较大' };
    } else if (openChangePercent > 7) {
      return { score: 5, reason: '开盘大幅高开(>7%)，不建议追高' };
    } else if (openChangePercent >= 0 && openChangePercent < 1) {
      return { score: 20, reason: '开盘平开(0-1%)，资金态度中性' };
    } else if (openChangePercent >= -2 && openChangePercent < 0) {
      return { score: 15, reason: '开盘小幅低开(-2~0%)，可能有低吸机会' };
    } else {
      return { score: 5, reason: '开盘大幅低开(<-2%)，资金不认可' };
    }
  }

  /**
   * 量能确认评分 (满分15分)
   * 开盘量比 >= 1.5 说明资金延续
   */
  static scoreVolumeConfirm (openVolumeRatio: number): { score: number; reason: string } {
    if (openVolumeRatio >= 3) {
      return { score: 15, reason: '开盘量比极高(≥3)，资金强势涌入' };
    } else if (openVolumeRatio >= 2) {
      return { score: 12, reason: '开盘量比较高(2-3)，资金延续良好' };
    } else if (openVolumeRatio >= 1.5) {
      return { score: 10, reason: '开盘量比正常(1.5-2)，有资金关注' };
    } else if (openVolumeRatio >= 1) {
      return { score: 6, reason: '开盘量比一般(1-1.5)，资金关注度一般' };
    } else {
      return { score: 2, reason: '开盘量比偏低(<1)，资金关注不足' };
    }
  }

  /**
   * 竞价抢筹评分 (满分15分)
   * 竞价金额占昨日成交额的比例
   */
  static scoreAuction (auctionAmountRatio: number): { score: number; reason: string } {
    if (auctionAmountRatio >= 5) {
      return { score: 15, reason: '竞价金额占比极高(≥5%)，主力大幅抢筹' };
    } else if (auctionAmountRatio >= 3) {
      return { score: 12, reason: '竞价金额占比较高(3-5%)，有主力抢筹迹象' };
    } else if (auctionAmountRatio >= 2) {
      return { score: 8, reason: '竞价金额占比正常(2-3%)' };
    } else if (auctionAmountRatio >= 1) {
      return { score: 5, reason: '竞价金额占比一般(1-2%)' };
    } else {
      return { score: 2, reason: '竞价金额占比偏低(<1%)' };
    }
  }

  /**
   * 大盘环境评分 (满分10分)
   */
  /**************************** CodeGeeX Inline Diff ****************************/
  static scoreMarketEnv (indexOpenChange: number, marketMood: number): { score: number; reason: string } {
    let envScore = 0;
    let scoreReasons: string[] = [];
    let score = 0;
    let reasons: string[] = [];

    // 指数开盘涨跌
    if (indexOpenChange >= 0.5) {
      envScore += 5;
      scoreReasons.push('大盘高开');
      score += 5;
      reasons.push('大盘高开');
    } else if (indexOpenChange >= 0) {
      envScore += 4;
      scoreReasons.push('大盘平开');
      score += 4;
      reasons.push('大盘平开');
    } else if (indexOpenChange >= -0.5) {
      envScore += 2;
      scoreReasons.push('大盘小幅低开');
      score += 2;
      reasons.push('大盘小幅低开');
    } else {
      envScore += 0;
      scoreReasons.push('大盘大幅低开');
      score += 0;
      reasons.push('大盘大幅低开');
    }

    // 市场情绪
    if (marketMood >= 70) {
      envScore += 5;
      scoreReasons.push('市场情绪高涨');
      score += 5;
      reasons.push('市场情绪高涨');
    } else if (marketMood >= 50) {
      envScore += 3;
      scoreReasons.push('市场情绪中性');
      score += 3;
      reasons.push('市场情绪中性');
    } else {
      envScore += 1;
      scoreReasons.push('市场情绪低迷');
      score += 1;
      reasons.push('市场情绪低迷');
    }

    return { score: envScore, reason: scoreReasons.join('，') };
  }
  /******************** 68b39ebf-3dbe-4cad-93b7-7b18dbf718ca ********************/

  /**
   * 板块联动评分 (满分10分)
   */
  static async scoreSectorLink (stockCode: string, signalDateStr: string, targetDateStr: string): Promise<{ score: number; reason: string }> {
    let score = 0;
    let reasons: string[] = [];

    // 第一步：根据stockCode与dateStr从volumeSurges获取concept数据
    const volumeSurgeData = await VolumeSurge.find({ date: signalDateStr, stockCode: stockCode });
    // logger.info(`[BuySignal] scoreSectorLink 获取 ${stockCode} 在 ${signalDateStr} 的 VolumeSurge 数据: ${volumeSurgeData.length} 条`);
    const conceptsArr = stockCode && volumeSurgeData.length > 0 ? volumeSurgeData[0].concept || '' : '';
    // logger.info(`[BuySignal] scoreSectorLink 获取 ${stockCode} 在 ${signalDateStr} 的 ${JSON.stringify(volumeSurgeData)} 数据: ${conceptsArr}`);
    const concepts = conceptsArr.split(';');
    // logger.info(`[BuySignal] scoreSectorLink 1 获取 ${stockCode} 在 ${signalDateStr} 的 ${JSON.stringify(concepts)} 数据: ${concepts}`);
    // logger.info(`[BuySignal] scoreSectorLink 获取 ${stockCode} 在 ${dateStr} 的 ${JSON.stringify(concepts)} 数据: ${concepts}`);

    // 第二步：获取当天的热门概念排行数据
    // 尝试获取 volumeSurge 当天的热门概念数据，如果没有直接返回0分
    const signalDayConceptData = thsConceptHotRankService.readFromCache(`${signalDateStr}_concept`)
    if (!signalDayConceptData) {
      return { score: 0, reason: '未获取到 signalDateStr 的 concept 数据, 不进行 sectorLink 评分' };
    }
    const conceptData = thsConceptHotRankService.readFromCache(`${targetDateStr}_concept`)
    // logger.info(`[BuySignal] scoreSectorLink 获取 ${targetDateStr} 的数据： ${JSON.stringify(conceptData?.items)}`);
    // 取前10个概念
    const topConcepts: string[] = conceptData?.items.slice(0, 10).map((item: any) => item.name) || [];
    // logger.info(`[BuySignal] scoreSectorLink 2 获取 ${targetDateStr} 的 ${JSON.stringify(topConcepts)} 数据: ${topConcepts}`);
    // logger.info(`[BuySignal] scoreSectorLink 获取 ${dateStr} 的 ${JSON.stringify(topConcepts)} 数据: ${topConcepts}`);

    // 第三步：判断concepts是否在热门概念中，如果不在前三个热门概念中则扣分
    if (concepts.length > 0) {
      const matchedConcepts = concepts.filter((concept: string) => topConcepts.includes(concept));
      if (matchedConcepts.length < 1) {
        score -= 15;
        reasons.push('未在热门概念中，扣30分');
      } else {
        reasons.push(`匹配热门概念: ${matchedConcepts.join('、')}`);
      }
    } else {
      score = 0;
      reasons.push('不属于任何概念');
    }

    return { score: score, reason: reasons.join('，') };
  }

  /**
   * 承接力度评分 (满分10分) - 涨停股专用
   */
  static scoreSealStrength (
    isLimitUp: boolean,
    sealRatio?: number,
    openTimes?: number
  ): { score: number; reason: string } {
    if (!isLimitUp) {
      // 非涨停股，给基础分
      return { score: 5, reason: '非涨停股，承接力度中性' };
    }

    let score = 0;
    let reasons: string[] = [];

    // 封单比例
    if (sealRatio && sealRatio >= 5) {
      score += 6;
      reasons.push('封单比例极高(≥5倍)');
    } else if (sealRatio && sealRatio >= 2) {
      score += 4;
      reasons.push('封单比例较高(2-5倍)');
    } else if (sealRatio && sealRatio >= 1) {
      score += 2;
      reasons.push('封单比例一般(1-2倍)');
    } else {
      score += 0;
      reasons.push('封单比例偏低');
    }

    // 开板次数
    if (openTimes === 0) {
      score += 4;
      reasons.push('一字板未开');
    } else if (openTimes === 1) {
      score += 3;
      reasons.push('仅开板1次');
    } else if (openTimes && openTimes <= 3) {
      score += 1;
      reasons.push('多次开板');
    } else {
      score += 0;
      reasons.push('开板频繁');
    }

    return { score: Math.min(score, 10), reason: reasons.join('，') };
  }

  /**
   * 技术位置评分 (满分10分)
   */
  static scoreTechnical (
    distanceToMa5: number,
    distanceToMa10: number,
    distanceToPressure: number
  ): { score: number; reason: string } {
    let score = 0;
    let reasons: string[] = [];

    // 距离5日均线
    if (distanceToMa5 >= 0 && distanceToMa5 <= 5) {
      score += 3;
      reasons.push('贴近5日均线支撑');
    } else if (distanceToMa5 > 5 && distanceToMa5 <= 10) {
      score += 2;
      reasons.push('略高于5日均线');
    } else if (distanceToMa5 > 10) {
      score += 0;
      reasons.push('远离5日均线(短期超买)');
    } else {
      score += 1;
      reasons.push('跌破5日均线');
    }

    // 距离10日均线
    if (distanceToMa10 >= 0 && distanceToMa10 <= 8) {
      score += 3;
      reasons.push('10日均线支撑有效');
    } else if (distanceToMa10 > 8) {
      score += 1;
      reasons.push('短期涨幅较大');
    } else {
      score += 0;
      reasons.push('跌破10日均线');
    }

    // 距离压力位
    if (distanceToPressure >= 5) {
      score += 4;
      reasons.push('上方无明显压力');
    } else if (distanceToPressure >= 2) {
      score += 2;
      reasons.push('距离压力位较近');
    } else {
      score += 0;
      reasons.push('逼近压力位(套牢盘抛压)');
    }

    return { score: Math.min(score, 10), reason: reasons.join('，') };
  }
}

/**
 * 买入信号服务
 */
class BuySignalService {

  /**
   * 从放量突破策略获取候选股票
   * @param selectionDate 选股日期 YYYYMMDD
   * @param minScore 最低分数门槛，默认50
   */
  private async getVolumeSurgeCandidates (selectionDate: string, minScore: number = 50): Promise<StrategyCandidate[]> {
    const records = await VolumeSurge.find({
      date: selectionDate,
      strategyScore: { $gte: minScore },
    }).sort({ strategyScore: -1 });

    return records.map(r => ({
      _id: r._id.toString(),
      stockCode: r.stockCode,
      stockName: r.stockName,
      date: r.date,
      strategyType: 'volume_surge' as StrategyType,
      strategyName: STRATEGY_NAMES.volume_surge,
      score: r.strategyScore || 0,
      industry: r.industry || '',
      changePercent: r.changePercent,
      strategyScore: r.strategyScore || 0,
      volumeRatio: r.volumeRatio || 0,
      marketMood: r?.marketSentimentScore ?? 0,
    }));
  }

  /**
   * 从价格突破策略获取候选股票
   */
  private async getBreakthroughCandidates (selectionDate: string): Promise<StrategyCandidate[]> {
    const records = await PriceBreakthrough.find({
      date: selectionDate,
      turnoverRatio: { $gte: 1.5 },  // 放量突破
    }).sort({ turnoverRatio: -1 });

    return records.map(r => ({
      _id: r._id.toString(),
      stockCode: r.stockCode,
      stockName: r.stockName,
      date: r.date,
      strategyType: 'breakthrough' as StrategyType,
      strategyName: STRATEGY_NAMES.breakthrough,
      score: Math.min(100, Math.round(r.turnoverRatio * 30)),  // 根据放量比例评分
      industry: r.sector || '',
      changePercent: r.changePercent,
      strategyScore: Math.min(100, Math.round(r.turnoverRatio * 30)),
    }));
  }

  /**
   * 从主线共振策略获取候选股票
   * @param selectionDate 选股日期 YYYYMMDD
   * @param minScore 最低分数门槛，默认60（主线共振策略评分范围更大）
   */
  private async getConceptResonanceCandidates (selectionDate: string, minScore: number = 60): Promise<StrategyCandidate[]> {
    const records = await ConceptResonance.find({
      date: selectionDate,
      strategyScore: { $gte: minScore },
    }).sort({ strategyScore: -1 });

    return records.map(r => ({
      _id: r._id.toString(),
      stockCode: r.stockCode,
      stockName: r.stockName,
      date: r.date,
      strategyType: 'concept_resonance' as StrategyType,
      strategyName: STRATEGY_NAMES.concept_resonance,
      score: r.strategyScore || 0,
      industry: r.industry || '',
      changePercent: r.changePercent,
      // 扩展字段，供后续使用
      primaryConcept: r.primaryConcept,
      isConceptLeader: r.isConceptLeader,
      conceptScore: r.conceptScore,
      strategyScore: r.strategyScore || 0,
    }));
  }

  /**
   * 获取所有策略的候选股票
   * @param selectionDate 选股日期 YYYYMMDD
   * @param strategies 策略类型列表，默认只使用 volume_surge
   * @param minScore 最低分数门槛，默认50
   */
  private async getAllCandidates (
    selectionDate: string,
    strategies?: StrategyType[],
    minScore: number = 50
  ): Promise<StrategyCandidate[]> {
    // 默认只使用 volume_surge 策略
    // breakthrough 策略有独立的入场逻辑（day3本身就是入场日），不在此处理
    const allStrategies: StrategyType[] = strategies || ['volume_surge'];
    const candidatePromises: Promise<StrategyCandidate[]>[] = [];

    if (allStrategies.includes('volume_surge')) {
      candidatePromises.push(this.getVolumeSurgeCandidates(selectionDate, minScore));
    }
    if (allStrategies.includes('breakthrough')) {
      candidatePromises.push(this.getBreakthroughCandidates(selectionDate));
    }
    if (allStrategies.includes('concept_resonance')) {
      // 主线共振策略评分范围更大，适当提高门槛
      candidatePromises.push(this.getConceptResonanceCandidates(selectionDate, Math.max(minScore, 60)));
    }
    // 可以继续添加更多策略...

    const results = await Promise.all(candidatePromises);
    const allCandidates = results.flat();

    // 去重（同一股票可能被多个策略选中，保留得分最高的）
    const uniqueMap = new Map<string, StrategyCandidate>();
    for (const candidate of allCandidates) {
      const key = candidate.stockCode;
      const existing = uniqueMap.get(key);
      if (!existing || candidate.score > existing.score) {
        uniqueMap.set(key, candidate);
      }
    }

    return Array.from(uniqueMap.values()).sort((a, b) => b.score - a.score);
  }

  /**
   * 生成买入信号
   * 在T+1日开盘前/开盘时调用
   * @param dateStr 信号日期（T+1日）
   * @param strategies 可选，指定要处理的策略类型
   * @param minScore 可选，最低分数门槛，默认50
   */
  async generateBuySignals (dateStr: string, strategies?: StrategyType[], minScore: number = 0): Promise<IBuySignal[]> {
    logger.info(`[BuySignal] 开始生成 ${dateStr} 的买入信号，策略: ${strategies || '默认'}, 最低分数: ${minScore}`);
    // 检查信号日期是否为交易日
    if (!tradingCalendarService.isTradingDay(dateStr)) {
      logger.info(`[BuySignal] ${dateStr} 不是交易日，跳过生成`);
      return [];
    }
    // 获取前一个交易日（使用交易日历服务，支持节假日）
    const prevTradingDay = tradingCalendarService.getPrevTradingDay(dateStr);

    // 如果数据库有今日的数据直接返回
    const existingCount = await BuySignal.countDocuments({ date: formatDateStr(dateStr) });
    if (existingCount > 0) {
      logger.info(`[BuySignal] ${dateStr} 已存在 ${existingCount} 条买入信号数据，跳过生成`);
      return await BuySignal.find({ date: formatDateStr(dateStr) });
    }

    // 如果小于 9.26 分，直接返回空
    const now = new Date();
    if (dayjs().format('YYYYMMDD') == dateStr && (now.getHours() < 9 || (now.getHours() === 9 && now.getMinutes() < 26))) {
      logger.info(`[BuySignal] 当前时间 ${now.getHours()}:${now.getMinutes()} 小于 9:26，跳过生成`);
      return [];
    }

    // 直接使用字符串日期
    const signalDate = formatDateStr(dateStr);

    if (!prevTradingDay) {
      logger.info(`[BuySignal] 无法获取 ${dateStr} 的前一个交易日，跳过生成`);
      return [];
    }

    // 🔒 检查前一交易日的 VolumeSurge 数据是否存在
    // 避免在选股数据未生成时使用错误的历史数据
    const volumeSurgeCount = await VolumeSurge.countDocuments({ date: prevTradingDay });
    if (volumeSurgeCount === 0) {
      logger.info(`[BuySignal] ⚠️ ${prevTradingDay} 的 VolumeSurge 数据尚未生成，无法为 ${dateStr} 生成买入信号`);
      logger.info(`[BuySignal] 请等待 ${prevTradingDay} 收盘后数据更新，或手动触发选股扫描`);
      return [];
    }
    logger.info(`[BuySignal] ${prevTradingDay} 有 ${volumeSurgeCount} 条 VolumeSurge 数据`);

    // 获取前一天的选股结果（支持多策略）
    const candidates = await this.getAllCandidates(prevTradingDay, strategies, minScore);

    if (candidates.length === 0) {
      logger.info(`[BuySignal] ${dateStr} 无可处理的候选标的（可能分数低于阈值 ${minScore}）`);
      return [];
    }

    logger.info(`[BuySignal] ${dateStr} 发现 ${candidates.length} 个候选标的`);

    // 串行处理，每个请求间隔300ms，避免被封IP
    const signals: IBuySignal[] = [];

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      try {
        const signal = await this.generateSignalForStock(candidate, signalDate);
        if (signal) {
          signals.push(signal);
        }
      } catch (error) {
        console.error(`[BuySignal] 处理 ${candidate.stockCode} 失败:`, error);
      }
    }

    // 批量保存（使用bulkWrite提升性能）
    if (signals.length > 0) {
      const bulkOps = signals.map(signal => {
        const { _id, ...signalWithoutId } = signal;
        return {
          updateOne: {
            filter: { date: signal.date, stockCode: signal.stockCode },
            update: { $set: signalWithoutId },
            upsert: true,
          }
        };
      });
      await BuySignal.bulkWrite(bulkOps);
      logger.info(`[BuySignal] 已保存 ${signals.length} 条买入信号`);
    }

    return signals;
  }

  /**
   * 为单个股票生成买入信号
   */
  async generateSignalForStock (
    candidate: StrategyCandidate,
    signalDate: string  // YYYYMMDD 格式
  ): Promise<IBuySignal | null> {
    // 获取开盘数据，若为今日且为交易日，优先用腾讯实时行情
    let openData = null;
    if (!tradingCalendarService.isTradingDay(signalDate)) {
      logger.info(`[BuySignal] ${signalDate} 不是交易日，无法获取开盘数据`);
      return null;
    }
    openData = await this.getOpeningData(candidate.stockCode, candidate.date, signalDate);
    if (!openData) {
      logger.info(`[BuySignal] generateSignalForStock ${candidate.stockCode} 无法获取开盘数据`);
      return null;
    }
    // 获取下一交易日
    const nextTradingDay = tradingCalendarService.getNextTradingDay(candidate.date);

    // 获取技术位置
    const technicalData = await this.getTechnicalPosition(candidate.stockCode, openData.openPrice, candidate.date);

    //板块联动
    const sectorLink = await BuySignalScorer.scoreSectorLink(candidate.stockCode, candidate.date, nextTradingDay || signalDate);

    //修正引线评分
    const shadowScore = await this.getShadowScore(candidate.stockCode, candidate.date);
    candidate.strategyScore += shadowScore.score;

    //竞价评分
    const openDataScore = await this.getAuctionScore({
      openChangePercent: openData.openChangePercent,
      openVolumeRatio: openData.openVolumeRatio,
      dateStr: candidate.date,
      stockCode: candidate.stockCode
    })

    // 计算总分
    let totalBuyScore =
      sectorLink.score +
      (openDataScore.score * 0.3) +
      (candidate.strategyScore * 0.5) +
      (((candidate?.marketMood ?? 50) / 10) * 2)

    // 竞价评分为0时直接淘汰
    if (openDataScore.score < 0) {
      logger.info(`[BuySignal] ${candidate.stockCode} 竞价评分为0，跳过生成买入信号`);
      totalBuyScore = 0;
    }

    // 生成买入决策
    const decision = this.generateDecision(totalBuyScore, openData, candidate);

    // 收集风险提示
    const riskWarnings = [
      `当日板块联动评分为 ${sectorLink.score} 分，原因为：${sectorLink.reason}`,
      `开盘数据评分为 ${openDataScore.score} 分，压缩后：${(openDataScore.score * 0.3)}，原因为：${openDataScore.reason}`,
      `策略得分为 ${candidate.strategyScore} 分，压缩后：${(candidate.strategyScore * 0.5)}，原因为：${candidate.strategyName}`,
      `当前市场情绪评分为 ${candidate.marketMood ?? 0} 分，压缩后：${(((candidate?.marketMood ?? 50) / 10) * 2)}`,
      // 可以继续添加其他维度的风险提示
    ];

    // 构建买入理由
    const buyReason = [
      openDataScore.reason,
      sectorLink.reason,
      shadowScore.reason,
    ].filter(r => r).join('；');

    const signal: IBuySignal = {
      date: signalDate,
      stockCode: candidate.stockCode,
      stockName: candidate.stockName,

      strategyType: candidate.strategyType,
      strategyName: candidate.strategyName,
      sourceId: candidate._id,
      selectionDate: candidate.date,
      selectionScore: candidate.score || 0,

      openPrice: openData.openPrice,
      openChangePercent: openData.openChangePercent,
      openVolumeRatio: openData.openVolumeRatio,
      auctionAmount: openData.auctionAmount,
      auctionAmountRatio: openData.auctionAmountRatio,
      volumeRatio: candidate.volumeRatio || 0,

      indexOpenChange: 0, // marketEnv.indexOpenChange,
      indexMorningTrend: "flat",
      marketMood: candidate.marketMood ?? 0,

      sectorName: candidate.industry || '',
      sectorOpenChange: 0,
      sectorLimitUpCount: 0,
      sectorLeader: true,

      isLimitUp: openData.isLimitUp,
      sealAmount: openData.sealAmount,
      sealRatio: openData.sealRatio,
      openTimes: parseInt(openData.openTimes?.toString() || '0', 10),

      distanceToMa5: technicalData.distanceToMa5,
      distanceToMa10: technicalData.distanceToMa10,
      distanceToMa20: technicalData.distanceToMa20,
      distanceToPressure: technicalData.distanceToPressure,

      openStrengthScore: openDataScore.score,
      volumeConfirmScore: openDataScore.score,
      auctionScore: 0,
      marketEnvScore: candidate.marketMood ?? 0,
      sectorLinkScore: sectorLink.score,
      sealStrengthScore: 0,
      technicalScore: 0,
      trendScore: 0,
      totalBuyScore,

      buySignal: decision.signal,
      suggestedPosition: decision.position,
      suggestedPrice: decision.price,
      stopLossPrice: decision.stopLoss,
      takeProfitPrice: decision.takeProfit,
      buyReason,
      riskWarning: riskWarnings,

      executed: false,
      resultStatus: 'pending',
    };

    return signal;
  }

  async getShadowScore (stockCode: string, dateStr: string): Promise<{
    score: number;
    reason: string;
  }> {
    let rawKlineData = await klineCacheService.fetchKlineByDate(stockCode, dateStr);
    let baseScore = 0;
    let reason = '';
    if (!rawKlineData || rawKlineData.length === 0) {
      logger.info(`[BuySignal] getOpeningData ${stockCode} 无K线数据`);
      return {
        score: 0,
        reason: '无K线数据',
      };
    }
    const preKlineData = rawKlineData.find(k => k.date === dateStr);
    if (!preKlineData) {
      return {
        score: 0,
        reason: `无 ${dateStr} K线数据`,
      };
    }

    // 计算上影线
    const upperShadow = preKlineData.high - preKlineData.low > 0 ? (preKlineData.high - preKlineData.close) / (preKlineData.high - preKlineData.low) : 0;

    // 上影线比例	得分
    // ≤ 1.5%	    8
    // ≤ 3.0%	    6
    // ≤ 4.5%	    3
    // > 4.5%	    0
    if (upperShadow <= 1.5) {
      baseScore += 8;
      reason = (`无长上影线 ${upperShadow} ≤ 1.5%，+8分`);
    } else if (upperShadow <= 3) {
      baseScore += 6;
      reason = (`上影线 ${upperShadow} ≤ 3.0%，+6分`);
    } else if (upperShadow <= 4.5) {
      baseScore += 3;
      reason = (`上影线 ${upperShadow} ≤ 4.5%，+3分`);
    } else {
      baseScore = 0;
      reason = (`上影线 ${upperShadow} > 4.5%，0分`);
    }

    return {
      score: baseScore,
      reason,
    };

  }


  /**
   * 获取开盘数据
   * 支持两种模式：
   * 1) 当日模式：从腾讯实时行情获取开盘价/开盘成交量
   * 2) 历史模式：从历史分时接口获取开盘价/开盘成交量
   * 其余评分所需字段继续复用现有计算逻辑
   */
  async getOpeningData (stockCode: string, candidateDate: string, signalDateStr: string): Promise<{
    openPrice: number;
    openChangePercent: number;
    openVolumeRatio: number;
    auctionAmount: number;
    auctionAmountRatio: number;
    isLimitUp: boolean;
    sealAmount?: number;
    sealRatio?: number;
    openTimes?: number;
  } | null> {
    logger.info(`[BuySignal] 获取 ${stockCode} ${signalDateStr} 开盘数据`);
    candidateDate = formatDateStr(candidateDate);
    if (!tradingCalendarService.isTradingDay(signalDateStr)) {
      logger.info(`[BuySignal] ${signalDateStr} 不是交易日，无法获取开盘数据`);
      return null;
    }
    try {
      const todayStr = dayjs().format('YYYYMMDD');
      const isTodayMode = signalDateStr == todayStr;
      let rawKlineData = await klineCacheService.fetchKlineByDate(stockCode, candidateDate);

      if (!rawKlineData || rawKlineData.length === 0) {
        logger.info(`[BuySignal] getOpeningData ${stockCode} 无K线数据`);
        return null;
      }

      // 统一按日期升序处理，避免 Map 插入顺序导致前后日判断错误
      let klineData = [...rawKlineData].sort((a, b) => a.date.localeCompare(b.date));

      // 找到信号日期的K线
      let preDayIndex = klineData.findIndex(k => k.date === candidateDate);

      // 没找到信号日期的K线数据
      if (preDayIndex === -1) {
        logger.info(`[BuySignal] getOpeningData ${stockCode} 未找到 ${candidateDate} 的K线，无法获取计算开盘数据`);
        return null;
      }

      let prevKline: CachedKline = klineData[preDayIndex];

      let signalKline: CachedKline = {
        date: signalDateStr,
        open: 0,  // 开盘价未知，后续用腾讯数据覆盖
        high: 0,  // 最高价未知，后续用腾讯数据覆盖
        low: 0,    // 最低价未知，后续用腾讯数据覆盖
        close: 0,// 收盘价未知，后续用腾讯数据覆盖
        volume: 0,// 成交量未知，后续用腾讯数据覆盖
        turnover: 0,// 成交额未知，后续用腾讯数据覆盖
      };
      let resolvedOpenTimes: number | undefined;
      // 开盘涨幅
      let openChangePercent = 0;

      if (isTodayMode) {
        // 当日模式：腾讯实时行情优先提供开盘价/开盘成交量
        try {
          const tencentQuotes = await fetchTencentRealTimeQuotes([stockCode]);
          const todayQuote = tencentQuotes.get(stockCode);

          if (todayQuote) {
            logger.info(`[BuySignal] ${stockCode} 使用腾讯实时行情获取开盘数据`);

            const openingPrice = Number(todayQuote.openPrice) || 0;
            if (openingPrice > 0) {
              signalKline.open = openingPrice;
            }

            const openingVolume = Number(todayQuote.openVolume) * 100;
            const openingTurnover = Number(todayQuote.auctionAmount) || 0;
            if (openingVolume > 0 && openingTurnover > 0) {
              signalKline.volume = openingVolume;
              signalKline.turnover = openingTurnover;
            }
          }
          // 计算开盘涨幅
          openChangePercent = todayQuote?.openChangePercent ?? 0
        } catch (err) {
          console.warn(`[BuySignal] 使用腾讯实时行情获取开盘数据失败，降级本地K线:`, err);
        }
      } else {
        // 历史模式：使用历史分时接口覆盖开盘价/开盘成交量
        try {
          rawKlineData = await klineCacheService.fetchKlineByDate(stockCode, signalDateStr) || [];
          klineData = [...rawKlineData].sort((a, b) => a.date.localeCompare(b.date));
          signalKline = klineData.find(k => k.date === signalDateStr) || signalKline; // 先用K线数据填充，后续分时数据覆盖开盘相关字段
          logger.info(`[BuySignal] ${stockCode} signalKline:${JSON.stringify(signalKline)}`);
          const minuteData = await getStockTrendMinute(stockCode, signalDateStr, '09:30');
          logger.info(`[BuySignal] ${stockCode} openData:`, JSON.stringify(minuteData));
          if (minuteData) {
            logger.info(`[BuySignal] ${stockCode} 使用历史分时接口获取开盘数据`);

            const openingPrice = Number(signalKline.open || minuteData[2] || 0); // 开盘价
            const openingVolume = (Number(minuteData[3]) || 0) * 100; // 成交量（股）
            const openingTurnover = openingVolume * (openingPrice > 0 ? openingPrice : (Number(minuteData[2]) || 0));

            logger.info(`[BuySignal] ${stockCode} openPrice:${openingPrice}`);
            logger.info(`[BuySignal] ${stockCode} openVolume:${openingVolume}`);
            logger.info(`[BuySignal] ${stockCode} openTurnover:${openingTurnover}`);

            if (openingPrice > 0) {
              signalKline.open = openingPrice;
            }
            if (openingVolume > 0 && openingTurnover > 0) {
              signalKline.volume = openingVolume;
              signalKline.turnover = openingTurnover;
            }
          }
          openChangePercent = prevKline && prevKline.close > 0
            ? ((signalKline.open - prevKline.close) / prevKline.close) * 100
            : 0;
        } catch (err) {
          console.warn(`[BuySignal] 使用历史分时接口获取开盘数据失败，降级本地K线:`, err);
        }
      }

      if (isTodayMode && signalKline.open <= 0) {
        logger.info(`[BuySignal] ${stockCode} 今日模式缺少有效开盘价`);
        return null;
      }
      // 打印 target 数据
      logger.info(`[BuySignal] ${stockCode} target:`, signalKline.open, signalKline.close, signalKline.volume, signalKline.turnover, signalKline.high, signalKline.low);
      // 计算量比（当日成交量 / 5日平均成交量）
      let volumeRatio = 1;
      volumeRatio = signalKline.volume > 0 ? ((signalKline.volume / prevKline.volume) * 100) : 0;
      logger.info(`[BuySignal] ${stockCode} volumeRatio:${volumeRatio}`);

      const auctionAmount = Math.round(signalKline.turnover);
      logger.info(`[BuySignal] ${stockCode} auctionAmount:${auctionAmount}`);
      const auctionAmountRatio = prevKline && prevKline.turnover > 0
        ? ((signalKline.turnover) / prevKline.turnover) * 100
        : 0;
      logger.info(`[BuySignal] ${stockCode} auctionAmountRatio:${auctionAmountRatio}`);

      return {
        openPrice: signalKline.open,
        openChangePercent: Math.round(openChangePercent * 100) / 100,
        openVolumeRatio: Math.round(volumeRatio * 100) / 100,
        auctionAmount,
        auctionAmountRatio: Math.round(auctionAmountRatio * 100) / 100,
        isLimitUp: false,
        sealAmount: undefined,
        sealRatio: undefined,
        openTimes: resolvedOpenTimes,
      };
    } catch (error) {
      logger.error(`[BuySignal] 获取 ${stockCode} 开盘数据失败:`, error);
      return null;
    }
  }

  // 计算竞价评分 (满分100分)
  async getAuctionScore (openData: {
    openChangePercent: number,
    openVolumeRatio: number,
    dateStr: string,
    stockCode: string,
  }): Promise<{ score: number; reason: string }> {
    const defaultScore = { score: 0, reason: '竞价评分异常' };
    let score = 0;
    const reasons: string[] = [];
    const { openChangePercent, openVolumeRatio, stockCode, dateStr } = openData;

    if (!Number.isFinite(openChangePercent) || !Number.isFinite(openVolumeRatio)) {
      return defaultScore;
    }

    //1. 竞价涨幅评分（权重 40 分）
    // 竞价涨幅	                  得分	                说明
    // ≥ +1% 且 ≤ +5%	            40​	                   最优区间（主力抢筹）
    // +5% ~ +7%	                35​	                   偏激进，容易高开低走
    // +0.3% ~ +1%	              30​	                    偏弱，但可接受
    // 0% ~ +0.3%	                10​	                    几乎平开，动能不足
    // < -3%	                    0​	                    ❌ 直接淘汰（竞价砸盘）
    // ≥ +7%	                    0​	                    ❌ 直接淘汰（情绪透支）


    // 2. 竞价成交量评分（权重 30 分）
    // 竞价成交量 / 昨日成交量	                    得分
    // ≥ 5%	                                        30                ​
    // 3% ~ 5%                	                    25​
    // 2% ~ 3%                	                    15​
    // 1% ~ 2%                	                    5​
    // < 1%                   	                    0​                


    // 3. 量价匹配修正项（±30 分）
    // 场景	                      修正分	          解释
    // 条件组合	                      得分
    // 高开 & 量比≥3%	                +30
    // 高开 & 量比1%~3%	              +15
    // 高开 & 量比<1%	                –30
    // 平开 & 量比≥3%                 +10
    // 平开 & 量比<3%	                –10
    // 低开 & 量比≥3%	                –30
    // 低开 & 量比<3%	                –40（直接淘汰）
    let openScore = 0;
    let openState: 'high' | 'flat' | 'low' = 'flat';

    if (openChangePercent < -3) {
      // 竞价砸盘直接淘汰
      return { score: -1, reason: '竞价低开(<-3%)，直接淘汰' };
    }
    if (openChangePercent >= 7) {
      // 情绪透支直接淘汰
      return { score: -1, reason: '竞价过高(>=7%)，情绪透支，直接淘汰' };
    }

    if (openChangePercent >= 1 && openChangePercent <= 5) {
      openScore = 40;
      openState = 'high';
      reasons.push('竞价涨幅最优(1%~5%)加40分');
    } else if (openChangePercent > 5 && openChangePercent < 7) {
      openScore = 35;
      openState = 'high';
      reasons.push('竞价涨幅偏激进(5%~7%)加35分');
    } else if (openChangePercent >= 0.3 && openChangePercent < 1) {
      openScore = 30;
      openState = 'flat';
      reasons.push('竞价涨幅偏弱(0.3%~1%)加30分');
    } else {
      openScore = 10;
      openState = 'flat';
      reasons.push('竞价接近平开(0%~0.3%)加10分');
    }

    // 2) 成交量评分（权重30分，openVolumeRatio 为百分比数值）
    let volumeScore = 0;
    if (openVolumeRatio >= 5) {
      volumeScore = 30;
      reasons.push('竞价成交量占比高(>=5%)加30分');
    } else if (openVolumeRatio >= 3) {
      volumeScore = 25;
      reasons.push('竞价成交量占比良好(3%~5%)加25分');
    } else if (openVolumeRatio >= 2) {
      volumeScore = 15;
      reasons.push('竞价成交量占比一般(2%~3%)加15分');
    } else if (openVolumeRatio >= 1) {
      volumeScore = 5;
      reasons.push('竞价成交量占比较低(1%~2%)加5分');
    } else {
      volumeScore = 0;
      reasons.push('竞价成交量占比不足(<1%)加0分');
    }

    // 3) 量价匹配修正项（±30分）
    let correctionScore = 0;
    if (openState === 'high') {
      if (openVolumeRatio >= 3) {
        correctionScore = 30;
        reasons.push('高开且放量(>=3%)，量价共振，加30分');
      } else if (openVolumeRatio >= 1) {
        correctionScore = 15;
        reasons.push('高开但放量一般(1%~3%)，加15分');
      } else {
        correctionScore = -30;
        reasons.push('高开缩量(<1%)，冲高回落风险，减30分');
      }
    } else if (openState === 'flat') {
      if (openVolumeRatio >= 3) {
        correctionScore = 10;
        reasons.push('平开放量(>=3%)，有抢筹迹象，加10分');
      } else {
        correctionScore = -10;
        reasons.push('平开且量能不足(<3%)，减10分');
      }
    } else {
      if (openVolumeRatio >= 3) {
        correctionScore = -30;
        reasons.push('低开放量，抛压较重，减30分');
      } else {
        logger.info(`[BuySignal] ${stockCode} ${dateStr} 低开且量能不足，竞价直接淘汰`);
        reasons.push('低开且量能不足(<3%)，直接淘汰');
        return { score: 0, reason: '低开且量能不足(<3%)，直接淘汰' };
      }
    }

    score = openScore + volumeScore + correctionScore;
    reasons.push(`[BuySignal] 总分: ${score}`);
    // 总分范围限制为 0~100
    score = Math.max(0, Math.min(100, score));
    logger.info(`[BuySignal] ${stockCode} ${dateStr} 竞价压缩后评分: ${score}`);

    return {
      score,
      reason: reasons.join('；'),
    };
  }

  /**
   * 获取大盘环境
   * 优先从市场情绪服务获取 strong 值，失败则用原有逻辑计算
   * 原有逻辑：从同花顺获取上证指数K线，基于涨跌幅计算情绪值
   */
  async getMarketEnvironment (dateStr: string): Promise<{
    indexOpenChange: number;
    indexMorningTrend: 'up' | 'down' | 'flat';
    marketMood: number;
  }> {
    const defaultResult = { indexOpenChange: 0, indexMorningTrend: 'flat' as const, marketMood: 50 };
    const targetDateStr = formatDateStr(dateStr);
    logger.info(`[BuySignal] getMarketEnvironment: ${targetDateStr}`);
    // 1. 优先从市场情绪服务获取 strong 值
    const cachedMood = marketMoodService.getMood(targetDateStr);
    if (cachedMood !== null) {
      logger.info(`[BuySignal] 使用缓存的市场情绪: ${targetDateStr} -> ${cachedMood}`);
      // 仍需获取指数开盘数据，但情绪值用缓存的
      // TODO: 后续可考虑缓存指数开盘数据，减少请求，这里获取的指数数据是错误的
      // const indexData = await this.fetchIndexData(targetDateStr);
      return {
        indexOpenChange: 0,
        indexMorningTrend: 'flat',
        marketMood: cachedMood,
      };
    }

    // 2. 缓存没有，使用原有逻辑（从同花顺K线计算）
    logger.info(`[BuySignal] 市场情绪缓存未命中 ${targetDateStr}，使用K线计算`);
    return this.calculateMarketEnvironmentFromKline(targetDateStr, defaultResult);
  }


  /**
   * 从K线数据计算市场环境（原有降级逻辑）
   */
  private async calculateMarketEnvironmentFromKline (
    dateStr: string,
    defaultResult: { indexOpenChange: number; indexMorningTrend: 'up' | 'down' | 'flat'; marketMood: number }
  ): Promise<{
    indexOpenChange: number;
    indexMorningTrend: 'up' | 'down' | 'flat';
    marketMood: number;
  }> {
    // 优先使用v6，再从v1-v5中随机挑选2个版本，共3次重试
    const otherVersions = ['v1', 'v2', 'v3', 'v4', 'v5'].sort(() => Math.random() - 0.5).slice(0, 2);
    const versions = ['v6', ...otherVersions];

    for (const version of versions) {
      try {
        // 获取上证指数K线（市场代码17，股票代码000001）
        const url = `https://d.10jqka.com.cn/${version}/line/17_000001/01/last30.js`;

        const response = await axios.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'http://www.10jqka.com.cn/',
          },
          timeout: 10000,
        });

        if (response.data && typeof response.data === 'string') {
          const dataStr = response.data;
          const startIdx = dataStr.indexOf('({');
          if (startIdx !== -1) {
            const jsonStr = dataStr.substring(startIdx + 1, dataStr.length - 1);
            const json = JSON.parse(jsonStr);
            if (json && json.data) {
              const klineList = json.data.split(';');

              // 先尝试找指定日期，找不到则使用最新
              let targetIdx = klineList.findIndex((item: string) => item.split(',')[0] === dateStr);
              if (targetIdx === -1 && klineList.length > 0) {
                logger.info(`[BuySignal] 大盘数据未找到 ${dateStr}，使用最新数据`);
                targetIdx = klineList.length - 1;
              }

              if (targetIdx >= 0) {
                const parts = klineList[targetIdx].split(',');
                if (parts[1]) {
                  const open = parseFloat(parts[1]) || 0;
                  const close = parseFloat(parts[4]) || 0;

                  let prevClose = 0;
                  if (targetIdx > 0) {
                    const prevParts = klineList[targetIdx - 1].split(',');
                    prevClose = parseFloat(prevParts[4]) || 0;
                  }

                  const indexOpenChange = prevClose > 0 ? ((open - prevClose) / prevClose) * 100 : 0;
                  const indexMorningTrend: 'up' | 'down' | 'flat' =
                    close > open * 1.001 ? 'up' : (close < open * 0.999 ? 'down' : 'flat');

                  // 市场情绪（基于当日涨跌，原有计算逻辑）
                  const dayChange = prevClose > 0 ? ((close - prevClose) / prevClose) * 100 : 0;
                  const marketMood = Math.max(0, Math.min(100, 50 + dayChange * 10));

                  // 成功获取数据，返回结果
                  return {
                    indexOpenChange: Math.round(indexOpenChange * 100) / 100,
                    indexMorningTrend,
                    marketMood: Math.round(marketMood),
                  };
                }
              }
            }
          }
        }

        // 数据格式异常，尝试下一个版本
        console.warn(`[BuySignal] 大盘接口 ${version} 返回数据异常，尝试下一版本`);

      } catch (error) {
        const errMsg = (error as Error).message;
        console.warn(`[BuySignal] 大盘接口 ${version} 请求失败: ${errMsg}，尝试下一版本`);
      }
    }

    // 所有版本都失败，使用默认值
    console.warn('[BuySignal] 大盘接口所有版本均失败，使用默认市场情绪');
    return defaultResult;
  }

  /**
   * 获取板块数据
   * 简化版：基于已有的行业信息返回估算值
   */
  async getSectorData (sectorName: string, dateStr: string): Promise<{
    sectorOpenChange: number;
    sectorLimitUpCount: number;
    sectorLeader: boolean;
  }> {
    // 由于板块数据需要单独接口，这里返回基于大盘的估算值
    // 可以后续对接板块接口
    const marketEnv = await this.getMarketEnvironment(dateStr);

    return {
      sectorOpenChange: marketEnv.indexOpenChange * (0.8 + Math.random() * 0.4),  // 大盘涨跌附近波动
      sectorLimitUpCount: Math.floor(Math.random() * 5),  // 0-4只
      sectorLeader: false,
    };
  }

  /**
   * 获取技术位置
   * 从K线数据计算均线位置
   */
  async getTechnicalPosition (stockCode: string, currentPrice: number, prevTradingDay: string): Promise<{
    distanceToMa5: number;
    distanceToMa10: number;
    distanceToMa20: number;
    distanceToPressure: number;
  }> {
    try {
      const klineData = await klineCacheService.loadCacheForHistory(stockCode, prevTradingDay, 20);

      if (!klineData || klineData.length < 5) {
        return { distanceToMa5: 0, distanceToMa10: 0, distanceToMa20: 0, distanceToPressure: 5 };
      }

      const closes = klineData.map(k => k.close);
      const highs = klineData.map(k => k.high);

      // 计算均线
      const ma5 = closes.slice(-5).reduce((a, b) => a + b, 0) / 5;
      const ma10 = closes.length >= 10
        ? closes.slice(-10).reduce((a, b) => a + b, 0) / 10
        : ma5;
      const ma20 = closes.length >= 20
        ? closes.slice(-20).reduce((a, b) => a + b, 0) / 20
        : ma10;

      // 压力位（近20日最高价）
      const pressure = Math.max(...highs.slice(-20));

      // 计算距离（百分比）
      const price = currentPrice > 0 ? currentPrice : closes[closes.length - 1];
      const distanceToMa5 = price > 0 ? ((price - ma5) / price) * 100 : 0;
      const distanceToMa10 = price > 0 ? ((price - ma10) / price) * 100 : 0;
      const distanceToMa20 = price > 0 ? ((price - ma20) / price) * 100 : 0;
      const distanceToPressure = price > 0 ? ((pressure - price) / price) * 100 : 0;

      return {
        distanceToMa5: Math.round(distanceToMa5 * 10) / 10,
        distanceToMa10: Math.round(distanceToMa10 * 10) / 10,
        distanceToMa20: Math.round(distanceToMa20 * 10) / 10,
        distanceToPressure: Math.round(distanceToPressure * 10) / 10,
      };
    } catch (error) {
      console.error(`[BuySignal] 获取 ${stockCode} 技术位置失败:`, error);
      return { distanceToMa5: 0, distanceToMa10: 0, distanceToMa20: 0, distanceToPressure: 5 };
    }
  }

  /**
   * 内存缓存（用于减少文件IO）
   */
  private klineMemCache: Map<string, { data: any[]; time: number }> = new Map();

  /**
   * 上次请求同花顺接口的时间（用于控制请求频率）
   */
  private lastThsRequestTime: number = 0;

  /**
   * 生成随机延迟时间（8-12秒，模拟真人操作，仅批量模式使用）
   */
  private getRandomDelay (): number {
    return Math.floor(8000 + Math.random() * 4000);  // 8000-12000ms
  }

  /**
   * 批量模式标记
   */
  private batchMode: boolean = false;

  /**
   * 设置批量模式（批量修复时调用）
   */
  setBatchMode (enabled: boolean): void {
    this.batchMode = enabled;
    logger.info(`[BuySignal] 批量模式: ${enabled ? '开启' : '关闭'}`);
  }

  /**
   * 等待适当的时间间隔后再请求（仅批量模式生效）
   */
  private async waitForRateLimit (): Promise<void> {
    // 普通模式不等待，直接返回
    if (!this.batchMode) {
      return;
    }

    const now = Date.now();
    const elapsed = now - this.lastThsRequestTime;
    const minInterval = this.getRandomDelay();

    if (elapsed < minInterval && this.lastThsRequestTime > 0) {
      const waitTime = minInterval - elapsed;
      logger.info(`[BuySignal] 批量模式等待 ${Math.round(waitTime / 1000)}s 后请求...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  /**
   * 获取K线数据（优先本地文件缓存，其次同花顺接口）
   * @param stockCode 股票代码
   * @param days 请求天数（用于接口调用）
   */
  private async fetchKlineData (stockCode: string, days: number = 30): Promise<{
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    turnover: number;
  }[] | null> {
    try {
      // 1. 检查内存缓存（5分钟有效，减少重复计算）
      const memCacheKey = `${stockCode}_${days}`;
      const memCached = this.klineMemCache.get(memCacheKey);
      if (memCached && Date.now() - memCached.time < 5 * 60 * 1000) {
        return memCached.data;
      }

      // 2. 调用共享 K 线缓存服务
      let klines = await klineCacheService.getRecentKlines(stockCode, days);
      if (!klines || klines.length === 0) {
        console.warn(`[BuySignal] fetchKlineData ${stockCode} 无K线数据`);
        const klineData = await klineCacheService.ensureKlines(stockCode, { targetDates: [] }); //触发更新
        klines = await klineCacheService.getRecentKlines(stockCode, days);
        if (!klines || klines.length === 0) {
          console.warn(`[BuySignal] fetchKlineData ${stockCode} 仍无K线数据`);
          return null;
        }
      }

      const result: CachedKline[] = [...klines].sort((a, b) => a.date.localeCompare(b.date));

      // 3. 更新内存缓存
      this.klineMemCache.set(memCacheKey, { data: result, time: Date.now() });

      return result;
    } catch (error) {
      console.error(`[BuySignal] 获取 ${stockCode} K线失败:`, error);
      return null;
    }
  }

  /**
   * 生成买入决策
   */
  generateDecision (
    totalScore: number,
    openData: { openPrice: number; openChangePercent: number },
    candidate: any
  ): {
    signal: 'strong_buy' | 'buy' | 'hold' | 'pass';
    position: number;
    price: number;
    stopLoss: number;
    takeProfit: number;
  } {
    let signal: 'strong_buy' | 'buy' | 'hold' | 'pass';
    let position: number;

    if (totalScore >= 80) {
      signal = 'strong_buy';
      position = 30;  // 3成仓
    } else if (totalScore >= 70) {
      signal = 'buy';
      position = 20;  // 2成仓
    } else if (totalScore >= 50) {
      signal = 'hold';
      position = 10;  // 1成仓观望
    } else {
      signal = 'pass';
      position = 0;
    }

    // 计算止损止盈价
    const price = openData.openPrice;
    const stopLossPercent = candidate.isLimitUp ? 0.05 : 0.03;  // 涨停股止损5%，其他3%
    const takeProfitPercent = candidate.isLimitUp ? 0.15 : 0.08;  // 涨停股止盈15%，其他8%

    return {
      signal,
      position,
      price,
      stopLoss: Math.round(price * (1 - stopLossPercent) * 100) / 100,
      takeProfit: Math.round(price * (1 + takeProfitPercent) * 100) / 100,
    };
  }

  /**
   * 收集风险提示
   */
  collectRiskWarnings (
    openData: { openChangePercent: number; openVolumeRatio: number },
    marketEnv: { indexOpenChange: number; marketMood: number },
    sectorData: { sectorLimitUpCount: number },
    technicalData: { distanceToMa5: number; distanceToPressure: number },
    candidate: any
  ): string[] {
    const warnings: string[] = [];

    if (openData.openChangePercent > 5) {
      warnings.push('⚠️ 开盘涨幅过高，追高风险大');
    }

    if (openData.openVolumeRatio < 1) {
      warnings.push('⚠️ 开盘量能不足，资金关注度下降');
    }

    if (marketEnv.indexOpenChange < -1) {
      warnings.push('⚠️ 大盘大幅低开，系统性风险');
    }

    if (marketEnv.marketMood < 40) {
      warnings.push('⚠️ 市场情绪低迷，谨慎操作');
    }

    if (sectorData.sectorLimitUpCount < 2) {
      warnings.push('⚠️ 板块联动弱，题材持续性存疑');
    }

    if (technicalData.distanceToMa5 > 10) {
      warnings.push('⚠️ 短期涨幅较大，注意回调风险');
    }

    if (technicalData.distanceToPressure < 2) {
      warnings.push('⚠️ 逼近压力位，套牢盘抛压');
    }

    if (candidate.riskLevel === 'high') {
      warnings.push('⚠️ 选股风险等级为高，需严格止损');
    }

    return warnings;
  }

  /**
   * 获取今日买入信号列表
   */
  async getTodaySignals (dateStr?: string): Promise<IBuySignal[]> {
    // 直接使用字符串日期查询
    const targetDate = dateStr ? formatDateStr(dateStr) : dayjs().format('YYYYMMDD');

    const results = await BuySignal.find({ date: targetDate })
      .sort({ totalBuyScore: -1 })
      .lean();

    return results as unknown as IBuySignal[];
  }

  /**
   * 获取买入信号统计
   */
  async getSignalStats (dateStr: string): Promise<{
    total: number;
    strongBuy: number;
    buy: number;
    hold: number;
    pass: number;
    avgScore: number;
  }> {
    // 直接使用字符串日期查询
    const date = formatDateStr(dateStr);
    const signals = await BuySignal.find({ date }).lean();

    if (signals.length === 0) {
      return { total: 0, strongBuy: 0, buy: 0, hold: 0, pass: 0, avgScore: 0 };
    }

    const avgScore = signals.reduce((sum, s) => sum + s.totalBuyScore, 0) / signals.length;

    return {
      total: signals.length,
      strongBuy: signals.filter(s => s.buySignal === 'strong_buy').length,
      buy: signals.filter(s => s.buySignal === 'buy').length,
      hold: signals.filter(s => s.buySignal === 'hold').length,
      pass: signals.filter(s => s.buySignal === 'pass').length,
      avgScore: Math.round(avgScore * 10) / 10,
    };
  }

  /**
   * 更新收益跟踪数据
   */
  async updateProfitTracking (dateStr: string): Promise<void> {
    const targetDateStr = formatDateStr(dateStr);
    const yesterdayStr = dayjs().subtract(1, 'day').format('YYYYMMDD');

    // 获取需要更新的信号（已过1-3天的）
    const signals = await BuySignal.find({
      date: { $lte: yesterdayStr },
      resultStatus: 'pending',
    });

    for (const signal of signals) {
      try {
        // TODO: 获取实际的收盘数据并更新
        // 这里需要对接K线数据接口
      } catch (error) {
        console.error(`[BuySignal] 更新 ${signal.stockCode} 收益失败:`, error);
      }
    }
  }

  /**
   * 获取可用于生成买入信号的日期列表
   * 返回有 VolumeSurge 数据但没有 BuySignal 数据的日期
   */
  async getAvailableDatesForGeneration (): Promise<{ date: string; hasSignal: boolean; surgeCount: number }[]> {
    // 获取 VolumeSurge 的所有日期 (现在已经是 YYYYMMDD 字符串)
    const surgeDates = await VolumeSurge.distinct('date') as string[];

    // 获取已有 BuySignal 的日期 (现在也是 YYYYMMDD 字符串)
    const signalDates = await BuySignal.distinct('date') as string[];
    const signalDateSet = new Set(signalDates);

    // 构建结果
    const result: { date: string; hasSignal: boolean; surgeCount: number }[] = [];

    for (const surgeDate of surgeDates) {
      const hasSignal = signalDateSet.has(surgeDate);

      // 统计该日期的 VolumeSurge 数量
      const surgeCount = await VolumeSurge.countDocuments({ date: surgeDate });

      result.push({
        date: surgeDate,
        hasSignal,
        surgeCount,
      });
    }

    // 按日期降序排序
    result.sort((a, b) => b.date.localeCompare(a.date));

    return result;
  }
  /**
   * 删除指定日期的买入信号数据
   */
  async deleteBuySignalsByDate (dateStr: string): Promise<void> {
    const targetDateStr = formatDateStr(dateStr);
    await BuySignal.deleteMany({ date: targetDateStr });
    logger.info(`[BuySignal] 已删除 ${targetDateStr} 的买入信号数据`);
  }
}

export const buySignalService = new BuySignalService();
