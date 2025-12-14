import { Router } from 'express';
import { marketController } from '../controllers';
import { tradingCalendarService } from '../services/tradingCalendarService';
import { marketMoodService } from '../services/marketMoodService';

const router = Router();

// 大盘指数
router.get('/indices', marketController.getIndices.bind(marketController));

// 热门板块
router.get('/sectors', marketController.getHotSectors.bind(marketController));

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
router.get('/mood/:dateStr', (req, res) => {
  try {
    const { dateStr } = req.params;
    const moodData = marketMoodService.getMoodData(dateStr);
    if (moodData) {
      res.json({
        success: true,
        data: moodData
      });
    } else {
      res.status(404).json({
        success: false,
        message: `未找到 ${dateStr} 的情绪数据`
      });
    }
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
