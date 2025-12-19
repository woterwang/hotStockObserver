/**
 * 主线共振（Concept Resonance）策略路由
 */
import { Router } from 'express';
import { conceptResonanceController } from '../controllers/conceptResonanceController';

const router = Router();

// 扫描
router.post('/scan', conceptResonanceController.scan.bind(conceptResonanceController));

// 查询
router.get('/list', conceptResonanceController.getList.bind(conceptResonanceController));
router.get('/stats', conceptResonanceController.getStats.bind(conceptResonanceController));
router.get('/leaders', conceptResonanceController.getLeaders.bind(conceptResonanceController));
router.get('/dates', conceptResonanceController.getDates.bind(conceptResonanceController));

// 配置
router.get('/config', conceptResonanceController.getConfig.bind(conceptResonanceController));
router.put('/config', conceptResonanceController.updateConfig.bind(conceptResonanceController));

// 回测
router.post('/backtest', conceptResonanceController.backtest.bind(conceptResonanceController));

// 清空
router.delete('/clear', conceptResonanceController.clearAll.bind(conceptResonanceController));

export default router;
