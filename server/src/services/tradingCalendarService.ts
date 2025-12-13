/**
 * 交易日历服务
 * 从同花顺接口获取真实的交易日历，支持节假日判断
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils';
import { formatDate, parseDate } from '../utils/dateUtils';

// 交易日历缓存文件路径
const CACHE_FILE_PATH = path.join(__dirname, '../../data/trading_calendar.json');

// 缓存数据结构
interface TradingCalendarCache {
  updatedAt: string;           // 更新时间
  tradingDays: string[];       // 交易日列表 YYYYMMDD
}

class TradingCalendarService {
  // 内存缓存：交易日 Set
  private tradingDaysSet: Set<string> = new Set();
  // 缓存更新时间
  private lastUpdated: Date | null = null;
  // 是否已初始化
  private initialized: boolean = false;

  /**
   * 初始化服务，从文件加载缓存
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      // 确保目录存在
      const dataDir = path.dirname(CACHE_FILE_PATH);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // 尝试从文件加载缓存
      if (fs.existsSync(CACHE_FILE_PATH)) {
        const cacheData = JSON.parse(fs.readFileSync(CACHE_FILE_PATH, 'utf-8')) as TradingCalendarCache;
        // 确保 tradingDays 是有效数组
        if (cacheData.tradingDays && Array.isArray(cacheData.tradingDays)) {
          this.tradingDaysSet = new Set(cacheData.tradingDays);
          this.lastUpdated = new Date(cacheData.updatedAt);
          logger.info(`交易日历缓存已加载，共 ${this.tradingDaysSet.size} 个交易日，更新时间: ${cacheData.updatedAt}`);
        } else {
          logger.warn('交易日历缓存文件格式无效，将重新获取');
        }
      } else {
        logger.info('交易日历缓存文件不存在，将在定时任务中获取');
      }

      this.initialized = true;
    } catch (error) {
      logger.error(`加载交易日历缓存失败: ${(error as Error).message}`);
      this.initialized = true; // 即使失败也标记为已初始化，避免重复尝试
    }
  }

  /**
   * 从同花顺接口获取交易日列表
   * @param date 基准日期 YYYYMMDD
   * @param prev 往前取几天（交易日）
   * @param next 往后取几天（交易日）
   */
  async fetchTradingDays(date: string, prev: number = 60, next: number = 30): Promise<string[] | null> {
    const url = 'https://data.10jqka.com.cn/dataapi/limit_up/trade_day';
    
    try {
      const response = await axios.get(url, {
        params: {
          date,
          prev,
          next,
          stock: 'stock',
          _t: Date.now()
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://data.10jqka.com.cn/'
        },
        timeout: 10000
      });

      const resData = response.data;
      
      if (resData.status_code === 0 && resData.data) {
        // 接口实际返回格式:
        // { "status_code": 0, "data": { "code": 0, "msg": "请求成功", "next_dates": [...], "prev_dates": [...] } }
        let tradingDays: string[] = [];
        const innerData = resData.data;
        
        // 合并 prev_dates 和 next_dates，并加入当前日期
        if (innerData.prev_dates && Array.isArray(innerData.prev_dates)) {
          tradingDays = tradingDays.concat(innerData.prev_dates);
        }
        
        // 注意：接口返回的 prev_dates 和 next_dates 已经是完整的交易日列表
        // 如果 date 在 lastPrev 和 firstNext 之间但不在列表中，说明 date 不是交易日
        // 不需要额外添加当前日期，直接使用接口返回的数据即可
        
        if (innerData.next_dates && Array.isArray(innerData.next_dates)) {
          tradingDays = tradingDays.concat(innerData.next_dates);
        }
        
        // 去重并排序
        tradingDays = [...new Set(tradingDays)].sort();
        
        if (tradingDays.length > 0) {
          logger.info(`从接口获取到 ${tradingDays.length} 个交易日`);
          return tradingDays;
        } else {
          logger.warn('交易日历接口返回的日期列表为空');
          return null;
        }
      } else {
        logger.warn(`获取交易日历失败，接口返回: ${JSON.stringify(resData)}`);
        return null;
      }
    } catch (error) {
      logger.error(`获取交易日历接口调用失败: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * 更新交易日历缓存
   * 建议在收盘后调用（如 15:30）
   */
  async updateCache(): Promise<boolean> {
    const today = formatDate(new Date(), 'YYYYMMDD');
    
    // 获取前60个交易日 + 后30个交易日
    const tradingDays = await this.fetchTradingDays(today, 60, 30);
    
    if (!tradingDays || tradingDays.length === 0) {
      logger.warn('获取交易日历失败，保持使用旧缓存');
      return false;
    }

    // 更新内存缓存
    this.tradingDaysSet = new Set(tradingDays);
    this.lastUpdated = new Date();

    // 持久化到文件
    const cacheData: TradingCalendarCache = {
      updatedAt: this.lastUpdated.toISOString(),
      tradingDays: tradingDays
    };

    try {
      // 确保目录存在
      const dataDir = path.dirname(CACHE_FILE_PATH);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      
      fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(cacheData, null, 2));
      logger.info(`交易日历缓存已更新，共 ${tradingDays.length} 个交易日`);
      return true;
    } catch (error) {
      logger.error(`保存交易日历缓存失败: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * 判断指定日期是否为交易日
   * @param dateStr 日期 YYYYMMDD 或 YYYY-MM-DD
   */
  isTradingDay(dateStr: string): boolean {
    // 标准化日期格式为 YYYYMMDD
    const normalized = dateStr.replace(/-/g, '');
    
    // 如果缓存中有数据，使用缓存
    if (this.tradingDaysSet.size > 0) {
      return this.tradingDaysSet.has(normalized);
    }

    // 缓存为空时，降级为简单判断（周一到周五）
    logger.warn('交易日历缓存为空，降级为周末判断');
    const date = parseDate(normalized);
    const day = date.getDay();
    return day >= 1 && day <= 5;
  }

  /**
   * 判断 Date 对象是否为交易日
   */
  isTradingDayByDate(date: Date = new Date()): boolean {
    const dateStr = formatDate(date, 'YYYYMMDD');
    return this.isTradingDay(dateStr);
  }

  /**
   * 获取下一个交易日
   * @param dateStr 当前日期 YYYYMMDD
   */
  getNextTradingDay(dateStr: string): string | null {
    const normalized = dateStr.replace(/-/g, '');
    
    if (this.tradingDaysSet.size === 0) {
      logger.warn('交易日历缓存为空，无法获取下一个交易日');
      return null;
    }

    // 将缓存转换为排序数组
    const sortedDays = Array.from(this.tradingDaysSet).sort();
    const index = sortedDays.findIndex(d => d > normalized);
    
    if (index !== -1) {
      return sortedDays[index];
    }
    
    return null;
  }

  /**
   * 获取前一个交易日
   * @param dateStr 当前日期 YYYYMMDD
   */
  getPrevTradingDay(dateStr: string): string | null {
    const normalized = dateStr.replace(/-/g, '');
    
    if (this.tradingDaysSet.size === 0) {
      logger.warn('交易日历缓存为空，无法获取前一个交易日');
      return null;
    }

    // 将缓存转换为排序数组
    const sortedDays = Array.from(this.tradingDaysSet).sort();
    
    // 找到小于当前日期的最后一个交易日
    for (let i = sortedDays.length - 1; i >= 0; i--) {
      if (sortedDays[i] < normalized) {
        return sortedDays[i];
      }
    }
    
    return null;
  }

  /**
   * 获取前 N 个交易日
   * @param dateStr 起始日期 YYYYMMDD
   * @param n 往前推几个交易日
   */
  getPrevTradingDays(dateStr: string, n: number): string[] {
    const result: string[] = [];
    let currentDate = dateStr.replace(/-/g, '');

    for (let i = 0; i < n; i++) {
      const prevDay = this.getPrevTradingDay(currentDate);
      if (prevDay) {
        result.push(prevDay);
        currentDate = prevDay;
      } else {
        break;
      }
    }

    return result;
  }

  /**
   * 获取缓存状态信息
   */
  getCacheStatus(): { initialized: boolean; count: number; lastUpdated: string | null } {
    return {
      initialized: this.initialized,
      count: this.tradingDaysSet.size,
      lastUpdated: this.lastUpdated ? this.lastUpdated.toISOString() : null
    };
  }

  /**
   * 手动获取指定范围的交易日列表
   */
  getTradingDaysInRange(startDate: string, endDate: string): string[] {
    const start = startDate.replace(/-/g, '');
    const end = endDate.replace(/-/g, '');
    
    return Array.from(this.tradingDaysSet)
      .filter(d => d >= start && d <= end)
      .sort();
  }
}

// 导出单例
export const tradingCalendarService = new TradingCalendarService();
