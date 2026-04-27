import cron from 'node-cron';
import { dataFetchService, priceBreakthroughService, tradingSignalService, marketSentimentService, volumeSurgeService, tradingCalendarService, marketMoodService, conceptResonanceService } from '../services';
import { buySignalService } from '../services/buySignalService';
import { thsConceptHotRankService } from '../services/thsConceptHotRankService';
import { updateCodeKline } from './updateCodeKline';
import { groupService } from '../services/groupService';
import { logger } from '../utils';
import { formatDate } from '../utils/dateUtils';
import { autoPush } from './autoGit.ts';
import dayjs from 'dayjs';

/**
 * 定时任务管理
 * 
 * 任务按时间段分类:
 * =================== 开盘前任务 (上午9点前) ===================
 * 1. 早间市场情绪数据更新任务 - 每天 08:18 执行
 *    更新市场情绪缓存，独立于集合竞价任务
 * 
 * =================== 竞价后任务 (上午9:25:18) ===================
 * 1. 集合竞价后更新入场信号任务 - 每个交易日 09:25:18 执行
 *    更新今日信号的入场条件，包括价格突破策略与放量大涨策略，并更新市场情绪数据
 * 
 * =================== 盘中任务 (上午9:30-下午15:00) ===================
 * 1. 热搜股票更新任务 - 交易日每15分钟执行一次（9:30-15:00）
 *    定期获取并保存热搜股票数据
 * 
 * =================== 收盘后任务 (下午15:16之后) ===================
 * 1. 交易日历更新任务 - 每天 15:20 执行
 *    更新交易日历缓存，明确次日是否为交易日
 * 2. 强势资金突破（放量大涨）扫描任务 - 每个交易日 15:31 执行
 *    扫描当天的放量大涨股票
 * 3. 市场情绪数据获取任务 - 每个交易日 15:32 执行
 *    获取当日市场情绪数据
 * 4. 价格突破扫描任务 - 每个交易日 15:30 执行
 *    扫描当天的价格突破股票
 * 5. 盘后信号生成任务 - 每个交易日 15:35 执行
 *    生成次日备选标的，包含多个策略（价格突破、放量大涨等）
 * 
 * =================== 晚间任务 (晚上23:58) ===================
 * 1. 每日热搜板块更新任务 - 每天 23:58 执行
 *    更新并缓存每日热搜概念和行业板块数据
 * 2. 每日自动推送代码到GitHub任务 - 每天凌晨1:00执行
 */
export class JobScheduler {
  // 开盘前任务
  private morningMoodJob: cron.ScheduledTask | null = null;

  // 竞价后任务
  private auctionJob: cron.ScheduledTask | null = null;

  // 盘中任务
  private updateJob: cron.ScheduledTask | null = null;

  // 收盘后任务
  private tradingCalendarJob: cron.ScheduledTask | null = null;
  private afterMarketJob: cron.ScheduledTask | null = null;

  // 晚间任务
  private dailyConceptUpdateJob: cron.ScheduledTask | null = null;

  /**
   * 启动所有定时任务
   */
  async start () {
    // 初始化交易日历服务
    await tradingCalendarService.init();
    // 初始化市场情绪服务
    await marketMoodService.init();

    // 按时间段启动各类任务
    this.startPreMarketJobs();
    this.startPostAuctionJobs();
    this.startMarketHoursJobs();
    this.startAfterMarketJobs();
    this.startNightJobs();
    this.startDailyKlineUpdateJob();
    // this.startAutoPushJob();

    logger.info('定时任务已启动');
  }

  /**
   * 停止所有定时任务
   */
  stop () {
    // 停止开盘前任务
    if (this.morningMoodJob) {
      this.morningMoodJob.stop();
      this.morningMoodJob = null;
    }

    // 停止竞价后任务
    if (this.auctionJob) {
      this.auctionJob.stop();
      this.auctionJob = null;
    }

    // 停止盘中任务
    if (this.updateJob) {
      this.updateJob.stop();
      this.updateJob = null;
    }

    // 停止收盘后任务
    if (this.tradingCalendarJob) {
      this.tradingCalendarJob.stop();
      this.tradingCalendarJob = null;
    }

    if (this.afterMarketJob) {
      this.afterMarketJob.stop();
      this.afterMarketJob = null;
    }

    // 停止晚间任务
    if (this.dailyConceptUpdateJob) {
      this.dailyConceptUpdateJob.stop();
      this.dailyConceptUpdateJob = null;
    }

    logger.info('定时任务已停止');
  }

  /**
   * 开盘前任务 (上午9点前)
   * ==================================================
   */
  private startPreMarketJobs () {
    // 早间市场情绪数据更新任务
    this.startMorningMoodJob();
  }

  /**
   * 竞价后任务 (上午9:25:18)
   * ==================================================
   */
  private startPostAuctionJobs () {
    // 集合竞价后更新入场信号任务
    this.startAuctionUpdateJob();
  }

  /**
   * 盘中任务 (上午9:30-下午15:00)
   * ==================================================
   */
  private startMarketHoursJobs () {
    // 热搜股票更新任务
    this.startHotStockUpdateJob();
  }

  /**
   * 收盘后任务 (下午15:16之后)
   * ==================================================
   */
  private startAfterMarketJobs () {
    // 交易日历更新任务
    this.startTradingCalendarJob();

    // 收盘后串行任务 (按顺序执行)
    this.startAfterMarketSequentialJobs();
  }

  /**
   * 晚间任务 (晚上23:58)
   * ==================================================
   */
  private startNightJobs () {
    // 每日热搜板块更新任务
    this.startDailyConceptUpdateJob();
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
   * 每日热搜板块更新任务
   * 时间: 每天 23:58 执行
   * 功能: 更新并缓存每日热搜概念和行业板块数据
   */
  private startDailyConceptUpdateJob () {
    // 每天 23:58 执行
    const cronExpression = '58 23 * * *';

    this.dailyConceptUpdateJob = cron.schedule(cronExpression, async () => {
      try {
        logger.info('开始执行每日热搜板块更新任务');

        // 更新概念板块热度排行
        logger.info('正在获取并缓存概念板块热度排行...');
        await thsConceptHotRankService.fetchConceptHotRank();

        // 更新行业板块热度排行
        logger.info('正在获取并缓存行业板块热度排行...');
        await thsConceptHotRankService.fetchIndustryHotRank();

        logger.info('每日热搜板块更新任务完成');
      } catch (error) {
        logger.error(`每日热搜板块更新任务失败: ${(error as Error).message}`);
      }
    }, {
      timezone: 'Asia/Shanghai',
    });

    logger.info(`每日热搜板块更新任务已配置，Cron表达式: ${cronExpression}`);
  }

  /**
   * 早间市场情绪数据更新任务
   * 时间: 每天 08:18 执行
   */
  private startMorningMoodJob () {
    const cronExpression = '18 8 * * *';

    this.morningMoodJob = cron.schedule(cronExpression, async () => {
      try {
        // 更新市场情绪缓存
        logger.info('开始执行早间市场情绪更新任务');
        logger.info('早间市场情绪缓存更新开始');
        const moodSuccess = await marketMoodService.updateCache();
        if (moodSuccess) {
          const moodStatus = marketMoodService.getCacheStatus();
          logger.info(`早间市场情绪更新成功，共缓存 ${moodStatus.count} 条数据，最新日期: ${moodStatus.latestDay}`);
        } else {
          logger.warn('早间市场情绪更新失败，将继续使用旧缓存');
        }
        // 初始化市场情绪服务（确保已初始化）
        await marketMoodService.init();
        // 更新K线缓存
        // 获取上一个交易
        const today = dayjs().format('YYYY-MM-DD');
        const prevDay = tradingCalendarService.getPrevTradingDay(today);
        // 更新前一交易日的K线缓存
        logger.info(`开始更新前一交易日(${prevDay})的K线缓存...`);
        await conceptResonanceService.updateKlineCacheForDate(prevDay as string);
        logger.info(`前一交易日(${prevDay})的K线缓存更新完成`);
      } catch (error) {
        logger.error(`早间市场情绪更新任务失败: ${(error as Error).message}`);
      }
    }, {
      timezone: 'Asia/Shanghai',
    });

    logger.info(`早间市场情绪任务已配置，Cron表达式: ${cronExpression}`);
  }

  /**
   * 集合竞价后更新入场信号任务
   * 时间: 每个交易日09:25:28 - 58执行
   */
  private startAuctionUpdateJob () {
    // 每个交易日09:25:58执行（集合竞价结束后18秒）
    // node-cron 支持6位表达式：秒 分 时 日 月 周
    // const cronExpression = '58 25 9 * * 1-5';
    // 9.25:58 与 9.25:28 各执行一次，确保任务能被触发 cronExpression 该怎么写？
    const cronExpression = '58 25 9 * * 1-5';
    
    this.auctionJob = cron.schedule(cronExpression, async () => {
      const today = formatDate(new Date(), 'YYYYMMDD');
      // 1.更新 主线共振 入场条件
      try {
        logger.info('开始执行集合竞价后【主线共振策略】入场条件更新');
        const conceptResonanceResult = await conceptResonanceService.getBuySignalList({ dateStr: today });
        logger.info(`[主线共振] 生成完成，共 ${conceptResonanceResult.length} 个信号，入场日=${today}`);
        // 取前3只股票作为当天的主线共振股票添加到当天的分组中
        const topThree = conceptResonanceResult.filter(item => item.strategyScore > 88).slice(0, 3).map(signal => signal.stockCode);
        // 创建分组：${日期}-主线共振
        logger.info(`[主线共振] 今日主线共振股票: ${topThree.join(', ')}`);
        const groupId = await groupService.createGroup(`${today}-主线共振`);
        // 将 topThree 股票添加到当天的主线共振分组中
        await groupService.addStocksToGroup(groupId, topThree);
      } catch (error) {
        logger.error(`[主线共振] 生成失败: ${(error as Error).message}`);
      }

      // 2. 放量大涨策略
      try {
        logger.info('开始执行集合竞价后【放量大涨策略】入场条件更新');
        const volumeSurgeResult = await buySignalService.generateBuySignals(today, undefined, 50);
        logger.info(`[放量大涨] 生成完成，共 ${volumeSurgeResult.length} 个信号，入场日=${today}`);
        // 按totalBuyScore排序
        volumeSurgeResult.sort((a, b) => b.totalBuyScore - a.totalBuyScore);
        // 取前3只股票作为当天的放量大涨股票添加到当天的分组中
        const topThree = volumeSurgeResult.filter(item => item.totalBuyScore > 70).slice(0, 3).map(signal => signal.stockCode);
        // 创建分组：${日期}-放量大涨
        logger.info(`[放量大涨] 今日放量大涨股票: ${topThree.join(', ')}`);
        const groupId = await groupService.createGroup(`${today}-放量大涨`);
        // 将 topThree 股票添加到当天的放量大涨分组中
        await groupService.addStocksToGroup(groupId, topThree);
      } catch (error) {
        logger.error(`[放量大涨] 生成失败: ${(error as Error).message}`);
      }

      // 3. 价格突破策略
      try {
        // 检查是否是交易日（使用交易日历服务，支持节假日判断）
        if (!tradingCalendarService.isTradingDayByDate()) {
          logger.info('非交易日，跳过入场条件更新');
          return;
        }

        logger.info('开始执行集合竞价后【价格突破策略】入场条件更新');
        await tradingSignalService.generateSignalsForEntryDate(today);
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
   * 热搜股票更新任务
   * 时间: 交易日每15分钟更新一次（9:30-15:00）
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
   * 交易日历更新任务
   * 时间: 每天 15:20 执行（收盘后）
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
  }

  /**
   * 收盘后串行任务 (按顺序执行各项任务)
   * 时间: 每个交易日15:30之后
   */
  private startAfterMarketSequentialJobs () {
    // 在15:30执行，将各项收盘后任务串行执行
    const cronExpression = '30 15 * * 1-5';

    this.afterMarketJob = cron.schedule(cronExpression, async () => {
      try {
        // 检查是否是交易日（使用交易日历服务，支持节假日判断）
        if (!tradingCalendarService.isTradingDayByDate()) {
          logger.info('非交易日，跳过收盘后任务');
          return;
        }

        logger.info('开始执行收盘后串行任务');

        // 1. 强势资金突破（放量大涨）扫描任务 (原15:31)
        try {
          logger.info('【第1步】开始执行强势资金突破（放量大涨）扫描任务');
          const today = formatDate(new Date(), 'YYYYMMDD');
          const count = await volumeSurgeService.scanAndSave(today);
          logger.info(`【第1步完成】强势资金突破扫描任务完成，共发现 ${count} 只符合条件的股票`);
        } catch (error) {
          logger.error(`【第1步失败】强势资金突破扫描任务失败: ${(error as Error).message}`);
        }

        // // 2. 市场情绪数据获取任务 (原15:32)
        // try {
        //   logger.info('【第2步】开始获取市场情绪数据');
        //   const today = formatDate(new Date(), 'YYYYMMDD');
        //   const sentiment = await marketSentimentService.fetchAndCalculateSentiment(today);
        //   if (sentiment) {
        //     logger.info(`【第2步完成】市场情绪获取完成: 评分=${sentiment.score}, 建议=${sentiment.advice}`);
        //   }
        // } catch (error) {
        //   logger.error(`【第2步失败】市场情绪获取失败: ${(error as Error).message}`);
        // }

        // 3. 价格突破扫描任务 (原15:30)
        try {
          logger.info('【第3步】开始执行价格突破扫描任务');
          const count = await priceBreakthroughService.scanAndSave();
          logger.info(`【第3步完成】价格突破扫描任务完成，共发现 ${count} 只突破股票`);
        } catch (error) {
          logger.error(`【第3步失败】价格突破扫描任务失败: ${(error as Error).message}`);
        }

        // 4. 盘后信号生成任务 (原15:35)
        try {
          logger.info('【第4步】开始执行集合竞价后信号生成任务（多策略）');
          // 当天是 Day2，生成 Day3 的入场信号
          // const today = formatDate(new Date(), 'YYYYMMDD');

          // const breakthroughResult = await tradingSignalService.generateSignalsAfterMarketClose(today);
          // logger.info(`【第4步完成】[价格突破] 生成完成，共 ${breakthroughResult.count} 个信号，入场日=${breakthroughResult.signalDate}`);
        } catch (error) {
          logger.error(`【第4步失败】[价格突破] 生成失败: ${(error as Error).message}`);
        }

        // 5. 主线共振扫描任务
        try {
          logger.info('【第5步】开始执行主线共振扫描任务');
          const today = formatDate(new Date(), 'YYYYMMDD');
          const count = await conceptResonanceService.scanAndSave(today);
          logger.info(`【第5步完成】主线共振扫描任务完成，共发现 ${count} 个共振信号`);
        } catch (error) {
          logger.error(`【第5步失败】主线共振扫描任务失败: ${(error as Error).message}`);
        }

        logger.info('所有收盘后串行任务执行完毕');
      } catch (error) {
        logger.error(`收盘后串行任务执行失败: ${(error as Error).message}`);
      }
    }, {
      timezone: 'Asia/Shanghai',
    });

    logger.info(`收盘后串行任务已配置，Cron表达式: ${cronExpression}`);
  }

  /**
 * 收盘后串行任务 (按顺序执行各项任务)
 * 时间: 每天凌晨5:18之后
 */
  private startDailyKlineUpdateJob () {
    // 在1:00执行，将各项收盘后任务串行执行
    const cronExpression = '18 5 * * *';
    cron.schedule(cronExpression, async () => {
      await updateCodeKline()
    })
    logger.info(`每日K线更新任务已配置，Cron表达式: ${cronExpression}`);
  }

  /** 
   * 每日推送代码到GitHub任务
   * 时间: 每天凌晨1:00执行
   */
  private startAutoPushJob () {
    // 在1:00执行，将各项收盘后任务串行执行
    const cronExpression = '0 1 * * *';
    cron.schedule(cronExpression, async () => {
      await autoPush()
    })
  }
}

export const jobScheduler = new JobScheduler();