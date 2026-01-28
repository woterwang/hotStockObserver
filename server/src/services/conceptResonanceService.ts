/**
 * 主线共振（Concept Resonance）策略服务
 * 
 * 策略核心：量价强势 + 板块共振 + 龙头效应
 * 
 * 在原有 VolumeSurge 策略基础上，增加板块共振维度：
 * 1. 热度验证：个股所属板块是否为当日热点
 * 2. 强度验证：热点板块是否有真实涨幅支撑
 * 3. 地位验证：个股在板块中是龙头还是跟风
 */
import { logger } from '../utils';
import { ConceptResonance } from '../models/ConceptResonance';
import { getToday, formatDate } from '../utils/dateUtils';
import { writeToFile } from '../utils/writeToFile';
import axios from 'axios';
import pLimit from 'p-limit';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const thsUtils = require('../utils/thsUtils');

// 导入依赖服务
import { marketSentimentService } from './marketSentimentService';
import { marketMoodService } from './marketMoodService';
import { tradingCalendarService } from './tradingCalendarService';
import { thsConceptHotRankService, ThsConceptHotItem } from './thsConceptHotRankService';
import { thsStockConceptService } from './thsStockConceptService';
import { conceptRankingService, ConceptRankingItem } from './conceptRankingService';
import { buySignalService } from './buySignalService';

// 导入依赖服务
import { klineCacheService, fetchTencentRealTimeQuotes, } from './klineCacheService';

// 导入类型
import {
  ConceptEnhancementResult,
  ConceptCandidate,
  ConceptResonanceConfig,
  DEFAULT_CONCEPT_RESONANCE_CONFIG,
  ConceptResonanceQueryConfig,
  OpenData,
} from '../types/conceptEnhancement';
import dayjs from 'dayjs';

/**
 * 主线共振策略服务
 */
export class ConceptResonanceService {
  /** 策略配置 */
  private config: ConceptResonanceConfig;

  constructor(config?: Partial<ConceptResonanceConfig>) {
    this.config = { ...DEFAULT_CONCEPT_RESONANCE_CONFIG, ...config };
  }

  // ========================================
  // 工具方法
  // ========================================

  private getHexinV (): string {
    try {
      return thsUtils.update();
    } catch (error) {
      logger.warn('[ConceptResonance] 生成 Hexin-V 失败，使用默认值');
      return 'Ax8Ssngzh0M9kINf4Czhe-DDqnmphHMgjdx3GrFqu4gVdzBiuVQDdp2oB0_C';
    }
  }

  private delay (ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async randomDelay (): Promise<void> {
    const minDelay = 8000;
    const maxDelay = 12000;
    const delayMs = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
    logger.debug(`[ConceptResonance] 模拟真人操作，等待 ${(delayMs / 1000).toFixed(1)} 秒...`);
    await this.delay(delayMs);
  }

  /**
   * 规范化股票代码（统一为6位纯数字）
   */
  private normalizeCode (code: string): string {
    return code.replace(/[^0-9]/g, '').slice(-6);
  }

  // ========================================
  // 问财查询相关
  // ========================================

  private async queryWencai (question: string): Promise<any[]> {
    const url = 'http://www.iwencai.com/customized/chart/get-robot-data';
    const hexinV = this.getHexinV();

    const data: Record<string, string | number> = {
      question,
      perpage: 200,
      page: 1,
      source: 'Ths_iwencai_Xuangu',
      version: '2.0',
      query_area: '',
      block_list: '',
      add_info: JSON.stringify({ urp: { scene: 1, company: 1, business: 1 }, contentType: 'json', searchInfo: true }),
      secondary_intent: 'stock',
      log_info: JSON.stringify({ input_type: 'typewrite' }),
      rsh: 'Ths_iwencai_Xuangu_0k9ulnwt96k6xiozeacd2z20dhuy0s9b',
    };

    try {
      const response = await axios.post(url, data, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'hexin-v': hexinV,
        },
        timeout: 30000,
      });

      const components = response.data?.data?.answer?.[0]?.txt?.[0]?.content?.components || [];

      for (const comp of components) {
        if (comp?.data?.datas && Array.isArray(comp.data.datas) && comp.data.datas.length > 0) {
          logger.debug(`[ConceptResonance] 问财返回 ${comp.data.datas.length} 条数据`);
          return comp.data.datas;
        }
      }

      if (response.data?.data?.answer?.[0]?.txt?.[0]?.content?.components?.[0]?.data?.datas) {
        return response.data.data.answer[0].txt[0].content.components[0].data.datas;
      }

      logger.warn('[ConceptResonance] 问财未返回有效数据');
      return [];
    } catch (error) {
      logger.error(`[ConceptResonance] 问财API调用失败: ${(error as Error).message}`);
      return [];
    }
  }

  private async checkIndexAboveMa20 (dateStr: string): Promise<boolean> {
    try {
      const question = `上证指数${dateStr}收盘价>${dateStr}20日均线`;
      const result = await this.queryWencai(question);
      return result.length > 0;
    } catch (error) {
      logger.warn('[ConceptResonance] 获取上证指数MA20状态失败');
      return true;
    }
  }

  private async getLimitUpBoardInfo (dateStr: string): Promise<{
    firstBoardSet: Set<string>;
    continuousBoardMap: Map<string, number>;
  }> {
    const firstBoardSet = new Set<string>();
    const continuousBoardMap = new Map<string, number>();

    try {
      const question = `${dateStr}涨停，非ST，非北交所，${dateStr}连续涨停天数`;
      const result = await this.queryWencai(question);

      result.forEach((item: any) => {
        const code = String(item.code || item['股票代码'] || '').replace(/[^0-9]/g, '');
        if (code.length !== 6) return;

        let boardCount = 1;
        for (const key in item) {
          if (key.includes('连续涨停') && key.includes('天')) {
            const val = parseFloat(item[key]);
            if (!isNaN(val) && val >= 1) {
              boardCount = Math.floor(val);
            }
          }
        }

        if (boardCount === 1) {
          firstBoardSet.add(code);
        } else {
          continuousBoardMap.set(code, boardCount);
        }
      });

      logger.info(`[ConceptResonance] ${dateStr} 首板: ${firstBoardSet.size}, 连板: ${continuousBoardMap.size}`);
    } catch (error) {
      logger.warn(`[ConceptResonance] 获取涨停信息失败: ${(error as Error).message}`);
    }

    return { firstBoardSet, continuousBoardMap };
  }

  private async fetchFromWencai (dateStr: string): Promise<any[]> {
    const question = [
      `${dateStr}涨幅>7%`,
      `${dateStr}成交额排名前200`,
      `${dateStr}上影线<5%`,
      `${dateStr}收盘价>10日均线`,
      `${dateStr}非ST`,
      `${dateStr}非新股`,
      `${dateStr}非北交所`,
      `非退市`,
      `${dateStr}量比`,
      `${dateStr}换手率`,
      `${dateStr}振幅`,
      `${dateStr}下影线`,
      `成交量/${dateStr}5日平均成交量`,
      '近二年未被立案',
    ].join('，');

    logger.info(`[ConceptResonance] 问财查询: ${question}`);
    return this.queryWencai(question);
  }

  // ========================================
  // 🆕 板块共振核心逻辑
  // ========================================

  /**
   * 获取板块共振上下文数据（热度榜 + 强度榜）
   */
  private async fetchConceptContext (dateStr: string): Promise<{
    hotConceptMap: Map<string, { rank: number; item: ThsConceptHotItem }>;
    strengthConceptMap: Map<string, ConceptRankingItem>;
  }> {
    const hotConceptMap = new Map<string, { rank: number; item: ThsConceptHotItem }>();
    const strengthConceptMap = new Map<string, ConceptRankingItem>();

    try {
      // 1. 获取热度榜
      const hotRankResult = await thsConceptHotRankService.fetchConceptHotRank();
      hotRankResult.items.slice(0, this.config.hotTopN).forEach((item, index) => {
        hotConceptMap.set(item.name, { rank: index + 1, item });
      });
      logger.info(`[ConceptResonance] 热度榜获取成功，共 ${hotConceptMap.size} 个热点概念`);
    } catch (error) {
      logger.warn(`[ConceptResonance] 获取热度榜失败: ${(error as Error).message}`);
    }

    try {
      // 2. 获取强度榜
      const strengthResult = await conceptRankingService.fetchDailyConceptRanking(dateStr, this.config.strengthTopN);
      strengthResult.items.forEach(item => {
        strengthConceptMap.set(item.name, item);
      });
      logger.info(`[ConceptResonance] 强度榜获取成功，共 ${strengthConceptMap.size} 个概念`);
    } catch (error) {
      logger.warn(`[ConceptResonance] 获取强度榜失败: ${(error as Error).message}`);
    }

    return { hotConceptMap, strengthConceptMap };
  }

  /**
   * 计算个股的板块共振评分
   */
  private async calculateConceptScore (
    stockCode: string,
    hotConceptMap: Map<string, { rank: number; item: ThsConceptHotItem }>,
    strengthConceptMap: Map<string, ConceptRankingItem>
  ): Promise<ConceptEnhancementResult> {
    const result: ConceptEnhancementResult = {
      hitHotConcepts: [],
      primaryConcept: null,
      isConceptLeader: false,
      leaderInConcepts: [],
      conceptScore: 0,
      conceptScoreDetail: { hotScore: 0, strengthScore: 0, positionScore: 0 },
      conceptLimitUpCount: 0,
      conceptChangeRatio: 0,
      conceptRiseRatio: 0,
    };

    try {
      // 获取个股概念详情
      const conceptDetail = await thsStockConceptService.fetchConcepts(stockCode);

      // 遍历个股所属概念，找出命中热点的
      const candidates: ConceptCandidate[] = [];

      for (const concept of conceptDetail.concepts) {
        const hotInfo = hotConceptMap.get(concept.name);
        if (!hotInfo) continue; // 不在热度榜中，跳过

        const strengthInfo = strengthConceptMap.get(concept.name);
        const strength = strengthInfo?.strength || 0;

        // 检查是否为龙头
        const normalizedCode = this.normalizeCode(stockCode);
        const isLeader = concept.leading.some(l =>
          this.normalizeCode(l.code) === normalizedCode
        );

        candidates.push({
          name: concept.name,
          hotRank: hotInfo.rank,
          strength,
          concept,
          isLeader,
        });

        result.hitHotConcepts.push(concept.name);
        if (isLeader) {
          result.isConceptLeader = true;
          result.leaderInConcepts.push(concept.name);
        }
      }

      if (candidates.length === 0) {
        return result;
      }

      // 选择主概念：优先龙头所在概念 > 热度排名最高
      candidates.sort((a, b) => {
        if (a.isLeader !== b.isLeader) return a.isLeader ? -1 : 1;
        return a.hotRank - b.hotRank;
      });

      const primary = candidates[0];
      result.primaryConcept = primary.name;
      result.conceptLimitUpCount = primary.concept.limitUpCount || 0;
      result.conceptChangeRatio = primary.concept.changeRatio || 0;

      // 计算上涨家数比例
      const riseCount = primary.concept.riseCount || 0;
      const fallCount = primary.concept.fallCount || 0;
      result.conceptRiseRatio = riseCount / (riseCount + fallCount + 0.01);

      // === 计算评分 ===

      // 1. 热度分 (0-20) - 排名衰减
      let hotScore = Math.max(0, Math.min(20, 21 - primary.hotRank));

      // 🛡️ 题材过热保护：热点板块涨幅为负，热度分归零
      if (primary.concept.changeRatio < 0) {
        hotScore = 0;
        logger.debug(`[ConceptResonance] ${stockCode} 主概念 ${primary.name} 涨幅为负，热度分归零`);
      }

      // 2. 强度分 (0-15)
      let strengthScore = 0;
      if (primary.strength >= 80) {
        strengthScore = 15;
      } else if (primary.strength >= 60) {
        strengthScore = 10;
      } else if (primary.strength >= 40) {
        strengthScore = 5;
      } else {
        // 强度不足，热度分打5折
        hotScore = Math.floor(hotScore * 0.5);
        logger.debug(`[ConceptResonance] ${stockCode} 主概念 ${primary.name} 强度不足(${primary.strength})，热度分打折`);
      }

      result.conceptScoreDetail.hotScore = hotScore;
      result.conceptScoreDetail.strengthScore = strengthScore;

      // 3. 地位分 (0-25)
      let positionScore = 0;

      // 龙头加分
      if (primary.isLeader) {
        positionScore += 20;
      } else {
        // 检查是否在成分股中
        const normalizedCode = this.normalizeCode(stockCode);
        const isComponent = primary.concept.components.some((c: { code: string; name: string }) =>
          this.normalizeCode(c.code) === normalizedCode
        );
        if (isComponent) {
          positionScore += 8;
        }
      }

      // 板块效应加分
      if ((primary.concept.limitUpCount || 0) >= 5) {
        positionScore += 5;
      }

      // 板块整体偏强加分
      if (result.conceptRiseRatio > 0.7) {
        positionScore += 2;
      }

      result.conceptScoreDetail.positionScore = positionScore;

      // 🛡️ 总分（设上限60分，防止喧宾夺主）
      result.conceptScore = Math.min(60, hotScore + strengthScore + positionScore);

    } catch (error) {
      logger.warn(`[ConceptResonance] 获取个股概念失败 ${stockCode}: ${(error as Error).message}`);
    }

    return result;
  }

  // ========================================
  // 量价评分逻辑（复用 VolumeSurge）
  // ========================================

  /**
   * 计算量价基础评分
   */
  private calculateBaseScore (item: any): {
    baseScore: number;
    changePercent: number;
    turnoverRate: number;
    amplitude: number;
    upperShadow: number;
    lowerShadow: number;
    volumeRatioTo5Day: number;
  } {
    let changePercent = 0;
    let turnoverRate = 0;
    let amplitude = 0;
    let upperShadow = 0;
    let lowerShadow = 0;
    let volumeRatioTo5Day = 0;

    // 动态查找字段
    for (const key in item) {
      if (key.includes('涨跌幅')) {
        changePercent = parseFloat(item[key] || 0);
      } else if (key.includes('换手率')) {
        turnoverRate = parseFloat(item[key] || 0);
      } else if (key.includes('振幅')) {
        amplitude = parseFloat(item[key] || 0);
      } else if (key.includes('上影线')) {
        upperShadow = parseFloat(item[key] || 0);
      } else if (key.includes('下影线')) {
        lowerShadow = parseFloat(item[key] || 0);
      } else if (key.includes('5日平均') && key.includes('成交量')) {
        volumeRatioTo5Day = parseFloat(item[key] || 0);
      }
    }

    let baseScore = 0;

    // 1. 涨幅得分 (0-20分)
    if (changePercent >= 7 && changePercent <= 10) {
      baseScore += 20;
    } else if (changePercent > 10 && changePercent <= 15) {
      baseScore += 15;
    } else if (changePercent > 15) {
      baseScore += 10;
    }

    // 2. 换手率得分 (0-20分)
    if (turnoverRate >= 8 && turnoverRate <= 15) {
      baseScore += 20;
    } else if (turnoverRate >= 5 && turnoverRate < 8) {
      baseScore += 15;
    } else if (turnoverRate > 15 && turnoverRate <= 25) {
      baseScore += 12;
    } else if (turnoverRate > 25) {
      baseScore += 5;
    }

    // 3. 上影线得分 (0-15分)
    if (upperShadow <= 1) {
      baseScore += 15;
    } else if (upperShadow <= 2) {
      baseScore += 12;
    } else if (upperShadow <= 3) {
      baseScore += 8;
    }

    // 4. 下影线得分 (0-15分)
    if (lowerShadow <= 1) {
      baseScore += 15;
    } else if (lowerShadow <= 2) {
      baseScore += 10;
    } else if (lowerShadow <= 3) {
      baseScore += 5;
    }

    // 5. 振幅得分 (0-15分)
    if (amplitude >= 8 && amplitude <= 12) {
      baseScore += 15;
    } else if (amplitude < 8) {
      baseScore += 12;
    } else if (amplitude <= 15) {
      baseScore += 8;
    } else {
      baseScore += 3;
    }

    // 6. 量能放大得分 (0-15分)
    if (volumeRatioTo5Day >= 2 && volumeRatioTo5Day <= 4) {
      baseScore += 15;
    } else if (volumeRatioTo5Day > 4 && volumeRatioTo5Day <= 6) {
      baseScore += 12;
    } else if (volumeRatioTo5Day > 6) {
      baseScore += 8;
    } else if (volumeRatioTo5Day >= 1.5) {
      baseScore += 10;
    }

    return {
      baseScore,
      changePercent,
      turnoverRate,
      amplitude,
      upperShadow,
      lowerShadow,
      volumeRatioTo5Day,
    };
  }

  // ========================================
  // 主入口：扫描并保存
  // ========================================

  /**
   * 扫描并保存主线共振策略选股结果
   */
  async scanAndSave (dateStr?: string): Promise<number> {
    const targetDate = dateStr || formatDate(getToday(), 'YYYYMMDD');

    // 检查是否为交易日
    if (!tradingCalendarService.isTradingDay(targetDate)) {
      logger.warn(`[ConceptResonance] ${targetDate} 不是交易日，跳过扫描`);
      return 0;
    }

    logger.info(`[ConceptResonance] ========== 开始扫描 ${targetDate} ==========`);

    // ========================================
    // Step 1: 获取市场环境数据
    // ========================================
    let marketSentimentScore = 50;
    let marketLimitUpCount = 0;
    let marketAdvice = 'normal';

    try {
      const moodData = marketMoodService.getMoodData(targetDate);
      if (moodData) {
        marketSentimentScore = moodData.strong;
        marketLimitUpCount = moodData.ztjs || 0;
        if (moodData.strong >= 70) {
          marketAdvice = 'aggressive';
        } else if (moodData.strong >= 50) {
          marketAdvice = 'normal';
        } else if (moodData.strong >= 30) {
          marketAdvice = 'cautious';
        } else {
          marketAdvice = 'pause';
        }
        logger.info(`[ConceptResonance] 市场情绪: 评分=${marketSentimentScore}, 涨停数=${marketLimitUpCount}`);
      } else {
        let sentiment = await marketSentimentService.getSentimentByDate(targetDate);
        if (!sentiment) {
          sentiment = await marketSentimentService.fetchAndCalculateSentiment(targetDate);
        }
        if (sentiment) {
          marketSentimentScore = sentiment.score || 50;
          marketLimitUpCount = sentiment.limitUpCount || 0;
          marketAdvice = sentiment.advice || 'normal';
        }
      }
    } catch (error) {
      logger.warn(`[ConceptResonance] 获取市场情绪失败: ${(error as Error).message}`);
    }

    // ========================================
    // Step 2: 获取大盘趋势
    // ========================================
    const indexAboveMa20 = await this.checkIndexAboveMa20(targetDate);
    logger.info(`[ConceptResonance] 大盘趋势: 上证指数${indexAboveMa20 ? '站上' : '跌破'}20日均线`);

    // ========================================
    // Step 3: 获取涨停股信息
    // ========================================
    await this.randomDelay();
    const { firstBoardSet, continuousBoardMap } = await this.getLimitUpBoardInfo(targetDate);

    // ========================================
    // Step 4: 获取量价初筛数据
    // ========================================
    await this.randomDelay();
    const rawData = await this.fetchFromWencai(targetDate);
    logger.info(`[ConceptResonance] 量价初筛: ${rawData.length} 条数据`);

    if (rawData.length === 0) {
      return 0;
    }

    // ========================================
    // Step 5: 🆕 获取板块共振上下文
    // ========================================
    const { hotConceptMap, strengthConceptMap } = await this.fetchConceptContext(targetDate);

    // ========================================
    // Step 6: 计算量价基础分，排序取 TopN 进行深度扫描
    // ========================================
    const candidates = rawData.map(item => {
      const stockCode = item.code || item['股票代码'];
      const stockName = item['股票简称'] || item['名称'];
      const scoreResult = this.calculateBaseScore(item);

      return {
        item,
        stockCode,
        stockName,
        ...scoreResult,
      };
    });

    // 按基础分排序，取 Top N 进行深度扫描
    candidates.sort((a, b) => b.baseScore - a.baseScore);
    const topCandidates = candidates.slice(0, this.config.deepScanLimit);
    logger.info(`[ConceptResonance] 取 Top ${topCandidates.length} 进行深度扫描`);

    // ========================================
    // Step 7: 🆕 并发计算板块共振评分
    // ========================================
    const limit = pLimit(this.config.concurrencyLimit);

    const enhancedCandidates = await Promise.all(
      topCandidates.map(candidate =>
        limit(async () => {
          try {
            const conceptResult = await this.calculateConceptScore(
              candidate.stockCode,
              hotConceptMap,
              strengthConceptMap
            );
            return { ...candidate, conceptResult };
          } catch (error) {
            logger.warn(`[ConceptResonance] ${candidate.stockCode} 概念评分失败`);
            return {
              ...candidate,
              conceptResult: {
                hitHotConcepts: [],
                primaryConcept: null,
                isConceptLeader: false,
                leaderInConcepts: [],
                conceptScore: 0,
                conceptScoreDetail: { hotScore: 0, strengthScore: 0, positionScore: 0 },
                conceptLimitUpCount: 0,
              } as ConceptEnhancementResult,
            };
          }
        })
      )
    );

    // ========================================
    // Step 8: 保存结果
    // ========================================
    let count = 0;

    for (const candidate of enhancedCandidates) {
      try {
        const { item, stockCode, stockName, baseScore, conceptResult } = candidate;

        const price = parseFloat(item['最新价'] || 0);
        let volumeRatio = 0;
        let turnover = 0;
        let industry = item['所属行业'] || '';
        let concept = item['所属概念'] || '';
        let limitUpReason = '';

        for (const key in item) {
          if (key.includes('量比')) {
            volumeRatio = parseFloat(item[key] || 0);
          } else if (key.includes('成交额') && !key.includes('排名')) {
            turnover = parseFloat(item[key] || 0);
          } else if (key.includes('所属行业') && !industry) {
            industry = item[key];
          } else if (key.includes('所属概念') && !concept) {
            concept = item[key];
          } else if (key.includes('涨停原因') || key.includes('异动原因')) {
            limitUpReason = item[key] || '';
          }
        }

        // 判断涨停/首板/连板
        const codeStr = this.normalizeCode(stockCode);
        const isCreGem = codeStr.startsWith('30') || codeStr.startsWith('68');
        const limitThreshold = isCreGem ? 19.5 : 9.5;
        const isLimitUp = candidate.changePercent >= limitThreshold;
        const isFirstBoard = firstBoardSet.has(codeStr);
        const continuousBoardCount = continuousBoardMap.get(codeStr) || (isFirstBoard ? 1 : 0);

        // 计算市场环境加分
        let marketBonus = 0;
        if (marketLimitUpCount >= 100) {
          marketBonus += 10;
        } else if (marketLimitUpCount >= 60) {
          marketBonus += 5;
        } else if (marketLimitUpCount < 30) {
          marketBonus -= 10;
        }
        if (indexAboveMa20) {
          marketBonus += 5;
        } else {
          marketBonus -= 10;
        }

        // 计算首板/连板加分
        let boardBonus = 0;
        if (isFirstBoard) {
          boardBonus += 15;
        } else if (continuousBoardCount === 2) {
          boardBonus += 10;
        } else if (continuousBoardCount >= 3) {
          boardBonus += 5;
        }

        // 🆕 计算最终策略评分（加入板块共振分数）
        const conceptScore = conceptResult.conceptScore || 0;
        const strategyScore = Math.max(0, Math.min(160,
          baseScore + marketBonus + boardBonus + conceptScore * this.config.beta
        ));

        // 风险等级判定
        let riskLevel: 'low' | 'medium' | 'high' = 'medium';
        const riskTags: string[] = [];

        // 🛡️ 龙头保护
        if (conceptResult.isConceptLeader && (conceptResult.conceptLimitUpCount || 0) >= 3) {
          riskLevel = 'low';
          riskTags.push('concept_leader');
        } else if (strategyScore >= 85 && indexAboveMa20 && marketLimitUpCount >= 60) {
          riskLevel = 'low';
        } else if (strategyScore < 60 || !indexAboveMa20 || marketLimitUpCount < 30) {
          riskLevel = 'high';
        }

        // 🛡️ 题材过热标记
        if (conceptResult.primaryConcept && conceptResult.conceptScoreDetail?.hotScore === 0 &&
          conceptResult.hitHotConcepts.length > 0) {
          riskTags.push('concept_cooling');
        }

        await ConceptResonance.findOneAndUpdate(
          { date: targetDate, stockCode },
          {
            date: targetDate,
            stockCode,
            stockName,
            price,
            changePercent: candidate.changePercent,
            volumeRatio,
            turnover,
            turnoverRate: candidate.turnoverRate,
            industry,
            concept,
            // K线形态
            amplitude: candidate.amplitude,
            upperShadow: candidate.upperShadow,
            lowerShadow: candidate.lowerShadow,
            volumeRatioTo5Day: candidate.volumeRatioTo5Day,
            aboveMa10: true,
            is20DayHigh: true,
            isBottomRising: true,
            // 首板/连板
            isLimitUp,
            isFirstBoard,
            continuousBoardCount,
            limitUpReason,
            // 市场环境
            marketSentimentScore,
            marketLimitUpCount,
            indexAboveMa20,
            marketAdvice,
            // 🆕 板块共振
            hitHotConcepts: conceptResult.hitHotConcepts,
            primaryConcept: conceptResult.primaryConcept,
            isConceptLeader: conceptResult.isConceptLeader,
            leaderInConcepts: conceptResult.leaderInConcepts,
            conceptScore,
            conceptScoreDetail: conceptResult.conceptScoreDetail,
            conceptLimitUpCount: conceptResult.conceptLimitUpCount,
            conceptChangeRatio: conceptResult.conceptChangeRatio,
            conceptRiseRatio: conceptResult.conceptRiseRatio,
            // 评分
            baseScore,
            marketBonus,
            boardBonus,
            betaCoefficient: this.config.beta,
            strategyScore,
            riskLevel,
            riskTags,
            status: 'pending',
          },
          { upsert: true, new: true }
        );
        count++;
      } catch (err) {
        logger.error(`[ConceptResonance] 保存数据失败: ${(err as Error).message}`);
      }
    }

    logger.info(`[ConceptResonance] ========== 扫描完成，保存 ${count} 条 ==========`);
    return count;
  }

  // ========================================
  // 查询方法
  // ========================================

  /**
   * 获取指定日期的选股列表
   */
  async getList (dateStr: string): Promise<any[]> {
    return ConceptResonance.find({ date: dateStr }).sort({ strategyScore: -1, changePercent: -1 });
  }

  /**
 * 获取指定日期 且 strategyScore >= config.minstrategyScore 的选股列表
 */
  async getBuySignalList (config: ConceptResonanceQueryConfig): Promise<any[]> {
    const prevDateStr = tradingCalendarService.getPrevTradingDay(config.dateStr);
    // const list = await ConceptResonance.find({ date: prevDateStr, strategyScore: { $gte: config?.strategyScore ?? -1 } }).sort({ strategyScore: -1, changePercent: -1 });
    const list = await ConceptResonance.find({
      date: prevDateStr,
      strategyScore: { $gte: -1 },
      // 概念评分至少30分
      conceptScore: { $gte: 30 }
    }).sort({ strategyScore: -1, changePercent: -1 });
    const targetDateStr = config.dateStr;
    let tencentQuotes = new Map<string, any>();
    // 如果 targetDateStr 是交易日且是今天，则从腾讯获取当日数据
    if (tradingCalendarService.isTradingDay(targetDateStr) && targetDateStr === formatDate(getToday(), 'YYYYMMDD')) {
      logger.info(`[ConceptResonance] ${targetDateStr} 为交易日且是今天，使用腾讯数据更新开盘数据`);
      const codes = list.map(v => v.stockCode);
      // 批量获取腾讯数据
      tencentQuotes = await fetchTencentRealTimeQuotes(codes);
      console.log('tencentQuotes', JSON.stringify(tencentQuotes));
      // 如果是当天9.30之前 存储一份数据到本地
      const now = new Date();
      if (now.getHours() < 9 || (now.getHours() === 9 && now.getMinutes() < 30)) {
        logger.info(`[ConceptResonance] ${targetDateStr} 为交易日且是今天，且当前时间小于9.30，存储一份数据到本地`);
        writeToFile(`/tencentQuotes/`,`${targetDateStr}.json`, Array.from(tencentQuotes.entries()));
      }
    }
    // 为每一支股票获取开盘数据
    for (const stock of list) {
      try {
        let openData: OpenData | null = null;
        // 如果数据不为空-证明是当日数据 - 优先使用腾讯数据
        if (tencentQuotes.size > 0) {
          openData = tencentQuotes.get(stock.stockCode);
        } else {
          // 否则使用 buySignalService 获取开盘数据
          openData = await buySignalService.getOpeningData(stock.stockCode, config.dateStr);
        }

        // ### 2.1 开盘强度（满分30分）⭐最重要

        //     | 开盘涨幅 | 得分 | 说明 |
        //     |---------|------|------|
        //     | 1% ~ 3% | 30分 | 🌟 最佳区间：强势延续但不追高 |
        //     | 3% ~ 5% | 25分 | 偏高，需注意风险 |
        //     | 5% ~ 7% | 15分 | 追高风险较大 |
        //     | > 7%    | -5分  | ❌ 不建议追高 |
        //     | 0% ~ 1% | 20分 | 资金态度中性，可观察 |
        //     | -2% ~ 0% | 15分 | 可能有低吸机会 |
        //     | < -2%   | 5分  | ❌ 资金不认可 |

        //     **理由**：
        //     - 开盘过高（>5%）意味着追高风险，获利盘抛压大
        //     - 开盘过低（<0%）说明资金不认可，昨日的"强势"可能是假象
        //     - 理想的开盘是1%-3%，既表明资金延续，又留有上涨空间

        if (openData) {
          // 计算开盘强度评分
          let openStrengthScore = 0;
          if (openData.openChangePercent >= 1 && openData.openChangePercent <= 3) {
            openStrengthScore = 30;
          } else if (openData.openChangePercent > 3 && openData.openChangePercent <= 5) {
            openStrengthScore = 25;
          } else if (openData.openChangePercent > 5 && openData.openChangePercent <= 7) {
            openStrengthScore = 15;
          } else if (openData.openChangePercent > 7) {
            openStrengthScore = -5;
          } else if (openData.openChangePercent >= 0 && openData.openChangePercent < 1) {
            openStrengthScore = 20;
          } else if (openData.openChangePercent >= -2 && openData.openChangePercent < 0) {
            openStrengthScore = 15;
          } else if (openData.openChangePercent < -2) {
            openStrengthScore = 5;
          }

          //   ### 2.2 竞价抢筹（满分15分）

          //     | 竞价金额占比（相对昨日成交额） | 得分 | 说明 |
          //     |------------------------------|------|------|
          //     | ≥ 5%   | 15分 | 主力大幅抢筹 |
          //     | 3% ~ 5% | 12分 | 有主力抢筹迹象 |
          //     | 2% ~ 3% | 8分  | 正常水平 |
          //     | 1% ~ 2% | 5分  | 一般 |
          //     | < 1%   | 2分  | 竞价冷淡 |

          //     **理由**：
          //     - 集合竞价是主力资金的"投票"
          //     - 竞价金额大说明主力在积极抢筹
          //     - 竞价金额小说明主力观望或已完成布局

          // 计算竞价抢筹评分
          let auctionScore = 0;
          if (openData.auctionAmountRatio >= 5) {
            auctionScore = 15;
          } else if (openData.auctionAmountRatio >= 3) {
            auctionScore = 12;
          } else if (openData.auctionAmountRatio >= 2) {
            auctionScore = 8;
          } else if (openData.auctionAmountRatio >= 1) {
            auctionScore = 5;
          } else {
            auctionScore = 2;
          }
          // 开盘强度评分
          stock.openStrengthScore = openStrengthScore;
          // 竞价抢筹评分
          stock.auctionScore = auctionScore;
          // 开盘总评分
          stock.openingTotalScore = openStrengthScore + auctionScore;
          // 更新策略总评分
          stock.strategyScore = (stock.strategyScore || 0) + stock.openingTotalScore;
        }
      } catch (error) {
        logger.warn(`[ConceptResonance] 获取开盘数据失败 ${stock.stockCode}: ${(error as Error).message}`);
      }
    }
    return list.filter(v => (v?.strategyScore ?? 0) >= (config?.strategyScore ?? -1)).sort((a, b) => (b.strategyScore || 0) - (a.strategyScore || 0));
  }


  /**
   * 获取高质量信号（评分>=80分）
   */
  async getHighQualitySignals (dateStr: string): Promise<any[]> {
    return ConceptResonance.find({
      date: dateStr,
      strategyScore: { $gte: 80 }
    }).sort({ strategyScore: -1 });
  }

  /**
   * 获取龙头股列表
   */
  async getLeaderStocks (dateStr: string): Promise<any[]> {
    return ConceptResonance.find({
      date: dateStr,
      isConceptLeader: true
    }).sort({ strategyScore: -1 });
  }

  /**
   * 获取命中热点的股票
   */
  async getHotConceptStocks (dateStr: string): Promise<any[]> {
    return ConceptResonance.find({
      date: dateStr,
      'hitHotConcepts.0': { $exists: true }
    }).sort({ strategyScore: -1 });
  }

  /**
   * 获取统计数据
   */
  async getStats (dateStr: string): Promise<{
    total: number;
    highQualityCount: number;
    leaderCount: number;
    hotConceptHitCount: number;
    avgScore: number;
    maxScore: number;
    avgConceptScore: number;
    conceptDistribution: { name: string; count: number }[];
    marketInfo: {
      sentiment: number;
      limitUpCount: number;
      indexAboveMa20: boolean;
      advice: string;
    };
  }> {
    const all = await ConceptResonance.find({ date: dateStr });

    if (all.length === 0) {
      return {
        total: 0,
        highQualityCount: 0,
        leaderCount: 0,
        hotConceptHitCount: 0,
        avgScore: 0,
        maxScore: 0,
        avgConceptScore: 0,
        conceptDistribution: [],
        marketInfo: {
          sentiment: 0,
          limitUpCount: 0,
          indexAboveMa20: false,
          advice: 'unknown',
        },
      };
    }

    const scores = all.map(s => s.strategyScore || 0);
    const conceptScores = all.map(s => s.conceptScore || 0);
    const highQualityCount = all.filter(s => (s.strategyScore || 0) >= 80).length;
    const leaderCount = all.filter(s => s.isConceptLeader).length;
    const hotConceptHitCount = all.filter(s => (s.hitHotConcepts?.length || 0) > 0).length;

    // 概念分布统计
    const conceptMap = new Map<string, number>();
    all.forEach(s => {
      if (s.primaryConcept) {
        conceptMap.set(s.primaryConcept, (conceptMap.get(s.primaryConcept) || 0) + 1);
      }
    });
    const conceptDistribution = Array.from(conceptMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const first = all[0];
    const moodData = marketMoodService.getMoodData(dateStr);

    let marketInfo;
    if (moodData) {
      let advice = 'normal';
      if (moodData.strong >= 70) advice = 'aggressive';
      else if (moodData.strong >= 50) advice = 'normal';
      else if (moodData.strong >= 30) advice = 'cautious';
      else advice = 'pause';

      marketInfo = {
        sentiment: moodData.strong,
        limitUpCount: moodData.ztjs || 0,
        indexAboveMa20: first.indexAboveMa20 || false,
        advice,
      };
    } else {
      marketInfo = {
        sentiment: first.marketSentimentScore || 0,
        limitUpCount: first.marketLimitUpCount || 0,
        indexAboveMa20: first.indexAboveMa20 || false,
        advice: first.marketAdvice || 'normal',
      };
    }

    return {
      total: all.length,
      highQualityCount,
      leaderCount,
      hotConceptHitCount,
      avgScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10,
      maxScore: Math.max(...scores),
      avgConceptScore: Math.round(conceptScores.reduce((a, b) => a + b, 0) / conceptScores.length * 10) / 10,
      conceptDistribution,
      marketInfo,
    };
  }

  /**
   * 获取可用日期列表
   */
  async getAvailableDates (): Promise<string[]> {
    const result = await ConceptResonance.distinct('date') as string[];
    return result
      .map((d: string) => d.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'))
      .sort((a, b) => b.localeCompare(a));
  }

  /**
   * 清空所有数据
   */
  async clearAll (): Promise<void> {
    await ConceptResonance.deleteMany({});
  }

  /**
   * 更新配置
   */
  updateConfig (config: Partial<ConceptResonanceConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info(`[ConceptResonance] 配置已更新: beta=${this.config.beta}`);
  }

  /**
   * 获取当前配置
   */
  getConfig (): ConceptResonanceConfig {
    return { ...this.config };
  }

  /**
   * 策略回测
   * @param startDate 开始日期 YYYYMMDD
   * @param endDate 结束日期 YYYYMMDD
   * @param config 回测配置
   */
  async backtest (startDate: string, endDate: string, config: any = {}): Promise<any> {
    let {
      signalFilter = 'high_score',
      minConceptScore = 30,
      minTotalScore = 70,
      basePosition = 50000,
      stopLossPercent = 0.05,
      takeProfitPercent = 0.15,
      maxHoldDays = 3,
      leaderBonus = 0.5,
    } = config;

    logger.info(`[ConceptResonance] 回测参数: ${JSON.stringify(config)}`);

    // 1. 获取日期范围内的所有主线共振候选标的
    let candidates: any[] = [];
    const dateList = tradingCalendarService.getTradingDaysInRange(startDate, endDate);
    for (const dateStr of dateList) {
      const dailyCandidates = await this.getBuySignalList({ dateStr, strategyScore: minTotalScore });
      candidates = candidates.concat(dailyCandidates);
    }

    if (candidates.length === 0) {
      return {
        startDate,
        endDate,
        config: { signalFilter, minConceptScore, minTotalScore, basePosition, stopLossPercent, takeProfitPercent, maxHoldDays, leaderBonus },
        totalTrades: 0,
        winTrades: 0,
        lossTrades: 0,
        winRate: 0,
        totalProfitAmount: 0,
        totalProfitPercent: 0,
        avgProfitPercent: 0,
        avgWinPercent: 0,
        avgLossPercent: 0,
        profitLossRatio: 0,
        totalInvested: 0,
        maxDrawdown: 0,
        maxDrawdownPercent: 0,
        maxProfit: 0,
        maxLoss: 0,
        maxConsecutiveWins: 0,
        maxConsecutiveLosses: 0,
        avgHoldDays: 0,
        trades: [],
      };
    }
    // 2. 筛选符合条件的候选标的
    let filtered = candidates.filter(c => {
      const totalScore = (c.openStrengthScore || 0) + (c.auctionScore || 0) + (c.conceptScore || 0) + (c.strategyScore || 0);
      if ((c.conceptScore || 0) < minConceptScore) return false;
      if ((totalScore) < minTotalScore) return false;
      if (signalFilter === 'leader_only' && !c.isConceptLeader) return false;
      return true;
    });

    logger.info(`[ConceptResonance] 筛选后候选标的: ${filtered.length} / ${candidates.length}`);

    //过虑概念分数小于30的标的
    filtered = filtered.filter(c => c.conceptScore >= 30);
    logger.info(`[ConceptResonance] 过虑后候选标的: ${filtered.length} / ${candidates.length}`);

    //每天最多交易N支股票
    const maxTradesPerDay = 3;
    const groupedByDate: { [date: string]: any[] } = {};
    // 按日期分组 且 按总分排序
    for (const item of filtered) {
      if (!groupedByDate[item.date]) {
        groupedByDate[item.date] = [];
      }
      groupedByDate[item.date].push(item);
    }
    // 每天取前N支股票
    filtered = [];
    for (const dateStr in groupedByDate) {
      const group = groupedByDate[dateStr];
      group.sort((a, b) => (b.strategyScore || 0) - (a.strategyScore || 0));
      filtered = filtered.concat(group.slice(0, maxTradesPerDay));
    }
    //打印日期与股票名称
    logger.info(`[ConceptResonance] 每天取前${maxTradesPerDay}支股票后候选标的: ${filtered.map(f => `${f.date} ${f.stockCode} ${f.stockName}`).join(', ')}`);
    logger.info(`[ConceptResonance] 每天取前${maxTradesPerDay}支股票后候选标的: ${filtered.length} / ${candidates.length}`);
    // return;

    // 3. 模拟交易
    const trades: any[] = [];
    let totalInvested = 0;
    let totalProfit = 0;
    let consecutiveWins = 0;
    let consecutiveLosses = 0;
    let maxConsecutiveWins = 0;
    let maxConsecutiveLosses = 0;
    let leaderTrades = 0;
    let leaderWins = 0;

    for (const candidate of filtered) {
      console.log(`[ConceptResonance][Backtest] 回测 ${candidate.date} ${candidate.stockCode} ${candidate.stockName}`);
      // 计算仓位
      let position = basePosition;

      // 回测单只股票
      const buyDate = tradingCalendarService.getNextTradingDay(candidate.date) || '';
      const backtestRes = await backtestStock(
        candidate.stockCode,
        candidate.stockName,
        buyDate,
        {
          stopLossPercent: stopLossPercent * 100,
          takeProfitPercent: takeProfitPercent * 100,
          maxHoldDays,
          useDay2LowAsStopLoss: true,
        }
      )
      if (backtestRes) {
        const buyPrice = backtestRes.entryPrice;
        const exitPrice = backtestRes.exitPrice;
        const { holdDays, exitReason, exitDate } = backtestRes;
        const profitPercent = Number((((exitPrice - buyPrice) / buyPrice) * 100).toFixed(2));
        const profitAmount = Math.round(position * (Number(backtestRes.profitPercent.toFixed(2)) / 100));

        trades.push({
          stockCode: candidate.stockCode,
          stockName: candidate.stockName,
          conceptName: candidate.primaryConcept || '-',
          isLeader: candidate.isConceptLeader || false,
          conceptScore: candidate.conceptScore || 0,
          totalScore: candidate.strategyScore || 0,
          buyDate,
          buyPrice,
          exitDate,
          exitPrice,
          holdDays,
          position,
          profitPercent,
          profitAmount,
          exitReason,
        });

        totalInvested += position;
        totalProfit += profitAmount;

        // 统计连胜连亏
        if (profitPercent > 0) {
          consecutiveWins++;
          consecutiveLosses = 0;
          maxConsecutiveWins = Math.max(maxConsecutiveWins, consecutiveWins);
        } else {
          consecutiveLosses++;
          consecutiveWins = 0;
          maxConsecutiveLosses = Math.max(maxConsecutiveLosses, consecutiveLosses);
        }

        // 龙头统计
        if (candidate.isConceptLeader) {
          leaderTrades++;
          if (profitPercent > 0) leaderWins++;
        }
      }
    }

    // 4. 计算统计结果
    const winTrades = trades.filter(t => t.profitPercent > 0).length;
    const lossTrades = trades.filter(t => t.profitPercent < 0).length;
    const profits = trades.filter(t => t.profitPercent > 0).map(t => t.profitPercent);
    const losses = trades.filter(t => t.profitPercent < 0).map(t => t.profitPercent);

    const avgWinPercent = profits.length > 0
      ? Number((profits.reduce((a, b) => a + b, 0) / profits.length).toFixed(2))
      : 0;
    const avgLossPercent = losses.length > 0
      ? Number((losses.reduce((a, b) => a + b, 0) / losses.length).toFixed(2))
      : 0;

    return {
      startDate,
      endDate,
      config: { signalFilter, minConceptScore, minTotalScore, basePosition, stopLossPercent, takeProfitPercent, maxHoldDays, leaderBonus },
      totalTrades: trades.length,
      winTrades,
      lossTrades,
      winRate: trades.length > 0 ? Number(((winTrades / trades.length) * 100).toFixed(2)) : 0,
      totalProfitAmount: totalProfit,
      totalProfitPercent: totalInvested > 0 ? Number(((totalProfit / totalInvested) * 100).toFixed(2)) : 0,
      avgProfitPercent: trades.length > 0
        ? Number((trades.reduce((sum, t) => sum + t.profitPercent, 0) / trades.length).toFixed(2))
        : 0,
      avgWinPercent,
      avgLossPercent,
      profitLossRatio: avgLossPercent !== 0
        ? Number((Math.abs(avgWinPercent / avgLossPercent)).toFixed(2))
        : avgWinPercent > 0 ? 999 : 0,
      totalInvested,
      maxDrawdown: 0, // 简化版不计算
      maxDrawdownPercent: 0,
      maxProfit: profits.length > 0 ? Math.max(...profits) : 0,
      maxLoss: losses.length > 0 ? Math.min(...losses) : 0,
      maxConsecutiveWins,
      maxConsecutiveLosses,
      avgHoldDays: trades.length > 0
        ? Number((trades.reduce((sum, t) => sum + t.holdDays, 0) / trades.length).toFixed(1))
        : 0,
      leaderWinRate: leaderTrades > 0 ? Number(((leaderWins / leaderTrades) * 100).toFixed(2)) : undefined,
      trades,
    };
  }


  //更新每日备选股票的K线数据缓存
  async updateKlineCacheForDate (dateStr: string = dayjs().format('YYYY-MM-DD')) {
    const list = await ConceptResonance.find({
      date: dateStr,
      strategyScore: { $gte: -1 },
      // 概念评分至少30分
      conceptScore: { $gte: 30 }
    }).sort({ strategyScore: -1, changePercent: -1 });
    for (const stock of list) {
      try {
        await klineCacheService.ensureKlines(stock.stockCode,{targetDates: []});
      } catch (error) {
        logger.warn(`[ConceptResonance] 更新K线缓存失败 ${stock.stockCode}: ${(error as Error).message}`);
      }
    }
  }
}

/**
 * 回测单只股票
 * @param stockCode 股票代码
 * @param stockName 股票名称
 * @param buyDate 买入日期
 * @param config 回测配置
 */
interface BacktestConfig {
  stopLossPercent: number;  // 止损百分比（如5表示-5%）
  takeProfitPercent: number; // 止盈百分比（如10表示+10%）
  maxHoldDays: number;      // 最大持仓天数
  useDay2LowAsStopLoss?: boolean; // 是否使用第二天最低价作为止损位
}

interface BacktestResult {
  entryDate: string;        // 买入日期
  entryPrice: number;       // 买入价格
  exitDate: string;         // 卖出日期
  exitPrice: number;        // 卖出价格
  holdDays: number;         // 持仓天数
  exitReason: 'stop_loss' | 'take_profit' | 'max_days' | 'data_end'; // 退出原因
  profitPercent: number;    // 收益百分比
}

async function backtestStock (
  stockCode: string,
  stockName: string,
  buyDate: string,
  config: BacktestConfig
): Promise<BacktestResult | null> {

  // 如果不是交易日，跳过
  if (!tradingCalendarService.isTradingDay(buyDate)) {
    logger.info(`[backtestStock] ${stockCode} 买入日期=${buyDate} 不是交易日，跳过`);
    return null;
  }

  // 获取K线数据（买入日及其后maxHoldDays天的数据）
  const klineData = await klineCacheService.getKlinesByStartDay(stockCode, buyDate, config.maxHoldDays);
  if (klineData.length === 0) {
    logger.info(`[backtestStock] ${stockCode} 无K线数据`);
    return null;
  }

  // 找到买入日的K线索引
  const buyIdx = klineData.findIndex(k => k.date === buyDate);
  if (buyIdx === -1) {
    logger.info(`[backtestStock] ${stockCode} 买入日期=${buyDate} 未找到K线数据`);
    return null;
  }

  const buyKline = klineData[buyIdx];
  const buyPrice = buyKline.open;  // 买入价使用开盘价
  const buyDateStr = buyKline.date;

  if (buyPrice <= 0) {
    logger.debug(`${stockCode} 买入价为0`);
    return null;
  }

  // 计算止盈止损价
  const stopLossPrice = buyPrice * (1 - Math.abs(config.stopLossPercent) / 100);
  const takeProfitPrice = buyPrice * (1 + Math.abs(config.takeProfitPercent) / 100);

  // 模拟持仓期间
  let exitPrice = 0;
  let exitDate = '';
  let holdDays = 0;
  let exitReason: BacktestResult['exitReason'] = 'data_end';

  // 从买入日的下一天开始检查退出条件
  for (let i = 0; i < config.maxHoldDays; i++) {
    const holdIdx = buyIdx + i;
    if (holdIdx >= klineData.length) {
      // 数据不足，用最后一天收盘价
      exitPrice = klineData[klineData.length - 1].close;
      exitDate = klineData[klineData.length - 1].date;
      holdDays = klineData.length - buyIdx;
      exitReason = 'data_end';
      break;
    }

    const dayKline = klineData[holdIdx];
    const dayMood = marketMoodService.getMood(dayKline.date) ?? 50;

    // 买入当天（i=0）跳过卖出检查，因为刚买入
    if (i === 0) {
      continue;
    }

    // 检查市场情绪恶化
    // if (dayMood < config.marketPanicThreshold) {
    //   exitPrice = dayKline.open;  // 情绪恶化开盘卖出
    //   exitDate = dayKline.date;
    //   holdDays = i + 1;  // 持仓天数（包含买入当天）
    //   exitReason = 'market_panic';
    //   break;
    // }

    // 检查止损（当日最低价触及止损位）
    if (dayKline.low <= stopLossPrice) {
      exitPrice = stopLossPrice;
      exitDate = dayKline.date;
      holdDays = i + 1;
      exitReason = 'stop_loss';
      break;
    }

    // 检查止盈（当日最高价触及止盈位）
    if (dayKline.high >= takeProfitPrice) {
      exitPrice = takeProfitPrice;
      exitDate = dayKline.date;
      holdDays = i + 1;
      exitReason = 'take_profit';
      break;
    }

    // 最后一天收盘卖出（i = maxHoldDays - 1 表示第 maxHoldDays 天）
    if (i === config.maxHoldDays - 1) {
      exitPrice = dayKline.close;
      exitDate = dayKline.date;
      holdDays = i + 1;
      exitReason = 'max_days';
      break;
    }
  }

  if (exitPrice <= 0) {
    return null;
  }

  const profitPercent = ((exitPrice - buyPrice) / buyPrice) * 100;

  return {
    entryDate: buyDateStr,
    entryPrice: buyPrice,
    exitDate,
    exitPrice,
    holdDays,
    exitReason,
    profitPercent: Math.round(profitPercent * 100) / 100,  // 保留两位小数
  };
}

// 导出单例
export const conceptResonanceService = new ConceptResonanceService();
