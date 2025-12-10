/**
 * 买入信号路由
 */

import { Router } from 'express';
import { buySignalController } from '../controllers/buySignalController';

const router = Router();

// 生成买入信号
router.post('/generate', buySignalController.generate.bind(buySignalController));

// 获取买入信号列表
router.get('/list', buySignalController.getList.bind(buySignalController));

// 获取买入信号统计
router.get('/stats', buySignalController.getStats.bind(buySignalController));

// 更新收益跟踪
router.post('/update-tracking', buySignalController.updateTracking.bind(buySignalController));

export default router;
