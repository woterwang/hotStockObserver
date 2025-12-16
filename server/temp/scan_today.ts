/*
 * @Author: hp.com
 * @Date: 2025-12-15 21:15:04
 * @LastEditors: WRG
 * @LastEditTime: 2025-12-15 22:28:38
 * @😍: 😃😃
 */
import mongoose from 'mongoose';
import { volumeSurgeService } from './src/services/volumeSurgeService';
import { tradingCalendarService } from './src/services/tradingCalendarService';

async function main() {
  console.log('连接数据库...');
  await mongoose.connect('mongodb://localhost:27017/hot-stock-observer');
  
  // 初始化交易日历
  console.log('初始化交易日历...');
  await tradingCalendarService.init();
  
  const today = '20251215';
  console.log(`\n检查 ${today} 是否为交易日: ${tradingCalendarService.isTradingDay(today)}`);
  
  console.log(`\n开始扫描 ${today} 的放量大涨股票...`);
  const count = await volumeSurgeService.scanAndSave(today);
  
  console.log(`\n✅ 扫描完成，共发现 ${count} 只符合条件的股票`);
  
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('执行失败:', err);
  process.exit(1);
});
