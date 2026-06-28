import { Router } from 'express';
import stockRoutes from './stockRoutes';
import marketRoutes from './marketRoutes';
import breakthroughRoutes from './breakthroughRoutes';
import backtestRoutes from './backtestRoutes';
import signalRoutes from './signalRoutes';
import sentimentRoutes from './sentimentRoutes';
import volumeSurgeRoutes from './volumeSurgeRoutes';
import hundredDayHighRoutes from './hundredDayHighRoutes';
import buySignalRoutes from './buySignalRoutes';
import conceptResonanceRoutes from './conceptResonanceRoutes';
import testPanRoutes from './testPanRoutes';

const router = Router();

// API路由
router.use('/stocks', stockRoutes);
router.use('/market', marketRoutes);
router.use('/breakthrough', breakthroughRoutes);
router.use('/volume-surge', volumeSurgeRoutes);
router.use('/hundred-day-high', hundredDayHighRoutes);
router.use('/concept-resonance', conceptResonanceRoutes);  // 🆕 主线共振策略
router.use('/testpan', testPanRoutes);                     // 🆕 试盘检测与回测
router.use('/buy-signal', buySignalRoutes);
router.use('/backtest', backtestRoutes);
router.use('/signals', signalRoutes);
router.use('/sentiment', sentimentRoutes);

// 健康检查
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
  });
});

export default router;
