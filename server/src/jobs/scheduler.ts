import cron from 'node-cron';
import { dataFetchService } from '../services';
import { logger } from '../utils';
import { isTradingDay, isTradingTime } from '../utils/dateUtils';

/**
 * 定时任务管理
 */
export class JobScheduler {
  private updateJob: cron.ScheduledTask | null = null;

  /**
   * 启动所有定时任务
   */
  start() {
    this.startHotStockUpdateJob();
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
}

export const jobScheduler = new JobScheduler();
