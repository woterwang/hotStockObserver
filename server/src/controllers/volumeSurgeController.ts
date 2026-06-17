import { Request, Response, NextFunction } from 'express';
import { volumeSurgeService } from '../services/volumeSurgeServiceV2';
import { logger } from '../utils';

export class VolumeSurgeController {
  
  async scan(req: Request, res: Response, next: NextFunction) {
    try {
      const { date } = req.body;
      logger.info(`手动触发放量大涨扫描，日期: ${date || '今天'}`);
      const count = await volumeSurgeService.scanAndSave(date);
      res.json({
        success: true,
        message: `扫描完成，发现 ${count} 只放量大涨股票`,
        data: { count },
      });
    } catch (error) {
      logger.error(`放量大涨扫描失败: ${(error as Error).message}`);
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
        const availableDates = await volumeSurgeService.getAvailableDates();
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
      
      // 支持多种筛选方式
      let list;
      if (quality === 'high') {
        list = await volumeSurgeService.getHighQualitySignals(targetDate);
      } else if (filter === 'firstBoard') {
        list = await volumeSurgeService.getFirstBoardStocks(targetDate);
      } else if (filter === 'lowRisk') {
        list = await volumeSurgeService.getLowRiskStocks(targetDate);
      } else {
        list = await volumeSurgeService.getList(targetDate);
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

  /**
   * 获取统计数据
   */
  async getStats(req: Request, res: Response, next: NextFunction) {
    try {
      const { date } = req.query;
      let targetDate: string;
      if (date && typeof date === 'string') {
        targetDate = date;
      } else {
        const availableDates = await volumeSurgeService.getAvailableDates();
        if (availableDates.length === 0) {
          return res.json({
            success: true,
            data: null,
            message: '暂无数据',
          });
        }
        targetDate = availableDates[0].replace(/-/g, '');
      }
      
      const stats = await volumeSurgeService.getStats(targetDate);
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
      const history = await volumeSurgeService.getHistory(Number(days));
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
      const dates = await volumeSurgeService.getAvailableDates();
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
      await volumeSurgeService.clearAll();
      res.json({
        success: true,
        message: '所有放量大涨数据已清除',
      });
    } catch (error) {
      next(error);
    }
  }
}

export const volumeSurgeController = new VolumeSurgeController();
