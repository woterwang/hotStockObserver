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

  async generateSignals(req: Request, res: Response, next: NextFunction) {
    try {
      const { date, minScore } = req.body;
      const scoreThreshold = minScore !== undefined ? Number(minScore) : 70;

      const signals = await hundredDayHighService.generateSignals(date, scoreThreshold);

      res.json({
        success: true,
        data: {
          count: signals.length,
          signals: signals.slice(0, 10),
        },
        message: `成功生成 ${signals.length} 条百日新高买入信号`,
      });
    } catch (error) {
      logger.error(`[百日新高] 生成信号失败: ${(error as Error).message}`);
      next(error);
    }
  }

  async getSignalList(req: Request, res: Response, next: NextFunction) {
    try {
      const { date } = req.query;
      let targetDate: string;

      if (date && typeof date === 'string') {
        targetDate = date;
      } else {
        const availableDates = await hundredDayHighService.getSignalAvailableDates();
        if (availableDates.length === 0) {
          return res.json({
            success: true,
            data: [],
            total: 0,
            date: null,
            message: '暂无信号数据',
          });
        }
        targetDate = availableDates[0].date;
      }

      const list = await hundredDayHighService.getSignalList(targetDate);

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

  async getSignalStats(req: Request, res: Response, next: NextFunction) {
    try {
      const { date } = req.query;
      let targetDate: string;

      if (date && typeof date === 'string') {
        targetDate = date;
      } else {
        const availableDates = await hundredDayHighService.getSignalAvailableDates();
        if (availableDates.length === 0) {
          return res.json({
            success: true,
            data: {
              total: 0,
              strongBuy: 0,
              buy: 0,
              hold: 0,
              pass: 0,
              avgScore: 0,
            },
            date: null,
          });
        }
        targetDate = availableDates[0].date;
      }

      const stats = await hundredDayHighService.getSignalStats(targetDate);

      res.json({
        success: true,
        data: stats,
        date: targetDate,
      });
    } catch (error) {
      next(error);
    }
  }

  async getSignalAvailableDates(req: Request, res: Response, next: NextFunction) {
    try {
      const dates = await hundredDayHighService.getSignalAvailableDates();
      res.json({
        success: true,
        data: dates,
      });
    } catch (error) {
      next(error);
    }
  }

  async batchGenerateSignals(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, minScore } = req.body;

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          message: '请提供开始日期和结束日期',
        });
      }

      const scoreThreshold = minScore !== undefined ? Number(minScore) : 70;
      const result = await hundredDayHighService.batchGenerateSignals(startDate, endDate, scoreThreshold);

      if (result.totalDays === 0) {
        return res.status(400).json({
          success: false,
          message: '指定日期范围内没有交易日，请检查交易日历缓存',
        });
      }

      res.json({
        success: true,
        data: result,
        message: `批量生成完成: ${result.successDays}天成功, ${result.failedDays}天失败, 共生成${result.totalGenerated}条信号`,
      });
    } catch (error) {
      logger.error(`[百日新高] 批量生成信号失败: ${(error as Error).message}`);
      next(error);
    }
  }

  async backtest(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, config } = req.body;

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          message: '请提供回测日期范围',
        });
      }

      logger.info(`[百日新高] 开始回测，日期范围: ${startDate} - ${endDate}`);
      const result = await hundredDayHighService.backtest(startDate, endDate, config || {});

      res.json({
        success: true,
        data: result,
        message: `回测完成，共 ${result.totalTrades} 笔交易`,
      });
    } catch (error) {
      logger.error(`[百日新高] 回测失败: ${(error as Error).message}`);
      next(error);
    }
  }
}

export const hundredDayHighController = new HundredDayHighController();
