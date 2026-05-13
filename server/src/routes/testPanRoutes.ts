import { Router, Request, Response } from 'express';
import { testPanService } from '../services/testPanService';
import { TestPanPattern } from '../types/testPan';
import { logger } from '../utils';

const router = Router();

/**
 * GET /api/testpan/signals
 * 获取指定日期的试盘信号
 * Query: date (YYYYMMDD)
 */
router.get('/signals', async (req: Request, res: Response) => {
  try {
    const dateStr = String(req.query.date || '').replace(/[-/]/g, '');
    
    if (!dateStr || dateStr.length !== 8) {
      return res.status(400).json({
        success: false,
        error: '请提供有效的日期参数 (YYYYMMDD)',
      });
    }

    const signals = await testPanService.loadDailySignals(dateStr);
    
    res.json({
      success: true,
      data: {
        date: dateStr,
        count: signals.length,
        signals,
      },
    });
  } catch (error) {
    logger.error(`获取试盘信号失败: ${(error as Error).message}`);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * GET /api/testpan/signals/:code
 * 获取指定股票的试盘历史
 */
router.get('/signals/:code', async (req: Request, res: Response) => {
  try {
    const stockCode = req.params.code;
    const startDate = String(req.query.startDate || '').replace(/[-/]/g, '');
    const endDate = String(req.query.endDate || '').replace(/[-/]/g, '');

    // 这里需要遍历所有日期文件查找该股票的信号
    // 简化实现：返回提示信息
    res.json({
      success: true,
      message: '此接口待完善，请使用日期查询接口',
      stockCode,
    });
  } catch (error) {
    logger.error(`获取股票试盘历史失败: ${(error as Error).message}`);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * POST /api/testpan/detect
 * 触发指定日期的试盘检测
 * Body: { date: string, patterns?: string[] }
 */
router.post('/detect', async (req: Request, res: Response) => {
  try {
    const { date, patterns } = req.body;
    const dateStr = String(date || '').replace(/[-/]/g, '');

    if (!dateStr || dateStr.length !== 8) {
      return res.status(400).json({
        success: false,
        error: '请提供有效的日期参数 (YYYYMMDD)',
      });
    }

    // 解析模式参数
    let targetPatterns: TestPanPattern[] | undefined;
    if (patterns && Array.isArray(patterns)) {
      targetPatterns = patterns.filter(p => Object.values(TestPanPattern).includes(p as TestPanPattern)) as TestPanPattern[];
    }

    logger.info(`[API] 触发试盘检测 ${dateStr}, 模式: ${targetPatterns?.join(', ') || '全部'}`);

    // 执行检测
    const signals = await testPanService.detectDailySignals(dateStr, targetPatterns);

    res.json({
      success: true,
      data: {
        date: dateStr,
        count: signals.length,
        signals,
      },
    });
  } catch (error) {
    logger.error(`试盘检测失败: ${(error as Error).message}`);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * POST /api/testpan/backtest
 * 执行回测
 * Body: { pattern: string, startDate: string, endDate: string, config?: object }
 */
router.post('/backtest', async (req: Request, res: Response) => {
  try {
    const { pattern, startDate, endDate, config } = req.body;

    if (!pattern || !Object.values(TestPanPattern).includes(pattern as TestPanPattern)) {
      return res.status(400).json({
        success: false,
        error: '请提供有效的试盘模式 (upper_shadow, lower_shadow, wide_shock, limit_up_open)',
      });
    }

    const normalizedStart = String(startDate || '').replace(/[-/]/g, '');
    const normalizedEnd = String(endDate || '').replace(/[-/]/g, '');

    if (!normalizedStart || !normalizedEnd || normalizedStart.length !== 8 || normalizedEnd.length !== 8) {
      return res.status(400).json({
        success: false,
        error: '请提供有效的开始和结束日期 (YYYYMMDD)',
      });
    }

    logger.info(`[API] 触发回测 ${pattern}, ${normalizedStart} - ${normalizedEnd}`);

    // 执行回测
    const result = await testPanService.backtest(
      pattern as TestPanPattern,
      normalizedStart,
      normalizedEnd,
      config
    );

    res.json({
      success: true,
      data: {
        pattern: result.pattern,
        patternName: result.patternName,
        startDate: result.startDate,
        endDate: result.endDate,
        // 汇总数据
        summary: {
          totalSignals: result.totalSignals,
          breakoutCount: result.breakoutCount,
          breakoutRate: (result.breakoutRate * 100).toFixed(2) + '%',
          totalTrades: result.totalTrades,
          winTrades: result.winTrades,
          lossTrades: result.lossTrades,
          winRate: (result.winRate * 100).toFixed(2) + '%',
          totalReturn: (result.totalReturn * 100).toFixed(2) + '%',
          avgReturn: (result.avgReturn * 100).toFixed(2) + '%',
          avgWinReturn: (result.avgWinReturn * 100).toFixed(2) + '%',
          avgLossReturn: (result.avgLossReturn * 100).toFixed(2) + '%',
          profitLossRatio: result.profitLossRatio.toFixed(2),
          maxReturn: (result.maxReturn * 100).toFixed(2) + '%',
          maxLoss: (result.maxLoss * 100).toFixed(2) + '%',
        },
        // 交易明细数量（不返回全部明细避免响应过大）
        tradesCount: result.trades.length,
      },
    });
  } catch (error) {
    logger.error(`回测失败: ${(error as Error).message}`);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * GET /api/testpan/backtest/results
 * 获取回测结果列表
 */
router.get('/backtest/results', async (req: Request, res: Response) => {
  try {
    const results = await testPanService.listBacktestResults();
    
    res.json({
      success: true,
      data: {
        count: results.length,
        files: results,
      },
    });
  } catch (error) {
    logger.error(`获取回测结果列表失败: ${(error as Error).message}`);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * GET /api/testpan/backtest/result/:fileName
 * 获取指定回测结果详情
 */
router.get('/backtest/result/:fileName', async (req: Request, res: Response) => {
  try {
    const fileName = req.params.fileName;
    const result = await testPanService.loadBacktestResult(fileName);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: '未找到指定的回测结果',
      });
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error(`获取回测结果详情失败: ${(error as Error).message}`);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * GET /api/testpan/patterns
 * 获取支持的试盘模式列表
 */
router.get('/patterns', (req: Request, res: Response) => {
  const patterns = Object.values(TestPanPattern).map(p => ({
    code: p,
    name: {
      [TestPanPattern.UPPER_SHADOW]: '长上影线试盘',
      [TestPanPattern.LOWER_SHADOW]: '长下影线试盘',
      [TestPanPattern.WIDE_SHOCK]: '宽幅震荡试盘',
      [TestPanPattern.LIMIT_UP_OPEN]: '涨停开板试盘',
    }[p],
  }));

  res.json({
    success: true,
    data: patterns,
  });
});

export default router;
