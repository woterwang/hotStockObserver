import { logger } from '../utils';
import { TradingSignal, ITradingSignal, EntryConditions, ExitConditions } from '../models/TradingSignal';
import { PriceBreakthrough } from '../models';
import { formatDate } from '../utils/dateUtils';
import dayjs from 'dayjs';
import axios from 'axios';
import { marketSentimentService } from './marketSentimentService';
import { tradingCalendarService } from './tradingCalendarService';
import { klineCacheService, CachedKline } from './klineCacheService';

// 导入同花顺工具
// eslint-disable-next-line @typescript-eslint/no-var-requires
const thsUtils = require('../utils/thsUtils');

// 工具函数：格式化日期字符串为 YYYYMMDD
function formatDateStr(dateStr: string): string {
  return dateStr.replace(/[-\/]/g, '');
}

/**
 * K线数据
 */
type KlineData = CachedKline;

/**
 * 实时行情数据（新浪接口）
 */
interface RealtimeQuote {
  stockCode: string;
  stockName: string;
  open: number;           // 今开
  preClose: number;       // 昨收
  current: number;        // 当前价
  high: number;           // 最高
  low: number;            // 最低
  volume: number;         // 成交量（手）
  turnover: number;       // 成交额
  date: string;           // 日期 YYYY-MM-DD
  time: string;           // 时间 HH:MM:SS
  changePercent: number;  // 涨跌幅
  // 买卖盘数据
  bid1Price: number;
  bid1Volume: number;
  ask1Price: number;
  ask1Volume: number;
}

/**
 * 交易信号服务
 * 负责：
 * 1. 盘后生成次日潜在入场标的
 * 2. 集合竞价后更新入场条件
 * 3. 生成止盈止损条件
 */
export class TradingSignalService {
  
  // 默认构造函数

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
   * 获取市场ID（同花顺格式）
   */
  private getMarketId(stockCode: string): number {
    if (stockCode.startsWith('6')) {
      return 17; // 上海
    }
    return 33; // 深圳
  }

  /**
   * 获取前N个交易日（使用交易日历服务）
   */
  private getPreviousTradingDays(dateStr: string, n: number): string[] {
    // 优先使用交易日历服务（支持节假日判断）
    const days = tradingCalendarService.getPrevTradingDays(dateStr, n);
    if (days.length === n) {
      return days;
    }
    
    // 降级：如果交易日历缓存为空，使用简单的周末判断
    logger.warn('交易日历缓存为空，降级为周末判断');
    const result: string[] = [];
    let currentDate = dayjs(dateStr);
    
    for (let i = 0; i < n; i++) {
      currentDate = currentDate.subtract(1, 'day');
      while (currentDate.day() === 0 || currentDate.day() === 6) {
        currentDate = currentDate.subtract(1, 'day');
      }
      result.push(currentDate.format('YYYYMMDD'));
    }
    
    return result;
  }

  /**
   * 生成交易信号
   * 根据 Day3（入场日）往前推算 Day1、Day2，然后用问财查询符合条件的标的
   * @param day3Str Day3 日期 YYYYMMDD（入场日，页面选择的日期）
   * @returns { count, signalDate, day1, day2 }
   */
  async generateSignalsForEntryDate(day3Str: string): Promise<{
    count: number;
    signalDate: string;
    day1: string;
    day2: string;
  }> {
    // 验证并调整为有效交易日
    const validDay3Str = this.adjustToTradingDay(day3Str);
    if (validDay3Str !== day3Str) {
      logger.info(`${day3Str} 非交易日，已调整为 ${validDay3Str}`);
    }
    
    // 往前推算 Day2 和 Day1
    const [day2Str, day1Str] = this.getPreviousTradingDays(validDay3Str, 2);
    
    logger.info(`开始生成入场日 ${validDay3Str} 的交易信号...`);
    logger.info(`Day1=${day1Str}(突破日), Day2=${day2Str}(确认日), Day3=${validDay3Str}(入场日)`);
    
    // 使用问财查询符合 Day1+Day2 条件的股票
    const candidates = await this.fetchCandidatesFromWencai(day1Str, day2Str);
    
    if (candidates.length === 0) {
      logger.info('未发现符合条件的候选标的');
      return { count: 0, signalDate: validDay3Str, day1: day1Str, day2: day2Str };
    }

    logger.info(`发现 ${candidates.length} 只候选标的，开始获取详细数据...`);

    let savedCount = 0;
    for (const stock of candidates) {
      try {
        // 获取K线数据（包含缓存补全）
        const klines = await klineCacheService.getKlines(stock.code, [day1Str, day2Str]);
        const day1Kline = klines.get(day1Str);
        const day2Kline = klines.get(day2Str);
        
        if (!day1Kline || !day2Kline) {
          logger.debug(`${stock.code} K线数据不完整，跳过`);
          continue;
        }

        // 计算Day2均价
        const day2Avg = day2Kline.turnover / day2Kline.volume / 100 || 
                        (day2Kline.open + day2Kline.close + day2Kline.high + day2Kline.low) / 4;

        // 生成卖出条件
        const exitConditions: ExitConditions = {
          stopLossPrice: Number((day2Kline.low * 0.98).toFixed(2)),  // Day2最低价下方2%
          stopLossPercent: -2,
          takeProfitPrice: Number((day2Kline.close * 1.10).toFixed(2)),  // +10%止盈
          takeProfitPercent: 10,
          altStopLossPrice: Number(day1Kline.close.toFixed(2)),  // 备选止损：Day1收盘价
        };

        // 创建信号记录
        const signal: Partial<ITradingSignal> = {
          strategy: 'breakthrough_3day',  // 突破三天确认策略
          signalDate: validDay3Str,
          stockCode: stock.code,
          stockName: stock.name,
          
          day1Date: day1Str,
          day1Open: day1Kline.open,
          day1Close: day1Kline.close,
          day1High: day1Kline.high,
          day1Low: day1Kline.low,
          day1Change: stock.day1Change || 0,
          day1Volume: day1Kline.volume,
          day1Turnover: day1Kline.turnover,
          
          day2Date: day2Str,
          day2Open: day2Kline.open,
          day2Close: day2Kline.close,
          day2High: day2Kline.high,
          day2Low: day2Kline.low,
          day2Change: stock.day2Change || 0,
          day2Volume: day2Kline.volume,
          day2Turnover: day2Kline.turnover,
          day2Avg: day2Avg,
          
          high188: stock.high188 || 0,
          exitConditions,
          status: 'pending',
          sector: stock.sector || '',
          riseReason: stock.riseReason || '',
        };

        // 保存到数据库
        await TradingSignal.findOneAndUpdate(
          { signalDate: signal.signalDate, stockCode: signal.stockCode },
          signal,
          { upsert: true, new: true }
        );
        
        savedCount++;
        
        // 随机延迟，模拟真人操作
        await this.randomDelay();
      } catch (error) {
        logger.debug(`处理 ${stock.code} 失败: ${(error as Error).message}`);
      }
    }

    logger.info(`交易信号生成完成，共 ${savedCount} 个，入场日=${validDay3Str}`);
    return { count: savedCount, signalDate: validDay3Str, day1: day1Str, day2: day2Str };
  }

  /**
   * 盘后自动任务：生成次日入场信号
   * 传入当天日期（Day2），自动计算 Day3 并生成信号
   */
  async generateSignalsAfterMarketClose(day2Str: string): Promise<{
    count: number;
    signalDate: string;
    day1: string;
    day2: string;
  }> {
    // Day3 = Day2 的下一个交易日
    const day3Str = this.getNextTradingDay(day2Str);
    return this.generateSignalsForEntryDate(day3Str);
  }

  /**
   * ========================================
   * 放量大涨策略（volume_surge）
   * ========================================
   */

  /**
   * 放量大涨策略：生成入场信号
   * @param day3Str Day3 日期 YYYYMMDD（入场日）
   */
  async generateVolumeSurgeSignals(day3Str: string): Promise<{
    count: number;
    signalDate: string;
    day1: string;
    day2: string;
  }> {
    // 验证并调整为有效交易日
    const validDay3Str = this.adjustToTradingDay(day3Str);
    if (validDay3Str !== day3Str) {
      logger.info(`${day3Str} 非交易日，已调整为 ${validDay3Str}`);
    }
    
    // 往前推算 Day2 和 Day1
    const [day2Str, day1Str] = this.getPreviousTradingDays(validDay3Str, 2);
    
    logger.info(`[放量大涨] 开始生成入场日 ${validDay3Str} 的交易信号...`);
    logger.info(`[放量大涨] Day1=${day1Str}(放量日), Day2=${day2Str}(确认日), Day3=${validDay3Str}(入场日)`);
    
    // 获取 Day2 的市场情绪（用于风险评估）
    const sentiment = await marketSentimentService.getSentimentByDate(day2Str);
    const marketScore = sentiment?.score || 50;
    const isWeakMarket = marketScore < 40;
    
    if (isWeakMarket) {
      logger.warn(`[放量大涨] 市场情绪偏弱 (score=${marketScore})，信号将标记为高风险`);
    }
    
    // 使用问财查询符合放量大涨条件的股票
    const candidates = await this.fetchVolumeSurgeCandidates(day1Str, day2Str);
    
    if (candidates.length === 0) {
      logger.info('[放量大涨] 未发现符合条件的候选标的');
      return { count: 0, signalDate: validDay3Str, day1: day1Str, day2: day2Str };
    }

    logger.info(`[放量大涨] 发现 ${candidates.length} 只候选标的，开始获取详细数据...`);

    let savedCount = 0;
    for (const stock of candidates) {
      try {
        // 获取K线数据（包含缓存补全）
        const klines = await klineCacheService.getKlines(stock.code, [day1Str, day2Str]);
        const day1Kline = klines.get(day1Str);
        const day2Kline = klines.get(day2Str);
        
        if (!day1Kline || !day2Kline) {
          logger.debug(`[放量大涨] ${stock.code} K线数据不完整，跳过`);
          continue;
        }

        // 计算Day2均价
        const day2Avg = day2Kline.turnover / day2Kline.volume / 100 || 
                        (day2Kline.open + day2Kline.close + day2Kline.high + day2Kline.low) / 4;

        // 【优化3】止损优化：使用 Day2 低点作为止损位
        // 放量大涨的止损应该更紧，Day2 低点更合适
        const stopLossPrice = Math.min(day1Kline.low, day2Kline.low);
        
        const exitConditions: ExitConditions = {
          stopLossPrice: Number((stopLossPrice * 0.99).toFixed(2)),  // Day2低点下方1%
          stopLossPercent: -5,  // 最大止损5%
          takeProfitPrice: Number((day2Kline.close * 1.12).toFixed(2)),  // 12%止盈
          takeProfitPercent: 12,
          altStopLossPrice: Number(day1Kline.low.toFixed(2)),  // 备选止损：Day1低点
        };

        // 【优化1+4】风险评估
        const riskReasons: string[] = [];
        let riskLevel: 'low' | 'medium' | 'high' = 'low';
        
        // 市场情绪风险
        if (isWeakMarket) {
          riskReasons.push(`市场情绪偏弱(${marketScore}分)`);
          riskLevel = 'high';
        } else if (marketScore < 50) {
          riskReasons.push(`市场情绪一般(${marketScore}分)`);
          if (riskLevel === 'low') riskLevel = 'medium';
        }
        
        // 涨停股风险（涨停后追高风险较大）
        if (stock.isLimitUp) {
          riskReasons.push('Day1涨停，追高风险');
          if (riskLevel === 'low') riskLevel = 'medium';
        }
        
        // 换手率风险（换手率过低说明筹码锁定不够）
        if (stock.day1TurnoverRate < 8) {
          riskReasons.push(`换手率偏低(${stock.day1TurnoverRate.toFixed(1)}%)`);
        }
        
        // 建议仓位（根据风险等级调整）
        let suggestedPosition = 0.5;  // 默认半仓
        if (riskLevel === 'high') {
          suggestedPosition = 0.2;  // 高风险只建议2成仓
        } else if (riskLevel === 'medium') {
          suggestedPosition = 0.3;  // 中风险3成仓
        }

        // 创建信号记录
        const signal: Partial<ITradingSignal> = {
          strategy: 'volume_surge',  // 放量大涨策略
          signalDate: validDay3Str,
          stockCode: stock.code,
          stockName: stock.name,
          
          day1Date: day1Str,
          day1Open: day1Kline.open,
          day1Close: day1Kline.close,
          day1High: day1Kline.high,
          day1Low: day1Kline.low,
          day1Change: stock.day1Change || 0,
          day1Volume: day1Kline.volume,
          day1Turnover: day1Kline.turnover,
          
          day2Date: day2Str,
          day2Open: day2Kline.open,
          day2Close: day2Kline.close,
          day2High: day2Kline.high,
          day2Low: day2Kline.low,
          day2Change: stock.day2Change || 0,
          day2Volume: day2Kline.volume,
          day2Turnover: day2Kline.turnover,
          day2Avg: day2Avg,
          
          high188: 0,  // 放量大涨不使用此字段
          
          exitConditions,
          status: 'pending',
          
          // 市场情绪
          marketSentimentScore: marketScore,
          marketSentimentAdvice: sentiment?.advice || '',
          suggestedPosition,
          
          // 风险标记
          riskLevel,
          riskReasons,
          day1TurnoverRate: stock.day1TurnoverRate,
          isLimitUp: stock.isLimitUp,
          
          sector: stock.sector || '',
          riseReason: stock.riseReason || '',
        };

        // 使用 upsert 避免重复（同一天+同一股票+同一策略）
        await TradingSignal.findOneAndUpdate(
          { 
            signalDate: signal.signalDate, 
            stockCode: signal.stockCode,
            strategy: 'volume_surge',
          },
          signal,
          { upsert: true, new: true }
        );

        savedCount++;
        logger.debug(`[放量大涨] ${stock.code} ${stock.name} 风险=${riskLevel}, 建议仓位=${(suggestedPosition*100).toFixed(0)}%`);
        await this.randomDelay();
      } catch (error) {
        logger.debug(`[放量大涨] 处理 ${stock.code} 失败: ${(error as Error).message}`);
      }
    }

    logger.info(`[放量大涨] 交易信号生成完成，共 ${savedCount} 个，入场日=${validDay3Str}`);
    return { count: savedCount, signalDate: validDay3Str, day1: day1Str, day2: day2Str };
  }

  /**
   * 放量大涨策略：盘后自动任务
   * 传入当天日期（Day2），自动计算 Day3 并生成信号
   */
  async generateVolumeSurgeAfterMarketClose(day2Str: string): Promise<{
    count: number;
    signalDate: string;
    day1: string;
    day2: string;
  }> {
    const day3Str = this.getNextTradingDay(day2Str);
    return this.generateVolumeSurgeSignals(day3Str);
  }

  /**
   * 放量大涨策略：问财查询候选标的
   * 筛选逻辑：成交额Top100 + 涨幅>=8% + 换手率>5% + 涨幅排名Top20
   * 优化：排除炸板股、增加换手率筛选
   */
  private async fetchVolumeSurgeCandidates(day1Str: string, day2Str: string): Promise<any[]> {
    try {
      // 优化查询条件：
      // 1. 成交额前100 + 涨幅>=8%
      // 2. 换手率>5%（真正的放量）
      // 3. 排除炸板股（曾涨停但收盘未涨停）
      // 4. Day2确认条件
      const question = `${day1Str}成交额排名前100，${day1Str}涨幅>=8%，${day1Str}换手率>5%，非${day1Str}炸板，${day2Str}涨跌幅大于-3%且<3%，${day2Str}最高价>${day1Str}最高价，非ST，非新股，非北交所，非退市`;
      
      logger.info(`[放量大涨] 问财查询条件: ${question}`);
      
      const hexinV = this.getHexinV();
      
      const url = 'http://www.iwencai.com/customized/chart/get-robot-data';
      const data = {
        question,
        perpage: 100,
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

      const response = await axios.post(url, data, { headers, timeout: 15000 });
      const resData = response.data;
      
      if (resData.status_code !== 0) {
        logger.warn('[放量大涨] 问财查询失败');
        return [];
      }

      const datas = resData.data?.answer?.[0]?.txt?.[0]?.content?.components?.[0]?.data?.datas || [];
      
      // 解析数据，增加换手率和涨停标记
      const candidates = datas.map((item: any) => {
        const code = String(item['股票代码'] || item['code'] || '').replace(/[^0-9]/g, '');
        const day1Change = Number(item[`涨跌幅:前复权[${day1Str}]`] || item[`${day1Str}涨跌幅`] || 0);
        const day1TurnoverRate = Number(item[`换手率[${day1Str}]`] || item[`${day1Str}换手率`] || 0);
        
        // 判断是否涨停（创业板/科创板 20%，主板 10%）
        const isCreGem = code.startsWith('30') || code.startsWith('68');
        const limitThreshold = isCreGem ? 19.5 : 9.5;
        const isLimitUp = day1Change >= limitThreshold;
        
        return {
          code,
          name: item['股票简称'] || item['name'] || '',
          day1Change,
          day2Change: Number(item[`涨跌幅:前复权[${day2Str}]`] || item[`${day2Str}涨跌幅`] || 0),
          day1Turnover: Number(item[`成交额[${day1Str}]`] || item[`${day1Str}成交额`] || 0),
          day1TurnoverRate,
          isLimitUp,
          sector: item['所属同花顺行业'] || '',
          riseReason: item['涨停原因'] || item['异动原因'] || '',
        };
      }).filter((s: any) => s.code && s.code.length === 6);
      
      // 按 Day1 涨幅降序排序，取前20
      candidates.sort((a: any, b: any) => b.day1Change - a.day1Change);
      const top20 = candidates.slice(0, 20);
      
      logger.info(`[放量大涨] 筛选结果：换手率>5%且涨幅>=8%有${candidates.length}只，取涨幅Top20`);
      
      return top20;
    } catch (error) {
      logger.error(`[放量大涨] 问财查询失败: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * 集合竞价后更新：检查入场条件
   * 在 Day3 09:25 后执行
   * @param day3Str Day3 日期 YYYYMMDD
   */
  async updateSignalsAfterAuction(day3Str: string): Promise<{
    ready: number;
    partial: number;
    rejected: number;
    signals: ITradingSignal[];
  }> {
    logger.info(`开始更新 ${day3Str} 的入场条件...`);
    
    // 获取今日待处理的信号（使用字符串日期直接查询）
    const targetDate = formatDateStr(day3Str);
    
    const signals = await TradingSignal.find({
      signalDate: targetDate,
      status: 'pending',
    });

    if (signals.length === 0) {
      logger.info(`今日(${day3Str})无待处理信号`);
      return { ready: 0, partial: 0, rejected: 0, signals: [] };
    }

    logger.info(`发现 ${signals.length} 个待处理信号，开始获取开盘价...`);

    const results = {
      ready: 0,
      partial: 0,
      rejected: 0,
      signals: [] as ITradingSignal[],
    };

    for (const signal of signals) {
      try {
        // 获取Day3开盘价（支持历史日期）
        const day3Open = await this.fetchOpenPrice(signal.stockCode, day3Str);
        
        if (!day3Open || day3Open <= 0) {
          logger.warn(`${signal.stockCode} 获取开盘价失败，day3Open=${day3Open}`);
          continue;
        }
        
        logger.info(`${signal.stockCode} 获取到开盘价: ${day3Open}`);

        // 计算开盘涨幅
        const day3OpenChange = ((day3Open - signal.day2Close) / signal.day2Close) * 100;

        // 检查入场条件
        const entryConditions: EntryConditions = {
          // 开盘价 > Day2均价
          openAboveDay2Avg: day3Open > signal.day2Avg,
          // 开盘涨幅在 -5% ~ 5% 之间
          openChangeInRange: day3OpenChange >= -5 && day3OpenChange <= 5,
          // 开盘价不破Day2最低价
          openAboveDay2Low: day3Open > signal.day2Low,
          // Day2成交量 ≤ Day1成交量的1.1倍
          day2VolumeOk: signal.day2Volume <= signal.day1Volume * 1.1,
          // Day2收盘价在K线上半部分
          day2CloseInUpperHalf: signal.day2Close >= (signal.day2High + signal.day2Low) / 2,
          // Day2没有长上影线（上影线 < 2%）
          day2NoLongUpperShadow: ((signal.day2High - Math.max(signal.day2Open, signal.day2Close)) / signal.day2Close) * 100 < 2,
        };

        // 计算满足条件数
        const conditionValues = Object.values(entryConditions);
        const entryScore = conditionValues.filter(v => v === true).length;
        const totalConditions = conditionValues.length;

        // 更新状态
        let status: ITradingSignal['status'];
        if (entryScore === totalConditions) {
          status = 'ready';
          results.ready++;
        } else if (entryScore >= 4) {
          status = 'partial';
          results.partial++;
        } else {
          status = 'rejected';
          results.rejected++;
        }

        // 更新记录
        signal.day3Open = day3Open;
        signal.day3OpenChange = Number(day3OpenChange.toFixed(2));
        signal.entryConditions = entryConditions;
        signal.entryScore = entryScore;
        signal.status = status;
        
        // 更新止盈止损价（基于实际开盘价）
        if (signal.exitConditions) {
          signal.exitConditions.takeProfitPrice = Number((day3Open * 1.10).toFixed(2));
          signal.exitConditions.takeProfitPercent = 10;
        }

        await signal.save();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        results.signals.push(signal.toObject() as any);

        await this.randomDelay();
      } catch (error) {
        logger.debug(`更新 ${signal.stockCode} 失败: ${(error as Error).message}`);
      }
    }

    logger.info(`入场条件更新完成: 可入场=${results.ready}, 部分满足=${results.partial}, 不满足=${results.rejected}`);
    return results;
  }

  /**
   * 获取股票开盘价（集合竞价后）
   * 优先从问财获取实时数据，如果是历史日期则从K线缓存获取
   */
  private async fetchOpenPrice(stockCode: string, dateStr?: string): Promise<number | null> {
    const today = formatDate(new Date(), 'YYYYMMDD');
    const now = new Date();
    const currentHour = now.getHours();
    
    // 如果是历史日期，或者是今天但已经收盘（15点后），从K线缓存获取
    if (dateStr && (dateStr !== today || currentHour >= 15)) {
      const openPrice = await this.fetchOpenPriceFromKline(stockCode, dateStr);
      if (openPrice) {
        return openPrice;
      }
      // 如果K线缓存没有，继续尝试实时获取
    }
    
    // 实时获取今日开盘价
    try {
      // 使用问财获取今日开盘价
      const question = `${stockCode} 今日开盘价`;
      const hexinV = this.getHexinV();
      
      const url = 'http://www.iwencai.com/customized/chart/get-robot-data';
      const data = {
        question,
        perpage: 10,
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

      const response = await axios.post(url, data, { headers, timeout: 10000 });
      const resData = response.data;
      
      if (resData.status_code === 0) {
        const datas = resData.data?.answer?.[0]?.txt?.[0]?.content?.components?.[0]?.data?.datas;
        if (datas && datas.length > 0) {
          const item = datas[0];
          return Number(item['开盘价:不复权'] || item['开盘价'] || item['今开'] || 0);
        }
      }
      return null;
    } catch (error) {
      logger.debug(`获取开盘价失败 ${stockCode}: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * 从K线缓存获取历史开盘价
   */
  private async fetchOpenPriceFromKline(stockCode: string, dateStr: string): Promise<number | null> {
    try {
      // 优先使用共享K线缓存，缺口会自动补全，不覆盖已有数据
      // 1. 先尝试从缓存读取（会触发缺口自动补全）
      const kline = await klineCacheService.getKline(stockCode, dateStr);
      if (kline) {
        logger.debug(`从缓存获取 ${stockCode} ${dateStr} 开盘价: ${kline.open}`);
        return kline.open;
      }

      // 2. 缓存/补全后仍无数据（可能为当日盘中），尝试使用实时行情兜底
      const todayStr = formatDate(new Date(), 'YYYYMMDD');
      if (dateStr === todayStr) {
        logger.debug(`缓存补全后仍未命中，尝试实时行情获取 ${stockCode} 开盘价...`);
        const quote = await this.fetchRealtimeQuote(stockCode);
        if (quote && quote.open > 0) {
          logger.info(`从实时行情获取 ${stockCode} 开盘价: ${quote.open}`);
          const klineData: KlineData = {
            date: dateStr,
            open: quote.open,
            high: quote.high,
            low: quote.low,
            close: quote.current,
            volume: quote.volume * 100, // 手转股
            turnover: quote.turnover,
          };
          const klineMap = new Map<string, KlineData>();
          klineMap.set(dateStr, klineData);
          klineCacheService.mergeAndSave(stockCode, klineMap);
          return quote.open;
        }
      }

      return null;
    } catch (error) {
      logger.debug(`获取历史开盘价失败 ${stockCode} ${dateStr}: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * 从腾讯获取实时行情数据（备用接口，更稳定）
   * 接口支持盘中实时数据，可获取当天开盘价
   */
  async fetchRealtimeQuote(stockCode: string): Promise<RealtimeQuote | null> {
    try {
      // 构建腾讯股票代码格式: sh600693 或 sz002544
      const qqCode = this.getQQStockCode(stockCode);
      const url = `https://qt.gtimg.cn/q=${qqCode}`;
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://finance.qq.com/',
        },
        responseType: 'arraybuffer',
        timeout: 10000,
      });
      
      // 腾讯返回 GBK 编码
      const iconv = require('iconv-lite');
      const dataStr = iconv.decode(response.data, 'gbk');
      
      // 解析数据格式: v_sh600693="1~股票名称~代码~当前价~昨收~今开~成交量~...";
      const match = dataStr.match(/="([^"]+)"/);
      if (!match || !match[1]) {
        logger.debug(`腾讯行情解析失败 ${stockCode}: 数据格式错误`);
        return null;
      }
      
      const parts = match[1].split('~');
      if (parts.length < 45) {
        logger.debug(`腾讯行情解析失败 ${stockCode}: 数据字段不足 (${parts.length})`);
        return null;
      }
      
      // 腾讯数据格式（以 ~ 分隔，索引从0开始）:
      // 0:未知 1:名称 2:代码 3:当前价 4:昨收 5:今开 6:成交量(手) 7:外盘 8:内盘
      // 9:买一价 10:买一量 11:买二价 ... 19:卖一价 20:卖一量 ...
      // 30:时间戳(YYYYMMDDHHMMSS) 31:涨跌额 32:涨跌幅 33:最高 34:最低
      // 35:当前价/成交量/成交额 36:成交量(手) 37:成交额(万)
      
      const current = parseFloat(parts[3]) || 0;
      const preClose = parseFloat(parts[4]) || 0;
      const open = parseFloat(parts[5]) || 0;
      const high = parseFloat(parts[33]) || 0;
      const low = parseFloat(parts[34]) || 0;
      const volume = parseFloat(parts[6]) || 0;      // 成交量（手）
      const turnover = (parseFloat(parts[37]) || 0) * 10000; // 成交额（元）
      
      // 如果开盘价为0，说明可能还未开盘
      if (open === 0) {
        logger.debug(`${stockCode} 今日开盘价为0，可能未开盘`);
        return null;
      }
      
      // 解析日期时间 (格式: 20251215161428)
      const timeStr = parts[30] || '';
      const date = timeStr.length >= 8 ? `${timeStr.substring(0,4)}-${timeStr.substring(4,6)}-${timeStr.substring(6,8)}` : '';
      const time = timeStr.length >= 14 ? `${timeStr.substring(8,10)}:${timeStr.substring(10,12)}:${timeStr.substring(12,14)}` : '';
      
      const quote: RealtimeQuote = {
        stockCode,
        stockName: parts[1],
        open,
        preClose,
        current,
        high,
        low,
        volume,
        turnover,
        date,
        time,
        changePercent: parseFloat(parts[32]) || 0,
        bid1Price: parseFloat(parts[9]) || 0,
        bid1Volume: parseFloat(parts[10]) || 0,
        ask1Price: parseFloat(parts[19]) || 0,
        ask1Volume: parseFloat(parts[20]) || 0,
      };
      
      return quote;
    } catch (error) {
      logger.debug(`获取腾讯实时行情失败 ${stockCode}: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * 批量获取实时行情（腾讯接口）
   */
  async fetchRealtimeQuotes(stockCodes: string[]): Promise<Map<string, RealtimeQuote>> {
    const result = new Map<string, RealtimeQuote>();
    
    try {
      // 构建批量请求代码
      const qqCodes = stockCodes.map(code => this.getQQStockCode(code)).join(',');
      const url = `https://qt.gtimg.cn/q=${qqCodes}`;
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://finance.qq.com/',
        },
        responseType: 'arraybuffer',
        timeout: 10000,
      });
      
      const iconv = require('iconv-lite');
      const dataStr = iconv.decode(response.data, 'gbk');
      
      // 按行分割
      const lines = dataStr.split(';').filter((line: string) => line.trim());
      
      for (const line of lines) {
        // 提取股票代码
        const codeMatch = line.match(/v_(\w+)=/);
        if (!codeMatch) continue;
        
        const qqCode = codeMatch[1];
        const stockCode = qqCode.substring(2); // 去掉 sh/sz 前缀
        
        const dataMatch = line.match(/="([^"]+)"/);
        if (!dataMatch || !dataMatch[1]) continue;
        
        const parts = dataMatch[1].split('~');
        if (parts.length < 45) continue;
        
        const current = parseFloat(parts[3]) || 0;
        const preClose = parseFloat(parts[4]) || 0;
        const open = parseFloat(parts[5]) || 0;
        
        if (open === 0) continue;
        
        const timeStr = parts[30] || '';
        const date = timeStr.length >= 8 ? `${timeStr.substring(0,4)}-${timeStr.substring(4,6)}-${timeStr.substring(6,8)}` : '';
        const time = timeStr.length >= 14 ? `${timeStr.substring(8,10)}:${timeStr.substring(10,12)}:${timeStr.substring(12,14)}` : '';
        
        const quote: RealtimeQuote = {
          stockCode,
          stockName: parts[1],
          open,
          preClose,
          current,
          high: parseFloat(parts[33]) || 0,
          low: parseFloat(parts[34]) || 0,
          volume: parseFloat(parts[6]) || 0,
          turnover: (parseFloat(parts[37]) || 0) * 10000,
          date,
          time,
          changePercent: parseFloat(parts[32]) || 0,
          bid1Price: parseFloat(parts[9]) || 0,
          bid1Volume: parseFloat(parts[10]) || 0,
          ask1Price: parseFloat(parts[19]) || 0,
          ask1Volume: parseFloat(parts[20]) || 0,
        };
        
        result.set(stockCode, quote);
      }
    } catch (error) {
      logger.error(`批量获取腾讯实时行情失败: ${(error as Error).message}`);
    }
    
    return result;
  }

  /**
   * 获取腾讯股票代码格式
   */
  private getQQStockCode(stockCode: string): string {
    if (stockCode.startsWith('6')) {
      return `sh${stockCode}`;
    } else if (stockCode.startsWith('0') || stockCode.startsWith('3')) {
      return `sz${stockCode}`;
    } else if (stockCode.startsWith('688')) {
      return `sh${stockCode}`; // 科创板
    } else if (stockCode.startsWith('8') || stockCode.startsWith('4')) {
      return `bj${stockCode}`; // 北交所
    }
    return `sh${stockCode}`;
  }

  /**
   * 获取新浪股票代码格式（备用）
   */
  private getSinaStockCode(stockCode: string): string {
    return this.getQQStockCode(stockCode); // 格式相同
  }

  /**
   * 使用问财获取符合条件的候选标的
   */
  private async fetchCandidatesFromWencai(day1Str: string, day2Str: string): Promise<any[]> {
    try {
      // 查询 Day1 突破 + Day2 确认的股票
      const question = `${day1Str}涨幅>8%，${day1Str}股价创188日新高，${day2Str}涨跌幅大于-3%且<3%，${day2Str}最高价>${day1Str}最高价，非ST，非新股，非北交所，近二年未被立案`;
      
      logger.info(`问财查询条件: ${question}`);
      
      const hexinV = this.getHexinV();
      
      const url = 'http://www.iwencai.com/customized/chart/get-robot-data';
      const data = {
        question,
        perpage: 100,
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

      const response = await axios.post(url, data, { headers, timeout: 15000 });
      const resData = response.data;
      
      if (resData.status_code !== 0) {
        logger.warn('问财查询失败');
        return [];
      }

      const datas = resData.data?.answer?.[0]?.txt?.[0]?.content?.components?.[0]?.data?.datas || [];
      
      return datas.map((item: any) => ({
        code: String(item['股票代码'] || item['code'] || '').replace(/[^0-9]/g, ''),
        name: item['股票简称'] || item['name'] || '',
        day1Change: Number(item[`涨跌幅:前复权[${day1Str}]`] || item[`${day1Str}涨跌幅`] || 0),
        day2Change: Number(item[`涨跌幅:前复权[${day2Str}]`] || item[`${day2Str}涨跌幅`] || 0),
        high188: Number(item[`区间最高价[${day1Str}]`] || 0),
        sector: item['所属同花顺行业'] || '',
        riseReason: item['涨停原因'] || '',
      })).filter((s: any) => s.code && s.code.length === 6);
    } catch (error) {
      logger.error(`问财查询失败: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * 获取下一个交易日（使用交易日历服务）
   */
  private getNextTradingDay(dateStr: string): string {
    // 优先使用交易日历服务（支持节假日判断）
    const nextDay = tradingCalendarService.getNextTradingDay(dateStr);
    if (nextDay) {
      return nextDay;
    }
    
    // 降级：如果交易日历缓存为空，使用简单的周末判断
    logger.warn('交易日历缓存为空，降级为周末判断');
    let currentDate = dayjs(dateStr).add(1, 'day');
    while (currentDate.day() === 0 || currentDate.day() === 6) {
      currentDate = currentDate.add(1, 'day');
    }
    return currentDate.format('YYYYMMDD');
  }

  /**
   * 调整日期为有效交易日（使用交易日历服务）
   * 如果输入日期不是交易日，往前调整到最近的交易日
   */
  private adjustToTradingDay(dateStr: string): string {
    // 检查当前日期是否为交易日
    if (tradingCalendarService.isTradingDay(dateStr)) {
      return dateStr;
    }
    
    // 不是交易日，获取前一个交易日
    const prevDay = tradingCalendarService.getPrevTradingDay(dateStr);
    if (prevDay) {
      return prevDay;
    }
    
    // 降级：如果交易日历缓存为空，使用简单的周末判断
    logger.warn('交易日历缓存为空，降级为周末判断');
    let currentDate = dayjs(dateStr);
    while (currentDate.day() === 0 || currentDate.day() === 6) {
      currentDate = currentDate.subtract(1, 'day');
    }
    return currentDate.format('YYYYMMDD');
  }

  /**
   * 获取今日信号列表
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getTodaySignals(dateStr: string): Promise<any[]> {
    const targetDate = formatDateStr(dateStr);
    const signals = await TradingSignal.find({ signalDate: targetDate })
      .sort({ entryScore: -1, status: 1 })
      .lean();
    return signals;
  }

  /**
   * 获取信号历史记录
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getSignalHistory(
    startDate: string,
    endDate: string,
    status?: string
  ): Promise<any[]> {
    const startDateStr = formatDateStr(startDate);
    const endDateStr = formatDateStr(endDate);
    const query: any = {
      signalDate: {
        $gte: startDateStr,
        $lte: endDateStr,
      },
    };
    
    if (status) {
      query.status = status;
    }
    
    const signals = await TradingSignal.find(query)
      .sort({ signalDate: -1, entryScore: -1 })
      .lean();
    
    return signals;
  }

  /**
   * 标记入场
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async markEntry(
    stockCode: string,
    signalDate: string,
    entryPrice: number
  ): Promise<any> {
    const targetDate = formatDateStr(signalDate);
    const signal = await TradingSignal.findOneAndUpdate(
      { stockCode, signalDate: targetDate },
      {
        status: 'entered',
        entryPrice,
        entryTime: new Date(),
      },
      { new: true }
    );
    return signal?.toObject() || null;
  }

  /**
   * 标记退出
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async markExit(
    stockCode: string,
    signalDate: string,
    exitPrice: number,
    exitReason: string
  ): Promise<any> {
    const targetDate = formatDateStr(signalDate);
    const signal = await TradingSignal.findOne({
      stockCode,
      signalDate: targetDate,
    });
    
    if (!signal || !signal.entryPrice) {
      return null;
    }
    
    const profitPercent = ((exitPrice - signal.entryPrice) / signal.entryPrice) * 100;
    
    signal.status = 'exited';
    signal.exitPrice = exitPrice;
    signal.exitTime = new Date();
    signal.exitReason = exitReason;
    signal.profitPercent = Number(profitPercent.toFixed(2));
    
    await signal.save();
    return signal.toObject();
  }

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
    await this.delay(delay);
  }
}

export const tradingSignalService = new TradingSignalService();
