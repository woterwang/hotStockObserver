import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { formatDate } from '../utils/dateUtils';
import { logger } from '../utils';

export interface ConceptRankingItem {
  code: string;
  name: string;
  strength: number;
  change: number;
  speed: number;
  turnover: number;
  mainNet: number;
  volumeRatio: number;
  raw: any;
}

export interface ConceptRankingResult {
  date: string; // YYYYMMDD
  items: ConceptRankingItem[];
  topChild: ConceptRankingItem | null;
  source: 'api' | 'mock';
  raw?: any;
}

const MOCK_PATH = path.join(__dirname, '../../temp/请求抓包详情-kpl-每日板块强度.txt');

const toNumber = (value: any): number => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const normalizeDateInput = (input?: string): { yyyymmdd: string; iso: string } => {
  if (!input) {
    const today = formatDate(new Date(), 'YYYYMMDD');
    return { yyyymmdd: today, iso: `${today.slice(0, 4)}-${today.slice(4, 6)}-${today.slice(6)}` };
  }
  const cleaned = input.replace(/-/g, '');
  if (!/^\d{8}$/.test(cleaned)) {
    throw new Error('日期格式应为 YYYYMMDD 或 YYYY-MM-DD');
  }
  return { yyyymmdd: cleaned, iso: `${cleaned.slice(0, 4)}-${cleaned.slice(4, 6)}-${cleaned.slice(6)}` };
};

class ConceptRankingService {
  private readonly baseUrl = process.env.KPL_CONCEPT_URL || 'https://apparticle.longhuvip.com/w1/api/index.php';
  private readonly version = process.env.KPL_VERSION || '5.20.0.9';
  private readonly apiVer = process.env.KPL_API_VER || 'w41';
  private readonly cParam = process.env.KPL_CONCEPT_C || 'HisHomeDingPan';
  private readonly aParam = process.env.KPL_CONCEPT_A || 'HisBKRank';

  private buildPayload(isoDate: string, count: number): URLSearchParams {
    const params = new URLSearchParams({
      Day: isoDate,
      PhoneOSNew: '2',
      VerSion: this.version,
      a: this.aParam,
      apiv: this.apiVer,
      c: this.cParam,
      Count: String(count || 20),
      Max: '1500',
    });

    const extra = process.env.KPL_CONCEPT_EXTRA;
    if (extra) {
      const pairs = extra.split('&');
      for (const pair of pairs) {
        const [k, v] = pair.split('=');
        if (k) params.append(k, v ?? '');
      }
    }

    return params;
  }

  private transformResponse(rawData: any, includeRaw: boolean, fallbackDate: string, source: 'api' | 'mock'): ConceptRankingResult {
    const data = rawData?.info ?? rawData;
    const dateFromResp = Array.isArray(data?.Day) && data.Day[0] ? String(data.Day[0]).replace(/-/g, '') : fallbackDate;

    const items: ConceptRankingItem[] = Array.isArray(data?.list)
      ? data.list
        .filter((row: any) => Array.isArray(row) && row.length >= 3)
        .map((row: any) => ({
          code: String(row[0]),
          name: String(row[1]),
          strength: toNumber(row[2]),
          change: toNumber(row[3]),
          speed: toNumber(row[4]),
          turnover: toNumber(row[5]),
          mainNet: toNumber(row[6]),
          volumeRatio: toNumber(row[9]),
          raw: row,
        }))
      : [];

    const topChildRaw = Array.isArray(data?.list_soninfo) && Array.isArray(data.list_soninfo[0])
      ? data.list_soninfo[0]
      : null;

    const topChild: ConceptRankingItem | null = topChildRaw
      ? {
          code: String(topChildRaw[0]),
          name: String(topChildRaw[1]),
          strength: toNumber(topChildRaw[2]),
          change: toNumber(topChildRaw[3]),
          speed: toNumber(topChildRaw[4]),
          turnover: toNumber(topChildRaw[5]),
          mainNet: toNumber(topChildRaw[6]),
          volumeRatio: toNumber(topChildRaw[9]),
          raw: topChildRaw,
        }
      : null;

    const result: ConceptRankingResult = {
      date: dateFromResp,
      items,
      topChild,
      source,
    };

    if (includeRaw) {
      result.raw = rawData;
    }

    return result;
  }

  private tryLoadMock(includeRaw: boolean, fallbackDate: string): ConceptRankingResult | null {
    try {
      if (!fs.existsSync(MOCK_PATH)) return null;
      const raw = fs.readFileSync(MOCK_PATH, 'utf-8');
      const cleaned = raw.replace(/\/\/.*$/gm, '');
      const parsed = JSON.parse(cleaned);
      return this.transformResponse(parsed, includeRaw, fallbackDate, 'mock');
    } catch (err) {
      logger.error(`[概念排名] 解析本地样例失败: ${(err as Error).message}`);
      return null;
    }
  }

  async fetchDailyConceptRanking(dateStr?: string, count = 20, includeRaw = false): Promise<ConceptRankingResult> {
    const { yyyymmdd, iso } = normalizeDateInput(dateStr);
    const payload = this.buildPayload(iso, count);

    try {
      const response = await axios.post(this.baseUrl, payload.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Origin': 'https://apppage.longhuvip.com',
          'Referer': 'https://apppage.longhuvip.com/',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) ;kaipanla 5.20.0.9',
        },
        timeout: 15000,
      });

      const parsed = this.transformResponse(response.data, includeRaw, yyyymmdd, 'api');
      if (parsed.items.length === 0) {
        logger.warn(`[概念排名] 接口返回为空(${yyyymmdd})，尝试使用抓包样例`);
        const mock = this.tryLoadMock(includeRaw, yyyymmdd);
        if (mock) {
          return mock;
        }
      }
      return parsed;
    } catch (error) {
      logger.error(`[概念排名] 接口请求失败(${yyyymmdd}): ${(error as Error).message}`);
      const mock = this.tryLoadMock(includeRaw, yyyymmdd);
      if (mock) {
        logger.warn('[概念排名] 使用抓包样例数据作为降级');
        return mock;
      }
      throw error;
    }
  }
}

export const conceptRankingService = new ConceptRankingService();
