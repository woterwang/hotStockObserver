/**
 * 买入信号策略回测服务
 * 支持多种策略来源：强势资金突破、突破三天确认等
 * 回测买入信号中"强烈买入"标的的实际收益
 */

import { logger } from '../utils';
import { BuySignal, VolumeSurge } from '../models';
import { formatDate, parseDate, toDateStr } from '../utils/dateUtils';
import { marketMoodService } from './marketMoodService';
import { klineCacheService, CachedKline } from './klineCacheService';

/**
 * 回测配置参数
 */
export interface BuySignalBacktestConfig {
  // 买入信号类型过滤（strong_buy 或 buy，默认回测两者）
  // 注意：策略来源固定为 volume_surge，不再支持配置
  signalFilter: 'strong_buy' | 'buy' | 'all';
  // 最低信号评分门槛（0-100，低于此分数的信号不参与回测）
  minSignalScore: number;
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

// 使用 klineCacheService 的 CachedKline 类型
type KlineData = CachedKline;

/**
 * 买入信号回测服务
 */
class BuySignalBacktestService {

  // 默认配置（策略来源固定为 volume_surge）
  // 阈值标准：>= 70 高涨, >= 50 正常, >= 30 偏弱, < 30 极弱
  private defaultConfig: BuySignalBacktestConfig = {
    signalFilter: 'all',            // 默认回测 strong_buy 和 buy
    minSignalScore: 70,             // 默认信号评分门槛 70 分
    basePosition: 50000,
    lowMoodPositionRatio: 0.5,      // 情绪偏弱时仓位减半
    marketMoodThreshold: 50,        // 低于50（情绪偏弱）时降低仓位
    stopLossPercent: 0.05,
    takeProfitPercent: 0.20,
    maxHoldDays: 3,
    marketPanicThreshold: 40,       // 低于30（情绪极弱）时暂停交易
  };

  // 内存缓存（用于回测期间快速访问，避免重复调用 klineCacheService）
  private klineCache: Map<string, KlineData[]> = new Map();

  /**
   * 检查 K 线数据是否足够回测使用
   * @param klineData K线数据
   * @param signalDate 信号日期（YYYYMMDD格式）
   * @param requiredDaysAfter 信号后需要的交易日数（默认maxHoldDays+5）
   */
  private isKlineDataSufficient(
    klineData: KlineData[],
    signalDate: string,
    requiredDaysAfter: number = 10
  ): boolean {
    if (!klineData || klineData.length === 0) {
      return false;
    }

    // 找到信号日期在K线中的位置
    const signalIdx = klineData.findIndex(k => k.date === signalDate);
    if (signalIdx === -1) {
      // 信号日期不在K线数据中，检查最后一条K线日期是否在信号日期之后
      const lastDate = klineData[klineData.length - 1]?.date;
      if (!lastDate || lastDate < signalDate) {
        return false;
      }
    }

    // 检查信号日期之后是否有足够的K线
    const daysAfterSignal = klineData.length - signalIdx - 1;
    return daysAfterSignal >= requiredDaysAfter;
  }

  /**
   * 预检查并预加载所有需要的 K 线数据（使用 klineCacheService）
   * @param stockCodes 股票代码列表
   * @param signalDates 信号日期列表（对应每个股票的信号日期）
   * @param klineDays 需要获取的K线天数
   * @param maxHoldDays 最大持仓天数
   */
  async preloadKlineData(
    stockCodes: string[],
    signalDates: string[],
    klineDays: number,
    maxHoldDays: number
  ): Promise<{ loaded: number; failed: number; skipped: number }> {
    let loaded = 0;
    let failed = 0;
    let skipped = 0;
    const uniqueStocks = [...new Set(stockCodes)];

    logger.info(`开始预加载 K 线数据: ${uniqueStocks.length} 只股票 (使用 klineCacheService)`);

    for (let i = 0; i < uniqueStocks.length; i++) {
      const stockCode = uniqueStocks[i];
      const signalDate = signalDates[stockCodes.indexOf(stockCode)];

      try {
        // 使用 klineCacheService.getKlinesByStartDay 获取需要的K线数据
        const klineData = klineCacheService.getKlinesByStartDay(stockCode, signalDate, klineDays);

        if (klineData && klineData.length > 0) {
          // 检查数据是否足够
          if (klineData.length < klineDays) {
            logger.warn(`[${i + 1}/${uniqueStocks.length}] ${stockCode} 获取的 K 线数据不足: 需要 ${klineDays} 天，实际 ${klineData.length} 天`);
            skipped++;
          }else{
            loaded++;
            this.klineCache.set(stockCode, klineData);
          }
        } else {
          logger.warn(`[${i + 1}/${uniqueStocks.length}] ${stockCode} 获取失败: 无数据`);
          skipped++;
        }
      } catch (error) {
        logger.warn(`[${i + 1}/${uniqueStocks.length}] ${stockCode} 获取失败: ${(error as Error).message}`);
        failed++;
      }
    }

    logger.info(`K 线预加载完成: 成功 ${loaded}, 失败 ${failed}, 跳过(缓存足够) ${skipped}`);
    return { loaded, failed, skipped };
  }


  /**
   * 延时函数
   */
  private delay (ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 回测单只股票
   */
  private async backtestSingleStock (
    signal: any,
    config: BuySignalBacktestConfig
  ): Promise<BuySignalTradeRecord | null> {
    try {
      const stockCode = signal.stockCode;
      // 使用 toDateStr 规范化日期（支持 Date 和 String 两种格式）
      const signalDateStr = toDateStr(signal.date) || formatDate(new Date(signal.date), 'YYYYMMDD');

      // 动态计算需要的 K 线天数
      // 公式：klineDays = (今日日期 - 信号日期) + maxHoldDays + 缓冲天数(10天)
      const today = new Date();
      const signalDate = parseDate(signalDateStr);
      const daysDiff = Math.ceil((today.getTime() - signalDate.getTime()) / (1000 * 60 * 60 * 24));
      const klineDays = Math.max(30, daysDiff + config.maxHoldDays + 10);  // 至少30天，加上持仓天数和10天缓冲

      // 获取K线数据（使用动态计算的天数）
      const klineData = klineCacheService.getKlinesByStartDay(stockCode, signalDateStr, klineDays);
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

      // 买入日即为信号日（信号日期本身就是 T+1，当天开盘买入）
      const buyIdx = signalIdx;
      const buyKline = klineData[buyIdx];
      const buyDateStr = buyKline.date;
      const buyPrice = buyKline.open;  // 信号日开盘价买入

      logger.info(`[回测] ${stockCode} 信号日=${signalDateStr}, 买入日=${buyDateStr}, 买入价=${buyPrice}`);

      if (buyPrice <= 0) {
        logger.debug(`${stockCode} 买入价为0`);
        return null;
      }

      // 确定仓位
      // 规则1: strong_buy = 标准仓, buy = 标准仓的一半 (通过 signal.positionRatio 传入)
      // 规则2: 市场情绪不好时再降低仓位
      const buyDayMood = marketMoodService.getMood(buyDateStr) ?? 50;
      const signalPositionRatio = (signal as any).positionRatio || 1;  // 默认为1（标准仓）
      let position = config.basePosition * signalPositionRatio;

      // 市场情绪不好时，再乘以 lowMoodPositionRatio
      if (buyDayMood < config.marketMoodThreshold) {
        position = position * config.lowMoodPositionRatio;
      }

      // 计算止盈止损价
      const stopLossPrice = buyPrice * (1 - config.stopLossPercent);
      const takeProfitPrice = buyPrice * (1 + config.takeProfitPercent);

      // 模拟持仓期间（买入当天计为第1天）
      let sellPrice = 0;
      let sellDate = '';
      let holdDays = 0;
      let exitReason: BuySignalTradeRecord['exitReason'] = 'data_end';

      // i=0 表示买入当天（第1天），i=1 表示T+1（第2天），以此类推
      // maxHoldDays=5 意味着持有5天，即 T+0 到 T+4
      for (let i = 0; i < config.maxHoldDays; i++) {
        const holdIdx = buyIdx + i;
        if (holdIdx >= klineData.length) {
          // 数据不足，用最后一天收盘价
          sellPrice = klineData[klineData.length - 1].close;
          sellDate = klineData[klineData.length - 1].date;
          holdDays = klineData.length - buyIdx;
          exitReason = 'data_end';
          break;
        }

        const dayKline = klineData[holdIdx];
        const dayMood = marketMoodService.getMood(dayKline.date) ?? 50;

        // 买入当天（i=0）跳过卖出检查，因为刚买入
        if (i === 0) {
          continue;
        }

        // 检查市场情绪恶化
        if (dayMood < config.marketPanicThreshold) {
          sellPrice = dayKline.open;  // 情绪恶化开盘卖出
          sellDate = dayKline.date;
          holdDays = i + 1;  // 持仓天数（包含买入当天）
          exitReason = 'market_panic';
          break;
        }

        // 检查止损（当日最低价触及止损位）
        if (dayKline.low <= stopLossPrice) {
          sellPrice = stopLossPrice;
          sellDate = dayKline.date;
          holdDays = i + 1;
          exitReason = 'stop_loss';
          break;
        }

        // 检查止盈（当日最高价触及止盈位）
        if (dayKline.high >= takeProfitPrice) {
          sellPrice = takeProfitPrice;
          sellDate = dayKline.date;
          holdDays = i + 1;
          exitReason = 'take_profit';
          break;
        }

        // 最后一天收盘卖出（i = maxHoldDays - 1 表示第 maxHoldDays 天）
        if (i === config.maxHoldDays - 1) {
          sellPrice = dayKline.close;
          sellDate = dayKline.date;
          holdDays = i + 1;
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
  async runBacktest (
    startDate: string,
    endDate: string,
    config?: Partial<BuySignalBacktestConfig>
  ): Promise<BuySignalBacktestResult> {
    const finalConfig: BuySignalBacktestConfig = { ...this.defaultConfig, ...config };

    logger.info(`开始买入信号回测: ${startDate} - ${endDate}`);
    logger.info(`传入的 config: ${JSON.stringify(config)}`);
    logger.info(`合并后 finalConfig: ${JSON.stringify(finalConfig)}`);
    logger.info(`回测配置: 策略=强势资金突破(volume_surge), 止损=${finalConfig.stopLossPercent * 100}%, 止盈=${finalConfig.takeProfitPercent * 100}%, 最大持仓=${finalConfig.maxHoldDays}天`);

    // 清空缓存
    this.klineCache.clear();

    // 计算需要获取的 K 线天数
    const klineDays = finalConfig.maxHoldDays; // 直接使用自然日差，加上持仓天数和10天缓冲
    logger.info(`根据回测日期范围，需要获取 ${klineDays} 天 K 线数据`);

    // 构建查询条件
    // 数据库日期格式已统一为字符串 "YYYYMMDD"，直接使用字符串比较
    const startDateStr = formatDate(parseDate(startDate), 'YYYYMMDD');
    const endDateStr = formatDate(parseDate(endDate), 'YYYYMMDD');

    logger.info(`日期查询范围: ${startDateStr} ~ ${endDateStr}`);

    // 从 BuySignal 集合查询数据，只查询 strong_buy 和 buy 的信号
    const buySignalQuery: any = {
      date: { $gte: startDateStr, $lte: endDateStr },
      // 策略来源固定为 volume_surge
      strategyType: 'volume_surge',
      // 只回测 "强烈买入" 和 "建议买入" 的标的
      // buySignal: { $in: ['strong_buy', 'buy'] },
    };

    // 从 BuySignal 集合查询数据
    const buySignalRecords = await BuySignal.find(buySignalQuery).sort({ date: 1, totalBuyScore: -1 }).lean();
    logger.info(`从 BuySignal 找到 ${buySignalRecords.length} 条记录 (buySignal=strong_buy/buy)`);

    // 将 BuySignal 数据转换为回测需要的格式
    // 仓位规则：strong_buy = 标准仓，buy = 标准仓的一半
    const allSignals = buySignalRecords.map(bs => ({
      stockCode: bs.stockCode,
      stockName: bs.stockName,
      date: bs.date,
      strategyType: 'volume_surge',
      strategyName: '强势资金突破',
      totalBuyScore: bs.totalBuyScore || 0,
      marketMood: bs.marketMood || 50,
      // 根据 buySignal 类型决定仓位比例
      positionRatio: 1,
      buySignalType: bs.buySignal,
    }));

    // 根据 minSignalScore 过滤信号
    const signals = allSignals.filter(s => s.totalBuyScore >= finalConfig.minSignalScore);
    logger.info(`应用信号评分门槛 (>= ${finalConfig.minSignalScore}分) 后剩余 ${signals.length} 条记录`);

    // === 预加载 K 线数据 ===
    if (signals.length > 0) {
      const stockCodes = signals.map(s => s.stockCode);
      // 使用 toDateStr 统一日期格式（数据库已迁移为字符串格式）
      const signalDates = signals.map(s => toDateStr(s.date));

      await this.preloadKlineData(stockCodes, signalDates, klineDays, finalConfig.maxHoldDays);
    }

    // 对每条记录执行回测
    const trades: BuySignalTradeRecord[] = [];
    let processedCount = 0;

    for (const signal of signals) {
      const trade = await this.backtestSingleStock(signal, finalConfig);

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
  private calculateStatistics (
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
