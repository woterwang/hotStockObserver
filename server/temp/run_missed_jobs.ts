/**
 * 手动补跑今日盘后定时任务
 * 用于因交易日历缓存问题导致定时任务跳过的情况
 */

import mongoose from 'mongoose';
import { 
  priceBreakthroughService, 
  tradingSignalService, 
  marketSentimentService, 
  volumeSurgeService,
  marketMoodService,
  tradingCalendarService
} from './src/services';
import { logger } from './src/utils';
import { formatDate } from './src/utils/dateUtils';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hot_stock';

async function runMissedJobs() {
  const today = formatDate(new Date(), 'YYYYMMDD');
  console.log(`\n========================================`);
  console.log(`手动补跑盘后定时任务 - ${today}`);
  console.log(`========================================\n`);

  // 连接数据库
  console.log('【0/5】连接数据库...');
  try {
    await mongoose.connect(MONGODB_URI);
    console.log(`  ✅ 数据库连接成功: ${MONGODB_URI}`);
  } catch (error) {
    console.log(`  ❌ 数据库连接失败: ${(error as Error).message}`);
    process.exit(1);
  }

  // 初始化交易日历服务
  await tradingCalendarService.init();
  // 初始化市场情绪服务
  await marketMoodService.init();

  // 1. 更新市场情绪缓存 (原定 15:20)
  console.log('【1/5】更新市场情绪缓存...');
  try {
    const moodSuccess = await marketMoodService.updateCache();
    if (moodSuccess) {
      const moodStatus = marketMoodService.getCacheStatus();
      console.log(`  ✅ 成功，共缓存 ${moodStatus.count} 条数据，最新日期: ${moodStatus.latestDay}`);
    } else {
      console.log(`  ⚠️ 失败，将继续使用旧缓存`);
    }
  } catch (error) {
    console.log(`  ❌ 错误: ${(error as Error).message}`);
  }

  // 2. 强势资金突破扫描 (原定 15:31)
  console.log('\n【2/5】强势资金突破（放量大涨）扫描...');
  try {
    const volumeSurgeCount = await volumeSurgeService.scanAndSave(today);
    console.log(`  ✅ 完成，共发现 ${volumeSurgeCount} 只符合条件的股票`);
  } catch (error) {
    console.log(`  ❌ 错误: ${(error as Error).message}`);
  }

  // 3. 市场情绪数据获取 (原定 15:32)
  console.log('\n【3/5】获取市场情绪数据...');
  try {
    const sentiment = await marketSentimentService.fetchAndCalculateSentiment(today);
    if (sentiment) {
      console.log(`  ✅ 完成，评分=${sentiment.score}, 建议=${sentiment.advice}`);
    } else {
      console.log(`  ⚠️ 未获取到情绪数据`);
    }
  } catch (error) {
    console.log(`  ❌ 错误: ${(error as Error).message}`);
  }

  // 4. 价格突破扫描 (原定 15:30)
  console.log('\n【4/5】价格突破扫描...');
  try {
    const breakthroughCount = await priceBreakthroughService.scanAndSave();
    console.log(`  ✅ 完成，共发现 ${breakthroughCount} 只突破股票`);
  } catch (error) {
    console.log(`  ❌ 错误: ${(error as Error).message}`);
  }

  // 5. 盘后信号生成 (原定 15:35)
  console.log('\n【5/5】盘后信号生成（多策略）...');
  try {
    // 5.1 价格突破策略
    console.log('  [价格突破策略]');
    const breakthroughResult = await tradingSignalService.generateSignalsAfterMarketClose(today);
    console.log(`    ✅ 生成完成，共 ${breakthroughResult.count} 个信号，入场日=${breakthroughResult.signalDate}`);
  } catch (error) {
    console.log(`    ❌ 错误: ${(error as Error).message}`);
  }

  try {
    // 5.2 放量大涨策略
    console.log('  [放量大涨策略]');
    const volumeSurgeResult = await tradingSignalService.generateVolumeSurgeAfterMarketClose(today);
    console.log(`    ✅ 生成完成，共 ${volumeSurgeResult.count} 个信号，入场日=${volumeSurgeResult.signalDate}`);
  } catch (error) {
    console.log(`    ❌ 错误: ${(error as Error).message}`);
  }

  console.log(`\n========================================`);
  console.log(`补跑完成!`);
  console.log(`========================================\n`);

  // 关闭数据库连接
  await mongoose.disconnect();
  process.exit(0);
}

runMissedJobs().catch(err => {
  console.error('补跑脚本执行失败:', err);
  process.exit(1);
});
