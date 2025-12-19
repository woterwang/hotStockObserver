import { Router } from 'express';
import { stockController } from '../controllers';

const router = Router();

// 手动触发数据抓取
router.post('/fetch', stockController.fetchData.bind(stockController));

// 热搜股票列表
router.get('/hot', stockController.getHotStocks.bind(stockController));

// 阶段统计
router.get('/period-stats', stockController.getPeriodStats.bind(stockController));

// 强势股
router.get('/strong', stockController.getStrongStocks.bind(stockController));

// 搜索股票
router.get('/search', stockController.searchStocks.bind(stockController));

// 个股概念
router.get('/:code/concepts', stockController.getStockConcepts.bind(stockController));

// 股票详情
router.get('/:code', stockController.getStockDetail.bind(stockController));

// 股票历史记录
router.get('/:code/history', stockController.getStockHistory.bind(stockController));

// 股票新闻
router.get('/:code/news', stockController.getStockNews.bind(stockController));

export default router;
