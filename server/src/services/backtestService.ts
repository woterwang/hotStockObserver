import { logger } from '../utils';
import { PriceBreakthrough } from '../models';
import { formatDate, parseDate } from '../utils/dateUtils';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

// 导入同花顺工具
// eslint-disable-next-line @typescript-eslint/no-var-requires
const thsUtils = require('../utils/thsUtils');

/**
 * 回测配置参数
 */
export interface BacktestConfig {
  // 止损比例（如 -5 表示 -5%）
  stopLossPercent: number;
  // 止盈比例（如 10 表示 +10%）
  takeProfitPercent: number;
  // 最大持仓天数（超过则强制卖出）
  maxHoldDays: number;
  // 是否使用 Day2 最低价作为止损位
  useDay2LowAsStopLoss: boolean;
}

/**
 * 单笔交易记录
 */
export interface TradeRecord {
  stockCode: string;
  stockName: string;
  entryDate: string;      // Day3 入场日期
  entryPrice: number;     // Day3 开盘价（买入价）
  exitDate: string;       // 卖出日期
  exitPrice: number;      // 卖出价格
  holdDays: number;       // 持仓天数
  profitPercent: number;  // 收益率 %
  exitReason: 'stop_loss' | 'take_profit' | 'max_days' | 'data_end';  // 卖出原因
  day1Date: string;       // Day1 突破日
  day2Date: string;       // Day2 确认日
}

/**
 * 回测结果统计
 */
export interface BacktestResult {
  // 基本信息
  startDate: string;
  endDate: string;
  config: BacktestConfig;
  
  // 统计数据
  totalTrades: number;      // 总交易次数
  winTrades: number;        // 盈利次数
  lossTrades: number;       // 亏损次数
  winRate: number;          // 胜率 %
  
  // 收益统计
  totalProfitPercent: number;   // 总收益率 %
  avgProfitPercent: number;     // 平均收益率 %
  avgWinPercent: number;        // 平均盈利 %
  avgLossPercent: number;       // 平均亏损 %
  profitLossRatio: number;      // 盈亏比
  
  // 极值
  maxProfit: number;        // 最大单笔盈利 %
  maxLoss: number;          // 最大单笔亏损 %
  maxConsecutiveWins: number;   // 最大连续盈利次数
  maxConsecutiveLosses: number; // 最大连续亏损次数
  
  // 持仓统计
  avgHoldDays: number;      // 平均持仓天数
  
  // 交易明细
  trades: TradeRecord[];
}

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
  changePercent: number;
}

/**
 * 回测服务
 */
export class BacktestService {
  
  // 默认配置
  private defaultConfig: BacktestConfig = {
    stopLossPercent: -5,
    takeProfitPercent: 10,
    maxHoldDays: 10,
    useDay2LowAsStopLoss: true,
  };

  // K线缓存目录
  private cacheDir: string;
  // 内存缓存
  private memoryCache: Map<string, Map<string, KlineData>> = new Map();

  constructor() {
    // 初始化缓存目录
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
      logger.warn('生成 Hexin-V 失败，使用默认值');
      return 'Ax8Ssngzh0M9kINf4Czhe-DDqnmphHMgjdx3GrFqu4gVdzBiuVQDdp2oB0_C';
    }
  }

  /**
   * 获取股票的市场ID（同花顺格式）
   * 深圳: 33, 上海: 17
   */
  private getMarketId(stockCode: string): number {
    if (stockCode.startsWith('6')) {
      return 17; // 上海
    }
    return 33; // 深圳（包括创业板30x）
  }

  /**
   * 解析同花顺K线数据
   */
  private parseThsKlineData(dataStr: string): Map<string, KlineData> {
    const result = new Map<string, KlineData>();
    try {
      // 提取JSON部分: quotebridge_v6_line_17_600000_01_last30({...})
      let jsonStr = '';
      const startIdx = dataStr.indexOf('({');
      if (startIdx !== -1) {
        jsonStr = dataStr.substring(startIdx + 1, dataStr.length - 1);
      } else {
        jsonStr = dataStr;
      }
      
      const data = JSON.parse(jsonStr);
      if (data && data.data) {
        // 格式: "20230626,19.05,19.11,18.42,18.48,6959719,129850375.00,3.214,,,0;20230627,..."
        const klineList = data.data.split(';');
        for (const item of klineList) {
          const parts = item.split(',');
          if (parts.length >= 8) {
            const [day, openPrice, highPrice, lowPrice, closePrice, vol, total, hs] = parts;
            if (day && day.length === 8) {
              result.set(day, {
                date: day,
                open: parseFloat(openPrice) || 0,
                high: parseFloat(highPrice) || 0,
                low: parseFloat(lowPrice) || 0,
                close: parseFloat(closePrice) || 0,
                volume: parseFloat(vol) || 0,
                turnover: parseFloat(total) || 0,
                changePercent: parseFloat(hs) || 0,
              });
            }
          }
        }
      }
    } catch (error) {
      logger.debug(`解析同花顺K线数据失败: ${(error as Error).message}`);
    }
    return result;
  }

  /**
   * 从同花顺API获取K线数据
   */
  private async fetchKlineFromTHS(
    stockCode: string,
    totalDays: number = 60
  ): Promise<Map<string, KlineData>> {
    try {
      const marketId = this.getMarketId(stockCode);
      const url = `https://d.10jqka.com.cn/v6/line/${marketId}_${stockCode}/01/last${totalDays}.js`;
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'http://www.10jqka.com.cn/',
          'hexin-v': String(Date.now()),
        },
        timeout: 10000,
      });

      if (response.data && typeof response.data === 'string') {
        return this.parseThsKlineData(response.data);
      }
      return new Map();
    } catch (error) {
      logger.debug(`同花顺K线获取失败 ${stockCode}: ${(error as Error).message}`);
      return new Map();
    }
  }

  /**
   * 获取缓存文件路径
   */
  private getCacheFilePath(stockCode: string): string {
    return path.join(this.cacheDir, `${stockCode}.json`);
  }

  /**
   * 从文件缓存加载K线数据
   */
  private loadKlineFromCache(stockCode: string): Map<string, KlineData> | null {
    try {
      // 先检查内存缓存
      if (this.memoryCache.has(stockCode)) {
        return this.memoryCache.get(stockCode)!;
      }

      // 检查文件缓存
      const cacheFile = this.getCacheFilePath(stockCode);
      if (fs.existsSync(cacheFile)) {
        const data = fs.readFileSync(cacheFile, 'utf-8');
        const parsed = JSON.parse(data);
        
        // 检查缓存是否过期（超过1天）
        const cacheTime = parsed.cacheTime || 0;
        const now = Date.now();
        if (now - cacheTime > 24 * 60 * 60 * 1000) {
          // 缓存过期，但仍然可用作为备份
          logger.debug(`${stockCode} 缓存已过期，但仍可使用`);
        }
        
        // 转换为Map
        const klines: Map<string, KlineData> = new Map();
        for (const [date, kline] of Object.entries(parsed.klines || {})) {
          klines.set(date, kline as KlineData);
        }
        
        // 存入内存缓存
        this.memoryCache.set(stockCode, klines);
        return klines;
      }
      return null;
    } catch (error) {
      logger.debug(`加载缓存失败 ${stockCode}: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * 保存K线数据到缓存
   */
  private saveKlineToCache(stockCode: string, klines: Map<string, KlineData>): void {
    try {
      const cacheData = {
        stockCode,
        cacheTime: Date.now(),
        klines: Object.fromEntries(klines),
      };
      
      const cacheFile = this.getCacheFilePath(stockCode);
      fs.writeFileSync(cacheFile, JSON.stringify(cacheData), 'utf-8');
      
      // 同时存入内存缓存
      this.memoryCache.set(stockCode, klines);
    } catch (error) {
      logger.debug(`保存缓存失败 ${stockCode}: ${(error as Error).message}`);
    }
  }

  /**
   * 获取股票K线数据（带缓存）
   * 优先从缓存获取，缓存没有或过期则从API获取
   */
  private async getKlineData(
    stockCode: string,
    totalDays: number = 60
  ): Promise<Map<string, KlineData>> {
    // 1. 尝试从缓存加载
    let klines = this.loadKlineFromCache(stockCode);
    
    // 2. 如果缓存为空或数据量不足，从API获取
    if (!klines || klines.size < totalDays * 0.7) {
      logger.debug(`从同花顺获取 ${stockCode} K线数据...`);
      klines = await this.fetchKlineFromTHS(stockCode, totalDays);
      
      if (klines.size > 0) {
        // 合并新旧数据
        const oldKlines = this.loadKlineFromCache(stockCode) || new Map();
        for (const [date, kline] of klines) {
          oldKlines.set(date, kline);
        }
        // 保存到缓存
        this.saveKlineToCache(stockCode, oldKlines);
        return oldKlines;
      }
    }
    
    return klines || new Map();
  }

  /**
   * 获取指定日期的K线数据
   */
  private async getKlineByDate(
    stockCode: string,
    dateStr: string
  ): Promise<KlineData | null> {
    const klines = await this.getKlineData(stockCode, 60);
    return klines.get(dateStr) || null;
  }

  /**
   * 获取指定日期范围的K线数据（按日期排序）
   */
  private async getKlineRange(
    stockCode: string,
    startDate: string,
    days: number
  ): Promise<KlineData[]> {
    const klines = await this.getKlineData(stockCode, 90);
    
    // 获取所有日期并排序
    const allDates = Array.from(klines.keys()).sort();
    
    // 找到起始日期的索引
    const startIdx = allDates.findIndex(d => d >= startDate);
    if (startIdx === -1) {
      return [];
    }
    
    // 获取指定天数的数据
    const result: KlineData[] = [];
    for (let i = startIdx; i < allDates.length && result.length < days; i++) {
      const kline = klines.get(allDates[i]);
      if (kline) {
        result.push(kline);
      }
    }
    
    return result;
  }

  /**
   * 使用问财获取股票在指定日期范围的历史价格
   * @param stockCode 股票代码
   * @param dates 需要查询的日期列表 YYYYMMDD[]
   */
  private async fetchPriceDataFromWencai(
    stockCode: string,
    dates: string[]
  ): Promise<Map<string, KlineData>> {
    const result = new Map<string, KlineData>();
    
    if (dates.length === 0) return result;
    
    try {
      // 构建问财查询
      const dateList = dates.join('，');
      const question = `${stockCode} ${dateList} 开盘价，收盘价，最高价，最低价`;
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
      
      const headers: Record<string, string> = {
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
      if (resData.status_code === 0 && resData.data?.answer?.[0]?.txt?.[0]?.content?.components) {
        const datas = resData.data.answer[0].txt[0].content.components[0]?.data?.datas || [];
        
        // 解析每条数据
        for (const item of datas) {
          // 遍历所有日期相关的字段
          for (const dateStr of dates) {
            const formattedDate = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
            const openKey = `开盘价[${formattedDate}]`;
            const closeKey = `收盘价[${formattedDate}]`;
            const highKey = `最高价[${formattedDate}]`;
            const lowKey = `最低价[${formattedDate}]`;
            
            // 也尝试其他格式
            const openVal = item[openKey] || item[`${dateStr}开盘价`] || item['开盘价'];
            const closeVal = item[closeKey] || item[`${dateStr}收盘价`] || item['收盘价'];
            const highVal = item[highKey] || item[`${dateStr}最高价`] || item['最高价'];
            const lowVal = item[lowKey] || item[`${dateStr}最低价`] || item['最低价'];
            
            if (openVal || closeVal) {
              result.set(dateStr, {
                date: dateStr,
                open: Number(openVal) || 0,
                close: Number(closeVal) || 0,
                high: Number(highVal) || 0,
                low: Number(lowVal) || 0,
                volume: 0,
                turnover: 0,
                changePercent: 0,
              });
            }
          }
        }
      }
      
      return result;
    } catch (error) {
      logger.debug(`问财获取 ${stockCode} 价格数据失败: ${(error as Error).message}`);
      return result;
    }
  }

  /**
   * 使用问财查询单只股票指定日期的价格数据
   */
  private async fetchDayPriceFromWencai(
    stockCode: string,
    dateStr: string
  ): Promise<KlineData | null> {
    try {
      const question = `${stockCode} ${dateStr}开盘价，${dateStr}收盘价，${dateStr}最高价，${dateStr}最低价`;
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
      
      const headers: Record<string, string> = {
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
        return null;
      }

      const datas = resData.data?.answer?.[0]?.txt?.[0]?.content?.components?.[0]?.data?.datas;
      if (!datas || datas.length === 0) {
        return null;
      }

      const item = datas[0];
      const open = Number(item['开盘价:不复权'] || item['开盘价'] || 0);
      const close = Number(item['收盘价:不复权'] || item['收盘价'] || 0);
      const high = Number(item['最高价:不复权'] || item['最高价'] || 0);
      const low = Number(item['最低价:不复权'] || item['最低价'] || 0);
      
      if (open <= 0 && close <= 0) {
        return null;
      }

      return {
        date: dateStr,
        open: open || close,  // 如果没有开盘价用收盘价
        close: close || open,
        high: high || Math.max(open, close),
        low: low || Math.min(open, close),
        volume: 0,
        turnover: 0,
        changePercent: 0,
      };
    } catch (error) {
      logger.debug(`问财获取 ${stockCode} ${dateStr} 价格失败: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * 获取股票多日价格数据（逐日查询）
   */
  private async fetchMultiDayPrices(
    stockCode: string,
    startDate: string,
    days: number
  ): Promise<KlineData[]> {
    const dateList = this.getNextTradingDays(startDate, days);
    const results: KlineData[] = [];
    
    for (const dateStr of dateList) {
      const kline = await this.fetchDayPriceFromWencai(stockCode, dateStr);
      if (kline) {
        results.push(kline);
      }
      // 小延迟避免请求过快
      await this.delay(200);
    }
    
    return results;
  }

  /**
   * 使用问财查询单只股票多日的价格数据（简化版）- 备用
   */
  private async fetchSimplePriceData(
    stockCode: string,
    startDate: string,
    days: number
  ): Promise<KlineData[]> {
    try {
      // 生成日期列表
      const dateList = this.getNextTradingDays(startDate, days);
      
      // 构建问财查询 - 查询每日收盘价、开盘价、最高最低
      const question = `${stockCode} ${startDate}到${dateList[dateList.length - 1] || startDate} 日K数据`;
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
      
      const headers: Record<string, string> = {
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
        return [];
      }

      // 尝试解析 K 线数据
      const answer = resData.data?.answer;
      if (!answer?.[0]?.txt?.[0]?.content?.components?.[0]?.data?.datas) {
        return [];
      }

      const datas = answer[0].txt[0].content.components[0].data.datas;
      const klines: KlineData[] = [];
      
      for (const item of datas) {
        // 解析日期字段
        const dateVal = item['日期'] || item['date'] || '';
        const dateStr = String(dateVal).replace(/-/g, '').slice(0, 8);
        
        if (dateStr.length === 8) {
          klines.push({
            date: dateStr,
            open: Number(item['开盘价'] || item['open'] || 0),
            close: Number(item['收盘价'] || item['close'] || 0),
            high: Number(item['最高价'] || item['high'] || 0),
            low: Number(item['最低价'] || item['low'] || 0),
            volume: Number(item['成交量'] || 0),
            turnover: Number(item['成交额'] || 0),
            changePercent: Number(item['涨跌幅'] || 0),
          });
        }
      }
      
      // 按日期排序
      klines.sort((a, b) => a.date.localeCompare(b.date));
      
      return klines;
    } catch (error) {
      logger.debug(`问财K线获取失败 ${stockCode}: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * 获取后续N个交易日
   */
  private getNextTradingDays(startDate: string, n: number): string[] {
    const result: string[] = [];
    let currentDate = parseDate(startDate);
    
    for (let i = 0; i < n; i++) {
      // 跳过周末
      while (currentDate.getDay() === 0 || currentDate.getDay() === 6) {
        currentDate = new Date(currentDate.getTime() + 24 * 60 * 60 * 1000);
      }
      result.push(formatDate(currentDate, 'YYYYMMDD'));
      currentDate = new Date(currentDate.getTime() + 24 * 60 * 60 * 1000);
    }
    
    return result;
  }

  /**
   * 获取股票历史K线（用于回测计算收益）- 已弃用
   */
  private async fetchKlineForBacktest(
    stockCode: string,
    startDate: string,
    endDate: string
  ): Promise<KlineData[]> {
    try {
      // 使用问财获取K线数据
      const question = `${stockCode} ${startDate}到${endDate}的日K线数据`;
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
      };

      const response = await axios.post(url, data, { headers, timeout: 15000 });
      
      // 解析K线数据（根据实际返回格式调整）
      const result = response.data;
      if (result.status_code === 0 && result.data?.answer?.[0]?.txt?.[0]?.content?.components) {
        const datas = result.data.answer[0].txt[0].content.components[0]?.data?.datas || [];
        return datas.map((item: any) => ({
          date: item['日期'] || item['date'],
          open: Number(item['开盘价'] || item['open']) || 0,
          high: Number(item['最高价'] || item['high']) || 0,
          low: Number(item['最低价'] || item['low']) || 0,
          close: Number(item['收盘价'] || item['close']) || 0,
          volume: Number(item['成交量'] || item['volume']) || 0,
          turnover: Number(item['成交额'] || item['turnover']) || 0,
          changePercent: Number(item['涨跌幅'] || item['changePercent']) || 0,
        }));
      }
      
      return [];
    } catch (error) {
      logger.debug(`获取 ${stockCode} K线失败: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * 使用东方财富API获取K线数据（更稳定）
   */
  private async fetchKlineFromEastMoney(
    stockCode: string,
    startDate: string,
    days: number = 30
  ): Promise<KlineData[]> {
    try {
      // 判断市场
      const market = stockCode.startsWith('6') ? '1' : '0';
      const secid = `${market}.${stockCode}`;
      
      const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get`;
      const params = {
        secid,
        fields1: 'f1,f2,f3,f4,f5,f6',
        fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61',
        klt: '101',  // 日K
        fqt: '1',    // 前复权
        beg: startDate,
        end: '20500101',
        lmt: days,
      };

      const response = await axios.get(url, { 
        params, 
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://quote.eastmoney.com/',
        }
      });
      
      const klines = response.data?.data?.klines || [];
      
      return klines.map((line: string) => {
        const parts = line.split(',');
        return {
          date: parts[0].replace(/-/g, ''),
          open: Number(parts[1]) || 0,
          close: Number(parts[2]) || 0,
          high: Number(parts[3]) || 0,
          low: Number(parts[4]) || 0,
          volume: Number(parts[5]) || 0,
          turnover: Number(parts[6]) || 0,
          changePercent: Number(parts[8]) || 0,
        };
      });
    } catch (error) {
      logger.debug(`东方财富K线获取失败 ${stockCode}: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * 获取前一个交易日
   */
  private getPreviousTradingDay(dateStr: string): string {
    const date = parseDate(dateStr);
    let prevDate = new Date(date.getTime() - 24 * 60 * 60 * 1000);
    while (prevDate.getDay() === 0 || prevDate.getDay() === 6) {
      prevDate = new Date(prevDate.getTime() - 24 * 60 * 60 * 1000);
    }
    return formatDate(prevDate, 'YYYYMMDD');
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
   * 执行单只股票的回测（使用缓存K线）
   */
  private async backtestSingleStock(
    stockCode: string,
    stockName: string,
    day3Date: string,  // 入场日
    config: BacktestConfig
  ): Promise<TradeRecord | null> {
    try {
      // 计算 day1, day2
      const [day2Date, day1Date] = this.getPreviousTradingDays(day3Date, 2);
      
      // 使用带缓存的同花顺K线API获取数据
      const klines = await this.getKlineRange(
        stockCode, 
        day3Date, 
        config.maxHoldDays + 5
      );
      
      if (klines.length === 0) {
        logger.debug(`${stockCode} 无法获取K线数据，跳过`);
        return null;
      }

      // 入场价格（Day3开盘价）
      const entryKline = klines[0];
      if (!entryKline) {
        logger.debug(`${stockCode} 无入场K线，跳过`);
        return null;
      }
      
      const entryPrice = entryKline.open;
      if (entryPrice <= 0) {
        return null;
      }

      // 计算止损价
      let stopLossPrice: number;
      if (config.useDay2LowAsStopLoss) {
        // 使用缓存的K线获取 Day2 的最低价
        const day2Kline = await this.getKlineByDate(stockCode, day2Date);
        const day2Low = day2Kline?.low || 0;
        // Day2 最低价下方 2%
        stopLossPrice = day2Low > 0 ? day2Low * 0.98 : entryPrice * (1 + config.stopLossPercent / 100);
      } else {
        stopLossPrice = entryPrice * (1 + config.stopLossPercent / 100);
      }
      
      // 止盈价
      const takeProfitPrice = entryPrice * (1 + config.takeProfitPercent / 100);

      // 遍历持仓期间的K线，检查止盈止损
      let exitDate = '';
      let exitPrice = 0;
      let exitReason: TradeRecord['exitReason'] = 'data_end';
      let holdDays = 0;

      for (let i = 0; i < klines.length && i < config.maxHoldDays; i++) {
        const kline = klines[i];
        holdDays = i + 1;

        // 检查是否触发止损（当日最低价跌破止损位）
        if (kline.low <= stopLossPrice) {
          exitDate = kline.date;
          exitPrice = stopLossPrice; // 假设以止损价成交
          exitReason = 'stop_loss';
          break;
        }

        // 检查是否触发止盈（当日最高价达到止盈位）
        if (kline.high >= takeProfitPrice) {
          exitDate = kline.date;
          exitPrice = takeProfitPrice; // 假设以止盈价成交
          exitReason = 'take_profit';
          break;
        }

        // 检查是否达到最大持仓天数
        if (i === config.maxHoldDays - 1) {
          exitDate = kline.date;
          exitPrice = kline.close; // 以收盘价卖出
          exitReason = 'max_days';
          break;
        }
      }

      // 如果遍历完还没退出，用最后一天收盘价
      if (!exitDate && klines.length > 0) {
        const lastKline = klines[klines.length - 1];
        exitDate = lastKline.date;
        exitPrice = lastKline.close;
        exitReason = 'data_end';
        holdDays = klines.length;
      }

      // 计算收益率
      const profitPercent = ((exitPrice - entryPrice) / entryPrice) * 100;

      return {
        stockCode,
        stockName,
        entryDate: day3Date,
        entryPrice,
        exitDate,
        exitPrice,
        holdDays,
        profitPercent: Number(profitPercent.toFixed(2)),
        exitReason,
        day1Date,
        day2Date,
      };
    } catch (error) {
      logger.debug(`回测 ${stockCode} 失败: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * 执行回测
   * @param startDate 回测开始日期 YYYYMMDD
   * @param endDate 回测结束日期 YYYYMMDD
   * @param config 回测配置
   */
  async runBacktest(
    startDate: string,
    endDate: string,
    config?: Partial<BacktestConfig>
  ): Promise<BacktestResult> {
    const finalConfig: BacktestConfig = { ...this.defaultConfig, ...config };
    
    logger.info(`开始回测: ${startDate} - ${endDate}`);
    logger.info(`回测配置: 止损=${finalConfig.stopLossPercent}%, 止盈=${finalConfig.takeProfitPercent}%, 最大持仓=${finalConfig.maxHoldDays}天`);

    // 获取回测期间的所有突破记录
    const startDateObj = parseDate(startDate);
    const endDateObj = parseDate(endDate);
    
    const breakthroughRecords = await PriceBreakthrough.find({
      date: { $gte: startDateObj, $lte: endDateObj }
    }).sort({ date: 1 }).lean();

    logger.info(`找到 ${breakthroughRecords.length} 条突破记录`);

    // 对每条记录执行回测
    const trades: TradeRecord[] = [];
    let processedCount = 0;

    for (const record of breakthroughRecords) {
      const day3Date = formatDate(record.date, 'YYYYMMDD');
      
      const trade = await this.backtestSingleStock(
        record.stockCode,
        record.stockName,
        day3Date,
        finalConfig
      );

      if (trade) {
        trades.push(trade);
      }

      processedCount++;
      if (processedCount % 10 === 0) {
        logger.info(`回测进度: ${processedCount}/${breakthroughRecords.length}`);
        // 添加小延迟避免请求过快
        await this.delay(500);
      }
    }

    // 计算统计数据
    const result = this.calculateStatistics(startDate, endDate, finalConfig, trades);
    
    logger.info(`回测完成: 总交易 ${result.totalTrades} 笔, 胜率 ${result.winRate.toFixed(1)}%, 平均收益 ${result.avgProfitPercent.toFixed(2)}%`);

    return result;
  }

  /**
   * 计算统计数据
   */
  private calculateStatistics(
    startDate: string,
    endDate: string,
    config: BacktestConfig,
    trades: TradeRecord[]
  ): BacktestResult {
    const totalTrades = trades.length;
    
    if (totalTrades === 0) {
      return {
        startDate,
        endDate,
        config,
        totalTrades: 0,
        winTrades: 0,
        lossTrades: 0,
        winRate: 0,
        totalProfitPercent: 0,
        avgProfitPercent: 0,
        avgWinPercent: 0,
        avgLossPercent: 0,
        profitLossRatio: 0,
        maxProfit: 0,
        maxLoss: 0,
        maxConsecutiveWins: 0,
        maxConsecutiveLosses: 0,
        avgHoldDays: 0,
        trades: [],
      };
    }

    // 盈亏统计
    const winTrades = trades.filter(t => t.profitPercent > 0);
    const lossTrades = trades.filter(t => t.profitPercent <= 0);
    
    const winRate = (winTrades.length / totalTrades) * 100;
    
    // 收益统计
    const totalProfitPercent = trades.reduce((sum, t) => sum + t.profitPercent, 0);
    const avgProfitPercent = totalProfitPercent / totalTrades;
    
    const avgWinPercent = winTrades.length > 0
      ? winTrades.reduce((sum, t) => sum + t.profitPercent, 0) / winTrades.length
      : 0;
    
    const avgLossPercent = lossTrades.length > 0
      ? lossTrades.reduce((sum, t) => sum + t.profitPercent, 0) / lossTrades.length
      : 0;
    
    const profitLossRatio = avgLossPercent !== 0 
      ? Math.abs(avgWinPercent / avgLossPercent) 
      : avgWinPercent > 0 ? Infinity : 0;

    // 极值
    const maxProfit = Math.max(...trades.map(t => t.profitPercent));
    const maxLoss = Math.min(...trades.map(t => t.profitPercent));

    // 连续盈亏
    let maxConsecutiveWins = 0;
    let maxConsecutiveLosses = 0;
    let currentWins = 0;
    let currentLosses = 0;

    for (const trade of trades) {
      if (trade.profitPercent > 0) {
        currentWins++;
        currentLosses = 0;
        maxConsecutiveWins = Math.max(maxConsecutiveWins, currentWins);
      } else {
        currentLosses++;
        currentWins = 0;
        maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentLosses);
      }
    }

    // 平均持仓天数
    const avgHoldDays = trades.reduce((sum, t) => sum + t.holdDays, 0) / totalTrades;

    return {
      startDate,
      endDate,
      config,
      totalTrades,
      winTrades: winTrades.length,
      lossTrades: lossTrades.length,
      winRate: Number(winRate.toFixed(2)),
      totalProfitPercent: Number(totalProfitPercent.toFixed(2)),
      avgProfitPercent: Number(avgProfitPercent.toFixed(2)),
      avgWinPercent: Number(avgWinPercent.toFixed(2)),
      avgLossPercent: Number(avgLossPercent.toFixed(2)),
      profitLossRatio: Number(profitLossRatio.toFixed(2)),
      maxProfit: Number(maxProfit.toFixed(2)),
      maxLoss: Number(maxLoss.toFixed(2)),
      maxConsecutiveWins,
      maxConsecutiveLosses,
      avgHoldDays: Number(avgHoldDays.toFixed(1)),
      trades,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 清除K线缓存
   */
  clearCache(): { message: string; clearedFiles: number } {
    try {
      // 清除内存缓存
      this.memoryCache.clear();
      
      // 清除文件缓存
      let clearedFiles = 0;
      if (fs.existsSync(this.cacheDir)) {
        const files = fs.readdirSync(this.cacheDir);
        for (const file of files) {
          if (file.endsWith('.json')) {
            fs.unlinkSync(path.join(this.cacheDir, file));
            clearedFiles++;
          }
        }
      }
      
      logger.info(`已清除 ${clearedFiles} 个K线缓存文件`);
      return { message: '缓存已清除', clearedFiles };
    } catch (error) {
      logger.error(`清除缓存失败: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * 获取缓存统计信息
   */
  getCacheStats(): { memoryCount: number; fileCount: number; totalSize: string } {
    try {
      const memoryCount = this.memoryCache.size;
      let fileCount = 0;
      let totalBytes = 0;
      
      if (fs.existsSync(this.cacheDir)) {
        const files = fs.readdirSync(this.cacheDir);
        for (const file of files) {
          if (file.endsWith('.json')) {
            fileCount++;
            const filePath = path.join(this.cacheDir, file);
            const stats = fs.statSync(filePath);
            totalBytes += stats.size;
          }
        }
      }
      
      // 格式化大小
      let totalSize: string;
      if (totalBytes < 1024) {
        totalSize = `${totalBytes} B`;
      } else if (totalBytes < 1024 * 1024) {
        totalSize = `${(totalBytes / 1024).toFixed(2)} KB`;
      } else {
        totalSize = `${(totalBytes / 1024 / 1024).toFixed(2)} MB`;
      }
      
      return { memoryCount, fileCount, totalSize };
    } catch (error) {
      return { memoryCount: 0, fileCount: 0, totalSize: '0 B' };
    }
  }
}

export const backtestService = new BacktestService();
