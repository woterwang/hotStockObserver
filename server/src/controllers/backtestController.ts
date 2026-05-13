import { Request, Response } from 'express';
import { backtestService, BacktestConfig } from '../services/backtestService';
import { buySignalBacktestService, BuySignalBacktestConfig } from '../services/backtestBuySignalService';
import { logger } from '../utils';

/**
 * 回测控制器
 */
export const backtestController = {
  /**
   * 执行回测
   * POST /api/backtest/run
   * Body: { startDate, endDate, config? }
   */
  async runBacktest(req: Request, res: Response) {
    try {
      const { startDate, endDate, config } = req.body;

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          message: '请提供开始日期和结束日期',
        });
      }

      logger.info(`收到回测请求: ${startDate} - ${endDate}`);

      const result = await backtestService.runBacktest(startDate, endDate, config);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error(`回测执行失败: ${(error as Error).message}`);
      res.status(500).json({
        success: false,
        message: (error as Error).message,
      });
    }
  },

  /**
   * 获取默认回测配置
   * GET /api/backtest/config
   */
  async getDefaultConfig(req: Request, res: Response) {
    const defaultConfig: BacktestConfig = {
      stopLossPercent: -5,
      takeProfitPercent: 10,
      maxHoldDays: 10,
      useDay2LowAsStopLoss: true,
    };

    res.json({
      success: true,
      data: defaultConfig,
    });
  },

  /**
   * 清除K线缓存
   * DELETE /api/backtest/cache
   */
  async clearCache(req: Request, res: Response) {
    try {
      const result = backtestService.clearCache();
      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error(`清除缓存失败: ${(error as Error).message}`);
      res.status(500).json({
        success: false,
        message: (error as Error).message,
      });
    }
  },

  /**
   * 获取缓存统计
   * GET /api/backtest/cache/stats
   */
  async getCacheStats(req: Request, res: Response) {
    try {
      const stats = backtestService.getCacheStats();
      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: (error as Error).message,
      });
    }
  },

  /**
   * 执行买入信号策略回测
   * POST /api/backtest/buy-signal
   * Body: { startDate, endDate, config? }
   */
  async runBuySignalBacktest(req: Request, res: Response) {
    try {
      const { startDate, endDate, config } = req.body;

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          message: '请提供开始日期和结束日期',
        });
      }

      logger.info(`收到买入信号回测请求: ${startDate} - ${endDate}`);
      logger.info(`传入配置: ${JSON.stringify(config)}`);

      const result = await buySignalBacktestService.runBacktest(startDate, endDate, config);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error(`买入信号回测执行失败: ${(error as Error).message}`);
      res.status(500).json({
        success: false,
        message: (error as Error).message,
      });
    }
  },

  /**
   * 获取买入信号回测默认配置
   * GET /api/backtest/buy-signal/config
   */
  async getBuySignalDefaultConfig(req: Request, res: Response) {
    const defaultConfig: BuySignalBacktestConfig = {
      // 注：strategyType 已移除，固定使用 volume_surge
      signalFilter: 'strong_buy',
      minSignalScore: 0,              // 最低信号评分（0=不过滤）
      basePosition: 50000,
      lowMoodPositionRatio: 0.5,
      marketMoodThreshold: 50,
      stopLossPercent: 0.05,
      takeProfitPercent: 0.20,
      maxHoldDays: 5,
      marketPanicThreshold: 40,
    };

    res.json({
      success: true,
      data: defaultConfig,
    });
  },
};
