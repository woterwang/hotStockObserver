import cron from 'node-cron';
import { dataFetchService, priceBreakthroughService, tradingSignalService, marketSentimentService } from '../services';
import { logger } from '../utils';
import { isTradingDay, isTradingTime, formatDate } from '../utils/dateUtils';

/**
 * 定时任务管理
 */
export class JobScheduler {
  private updateJob: cron.ScheduledTask | null = null;
  private breakthroughJob: cron.ScheduledTask | null = null;
  private auctionJob: cron.ScheduledTask | null = null;
  private signalGenerateJob: cron.ScheduledTask | null = null;
  private sentimentJob: cron.ScheduledTask | null = null;

  /**
   * 启动所有定时任务
   */
  start() {
    this.startHotStockUpdateJob();
    this.startBreakthroughScanJob();
    this.startAuctionUpdateJob();
    this.startSignalGenerateJob();
    this.startSentimentJob();
    logger.info('定时任务已启动');
  }

  /**
   * 停止所有定时任务
   */
  stop() {
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
    logger.info('定时任务已停止');
  }

  /**
   * 热搜股票更新任务
   * 交易日每15分钟更新一次（9:30-15:00）
   */
  private startHotStockUpdateJob() {
    // 每15分钟执行一次
    const cronExpression = process.env.CRON_UPDATE_INTERVAL || '*/15 9-15 * * 1-5';
    
    this.updateJob = cron.schedule(cronExpression, async () => {
      try {
        // 检查是否是交易日
        if (!isTradingDay()) {
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
  async manualUpdate(): Promise<number> {
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
  private startBreakthroughScanJob() {
    // 每个交易日15:30执行
    const cronExpression = '30 15 * * 1-5';
    
    this.breakthroughJob = cron.schedule(cronExpression, async () => {
      try {
        // 检查是否是交易日
        if (!isTradingDay()) {
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
   * 交易日收盘后执行（15:35），生成次日入场信号
   */
  private startSignalGenerateJob() {
    // 每个交易日15:35执行
    const cronExpression = '35 15 * * 1-5';
    
    this.signalGenerateJob = cron.schedule(cronExpression, async () => {
      try {
        if (!isTradingDay()) {
          logger.info('非交易日，跳过信号生成');
          return;
        }

        logger.info('开始执行盘后信号生成任务');
        
        // 当天是 Day2，生成 Day3 的入场信号
        const today = formatDate(new Date(), 'YYYYMMDD');
        const count = await tradingSignalService.generateSignalsAfterMarketClose(today);
        
        logger.info(`盘后信号生成完成，共 ${count} 个信号`);
      } catch (error) {
        logger.error(`盘后信号生成失败: ${(error as Error).message}`);
      }
    }, {
      timezone: 'Asia/Shanghai',
    });

    logger.info(`盘后信号生成任务已配置，Cron表达式: ${cronExpression}`);
  }

  /**
   * 集合竞价后入场条件更新任务
   * 交易日09:26执行，更新今日信号的入场条件
   */
  private startAuctionUpdateJob() {
    // 每个交易日09:26执行（集合竞价后1分钟）
    const cronExpression = '26 9 * * 1-5';
    
    this.auctionJob = cron.schedule(cronExpression, async () => {
      try {
        if (!isTradingDay()) {
          logger.info('非交易日，跳过入场条件更新');
          return;
        }

        logger.info('开始执行集合竞价后入场条件更新');
        
        const today = formatDate(new Date(), 'YYYYMMDD');
        const result = await tradingSignalService.updateSignalsAfterAuction(today);
        
        logger.info(`入场条件更新完成: 可入场=${result.ready}, 部分满足=${result.partial}, 不满足=${result.rejected}`);
      } catch (error) {
        logger.error(`入场条件更新失败: ${(error as Error).message}`);
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
  private startSentimentJob() {
    // 每个交易日15:32执行（在突破扫描之前）
    const cronExpression = '32 15 * * 1-5';
    
    this.sentimentJob = cron.schedule(cronExpression, async () => {
      try {
        if (!isTradingDay()) {
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
}

export const jobScheduler = new JobScheduler();
