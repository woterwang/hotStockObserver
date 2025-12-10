import { Router } from 'express';
import { tradingSignalController } from '../controllers/tradingSignalController';

const router = Router();

/**
 * 交易信号路由
 */

// 盘后生成信号（价格突破策略）
router.post('/generate', tradingSignalController.generateSignals);

// 盘后生成放量大涨策略信号
router.post('/generate-volume-surge', tradingSignalController.generateVolumeSurgeSignals);

// 集合竞价后更新入场条件
router.post('/update-entry', tradingSignalController.updateEntryConditions);

// 获取今日信号
router.get('/today', tradingSignalController.getTodaySignals);

// 获取历史信号
router.get('/history', tradingSignalController.getSignalHistory);

// 标记入场
router.post('/entry', tradingSignalController.markEntry);

// 标记退出
router.post('/exit', tradingSignalController.markExit);

export default router;
