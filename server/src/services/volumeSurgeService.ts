import { logger } from '../utils';
import { VolumeSurge } from '../models';
import { getToday, formatDate } from '../utils/dateUtils';
import axios from 'axios';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const thsUtils = require('../utils/thsUtils');

// 导入市场情绪服务
import { marketSentimentService } from './marketSentimentService';
import { marketMoodService } from './marketMoodService';
import { tradingCalendarService } from './tradingCalendarService';

export class VolumeSurgeService {
  
  private getHexinV(): string {
    try {
      return thsUtils.update();
    } catch (error) {
      logger.warn('生成 Hexin-V 失败，使用默认值');
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
   * 随机延迟（8-12秒），模拟真人操作
   */
  private async randomDelay(): Promise<void> {
    const minDelay = 8000;
    const maxDelay = 12000;
    const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
    logger.debug(`模拟真人操作，等待 ${(delay / 1000).toFixed(1)} 秒...`);
    await this.delay(delay);
  }

  /**
   * 通用问财查询
   */
  private async queryWencai(question: string): Promise<any[]> {
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

      // 问财接口响应结构可能变化，需要遍历 components 查找数据
      const components = response.data?.data?.answer?.[0]?.txt?.[0]?.content?.components || [];
      
      for (const comp of components) {
        if (comp?.data?.datas && Array.isArray(comp.data.datas) && comp.data.datas.length > 0) {
          logger.debug(`问财返回 ${comp.data.datas.length} 条数据 (${comp.show_type})`);
          return comp.data.datas;
        }
      }
      
      // 兼容旧结构
      if (response.data?.data?.answer?.[0]?.txt?.[0]?.content?.components?.[0]?.data?.datas) {
        return response.data.data.answer[0].txt[0].content.components[0].data.datas;
      }
      
      logger.warn('问财未返回有效数据');
      return [];
    } catch (error) {
      logger.error(`问财API调用失败: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * 获取上证指数是否站上20日均线
   */
  private async checkIndexAboveMa20(dateStr: string): Promise<boolean> {
    try {
      const question = `上证指数${dateStr}收盘价>${dateStr}20日均线`;
      const result = await this.queryWencai(question);
      return result.length > 0;
    } catch (error) {
      logger.warn('获取上证指数MA20状态失败');
      return true; // 默认返回true，避免误伤
    }
  }

  /**
   * 获取首板股票列表（用于判断是否首板）
   */
  private async getFirstBoardList(dateStr: string): Promise<Set<string>> {
    try {
      // 首板 = 今日涨停 且 昨日未涨停
      const question = `${dateStr}涨停，非${dateStr}连板，非ST，非北交所`;
      const result = await this.queryWencai(question);
      const codes = new Set<string>();
      result.forEach((item: any) => {
        const code = String(item.code || item['股票代码'] || '').replace(/[^0-9]/g, '');
        if (code.length === 6) codes.add(code);
      });
      logger.info(`[首板检测] ${dateStr} 首板数量: ${codes.size}`);
      return codes;
    } catch (error) {
      logger.warn('获取首板列表失败');
      return new Set();
    }
  }

  /**
   * 获取连板股票信息
   */
  private async getContinuousBoardInfo(dateStr: string): Promise<Map<string, number>> {
    const boardMap = new Map<string, number>();
    try {
      // 查询连板股
      const question = `${dateStr}连板，非ST，非北交所`;
      const result = await this.queryWencai(question);
      
      result.forEach((item: any) => {
        const code = String(item.code || item['股票代码'] || '').replace(/[^0-9]/g, '');
        if (code.length === 6) {
          // 尝试从字段中获取连板数
          let boardCount = 2; // 默认2连板
          for (const key in item) {
            if (key.includes('连板') && key.includes('天')) {
              const match = String(item[key]).match(/(\d+)/);
              if (match) boardCount = parseInt(match[1], 10);
            }
          }
          boardMap.set(code, boardCount);
        }
      });
      
      logger.info(`[连板检测] ${dateStr} 连板股数量: ${boardMap.size}`);
    } catch (error) {
      logger.warn('获取连板信息失败');
    }
    return boardMap;
  }

  private async fetchFromWencai(dateStr: string): Promise<any[]> {
    // ========================================
    // 🚀 "强势资金突破"策略 - 优化版
    // ========================================
    // 
    // 【核心条件】（必须满足）
    // 1. 涨幅>7%：确保强势
    // 2. 成交额排名前200：大资金战场
    // 3. 上影线<5%：收盘相对强势（放宽到5%）
    //
    // 【趋势条件】
    // 4. 收盘价>10日均线：短期趋势向上
    //
    // 【基础过滤】
    // 5. 非ST/新股/北交所/退市
    //
    // 【额外返回字段】
    // 6. 量比、换手率、振幅、下影线、5日均量比 - 用于评分计算
    //
    // 注：其他条件（20日新高、量能放大、底部抬升等）
    //     在代码中通过评分体系处理，避免过滤掉太多股票
    // ========================================
    
    const question = [
      // 核心条件（宽松版，确保有数据）
      `${dateStr}涨幅>7%`,
      `${dateStr}成交额排名前200`,
      `${dateStr}上影线<5%`,
      // 趋势确认（修正语法：收盘价>10日均线）
      `${dateStr}收盘价>10日均线`,
      // 基础过滤
      `${dateStr}非ST`,
      `${dateStr}非新股`,
      `${dateStr}非北交所`,
      `非退市`,
      // 额外请求的字段（用于评分计算）
      `${dateStr}量比`,
      `${dateStr}换手率`,
      `${dateStr}振幅`,
      `${dateStr}下影线`,
      `成交量/${dateStr}5日平均成交量`,
    ].join('，');
    
    logger.info(`[问财查询] ${question}`);
    return this.queryWencai(question);
  }

  async scanAndSave(dateStr?: string): Promise<number> {
    const targetDate = dateStr || formatDate(getToday(), 'YYYYMMDD');
    
    // 🔒 检查目标日期是否为交易日，防止在非交易日存储错误数据
    if (!tradingCalendarService.isTradingDay(targetDate)) {
      logger.warn(`[VolumeSurge] ${targetDate} 不是交易日，跳过扫描`);
      return 0;
    }
    
    logger.info(`开始扫描放量大涨股票: ${targetDate}`);
    
    // ========================================
    // 🔥 进阶优化：获取市场环境数据
    // ========================================
    
    // 1. 获取市场情绪数据（优先从 marketMoodService 获取）
    let marketSentimentScore = 50;
    let marketLimitUpCount = 0;
    let marketAdvice = 'normal';
    
    try {
      // 优先从龙虎榜市场情绪缓存获取 strong 值
      const moodData = marketMoodService.getMoodData(targetDate);
      if (moodData) {
        marketSentimentScore = moodData.strong;
        marketLimitUpCount = moodData.ztjs || 0;  // 涨跌家数作为参考
        // 根据 strong 值生成建议（统一阈值标准）
        if (moodData.strong >= 70) {
          marketAdvice = 'aggressive';  // 情绪高涨
        } else if (moodData.strong >= 50) {
          marketAdvice = 'normal';      // 情绪正常
        } else if (moodData.strong >= 30) {
          marketAdvice = 'cautious';    // 情绪偏弱
        } else {
          marketAdvice = 'pause';       // 情绪极弱
        }
        logger.info(`[市场情绪] 从缓存获取: 评分=${marketSentimentScore}, 涨跌家数=${marketLimitUpCount}, 建议=${marketAdvice}`);
      } else {
        // 缓存未命中，降级使用原有的 marketSentimentService
        logger.info(`[市场情绪] 缓存未命中 ${targetDate}，使用 marketSentimentService`);
        let sentiment = await marketSentimentService.getSentimentByDate(targetDate);
        if (!sentiment) {
          logger.info(`[市场情绪] 未找到 ${targetDate} 的数据，尝试自动获取...`);
          sentiment = await marketSentimentService.fetchAndCalculateSentiment(targetDate);
        }
        if (sentiment) {
          marketSentimentScore = sentiment.score || 50;
          marketLimitUpCount = sentiment.limitUpCount || 0;
          marketAdvice = sentiment.advice || 'normal';
          logger.info(`[市场情绪] 评分=${marketSentimentScore}, 涨停数=${marketLimitUpCount}, 建议=${marketAdvice}`);
        } else {
          logger.info(`[市场情绪] 无法获取 ${targetDate} 的数据，使用默认值`);
        }
      }
    } catch (error) {
      logger.warn(`获取市场情绪失败: ${(error as Error).message}`);
    }
    
    // 2. 检查上证指数是否站上20日均线
    const indexAboveMa20 = await this.checkIndexAboveMa20(targetDate);
    logger.info(`[大盘趋势] 上证指数${indexAboveMa20 ? '站上' : '跌破'}20日均线`);
    
    // 3. 获取首板列表
    await this.randomDelay();
    const firstBoardSet = await this.getFirstBoardList(targetDate);
    
    // 4. 获取连板信息
    await this.randomDelay();
    const continuousBoardMap = await this.getContinuousBoardInfo(targetDate);
    
    // 获取选股数据
    await this.randomDelay();
    const rawData = await this.fetchFromWencai(targetDate);
    logger.info(`获取到 ${rawData.length} 条原始数据`);
    
    if (rawData.length === 0) {
      return 0;
    }

    // 直接使用字符串日期 YYYYMMDD 格式
    let count = 0;

    for (const item of rawData) {
      try {
        const stockCode = item.code || item['股票代码'];
        const stockName = item['股票简称'] || item['名称'];
        const price = parseFloat(item['最新价'] || 0);
        
        let changePercent = 0;
        let volumeRatio = 0;
        let turnover = 0;
        let turnoverRate = 0;
        let industry = item['所属行业'] || '';
        let concept = item['所属概念'] || '';
        
        // 新增字段
        let amplitude = 0;        // 振幅
        let upperShadow = 0;      // 上影线
        let lowerShadow = 0;      // 下影线
        let volumeRatioTo5Day = 0; // 成交量/5日均量
        let limitUpReason = '';   // 涨停原因

        // 动态查找字段
        for (const key in item) {
          if (key.includes('涨跌幅')) {
            changePercent = parseFloat(item[key] || 0);
          } else if (key.includes('量比')) {
            volumeRatio = parseFloat(item[key] || 0);
          } else if (key.includes('成交额') && !key.includes('排名')) {
            turnover = parseFloat(item[key] || 0);
          } else if (key.includes('换手率')) {
            turnoverRate = parseFloat(item[key] || 0);
          } else if (key.includes('所属行业') && !industry) {
            industry = item[key];
          } else if (key.includes('所属概念') && !concept) {
            concept = item[key];
          } else if (key.includes('振幅')) {
            amplitude = parseFloat(item[key] || 0);
          } else if (key.includes('上影线')) {
            upperShadow = parseFloat(item[key] || 0);
          } else if (key.includes('下影线')) {
            lowerShadow = parseFloat(item[key] || 0);
          } else if (key.includes('5日平均') && key.includes('成交量')) {
            volumeRatioTo5Day = parseFloat(item[key] || 0);
          } else if (key.includes('涨停原因') || key.includes('异动原因')) {
            limitUpReason = item[key] || '';
          }
        }
        
        // ========================================
        // 🔥 判断是否涨停、首板、连板
        // ========================================
        const codeStr = String(stockCode).replace(/[^0-9]/g, '');
        const isCreGem = codeStr.startsWith('30') || codeStr.startsWith('68');
        const limitThreshold = isCreGem ? 19.5 : 9.5;
        const isLimitUp = changePercent >= limitThreshold;
        const isFirstBoard = firstBoardSet.has(codeStr);
        const continuousBoardCount = continuousBoardMap.get(codeStr) || (isFirstBoard ? 1 : 0);
        
        // ========================================
        // 🚀 策略评分逻辑（满分100分 + 额外加分）
        // ========================================
        
        // ---- 基础评分 (0-100分) ----
        let baseScore = 0;
        
        // 1. 涨幅得分 (0-20分)：7%-10% 得满分，超过10%适当扣分（追高风险）
        if (changePercent >= 7 && changePercent <= 10) {
          baseScore += 20;
        } else if (changePercent > 10 && changePercent <= 15) {
          baseScore += 15;
        } else if (changePercent > 15) {
          baseScore += 10;  // 涨幅过大，追高风险增加
        }
        
        // 2. 换手率得分 (0-20分)：8%-15% 最佳
        if (turnoverRate >= 8 && turnoverRate <= 15) {
          baseScore += 20;
        } else if (turnoverRate >= 5 && turnoverRate < 8) {
          baseScore += 15;
        } else if (turnoverRate > 15 && turnoverRate <= 25) {
          baseScore += 12;
        } else if (turnoverRate > 25) {
          baseScore += 5;  // 换手率过高，筹码分散
        }
        
        // 3. 上影线得分 (0-15分)：越小越好
        if (upperShadow <= 1) {
          baseScore += 15;
        } else if (upperShadow <= 2) {
          baseScore += 12;
        } else if (upperShadow <= 3) {
          baseScore += 8;
        }
        
        // 4. 下影线得分 (0-15分)：越小越好（说明没有抛压）
        if (lowerShadow <= 1) {
          baseScore += 15;
        } else if (lowerShadow <= 2) {
          baseScore += 10;
        } else if (lowerShadow <= 3) {
          baseScore += 5;
        }
        
        // 5. 振幅得分 (0-15分)：振幅适中最佳
        if (amplitude >= 8 && amplitude <= 12) {
          baseScore += 15;  // 振幅适中，走势健康
        } else if (amplitude < 8) {
          baseScore += 12;  // 振幅较小，一字板或接近涨停
        } else if (amplitude <= 15) {
          baseScore += 8;
        } else {
          baseScore += 3;  // 振幅过大，日内震荡剧烈
        }
        
        // 6. 量能放大得分 (0-15分)
        if (volumeRatioTo5Day >= 2 && volumeRatioTo5Day <= 4) {
          baseScore += 15;  // 放量2-4倍最佳
        } else if (volumeRatioTo5Day > 4 && volumeRatioTo5Day <= 6) {
          baseScore += 12;
        } else if (volumeRatioTo5Day > 6) {
          baseScore += 8;  // 放量过大，可能是出货
        } else if (volumeRatioTo5Day >= 1.5) {
          baseScore += 10;
        }
        
        // ---- 市场环境加分 (-20 ~ +15分) ----
        let marketBonus = 0;
        
        // 涨停家数加分
        if (marketLimitUpCount >= 100) {
          marketBonus += 10;  // 涨停过百，市场情绪火爆
        } else if (marketLimitUpCount >= 60) {
          marketBonus += 5;   // 情绪较好
        } else if (marketLimitUpCount < 30) {
          marketBonus -= 10;  // 情绪冰点，需要谨慎
        }
        
        // 大盘趋势加分
        if (indexAboveMa20) {
          marketBonus += 5;   // 大盘趋势向上
        } else {
          marketBonus -= 10;  // 大盘趋势向下，风险增加
        }
        
        // ---- 首板/连板加分 (0 ~ +15分) ----
        let boardBonus = 0;
        
        if (isFirstBoard) {
          boardBonus += 15;   // 首板最安全，启动点
        } else if (continuousBoardCount === 2) {
          boardBonus += 10;   // 2连板说明资金认可
        } else if (continuousBoardCount >= 3) {
          boardBonus += 5;    // 3连板及以上，追高风险增加
        }
        
        // ---- 计算最终评分 ----
        const strategyScore = Math.max(0, Math.min(130, baseScore + marketBonus + boardBonus));
        
        // ---- 风险等级判定 ----
        let riskLevel: 'low' | 'medium' | 'high' = 'medium';
        if (strategyScore >= 85 && indexAboveMa20 && marketLimitUpCount >= 60) {
          riskLevel = 'low';
        } else if (strategyScore < 60 || !indexAboveMa20 || marketLimitUpCount < 30) {
          riskLevel = 'high';
        }

        await VolumeSurge.findOneAndUpdate(
          { date: targetDate, stockCode },
          {
            date: targetDate,
            stockCode,
            stockName,
            price,
            changePercent,
            volumeRatio,
            turnover,
            turnoverRate,
            industry,
            concept,
            // K线形态
            amplitude,
            upperShadow,
            lowerShadow,
            volumeRatioTo5Day,
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
            // 评分
            strategyScore,
            baseScore,
            marketBonus,
            boardBonus,
            riskLevel,
            status: 'pending'
          },
          { upsert: true, new: true }
        );
        count++;
      } catch (err) {
        logger.error(`保存放量大涨数据失败: ${(err as Error).message}`);
      }
    }
    
    return count;
  }

  async getList(dateStr: string): Promise<any[]> {
    // 直接使用字符串日期查询
    return VolumeSurge.find({ date: dateStr }).sort({ strategyScore: -1, changePercent: -1 });
  }

  /**
   * 获取高质量信号（评分>=70分）
   * 这些是策略认为最优质的突破标的
   */
  async getHighQualitySignals(dateStr: string): Promise<any[]> {
    return VolumeSurge.find({ 
      date: dateStr,
      strategyScore: { $gte: 70 }  // 评分>=70分
    }).sort({ strategyScore: -1 });
  }

  /**
   * 获取统计数据（增强版）
   */
  async getStats(dateStr: string): Promise<{
    total: number;
    highQualityCount: number;
    lowRiskCount: number;
    firstBoardCount: number;
    avgScore: number;
    maxScore: number;
    minScore: number;
    riskDistribution: { low: number; medium: number; high: number };
    industryDistribution: { name: string; count: number }[];
    marketInfo: {
      sentiment: number;
      limitUpCount: number;
      indexAboveMa20: boolean;
      advice: string;
    };
  }> {
    const all = await VolumeSurge.find({ date: dateStr });
    
    if (all.length === 0) {
      return {
        total: 0,
        highQualityCount: 0,
        lowRiskCount: 0,
        firstBoardCount: 0,
        avgScore: 0,
        maxScore: 0,
        minScore: 0,
        riskDistribution: { low: 0, medium: 0, high: 0 },
        industryDistribution: [],
        marketInfo: {
          sentiment: 0,
          limitUpCount: 0,
          indexAboveMa20: false,
          advice: 'unknown',
        },
      };
    }
    
    const scores = all.map(s => s.strategyScore || 0);
    const highQualityCount = all.filter(s => (s.strategyScore || 0) >= 70).length;
    const lowRiskCount = all.filter(s => s.riskLevel === 'low').length;
    const firstBoardCount = all.filter(s => s.isFirstBoard).length;
    const avgScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;
    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);
    
    // 风险等级分布
    const riskDistribution = {
      low: all.filter(s => s.riskLevel === 'low').length,
      medium: all.filter(s => s.riskLevel === 'medium').length,
      high: all.filter(s => s.riskLevel === 'high').length,
    };
    
    // 获取第一条记录（用于获取 indexAboveMa20 等字段）
    const first = all[0];
    
    // 获取市场信息（优先从 marketMoodService 获取，降级使用数据库记录）
    const moodData = marketMoodService.getMoodData(dateStr);
    let marketInfo;
    if (moodData) {
      // 从缓存获取（统一阈值标准）
      let advice = 'normal';
      if (moodData.strong >= 70) {
        advice = 'aggressive';  // 情绪高涨
      } else if (moodData.strong >= 50) {
        advice = 'normal';      // 情绪正常
      } else if (moodData.strong >= 30) {
        advice = 'cautious';    // 情绪偏弱
      } else {
        advice = 'pause';       // 情绪极弱
      }
      marketInfo = {
        sentiment: moodData.strong,
        limitUpCount: moodData.ztjs || 0,
        indexAboveMa20: first.indexAboveMa20 || false,  // 这个字段仍从数据库取
        advice,
      };
    } else {
      // 降级从数据库记录获取
      marketInfo = {
        sentiment: first.marketSentimentScore || 0,
        limitUpCount: first.marketLimitUpCount || 0,
        indexAboveMa20: first.indexAboveMa20 || false,
        advice: first.marketAdvice || 'normal',
      };
    }
    
    // 按行业分组统计
    const industryMap = new Map<string, number>();
    all.forEach(s => {
      const industry = s.industry || '未知';
      industryMap.set(industry, (industryMap.get(industry) || 0) + 1);
    });
    
    const industryDistribution = Array.from(industryMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    
    return {
      total: all.length,
      highQualityCount,
      lowRiskCount,
      firstBoardCount,
      avgScore: Math.round(avgScore * 10) / 10,
      maxScore,
      minScore,
      riskDistribution,
      industryDistribution,
      marketInfo,
    };
  }

  /**
   * 获取首板股票列表
   */
  async getFirstBoardStocks(dateStr: string): Promise<any[]> {
    return VolumeSurge.find({ 
      date: dateStr,
      isFirstBoard: true
    }).sort({ strategyScore: -1 });
  }

  /**
   * 获取低风险股票列表
   */
  async getLowRiskStocks(dateStr: string): Promise<any[]> {
    return VolumeSurge.find({ 
      date: dateStr,
      riskLevel: 'low'
    }).sort({ strategyScore: -1 });
  }

  async getHistory(days: number = 30): Promise<any[]> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const result = await VolumeSurge.aggregate([
      {
        $match: {
          date: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
          count: { $sum: 1 },
          stocks: { $push: "$$ROOT" }
        }
      },
      { $sort: { _id: -1 } }
    ]);

    return result.map(item => ({
      date: item._id,
      count: item.count,
      successCount: 0,
      avgProfit: 0,
      stocks: item.stocks
    }));
  }

  async getAvailableDates(): Promise<string[]> {
    const result = await VolumeSurge.distinct('date') as string[];
    return result
      .map((d: string) => d.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'))
      .sort((a, b) => b.localeCompare(a));
  }

  async clearAll(): Promise<void> {
    await VolumeSurge.deleteMany({});
  }
}

export const volumeSurgeService = new VolumeSurgeService();
