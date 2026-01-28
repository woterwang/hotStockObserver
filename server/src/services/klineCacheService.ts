import axios from 'axios';
import dayjs, { Dayjs } from 'dayjs';
import * as fs from 'fs';
import * as path from 'path';
import { logger, sleep, toDateStr, getToday } from '../utils';
import { tradingCalendarService } from './tradingCalendarService';
import {
  OpenData,
} from '../types/conceptEnhancement';
import { writeToFile } from '../utils/writeToFile';
export interface CachedKline {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnover: number;
}

// 腾讯实时行情数据结构
interface RealtimeQuote {
  stockCode: string;
  stockName: string;
  open: number;
  preClose: number;
  current: number;
  high: number;
  low: number;
  volume: number;   // 成交量（手）
  turnover: number; // 成交额（元）
  date: string;     // YYYY-MM-DD
}

interface CacheFileSchema {
  stockCode: string;
  cacheTime: number;
  klines: Record<string, CachedKline>;
}

// K线缓存服务：本地JSON缓存，缺口时按需拉取补齐，增量合并不覆盖已有数据
class KlineCacheService {
  private cacheDir: string;

  constructor() {
    this.cacheDir = path.join(__dirname, '../../data/kline_cache');
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  private normalizeDate (dateStr: string): string {
    return dateStr.replace(/[-/]/g, '');
  }

  private getCacheFile (stockCode: string): string {
    return path.join(this.cacheDir, `${stockCode}.json`);
  }

  // 读取磁盘缓存为 Map，保留原 cacheTime 方便上层记录更新时间
  private loadCache (stockCode: string): { map: Map<string, CachedKline>; cacheTime: number } {
    const cacheFile = this.getCacheFile(stockCode);
    const map = new Map<string, CachedKline>();
    let cacheTime = Date.now();

    if (fs.existsSync(cacheFile)) {
      try {
        const cacheData = JSON.parse(fs.readFileSync(cacheFile, 'utf-8')) as CacheFileSchema;
        cacheTime = cacheData.cacheTime || cacheTime;
        if (cacheData.klines) {
          for (const [date, kline] of Object.entries(cacheData.klines)) {
            if (kline) {
              map.set(this.normalizeDate(date), { ...kline, date: this.normalizeDate(kline.date || date) });
            }
          }
        }
      } catch (error) {
        logger.warn(`读取K线缓存失败 ${stockCode}: ${(error as Error).message}`);
      }
    }

    return { map, cacheTime };
  }

  // 将 Map 落盘，保持 cacheTime 以标识最新写入时间
  private persistCache (stockCode: string, map: Map<string, CachedKline>, cacheTime: number = Date.now()): void {
    const cacheFile = this.getCacheFile(stockCode);
    const cacheData: CacheFileSchema = {
      stockCode,
      cacheTime,
      klines: {},
    };

    for (const [date, kline] of map) {
      cacheData.klines[date] = kline;
    }

    fs.writeFileSync(cacheFile, JSON.stringify(cacheData), 'utf-8');
  }

  // 返回当前缓存的日期边界，用于日志提示补全方向
  private getCacheRange (map: Map<string, CachedKline>): { min?: string; max?: string } {
    if (map.size === 0) return {};
    const dates = Array.from(map.keys()).sort();
    return { min: dates[0], max: dates[dates.length - 1] };
  }

  // 根据交易日历生成区间日期列表，可附加额外目标日期
  private buildRequiredDates (startDate: string, endDate: string, extra: string[] = []): string[] {
    const dates = new Set<string>(extra.map(date => this.normalizeDate(date)));
    const start = dayjs(startDate);
    const end = dayjs(endDate);

    let cursor = start;
    while (!cursor.isAfter(end)) {
      const dateStr = cursor.format('YYYYMMDD');
      if (tradingCalendarService.isTradingDay(dateStr)) {
        dates.add(dateStr);
      }
      cursor = cursor.add(1, 'day');
    }

    return Array.from(dates).sort();
  }

  // 从同花顺拉取最近 N 天日K（不写入缓存，调用方决定合并）
  private async fetchKlineFromTHS (stockCode: string, days: number): Promise<Map<string, CachedKline>> {
    const result = new Map<string, CachedKline>();
    try {
      const marketId = stockCode.startsWith('6') ? 17 : 33;
      const url = `https://d.10jqka.com.cn/v6/line/${marketId}_${stockCode}/01/last${days}.js`;

      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'http://www.10jqka.com.cn/',
          'hexin-v': String(Date.now()),
        },
        timeout: 30000,
      });

      if (response.data && typeof response.data === 'string') {
        const dataStr = response.data;
        const startIdx = dataStr.indexOf('({');
        if (startIdx !== -1) {
          const jsonStr = dataStr.substring(startIdx + 1, dataStr.length - 1);
          const data = JSON.parse(jsonStr);
          if (data && data.data) {
            const klineList = data.data.split(';');
            for (const item of klineList) {
              const parts = item.split(',');
              if (parts.length >= 7) {
                const [day, openPrice, highPrice, lowPrice, closePrice, vol, total] = parts;
                const normalizedDate = this.normalizeDate(day);
                if (normalizedDate && normalizedDate.length === 8) {
                  result.set(normalizedDate, {
                    date: normalizedDate,
                    open: parseFloat(openPrice) || 0,
                    high: parseFloat(highPrice) || 0,
                    low: parseFloat(lowPrice) || 0,
                    close: parseFloat(closePrice) || 0,
                    volume: parseFloat(vol) || 0,
                    turnover: parseFloat(total) || 0,
                  });
                }
              }
            }
          }
        }
      }
    } catch (error) {
      logger.debug(`获取K线失败 ${stockCode}: ${(error as Error).message}`);
    }
    // 防刷新过快
    await sleep(1, 2);
    return result;
  }

  // 增量合并：已有则跳过，确保不覆盖本地历史
  private mergeWithoutOverwrite (existing: Map<string, CachedKline>, incoming: Map<string, CachedKline>): Map<string, CachedKline> {
    for (const [date, kline] of incoming) {
      if (!existing.has(date)) {
        existing.set(date, kline);
      }
    }
    return existing;
  }

  async getKline (stockCode: string, dateStr: string, preferDays: number = 1800): Promise<CachedKline | null> {
    const normalizedDate = this.normalizeDate(dateStr);
    const klines = await this.ensureKlines(stockCode, { targetDates: [normalizedDate], preferDays });
    return klines.get(normalizedDate) || null;
  }

  async getKlines (stockCode: string, targetDates: string[], preferDays: number = 1800): Promise<Map<string, CachedKline>> {
    return this.ensureKlines(stockCode, { targetDates: targetDates.map(date => this.normalizeDate(date)), preferDays });
  }

  async getRange (stockCode: string, startDate: string, endDate: string, preferDays: number = 1800): Promise<Map<string, CachedKline>> {
    const requiredDates = this.buildRequiredDates(this.normalizeDate(startDate), this.normalizeDate(endDate));
    const fullMap = await this.ensureKlines(stockCode, { targetDates: requiredDates, preferDays });
    const filtered = new Map<string, CachedKline>();
    for (const date of requiredDates) {
      const kline = fullMap.get(date);
      if (kline) {
        filtered.set(date, kline);
      }
    }
    return filtered;
  }

  // 确保目标日期的K线齐全；缺口时默认抓取 preferDays（1800）
  async ensureKlines (
    stockCode: string,
    options: { targetDates: string[]; preferDays?: number }
  ): Promise<Map<string, CachedKline>> {
    const preferDays = options.preferDays ?? 1800; // 默认拉取约7年数据，填补缺口
    const fetched = await this.fetchKlineFromTHS(stockCode, preferDays);
    this.persistCache(stockCode, fetched, Date.now());
    return fetched;
  }

  // 从腾讯获取实时行情并转换为 CachedKline 格式（用于当日数据兜底）
  public async fetchRealtimeKline (stockCode: string): Promise<CachedKline | null> {
    try {
      const quote = await this.fetchRealtimeQuote(stockCode);
      if (!quote || quote.open === 0) {
        logger.debug(`[K线缓存] 从腾讯获取实时行情失败 ${stockCode}: 无数据或开盘价为0`);
        return null;
      }

      // 将实时行情转换为K线格式
      const kline: CachedKline = {
        date: quote.date.replace(/-/g, ''), // YYYY-MM-DD -> YYYYMMDD
        open: quote.open,
        high: quote.high,
        low: quote.low,
        close: quote.current, // 当前价作为收盘价（盘中或已收盘）
        volume: quote.volume * 100, // 手 -> 股
        turnover: quote.turnover,
      };

      return kline;
    } catch (error) {
      logger.debug(`[K线缓存] 获取实时行情失败 ${stockCode}: ${(error as Error).message}`);
      return null;
    }
  }

  // 从腾讯获取实时行情数据（盘中/收盘后均可获取当日数据）
  private async fetchRealtimeQuote (stockCode: string): Promise<RealtimeQuote | null> {
    try {
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
        return null;
      }

      const parts = match[1].split('~');
      if (parts.length < 45) {
        return null;
      }

      // 腾讯数据格式（以 ~ 分隔，索引从0开始）:
      // 0:未知 1:名称 2:代码 3:当前价 4:昨收 5:今开 6:成交量(手)
      // 33:最高 34:最低 37:成交额(万)
      // 30:时间戳(YYYYMMDDHHMMSS)
      const current = parseFloat(parts[3]) || 0;
      const preClose = parseFloat(parts[4]) || 0;
      const open = parseFloat(parts[5]) || 0;
      const high = parseFloat(parts[33]) || 0;
      const low = parseFloat(parts[34]) || 0;
      const volume = parseFloat(parts[6]) || 0;
      const turnover = (parseFloat(parts[37]) || 0) * 10000;

      if (open === 0) {
        // 开盘价为0表示数据无效
        console.log(`[K线缓存] 腾讯实时行情数据无效 ${stockCode}`);
        return null;
      }

      // 解析日期 (格式: 20251215161428)
      const timeStr = parts[30] || '';
      const date = timeStr.length >= 8 ? `${timeStr.substring(0, 4)}-${timeStr.substring(4, 6)}-${timeStr.substring(6, 8)}` : '';

      return {
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
      };
    } catch (error) {
      logger.debug(`[K线缓存] 腾讯实时行情请求失败 ${stockCode}: ${(error as Error).message}`);
      return null;
    }
  }

  // 将6位股票代码转为腾讯格式: sh600693 / sz002544
  private getQQStockCode (stockCode: string): string {
    const code = stockCode.replace(/\D/g, '');
    if (code.startsWith('6')) {
      return `sh${code}`;
    } else if (code.startsWith('0') || code.startsWith('3')) {
      return `sz${code}`;
    } else if (code.startsWith('8') || code.startsWith('4')) {
      return `bj${code}`; // 北交所
    }
    return `sh${code}`;
  }

  // 对外合并写入入口，复用"缺什么补什么，不覆盖已有"的策略
  mergeAndSave (stockCode: string, klines: Map<string, CachedKline>): void {
    const { map } = this.loadCache(stockCode);
    const merged = this.mergeWithoutOverwrite(map, klines); // 增量合并入库
    this.persistCache(stockCode, merged, Date.now());
  }

  /**
   * 获取最近 N 个交易日的K线数据（按日期排序的数组）
   * 这是一个便捷方法，用于需要按天数获取数据的场景
   * @param stockCode 股票代码
   * @param days 需要的交易日数量
   * @returns 按日期升序排列的K线数组
   */
  async getRecentKlines (stockCode: string, days: number = 1800): Promise<CachedKline[]> {
    const klinesMap = this.loadCache(stockCode).map; // 读取缓存
    // 返回最近 days 条数据
    return Array.from(klinesMap.values()).sort((a, b) => a.date.localeCompare(b.date)).slice(-days);
  }
  async getKlinesByStartDay (stockCode: string, startDay: string, klineDays: number) {
    startDay = toDateStr(startDay);
    // 计算结束日期
    const endDateStr = tradingCalendarService.getNextTradingDays(startDay, klineDays);
    console.log('🚀 ~ :353 ~ KlineCacheService ~ getKlinesByStartDay ~ endDateStr:', startDay, endDateStr);
    // 如果结束日期 >= 今天，则返回空数组
    if (!endDateStr || toDateStr(getToday()) < endDateStr) {
      logger.warn(`[K线缓存] ${stockCode} 结束日期 ${endDateStr} 不在历史范围内，直接跳过`);
      return [];
    }
    let endDateIndex: number = -1;
    // 确保缓存中有足够数据
    let allCachedKlines = this.loadCache(stockCode).map;
    console.log(`[K线缓存] ${stockCode} 获取从 ${startDay} 开始的 ${klineDays} 天K线`);
    // 如果缓存中没有起始日期，则从远端拉取数据
    const startDateIndex = Array.from(allCachedKlines.keys()).indexOf(startDay);
    if (startDateIndex < 0) {
      logger.warn(`[K线缓存] ${stockCode} 起始日期 ${startDay} 不在缓存中，从远端拉取数据中...`);
      allCachedKlines = await this.ensureKlines(stockCode, { targetDates: [startDay] });
      await sleep(8, 2); // 简单节流
    }
    // 计算结束日期是否在缓存中
    if (endDateStr) {
      endDateIndex = Array.from(allCachedKlines.keys()).indexOf(endDateStr);
      // 如果结束日期不在缓存 且 结束日期 <= 今天，则从远端拉取数据
      console.log(`[K线缓存] ${stockCode} 计算结束日期 ${endDateStr} 在缓存中的索引为 ${endDateIndex}`);
      if (endDateIndex < 0 && endDateStr <= toDateStr(getToday())) {
        logger.warn(`[K线缓存] ${stockCode} 结束日期 ${endDateStr} 不在缓存中，从远端拉取数据中...`);
        allCachedKlines = await this.ensureKlines(stockCode, { targetDates: [endDateStr] });
        await sleep(8, 2); // 简单节流
      }
    }
    // 从起始日期开始，获取后续 klineDays 个交易日的日期列表
    return Array.from(allCachedKlines.values()).slice(startDateIndex, endDateIndex);
  }

  // 获取某个日期的K线数据
  async getKlineByDate (stockCode: string, date: string): Promise<CachedKline | null> {
    const klinesMap = this.loadCache(stockCode).map;
    return klinesMap.get(toDateStr(date)) || null;
  }

  // 从远端强制拉取某个日期的K线数据并合并写入缓存
  async fetchKlineByDate (stockCode: string, date: string): Promise<CachedKline[] | null> {
    const targetDate = toDateStr(date);
    let localKline = this.loadCache(stockCode).map;
    let klineDates = localKline.size > 0 ? Array.from(localKline.values()) : null;
    // 如果本地没有缓存，直接从远端拉取
    if (localKline.size === 0) {
      console.log(`[K线缓存] ${stockCode} 本地缓存为空，从远端拉取`);
      localKline = await this.fetchKlineFromTHS(stockCode, 1800); // 拉取较多数据以覆盖缺口
    }
    // targetDate 是否为交易日
    if (!tradingCalendarService.isTradingDay(targetDate)) {
      logger.warn(`[K线缓存] ${stockCode} ${targetDate} 不是交易日，无法获取K线`);
      return localKline.size > 0 ? Array.from(localKline.values()) : null;
    }
    // 检查缓存中是否有数据
    if (!klineDates || klineDates.length === 0) {
      logger.warn(`[K线缓存] fetchKlineFromTHS ${stockCode} 获取失败`);
      return null;
    }
    // 如果目标日期不在缓存中，尝试补齐
    if (!localKline.has(targetDate)) {
      // 目标日期不在缓存中，检查是否为未来日期
      if (targetDate > toDateStr(getToday())) {
        logger.warn(`[K线缓存] ${stockCode} ${targetDate} K线数据可能尚未生成，稍后重试`);
        return null;
      }
      // 如果目标日期是今天 且 在收盘前，尝试从腾讯接口获取实时行情
      if (targetDate === toDateStr(getToday()) && dayjs().isBefore(dayjs().hour(15).minute(0).second(0))) {
        logger.info(`[K线缓存] ${stockCode} ${targetDate} 尝试从腾讯接口获取实时行情`);
        const realtimeKline = await this.fetchRealtimeKline(stockCode);
        if (realtimeKline && realtimeKline.date === targetDate) {
          klineDates.push(realtimeKline);
        }
        return klineDates;
      }
      // 缓存中没有目标日期的K线数据，从远端拉取
      console.log(`[K线缓存] ${stockCode} 缓存中不存在 ${targetDate}，从远端拉取`);
      localKline = await this.fetchKlineFromTHS(stockCode, 1800); // 拉取较多数据以覆盖缺口
      this.persistCache(stockCode, localKline, Date.now()); // 更新缓存
    }
    // 查找目标日期的K线数据
    if (!localKline.has(targetDate)) {
      logger.warn(`[K线缓存] ${stockCode} ${targetDate} 缓存中不存在，拉取后仍未获取到`);
    }
    return klineDates;
  }
}

export const klineCacheService = new KlineCacheService();

/**
 * 批量从腾讯接口获取实时行情数据
 * @param codes 股票代码数组（6位数字，如 ['000001', '600693']）
 * @returns Promise<Map<string, TencentRealtimeQuote>> 股票代码 -> 实时行情
 */
export async function fetchTencentRealTimeQuotes (codes: string[]): Promise<Map<string, OpenData>> {
  const result = new Map<string, OpenData>();

  if (!codes || codes.length === 0) {
    return result;
  }
  let dataTime = ''

  try {
    // 将股票代码转换为腾讯格式并拼接
    const qqCodes = codes.map(code => {
      const cleanCode = code.replace(/\D/g, '');
      if (cleanCode.startsWith('6')) {
        return `sh${cleanCode}`;
      } else if (cleanCode.startsWith('0') || cleanCode.startsWith('3')) {
        return `sz${cleanCode}`;
      } else if (cleanCode.startsWith('8') || cleanCode.startsWith('4')) {
        return `bj${cleanCode}`; // 北交所
      }
      return `sh${cleanCode}`;
    });
    console.log(`[K线缓存] 腾讯接口请求: ${qqCodes.join(',')}`);
    const url = `https://qt.gtimg.cn/q=${qqCodes.join(',')}`;

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
    writeToFile('/debug/', `tencent_realtime_${dayjs().format('YYYY-MM-DD')}.txt`,dataStr);

    // 响应格式: v_sz000001="..."; v_sz000002="...";
    // 使用正则匹配所有股票数据
    const regex = /v_([a-z]{2}\d+)="([^"]*)"/g;
    let match;

    while ((match = regex.exec(dataStr)) !== null) {
      const qqCode = match[1]; // sh600693 或 sz000001
      const dataContent = match[2];

      if (!dataContent) {
        continue;
      }

      const parts = dataContent.split('~');
      if (parts.length < 45) {
        continue;
      }

      // 腾讯数据格式（以 ~ 分隔，索引从0开始）:
      // 0:未知 1:名称 2:代码 3:当前价 4:昨收 5:今开 6:成交量(手)
      // 33:最高 34:最低 37:成交额(万)
      // 35:6.81/929492/625533800 split by '/' 0:收盘价 1:总手-成交量 2:总额-成交额
      // 30:时间戳(YYYYMMDDHHMMSS) 31:涨跌额 32:涨跌幅
      const volumeAndTurnover = parts[35].split('/');
      const stockCode = parts[2];
      const stockName = parts[1];
      const current = parseFloat(parts[3]) || 0;
      const preClose = parseFloat(parts[4]) || 0;
      const open = parseFloat(parts[5]) || 0;
      const high = parseFloat(parts[33]) || 0;
      const low = parseFloat(parts[34]) || 0;
      const volume = parseFloat(volumeAndTurnover[1]) || 0; // 手
      const turnover = parseFloat(volumeAndTurnover[2]) || 0; // 万
      const changeAmount = parseFloat(parts[31]) || 0;
      const changePercent = parseFloat(parts[32]) || 0;

      // 解析日期时间 (格式: 20251215161428)
      const timeStr = parts[30] || '';
      const date = timeStr.length >= 8
        ? `${timeStr.substring(0, 4)}-${timeStr.substring(4, 6)}-${timeStr.substring(6, 8)}`
        : '';
      const time = timeStr.length >= 14
        ? `${timeStr.substring(8, 10)}:${timeStr.substring(10, 12)}:${timeStr.substring(12, 14)}`
        : '';
      dataTime = timeStr;

      // 开盘价为0表示数据可能无效，但仍放入结果中，由调用方判断
      result.set(stockCode, {
        openTimes: timeStr,
        openPrice: open,
        openChangePercent: preClose > 0 ? ((open - preClose) / preClose) * 100 : 0,
        openVolumeRatio: volume, // 成交量（手）
        auctionAmount: turnover, // 成交额（元）
        auctionAmountRatio: preClose > 0 ? ((turnover - preClose * volume * 100) / (preClose * volume * 100)) * 100 : 0,
        isLimitUp: changePercent >= 9.9, // 简单判断涨停（A股）
      });
    }
  } catch (error) {
    logger.warn(`[腾讯实时行情] 批量获取失败: ${(error as Error).message}`);
  }
  return result;
}
