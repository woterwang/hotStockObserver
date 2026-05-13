import { Request, Response, NextFunction } from 'express';
import { priceBreakthroughService } from '../services';
import { tradingCalendarService } from '../services/tradingCalendarService';
import { logger } from '../utils';
import { formatDate, getToday } from '../utils/dateUtils';

/**
 * 价格突破控制器
 */
export class PriceBreakthroughController {
  /**
   * 手动触发扫描
   * POST /api/breakthrough/scan
   */
  async scan(req: Request, res: Response, next: NextFunction) {
    try {
      const { date } = req.body;
      const targetDate = date || formatDate(getToday(), 'YYYYMMDD');
      
      // 检查是否为交易日
      if (!tradingCalendarService.isTradingDay(targetDate)) {
        logger.warn(`价格突破扫描跳过: ${targetDate} 非交易日`);
        return res.json({
          success: true,
          message: '非交易日，无需扫描',
          reason: '非交易日期',
          count: 0,
          data: [],
        });
      }
      
      logger.info(`手动触发价格突破扫描，日期: ${targetDate}`);
      
      const count = await priceBreakthroughService.scanAndSave(targetDate);
      
      res.json({
        success: true,
        message: `扫描完成，发现 ${count} 只价格突破股票`,
        count,
      });
    } catch (error) {
      logger.error(`价格突破扫描失败: ${(error as Error).message}`);
      next(error);
    }
  }

  /**
   * 获取指定日期的突破列表
   * GET /api/breakthrough/list?date=20251209
   */
  async getList(req: Request, res: Response, next: NextFunction) {
    try {
      const { date, limit = 50 } = req.query;
      
      // 如果没有指定日期，使用最新有数据的日期
      let targetDate: string;
      if (date && typeof date === 'string') {
        targetDate = date;
      } else {
        const availableDates = await priceBreakthroughService.getAvailableDates();
        if (availableDates.length === 0) {
          return res.json({
            success: true,
            data: [],
            total: 0,
            date: null,
            message: '暂无数据',
          });
        }
        targetDate = availableDates[0].replace(/-/g, '');
      }
      
      const list = await priceBreakthroughService.getBreakthroughByDate(
        targetDate,
        Number(limit)
      );
      
      res.json({
        success: true,
        data: list,
        total: list.length,
        date: targetDate,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 获取历史记录（按日期分组）
   * GET /api/breakthrough/history?days=7
   */
  async getHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const { days = 30 } = req.query;
      
      const history = await priceBreakthroughService.getRecentBreakthroughs(Number(days));
      
      res.json({
        success: true,
        data: history,
        total: history.length,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 获取可用日期列表
   * GET /api/breakthrough/dates
   */
  async getDates(req: Request, res: Response, next: NextFunction) {
    try {
      const dates = await priceBreakthroughService.getAvailableDates();
      
      res.json({
        success: true,
        data: dates,
        total: dates.length,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 批量补录历史数据
   * POST /api/breakthrough/backfill
   * Body: { startDate: "20241201", endDate?: "20241209" }
   */
  async backfill(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate } = req.body;

      if (!startDate) {
        return res.status(400).json({
          success: false,
          message: '请提供开始日期 startDate，格式 YYYYMMDD',
        });
      }

      // 验证日期格式
      if (!/^\d{8}$/.test(startDate) || (endDate && !/^\d{8}$/.test(endDate))) {
        return res.status(400).json({
          success: false,
          message: '日期格式错误，请使用 YYYYMMDD 格式',
        });
      }

      logger.info(`开始批量补录历史数据: ${startDate} - ${endDate || '今天'}`);

      const result = await priceBreakthroughService.backfillHistoricalData(
        startDate,
        endDate,
        (current, total, date, count) => {
          logger.info(`补录进度: ${current}/${total} - ${date}: ${count} 条`);
        }
      );

      res.json({
        success: true,
        message: `补录完成，成功 ${result.success} 天，失败 ${result.failed} 天`,
        data: result,
      });
    } catch (error) {
      logger.error(`批量补录失败: ${(error as Error).message}`);
      next(error);
    }
  }

  /**
   * 清除所有突破数据
   * DELETE /api/breakthrough/clear
   */
  async clearAll(req: Request, res: Response, next: NextFunction) {
    try {
      const { confirm } = req.body;

      if (confirm !== 'YES') {
        return res.status(400).json({
          success: false,
          message: '请在 body 中传入 { "confirm": "YES" } 确认清除所有数据',
        });
      }

      logger.warn('正在清除所有价格突破数据...');
      const count = await priceBreakthroughService.clearAllData();

      res.json({
        success: true,
        message: `已清除 ${count} 条价格突破记录`,
        deletedCount: count,
      });
    } catch (error) {
      logger.error(`清除数据失败: ${(error as Error).message}`);
      next(error);
    }
  }
}

export const priceBreakthroughController = new PriceBreakthroughController();
