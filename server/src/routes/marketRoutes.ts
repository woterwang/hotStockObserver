import { Router } from 'express';
import { marketController } from '../controllers';
import { tradingCalendarService } from '../services/tradingCalendarService';
import { marketMoodService } from '../services/marketMoodService';
import { marketSentimentService } from '../services/marketSentimentService';
import { thsConceptHotRankService } from '../services/thsConceptHotRankService';
import fs from 'fs';
import path from 'path';

const router = Router();

// 大盘指数
router.get('/indices', marketController.getIndices.bind(marketController));

// 热门板块
router.get('/sectors', marketController.getHotSectors.bind(marketController));

// 每日概念/板块强度排名
router.get('/concepts/rank', marketController.getConceptRanking.bind(marketController));

// 实时板块热度排行（同花顺数据源）
router.get('/concepts/hot', marketController.getConceptHotRank.bind(marketController));

// 历史概念热度排行
router.get('/concepts/history/:date/:type', async (req, res) => {
  try {
    const { date, type } = req.params;
    
    // 验证 type 参数
    if (type !== 'concept' && type !== 'industry') {
      return res.status(400).json({
        success: false,
        message: '类型参数必须是 concept 或 industry'
      });
    }

    // 从缓存中读取数据
    const cacheKey = `${date}_${type}`;
    const cachedData = thsConceptHotRankService.readFromCache(cacheKey);

    if (cachedData) {
      return res.json({
        success: true,
        data: cachedData,
        source: 'cache'
      });
    }

    res.status(404).json({
      success: false,
      message: `未找到 ${date} 的 ${type} 类型数据`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: (error as Error).message
    });
  }
});

// 获取可用的历史数据日期列表
router.get('/concepts/history/dates', async (req, res) => {
  try {
    const cacheDir = path.join(__dirname, '../../data/concept_cache');
    
    if (!fs.existsSync(cacheDir)) {
      return res.json({
        success: true,
        data: []
      });
    }

    const files = fs.readdirSync(cacheDir);
    const dates = files
      .filter(file => file.endsWith('.json'))
      .map(file => file.split('_')[0]) // 提取日期部分
      .sort()
      .reverse();

    res.json({
      success: true,
      data: dates
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: (error as Error).message
    });
  }
});

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
