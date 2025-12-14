import { logger } from '../utils';
import { MarketSentiment, IMarketSentiment, calculateSentimentScore, SentimentLevel, TradingAdvice } from '../models/MarketSentiment';
import { formatDate, parseDate } from '../utils/dateUtils';
import { marketMoodService } from './marketMoodService';
import axios from 'axios';

// 导入同花顺工具
// eslint-disable-next-line @typescript-eslint/no-var-requires
const thsUtils = require('../utils/thsUtils');

/**
 * 市场情绪服务
 * 负责：
 * 1. 盘后获取市场情绪数据
 * 2. 计算情绪评分
 * 3. 生成交易建议
 */
export class MarketSentimentService {

  /**
   * 生成动态 Hexin-V
   */
  private getHexinV(): string {
    try {
      return thsUtils.update();
    } catch (error) {
      return 'Ax8Ssngzh0M9kINf4Czhe-DDqnmphHMgjdx3GrFqu4gVdzBiuVQDdp2oB0_C';
    }
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 随机延迟（模拟真人操作）
   * @param minMs 最小延迟毫秒
   * @param maxMs 最大延迟毫秒
   */
  private randomDelay(minMs: number = 2000, maxMs: number = 5000): Promise<void> {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    logger.debug(`等待 ${(delay / 1000).toFixed(1)} 秒...`);
    return new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * 使用问财查询市场数据
   */
  private async queryWencai(question: string): Promise<any[]> {
    try {
      const hexinV = this.getHexinV();
      const url = 'http://www.iwencai.com/customized/chart/get-robot-data';
      
      const data = {
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
      };

      const headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Hexin-V': hexinV,
        'Cookie': `v=${hexinV}`,
        'Host': 'www.iwencai.com',
        'Origin': 'http://www.iwencai.com',
        'Referer': 'http://www.iwencai.com/',
      };

      const response = await axios.post(url, data, { headers, timeout: 30000 });
      const resData = response.data;

      if (resData.status_code === 0) {
        return resData.data?.answer?.[0]?.txt?.[0]?.content?.components?.[0]?.data?.datas || [];
      }
      return [];
    } catch (error) {
      logger.debug(`问财查询失败: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * 获取涨停数量
   */
  private async fetchLimitUpCount(dateStr: string): Promise<number> {
    const question = `${dateStr} 涨停 非ST 非北交所`;
    const result = await this.queryWencai(question);
    return result.length || 0;
  }

  /**
   * 获取跌停数量
   */
  private async fetchLimitDownCount(dateStr: string): Promise<number> {
    const question = `${dateStr} 跌停 非ST 非北交所`;
    const result = await this.queryWencai(question);
    return result.length || 0;
  }

  /**
   * 获取上涨下跌平盘数量
   */
  private async fetchUpDownCount(dateStr: string): Promise<{
    upCount: number;
    downCount: number;
    flatCount: number;
  }> {
    // 上涨
    const upQuestion = `${dateStr} 涨幅>0 非ST 非北交所`;
    const upResult = await this.queryWencai(upQuestion);
    await this.randomDelay(2000, 4000);

    // 下跌
    const downQuestion = `${dateStr} 涨幅<0 非ST 非北交所`;
    const downResult = await this.queryWencai(downQuestion);
    await this.randomDelay(2000, 4000);

    // 平盘
    const flatQuestion = `${dateStr} 涨幅=0 非ST 非北交所`;
    const flatResult = await this.queryWencai(flatQuestion);

    return {
      upCount: upResult.length || 0,
      downCount: downResult.length || 0,
      flatCount: flatResult.length || 0,
    };
  }

  /**
   * 获取连板数据
   */
  private async fetchBoardData(dateStr: string): Promise<{
    maxContinuousBoard: number;
    board2Count: number;
    board3Count: number;
  }> {
    // 获取2连板以上的股票
    const question = `${dateStr} 连续涨停天数>=2 非ST 非北交所`;
    const result = await this.queryWencai(question);

    let maxBoard = 0;
    let board2 = 0;
    let board3 = 0;

    for (const item of result) {
      const boardDays = item['连续涨停天数'] || item['连板天数'] || 0;
      if (boardDays >= 2) {
        maxBoard = Math.max(maxBoard, boardDays);
        if (boardDays === 2) {
          board2++;
        } else if (boardDays >= 3) {
          board3++;
        }
      }
    }

    return {
      maxContinuousBoard: maxBoard,
      board2Count: board2,
      board3Count: board3,
    };
  }

  /**
   * 获取炸板数据
   */
  private async fetchBlastData(dateStr: string): Promise<{
    limitUpOpenCount: number;
    blastRate: number;
  }> {
    // 曾涨停
    const question = `${dateStr} 曾涨停 非ST 非北交所`;
    const result = await this.queryWencai(question);
    const limitUpOpenCount = result.length || 0;

    // 计算炸板率
    const limitUpCount = await this.fetchLimitUpCount(dateStr);
    const total = limitUpCount + limitUpOpenCount;
    const blastRate = total > 0 ? (limitUpOpenCount / total) * 100 : 0;

    return {
      limitUpOpenCount,
      blastRate: Number(blastRate.toFixed(2)),
    };
  }

  /**
   * 获取北向资金
   */
  private async fetchNorthMoney(dateStr: string): Promise<number | undefined> {
    try {
      const question = `${dateStr} 北向资金净买入`;
      const result = await this.queryWencai(question);
      // 问财返回的北向资金数据格式可能不一致，这里尝试解析
      if (result.length > 0) {
        const item = result[0];
        return item['北向资金净流入'] || item['净买入额'] || undefined;
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * 获取并计算市场情绪
   * @param dateStr 日期 YYYYMMDD
   */
  async fetchAndCalculateSentiment(dateStr: string): Promise<IMarketSentiment | null> {
    logger.info(`开始获取 ${dateStr} 市场情绪数据...`);

    try {
      // 1. 获取涨停跌停数
      logger.debug('获取涨停数...');
      const limitUpCount = await this.fetchLimitUpCount(dateStr);
      await this.randomDelay(3000, 6000);

      logger.debug('获取跌停数...');
      const limitDownCount = await this.fetchLimitDownCount(dateStr);
      await this.randomDelay(3000, 6000);

      // 2. 获取涨跌家数
      logger.debug('获取涨跌家数...');
      const { upCount, downCount, flatCount } = await this.fetchUpDownCount(dateStr);
      await this.randomDelay(3000, 6000);

      // 3. 获取连板数据
      logger.debug('获取连板数据...');
      let { maxContinuousBoard, board2Count, board3Count } = await this.fetchBoardData(dateStr);
      await this.randomDelay(3000, 6000);

      // 获取本地缓存的情绪数据（用于补充连板高度和综合评分）
      const moodData = marketMoodService.getMoodData(dateStr);

      // 如果连板数据为0，尝试从本地缓存获取
      if (maxContinuousBoard === 0 && moodData && moodData.lbgd > 0) {
        logger.info(`从本地缓存获取连板高度: ${moodData.lbgd}`);
        maxContinuousBoard = moodData.lbgd;
      }

      // 4. 获取炸板数据
      logger.debug('获取炸板数据...');
      const { limitUpOpenCount, blastRate } = await this.fetchBlastData(dateStr);
      await this.randomDelay(2000, 4000);

      // 5. 计算涨跌比
      const upDownRatio = downCount > 0 ? Number((upCount / downCount).toFixed(2)) : upCount;

      // 6. 计算评分 - 优先使用本地缓存的 strong 值
      let score: number;
      let level: SentimentLevel;
      let advice: TradingAdvice;
      
      if (moodData && typeof moodData.strong === 'number') {
        // 使用第三方API已计算好的综合评分
        score = moodData.strong;
        // 根据 score 确定 level 和 advice
        if (score >= 70) {
          level = 'high';
          advice = 'aggressive';
        } else if (score >= 55) {
          level = 'medium';
          advice = 'normal';
        } else if (score >= 40) {
          level = 'low';
          advice = 'reduce';
        } else {
          level = 'extreme_low';
          advice = 'pause';
        }
        logger.info(`使用本地缓存的综合评分: ${score}`);
      } else {
        // 回退到自己计算
        const calculated = calculateSentimentScore({
          limitUpCount,
          limitDownCount,
          upDownRatio,
          maxContinuousBoard,
          blastRate,
        });
        score = calculated.score;
        level = calculated.level;
        advice = calculated.advice;
        logger.info(`使用计算的综合评分: ${score}`);
      }

      // 7. 构建情绪数据
      const sentiment: Partial<IMarketSentiment> = {
        date: parseDate(dateStr),
        dateStr,
        limitUpCount,
        limitDownCount,
        upCount,
        downCount,
        flatCount,
        upDownRatio,
        maxContinuousBoard,
        board2Count,
        board3Count,
        limitUpOpenCount,
        blastRate,
        score,
        level,
        advice,
      };

      // 8. 保存到数据库
      const saved = await MarketSentiment.findOneAndUpdate(
        { dateStr },
        sentiment,
        { upsert: true, new: true }
      );

      logger.info(`市场情绪数据获取完成: 涨停=${limitUpCount}, 跌停=${limitDownCount}, 涨跌比=${upDownRatio}, 最高连板=${maxContinuousBoard}, 评分=${score}, 建议=${advice}`);

      return saved.toObject() as unknown as IMarketSentiment;
    } catch (error) {
      logger.error(`获取市场情绪失败: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * 获取指定日期的情绪数据
   */
  async getSentimentByDate(dateStr: string): Promise<IMarketSentiment | null> {
    const sentiment = await MarketSentiment.findOne({ dateStr });
    if (!sentiment) return null;
    
    const result = sentiment.toObject() as unknown as IMarketSentiment;
    
    // 尝试从本地缓存补充数据
    const moodData = marketMoodService.getMoodData(dateStr);
    if (moodData) {
      // 如果最高连板数为0，使用本地缓存的 lbgd
      if (result.maxContinuousBoard === 0 && moodData.lbgd > 0) {
        logger.debug(`补充 ${dateStr} 的连板高度: ${moodData.lbgd}`);
        result.maxContinuousBoard = moodData.lbgd;
      }
      // 使用本地缓存的 strong 作为综合评分（第三方API已计算好）
      if (typeof moodData.strong === 'number') {
        result.score = moodData.strong;
        // 根据新评分更新 level 和 advice
        if (result.score >= 70) {
          result.level = 'high';
          result.advice = 'aggressive';
        } else if (result.score >= 55) {
          result.level = 'medium';
          result.advice = 'normal';
        } else if (result.score >= 40) {
          result.level = 'low';
          result.advice = 'reduce';
        } else {
          result.level = 'extreme_low';
          result.advice = 'pause';
        }
      }
    }
    
    return result;
  }

  /**
   * 获取最近N天的情绪数据
   */
  async getRecentSentiments(days: number = 30): Promise<IMarketSentiment[]> {
    const sentiments = await MarketSentiment.find({})
      .sort({ date: -1 })
      .limit(days);
    
    return sentiments.map(s => {
      const result = s.toObject() as unknown as IMarketSentiment;
      
      // 尝试从本地缓存补充数据
      if (result.dateStr) {
        const moodData = marketMoodService.getMoodData(result.dateStr);
        if (moodData) {
          // 如果最高连板数为0，使用本地缓存的 lbgd
          if (result.maxContinuousBoard === 0 && moodData.lbgd > 0) {
            result.maxContinuousBoard = moodData.lbgd;
          }
          // 使用本地缓存的 strong 作为综合评分（第三方API已计算好）
          if (typeof moodData.strong === 'number') {
            result.score = moodData.strong;
            // 根据新评分更新 level 和 advice
            if (result.score >= 70) {
              result.level = 'high';
              result.advice = 'aggressive';
            } else if (result.score >= 55) {
              result.level = 'medium';
              result.advice = 'normal';
            } else if (result.score >= 40) {
              result.level = 'low';
              result.advice = 'reduce';
            } else {
              result.level = 'extreme_low';
              result.advice = 'pause';
            }
          }
        }
      }
      
      return result;
    });
  }

  /**
   * 获取情绪趋势（最近N天平均分）
   */
  async getSentimentTrend(days: number = 5): Promise<{
    avgScore: number;
    trend: 'up' | 'down' | 'stable';
    recentScores: number[];
  }> {
    const sentiments = await MarketSentiment.find({})
      .sort({ date: -1 })
      .limit(days);

    if (sentiments.length === 0) {
      return { avgScore: 50, trend: 'stable', recentScores: [] };
    }

    const scores = sentiments.map(s => s.score).reverse();
    const avgScore = Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2));

    // 判断趋势
    let trend: 'up' | 'down' | 'stable' = 'stable';
    if (scores.length >= 3) {
      const recent3Avg = (scores[scores.length - 1] + scores[scores.length - 2] + scores[scores.length - 3]) / 3;
      const prev3Avg = scores.length >= 6 
        ? (scores[scores.length - 4] + scores[scores.length - 5] + scores[scores.length - 6]) / 3
        : avgScore;
      
      if (recent3Avg - prev3Avg > 5) {
        trend = 'up';
      } else if (prev3Avg - recent3Avg > 5) {
        trend = 'down';
      }
    }

    return { avgScore, trend, recentScores: scores };
  }

  /**
   * 根据情绪评分决定是否执行策略
   */
  async shouldExecuteStrategy(dateStr: string): Promise<{
    shouldExecute: boolean;
    positionRatio: number;  // 建议仓位比例 0-1
    reason: string;
    sentiment: IMarketSentiment | null;
  }> {
    const sentiment = await this.getSentimentByDate(dateStr);
    
    if (!sentiment) {
      return {
        shouldExecute: true,
        positionRatio: 0.5,
        reason: '未获取到情绪数据，建议半仓操作',
        sentiment: null,
      };
    }

    switch (sentiment.advice) {
      case 'aggressive':
        return {
          shouldExecute: true,
          positionRatio: 1.0,
          reason: `市场情绪高涨（${sentiment.score}分），可正常或加仓操作`,
          sentiment,
        };
      case 'normal':
        return {
          shouldExecute: true,
          positionRatio: 0.8,
          reason: `市场情绪正常（${sentiment.score}分），正常操作`,
          sentiment,
        };
      case 'reduce':
        return {
          shouldExecute: true,
          positionRatio: 0.5,
          reason: `市场情绪偏弱（${sentiment.score}分），建议降低仓位至50%`,
          sentiment,
        };
      case 'pause':
        return {
          shouldExecute: false,
          positionRatio: 0,
          reason: `市场情绪极弱（${sentiment.score}分），建议暂停策略`,
          sentiment,
        };
      default:
        return {
          shouldExecute: true,
          positionRatio: 0.5,
          reason: '情绪未知，建议半仓',
          sentiment,
        };
    }
  }
}

// 导出单例
export const marketSentimentService = new MarketSentimentService();
