import { Router } from 'express';
import { marketController } from '../controllers';

const router = Router();

// 大盘指数
router.get('/indices', marketController.getIndices.bind(marketController));

// 热门板块
router.get('/sectors', marketController.getHotSectors.bind(marketController));

// 市场概览
router.get('/overview', marketController.getOverview.bind(marketController));

export default router;
