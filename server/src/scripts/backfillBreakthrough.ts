/**
 * 批量补录价格突破历史数据脚本
 * 使用方法: npx ts-node src/scripts/backfillBreakthrough.ts 20241101 20241209
 */

import mongoose from 'mongoose';
import { priceBreakthroughService } from '../services';
import { logger } from '../utils';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/hot-stock-observer';

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.log('使用方法: npx ts-node src/scripts/backfillBreakthrough.ts <开始日期> [结束日期]');
    console.log('示例: npx ts-node src/scripts/backfillBreakthrough.ts 20241101 20241209');
    console.log('日期格式: YYYYMMDD');
    process.exit(1);
  }

  const startDate = args[0];
  const endDate = args[1]; // 可选，默认到今天

  // 验证日期格式
  if (!/^\d{8}$/.test(startDate)) {
    console.error('开始日期格式错误，请使用 YYYYMMDD 格式');
    process.exit(1);
  }
  if (endDate && !/^\d{8}$/.test(endDate)) {
    console.error('结束日期格式错误，请使用 YYYYMMDD 格式');
    process.exit(1);
  }

  try {
    // 连接数据库
    console.log('正在连接数据库...');
    await mongoose.connect(MONGO_URI);
    console.log('数据库连接成功');

    console.log(`\n开始补录历史数据: ${startDate} - ${endDate || '今天'}\n`);
    console.log('提示: 为防止接口被封，每次查询间隔 3-13 秒（随机）\n');
    console.log('='.repeat(60));

    const result = await priceBreakthroughService.backfillHistoricalData(
      startDate,
      endDate,
      (current, total, date, count) => {
        const progress = ((current / total) * 100).toFixed(1);
        const status = count > 0 ? `✓ ${count} 只股票` : '无数据';
        console.log(`[${progress}%] ${current}/${total} | ${date} | ${status}`);
      }
    );

    console.log('\n' + '='.repeat(60));
    console.log(`\n补录完成！`);
    console.log(`成功: ${result.success} 天`);
    console.log(`失败: ${result.failed} 天`);
    
    if (result.failed > 0) {
      console.log('\n失败的日期:');
      result.details
        .filter(d => d.error)
        .forEach(d => console.log(`  - ${d.date}: ${d.error}`));
    }

  } catch (error) {
    console.error('补录失败:', (error as Error).message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n数据库连接已关闭');
  }
}

main();
