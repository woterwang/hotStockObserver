/**
 * 测试 startDailyKlineUpdateJob 任务（即 updateCodeKline 方法）
 */
import { connect, disconnect } from 'mongoose';
import { updateCodeKline } from '../jobs/updateCodeKline';
import { tradingCalendarService } from '../services/tradingCalendarService';
import { marketMoodService } from '../services/marketMoodService';

async function main() {
  // 连接数据库
  await connect('mongodb://localhost:27017/hot-stock-observer');
  console.log('数据库连接成功');

  // 初始化交易日历
  await tradingCalendarService.init();
  console.log('交易日历初始化完成');

  // 初始化市场情绪服务
  await marketMoodService.init();
  console.log('市场情绪服务初始化完成');

  // 执行测试
  console.log('========== 开始测试 startDailyKlineUpdateJob (updateCodeKline) ==========');
  await updateCodeKline();
  console.log('========== 测试完成 ==========');

  // 断开连接
  await disconnect();
  process.exit(0);
}

main().catch(e => {
  console.error('测试失败:', e);
  process.exit(1);
});
