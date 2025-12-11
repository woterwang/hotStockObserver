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
      const { date, minScore } = req.body;
      const targetDate = date || dayjs().format('YYYYMMDD');
      const scoreThreshold = minScore !== undefined ? Number(minScore) : 40;
      
      const signals = await buySignalService.generateBuySignals(targetDate, undefined, scoreThreshold);
      
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
   * @query date - 日期，格式 YYYYMMDD
   * @query signal - 信号类型筛选：strong_buy, buy, hold, pass
   * @query minScore - 最低分数门槛，默认40
   */
  async getList(req: Request, res: Response, next: NextFunction) {
    try {
      const { date, signal, minScore } = req.query;
      const scoreThreshold = minScore !== undefined ? Number(minScore) : 40;
      
      let signals = await buySignalService.getTodaySignals(date as string);
      
      // 如果没有数据，自动生成
      if (signals.length === 0 && date) {
        signals = await buySignalService.generateBuySignals(date as string, undefined, scoreThreshold);
      }
      
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

  /**
   * 批量生成历史日期买入信号
   * POST /api/buy-signal/batch-generate
   */
  async batchGenerate(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate } = req.body;
      
      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          message: '请提供开始日期和结束日期',
        });
      }

      // 生成日期列表（只包含工作日）
      const dates: string[] = [];
      let current = dayjs(startDate, 'YYYYMMDD');
      const end = dayjs(endDate, 'YYYYMMDD');

      while (current.isBefore(end) || current.isSame(end, 'day')) {
        const dayOfWeek = current.day();
        // 排除周六(6)和周日(0)
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
          dates.push(current.format('YYYYMMDD'));
        }
        current = current.add(1, 'day');
      }

      // 批量生成
      const results: { date: string; count: number; error?: string }[] = [];
      let totalGenerated = 0;
      let successDays = 0;
      let failedDays = 0;

      for (const date of dates) {
        try {
          const signals = await buySignalService.generateBuySignals(date);
          results.push({ date, count: signals.length });
          totalGenerated += signals.length;
          successDays++;
          
          // 添加延迟避免请求过快
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          results.push({ date, count: 0, error: (error as Error).message });
          failedDays++;
        }
      }

      res.json({
        success: true,
        data: {
          totalDays: dates.length,
          successDays,
          failedDays,
          totalGenerated,
          details: results,
        },
        message: `批量生成完成: ${successDays}天成功, ${failedDays}天失败, 共生成${totalGenerated}条信号`,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 获取可用日期列表（有VolumeSurge数据的日期）
   * GET /api/buy-signal/available-dates
   */
  async getAvailableDates(req: Request, res: Response, next: NextFunction) {
    try {
      const dates = await buySignalService.getAvailableDatesForGeneration();
      
      res.json({
        success: true,
        data: dates,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const buySignalController = new BuySignalController();
