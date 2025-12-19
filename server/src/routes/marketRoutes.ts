import { Router } from 'express';
import { marketController } from '../controllers';
import { tradingCalendarService } from '../services/tradingCalendarService';
import { marketMoodService } from '../services/marketMoodService';
import { marketSentimentService } from '../services/marketSentimentService';

const router = Router();

// 大盘指数
router.get('/indices', marketController.getIndices.bind(marketController));

// 热门板块
router.get('/sectors', marketController.getHotSectors.bind(marketController));

// 每日概念/板块强度排名
router.get('/concepts/rank', marketController.getConceptRanking.bind(marketController));

// 实时板块热度排行（同花顺数据源）
router.get('/concepts/hot', marketController.getConceptHotRank.bind(marketController));

// 市场概览
router.get('/overview', marketController.getOverview.bind(marketController));

// 交易日历 - 获取缓存状态
router.get('/trading-calendar/status', (req, res) => {
  const status = tradingCalendarService.getCacheStatus();
  res.json({
    success: true,
    data: status
  });
});

// 交易日历 - 扩展缓存（获取更长历史）
router.post('/trading-calendar/extend', async (req, res) => {
  try {
    const { years = 3 } = req.body;
    const result = await tradingCalendarService.extendCache(years);
    res.json({
      success: result.success,
      data: result,
      message: `交易日历缓存已扩展，共 ${result.count} 个交易日`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: (error as Error).message
    });
  }
});

// 市场情绪 - 获取指定日期的 mood 数据
// 优先从本地缓存获取，如果没有则从数据库获取
router.get('/mood/:dateStr', async (req, res) => {
  try {
    const { dateStr } = req.params;
    
    // 1. 优先从本地缓存获取
    const moodData = marketMoodService.getMoodData(dateStr);
    if (moodData) {
      return res.json({
        success: true,
        source: 'cache',
        data: moodData
      });
    }
    
    // 2. 本地缓存没有，尝试从数据库获取（由 fetchAndCalculateSentiment 保存）
    const sentiment = await marketSentimentService.getSentimentByDate(dateStr);
    if (sentiment) {
      // 转换为 mood 数据格式
      const dbMoodData = {
        day: sentiment.dateStr,
        strong: sentiment.score,
        ztjs: sentiment.limitUpCount || 0,
        lbgd: sentiment.maxContinuousBoard || 0,
        dfNum: sentiment.limitDownCount || 0,
        // 额外字段
        upCount: sentiment.upCount,
        downCount: sentiment.downCount,
        flatCount: sentiment.flatCount,
        upDownRatio: sentiment.upDownRatio,
        level: sentiment.level,
        advice: sentiment.advice,
      };
      return res.json({
        success: true,
        source: 'database',
        data: dbMoodData
      });
    }
    
    // 3. 都没有，返回404
    res.status(404).json({
      success: false,
      message: `未找到 ${dateStr} 的情绪数据`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: (error as Error).message
    });
  }
});

// 市场情绪 - 获取最新的 mood 数据
router.get('/mood', (req, res) => {
  try {
    const latestMood = marketMoodService.getLatestMood();
    if (latestMood) {
      const moodData = marketMoodService.getMoodData(latestMood.day);
      res.json({
        success: true,
        data: moodData
      });
    } else {
      res.status(404).json({
        success: false,
        message: '暂无情绪数据'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: (error as Error).message
    });
  }
});

export default router;
