/**
 * 市场情绪服务
 * 
 * 功能：
 * 1. 从龙虎榜API获取市场情绪数据（strong字段）
 * 2. 本地JSON文件持久化存储
 * 3. 内存缓存提供快速访问
 * 4. 支持增量更新
 * 
 * 数据字段说明：
 * - strong: 大盘情绪（综合强度），0-100
 * - ztjs: 涨跌家数
 * - lbgd: 连板高度
 * - Day: 日期 YYYY-MM-DD
 * - df_num: 大幅回撤股票数量
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils';

// 市场情绪数据缓存文件路径
const CACHE_FILE_PATH = path.join(__dirname, '../../data/market_mood.json');

// 单条市场情绪数据
export interface MarketMoodData {
  day: string;        // 日期 YYYYMMDD（标准化后）
  strong: number;     // 大盘情绪（综合强度）0-100
  ztjs: number;       // 涨跌家数
  lbgd: number;       // 连板高度
  dfNum: number;      // 大幅回撤股票数量
}

// 缓存数据结构
interface MarketMoodCache {
  updatedAt: string;           // 更新时间
  data: MarketMoodData[];      // 按日期降序排列
}

// 默认情绪值（当无缓存数据时使用）
const DEFAULT_MOOD_STRONG = 50;

class MarketMoodService {
  // 内存缓存：日期 -> 情绪数据
  private moodMap: Map<string, MarketMoodData> = new Map();
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
        const cacheData = JSON.parse(fs.readFileSync(CACHE_FILE_PATH, 'utf-8')) as MarketMoodCache;
        if (cacheData.data && Array.isArray(cacheData.data)) {
          // 加载到内存缓存
          for (const item of cacheData.data) {
            this.moodMap.set(item.day, item);
          }
          this.lastUpdated = new Date(cacheData.updatedAt);
          logger.info(`市场情绪缓存已加载，共 ${this.moodMap.size} 条数据，更新时间: ${cacheData.updatedAt}`);
        } else {
          logger.warn('市场情绪缓存文件格式无效，将重新获取');
        }
      } else {
        logger.info('市场情绪缓存文件不存在，将在定时任务中获取');
      }

      this.initialized = true;
    } catch (error) {
      logger.error(`加载市场情绪缓存失败: ${(error as Error).message}`);
      this.initialized = true;
    }
  }

  /**
   * 从龙虎榜API获取市场情绪数据
   * 返回历史数据列表（按日期降序）
   */
  async fetchFromApi(): Promise<MarketMoodData[] | null> {
    const url = 'https://apphis.longhuvip.com/w1/api/index.php';
    
    try {
      const response = await axios.get(url, {
        params: {
          Index: 0,
          PhoneOSNew: 2,
          VerSion: '5.20.0.9',
          a: 'ChangeStatistics',
          apiv: 'w41',
          c: 'HisHomeDingPan',
          st: 1000
        },
        headers: {
          'User-Agent': 'lhb/5.20.9 (com.kaipanla.www; build:1; iOS 18.2.1) Alamofire/4.9.1',
          'Accept-Language': 'zh-Hans-CN;q=1.0',
          'Accept': '*/*',
          'Accept-Encoding': 'gzip, deflate',
        },
        timeout: 15000,
      });

      const resData = response.data;
      
      if (resData && resData.info && Array.isArray(resData.info)) {
        const result: MarketMoodData[] = [];
        
        for (const item of resData.info) {
          // 标准化日期格式：YYYY-MM-DD -> YYYYMMDD
          const day = (item.Day || '').replace(/-/g, '');
          if (!day || day.length !== 8) continue;
          
          result.push({
            day,
            strong: parseInt(item.strong, 10) || 50,
            ztjs: parseInt(item.ztjs, 10) || 0,
            lbgd: parseInt(item.lbgd, 10) || 0,
            dfNum: parseInt(item.df_num, 10) || 0,
          });
        }
        
        // 按日期降序排序
        result.sort((a, b) => b.day.localeCompare(a.day));
        
        if (result.length > 0) {
          logger.info(`从龙虎榜API获取到 ${result.length} 条市场情绪数据`);
          return result;
        } else {
          logger.warn('龙虎榜API返回的数据列表为空');
          return null;
        }
      } else {
        logger.warn(`获取市场情绪失败，接口返回异常: ${JSON.stringify(resData).substring(0, 200)}`);
        return null;
      }
    } catch (error) {
      logger.error(`获取市场情绪接口调用失败: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * 更新市场情绪缓存（增量更新）
   * 建议在收盘后调用（如 15:20，与交易日历一起）
   */
  async updateCache(): Promise<boolean> {
    const apiData = await this.fetchFromApi();
    
    if (!apiData || apiData.length === 0) {
      logger.warn('获取市场情绪失败，保持使用旧缓存');
      return false;
    }

    // 增量更新：新数据覆盖旧数据
    let newCount = 0;
    for (const item of apiData) {
      if (!this.moodMap.has(item.day)) {
        newCount++;
      }
      this.moodMap.set(item.day, item);
    }
    
    this.lastUpdated = new Date();

    // 持久化到文件
    const cacheData: MarketMoodCache = {
      updatedAt: this.lastUpdated.toISOString(),
      data: Array.from(this.moodMap.values()).sort((a, b) => b.day.localeCompare(a.day))
    };

    try {
      // 确保目录存在
      const dataDir = path.dirname(CACHE_FILE_PATH);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      
      fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(cacheData, null, 2));
      logger.info(`市场情绪缓存已更新，共 ${this.moodMap.size} 条数据，新增 ${newCount} 条`);
      return true;
    } catch (error) {
      logger.error(`保存市场情绪缓存失败: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * 获取指定日期的市场情绪值（strong）
   * @param dateStr 日期 YYYYMMDD 或 YYYY-MM-DD
   * @returns 情绪值 0-100，如果没有数据返回 null
   */
  getMood(dateStr: string): number | null {
    const normalized = dateStr.replace(/-/g, '');
    const data = this.moodMap.get(normalized);
    return data ? data.strong : null;
  }

  /**
   * 获取指定日期的完整市场情绪数据
   * @param dateStr 日期 YYYYMMDD 或 YYYY-MM-DD
   * @returns 完整的市场情绪数据，如果没有缓存数据则返回默认值（strong=50）
   */
  getMoodData(dateStr: string): MarketMoodData {
    const normalized = dateStr.replace(/-/g, '');
    return this.moodMap.get(normalized) || {
      day: normalized,
      strong: DEFAULT_MOOD_STRONG,
      ztjs: 0,
      lbgd: 0,
      dfNum: 0,
    };
  }

  /**
   * 获取最新的市场情绪值
   * @returns 最新情绪值，如果没有数据返回默认值（strong=50）
   */
  getLatestMood(): { day: string; strong: number } {
    if (this.moodMap.size === 0) {
      return { day: '', strong: DEFAULT_MOOD_STRONG };
    }
    
    // 找到最新日期
    const sortedDays = Array.from(this.moodMap.keys()).sort().reverse();
    if (sortedDays.length === 0) {
      return { day: '', strong: DEFAULT_MOOD_STRONG };
    }
    
    const latestDay = sortedDays[0];
    const data = this.moodMap.get(latestDay);
    
    return data ? { day: data.day, strong: data.strong } : { day: '', strong: DEFAULT_MOOD_STRONG };
  }

  /**
   * 获取缓存状态信息
   */
  getCacheStatus(): { initialized: boolean; count: number; lastUpdated: string | null; latestDay: string | null } {
    const sortedDays = Array.from(this.moodMap.keys()).sort().reverse();
    return {
      initialized: this.initialized,
      count: this.moodMap.size,
      lastUpdated: this.lastUpdated ? this.lastUpdated.toISOString() : null,
      latestDay: sortedDays.length > 0 ? sortedDays[0] : null,
    };
  }

  /**
   * 获取指定范围内的市场情绪数据
   */
  getMoodInRange(startDate: string, endDate: string): MarketMoodData[] {
    const start = startDate.replace(/-/g, '');
    const end = endDate.replace(/-/g, '');
    
    return Array.from(this.moodMap.values())
      .filter(d => d.day >= start && d.day <= end)
      .sort((a, b) => b.day.localeCompare(a.day));
  }
}

// 导出单例
export const marketMoodService = new MarketMoodService();
