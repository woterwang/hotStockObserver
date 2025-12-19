import { Request, Response, NextFunction } from 'express';
import { stockService, dataFetchService, conceptRankingService } from '../services';
import { logger } from '../utils';

/**
 * 市场数据控制器
 */
export class MarketController {
  /**
   * 获取大盘指数
   * GET /api/market/indices
   */
  async getIndices(req: Request, res: Response, next: NextFunction) {
    try {
      // 实时获取大盘指数数据
      const indices = await dataFetchService.fetchMarketIndices();
      
      res.json({
        success: true,
        data: indices,
      });
    } catch (error) {
      logger.error(`获取大盘指数失败: ${(error as Error).message}`);
      
      // 返回默认结构避免前端出错
      const defaultIndices = [
        { indexCode: '000001', indexName: '上证指数', currentPoint: 0, changePercent: 0, changePoint: 0 },
        { indexCode: '399001', indexName: '深证成指', currentPoint: 0, changePercent: 0, changePoint: 0 },
        { indexCode: '399006', indexName: '创业板指', currentPoint: 0, changePercent: 0, changePoint: 0 },
        { indexCode: '399005', indexName: '中小100', currentPoint: 0, changePercent: 0, changePoint: 0 },
      ];
      
      res.json({
        success: true,
        data: defaultIndices,
      });
    }
  }

  /**
   * 获取热门板块
   * GET /api/market/sectors
   */
  async getHotSectors(req: Request, res: Response, next: NextFunction) {
    try {
      const { limit = 10 } = req.query;
      
      // 实时获取热门板块
      const sectors = await dataFetchService.fetchHotSectors(Number(limit));
      
      res.json({
        success: true,
        data: sectors,
        total: sectors.length,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 获取市场概览（综合数据）
   * GET /api/market/overview
   */
  async getOverview(req: Request, res: Response, next: NextFunction) {
    try {
      // 并行获取所有数据，指数和板块数据实时获取
      const [indices, hotStocks, sectors, strongStocks] = await Promise.all([
        dataFetchService.fetchMarketIndices(),  // 实时获取指数
        stockService.getTodayHotStocks(20),
        dataFetchService.fetchHotSectors(10),   // 实时获取热门板块
        stockService.getStrongStocks(5, 10),
      ]);
      
      res.json({
        success: true,
        data: {
          indices,
          hotStocks,
          sectors,
          strongStocks,
          updateTime: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 获取每日概念/板块强度排名
   * GET /api/market/concepts/rank
   */
  async getConceptRanking(req: Request, res: Response, next: NextFunction) {
    try {
      const { date, limit = 20, raw } = req.query;
      const includeRaw = raw === '1';

      const ranking = await conceptRankingService.fetchDailyConceptRanking(
        typeof date === 'string' ? date : undefined,
        Number(limit),
        includeRaw,
      );

      res.json({
        success: true,
        data: ranking,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const marketController = new MarketController();
