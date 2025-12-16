import fs from 'fs';
import path from 'path';
import axios from 'axios';
import dayjs from 'dayjs';
import { logger } from '../utils';

const CACHE_DIR = path.join(__dirname, '../../data/kline_cache');
const DEFAULT_DAYS = 1800;

interface CachedKline {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnover: number;
}

function normalizeDate(dateStr: string): string {
  return dateStr.replace(/[-/]/g, '');
}

async function fetchKlines(stockCode: string, days: number): Promise<Map<string, CachedKline>> {
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
              const normalizedDate = normalizeDate(day);
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
    logger.warn(`[refresh-klines] fetch failed ${stockCode}: ${(error as Error).message}`);
  }
  return result;
}

function readCacheCount(stockCode: string): number {
  const cacheFile = path.join(CACHE_DIR, `${stockCode}.json`);
  if (!fs.existsSync(cacheFile)) return 0;
  try {
    const cacheData = JSON.parse(fs.readFileSync(cacheFile, 'utf-8')) as { klines?: Record<string, CachedKline> };
    return cacheData.klines ? Object.keys(cacheData.klines).length : 0;
  } catch (err) {
    logger.warn(`[refresh-klines] read cache failed ${stockCode}: ${(err as Error).message}`);
    return 0;
  }
}

function saveCache(stockCode: string, klines: Map<string, CachedKline>): void {
  const cacheFile = path.join(CACHE_DIR, `${stockCode}.json`);
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  const cacheData = {
    stockCode,
    cacheTime: Date.now(),
    klines: {} as Record<string, CachedKline>,
  };
  for (const [date, kline] of klines) {
    cacheData.klines[date] = kline;
  }
  fs.writeFileSync(cacheFile, JSON.stringify(cacheData), 'utf-8');
}

async function refreshAll() {
  if (!fs.existsSync(CACHE_DIR)) {
    throw new Error(`cache dir not found: ${CACHE_DIR}`);
  }

  const codes = fs.readdirSync(CACHE_DIR)
    .filter(name => name.toLowerCase().endsWith('.json'))
    .map(name => name.replace(/\.json$/i, ''));

  logger.info(`[refresh-klines] found ${codes.length} cache files in ${CACHE_DIR}`);
  if (codes.length === 0) {
    logger.warn('[refresh-klines] no cache files found, nothing to do');
    return;
  }

  let refreshed = 0;
  let skipped = 0;
  for (const code of codes) {
    const count = readCacheCount(code);
    if (count >= DEFAULT_DAYS) {
      skipped++;
      continue;
    }

    logger.info(`[refresh-klines] ${code} count=${count} < ${DEFAULT_DAYS}, refetching...`);
    const klines = await fetchKlines(code, DEFAULT_DAYS);
    if (klines.size === 0) {
      logger.warn(`[refresh-klines] ${code} fetch empty, skip save`);
    } else {
      saveCache(code, klines); // 覆盖写入
      refreshed++;
    }

    // 随机等待 8-12 秒，防止被限流
    const waitMs = 8000 + Math.floor(Math.random() * 4000);
    await new Promise(res => setTimeout(res, waitMs));
  }

  logger.info(`[refresh-klines] done. refreshed=${refreshed}, skipped=${skipped}, total=${codes.length}`);
  console.log(`[refresh-klines] done. refreshed=${refreshed}, skipped=${skipped}, total=${codes.length}`);
}

refreshAll().catch(err => {
  console.error(err);
  process.exit(1);
});
