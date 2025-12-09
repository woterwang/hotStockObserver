import { Router } from 'express';
import { marketSentimentController } from '../controllers/marketSentimentController';

const router = Router();

/**
 * 市场情绪路由
 */

// 获取指定日期的情绪数据
router.get('/date/:dateStr', marketSentimentController.getSentimentByDate);

// 获取最近N天情绪数据
router.get('/recent', marketSentimentController.getRecentSentiments);

// 获取情绪趋势
router.get('/trend', marketSentimentController.getSentimentTrend);

// 获取今日交易建议
router.get('/advice', marketSentimentController.getTodayAdvice);

// 手动触发获取情绪数据
router.post('/fetch', marketSentimentController.fetchSentiment);

export default router;
