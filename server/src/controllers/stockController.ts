import { Request, Response, NextFunction } from 'express';
import { stockService, dataFetchService, stockConceptService, thsStockConceptService } from '../services';
import { logger } from '../utils';

/**
 * 股票控制器
 */
export class StockController {
  /**
   * 手动触发数据抓取
   * POST /api/stocks/fetch
   */
  async fetchData(req: Request, res: Response, next: NextFunction) {
    try {
      logger.info('手动触发数据抓取');
      
      // 获取热搜股票
      const stocks = await dataFetchService.fetchHotStocks();
      
      // 保存到数据库（会自动获取行情数据）
      const savedCount = await dataFetchService.saveHotStocks(stocks);
      
      res.json({
        success: true,
        message: `成功抓取并保存 ${savedCount} 条数据`,
        count: savedCount,
      });
    } catch (error) {
      logger.error(`手动抓取数据失败: ${(error as Error).message}`);
      next(error);
    }
  }

  /**
   * 个股概念查询
   * GET /api/stocks/:code/concepts
   */
  async getStockConcepts(req: Request, res: Response, next: NextFunction) {
    try {
      const { code } = req.params;
      const includeRaw = req.query.raw === '1';

      if (!code) {
        return res.status(400).json({
          success: false,
          message: '股票代码不能为空',
        });
      }

      const concepts = await stockConceptService.fetchConcepts(code, includeRaw);

      res.json({
        success: true,
        data: concepts,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 个股概念详情查询（同花顺数据源）
   * GET /api/stocks/:code/concepts/detail
   * 返回更详细的概念信息，包括联动个股、龙头股、涨跌家数等
   */
  async getStockConceptsDetail(req: Request, res: Response, next: NextFunction) {
    try {
      const { code } = req.params;
      const { market_id, raw } = req.query;
      const includeRaw = raw === '1';

      if (!code) {
        return res.status(400).json({
          success: false,
          message: '股票代码不能为空',
        });
      }

      const concepts = await thsStockConceptService.fetchConcepts(
        code,
        market_id as string | undefined,
        includeRaw
      );

      res.json({
        success: true,
        data: concepts,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 获取今日热搜股票
   * GET /api/stocks/hot
   */
  async getHotStocks(req: Request, res: Response, next: NextFunction) {
    try {
      const { limit = 20, date } = req.query;
      
      let stocks;
      if (date && typeof date === 'string') {
        stocks = await stockService.getHotStocksByDate(date, Number(limit));
      } else {
        stocks = await stockService.getTodayHotStocks(Number(limit));
      }
      
      res.json({
        success: true,
        data: stocks,
        total: stocks.length,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 获取阶段统计
   * GET /api/stocks/period-stats
   */
  async getPeriodStats(req: Request, res: Response, next: NextFunction) {
    try {
      const { days = 7 } = req.query;
      
      const stats = await stockService.getPeriodHotStocks(Number(days));
      
      res.json({
        success: true,
        data: stats,
        total: stats.length,
        days: Number(days),
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 获取股票详情
   * GET /api/stocks/:code
   */
  async getStockDetail(req: Request, res: Response, next: NextFunction) {
    try {
      const { code } = req.params;
      
      if (!code) {
        return res.status(400).json({
          success: false,
          message: '股票代码不能为空',
        });
      }
      
      const detail = await stockService.getStockDetail(code);
      
      if (!detail.basic) {
        return res.status(404).json({
          success: false,
          message: '未找到该股票',
        });
      }
      
      res.json({
        success: true,
        data: detail,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 获取股票历史记录
   * GET /api/stocks/:code/history
   */
  async getStockHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const { code } = req.params;
      const { days = 30 } = req.query;
      
      const history = await stockService.getStockHistory(code, Number(days));
      
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
   * 获取强势股
   * GET /api/stocks/strong
   */
  async getStrongStocks(req: Request, res: Response, next: NextFunction) {
    try {
      const { minChange = 5, limit = 10 } = req.query;
      
      const stocks = await stockService.getStrongStocks(Number(minChange), Number(limit));
      
      res.json({
        success: true,
        data: stocks,
        total: stocks.length,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 搜索股票
   * GET /api/stocks/search
   */
  async searchStocks(req: Request, res: Response, next: NextFunction) {
    try {
      const { keyword, limit = 20 } = req.query;
      
      if (!keyword || typeof keyword !== 'string') {
        return res.status(400).json({
          success: false,
          message: '搜索关键词不能为空',
        });
      }
      
      const stocks = await stockService.searchStocks(keyword, Number(limit));
      
      res.json({
        success: true,
        data: stocks,
        total: stocks.length,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 获取股票新闻
   * GET /api/stocks/:code/news
   */
  async getStockNews(req: Request, res: Response, next: NextFunction) {
    try {
      const { code } = req.params;
      const { limit = 20 } = req.query;
      
      const news = await stockService.getStockNews(code, Number(limit));
      
      res.json({
        success: true,
        data: news,
        total: news.length,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const stockController = new StockController();
