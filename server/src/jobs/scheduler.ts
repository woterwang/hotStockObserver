import cron from 'node-cron';
import { dataFetchService, priceBreakthroughService, tradingSignalService, marketSentimentService, volumeSurgeService, tradingCalendarService, marketMoodService } from '../services';
import { buySignalService } from '../services/buySignalService';

import { logger } from '../utils';
import { formatDate } from '../utils/dateUtils';

/**
 * 定时任务管理
 */
export class JobScheduler {
  private updateJob: cron.ScheduledTask | null = null;
  private breakthroughJob: cron.ScheduledTask | null = null;
  private auctionJob: cron.ScheduledTask | null = null;
  private signalGenerateJob: cron.ScheduledTask | null = null;
  private sentimentJob: cron.ScheduledTask | null = null;
  private volumeSurgeJob: cron.ScheduledTask | null = null;
  private tradingCalendarJob: cron.ScheduledTask | null = null;

  /**
   * 启动所有定时任务
   */
  async start () {
    // 初始化交易日历服务
    await tradingCalendarService.init();
    // 初始化市场情绪服务
    await marketMoodService.init();

    this.startTradingCalendarJob();
    this.startHotStockUpdateJob();
    this.startBreakthroughScanJob();
    this.startAuctionUpdateJob();
    this.startSignalGenerateJob();
    this.startSentimentJob();
    this.startVolumeSurgeScanJob();
    logger.info('定时任务已启动');
  }

  /**
   * 停止所有定时任务
   */
  stop () {
    if (this.updateJob) {
      this.updateJob.stop();
      this.updateJob = null;
    }
    if (this.breakthroughJob) {
      this.breakthroughJob.stop();
      this.breakthroughJob = null;
    }
    if (this.auctionJob) {
      this.auctionJob.stop();
      this.auctionJob = null;
    }
    if (this.signalGenerateJob) {
      this.signalGenerateJob.stop();
      this.signalGenerateJob = null;
    }
    if (this.sentimentJob) {
      this.sentimentJob.stop();
      this.sentimentJob = null;
    }
    if (this.volumeSurgeJob) {
      this.volumeSurgeJob.stop();
      this.volumeSurgeJob = null;
    }
    if (this.tradingCalendarJob) {
      this.tradingCalendarJob.stop();
      this.tradingCalendarJob = null;
    }
    logger.info('定时任务已停止');
  }

  /**
   * 交易日历更新任务
   * 每天 15:20 执行（收盘后），获取最新的交易日历
   * 这样可以明确知道次日是否为交易日
   */
  private startTradingCalendarJob () {
    // 每天15:20执行（收盘后20分钟，确保数据稳定）
    const cronExpression = '20 15 * * *';

    this.tradingCalendarJob = cron.schedule(cronExpression, async () => {
      try {
        // 1. 更新交易日历
        logger.info('开始更新交易日历缓存');
        const calendarSuccess = await tradingCalendarService.updateCache();
        if (calendarSuccess) {
          const status = tradingCalendarService.getCacheStatus();
          logger.info(`交易日历更新成功，共缓存 ${status.count} 个交易日`);
        } else {
          logger.warn('交易日历更新失败，将继续使用旧缓存');
        }
      } catch (error) {
        logger.error(`交易日历/市场情绪更新任务失败: ${(error as Error).message}`);
      }
    }, {
      timezone: 'Asia/Shanghai',
    });

    logger.info(`交易日历更新任务已配置，Cron表达式: ${cronExpression}`);

    // 如果缓存为空，立即更新一次
    const calendarStatus = tradingCalendarService.getCacheStatus();
    if (calendarStatus.count === 0) {
      logger.info('交易日历缓存为空，立即执行一次更新');
      tradingCalendarService.updateCache().catch(err => {
        logger.error(`初始化交易日历失败: ${err.message}`);
      });
    }

    // 如果市场情绪缓存为空，立即更新一次
    const moodStatus = marketMoodService.getCacheStatus();
    if (moodStatus.count === 0) {
      logger.info('市场情绪缓存为空，立即执行一次更新');
      marketMoodService.updateCache().catch(err => {
        logger.error(`初始化市场情绪失败: ${err.message}`);
      });
    }
  }

  /**
   * 热搜股票更新任务
   * 交易日每15分钟更新一次（9:30-15:00）
   */
  private startHotStockUpdateJob () {
    // 每15分钟执行一次
    const cronExpression = process.env.CRON_UPDATE_INTERVAL || '*/15 9-15 * * 1-5';

    this.updateJob = cron.schedule(cronExpression, async () => {
      try {
        // 检查是否是交易日（使用交易日历服务，支持节假日判断）
        if (!tradingCalendarService.isTradingDayByDate()) {
          logger.info('非交易日，跳过更新');
          return;
        }

        logger.info('开始执行热搜股票更新任务');

        // 获取热搜数据
        const hotStocks = await dataFetchService.fetchHotStocks();

        // 保存到数据库
        const savedCount = await dataFetchService.saveHotStocks(hotStocks);

        logger.info(`热搜股票更新任务完成，共保存 ${savedCount} 条数据`);
      } catch (error) {
        logger.error(`热搜股票更新任务失败: ${(error as Error).message}`);
      }
    }, {
      timezone: 'Asia/Shanghai',
    });

    logger.info(`热搜股票更新任务已配置，Cron表达式: ${cronExpression}`);
  }

  /**
   * 手动触发更新
   */
  async manualUpdate (): Promise<number> {
    try {
      logger.info('手动触发热搜股票更新');

      const hotStocks = await dataFetchService.fetchHotStocks();
      const savedCount = await dataFetchService.saveHotStocks(hotStocks);

      logger.info(`手动更新完成，共保存 ${savedCount} 条数据`);
      return savedCount;
    } catch (error) {
      logger.error(`手动更新失败: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * 价格突破扫描任务
   * 交易日收盘后执行（15:30）
   */
  private startBreakthroughScanJob () {
    // 每个交易日15:30执行
    const cronExpression = '30 15 * * 1-5';

    this.breakthroughJob = cron.schedule(cronExpression, async () => {
      try {
        // 检查是否是交易日（使用交易日历服务，支持节假日判断）
        if (!tradingCalendarService.isTradingDayByDate()) {
          logger.info('非交易日，跳过价格突破扫描');
          return;
        }

        logger.info('开始执行价格突破扫描任务');

        const count = await priceBreakthroughService.scanAndSave();

        logger.info(`价格突破扫描任务完成，共发现 ${count} 只突破股票`);
      } catch (error) {
        logger.error(`价格突破扫描任务失败: ${(error as Error).message}`);
      }
    }, {
      timezone: 'Asia/Shanghai',
    });

    logger.info(`价格突破扫描任务已配置，Cron表达式: ${cronExpression}`);
  }

  /**
   * 盘后信号生成任务
   * 交易日收盘后执行（15:35），生成次日备选标的
   * 包含多个策略：价格突破、放量大涨等
   */
  private startSignalGenerateJob () {
    // 每个交易日15:35执行 价格突破策略
    const cronExpression = '35 15 * * 1-5';

    this.signalGenerateJob = cron.schedule(cronExpression, async () => {
      try {
        // 检查是否是交易日（使用交易日历服务，支持节假日判断）
        if (!tradingCalendarService.isTradingDayByDate()) {
          logger.info('非交易日，跳过信号生成');
          return;
        }

        logger.info('开始执行集合竞价后信号生成任务（多策略）');

        // 当天是 Day2，生成 Day3 的入场信号
        const today = formatDate(new Date(), 'YYYYMMDD');

        try {
          const breakthroughResult = await tradingSignalService.generateSignalsAfterMarketClose(today);
          logger.info(`[价格突破] 生成完成，共 ${breakthroughResult.count} 个信号，入场日=${breakthroughResult.signalDate}`);
        } catch (error) {
          logger.error(`[价格突破] 生成失败: ${(error as Error).message}`);
        }

        logger.info('盘后信号生成任务（多策略）完成');
      } catch (error) {
        logger.error(`盘后信号生成失败: ${(error as Error).message}`);
      }
    }, {
      timezone: 'Asia/Shanghai',
    });

    logger.info(`盘后信号生成任务已配置，Cron表达式: ${cronExpression}`);
  }

  /**
   * 集合竞价后更新入场信号任务 包括 价格突破策略 与 放量大涨策略
   * 交易日09:25:18执行，更新今日信号的入场条件
   */
  private startAuctionUpdateJob () {
    // 每个交易日09:25:18执行（集合竞价结束后18秒）
    // node-cron 支持6位表达式：秒 分 时 日 月 周
    const cronExpression = '18 25 9 * * 1-5';
    const today = formatDate(new Date(), 'YYYYMMDD');

    this.auctionJob = cron.schedule(cronExpression, async () => {
      // 1. 价格突破策略
      try {
        // 检查是否是交易日（使用交易日历服务，支持节假日判断）
        if (!tradingCalendarService.isTradingDayByDate()) {
          logger.info('非交易日，跳过入场条件更新');
          return;
        }

        logger.info('开始执行集合竞价后【价格突破策略】入场条件更新');

        const result = await tradingSignalService.updateSignalsAfterAuction(today);

        logger.info(`入场条件更新完成: 可入场=${result.ready}, 部分满足=${result.partial}, 不满足=${result.rejected}`);
      } catch (error) {
        logger.error(`入场条件更新失败: ${(error as Error).message}`);
      }

      // 2. 放量大涨策略
      try {
        logger.info('开始执行集合竞价后【放量大涨策略】入场条件更新');
        const volumeSurgeResult = await buySignalService.generateBuySignals(today, undefined, 50);
        logger.info(`[放量大涨] 生成完成，共 ${volumeSurgeResult.length} 个信号，入场日=${volumeSurgeResult[0].date}`);
      } catch (error) {
        logger.error(`[放量大涨] 生成失败: ${(error as Error).message}`);
      }


      // 3. 更新市场情绪数据
      logger.info('开始更新市场情绪缓存');
      const moodSuccess = await marketMoodService.updateCache();
      if (moodSuccess) {
        const moodStatus = marketMoodService.getCacheStatus();
        logger.info(`市场情绪更新成功，共缓存 ${moodStatus.count} 条数据，最新日期: ${moodStatus.latestDay}`);
      } else {
        logger.warn('市场情绪更新失败，将继续使用旧缓存');
      }


    }, {
      timezone: 'Asia/Shanghai',
    });

    logger.info(`集合竞价更新任务已配置，Cron表达式: ${cronExpression}`);
  }

  /**
   * 市场情绪数据获取任务
   * 交易日收盘后执行（15:32），获取当日市场情绪
   */
  private startSentimentJob () {
    // 每个交易日15:32执行（在突破扫描之前）
    const cronExpression = '32 15 * * 1-5';

    this.sentimentJob = cron.schedule(cronExpression, async () => {
      try {
        // 检查是否是交易日（使用交易日历服务，支持节假日判断）
        if (!tradingCalendarService.isTradingDayByDate()) {
          logger.info('非交易日，跳过市场情绪获取');
          return;
        }

        logger.info('开始获取市场情绪数据');

        const today = formatDate(new Date(), 'YYYYMMDD');
        const sentiment = await marketSentimentService.fetchAndCalculateSentiment(today);

        if (sentiment) {
          logger.info(`市场情绪获取完成: 评分=${sentiment.score}, 建议=${sentiment.advice}`);
        }
      } catch (error) {
        logger.error(`市场情绪获取失败: ${(error as Error).message}`);
      }
    }, {
      timezone: 'Asia/Shanghai',
    });

    logger.info(`市场情绪获取任务已配置，Cron表达式: ${cronExpression}`);
  }

  /**
   * 强势资金突破（放量大涨）扫描任务
   * 交易日收盘后执行（15:31），扫描当天的放量大涨股票
   */
  private startVolumeSurgeScanJob () {
    // 每个交易日15:31执行（在市场情绪获取之前，信号生成之前）
    const cronExpression = '31 15 * * 1-5';

    this.volumeSurgeJob = cron.schedule(cronExpression, async () => {
      try {
        // 检查是否是交易日（使用交易日历服务，支持节假日判断）
        if (!tradingCalendarService.isTradingDayByDate()) {
          logger.info('非交易日，跳过强势资金突破扫描');
          return;
        }

        logger.info('开始执行强势资金突破（放量大涨）扫描任务');

        const today = formatDate(new Date(), 'YYYYMMDD');
        const count = await volumeSurgeService.scanAndSave(today);

        logger.info(`强势资金突破扫描任务完成，共发现 ${count} 只符合条件的股票`);
      } catch (error) {
        logger.error(`强势资金突破扫描任务失败: ${(error as Error).message}`);
      }
    }, {
      timezone: 'Asia/Shanghai',
    });

    logger.info(`强势资金突破扫描任务已配置，Cron表达式: ${cronExpression}`);
  }
}

export const jobScheduler = new JobScheduler();
