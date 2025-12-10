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
import { BuySignal, IBuySignal } from '../models/BuySignal';
import { VolumeSurge } from '../models/VolumeSurge';
import { PriceBreakthrough } from '../models/PriceBreakthrough';

// 策略类型定义
type StrategyType = 'volume_surge' | 'breakthrough' | 'limit_up' | 'ma_crossover';

// 策略名称映射
const STRATEGY_NAMES: Record<StrategyType, string> = {
  volume_surge: '放量突破',
  breakthrough: '价格突破',
  limit_up: '涨停板',
  ma_crossover: '均线金叉',
};

// 候选标的接口（统一各策略的数据结构）
interface StrategyCandidate {
  _id: string;
  stockCode: string;
  stockName: string;
  date: Date;
  strategyType: StrategyType;
  strategyName: string;
  score: number;           // 策略得分
  industry?: string;       // 行业/板块
  changePercent?: number;  // 当日涨幅
}

// 解析日期
function parseDate(dateStr: string): Date {
  if (dateStr.includes('-')) {
    return dayjs(dateStr).startOf('day').toDate();
  }
  return dayjs(dateStr, 'YYYYMMDD').startOf('day').toDate();
}

// 格式化日期
function formatDate(date: Date): string {
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
  static scoreOpenStrength(openChangePercent: number): { score: number; reason: string } {
    if (openChangePercent >= 1 && openChangePercent <= 3) {
      return { score: 30, reason: '开盘涨幅理想(1-3%)，强势延续且不追高' };
    } else if (openChangePercent > 3 && openChangePercent <= 5) {
      return { score: 25, reason: '开盘偏高(3-5%)，需注意追高风险' };
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
  static scoreVolumeConfirm(openVolumeRatio: number): { score: number; reason: string } {
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
  static scoreAuction(auctionAmountRatio: number): { score: number; reason: string } {
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
  static scoreMarketEnv(indexOpenChange: number, marketMood: number): { score: number; reason: string } {
    let score = 0;
    let reasons: string[] = [];
    
    // 指数开盘涨跌
    if (indexOpenChange >= 0.5) {
      score += 5;
      reasons.push('大盘高开');
    } else if (indexOpenChange >= 0) {
      score += 4;
      reasons.push('大盘平开');
    } else if (indexOpenChange >= -0.5) {
      score += 2;
      reasons.push('大盘小幅低开');
    } else {
      score += 0;
      reasons.push('大盘大幅低开');
    }
    
    // 市场情绪
    if (marketMood >= 70) {
      score += 5;
      reasons.push('市场情绪高涨');
    } else if (marketMood >= 50) {
      score += 3;
      reasons.push('市场情绪中性');
    } else {
      score += 1;
      reasons.push('市场情绪低迷');
    }
    
    return { score, reason: reasons.join('，') };
  }
  
  /**
   * 板块联动评分 (满分10分)
   */
  static scoreSectorLink(
    sectorOpenChange: number,
    sectorLimitUpCount: number,
    sectorLeader: boolean
  ): { score: number; reason: string } {
    let score = 0;
    let reasons: string[] = [];
    
    // 板块涨停数
    if (sectorLimitUpCount >= 5) {
      score += 5;
      reasons.push('板块涨停数多(≥5)');
    } else if (sectorLimitUpCount >= 2) {
      score += 3;
      reasons.push('板块有跟风(2-4只)');
    } else {
      score += 1;
      reasons.push('板块联动弱');
    }
    
    // 是否领涨
    if (sectorLeader) {
      score += 3;
      reasons.push('为板块领涨股');
    } else if (sectorOpenChange >= 1) {
      score += 2;
      reasons.push('板块整体走强');
    } else {
      score += 1;
      reasons.push('非板块龙头');
    }
    
    // 板块涨幅
    if (sectorOpenChange >= 2) {
      score += 2;
      reasons.push('板块大涨');
    } else if (sectorOpenChange >= 0) {
      score += 1;
    }
    
    return { score: Math.min(score, 10), reason: reasons.join('，') };
  }
  
  /**
   * 承接力度评分 (满分10分) - 涨停股专用
   */
  static scoreSealStrength(
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
  static scoreTechnical(
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
   */
  private async getVolumeSurgeCandidates(selectionDate: Date): Promise<StrategyCandidate[]> {
    const records = await VolumeSurge.find({
      date: selectionDate,
      strategyScore: { $gte: 50 },  // 只处理得分>=50的标的
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
    }));
  }
  
  /**
   * 从价格突破策略获取候选股票
   */
  private async getBreakthroughCandidates(selectionDate: Date): Promise<StrategyCandidate[]> {
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
    }));
  }
  
  /**
   * 获取所有策略的候选股票
   */
  private async getAllCandidates(
    selectionDate: Date, 
    strategies?: StrategyType[]
  ): Promise<StrategyCandidate[]> {
    const allStrategies: StrategyType[] = strategies || ['volume_surge', 'breakthrough'];
    const candidatePromises: Promise<StrategyCandidate[]>[] = [];
    
    if (allStrategies.includes('volume_surge')) {
      candidatePromises.push(this.getVolumeSurgeCandidates(selectionDate));
    }
    if (allStrategies.includes('breakthrough')) {
      candidatePromises.push(this.getBreakthroughCandidates(selectionDate));
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
   */
  async generateBuySignals(dateStr: string, strategies?: StrategyType[]): Promise<IBuySignal[]> {
    const signalDate = parseDate(dateStr);
    const selectionDate = dayjs(signalDate).subtract(1, 'day').toDate();
    
    // 获取前一天的选股结果（支持多策略）
    const candidates = await this.getAllCandidates(selectionDate, strategies);
    
    if (candidates.length === 0) {
      console.log(`[BuySignal] ${dateStr} 无可处理的候选标的`);
      return [];
    }
    
    console.log(`[BuySignal] ${dateStr} 发现 ${candidates.length} 个候选标的`);
    
    const signals: IBuySignal[] = [];
    
    for (const candidate of candidates) {
      try {
        const signal = await this.generateSignalForStock(candidate, signalDate);
        if (signal) {
          signals.push(signal);
        }
      } catch (error) {
        console.error(`[BuySignal] 处理 ${candidate.stockCode} 失败:`, error);
      }
    }
    
    // 批量保存
    if (signals.length > 0) {
      for (const signal of signals) {
        await BuySignal.findOneAndUpdate(
          { date: signal.date, stockCode: signal.stockCode },
          signal,
          { upsert: true, new: true }
        );
      }
      console.log(`[BuySignal] 已保存 ${signals.length} 条买入信号`);
    }
    
    return signals;
  }
  
  /**
   * 为单个股票生成买入信号
   */
  async generateSignalForStock(
    candidate: StrategyCandidate,
    signalDate: Date
  ): Promise<IBuySignal | null> {
    // 获取开盘数据（这里模拟，实际需要对接实时行情API）
    const openData = await this.getOpeningData(candidate.stockCode, signalDate);
    
    if (!openData) {
      console.log(`[BuySignal] ${candidate.stockCode} 无法获取开盘数据`);
      return null;
    }
    
    // 获取大盘环境
    const marketEnv = await this.getMarketEnvironment(signalDate);
    
    // 获取板块数据
    const sectorData = await this.getSectorData(candidate.industry || '', signalDate);
    
    // 获取技术位置
    const technicalData = await this.getTechnicalPosition(candidate.stockCode, openData.openPrice);
    
    // 计算各项评分
    const openStrength = BuySignalScorer.scoreOpenStrength(openData.openChangePercent);
    const volumeConfirm = BuySignalScorer.scoreVolumeConfirm(openData.openVolumeRatio);
    const auction = BuySignalScorer.scoreAuction(openData.auctionAmountRatio);
    const marketEnvScore = BuySignalScorer.scoreMarketEnv(marketEnv.indexOpenChange, marketEnv.marketMood);
    const sectorLink = BuySignalScorer.scoreSectorLink(
      sectorData.sectorOpenChange,
      sectorData.sectorLimitUpCount,
      sectorData.sectorLeader
    );
    const sealStrength = BuySignalScorer.scoreSealStrength(
      openData.isLimitUp,
      openData.sealRatio,
      openData.openTimes
    );
    const technical = BuySignalScorer.scoreTechnical(
      technicalData.distanceToMa5,
      technicalData.distanceToMa10,
      technicalData.distanceToPressure
    );
    
    // 计算总分
    const totalBuyScore = 
      openStrength.score + 
      volumeConfirm.score + 
      auction.score + 
      marketEnvScore.score + 
      sectorLink.score + 
      sealStrength.score + 
      technical.score;
    
    // 生成买入决策
    const decision = this.generateDecision(totalBuyScore, openData, candidate);
    
    // 收集风险提示
    const riskWarnings = this.collectRiskWarnings(
      openData,
      marketEnv,
      sectorData,
      technicalData,
      candidate
    );
    
    // 构建买入理由
    const buyReason = [
      openStrength.reason,
      volumeConfirm.reason,
      auction.reason,
      marketEnvScore.reason,
      sectorLink.reason,
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
      
      indexOpenChange: marketEnv.indexOpenChange,
      indexMorningTrend: marketEnv.indexMorningTrend,
      marketMood: marketEnv.marketMood,
      
      sectorName: candidate.industry || '',
      sectorOpenChange: sectorData.sectorOpenChange,
      sectorLimitUpCount: sectorData.sectorLimitUpCount,
      sectorLeader: sectorData.sectorLeader,
      
      isLimitUp: openData.isLimitUp,
      sealAmount: openData.sealAmount,
      sealRatio: openData.sealRatio,
      openTimes: openData.openTimes,
      
      distanceToMa5: technicalData.distanceToMa5,
      distanceToMa10: technicalData.distanceToMa10,
      distanceToMa20: technicalData.distanceToMa20,
      distanceToPressure: technicalData.distanceToPressure,
      
      openStrengthScore: openStrength.score,
      volumeConfirmScore: volumeConfirm.score,
      auctionScore: auction.score,
      marketEnvScore: marketEnvScore.score,
      sectorLinkScore: sectorLink.score,
      sealStrengthScore: sealStrength.score,
      technicalScore: technical.score,
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
  
  /**
   * 获取开盘数据
   * TODO: 实际需要对接实时行情API
   */
  async getOpeningData(stockCode: string, date: Date): Promise<{
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
    try {
      // 使用问财查询当日开盘数据
      const dateStr = formatDate(date);
      const query = `${stockCode} ${dateStr} 开盘价 开盘涨幅 集合竞价成交额`;
      
      // 这里暂时使用模拟数据
      // 实际应该对接实时行情API
      const mockData = {
        openPrice: 10.5,
        openChangePercent: 2.5,
        openVolumeRatio: 1.8,
        auctionAmount: 500,  // 万
        auctionAmountRatio: 3.2,  // %
        isLimitUp: false,
        sealAmount: undefined,
        sealRatio: undefined,
        openTimes: undefined,
      };
      
      return mockData;
    } catch (error) {
      console.error(`[BuySignal] 获取 ${stockCode} 开盘数据失败:`, error);
      return null;
    }
  }
  
  /**
   * 获取大盘环境
   */
  async getMarketEnvironment(date: Date): Promise<{
    indexOpenChange: number;
    indexMorningTrend: 'up' | 'down' | 'flat';
    marketMood: number;
  }> {
    // TODO: 对接实时行情获取上证指数开盘数据
    return {
      indexOpenChange: 0.3,
      indexMorningTrend: 'up',
      marketMood: 55,
    };
  }
  
  /**
   * 获取板块数据
   */
  async getSectorData(sectorName: string, date: Date): Promise<{
    sectorOpenChange: number;
    sectorLimitUpCount: number;
    sectorLeader: boolean;
  }> {
    // TODO: 对接板块行情数据
    return {
      sectorOpenChange: 1.2,
      sectorLimitUpCount: 3,
      sectorLeader: false,
    };
  }
  
  /**
   * 获取技术位置
   */
  async getTechnicalPosition(stockCode: string, currentPrice: number): Promise<{
    distanceToMa5: number;
    distanceToMa10: number;
    distanceToMa20: number;
    distanceToPressure: number;
  }> {
    // TODO: 计算均线位置和压力位
    return {
      distanceToMa5: 3.5,
      distanceToMa10: 6.2,
      distanceToMa20: 12.1,
      distanceToPressure: 8.5,
    };
  }
  
  /**
   * 生成买入决策
   */
  generateDecision(
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
    } else if (totalScore >= 60) {
      signal = 'buy';
      position = 20;  // 2成仓
    } else if (totalScore >= 40) {
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
  collectRiskWarnings(
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
  async getTodaySignals(dateStr?: string): Promise<IBuySignal[]> {
    const targetDate = dateStr ? parseDate(dateStr) : dayjs().startOf('day').toDate();
    
    const results = await BuySignal.find({ date: targetDate })
      .sort({ totalBuyScore: -1 })
      .lean();
    
    return results as unknown as IBuySignal[];
  }
  
  /**
   * 获取买入信号统计
   */
  async getSignalStats(dateStr: string): Promise<{
    total: number;
    strongBuy: number;
    buy: number;
    hold: number;
    pass: number;
    avgScore: number;
  }> {
    const date = parseDate(dateStr);
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
  async updateProfitTracking(dateStr: string): Promise<void> {
    const signalDate = parseDate(dateStr);
    const today = dayjs().startOf('day').toDate();
    
    // 获取需要更新的信号（已过1-3天的）
    const signals = await BuySignal.find({
      date: { $lte: dayjs(today).subtract(1, 'day').toDate() },
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
}

export const buySignalService = new BuySignalService();
