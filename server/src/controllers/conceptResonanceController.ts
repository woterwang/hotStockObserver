/**
 * 主线共振（Concept Resonance）策略控制器
 */
import { Request, Response, NextFunction } from 'express';
import { conceptResonanceService } from '../services/conceptResonanceService';
import { logger } from '../utils';

export class ConceptResonanceController {
  
  /**
   * 手动触发扫描
   * POST /api/concept-resonance/scan
   */
  async scan(req: Request, res: Response, next: NextFunction) {
    try {
      const { date } = req.body;
      logger.info(`[ConceptResonance] 手动触发扫描，日期: ${date || '今天'}`);
      const count = await conceptResonanceService.scanAndSave(date);
      res.json({
        success: true,
        message: `扫描完成，发现 ${count} 只主线共振股票`,
        data: { count },
      });
    } catch (error) {
      logger.error(`[ConceptResonance] 扫描失败: ${(error as Error).message}`);
      next(error);
    }
  }

  /**
   * 获取选股列表
   * GET /api/concept-resonance/list
   */
  async getList(req: Request, res: Response, next: NextFunction) {
    try {
      const { date, quality, filter } = req.query;
      let targetDate: string;
      
      if (date && typeof date === 'string') {
        targetDate = date;
      } else {
        const availableDates = await conceptResonanceService.getAvailableDates();
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
        list = await conceptResonanceService.getHighQualitySignals(targetDate);
      } else if (filter === 'leader') {
        list = await conceptResonanceService.getLeaderStocks(targetDate);
      } else if (filter === 'hotConcept') {
        list = await conceptResonanceService.getHotConceptStocks(targetDate);
      } else {
        list = await conceptResonanceService.getList(targetDate);
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
   * GET /api/concept-resonance/stats
   */
  async getStats(req: Request, res: Response, next: NextFunction) {
    try {
      const { date } = req.query;
      let targetDate: string;
      
      if (date && typeof date === 'string') {
        targetDate = date;
      } else {
        const availableDates = await conceptResonanceService.getAvailableDates();
        if (availableDates.length === 0) {
          return res.json({
            success: true,
            data: null,
            message: '暂无数据',
          });
        }
        targetDate = availableDates[0].replace(/-/g, '');
      }
      
      const stats = await conceptResonanceService.getStats(targetDate);
      res.json({
        success: true,
        data: stats,
        date: targetDate,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 获取龙头股列表
   * GET /api/concept-resonance/leaders
   */
  async getLeaders(req: Request, res: Response, next: NextFunction) {
    try {
      const { date } = req.query;
      let targetDate: string;
      
      if (date && typeof date === 'string') {
        targetDate = date;
      } else {
        const availableDates = await conceptResonanceService.getAvailableDates();
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
      
      const list = await conceptResonanceService.getLeaderStocks(targetDate);
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
   * 获取可用日期列表
   * GET /api/concept-resonance/dates
   */
  async getDates(req: Request, res: Response, next: NextFunction) {
    try {
      const dates = await conceptResonanceService.getAvailableDates();
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
   * 获取/更新配置
   * GET/PUT /api/concept-resonance/config
   */
  async getConfig(req: Request, res: Response, next: NextFunction) {
    try {
      const config = conceptResonanceService.getConfig();
      res.json({
        success: true,
        data: config,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateConfig(req: Request, res: Response, next: NextFunction) {
    try {
      const { beta, hotTopN, strengthTopN, deepScanLimit, concurrencyLimit } = req.body;
      
      const updates: any = {};
      if (typeof beta === 'number') updates.beta = beta;
      if (typeof hotTopN === 'number') updates.hotTopN = hotTopN;
      if (typeof strengthTopN === 'number') updates.strengthTopN = strengthTopN;
      if (typeof deepScanLimit === 'number') updates.deepScanLimit = deepScanLimit;
      if (typeof concurrencyLimit === 'number') updates.concurrencyLimit = concurrencyLimit;
      
      if (Object.keys(updates).length > 0) {
        conceptResonanceService.updateConfig(updates);
      }
      
      res.json({
        success: true,
        data: conceptResonanceService.getConfig(),
        message: '配置已更新',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 清空所有数据
   * DELETE /api/concept-resonance/clear
   */
  async clearAll(req: Request, res: Response, next: NextFunction) {
    try {
      await conceptResonanceService.clearAll();
      res.json({
        success: true,
        message: '所有主线共振数据已清空',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 策略回测
   * POST /api/concept-resonance/backtest
   */
  async backtest(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, config } = req.body;
      
      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          message: '请提供回测日期范围',
        });
      }
      
      logger.info(`[ConceptResonance] 开始回测，日期范围: ${startDate} - ${endDate}`);
      
      const result = await conceptResonanceService.backtest(startDate, endDate, config || {});
      
      res.json({
        success: true,
        data: result,
        message: `回测完成，共 ${result.totalTrades} 笔交易`,
      });
    } catch (error) {
      logger.error(`[ConceptResonance] 回测失败: ${(error as Error).message}`);
      next(error);
    }
  }
}

export const conceptResonanceController = new ConceptResonanceController();
