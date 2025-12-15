/**
 * 手动执行集合竞价后入场条件更新
 */

import mongoose from 'mongoose';
import { tradingSignalService, tradingCalendarService, marketMoodService } from './src/services';
import { formatDate } from './src/utils/dateUtils';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hot-stock-observer';

async function updateAuction() {
  console.log('========================================');
  console.log('手动执行集合竞价后入场条件更新');
  console.log('========================================\n');

  // 连接数据库
  await mongoose.connect(MONGODB_URI);
  console.log('✅ 数据库连接成功\n');

  // 初始化服务
  await tradingCalendarService.init();
  await marketMoodService.init();

  const today = formatDate(new Date(), 'YYYYMMDD');
  console.log('更新日期:', today, '\n');
  
  const result = await tradingSignalService.updateSignalsAfterAuction(today);
  
  console.log('\n========================================');
  console.log('入场条件更新完成:');
  console.log('  可入场 (ready):', result.ready);
  console.log('  部分满足 (partial):', result.partial);
  console.log('  不满足 (rejected):', result.rejected);
  console.log('========================================\n');

  await mongoose.disconnect();
  process.exit(0);
}

updateAuction().catch(err => {
  console.error('错误:', err);
  process.exit(1);
});
