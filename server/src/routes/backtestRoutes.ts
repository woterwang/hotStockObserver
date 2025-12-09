import { Router } from 'express';
import { backtestController } from '../controllers/backtestController';

const router = Router();

/**
 * 回测路由
 */

// 执行回测
router.post('/run', backtestController.runBacktest);

// 获取默认配置
router.get('/config', backtestController.getDefaultConfig);

// 清除K线缓存
router.delete('/cache', backtestController.clearCache);

// 获取缓存统计
router.get('/cache/stats', backtestController.getCacheStats);

export default router;
