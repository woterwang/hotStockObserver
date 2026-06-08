/**
 * 买入信号控制器
 */

import { Request, Response, NextFunction } from 'express';
import { buySignalService } from '../services/buySignalService';
import { tradingCalendarService } from '../services/tradingCalendarService';
import { BuySignal } from '../models/BuySignal';
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
      const scoreThreshold = minScore !== undefined ? Number(minScore) : 50;
      
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
        // signals = await buySignalService.generateBuySignals(date as string, undefined, scoreThreshold);
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

      // 生成日期列表（使用交易日历服务，支持节假日）
      const dates = tradingCalendarService.getTradingDaysInRange(startDate, endDate);
      
      if (dates.length === 0) {
        return res.status(400).json({
          success: false,
          message: '指定日期范围内没有交易日，请检查交易日历缓存',
        });
      }

      // 批量生成
      const results: { date: string; count: number; error?: string }[] = [];
      let totalGenerated = 0;
      let successDays = 0;
      let failedDays = 0;

      for (const date of dates) {
        try {
          const signals = await buySignalService.generateHistoryBuySignals(date);
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
   * 批量修复历史买入信号（先删除旧数据再重新生成）
   * POST /api/buy-signal/batch-repair
   * @body startDate - 开始日期 YYYYMMDD
   * @body endDate - 结束日期 YYYYMMDD
   * @body clearOld - 是否清除旧数据，默认true
   */
  async batchRepair(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, clearOld = true } = req.body;
      
      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          message: '请提供开始日期和结束日期',
        });
      }

      // 获取日期范围内的交易日
      const dates = tradingCalendarService.getTradingDaysInRange(startDate, endDate);
      
      if (dates.length === 0) {
        return res.status(400).json({
          success: false,
          message: '指定日期范围内没有交易日，请检查交易日历缓存',
        });
      }

      // 清除旧数据
      let deletedCount = 0;
      if (clearOld) {
        const startDateObj = dayjs(startDate, 'YYYYMMDD').startOf('day').toDate();
        const endDateObj = dayjs(endDate, 'YYYYMMDD').endOf('day').toDate();
        
        const deleteResult = await BuySignal.deleteMany({
          date: { $gte: startDateObj, $lte: endDateObj }
        });
        deletedCount = deleteResult.deletedCount || 0;
        console.log(`[BatchRepair] 已删除 ${deletedCount} 条旧的买入信号`);
      }

      // 开启批量模式（使用长间隔避免被封IP）
      buySignalService.setBatchMode(true);

      // 重新生成
      const results: { date: string; count: number; error?: string }[] = [];
      let totalGenerated = 0;
      let successDays = 0;
      let failedDays = 0;

      try {
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
      } finally {
        // 关闭批量模式
        buySignalService.setBatchMode(false);
      }

      res.json({
        success: true,
        data: {
          deletedCount,
          totalDays: dates.length,
          successDays,
          failedDays,
          totalGenerated,
          details: results,
        },
        message: `批量修复完成: 删除${deletedCount}条旧数据, ${successDays}天成功, ${failedDays}天失败, 重新生成${totalGenerated}条信号`,
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

  /**
   * 删除指定日期的买入信号数据
   * DELETE /api/buy-signal/delete?date=YYYYMMDD
   * 
    * @query date - 日期，格式 YYYYMMDD
    * @returns { message: string }
  */
  async deleteByDate(req: Request, res: Response, next: NextFunction) {
    try {
      const date = req.query.date as string;
      if (!date) {
        return res.status(400).json({ success: false, message: '日期参数不能为空' });
      }

      await buySignalService.deleteBuySignalsByDate(date);
      
      res.json({
        success: true,
        message: `删除日期 ${date} 的买入信号数据成功`,
      });
    } catch (error) {
      next(error);
    }
  }
}
export const buySignalController = new BuySignalController();
