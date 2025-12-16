import axios from 'axios';
import dayjs from 'dayjs';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils';
import { tradingCalendarService } from './tradingCalendarService';

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

  private normalizeDate(dateStr: string): string {
    return dateStr.replace(/[-/]/g, '');
  }

  private getCacheFile(stockCode: string): string {
    return path.join(this.cacheDir, `${stockCode}.json`);
  }

  // 读取磁盘缓存为 Map，保留原 cacheTime 方便上层记录更新时间
  private loadCache(stockCode: string): { map: Map<string, CachedKline>; cacheTime: number } {
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
  private persistCache(stockCode: string, map: Map<string, CachedKline>, cacheTime: number = Date.now()): void {
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
  private getCacheRange(map: Map<string, CachedKline>): { min?: string; max?: string } {
    if (map.size === 0) return {};
    const dates = Array.from(map.keys()).sort();
    return { min: dates[0], max: dates[dates.length - 1] };
  }

  // 根据交易日历生成区间日期列表，可附加额外目标日期
  private buildRequiredDates(startDate: string, endDate: string, extra: string[] = []): string[] {
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
  private async fetchKlineFromTHS(stockCode: string, days: number): Promise<Map<string, CachedKline>> {
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
        timeout: 10000,
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
    return result;
  }

  // 增量合并：已有则跳过，确保不覆盖本地历史
  private mergeWithoutOverwrite(existing: Map<string, CachedKline>, incoming: Map<string, CachedKline>): Map<string, CachedKline> {
    for (const [date, kline] of incoming) {
      if (!existing.has(date)) {
        existing.set(date, kline);
      }
    }
    return existing;
  }

  async getKline(stockCode: string, dateStr: string, preferDays: number = 1800): Promise<CachedKline | null> {
    const normalizedDate = this.normalizeDate(dateStr);
    const klines = await this.ensureKlines(stockCode, { targetDates: [normalizedDate], preferDays });
    return klines.get(normalizedDate) || null;
  }

  async getKlines(stockCode: string, targetDates: string[], preferDays: number = 1800): Promise<Map<string, CachedKline>> {
    return this.ensureKlines(stockCode, { targetDates: targetDates.map(date => this.normalizeDate(date)), preferDays });
  }

  async getRange(stockCode: string, startDate: string, endDate: string, preferDays: number = 1800): Promise<Map<string, CachedKline>> {
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

  // 确保目标日期的K线齐全；缺口时默认抓取 preferDays（1800）并增量合并
  // 如果是当天数据且THS历史接口无数据，则使用腾讯实时行情兜底
  async ensureKlines(
    stockCode: string,
    options: { targetDates: string[]; preferDays?: number }
  ): Promise<Map<string, CachedKline>> {
    const preferDays = options.preferDays ?? 1800; // 默认拉取约7年数据，填补缺口
    const normalizedTargets = options.targetDates.map(date => this.normalizeDate(date)).filter(d => d.length === 8);
    const { map } = this.loadCache(stockCode);

    if (normalizedTargets.length === 0) {
      return map;
    }

    const missingDates = normalizedTargets.filter(date => !map.has(date));
    if (missingDates.length === 0) {
      return map;
    }

    const sortedMissing = [...missingDates].sort();
    const earliestNeed = sortedMissing[0];
    const latestNeed = sortedMissing[sortedMissing.length - 1];
    const { min: minCached, max: maxCached } = this.getCacheRange(map);

    if (!minCached || earliestNeed < minCached) {
      logger.info(`[K线缓存] ${stockCode} 需要向前补全: ${earliestNeed} -> ${minCached || 'none'}`);
    }
    if (!maxCached || latestNeed > maxCached) {
      logger.info(`[K线缓存] ${stockCode} 需要向后补全: ${maxCached || 'none'} -> ${latestNeed}`);
    }

    const fetched = await this.fetchKlineFromTHS(stockCode, preferDays);
    let merged = this.mergeWithoutOverwrite(map, fetched);

    // 检查是否仍有缺失的目标日期，如果是当天则使用腾讯实时行情兜底
    const today = dayjs().format('YYYYMMDD');
    const stillMissingDates = normalizedTargets.filter(date => !merged.has(date));
    
    if (stillMissingDates.includes(today)) {
      logger.info(`[K线缓存] ${stockCode} THS未返回今日(${today})数据，尝试腾讯实时行情兜底...`);
      const realtimeKline = await this.fetchRealtimeKline(stockCode);
      if (realtimeKline && realtimeKline.date === today) {
        merged.set(today, realtimeKline);
        logger.info(`[K线缓存] ${stockCode} 从腾讯实时行情获取今日K线成功: open=${realtimeKline.open}, close=${realtimeKline.close}`);
      } else {
        logger.warn(`[K线缓存] ${stockCode} 腾讯实时行情也未能获取今日数据`);
      }
    }

    this.persistCache(stockCode, merged, Date.now());
    return merged;
  }

  // 从腾讯获取实时行情并转换为 CachedKline 格式（用于当日数据兜底）
  private async fetchRealtimeKline(stockCode: string): Promise<CachedKline | null> {
    try {
      const quote = await this.fetchRealtimeQuote(stockCode);
      if (!quote || quote.open === 0) {
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
  private async fetchRealtimeQuote(stockCode: string): Promise<RealtimeQuote | null> {
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
  private getQQStockCode(stockCode: string): string {
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

  // 对外合并写入入口，复用“缺什么补什么，不覆盖已有”的策略
  mergeAndSave(stockCode: string, klines: Map<string, CachedKline>): void {
    const { map } = this.loadCache(stockCode);
    const merged = this.mergeWithoutOverwrite(map, klines); // 增量合并入库
    this.persistCache(stockCode, merged, Date.now());
  }
}

export const klineCacheService = new KlineCacheService();
