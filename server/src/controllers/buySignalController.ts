/**
 * 买入信号控制器
 */

import { Request, Response, NextFunction } from 'express';
import { buySignalService } from '../services/buySignalService';
import dayjs from 'dayjs';

class BuySignalController {
  /**
   * 生成买入信号
   * POST /api/buy-signal/generate
   */
  async generate(req: Request, res: Response, next: NextFunction) {
    try {
      const { date } = req.body;
      const targetDate = date || dayjs().format('YYYYMMDD');
      
      const signals = await buySignalService.generateBuySignals(targetDate);
      
      res.json({
        success: true,
        data: {
          count: signals.length,
          signals: signals.slice(0, 10),  // 只返回前10条
        },
        message: `成功生成 ${signals.length} 条买入信号`,
      });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * 获取买入信号列表
   * GET /api/buy-signal/list
   */
  async getList(req: Request, res: Response, next: NextFunction) {
    try {
      const { date, signal } = req.query;
      
      let signals = await buySignalService.getTodaySignals(date as string);
      
      // 按信号类型筛选
      if (signal && typeof signal === 'string') {
        signals = signals.filter(s => s.buySignal === signal);
      }
      
      res.json({
        success: true,
        data: signals,
        total: signals.length,
      });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * 获取买入信号统计
   * GET /api/buy-signal/stats
   */
  async getStats(req: Request, res: Response, next: NextFunction) {
    try {
      const { date } = req.query;
      const targetDate = (date as string) || dayjs().format('YYYYMMDD');
      
      const stats = await buySignalService.getSignalStats(targetDate);
      
      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * 更新收益跟踪
   * POST /api/buy-signal/update-tracking
   */
  async updateTracking(req: Request, res: Response, next: NextFunction) {
    try {
      const { date } = req.body;
      const targetDate = date || dayjs().format('YYYYMMDD');
      
      await buySignalService.updateProfitTracking(targetDate);
      
      res.json({
        success: true,
        message: '收益跟踪数据已更新',
      });
    } catch (error) {
      next(error);
    }
  }
}

export const buySignalController = new BuySignalController();
