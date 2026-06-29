import { Router } from 'express';
import { hundredDayHighController } from '../controllers/hundredDayHighController';

const router = Router();

router.post('/scan', hundredDayHighController.scan.bind(hundredDayHighController));
router.post('/backtest', hundredDayHighController.backtest.bind(hundredDayHighController));
router.get('/list', hundredDayHighController.getList.bind(hundredDayHighController));
router.get('/stats', hundredDayHighController.getStats.bind(hundredDayHighController));
router.get('/history', hundredDayHighController.getHistory.bind(hundredDayHighController));
router.get('/dates', hundredDayHighController.getDates.bind(hundredDayHighController));
router.delete('/clear', hundredDayHighController.clearAll.bind(hundredDayHighController));

export default router;
