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
import adminRoutes from './adminRoutes';

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
router.use('/admin', adminRoutes);

export default router;
