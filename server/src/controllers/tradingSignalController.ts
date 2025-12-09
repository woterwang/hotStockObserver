import { Request, Response } from 'express';
import { tradingSignalService } from '../services';
import { logger } from '../utils';
import { formatDate } from '../utils/dateUtils';

/**
 * 交易信号控制器
 */
export const tradingSignalController = {
  /**
   * 生成交易信号
   * POST /api/signals/generate
   * Body: { date: 'YYYYMMDD' } - Day3日期（入场日，页面选择的日期）
   */
  async generateSignals(req: Request, res: Response) {
    try {
      const { date } = req.body;
      
      if (!date) {
        return res.status(400).json({
          success: false,
          message: '请提供日期参数（入场日 Day3）',
        });
      }

      logger.info(`手动触发信号生成，入场日: ${date}`);
      // 使用新方法：传入 Day3，自动往前推算 Day1、Day2
      const result = await tradingSignalService.generateSignalsForEntryDate(date);

      res.json({
        success: true,
        message: `已生成 ${result.count} 个交易信号`,
        data: {
          count: result.count,
          signalDate: result.signalDate,  // 入场日期（Day3）
          day1: result.day1,              // 突破日
          day2: result.day2,              // 确认日
        },
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
   * GET /api/signals/today?date=YYYYMMDD&strategy=breakthrough_3day
   * date 参数是 Day3（入场日），返回的 day2DateStr 用于获取市场情绪
   * strategy 可选，筛选特定策略的信号
   */
  async getTodaySignals(req: Request, res: Response) {
    try {
      const date = (req.query.date as string) || formatDate(new Date(), 'YYYYMMDD');
      const strategy = req.query.strategy as string | undefined;
      
      let signals = await tradingSignalService.getTodaySignals(date);
      
      // 如果指定了策略，筛选该策略的信号
      if (strategy) {
        signals = signals.filter(s => s.strategy === strategy);
      }

      // 统计各状态数量
      const summary = {
        total: signals.length,
        ready: signals.filter(s => s.status === 'ready').length,
        partial: signals.filter(s => s.status === 'partial').length,
        pending: signals.filter(s => s.status === 'pending').length,
        rejected: signals.filter(s => s.status === 'rejected').length,
      };

      // 从信号中提取 Day2 日期（用于获取市场情绪）
      let day2DateStr: string | null = null;
      if (signals.length > 0 && signals[0].day2Date) {
        day2DateStr = formatDate(new Date(signals[0].day2Date), 'YYYYMMDD');
      }

      res.json({
        success: true,
        data: {
          date,        // Day3（入场日）
          day2DateStr, // Day2（确认日）- 用于获取市场情绪
          strategy,    // 当前筛选的策略
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
