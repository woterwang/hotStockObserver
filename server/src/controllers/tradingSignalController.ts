import { Request, Response } from 'express';
import { tradingSignalService } from '../services';
import { logger } from '../utils';
import { formatDate } from '../utils/dateUtils';

/**
 * 交易信号控制器
 */
export const tradingSignalController = {
  /**
   * 盘后生成信号（Day2收盘后执行）
   * POST /api/signals/generate
   * Body: { date: 'YYYYMMDD' } - Day2日期
   */
  async generateSignals(req: Request, res: Response) {
    try {
      const { date } = req.body;
      
      if (!date) {
        return res.status(400).json({
          success: false,
          message: '请提供日期参数 (Day2)',
        });
      }

      logger.info(`手动触发信号生成: ${date}`);
      const count = await tradingSignalService.generateSignalsAfterMarketClose(date);

      res.json({
        success: true,
        message: `已生成 ${count} 个交易信号`,
        data: { count },
      });
    } catch (error) {
      logger.error(`信号生成失败: ${(error as Error).message}`);
      res.status(500).json({
        success: false,
        message: (error as Error).message,
      });
    }
  },

  /**
   * 集合竞价后更新入场条件
   * POST /api/signals/update-entry
   * Body: { date: 'YYYYMMDD' } - Day3日期
   */
  async updateEntryConditions(req: Request, res: Response) {
    try {
      const { date } = req.body;
      
      if (!date) {
        return res.status(400).json({
          success: false,
          message: '请提供日期参数 (Day3)',
        });
      }

      logger.info(`更新入场条件: ${date}`);
      const result = await tradingSignalService.updateSignalsAfterAuction(date);

      res.json({
        success: true,
        message: `更新完成: 可入场=${result.ready}, 部分满足=${result.partial}, 不满足=${result.rejected}`,
        data: result,
      });
    } catch (error) {
      logger.error(`更新入场条件失败: ${(error as Error).message}`);
      res.status(500).json({
        success: false,
        message: (error as Error).message,
      });
    }
  },

  /**
   * 获取今日信号
   * GET /api/signals/today?date=YYYYMMDD
   */
  async getTodaySignals(req: Request, res: Response) {
    try {
      const date = (req.query.date as string) || formatDate(new Date(), 'YYYYMMDD');
      const signals = await tradingSignalService.getTodaySignals(date);

      // 统计各状态数量
      const summary = {
        total: signals.length,
        ready: signals.filter(s => s.status === 'ready').length,
        partial: signals.filter(s => s.status === 'partial').length,
        pending: signals.filter(s => s.status === 'pending').length,
        rejected: signals.filter(s => s.status === 'rejected').length,
      };

      res.json({
        success: true,
        data: {
          date,
          summary,
          signals,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: (error as Error).message,
      });
    }
  },

  /**
   * 获取信号历史
   * GET /api/signals/history?startDate=YYYYMMDD&endDate=YYYYMMDD&status=ready
   */
  async getSignalHistory(req: Request, res: Response) {
    try {
      const { startDate, endDate, status } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          message: '请提供 startDate 和 endDate',
        });
      }

      const signals = await tradingSignalService.getSignalHistory(
        startDate as string,
        endDate as string,
        status as string
      );

      res.json({
        success: true,
        data: {
          count: signals.length,
          signals,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: (error as Error).message,
      });
    }
  },

  /**
   * 标记入场
   * POST /api/signals/entry
   * Body: { stockCode, signalDate, entryPrice }
   */
  async markEntry(req: Request, res: Response) {
    try {
      const { stockCode, signalDate, entryPrice } = req.body;

      if (!stockCode || !signalDate || !entryPrice) {
        return res.status(400).json({
          success: false,
          message: '请提供 stockCode, signalDate, entryPrice',
        });
      }

      const signal = await tradingSignalService.markEntry(stockCode, signalDate, entryPrice);

      if (!signal) {
        return res.status(404).json({
          success: false,
          message: '未找到对应信号',
        });
      }

      res.json({
        success: true,
        data: signal,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: (error as Error).message,
      });
    }
  },

  /**
   * 标记退出
   * POST /api/signals/exit
   * Body: { stockCode, signalDate, exitPrice, exitReason }
   */
  async markExit(req: Request, res: Response) {
    try {
      const { stockCode, signalDate, exitPrice, exitReason } = req.body;

      if (!stockCode || !signalDate || !exitPrice) {
        return res.status(400).json({
          success: false,
          message: '请提供 stockCode, signalDate, exitPrice',
        });
      }

      const signal = await tradingSignalService.markExit(
        stockCode,
        signalDate,
        exitPrice,
        exitReason || '手动退出'
      );

      if (!signal) {
        return res.status(404).json({
          success: false,
          message: '未找到对应信号或未入场',
        });
      }

      res.json({
        success: true,
        data: signal,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: (error as Error).message,
      });
    }
  },
};
