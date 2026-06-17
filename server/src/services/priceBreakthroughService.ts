import { logger } from '../utils';
import { PriceBreakthrough, HotStock } from '../../data/concept_cache/models';
import { dataFetchService, HistoryKline } from './dataFetchService';
import { getToday, formatDate, getDaysAgo } from '../utils/dateUtils';
import dayjs from 'dayjs';
import axios from 'axios';
import { tradingCalendarService } from './tradingCalendarService';

// 导入同花顺 Hexin-V 生成器
// eslint-disable-next-line @typescript-eslint/no-var-requires
const thsUtils = require('../utils/thsUtils');

// 工具函数：格式化日期字符串为 YYYYMMDD
function formatDateStr(dateStr: string): string {
  // 支持多种格式：YYYYMMDD、YYYY-MM-DD、YYYY/MM/DD
  return dateStr.replace(/[-\/]/g, '');
}

/**
 * 价格突破服务
 * 筛选符合条件的股票：
 * - day1 突破：涨幅>8%，股价创188日新高
 * - day2 确认：涨跌幅>-3%且<3%，最高价>day1最高价
 * - day3 入场：开盘价>day2当日均价，开盘涨幅<3%且>-5%
 */
export class PriceBreakthroughService {
  
  /**
   * 生成动态 Hexin-V
   */
  private getHexinV(): string {
    try {
      return thsUtils.update();
    } catch (error) {
      logger.warn('生成 Hexin-V 失败，使用默认值');
      return 'Ax8Ssngzh0M9kINf4Czhe-DDqnmphHMgjdx3GrFqu4gVdzBiuVQDdp2oB0_C';
    }
  }

  /**
   * 获取前一个交易日（使用交易日历服务）
   */
  private getPreviousTradingDay(dateStr: string): string {
    // 优先使用交易日历服务（支持节假日判断）
    const prevDay = tradingCalendarService.getPrevTradingDay(dateStr);
    if (prevDay) {
      return prevDay;
    }
    
    // 降级：如果交易日历缓存为空，使用简单的周末判断
    logger.warn('交易日历缓存为空，降级为周末判断');
    let prevDate = dayjs(dateStr).subtract(1, 'day');
    
    // 跳过周末
    while (prevDate.day() === 0 || prevDate.day() === 6) {
      prevDate = prevDate.subtract(1, 'day');
    }
    
    return prevDate.format('YYYYMMDD');
  }

  /**
   * 获取前N个交易日（使用交易日历服务）
   * @param dateStr 起始日期
   * @param n 往前推几个交易日
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
      // 跳过周末
      while (currentDate.day() === 0 || currentDate.day() === 6) {
        currentDate = currentDate.subtract(1, 'day');
      }
      result.push(currentDate.format('YYYYMMDD'));
    }
    
    return result;
  }

  /**
   * 使用同花顺问财接口快速获取突破股票
   * 查询条件：
   * - day1 突破：涨幅>8%，股价创188日新高
   * - day2 确认：涨跌幅>-3%且<3%，最高价>day1最高价
   * - day3 入场：开盘价>day2当日均价，开盘涨幅<3%且>-5%
   * @param day3Str 入场日（当天），格式 YYYYMMDD
   */
  private async fetchBreakthroughFromWencai(day3Str: string): Promise<any[]> {
    // 计算 day2（前一个交易日）和 day1（前两个交易日）
    const [day2, day1] = this.getPreviousTradingDays(day3Str, 2);
    const day3 = day3Str;
    
    // 构建问财查询条件（三天模式）
    // 添加成交额、量比字段到查询中
    const question = `${day1}涨幅>8%，${day1}股价创188日新高，${day2}涨跌幅大于-3%且<3%，${day2}最高价>${day1}最高价，${day3}开盘价>${day2}当日均价，${day3}开盘涨幅<3%且>-5%，${day1}成交额，${day2}量比，非ST，非新股，非北交所，近二年未被立案`;
    const url = 'http://www.iwencai.com/customized/chart/get-robot-data';
    
    // 动态生成 Hexin-V
    const hexinV = this.getHexinV();
    
    const data: Record<string, string | number> = {
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
      rsh: 'Ths_iwencai_Xuangu_0k9ulnwt96k6xiozeacd2z20dhuy0s9b',
    };
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Referer': `http://www.iwencai.com/unifiedwap/result?w=${encodeURIComponent(question)}&querytype=stock`,
      'Cookie': `other_uid=Ths_iwencai_Xuangu_0k9ulnwt96k6xiozeacd2z20dhuy0s9b; guideState=1; wencai_pc_version=1; ta_random_userid=mkoh08tein; v=${hexinV}`,
      'Hexin-V': hexinV,
      'Host': 'www.iwencai.com',
      'Origin': 'http://www.iwencai.com',
    };

    try {
      logger.info(`问财查询 (day1=${day1}, day2=${day2}, day3=${day3}): ${question}`);
      logger.debug(`使用 Hexin-V: ${hexinV}`);
      const response = await axios.post(url, data, { 
        headers,
        timeout: 30000 
      });
      
      const result = response.data;
      
      if (result.status_code !== 0) {
        logger.warn(`问财接口返回错误: ${result.status_msg || '未知错误'}`);
        return [];
      }

      // 解析返回数据
      const answer = result?.data?.answer;
      if (!answer || !answer[0] || !answer[0].txt || !answer[0].txt[0]) {
        logger.warn('问财接口返回数据结构异常');
        return [];
      }

      const components = answer[0].txt[0]?.content?.components;
      if (!components || !components[0] || !components[0].data || !components[0].data.datas) {
        logger.warn('问财接口返回数据结构异常，无法解析 components');
        return [];
      }

      const datas = components[0].data.datas;
      logger.info(`问财查询成功，共找到 ${datas.length} 只股票`);
      
      // 调试：打印第一条数据的所有字段名
      if (datas.length > 0) {
        logger.info(`问财返回字段: ${Object.keys(datas[0]).join(', ')}`);
        logger.debug(`问财第一条数据: ${JSON.stringify(datas[0])}`);
      }
      
      // 转换为统一格式
      // 注意：问财返回的字段名带日期后缀，如 "涨跌幅:前复权[20251210]"
      return datas.map((v: any) => {
        // 提取股票代码和名称
        const stockCode = v['code'] || v['股票代码'];
        const stockName = v['股票简称'] || v['name'] || '';
        
        // 当前涨幅使用 "最新涨跌幅" 字段
        const changePercent = v['最新涨跌幅'] || 0;
        
        // 当前价格使用 "最新价" 字段
        const currentPrice = v['最新价'] || 0;
        
        // 动态查找带日期后缀的字段
        // 查找 day1 涨幅（用于记录突破当天的涨幅）
        const day1ChangeKey = Object.keys(v).find(k => k.startsWith('涨跌幅:前复权[') && k.includes(day1));
        const day1ChangePercent = day1ChangeKey ? v[day1ChangeKey] : 0;
        
        // 查找 day3 收盘价
        const day3CloseKey = Object.keys(v).find(k => k.startsWith('收盘价:不复权[') && k.includes(day3));
        const day3Close = day3CloseKey ? v[day3CloseKey] : currentPrice;
        
        // 查找成交额（格式：成交额[20251212] 或 成交额:不复权[20251212]）
        const turnoverKey = Object.keys(v).find(k => k.includes('成交额') && k.includes(`[${day1}]`));
        const turnover = turnoverKey ? v[turnoverKey] : 0;
        
        // 查找量比（格式：量比[20251212]）
        const volumeRatioKey = Object.keys(v).find(k => k.includes('量比') && k.includes(`[${day2}]`));
        const turnoverRatio = volumeRatioKey ? v[volumeRatioKey] : 0;
        
        return {
          stockCode,
          stockName,
          currentPrice: Number(currentPrice) || Number(day3Close) || 0,
          changePercent: Number(changePercent) || 0,
          day1ChangePercent: Number(day1ChangePercent) || 0, // 记录 day1 涨幅
          turnover: Number(turnover) || 0,
          high188: 0,  // 问财当前查询未返回 188 日最高价
          prevDayTurnover: 0,
          turnoverRatio: Number(turnoverRatio) || 0,
          breakTime: '',
          riseReason: '',
          sector: '',
          concept: [],
        };
      }).filter((v: any) => v.stockCode); // 过滤掉无效数据
      
    } catch (error) {
      logger.error(`问财接口请求失败: ${(error as Error).message}`);
      return [];
    }
  }
  
  /**
   * 获取全市场A股代码列表
   * 这里使用同花顺热搜股票 + 数据库已有股票作为基础
   * 备用方案：当问财接口不可用时使用
   */
  private async getAllStockCodes(): Promise<{ code: string; name: string }[]> {
    // 从数据库获取近期出现过的所有股票
    const recentDays = 30;
    const startDate = getDaysAgo(recentDays);
    
    const stocks = await HotStock.find({
      date: { $gte: startDate }
    })
      .select('stockCode stockName')
      .lean();

    // 去重
    const stockMap = new Map<string, string>();
    for (const stock of stocks) {
      if (!stockMap.has(stock.stockCode)) {
        stockMap.set(stock.stockCode, stock.stockName);
      }
    }

    return Array.from(stockMap.entries()).map(([code, name]) => ({ code, name }));
  }

  /**
   * 筛选价格突破股票
   * 使用问财接口查询，无结果时视为当天没有符合条件的股票
   * @param dateStr 日期，格式 YYYYMMDD，默认今天
   */
  async scanPriceBreakthrough(dateStr?: string): Promise<any[]> {
    const targetDate = dateStr || formatDate(getToday(), 'YYYYMMDD');
    logger.info(`开始扫描 ${targetDate} 价格突破股票...`);

    // 使用问财接口查询
    const wencaiResult = await this.fetchBreakthroughFromWencai(targetDate);
    
    if (wencaiResult.length > 0) {
      logger.info(`问财接口扫描完成，共发现 ${wencaiResult.length} 只价格突破股票`);
      // 补充热搜数据中的上涨原因等信息
      const enrichedResult = await this.enrichWithHotData(wencaiResult, targetDate);
      // 按涨幅降序排列
      enrichedResult.sort((a, b) => b.changePercent - a.changePercent);
      return enrichedResult;
    }

    // 问财无结果，视为当天没有符合条件的股票
    logger.info(`${targetDate} 没有符合条件的突破股票`);
    return [];
  }

  /**
   * 检查单只股票是否满足突破条件（备用方法，暂不使用）
   */
  private async checkSingleStock(
    stockCode: string,
    stockName: string,
    targetDate: string
  ): Promise<any | null> {
    try {
      // 计算188个交易日前的日期（约9个月）
      const endDate = targetDate;
      // 往前推280天（覆盖188个交易日）
      const startDateStr = dayjs(targetDate).subtract(280, 'day').format('YYYYMMDD');

      // 获取历史K线（188日）
      const klines = await dataFetchService.fetchHistoryKline(stockCode, startDateStr, endDate);
      
      if (!klines || klines.length < 2) {
        return null;
      }

      // 找到目标日期的K线
      const todayKline = klines.find(k => k.date.replace(/-/g, '') === targetDate);
      if (!todayKline) {
        return null;
      }

      // 检查涨幅是否超过8%
      if (todayKline.changePercent < 8) {
        return null;
      }

      // 计算188日最高价（不包含当天）
      const historyKlines = klines.filter(k => k.date.replace(/-/g, '') !== targetDate);
      
      // 取最近188个交易日
      const last188 = historyKlines.slice(-188);
      if (last188.length < 10) {
        // 历史数据太少，跳过
        return null;
      }

      const high188 = Math.max(...last188.map(k => k.high));

      // 检查是否突破188日最高价
      if (todayKline.high <= high188) {
        return null;
      }

      // 获取前一日成交额
      const prevDayKline = historyKlines[historyKlines.length - 1];
      const prevDayTurnover = prevDayKline?.turnover || 0;
      const turnoverRatio = prevDayTurnover > 0 
        ? Number((todayKline.turnover / prevDayTurnover).toFixed(2))
        : 0;

      // 尝试获取上涨原因（从热搜数据中）
      let riseReason = '';
      let sector = '';
      let concept: string[] = [];
      
      const hotRecord = await HotStock.findOne({
        stockCode,
        date: targetDate
      }).lean();

      if (hotRecord) {
        riseReason = hotRecord.riseReason || '';
        sector = hotRecord.sector || '';
        concept = hotRecord.concept || [];
      }

      return {
        stockCode,
        stockName,
        currentPrice: todayKline.close,
        changePercent: todayKline.changePercent,
        turnover: todayKline.turnover,
        prevDayTurnover,
        turnoverRatio,
        high188,
        breakTime: '', // 日K线无法获取具体突破时间
        riseReason,
        sector,
        concept,
      };
    } catch (error) {
      logger.debug(`检查 ${stockCode} 失败: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * 使用热搜数据补充股票的上涨原因、板块、概念等信息
   */
  private async enrichWithHotData(stocks: any[], targetDate: string): Promise<any[]> {
    const enrichedStocks = [];

    for (const stock of stocks) {
      try {
        const hotRecord = await HotStock.findOne({
          stockCode: stock.stockCode,
          date: targetDate
        }).lean();

        if (hotRecord) {
          enrichedStocks.push({
            ...stock,
            riseReason: hotRecord.riseReason || stock.riseReason,
            sector: hotRecord.sector || stock.sector,
            concept: hotRecord.concept || stock.concept,
          });
        } else {
          enrichedStocks.push(stock);
        }
      } catch (error) {
        enrichedStocks.push(stock);
      }
    }

    return enrichedStocks;
  }

  /**
   * 执行扫描并保存到数据库
   */
  async scanAndSave(dateStr?: string): Promise<number> {
    const targetDate = dateStr || formatDate(getToday(), 'YYYYMMDD');

    // 扫描突破股票
    const breakthroughList = await this.scanPriceBreakthrough(targetDate);

    if (breakthroughList.length === 0) {
      logger.info('没有发现价格突破股票');
      return 0;
    }

    // 保存到数据库
    let savedCount = 0;
    for (const item of breakthroughList) {
      try {
        await PriceBreakthrough.findOneAndUpdate(
          { date: targetDate, stockCode: item.stockCode },
          {
            ...item,
            date: targetDate,
          },
          { upsert: true, new: true }
        );
        savedCount++;
      } catch (error) {
        logger.warn(`保存 ${item.stockCode} 突破记录失败: ${(error as Error).message}`);
      }
    }

    logger.info(`成功保存 ${savedCount} 条价格突破记录`);
    return savedCount;
  }

  /**
   * 获取指定日期的突破列表
   */
  async getBreakthroughByDate(dateStr: string, limit: number = 50): Promise<any[]> {
    const targetDate = formatDateStr(dateStr);

    const list = await PriceBreakthrough.find({
      date: targetDate
    })
      .sort({ changePercent: -1 })
      .limit(limit)
      .lean();

    return list;
  }

  /**
   * 获取最近N天的突破列表（历史记录）
   */
  async getRecentBreakthroughs(days: number = 7): Promise<any[]> {
    const startDate = getDaysAgo(days);

    const list = await PriceBreakthrough.find({
      date: { $gte: startDate }
    })
      .sort({ date: -1, changePercent: -1 })
      .lean();

    // 按日期分组
    const grouped = new Map<string, any[]>();
    for (const item of list) {
      // item.date 现在是 YYYYMMDD 字符串，转换为 YYYY-MM-DD 格式
      const dateKey = item.date.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
      if (!grouped.has(dateKey)) {
        grouped.set(dateKey, []);
      }
      grouped.get(dateKey)!.push(item);
    }

    return Array.from(grouped.entries()).map(([date, stocks]) => ({
      date,
      count: stocks.length,
      stocks,
    }));
  }

  /**
   * 获取所有有记录的日期列表
   */
  async getAvailableDates(): Promise<string[]> {
    const dates = await PriceBreakthrough.distinct('date') as string[];
    return dates.sort((a, b) => b.localeCompare(a)); // 降序
  }

  /**
   * 生成随机延迟时间（模拟真人操作）
   * @param min 最小延迟（毫秒）
   * @param max 最大延迟（毫秒）
   */
  private randomDelay(min: number = 3000, max: number = 8000): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 获取交易日列表（排除周末）
   * @param startDate 开始日期 YYYYMMDD
   * @param endDate 结束日期 YYYYMMDD
   */
  private getTradingDays(startDate: string, endDate: string): string[] {
    const days: string[] = [];
    let current = dayjs(startDate);
    const end = dayjs(endDate);
    
    while (current.isBefore(end) || current.isSame(end, 'day')) {
      const dayOfWeek = current.day();
      // 排除周六(6)和周日(0)
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        days.push(current.format('YYYYMMDD'));
      }
      current = current.add(1, 'day');
    }
    
    return days;
  }

  /**
   * 批量补录历史数据
   * 使用随机延迟模拟真人操作，防止被封
   * @param startDate 开始日期 YYYYMMDD
   * @param endDate 结束日期 YYYYMMDD（默认今天）
   * @param onProgress 进度回调
   */
  async backfillHistoricalData(
    startDate: string,
    endDate?: string,
    onProgress?: (current: number, total: number, date: string, count: number) => void
  ): Promise<{ success: number; failed: number; details: Array<{ date: string; count: number; error?: string }> }> {
    const targetEndDate = endDate || formatDate(getToday(), 'YYYYMMDD');
    const tradingDays = this.getTradingDays(startDate, targetEndDate);
    
    logger.info(`开始补录历史数据，从 ${startDate} 到 ${targetEndDate}，共 ${tradingDays.length} 个交易日`);
    
    const results: Array<{ date: string; count: number; error?: string }> = [];
    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < tradingDays.length; i++) {
      const day = tradingDays[i];
      
      try {
        // 检查该日期是否已有数据
        const existing = await PriceBreakthrough.countDocuments({
          date: day
        });

        if (existing > 0) {
          logger.info(`[${i + 1}/${tradingDays.length}] ${day} 已有 ${existing} 条记录，跳过`);
          results.push({ date: day, count: existing });
          successCount++;
          
          if (onProgress) {
            onProgress(i + 1, tradingDays.length, day, existing);
          }
          continue;
        }

        // 执行扫描
        logger.info(`[${i + 1}/${tradingDays.length}] 正在扫描 ${day}...`);
        const count = await this.scanAndSave(day);
        
        results.push({ date: day, count });
        successCount++;
        
        logger.info(`[${i + 1}/${tradingDays.length}] ${day} 扫描完成，发现 ${count} 只突破股票`);
        
        if (onProgress) {
          onProgress(i + 1, tradingDays.length, day, count);
        }

        // 随机延迟，模拟真人操作（10-18秒 + 额外随机波动）
        if (i < tradingDays.length - 1) {
          const baseDelay = this.randomDelay(10000, 18000);
          // 偶尔加入更长的"思考时间"（30%概率额外等待5-12秒）
          const extraDelay = Math.random() < 0.3 ? this.randomDelay(5000, 12000) : 0;
          const totalDelay = baseDelay + extraDelay;
          
          logger.debug(`等待 ${(totalDelay / 1000).toFixed(1)} 秒后继续...`);
          await this.delay(totalDelay);
        }

      } catch (error) {
        const errorMsg = (error as Error).message;
        logger.error(`[${i + 1}/${tradingDays.length}] ${day} 扫描失败: ${errorMsg}`);
        results.push({ date: day, count: 0, error: errorMsg });
        failedCount++;

        // 失败后等待更长时间（30-60秒）
        if (i < tradingDays.length - 1) {
          const errorDelay = this.randomDelay(30000, 60000);
          logger.warn(`扫描失败，等待 ${(errorDelay / 1000).toFixed(1)} 秒后重试下一个...`);
          await this.delay(errorDelay);
        }
      }
    }

    logger.info(`历史数据补录完成: 成功 ${successCount}，失败 ${failedCount}`);
    
    return {
      success: successCount,
      failed: failedCount,
      details: results
    };
  }

  /**
   * 清除所有突破数据
   * @returns 删除的记录数
   */
  async clearAllData(): Promise<number> {
    const result = await PriceBreakthrough.deleteMany({});
    logger.warn(`已清除 ${result.deletedCount} 条价格突破记录`);
    return result.deletedCount;
  }
}

export const priceBreakthroughService = new PriceBreakthroughService();
