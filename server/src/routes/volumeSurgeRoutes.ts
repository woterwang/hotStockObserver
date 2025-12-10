import { Router } from 'express';
import { volumeSurgeController } from '../controllers';

const router = Router();

router.post('/scan', volumeSurgeController.scan.bind(volumeSurgeController));
router.get('/list', volumeSurgeController.getList.bind(volumeSurgeController));
router.get('/stats', volumeSurgeController.getStats.bind(volumeSurgeController));  // 新增：统计数据
router.get('/history', volumeSurgeController.getHistory.bind(volumeSurgeController));
router.get('/dates', volumeSurgeController.getDates.bind(volumeSurgeController));
router.delete('/clear', volumeSurgeController.clearAll.bind(volumeSurgeController));

export default router;
