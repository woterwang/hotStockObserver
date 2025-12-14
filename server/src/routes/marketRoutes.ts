import { Router } from 'express';
import { marketController } from '../controllers';
import { tradingCalendarService } from '../services/tradingCalendarService';

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

export default router;
