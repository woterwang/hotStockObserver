import { logger } from '../utils';
import { TradingSignal, ITradingSignal, EntryConditions, ExitConditions } from '../models/TradingSignal';
import { PriceBreakthrough } from '../models';
import { formatDate, parseDate } from '../utils/dateUtils';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

// 导入同花顺工具
// eslint-disable-next-line @typescript-eslint/no-var-requires
const thsUtils = require('../utils/thsUtils');

/**
 * K线数据
 */
interface KlineData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnover: number;
}

/**
 * 交易信号服务
 * 负责：
 * 1. 盘后生成次日潜在入场标的
 * 2. 集合竞价后更新入场条件
 * 3. 生成止盈止损条件
 */
export class TradingSignalService {
  
  // K线缓存目录
  private cacheDir: string;

  constructor() {
    this.cacheDir = path.join(__dirname, '../../data/kline_cache');
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

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
   * 从同花顺获取K线数据
   */
  private async fetchKlineFromTHS(stockCode: string, days: number = 30): Promise<Map<string, KlineData>> {
    const result = new Map<string, KlineData>();
    try {
      const marketId = this.getMarketId(stockCode);
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
        // 解析同花顺K线数据
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
                if (day && day.length === 8) {
                  result.set(day, {
                    date: day,
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

  /**
   * 获取前N个交易日
   */
  private getPreviousTradingDays(dateStr: string, n: number): string[] {
    const result: string[] = [];
    let currentDate = parseDate(dateStr);
    
    for (let i = 0; i < n; i++) {
      currentDate = new Date(currentDate.getTime() - 24 * 60 * 60 * 1000);
      while (currentDate.getDay() === 0 || currentDate.getDay() === 6) {
        currentDate = new Date(currentDate.getTime() - 24 * 60 * 60 * 1000);
      }
      result.push(formatDate(currentDate, 'YYYYMMDD'));
    }
    
    return result;
  }

  /**
   * 盘后扫描：生成次日潜在入场标的
   * 在 Day2 收盘后执行，生成 Day3 的入场信号
   * @param day2Str Day2 日期 YYYYMMDD
   */
  async generateSignalsAfterMarketClose(day2Str: string): Promise<number> {
    logger.info(`开始生成 ${day2Str} 收盘后的交易信号...`);
    
    // Day3 = Day2 的下一个交易日
    const day3Date = this.getNextTradingDay(day2Str);
    const [day1Str] = this.getPreviousTradingDays(day2Str, 1);
    
    // 使用问财查询符合 Day1+Day2 条件的股票
    const candidates = await this.fetchCandidatesFromWencai(day1Str, day2Str);
    
    if (candidates.length === 0) {
      logger.info('未发现符合条件的候选标的');
      return 0;
    }

    logger.info(`发现 ${candidates.length} 只候选标的，开始获取详细数据...`);

    let savedCount = 0;
    for (const stock of candidates) {
      try {
        // 获取K线数据
        const klines = await this.fetchKlineFromTHS(stock.code, 10);
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
          signalDate: parseDate(day3Date),
          stockCode: stock.code,
          stockName: stock.name,
          
          day1Date: parseDate(day1Str),
          day1Open: day1Kline.open,
          day1Close: day1Kline.close,
          day1High: day1Kline.high,
          day1Low: day1Kline.low,
          day1Change: stock.day1Change || 0,
          day1Volume: day1Kline.volume,
          day1Turnover: day1Kline.turnover,
          
          day2Date: parseDate(day2Str),
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
        
        // 小延迟
        await this.delay(200);
      } catch (error) {
        logger.debug(`处理 ${stock.code} 失败: ${(error as Error).message}`);
      }
    }

    logger.info(`交易信号生成完成，共 ${savedCount} 个`);
    return savedCount;
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
    
    // 获取今日待处理的信号
    const day3Date = parseDate(day3Str);
    const signals = await TradingSignal.find({
      signalDate: day3Date,
      status: 'pending',
    });

    if (signals.length === 0) {
      logger.info('今日无待处理信号');
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
          logger.debug(`${signal.stockCode} 获取开盘价失败`);
          continue;
        }

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

        await this.delay(300);
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
    
    // 如果是历史日期，从K线缓存获取
    if (dateStr && dateStr !== today) {
      return await this.fetchOpenPriceFromKline(stockCode, dateStr);
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
      // 1. 先尝试从缓存文件读取
      const cacheFile = path.join(this.cacheDir, `${stockCode}.json`);
      if (fs.existsSync(cacheFile)) {
        const cacheData = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
        if (cacheData.klines && cacheData.klines[dateStr]) {
          const kline = cacheData.klines[dateStr];
          logger.debug(`从缓存获取 ${stockCode} ${dateStr} 开盘价: ${kline.open}`);
          return kline.open;
        }
      }

      // 2. 缓存中没有，从同花顺获取
      logger.debug(`缓存未命中，从同花顺获取 ${stockCode} K线...`);
      const klines = await this.fetchKlineFromTHS(stockCode, 100);
      
      if (klines.has(dateStr)) {
        const kline = klines.get(dateStr);
        
        // 保存到缓存
        this.saveKlineToCache(stockCode, klines);
        
        return kline?.open || null;
      }

      return null;
    } catch (error) {
      logger.debug(`获取历史开盘价失败 ${stockCode} ${dateStr}: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * 保存K线数据到缓存
   */
  private saveKlineToCache(stockCode: string, klines: Map<string, KlineData>): void {
    try {
      const cacheFile = path.join(this.cacheDir, `${stockCode}.json`);
      let existingData: any = { stockCode, cacheTime: Date.now(), klines: {} };
      
      // 读取现有缓存
      if (fs.existsSync(cacheFile)) {
        existingData = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
      }
      
      // 合并新数据
      for (const [date, kline] of klines) {
        existingData.klines[date] = kline;
      }
      existingData.cacheTime = Date.now();
      
      fs.writeFileSync(cacheFile, JSON.stringify(existingData), 'utf-8');
    } catch (error) {
      logger.debug(`保存K线缓存失败 ${stockCode}: ${(error as Error).message}`);
    }
  }

  /**
   * 使用问财获取符合条件的候选标的
   */
  private async fetchCandidatesFromWencai(day1Str: string, day2Str: string): Promise<any[]> {
    try {
      // 查询 Day1 突破 + Day2 确认的股票
      const question = `${day1Str}涨幅>8%，${day1Str}股价创188日新高，${day2Str}涨跌幅大于-3%且<3%，${day2Str}最高价>${day1Str}最高价，非ST，非新股，非北交所，近二年未被立案`;
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
   * 获取下一个交易日
   */
  private getNextTradingDay(dateStr: string): string {
    let currentDate = parseDate(dateStr);
    currentDate = new Date(currentDate.getTime() + 24 * 60 * 60 * 1000);
    while (currentDate.getDay() === 0 || currentDate.getDay() === 6) {
      currentDate = new Date(currentDate.getTime() + 24 * 60 * 60 * 1000);
    }
    return formatDate(currentDate, 'YYYYMMDD');
  }

  /**
   * 获取今日信号列表
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getTodaySignals(dateStr: string): Promise<any[]> {
    const date = parseDate(dateStr);
    const signals = await TradingSignal.find({ signalDate: date })
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
    const query: any = {
      signalDate: {
        $gte: parseDate(startDate),
        $lte: parseDate(endDate),
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
    const signal = await TradingSignal.findOneAndUpdate(
      { stockCode, signalDate: parseDate(signalDate) },
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
    const signal = await TradingSignal.findOne({
      stockCode,
      signalDate: parseDate(signalDate),
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
}

export const tradingSignalService = new TradingSignalService();
