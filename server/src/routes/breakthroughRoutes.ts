import { Router } from 'express';
import { priceBreakthroughController } from '../controllers';

const router = Router();

// 手动触发扫描
router.post('/scan', priceBreakthroughController.scan.bind(priceBreakthroughController));

// 获取指定日期的突破列表
router.get('/list', priceBreakthroughController.getList.bind(priceBreakthroughController));

// 获取历史记录
router.get('/history', priceBreakthroughController.getHistory.bind(priceBreakthroughController));

// 获取可用日期列表
router.get('/dates', priceBreakthroughController.getDates.bind(priceBreakthroughController));

// 批量补录历史数据
router.post('/backfill', priceBreakthroughController.backfill.bind(priceBreakthroughController));

// 清除所有数据
router.delete('/clear', priceBreakthroughController.clearAll.bind(priceBreakthroughController));

export default router;
