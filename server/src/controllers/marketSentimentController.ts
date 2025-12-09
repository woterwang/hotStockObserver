import { Request, Response } from 'express';
import { marketSentimentService } from '../services/marketSentimentService';
import { logger } from '../utils';
import { formatDate } from '../utils/dateUtils';

/**
 * 市场情绪控制器
 */
export const marketSentimentController = {
  /**
   * 获取指定日期的情绪数据
   * GET /api/sentiment/date/:dateStr
   */
  async getSentimentByDate(req: Request, res: Response) {
    try {
      const { dateStr } = req.params;
      
      if (!dateStr || dateStr.length !== 8) {
        return res.status(400).json({
          success: false,
          message: '请提供有效的日期参数 (YYYYMMDD)',
        });
      }

      const sentiment = await marketSentimentService.getSentimentByDate(dateStr);

      if (!sentiment) {
        return res.status(404).json({
          success: false,
          message: `未找到 ${dateStr} 的情绪数据`,
        });
      }

      res.json({
        success: true,
        data: sentiment,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: (error as Error).message,
      });
    }
  },

  /**
   * 获取最近N天情绪数据
   * GET /api/sentiment/recent?days=30
   */
  async getRecentSentiments(req: Request, res: Response) {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const sentiments = await marketSentimentService.getRecentSentiments(days);

      res.json({
        success: true,
        data: {
          count: sentiments.length,
          sentiments,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: (error as Error).message,
      });
    }
  },

  /**
   * 获取情绪趋势
   * GET /api/sentiment/trend?days=5
   */
  async getSentimentTrend(req: Request, res: Response) {
    try {
      const days = parseInt(req.query.days as string) || 5;
      const trend = await marketSentimentService.getSentimentTrend(days);

      res.json({
        success: true,
        data: trend,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: (error as Error).message,
      });
    }
  },

  /**
   * 获取今日交易建议
   * GET /api/sentiment/advice?date=YYYYMMDD
   */
  async getTodayAdvice(req: Request, res: Response) {
    try {
      const dateStr = (req.query.date as string) || formatDate(new Date(), 'YYYYMMDD');
      const advice = await marketSentimentService.shouldExecuteStrategy(dateStr);

      res.json({
        success: true,
        data: {
          date: dateStr,
          ...advice,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: (error as Error).message,
      });
    }
  },

  /**
   * 手动触发获取情绪数据
   * POST /api/sentiment/fetch
   * Body: { date: 'YYYYMMDD' }
   */
  async fetchSentiment(req: Request, res: Response) {
    try {
      const { date } = req.body;
      const dateStr = date || formatDate(new Date(), 'YYYYMMDD');

      logger.info(`手动触发获取市场情绪: ${dateStr}`);
      const sentiment = await marketSentimentService.fetchAndCalculateSentiment(dateStr);

      if (!sentiment) {
        return res.status(500).json({
          success: false,
          message: '获取市场情绪失败',
        });
      }

      res.json({
        success: true,
        message: `情绪数据获取成功，评分 ${sentiment.score}`,
        data: sentiment,
      });
    } catch (error) {
      logger.error(`获取市场情绪失败: ${(error as Error).message}`);
      res.status(500).json({
        success: false,
        message: (error as Error).message,
      });
    }
  },
};
