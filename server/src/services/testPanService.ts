import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils';
import { tradingCalendarService } from './tradingCalendarService';
import { klineCacheService } from './klineCacheService';
import {
  TestPanPattern,
  TestPanPatternNames,
  TestPanSignal,
  TestPanConfig,
  DEFAULT_TEST_PAN_CONFIG,
  TestPanBacktestConfig,
  DEFAULT_BACKTEST_CONFIG,
  OPTIMIZED_BACKTEST_CONFIG,
  TestPanBacktestResult,
  TestPanTradeRecord,
  DailyTestPanSignals,
  WencaiCandidate,
  KlineData,
  EntryMode,
  StopLossMode,
} from '../types/testPan';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const thsUtils = require('../utils/thsUtils');

// 大盘情绪数据结构
interface MarketMoodData {
  day: string;
  strong: number;
  ztjs: number;
  lbgd: number;
  dfNum: number;
}

interface MarketMoodCache {
  updatedAt: string;
  data: MarketMoodData[];
}

/**
 * 试盘检测与回测服务
 */
export class TestPanService {
  private config: TestPanConfig;
  private cacheDir: string;
  private signalDir: string;
  private backtestDir: string;
  private marketMoodCache: Map<string, MarketMoodData> = new Map();

  constructor(config?: Partial<TestPanConfig>) {
    this.config = { ...DEFAULT_TEST_PAN_CONFIG, ...config };
    this.cacheDir = path.join(__dirname, '../../data/testpan_cache');
    this.signalDir = path.join(this.cacheDir, 'signals');
    this.backtestDir = path.join(this.cacheDir, 'backtest');
    
    // 确保目录存在
    [this.cacheDir, this.signalDir, this.backtestDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });

    // 加载大盘情绪数据
    this.loadMarketMoodData();
  }

  /**
   * 加载大盘情绪数据
   */
  private loadMarketMoodData(): void {
    try {
      const moodFilePath = path.join(__dirname, '../../data/market_mood.json');
      if (fs.existsSync(moodFilePath)) {
        const moodData: MarketMoodCache = JSON.parse(fs.readFileSync(moodFilePath, 'utf-8'));
        for (const item of moodData.data) {
          this.marketMoodCache.set(item.day, item);
        }
        logger.info(`[试盘服务] 已加载 ${this.marketMoodCache.size} 条大盘情绪数据`);
      }
    } catch (error) {
      logger.warn(`加载大盘情绪数据失败: ${(error as Error).message}`);
    }
  }

  /**
   * 获取指定日期的大盘情绪
   */
  private getMarketMood(dateStr: string): MarketMoodData | null {
    return this.marketMoodCache.get(dateStr) || null;
  }

  // ===================== 问财相关 =====================

  private getHexinV(): string {
    try {
      return thsUtils.update();
    } catch (error) {
      logger.warn('生成 Hexin-V 失败，使用默认值');
      return 'Ax8Ssngzh0M9kINf4Czhe-DDqnmphHMgjdx3GrFqu4gVdzBiuVQDdp2oB0_C';
    }
  }

  /**
   * 通用问财查询
   */
  private async queryWencai(question: string): Promise<any[]> {
    const url = 'http://www.iwencai.com/customized/chart/get-robot-data';
    const hexinV = this.getHexinV();

    const data: Record<string, string | number> = {
      question,
      perpage: 200,
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

    try {
      const response = await axios.post(url, data, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'hexin-v': hexinV,
        },
        timeout: 30000,
      });

      // 问财接口响应结构
      const components = response.data?.data?.answer?.[0]?.txt?.[0]?.content?.components || [];

      for (const comp of components) {
        if (comp?.data?.datas && Array.isArray(comp.data.datas) && comp.data.datas.length > 0) {
          logger.debug(`问财返回 ${comp.data.datas.length} 条数据`);
          return comp.data.datas;
        }
      }

      logger.warn('问财未返回有效数据');
      return [];
    } catch (error) {
      logger.error(`问财API调用失败: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * 根据试盘模式生成问财查询语句
   */
  private buildWencaiQuestion(dateStr: string, pattern: TestPanPattern): string {
    const date = this.formatDateForWencai(dateStr);
    const prevDate = this.getPrevTradingDateForWencai(dateStr);
    const baseFilter = `非ST，非北交所，${date}成交额>5亿，${date}换手率>3%且<25%`;

    switch (pattern) {
      case TestPanPattern.UPPER_SHADOW:
        // 长上影线：振幅大、涨跌幅小
        return `${date}振幅>5%，${date}涨跌幅>-3%且<3%，${baseFilter}`;

      case TestPanPattern.LOWER_SHADOW:
        // 长下影线：下影线长
        return `${date}下影线>3%，${date}涨跌幅>-3%，${baseFilter}`;

      case TestPanPattern.WIDE_SHOCK:
        // 宽幅震荡：振幅大
        return `${date}振幅>8%，${date}涨跌幅>-5%且<5%，${baseFilter}`;

      case TestPanPattern.LIMIT_UP_OPEN:
        // 涨停开板：曾涨停但未封住
        return `${date}曾涨停，${date}非涨停，${date}涨跌幅>5%，${baseFilter}`;

      default:
        return `${date}振幅>5%，${baseFilter}`;
    }
  }

  /**
   * 问财粗筛：获取候选股票列表
   */
  async fetchCandidatesByWencai(dateStr: string, pattern: TestPanPattern): Promise<WencaiCandidate[]> {
    const question = this.buildWencaiQuestion(dateStr, pattern);
    logger.info(`[试盘检测] 问财查询 ${TestPanPatternNames[pattern]}: ${question}`);

    const result = await this.queryWencai(question);
    const candidates: WencaiCandidate[] = [];

    for (const item of result) {
      const code = String(item.code || item['股票代码'] || '').replace(/[^0-9]/g, '');
      if (code.length !== 6) continue;

      // 过滤北交所
      if (code.startsWith('8') || code.startsWith('4')) continue;

      candidates.push({
        stockCode: code,
        stockName: item['股票简称'] || item.name || '',
        changePercent: this.parseNumber(item[`涨跌幅:前复权[${this.formatDateForWencai(dateStr)}]`] || item['涨跌幅']),
        amplitude: this.parseNumber(item[`振幅[${this.formatDateForWencai(dateStr)}]`] || item['振幅']),
        turnoverRate: this.parseNumber(item[`换手率[${this.formatDateForWencai(dateStr)}]`] || item['换手率']),
        amount: this.parseNumber(item[`成交额[${this.formatDateForWencai(dateStr)}]`] || item['成交额']),
      });
    }

    logger.info(`[试盘检测] ${TestPanPatternNames[pattern]} 问财粗筛得到 ${candidates.length} 只候选股`);
    return candidates;
  }

  // ===================== K线精筛 =====================

  /**
   * K线精筛：确认是否符合试盘模式
   */
  async confirmTestPanPattern(
    stockCode: string,
    stockName: string,
    dateStr: string,
    pattern: TestPanPattern
  ): Promise<TestPanSignal | null> {
    try {
      // 获取K线数据（包含当日和前一日）
      const klines = await this.getKlinesForAnalysis(stockCode, dateStr, 5);
      if (klines.length < 2) {
        logger.debug(`[试盘检测] ${stockCode} K线数据不足`);
        return null;
      }

      // 找到目标日和前一日
      const targetIdx = klines.findIndex(k => k.date === dateStr);
      if (targetIdx < 1) {
        logger.debug(`[试盘检测] ${stockCode} 未找到目标日 ${dateStr} 或前一日数据`);
        return null;
      }

      const current = klines[targetIdx];
      const prev = klines[targetIdx - 1];

      // 计算K线特征
      const body = Math.abs(current.open - current.close);
      const upperShadow = current.high - Math.max(current.open, current.close);
      const lowerShadow = Math.min(current.open, current.close) - current.low;
      const amplitude = prev.close > 0 ? ((current.high - current.low) / prev.close) * 100 : 0;
      const changePercent = prev.close > 0 ? ((current.close - prev.close) / prev.close) * 100 : 0;
      const volumeRatio = prev.volume > 0 ? current.volume / prev.volume : 1;

      // 根据模式验证
      let isValid = false;
      let upperShadowRatio = 0;
      let lowerShadowRatio = 0;

      switch (pattern) {
        case TestPanPattern.UPPER_SHADOW:
          upperShadowRatio = body > 0.001 ? upperShadow / body : 0;
          isValid = this.validateUpperShadowPattern(current, prev, upperShadowRatio, volumeRatio);
          break;

        case TestPanPattern.LOWER_SHADOW:
          lowerShadowRatio = body > 0.001 ? lowerShadow / body : 0;
          isValid = this.validateLowerShadowPattern(current, prev, lowerShadowRatio, volumeRatio);
          break;

        case TestPanPattern.WIDE_SHOCK:
          isValid = this.validateWideShockPattern(current, prev, amplitude, volumeRatio);
          break;

        case TestPanPattern.LIMIT_UP_OPEN:
          isValid = this.validateLimitUpOpenPattern(current, prev, stockCode);
          break;
      }

      if (!isValid) {
        return null;
      }

      // 构建信号
      const signal: TestPanSignal = {
        stockCode,
        stockName,
        date: dateStr,
        pattern,
        patternName: TestPanPatternNames[pattern],
        open: current.open,
        high: current.high,
        low: current.low,
        close: current.close,
        volume: current.volume,
        turnover: current.turnover,
        amplitude,
        changePercent,
        turnoverRate: current.turnoverRate || 0,
        upperShadowRatio,
        lowerShadowRatio,
        volumeRatio,
      };

      return signal;
    } catch (error) {
      logger.error(`[试盘检测] ${stockCode} 确认模式失败: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * 验证长上影线模式
   */
  private validateUpperShadowPattern(
    current: KlineData,
    prev: KlineData,
    upperShadowRatio: number,
    volumeRatio: number
  ): boolean {
    const cfg = this.config;
    const changePercent = prev.close > 0 ? Math.abs((current.close - prev.close) / prev.close) : 0;

    // 调试信息
    const checks = {
      upperShadowRatio: upperShadowRatio >= cfg.upperShadowRatio,
      highBreak: current.high >= prev.high * cfg.upperHighBreakRatio,
      changePercent: changePercent <= cfg.upperCloseRange,
      volumeRatio: volumeRatio >= cfg.upperVolumeRatio,
      turnover: current.turnover >= cfg.minAmount,
    };

    const isValid = Object.values(checks).every(v => v);
    
    if (!isValid) {
      logger.debug(`[长上影验证] 上影比:${upperShadowRatio.toFixed(2)}(${checks.upperShadowRatio ? '✓' : '✗'}) ` +
        `冲高:${(current.high/prev.high).toFixed(3)}(${checks.highBreak ? '✓' : '✗'}) ` +
        `涨跌幅:${(changePercent*100).toFixed(2)}%(${checks.changePercent ? '✓' : '✗'}) ` +
        `量比:${volumeRatio.toFixed(2)}(${checks.volumeRatio ? '✓' : '✗'}) ` +
        `成交额:${(current.turnover/1e8).toFixed(2)}亿(${checks.turnover ? '✓' : '✗'})`);
    }

    return isValid;
  }

  /**
   * 验证长下影线模式
   */
  private validateLowerShadowPattern(
    current: KlineData,
    prev: KlineData,
    lowerShadowRatio: number,
    volumeRatio: number
  ): boolean {
    const cfg = this.config;
    const closePos = current.close >= current.open ? 1 : current.close / Math.max(current.open, 0.01);

    return (
      lowerShadowRatio >= cfg.lowerShadowRatio &&                    // 下影线/实体 >= 2
      current.low <= prev.low * cfg.lowerLowBreakRatio &&            // 砸盘 >= 3%
      closePos >= 0.95 &&                                            // 快速拉回（收盘接近实体顶部）
      volumeRatio >= cfg.lowerVolumeRatio &&                         // 放量 >= 20%
      current.turnover >= cfg.minAmount                              // 成交额 >= 5亿
    );
  }

  /**
   * 验证宽幅震荡模式
   */
  private validateWideShockPattern(
    current: KlineData,
    prev: KlineData,
    amplitude: number,
    volumeRatio: number
  ): boolean {
    const cfg = this.config;
    // 震荡中枢
    const center = (current.high + current.low) / 2;
    const centerDeviation = center > 0 ? Math.abs(current.close - center) / center : 0;

    return (
      amplitude >= cfg.shockAmplitude &&                             // 振幅 >= 8%
      current.high >= prev.high * cfg.shockHighBreakRatio &&         // 冲高 >= 3%
      current.low <= prev.low * cfg.shockLowBreakRatio &&            // 砸盘 >= 3%
      centerDeviation <= cfg.shockCenterRange &&                     // 收盘在震荡中枢附近
      volumeRatio >= cfg.shockVolumeRatio &&                         // 放量 >= 50%
      current.turnover >= cfg.minAmount                              // 成交额 >= 5亿
    );
  }

  /**
   * 验证涨停开板模式
   */
  private validateLimitUpOpenPattern(
    current: KlineData,
    prev: KlineData,
    stockCode: string
  ): boolean {
    const cfg = this.config;
    // 判断涨停倍率
    const limitRatio = this.getLimitUpRatio(stockCode);
    const limitPrice = prev.close * limitRatio;
    const changePercent = prev.close > 0 ? ((current.close - prev.close) / prev.close) * 100 : 0;

    return (
      current.high >= limitPrice * 0.995 &&                          // 最高价触及涨停
      current.close < limitPrice * 0.995 &&                          // 收盘未封住涨停
      changePercent >= cfg.limitUpMinChange &&                       // 涨幅 >= 5%
      current.turnover >= cfg.minAmount                              // 成交额 >= 5亿
    );
  }

  /**
   * 获取涨停倍率
   */
  private getLimitUpRatio(stockCode: string): number {
    if (stockCode.startsWith('30') || stockCode.startsWith('68')) {
      return 1.2; // 创业板/科创板 20%
    } else if (stockCode.startsWith('920')) {
      return 1.3; // 北交所 30%
    }
    return 1.1; // 主板 10%
  }

  // ===================== 突破确认 =====================

  /**
   * 检查试盘后是否突破成功
   * @param signal 试盘信号
   * @param breakoutDays 突破确认天数
   */
  async checkBreakoutStatus(signal: TestPanSignal, breakoutDays: number = 5): Promise<TestPanSignal> {
    try {
      // 获取试盘日之后的K线
      const futureKlines = await this.getKlinesAfterDate(signal.stockCode, signal.date, breakoutDays + 1);
      
      if (futureKlines.length === 0) {
        return signal;
      }

      // 检查是否突破试盘高点
      for (const kline of futureKlines) {
        if (kline.high >= signal.high) {
          signal.breakoutConfirmed = true;
          signal.breakoutDate = kline.date;
          signal.breakoutPrice = kline.close;
          break;
        }
      }

      if (!signal.breakoutConfirmed) {
        signal.breakoutConfirmed = false;
      }

      return signal;
    } catch (error) {
      logger.error(`[试盘检测] 检查突破状态失败 ${signal.stockCode}: ${(error as Error).message}`);
      return signal;
    }
  }

  // ===================== 每日检测 =====================

  /**
   * 检测指定日期的所有试盘信号
   */
  async detectDailySignals(dateStr: string, patterns?: TestPanPattern[]): Promise<TestPanSignal[]> {
    const normalizedDate = dateStr.replace(/[-/]/g, '');
    const targetPatterns = patterns || Object.values(TestPanPattern);
    const allSignals: TestPanSignal[] = [];

    logger.info(`[试盘检测] 开始检测 ${normalizedDate} 的试盘信号，模式: ${targetPatterns.join(', ')}`);

    for (const pattern of targetPatterns) {
      try {
        // 1. 问财粗筛
        const candidates = await this.fetchCandidatesByWencai(normalizedDate, pattern);
        
        // 添加延迟避免问财限流
        await this.delay(2000);

        // 2. K线精筛
        let confirmedCount = 0;
        for (const candidate of candidates) {
          const signal = await this.confirmTestPanPattern(
            candidate.stockCode,
            candidate.stockName,
            normalizedDate,
            pattern
          );

          if (signal) {
            // 3. 检查突破状态
            const signalWithBreakout = await this.checkBreakoutStatus(signal);
            allSignals.push(signalWithBreakout);
            confirmedCount++;
          }

          // 控制请求频率
          await this.delay(100);
        }

        logger.info(`[试盘检测] ${TestPanPatternNames[pattern]} 确认 ${confirmedCount}/${candidates.length} 只`);
      } catch (error) {
        logger.error(`[试盘检测] ${pattern} 检测失败: ${(error as Error).message}`);
      }
    }

    // 4. 保存到本地文件
    if (allSignals.length > 0) {
      await this.saveDailySignals(normalizedDate, allSignals);
    }

    logger.info(`[试盘检测] ${normalizedDate} 共检测到 ${allSignals.length} 个试盘信号`);
    return allSignals;
  }

  // ===================== 回测 =====================

  /**
   * 执行回测
   */
  async backtest(
    pattern: TestPanPattern,
    startDate: string,
    endDate: string,
    config?: Partial<TestPanBacktestConfig>
  ): Promise<TestPanBacktestResult> {
    const backtestConfig = { ...DEFAULT_BACKTEST_CONFIG, ...config };
    const normalizedStart = startDate.replace(/[-/]/g, '');
    const normalizedEnd = endDate.replace(/[-/]/g, '');

    logger.info(`[回测] 开始回测 ${TestPanPatternNames[pattern]}，范围: ${normalizedStart} - ${normalizedEnd}`);

    // 获取交易日列表
    const tradingDays = this.getTradingDaysBetween(normalizedStart, normalizedEnd);
    logger.info(`[回测] 共 ${tradingDays.length} 个交易日`);

    const allTrades: TestPanTradeRecord[] = [];
    let totalSignals = 0;
    let breakoutCount = 0;

    for (const dateStr of tradingDays) {
      try {
        // 加载或检测当日信号
        let signals = await this.loadDailySignals(dateStr);
        
        if (!signals || signals.length === 0) {
          // 如果没有缓存，执行检测
          signals = await this.detectDailySignals(dateStr, [pattern]);
          await this.delay(3000); // 控制请求频率
        }

        // 筛选当前模式的信号
        const patternSignals = signals.filter(s => s.pattern === pattern);
        totalSignals += patternSignals.length;

        // 处理每个信号
        for (const signal of patternSignals) {
          // 检查突破
          if (!signal.breakoutConfirmed) {
            const checkedSignal = await this.checkBreakoutStatus(signal, backtestConfig.breakoutDays);
            if (!checkedSignal.breakoutConfirmed) {
              continue;
            }
            Object.assign(signal, checkedSignal);
          }

          breakoutCount++;

          // 执行交易模拟
          const trade = await this.simulateTrade(signal, backtestConfig);
          if (trade) {
            allTrades.push(trade);
          }
        }
      } catch (error) {
        logger.warn(`[回测] ${dateStr} 处理失败: ${(error as Error).message}`);
      }
    }

    // 计算统计数据
    const result = this.calculateBacktestResult(pattern, normalizedStart, normalizedEnd, backtestConfig, allTrades, totalSignals, breakoutCount);

    // 保存回测结果
    await this.saveBacktestResult(result);

    return result;
  }

  /**
   * 模拟单笔交易（优化版）
   */
  private async simulateTrade(
    signal: TestPanSignal,
    config: TestPanBacktestConfig
  ): Promise<TestPanTradeRecord | null> {
    if (!signal.breakoutDate || !signal.breakoutPrice) {
      return null;
    }

    try {
      // 🆕 过滤条件检查
      if (!await this.passFilterConditions(signal, config)) {
        return null;
      }

      // 获取突破日之后的K线（多取几天用于次日买入）
      const futureKlines = await this.getKlinesAfterDate(signal.stockCode, signal.breakoutDate, config.holdDays + 5);
      
      if (futureKlines.length === 0) {
        return null;
      }

      // 🆕 根据入场方式确定入场价和入场日
      const entryInfo = this.determineEntry(signal, futureKlines, config);
      if (!entryInfo) {
        return null; // 无法入场
      }

      const { entryPrice, entryDate, entryIdx } = entryInfo;

      // 🆕 根据止损方式确定止损价
      const stopLossPrice = this.determineStopLossPrice(signal, entryPrice, config);

      let exitPrice = entryPrice;
      let exitDate = entryDate;
      let exitReason: TestPanTradeRecord['exitReason'] = 'data_end';
      let holdDays = 0;
      let trailingStopActive = false;  // 🆕 移动止盈是否已激活
      let currentStopLoss = stopLossPrice;  // 🆕 当前止损价（可能被移动止盈修改）

      // 遍历持有期间的K线（从入场日之后开始）
      const holdStartIdx = entryIdx + 1;
      for (let i = holdStartIdx; i < futureKlines.length && holdDays < config.holdDays; i++) {
        const kline = futureKlines[i];
        holdDays++;

        // 🆕 检查移动止盈
        if (config.trailingStopTrigger && !trailingStopActive) {
          const currentReturn = (kline.high - entryPrice) / entryPrice;
          if (currentReturn >= config.trailingStopTrigger) {
            trailingStopActive = true;
            if (config.trailingStopToBreakeven) {
              currentStopLoss = entryPrice; // 移动止损到成本价
              logger.debug(`[回测] ${signal.stockCode} 盈利${(currentReturn * 100).toFixed(1)}%，止损移至成本价`);
            }
          }
        }

        // 检查止损（使用当前止损价）
        if (kline.low <= currentStopLoss) {
          exitPrice = currentStopLoss * 0.99; // 略低于止损价（滑点）
          exitDate = kline.date;
          exitReason = 'stop_loss';
          break;
        }

        // 检查止盈
        if (config.takeProfitRatio) {
          const highReturn = (kline.high - entryPrice) / entryPrice;
          if (highReturn >= config.takeProfitRatio) {
            exitPrice = entryPrice * (1 + config.takeProfitRatio);
            exitDate = kline.date;
            exitReason = 'take_profit';
            break;
          }
        }

        // 最后一天或数据结束
        if (holdDays >= config.holdDays || i === futureKlines.length - 1) {
          exitPrice = kline.close;
          exitDate = kline.date;
          exitReason = holdDays >= config.holdDays ? 'max_days' : 'data_end';
        }
      }

      const returnRate = (exitPrice - entryPrice) / entryPrice;

      return {
        stockCode: signal.stockCode,
        stockName: signal.stockName,
        pattern: signal.pattern,
        patternName: signal.patternName,
        testPanDate: signal.date,
        breakoutDate: entryDate, // 使用实际入场日
        entryPrice,
        exitDate,
        exitPrice,
        holdDays,
        returnRate,
        exitReason,
      };
    } catch (error) {
      logger.error(`[回测] 模拟交易失败 ${signal.stockCode}: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * 🆕 检查是否通过过滤条件
   */
  private async passFilterConditions(signal: TestPanSignal, config: TestPanBacktestConfig): Promise<boolean> {
    // 1. 大盘情绪过滤
    if (config.minMarketMood) {
      const mood = this.getMarketMood(signal.date);
      if (!mood || mood.strong < config.minMarketMood) {
        logger.debug(`[回测过滤] ${signal.stockCode} 大盘情绪不足: ${mood?.strong || 'N/A'} < ${config.minMarketMood}`);
        return false;
      }
    }

    // 2. 成交额过滤
    if (config.minAmount && signal.turnover < config.minAmount) {
      logger.debug(`[回测过滤] ${signal.stockCode} 成交额不足: ${(signal.turnover / 1e8).toFixed(2)}亿 < ${config.minAmount / 1e8}亿`);
      return false;
    }

    // 3. 近期涨幅过滤（排除追高）
    if (config.maxRecentGain) {
      const recentGain = await this.calculateRecentGain(signal.stockCode, signal.date, 10);
      if (recentGain !== null && recentGain > config.maxRecentGain) {
        logger.debug(`[回测过滤] ${signal.stockCode} 近期涨幅过大: ${(recentGain * 100).toFixed(1)}% > ${config.maxRecentGain * 100}%`);
        return false;
      }
    }

    // 4. 均线过滤
    if (config.requireAboveMA5) {
      const isAboveMA5 = await this.checkAboveMA5(signal.stockCode, signal.date);
      if (!isAboveMA5) {
        logger.debug(`[回测过滤] ${signal.stockCode} 未站上5日均线`);
        return false;
      }
    }

    return true;
  }

  /**
   * 🆕 根据入场方式确定入场价和入场日
   */
  private determineEntry(
    signal: TestPanSignal,
    futureKlines: KlineData[],
    config: TestPanBacktestConfig
  ): { entryPrice: number; entryDate: string; entryIdx: number } | null {
    
    switch (config.entryMode) {
      case EntryMode.BREAKOUT_CLOSE:
        // 原策略：突破日收盘价买入
        return {
          entryPrice: signal.breakoutPrice!,
          entryDate: signal.breakoutDate!,
          entryIdx: -1, // 从第0个开始持有
        };

      case EntryMode.NEXT_DAY_LOW:
        // 优化1：突破次日低开买入
        if (futureKlines.length < 1) return null;
        const nextDayKline = futureKlines[0];
        
        // 次日低开条件：开盘价 < 昨收（突破日收盘价）
        if (nextDayKline.open < signal.breakoutPrice!) {
          return {
            entryPrice: nextDayKline.open,
            entryDate: nextDayKline.date,
            entryIdx: 0,
          };
        } else {
          // 如果次日没有低开，尝试在盘中找到低于昨收的价位
          if (nextDayKline.low < signal.breakoutPrice!) {
            return {
              entryPrice: signal.breakoutPrice! * 0.99, // 假设能买到略低于昨收的价格
              entryDate: nextDayKline.date,
              entryIdx: 0,
            };
          }
          // 次日没有低开机会，跳过
          logger.debug(`[回测] ${signal.stockCode} 突破次日未低开，跳过`);
          return null;
        }

      case EntryMode.PULLBACK_HIGH:
        // 优化2：回踩试盘高点买入
        const testPanHigh = signal.high;
        
        // 在未来几天内寻找回踩试盘高点的机会
        for (let i = 0; i < Math.min(futureKlines.length, 3); i++) {
          const kline = futureKlines[i];
          // 回踩条件：最低价接近或略低于试盘高点，但收盘站稳
          if (kline.low <= testPanHigh * 1.01 && kline.close >= testPanHigh * 0.98) {
            return {
              entryPrice: testPanHigh,
              entryDate: kline.date,
              entryIdx: i,
            };
          }
        }
        
        // 没有找到回踩机会
        logger.debug(`[回测] ${signal.stockCode} 未找到回踩试盘高点的机会`);
        return null;

      default:
        return {
          entryPrice: signal.breakoutPrice!,
          entryDate: signal.breakoutDate!,
          entryIdx: -1,
        };
    }
  }

  /**
   * 🆕 根据止损方式确定止损价
   */
  private determineStopLossPrice(
    signal: TestPanSignal,
    entryPrice: number,
    config: TestPanBacktestConfig
  ): number {
    switch (config.stopLossMode) {
      case StopLossMode.TEST_PAN_LOW:
        // 优化：试盘日最低价作为止损位
        const testPanLow = signal.low;
        // 止损位设为试盘日最低价下方1%（给一点缓冲）
        return testPanLow * 0.99;

      case StopLossMode.FIXED_RATIO:
      default:
        // 原策略：固定比例止损
        return entryPrice * (1 + config.stopLossRatio);
    }
  }

  /**
   * 🆕 计算近期涨幅
   */
  private async calculateRecentGain(stockCode: string, dateStr: string, days: number): Promise<number | null> {
    try {
      const klines = await this.getKlinesForAnalysis(stockCode, dateStr, days + 1);
      if (klines.length < 2) return null;

      const targetIdx = klines.findIndex(k => k.date === dateStr);
      if (targetIdx < days) return null;

      const startPrice = klines[targetIdx - days]?.close;
      const endPrice = klines[targetIdx]?.close;

      if (!startPrice || !endPrice) return null;
      return (endPrice - startPrice) / startPrice;
    } catch {
      return null;
    }
  }

  /**
   * 🆕 检查是否站上5日均线
   */
  private async checkAboveMA5(stockCode: string, dateStr: string): Promise<boolean> {
    try {
      const klines = await this.getKlinesForAnalysis(stockCode, dateStr, 10);
      if (klines.length < 5) return true; // 数据不足时默认通过

      const targetIdx = klines.findIndex(k => k.date === dateStr);
      if (targetIdx < 4) return true;

      // 计算5日均线
      let sum = 0;
      for (let i = targetIdx - 4; i <= targetIdx; i++) {
        sum += klines[i].close;
      }
      const ma5 = sum / 5;

      return klines[targetIdx].close >= ma5;
    } catch {
      return true; // 出错时默认通过
    }
  }

  /**
   * 计算回测结果统计
   */
  private calculateBacktestResult(
    pattern: TestPanPattern,
    startDate: string,
    endDate: string,
    config: TestPanBacktestConfig,
    trades: TestPanTradeRecord[],
    totalSignals: number,
    breakoutCount: number
  ): TestPanBacktestResult {
    const winTrades = trades.filter(t => t.returnRate > 0);
    const lossTrades = trades.filter(t => t.returnRate <= 0);

    const totalReturn = trades.reduce((sum, t) => sum + t.returnRate, 0);
    const avgReturn = trades.length > 0 ? totalReturn / trades.length : 0;
    const avgWinReturn = winTrades.length > 0
      ? winTrades.reduce((sum, t) => sum + t.returnRate, 0) / winTrades.length
      : 0;
    const avgLossReturn = lossTrades.length > 0
      ? lossTrades.reduce((sum, t) => sum + t.returnRate, 0) / lossTrades.length
      : 0;

    const maxReturn = trades.length > 0 ? Math.max(...trades.map(t => t.returnRate)) : 0;
    const maxLoss = trades.length > 0 ? Math.min(...trades.map(t => t.returnRate)) : 0;

    const profitLossRatio = avgLossReturn !== 0 ? Math.abs(avgWinReturn / avgLossReturn) : 0;

    return {
      pattern,
      patternName: TestPanPatternNames[pattern],
      startDate,
      endDate,
      config,
      totalSignals,
      breakoutCount,
      breakoutRate: totalSignals > 0 ? breakoutCount / totalSignals : 0,
      totalTrades: trades.length,
      winTrades: winTrades.length,
      lossTrades: lossTrades.length,
      winRate: trades.length > 0 ? winTrades.length / trades.length : 0,
      totalReturn,
      avgReturn,
      avgWinReturn,
      avgLossReturn,
      maxReturn,
      maxLoss,
      profitLossRatio,
      trades,
    };
  }

  // ===================== 文件存储 =====================

  /**
   * 保存每日试盘信号
   */
  async saveDailySignals(dateStr: string, signals: TestPanSignal[]): Promise<void> {
    const filePath = path.join(this.signalDir, `${dateStr}.json`);
    const data: DailyTestPanSignals = {
      date: dateStr,
      updateTime: new Date().toISOString(),
      signals,
    };

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    logger.info(`[试盘检测] 已保存 ${signals.length} 个信号到 ${filePath}`);
  }

  /**
   * 加载每日试盘信号
   */
  async loadDailySignals(dateStr: string): Promise<TestPanSignal[]> {
    const filePath = path.join(this.signalDir, `${dateStr}.json`);
    
    if (!fs.existsSync(filePath)) {
      return [];
    }

    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as DailyTestPanSignals;
      return data.signals || [];
    } catch (error) {
      logger.warn(`加载试盘信号失败 ${dateStr}: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * 保存回测结果
   */
  async saveBacktestResult(result: TestPanBacktestResult): Promise<void> {
    const fileName = `${result.pattern}_${result.startDate}_${result.endDate}.json`;
    const filePath = path.join(this.backtestDir, fileName);

    fs.writeFileSync(filePath, JSON.stringify(result, null, 2), 'utf-8');
    logger.info(`[回测] 结果已保存到 ${filePath}`);

    // 同时导出CSV便于分析
    await this.exportBacktestToCSV(result);
  }

  /**
   * 导出回测结果为CSV
   */
  async exportBacktestToCSV(result: TestPanBacktestResult): Promise<void> {
    const fileName = `${result.pattern}_${result.startDate}_${result.endDate}.csv`;
    const filePath = path.join(this.backtestDir, fileName);

    const headers = [
      '股票代码', '股票名称', '试盘模式', '试盘日', '突破日',
      '入场价', '出场日', '出场价', '持有天数', '收益率', '出场原因'
    ];

    const rows = result.trades.map(t => [
      t.stockCode,
      t.stockName,
      t.patternName,
      t.testPanDate,
      t.breakoutDate,
      t.entryPrice.toFixed(2),
      t.exitDate,
      t.exitPrice.toFixed(2),
      t.holdDays,
      (t.returnRate * 100).toFixed(2) + '%',
      t.exitReason,
    ]);

    // 添加汇总信息
    const summary = [
      '',
      '===== 回测汇总 =====',
      `总信号数,${result.totalSignals}`,
      `突破成功数,${result.breakoutCount}`,
      `突破率,${(result.breakoutRate * 100).toFixed(2)}%`,
      `总交易数,${result.totalTrades}`,
      `胜率,${(result.winRate * 100).toFixed(2)}%`,
      `总收益率,${(result.totalReturn * 100).toFixed(2)}%`,
      `平均收益率,${(result.avgReturn * 100).toFixed(2)}%`,
      `平均盈利,${(result.avgWinReturn * 100).toFixed(2)}%`,
      `平均亏损,${(result.avgLossReturn * 100).toFixed(2)}%`,
      `盈亏比,${result.profitLossRatio.toFixed(2)}`,
      `最大盈利,${(result.maxReturn * 100).toFixed(2)}%`,
      `最大亏损,${(result.maxLoss * 100).toFixed(2)}%`,
    ];

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.join(',')),
      ...summary,
    ].join('\n');

    // UTF-8 BOM for Excel
    const BOM = '\uFEFF';
    fs.writeFileSync(filePath, BOM + csvContent, 'utf-8');
    logger.info(`[回测] CSV已导出到 ${filePath}`);
  }

  /**
   * 获取所有回测结果列表
   */
  async listBacktestResults(): Promise<string[]> {
    if (!fs.existsSync(this.backtestDir)) {
      return [];
    }
    return fs.readdirSync(this.backtestDir).filter(f => f.endsWith('.json'));
  }

  /**
   * 加载回测结果
   */
  async loadBacktestResult(fileName: string): Promise<TestPanBacktestResult | null> {
    const filePath = path.join(this.backtestDir, fileName);
    
    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as TestPanBacktestResult;
    } catch (error) {
      logger.warn(`加载回测结果失败 ${fileName}: ${(error as Error).message}`);
      return null;
    }
  }

  // ===================== 辅助方法 =====================

  /**
   * 获取用于分析的K线数据
   */
  private async getKlinesForAnalysis(stockCode: string, dateStr: string, days: number): Promise<KlineData[]> {
    try {
      // 先尝试读取缓存
      let klines = await klineCacheService.getRecentKlines(stockCode, 1800);
      
      // 如果缓存为空或数据不足，尝试拉取
      if (klines.length < 10) {
        logger.debug(`[试盘检测] ${stockCode} 缓存数据不足 (${klines.length}条)，尝试拉取...`);
        await klineCacheService.ensureKlines(stockCode, { targetDates: [dateStr], preferDays: 1800 });
        klines = await klineCacheService.getRecentKlines(stockCode, 1800);
      }

      if (klines.length === 0) {
        logger.debug(`[试盘检测] ${stockCode} 无K线数据`);
        return [];
      }

      // 找到目标日期的索引
      const targetIdx = klines.findIndex(k => k.date === dateStr);
      if (targetIdx < 0) {
        logger.debug(`[试盘检测] ${stockCode} 未找到目标日期 ${dateStr} 的K线，可用范围: ${klines[0]?.date} - ${klines[klines.length-1]?.date}`);
        return [];
      }

      // 返回目标日期前后的数据
      const startIdx = Math.max(0, targetIdx - days);
      const endIdx = Math.min(klines.length, targetIdx + 1);

      return klines.slice(startIdx, endIdx).map(k => ({
        date: k.date,
        open: k.open,
        high: k.high,
        low: k.low,
        close: k.close,
        volume: k.volume,
        turnover: k.turnover,
      }));
    } catch (error) {
      logger.error(`获取K线数据失败 ${stockCode}: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * 获取指定日期之后的K线数据
   */
  private async getKlinesAfterDate(stockCode: string, dateStr: string, days: number): Promise<KlineData[]> {
    try {
      const klines = await klineCacheService.getRecentKlines(stockCode, 1800);
      
      // 找到目标日期的索引
      const targetIdx = klines.findIndex(k => k.date === dateStr);
      if (targetIdx < 0) {
        return [];
      }

      // 返回目标日期之后的数据
      const startIdx = targetIdx + 1;
      const endIdx = Math.min(klines.length, startIdx + days);

      return klines.slice(startIdx, endIdx).map(k => ({
        date: k.date,
        open: k.open,
        high: k.high,
        low: k.low,
        close: k.close,
        volume: k.volume,
        turnover: k.turnover,
      }));
    } catch (error) {
      logger.error(`获取K线数据失败 ${stockCode}: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * 格式化日期为问财格式 (YYYYMMDD)
   */
  private formatDateForWencai(dateStr: string): string {
    return dateStr.replace(/[-/]/g, '');
  }

  /**
   * 获取前一交易日（用于问财查询）
   */
  private getPrevTradingDateForWencai(dateStr: string): string {
    const normalizedDate = dateStr.replace(/[-/]/g, '');
    const prevDate = tradingCalendarService.getPrevTradingDay(normalizedDate);
    return prevDate || normalizedDate;
  }

  /**
   * 获取两个日期之间的交易日列表
   */
  private getTradingDaysBetween(startDate: string, endDate: string): string[] {
    const days: string[] = [];
    let current = startDate;

    while (current <= endDate) {
      if (tradingCalendarService.isTradingDay(current)) {
        days.push(current);
      }
      // 简单日期递增
      const year = parseInt(current.substring(0, 4));
      const month = parseInt(current.substring(4, 6));
      const day = parseInt(current.substring(6, 8));
      
      const date = new Date(year, month - 1, day);
      date.setDate(date.getDate() + 1);
      
      current = date.getFullYear().toString() +
        String(date.getMonth() + 1).padStart(2, '0') +
        String(date.getDate()).padStart(2, '0');
    }

    return days;
  }

  /**
   * 解析数值
   */
  private parseNumber(value: any): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const num = parseFloat(value.replace(/[^0-9.-]/g, ''));
      return isNaN(num) ? 0 : num;
    }
    return 0;
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 导出单例
export const testPanService = new TestPanService();
