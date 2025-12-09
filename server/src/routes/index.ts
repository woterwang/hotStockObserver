import { Router } from 'express';
import stockRoutes from './stockRoutes';
import marketRoutes from './marketRoutes';

const router = Router();

// API路由
router.use('/stocks', stockRoutes);
router.use('/market', marketRoutes);

// 健康检查
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
  });
});

export default router;
