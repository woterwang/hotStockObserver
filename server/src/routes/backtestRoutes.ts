import { Router } from 'express';
import { backtestController } from '../controllers/backtestController';

const router = Router();

/**
 * 回测路由
 */

// 执行回测（突破三天策略）
router.post('/run', backtestController.runBacktest);

// 执行买入信号策略回测
router.post('/buy-signal', backtestController.runBuySignalBacktest);

// 获取买入信号回测默认配置
router.get('/buy-signal/config', backtestController.getBuySignalDefaultConfig);

// 获取默认配置
router.get('/config', backtestController.getDefaultConfig);

// 清除K线缓存
router.delete('/cache', backtestController.clearCache);

// 获取缓存统计
router.get('/cache/stats', backtestController.getCacheStats);

export default router;
