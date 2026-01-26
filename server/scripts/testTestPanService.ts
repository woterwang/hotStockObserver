/**
 * 试盘检测服务测试脚本
 * 
 * 使用方法:
 *   npx ts-node scripts/testTestPanService.ts
 *   npx ts-node scripts/testTestPanService.ts backtest
 * 
 * 功能:
 *   1. 测试问财粗筛
 *   2. 测试K线精筛
 *   3. 测试突破确认
 *   4. 多策略对比回测
 */

import { testPanService } from '../src/services/testPanService';
import { 
  TestPanPattern, 
  TestPanPatternNames, 
  OPTIMIZED_BACKTEST_CONFIG, 
  DEFAULT_BACKTEST_CONFIG, 
  EntryMode, 
  StopLossMode,
  TestPanBacktestConfig,
  TestPanBacktestResult
} from '../src/types/testPan';

// 配置
const TEST_DATE = '20250120';  // 测试日期
const TEST_PATTERN = TestPanPattern.UPPER_SHADOW;  // 测试模式

async function testWencaiSearch() {
  console.log('\n========== 1. 测试问财粗筛 ==========\n');
  
  try {
    const candidates = await testPanService.fetchCandidatesByWencai(TEST_DATE, TEST_PATTERN);
    console.log(`问财粗筛结果: 共 ${candidates.length} 只候选股`);
    
    if (candidates.length > 0) {
      console.log('\n前 5 只候选股:');
      candidates.slice(0, 5).forEach((c, i) => {
        console.log(`  ${i + 1}. ${c.stockCode} ${c.stockName}`);
      });
    }
    
    return candidates;
  } catch (error) {
    console.error('问财搜索失败:', (error as Error).message);
    return [];
  }
}

async function testKlineConfirm(candidates: { stockCode: string; stockName: string }[]) {
  console.log('\n========== 2. 测试K线精筛确认 ==========\n');
  
  if (candidates.length === 0) {
    console.log('无候选股，跳过K线确认测试');
    return [];
  }
  
  // 只测试前 5 只
  const testCandidates = candidates.slice(0, 5);
  console.log(`测试 ${testCandidates.length} 只候选股的K线精筛...\n`);
  
  const confirmedSignals = [];
  
  for (const candidate of testCandidates) {
    try {
      const signal = await testPanService.confirmTestPanPattern(
        candidate.stockCode,
        candidate.stockName,
        TEST_DATE,
        TEST_PATTERN
      );
      
      if (signal) {
        confirmedSignals.push(signal);
        console.log(`  ✅ ${candidate.stockCode} ${candidate.stockName} - 确认为 ${signal.patternName}`);
        console.log(`     上影线率: ${signal.upperShadowRatio?.toFixed(2)}, 量比: ${signal.volumeRatio?.toFixed(2)}`);
      } else {
        console.log(`  ❌ ${candidate.stockCode} ${candidate.stockName} - K线不符合`);
      }
    } catch (error) {
      console.log(`  ⚠️ ${candidate.stockCode} ${candidate.stockName} - 检测失败: ${(error as Error).message}`);
    }
  }
  
  console.log(`\n精筛结果: ${confirmedSignals.length}/${testCandidates.length} 只通过`);
  
  return confirmedSignals;
}

async function testBreakoutCheck(signals: any[]) {
  console.log('\n========== 3. 测试突破确认 ==========\n');
  
  if (signals.length === 0) {
    console.log('无试盘信号，跳过突破确认测试');
    return;
  }
  
  console.log(`测试 ${signals.length} 个信号的突破情况...\n`);
  
  for (const signal of signals) {
    try {
      const checkedSignal = await testPanService.checkBreakoutStatus(signal, DEFAULT_BACKTEST_CONFIG.breakoutDays);
      
      console.log(`  ${signal.stockCode} ${signal.stockName}:`);
      if (checkedSignal.breakoutConfirmed) {
        console.log(`  ✅ 突破成功! 突破日: ${checkedSignal.breakoutDate}, 价格: ${checkedSignal.breakoutPrice?.toFixed(2)}`);
      } else {
        console.log(`  ❌ 未突破`);
      }
    } catch (error) {
      console.log(`  ⚠️ 检测失败: ${(error as Error).message}`);
    }
  }
}

async function testDailyDetection() {
  console.log('\n========== 4. 测试每日检测 ==========\n');
  
  console.log(`执行 ${TEST_DATE} 的 ${TestPanPatternNames[TEST_PATTERN]} 检测...\n`);
  
  try {
    const signals = await testPanService.detectDailySignals(TEST_DATE, [TEST_PATTERN]);
    
    console.log(`\n检测完成! 共发现 ${signals.length} 个试盘信号`);
    
    if (signals.length > 0) {
      console.log('\n信号列表:');
      signals.forEach((s, i) => {
        const breakoutStatus = s.breakoutConfirmed ? `✅突破(${s.breakoutDate})` : '❌未突破';
        console.log(`  ${i + 1}. ${s.stockCode} ${s.stockName} | ${s.patternName} | ${breakoutStatus}`);
      });
    }
    
    return signals;
  } catch (error) {
    console.error('每日检测失败:', (error as Error).message);
    return [];
  }
}

async function testBacktest() {
  console.log('\n========== 5. 多时段策略对比测试 ==========\n');
  
  // 定义测试时段：弱市 vs 强市
  const testPeriods = [
    { name: '🔴 弱市（2025年1月）', start: '20250101', end: '20250120', desc: '平均情绪 57.9' },
    { name: '🟢 强市（2024年10-11月）', start: '20241015', end: '20241115', desc: '平均情绪 80+' },
    { name: '🟡 中性（2024年3月）', start: '20240301', end: '20240331', desc: '平均情绪 62.5' },
  ];

  console.log(`回测模式: ${TestPanPatternNames[TEST_PATTERN]}\n`);

  // 基础策略配置
  const baseConfig = DEFAULT_BACKTEST_CONFIG;

  for (const period of testPeriods) {
    console.log('\n' + '='.repeat(70));
    console.log(`📅 ${period.name} (${period.start} - ${period.end})`);
    console.log(`   ${period.desc}`);
    console.log('='.repeat(70));

    try {
      const result = await testPanService.backtest(TEST_PATTERN, period.start, period.end, baseConfig);
      
      console.log(`\n📊 回测结果:`);
      console.log(`   总信号数: ${result.totalSignals}`);
      console.log(`   突破数: ${result.totalTrades} (突破率 ${(result.breakoutRate * 100).toFixed(1)}%)`);
      console.log(`   胜率: ${(result.winRate * 100).toFixed(1)}%`);
      console.log(`   总收益: ${(result.totalReturn * 100).toFixed(1)}%`);
      console.log(`   平均收益: ${(result.avgReturn * 100).toFixed(2)}%`);
      console.log(`   盈亏比: ${result.profitLossRatio.toFixed(2)}`);
      console.log(`   最大盈利: +${(result.maxReturn * 100).toFixed(1)}%`);
      console.log(`   最大亏损: ${(result.maxLoss * 100).toFixed(1)}%`);
      
      // 计算期望值
      const expectancy = result.winRate * result.avgReturn * 100;
      console.log(`   期望值: ${expectancy > 0 ? '+' : ''}${expectancy.toFixed(2)}% (胜率×平均收益)`);
      
      if (result.totalReturn > 0) {
        console.log(`   ✅ 该时段策略盈利！`);
      } else if (result.winRate >= 0.5) {
        console.log(`   ⚠️ 胜率尚可，但总体亏损`);
      } else {
        console.log(`   ❌ 该时段策略亏损`);
      }
    } catch (error) {
      console.error(`   回测失败: ${(error as Error).message}`);
    }
  }

  // ===== 综合结论 =====
  console.log('\n\n' + '='.repeat(70));
  console.log('📋 【综合结论】');
  console.log('='.repeat(70));
  console.log(`
根据不同市场环境的回测结果，可以得出以下结论：

1. 如果强市（情绪80+）策略也亏损 → 该策略不适合实盘
2. 如果强市盈利、弱市亏损 → 可作为牛市辅助策略
3. 如果各市场环境都盈利 → 可考虑实盘

建议关注：
- 强市胜率是否显著高于弱市
- 强市的盈亏比是否更优
- 信号数量是否足够（太少可能是偶然）
`);
}

async function main() {
  console.log('╔════════════════════════════════════════════╗');
  console.log('║       试盘检测服务测试脚本                  ║');
  console.log('╚════════════════════════════════════════════╝');
  console.log(`\n测试日期: ${TEST_DATE}`);
  console.log(`测试模式: ${TestPanPatternNames[TEST_PATTERN]}`);
  
  // 选择测试项目
  const testMode = process.argv[2] || 'all';
  
  switch (testMode) {
    case 'wencai':
      await testWencaiSearch();
      break;
      
    case 'kline':
      const candidates1 = await testWencaiSearch();
      await testKlineConfirm(candidates1);
      break;
      
    case 'detect':
      await testDailyDetection();
      break;
      
    case 'backtest':
      await testBacktest();
      break;
      
    case 'all':
    default:
      // 分步测试
      const candidates = await testWencaiSearch();
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const signals = await testKlineConfirm(candidates);
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      await testBreakoutCheck(signals);
      
      // 完整每日检测（可选，耗时较长）
      // await testDailyDetection();
      
      // 回测（可选，耗时较长）
      // await testBacktest();
      break;
  }
  
  console.log('\n========== 测试完成 ==========\n');
}

main().catch(console.error);
