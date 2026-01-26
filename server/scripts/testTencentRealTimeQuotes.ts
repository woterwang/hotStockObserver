/**
 * 测试 fetchTencentRealTimeQuotes 函数
 */
import { fetchTencentRealTimeQuotes } from '../src/services/klineCacheService';

async function main() {
  console.log('测试批量获取腾讯实时行情数据...\n');
  
  // 测试股票代码列表
  const testCodes = ['000001', '000002', '600693', '300750'];
  
  console.log(`测试股票代码: ${testCodes.join(', ')}`);
  console.log('');
  
  try {
    const result = await fetchTencentRealTimeQuotes(testCodes);
    
    console.log(`获取到 ${result.size} 只股票的数据：\n`);
    
    for (const [code, quote] of result) {
      console.log(`=== ${quote.stockName} (${code}) ===`);
      console.log(`  最新价: ${quote.current}`);
      console.log(`  昨收价: ${quote.preClose}`);
      console.log(`  今开价: ${quote.open}`);
      console.log(`  最高价: ${quote.high}`);
      console.log(`  最低价: ${quote.low}`);
      console.log(`  涨跌额: ${quote.changeAmount}`);
      console.log(`  涨跌幅: ${quote.changePercent}%`);
      console.log(`  成交量: ${quote.volume} 手`);
      console.log(`  成交额: ${(quote.turnover / 10000).toFixed(2)} 万元`);
      console.log(`  日期: ${quote.date}`);
      console.log(`  时间: ${quote.time}`);
      console.log('');
    }
    
    // 测试空数组
    console.log('测试空数组...');
    const emptyResult = await fetchTencentRealTimeQuotes([]);
    console.log(`空数组结果: ${emptyResult.size} 条数据\n`);
    
    console.log('✅ 测试完成！');
  } catch (error) {
    console.error('❌ 测试失败:', error);
  }
}

main();
