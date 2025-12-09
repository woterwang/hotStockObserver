import { Router } from 'express';
import stockRoutes from './stockRoutes';
import marketRoutes from './marketRoutes';
import breakthroughRoutes from './breakthroughRoutes';
import backtestRoutes from './backtestRoutes';
import signalRoutes from './signalRoutes';

const router = Router();

// API路由
router.use('/stocks', stockRoutes);
router.use('/market', marketRoutes);
router.use('/breakthrough', breakthroughRoutes);
router.use('/backtest', backtestRoutes);
router.use('/signals', signalRoutes);

// 健康检查
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
  });
});

export default router;
