/**
 * 买入信号策略回测服务
 * 支持多种策略来源：强势资金突破、突破三天确认等
 * 回测买入信号中"强烈买入"标的的实际收益
 */

import { logger } from '../utils';
import { BuySignal } from '../models';
import { formatDate, parseDate } from '../utils/dateUtils';
import axios from 'axios';
import dayjs from 'dayjs';

/**
 * 回测配置参数
 */
export interface BuySignalBacktestConfig {
  // 策略来源类型
  strategyType: 'volume_surge' | 'breakthrough' | 'all';
  // 买入信号类型（只回测强烈买入）
  signalFilter: 'strong_buy' | 'buy' | 'all';
  // 标准仓位（元）
  basePosition: number;
  // 市场情绪不好时的仓位比例（0-1）
  lowMoodPositionRatio: number;
  // 市场情绪阈值（低于此值降低仓位）
  marketMoodThreshold: number;
  // 止损比例（如 0.05 表示 -5%）
  stopLossPercent: number;
  // 止盈比例（如 0.20 表示 +20%）
  takeProfitPercent: number;
  // 最大持仓天数
  maxHoldDays: number;
  // 市场情绪恶化阈值（低于此值全部卖出）
  marketPanicThreshold: number;
}

/**
 * 单笔交易记录
 */
export interface BuySignalTradeRecord {
  stockCode: string;
  stockName: string;
  strategyType: string;
  strategyName: string;
  buyDate: string;          // 买入日期
  buyPrice: number;         // 买入价格
  sellDate: string;         // 卖出日期
  sellPrice: number;        // 卖出价格
  holdDays: number;         // 持仓天数
  position: number;         // 实际仓位（元）
  profitPercent: number;    // 收益率 %
  profitAmount: number;     // 收益金额（元）
  exitReason: 'stop_loss' | 'take_profit' | 'max_days' | 'market_panic' | 'data_end';
  buySignalScore: number;   // 买入信号评分
  marketMood: number;       // 买入时市场情绪
}

/**
 * 回测结果统计
 */
export interface BuySignalBacktestResult {
  // 基本信息
  startDate: string;
  endDate: string;
  config: BuySignalBacktestConfig;
  
  // 统计数据
  totalTrades: number;      // 总交易次数
  winTrades: number;        // 盈利次数
  lossTrades: number;       // 亏损次数
  winRate: number;          // 胜率 %
  
  // 收益统计
  totalProfitAmount: number;    // 总收益金额（元）
  totalProfitPercent: number;   // 总收益率 %（相对总投入）
  avgProfitPercent: number;     // 平均收益率 %
  avgWinPercent: number;        // 平均盈利 %
  avgLossPercent: number;       // 平均亏损 %
  profitLossRatio: number;      // 盈亏比
  
  // 资金统计
  totalInvested: number;        // 总投入资金（元）
  maxDrawdown: number;          // 最大回撤（元）
  maxDrawdownPercent: number;   // 最大回撤 %
  
  // 极值
  maxProfit: number;        // 最大单笔盈利 %
  maxLoss: number;          // 最大单笔亏损 %
  maxConsecutiveWins: number;   // 最大连续盈利次数
  maxConsecutiveLosses: number; // 最大连续亏损次数
  
  // 持仓统计
  avgHoldDays: number;      // 平均持仓天数
  
  // 资金曲线（用于绘图）
  equityCurve: { date: string; equity: number }[];
  
  // 交易明细
  trades: BuySignalTradeRecord[];
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
}

/**
 * 买入信号回测服务
 */
class BuySignalBacktestService {
  
  // 默认配置
  private defaultConfig: BuySignalBacktestConfig = {
    strategyType: 'volume_surge',
    signalFilter: 'strong_buy',
    basePosition: 50000,
    lowMoodPositionRatio: 0.5,
    marketMoodThreshold: 50,
    stopLossPercent: 0.05,
    takeProfitPercent: 0.20,
    maxHoldDays: 5,
    marketPanicThreshold: 40,
  };

  // K线缓存
  private klineCache: Map<string, KlineData[]> = new Map();

  /**
   * 获取股票的市场ID（同花顺格式）
   */
  private getMarketId(stockCode: string): string {
    if (stockCode.startsWith('6')) {
      return '17'; // 上海
    } else if (stockCode.startsWith('688')) {
      return '17'; // 科创板
    }
    return '33'; // 深圳（包括创业板30x）
  }

  /**
   * 从同花顺获取K线数据
   */
  private async fetchKlineFromThs(
    stockCode: string,
    days: number = 60
  ): Promise<KlineData[]> {
    try {
      // 检查缓存
      const cacheKey = stockCode;
      if (this.klineCache.has(cacheKey)) {
        return this.klineCache.get(cacheKey)!;
      }

      const marketId = this.getMarketId(stockCode);
      const url = `https://d.10jqka.com.cn/v6/line/${marketId}_${stockCode}/01/last${days}.js`;
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'http://www.10jqka.com.cn/',
        },
        timeout: 10000,
      });

      const result: KlineData[] = [];
      
      if (response.data && typeof response.data === 'string') {
        const dataStr = response.data;
        const startIdx = dataStr.indexOf('({');
        if (startIdx !== -1) {
          const jsonStr = dataStr.substring(startIdx + 1, dataStr.length - 1);
          const json = JSON.parse(jsonStr);
          if (json && json.data) {
            const klineList = json.data.split(';');
            for (const item of klineList) {
              const parts = item.split(',');
              if (parts.length >= 7 && parts[0] && parts[1]) {
                result.push({
                  date: parts[0],
                  open: parseFloat(parts[1]) || 0,
                  high: parseFloat(parts[2]) || 0,
                  low: parseFloat(parts[3]) || 0,
                  close: parseFloat(parts[4]) || 0,
                  volume: parseFloat(parts[5]) || 0,
                  turnover: parseFloat(parts[6]) || 0,
                });
              }
            }
          }
        }
      }

      // 缓存结果
      if (result.length > 0) {
        this.klineCache.set(cacheKey, result);
      }

      return result;
    } catch (error) {
      logger.debug(`获取 ${stockCode} K线失败: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * 获取上证指数K线（用于计算市场情绪）
   */
  private async fetchIndexKline(days: number = 60): Promise<KlineData[]> {
    try {
      const cacheKey = 'index_000001';
      if (this.klineCache.has(cacheKey)) {
        return this.klineCache.get(cacheKey)!;
      }

      const url = `https://d.10jqka.com.cn/v6/line/17_000001/01/last${days}.js`;
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'http://www.10jqka.com.cn/',
        },
        timeout: 10000,
      });

      const result: KlineData[] = [];
      
      if (response.data && typeof response.data === 'string') {
        const dataStr = response.data;
        const startIdx = dataStr.indexOf('({');
        if (startIdx !== -1) {
          const jsonStr = dataStr.substring(startIdx + 1, dataStr.length - 1);
          const json = JSON.parse(jsonStr);
          if (json && json.data) {
            const klineList = json.data.split(';');
            for (const item of klineList) {
              const parts = item.split(',');
              if (parts.length >= 5 && parts[0] && parts[1]) {
                result.push({
                  date: parts[0],
                  open: parseFloat(parts[1]) || 0,
                  high: parseFloat(parts[2]) || 0,
                  low: parseFloat(parts[3]) || 0,
                  close: parseFloat(parts[4]) || 0,
                  volume: 0,
                  turnover: 0,
                });
              }
            }
          }
        }
      }

      if (result.length > 0) {
        this.klineCache.set(cacheKey, result);
      }

      return result;
    } catch (error) {
      logger.debug(`获取上证指数K线失败: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * 计算某日市场情绪（0-100）
   * 基于大盘涨跌幅
   */
  private calculateMarketMood(indexKline: KlineData[], dateStr: string): number {
    const idx = indexKline.findIndex(k => k.date === dateStr);
    if (idx <= 0) return 50;

    const today = indexKline[idx];
    const prev = indexKline[idx - 1];
    const dayChange = ((today.close - prev.close) / prev.close) * 100;

    // 情绪 = 50 + 涨跌幅 * 10，限制在 0-100
    return Math.max(0, Math.min(100, 50 + dayChange * 10));
  }

  /**
   * 延时函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 回测单只股票
   */
  private async backtestSingleStock(
    signal: any,
    config: BuySignalBacktestConfig,
    indexKline: KlineData[]
  ): Promise<BuySignalTradeRecord | null> {
    try {
      const stockCode = signal.stockCode;
      const signalDateStr = formatDate(signal.date, 'YYYYMMDD');
      
      // 获取K线数据
      const klineData = await this.fetchKlineFromThs(stockCode, 120);
      if (klineData.length === 0) {
        logger.info(`[回测] ${stockCode} 无K线数据`);
        return null;
      }

      // 找到信号日的K线索引
      const signalIdx = klineData.findIndex(k => k.date === signalDateStr);
      if (signalIdx === -1) {
        // 如果信号日是最新的交易日但K线还没更新，尝试用前一天
        const lastKlineDate = klineData[klineData.length - 1]?.date;
        logger.info(`[回测] ${stockCode} 信号日期=${signalDateStr}, K线最新=${lastKlineDate}, 信号日K线未找到，跳过`);
        return null;
      }

      // 买入日为信号日的次一个交易日（次日开盘买入）
      const buyIdx = signalIdx + 1;
      if (buyIdx >= klineData.length) {
        logger.info(`[回测] ${stockCode} 信号日=${signalDateStr} 后无交易日数据，无法执行买入`);
        return null;
      }

      const buyKline = klineData[buyIdx];
      const buyDateStr = buyKline.date;
      const buyPrice = buyKline.open;  // 次日开盘价买入
      
      logger.info(`[回测] ${stockCode} 信号日=${signalDateStr}, 买入日=${buyDateStr}, 买入价=${buyPrice}`);
      
      if (buyPrice <= 0) {
        logger.debug(`${stockCode} 买入价为0`);
        return null;
      }

      // 确定仓位（根据市场情绪）
      const buyDayMood = this.calculateMarketMood(indexKline, buyDateStr);
      const position = buyDayMood >= config.marketMoodThreshold 
        ? config.basePosition 
        : config.basePosition * config.lowMoodPositionRatio;

      // 计算止盈止损价
      const stopLossPrice = buyPrice * (1 - config.stopLossPercent);
      const takeProfitPrice = buyPrice * (1 + config.takeProfitPercent);

      // 模拟持仓期间
      let sellPrice = 0;
      let sellDate = '';
      let holdDays = 0;
      let exitReason: BuySignalTradeRecord['exitReason'] = 'data_end';

      for (let i = 1; i <= config.maxHoldDays; i++) {
        const holdIdx = buyIdx + i;
        if (holdIdx >= klineData.length) {
          // 数据不足，用最后一天收盘价
          sellPrice = klineData[klineData.length - 1].close;
          sellDate = klineData[klineData.length - 1].date;
          holdDays = klineData.length - 1 - buyIdx;
          exitReason = 'data_end';
          break;
        }

        const dayKline = klineData[holdIdx];
        const dayMood = this.calculateMarketMood(indexKline, dayKline.date);

        // 检查市场情绪恶化
        if (dayMood < config.marketPanicThreshold) {
          sellPrice = dayKline.open;  // 情绪恶化开盘卖出
          sellDate = dayKline.date;
          holdDays = i;
          exitReason = 'market_panic';
          break;
        }

        // 检查止损（当日最低价触及止损位）
        if (dayKline.low <= stopLossPrice) {
          sellPrice = stopLossPrice;
          sellDate = dayKline.date;
          holdDays = i;
          exitReason = 'stop_loss';
          break;
        }

        // 检查止盈（当日最高价触及止盈位）
        if (dayKline.high >= takeProfitPrice) {
          sellPrice = takeProfitPrice;
          sellDate = dayKline.date;
          holdDays = i;
          exitReason = 'take_profit';
          break;
        }

        // 最后一天收盘卖出
        if (i === config.maxHoldDays) {
          sellPrice = dayKline.close;
          sellDate = dayKline.date;
          holdDays = i;
          exitReason = 'max_days';
          break;
        }
      }

      if (sellPrice <= 0) {
        return null;
      }

      const profitPercent = ((sellPrice - buyPrice) / buyPrice) * 100;
      const profitAmount = (sellPrice - buyPrice) / buyPrice * position;

      return {
        stockCode: signal.stockCode,
        stockName: signal.stockName,
        strategyType: signal.strategyType || 'volume_surge',
        strategyName: signal.strategyName || '强势资金突破',
        buyDate: buyDateStr,
        buyPrice,
        sellDate,
        sellPrice,
        holdDays,
        position,
        profitPercent: Math.round(profitPercent * 100) / 100,
        profitAmount: Math.round(profitAmount * 100) / 100,
        exitReason,
        buySignalScore: signal.totalBuyScore || 0,
        marketMood: buyDayMood,
      };
    } catch (error) {
      logger.debug(`回测 ${signal.stockCode} 失败: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * 执行回测
   */
  async runBacktest(
    startDate: string,
    endDate: string,
    config?: Partial<BuySignalBacktestConfig>
  ): Promise<BuySignalBacktestResult> {
    const finalConfig: BuySignalBacktestConfig = { ...this.defaultConfig, ...config };
    
    logger.info(`开始买入信号回测: ${startDate} - ${endDate}`);
    logger.info(`回测配置: 策略=${finalConfig.strategyType}, 信号=${finalConfig.signalFilter}, 止损=${finalConfig.stopLossPercent * 100}%, 止盈=${finalConfig.takeProfitPercent * 100}%, 最大持仓=${finalConfig.maxHoldDays}天`);

    // 清空缓存
    this.klineCache.clear();

    // 获取上证指数K线
    const indexKline = await this.fetchIndexKline(120);
    if (indexKline.length === 0) {
      logger.warn('无法获取上证指数K线');
    }

    // 构建查询条件
    const startDateObj = parseDate(startDate);
    const endDateObj = parseDate(endDate);
    
    const query: any = {
      date: { $gte: startDateObj, $lte: endDateObj },
    };

    // 策略类型过滤
    if (finalConfig.strategyType !== 'all') {
      query.strategyType = finalConfig.strategyType;
    }

    // 买入信号过滤（基于 buySignal 字段）
    if (finalConfig.signalFilter === 'strong_buy') {
      query.buySignal = 'strong_buy';
    } else if (finalConfig.signalFilter === 'buy') {
      query.buySignal = { $in: ['strong_buy', 'buy'] };
    }

    // 从 BuySignal 集合查询数据
    const signals = await BuySignal.find(query).sort({ date: 1, totalBuyScore: -1 }).lean();
    logger.info(`找到 ${signals.length} 条买入信号记录`);

    // 对每条记录执行回测
    const trades: BuySignalTradeRecord[] = [];
    let processedCount = 0;

    for (const signal of signals) {
      const trade = await this.backtestSingleStock(signal, finalConfig, indexKline);

      if (trade) {
        trades.push(trade);
      }

      processedCount++;
      if (processedCount % 10 === 0) {
        logger.info(`回测进度: ${processedCount}/${signals.length}`);
        // 添加延迟避免请求过快
        await this.delay(300);
      }
    }

    // 计算统计数据
    const result = this.calculateStatistics(startDate, endDate, finalConfig, trades);
    
    logger.info(`回测完成: 总交易 ${result.totalTrades} 笔, 胜率 ${result.winRate.toFixed(1)}%, 总收益 ${result.totalProfitAmount.toFixed(2)} 元`);

    return result;
  }

  /**
   * 计算统计数据
   */
  private calculateStatistics(
    startDate: string,
    endDate: string,
    config: BuySignalBacktestConfig,
    trades: BuySignalTradeRecord[]
  ): BuySignalBacktestResult {
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
        totalProfitAmount: 0,
        totalProfitPercent: 0,
        avgProfitPercent: 0,
        avgWinPercent: 0,
        avgLossPercent: 0,
        profitLossRatio: 0,
        totalInvested: 0,
        maxDrawdown: 0,
        maxDrawdownPercent: 0,
        maxProfit: 0,
        maxLoss: 0,
        maxConsecutiveWins: 0,
        maxConsecutiveLosses: 0,
        avgHoldDays: 0,
        equityCurve: [],
        trades: [],
      };
    }

    // 按日期排序
    trades.sort((a, b) => a.buyDate.localeCompare(b.buyDate));

    // 计算盈亏
    const winTrades = trades.filter(t => t.profitPercent > 0).length;
    const lossTrades = trades.filter(t => t.profitPercent < 0).length;
    const winRate = (winTrades / totalTrades) * 100;

    // 收益统计
    const totalProfitAmount = trades.reduce((sum, t) => sum + t.profitAmount, 0);
    const totalInvested = trades.reduce((sum, t) => sum + t.position, 0);
    const totalProfitPercent = totalInvested > 0 ? (totalProfitAmount / totalInvested) * 100 : 0;
    const avgProfitPercent = trades.reduce((sum, t) => sum + t.profitPercent, 0) / totalTrades;

    // 盈利/亏损平均值
    const winningTrades = trades.filter(t => t.profitPercent > 0);
    const losingTrades = trades.filter(t => t.profitPercent < 0);
    const avgWinPercent = winningTrades.length > 0 
      ? winningTrades.reduce((sum, t) => sum + t.profitPercent, 0) / winningTrades.length 
      : 0;
    const avgLossPercent = losingTrades.length > 0 
      ? losingTrades.reduce((sum, t) => sum + t.profitPercent, 0) / losingTrades.length 
      : 0;
    const profitLossRatio = avgLossPercent !== 0 ? Math.abs(avgWinPercent / avgLossPercent) : 0;

    // 极值
    const maxProfit = Math.max(...trades.map(t => t.profitPercent));
    const maxLoss = Math.min(...trades.map(t => t.profitPercent));

    // 连续盈亏
    let currentWins = 0, currentLosses = 0;
    let maxConsecutiveWins = 0, maxConsecutiveLosses = 0;
    for (const trade of trades) {
      if (trade.profitPercent > 0) {
        currentWins++;
        currentLosses = 0;
        maxConsecutiveWins = Math.max(maxConsecutiveWins, currentWins);
      } else if (trade.profitPercent < 0) {
        currentLosses++;
        currentWins = 0;
        maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentLosses);
      }
    }

    // 平均持仓天数
    const avgHoldDays = trades.reduce((sum, t) => sum + t.holdDays, 0) / totalTrades;

    // 计算资金曲线和最大回撤
    let equity = 0;
    let maxEquity = 0;
    let maxDrawdown = 0;
    const equityCurve: { date: string; equity: number }[] = [];
    
    for (const trade of trades) {
      equity += trade.profitAmount;
      equityCurve.push({ date: trade.sellDate, equity });
      
      if (equity > maxEquity) {
        maxEquity = equity;
      }
      const drawdown = maxEquity - equity;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    const maxDrawdownPercent = maxEquity > 0 ? (maxDrawdown / maxEquity) * 100 : 0;

    return {
      startDate,
      endDate,
      config,
      totalTrades,
      winTrades,
      lossTrades,
      winRate: Math.round(winRate * 100) / 100,
      totalProfitAmount: Math.round(totalProfitAmount * 100) / 100,
      totalProfitPercent: Math.round(totalProfitPercent * 100) / 100,
      avgProfitPercent: Math.round(avgProfitPercent * 100) / 100,
      avgWinPercent: Math.round(avgWinPercent * 100) / 100,
      avgLossPercent: Math.round(avgLossPercent * 100) / 100,
      profitLossRatio: Math.round(profitLossRatio * 100) / 100,
      totalInvested: Math.round(totalInvested * 100) / 100,
      maxDrawdown: Math.round(maxDrawdown * 100) / 100,
      maxDrawdownPercent: Math.round(maxDrawdownPercent * 100) / 100,
      maxProfit: Math.round(maxProfit * 100) / 100,
      maxLoss: Math.round(maxLoss * 100) / 100,
      maxConsecutiveWins,
      maxConsecutiveLosses,
      avgHoldDays: Math.round(avgHoldDays * 10) / 10,
      equityCurve,
      trades,
    };
  }
}

export const buySignalBacktestService = new BuySignalBacktestService();
