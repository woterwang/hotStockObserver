import { Request, Response, NextFunction } from 'express';
import { hundredDayHighService } from '../services/newHeightService';
import { logger } from '../utils';

export class HundredDayHighController {

  async scan(req: Request, res: Response, next: NextFunction) {
    try {
      const { date } = req.body;
      logger.info(`手动触发百日新高扫描，日期: ${date || '今天'}`);
      const count = await hundredDayHighService.scanAndSave(date);
      res.json({
        success: true,
        message: `扫描完成，发现 ${count} 只百日新高股票`,
        data: { count },
      });
    } catch (error) {
      logger.error(`百日新高扫描失败: ${(error as Error).message}`);
      next(error);
    }
  }

  async getList(req: Request, res: Response, next: NextFunction) {
    try {
      const { date, quality, filter } = req.query;
      let targetDate: string;
      if (date && typeof date === 'string') {
        targetDate = date;
      } else {
        const availableDates = await hundredDayHighService.getAvailableDates();
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

      let list;
      if (quality === 'high') {
        list = await hundredDayHighService.getHighQualitySignals(targetDate);
      } else if (filter === 'firstBoard') {
        list = await hundredDayHighService.getFirstBoardStocks(targetDate);
      } else if (filter === 'lowRisk') {
        list = await hundredDayHighService.getLowRiskStocks(targetDate);
      } else {
        list = await hundredDayHighService.getList(targetDate);
      }

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

  async getStats(req: Request, res: Response, next: NextFunction) {
    try {
      const { date } = req.query;
      let targetDate: string;
      if (date && typeof date === 'string') {
        targetDate = date;
      } else {
        const availableDates = await hundredDayHighService.getAvailableDates();
        if (availableDates.length === 0) {
          return res.json({
            success: true,
            data: null,
            message: '暂无数据',
          });
        }
        targetDate = availableDates[0].replace(/-/g, '');
      }

      const stats = await hundredDayHighService.getStats(targetDate);
      res.json({
        success: true,
        data: stats,
        date: targetDate,
      });
    } catch (error) {
      next(error);
    }
  }

  async getHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const { days = 30 } = req.query;
      const history = await hundredDayHighService.getHistory(Number(days));
      res.json({
        success: true,
        data: history,
        total: history.length,
      });
    } catch (error) {
      next(error);
    }
  }

  async getDates(req: Request, res: Response, next: NextFunction) {
    try {
      const dates = await hundredDayHighService.getAvailableDates();
      res.json({
        success: true,
        data: dates,
      });
    } catch (error) {
      next(error);
    }
  }

  async clearAll(req: Request, res: Response, next: NextFunction) {
    try {
      await hundredDayHighService.clearAll();
      res.json({
        success: true,
        message: '所有百日新高数据已清除',
      });
    } catch (error) {
      next(error);
    }
  }
}

export const hundredDayHighController = new HundredDayHighController();
