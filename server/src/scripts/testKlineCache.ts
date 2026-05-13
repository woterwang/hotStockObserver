/**
 * 测试 K线缓存服务的实时行情兜底功能
 */
import { klineCacheService } from '../services/klineCacheService';
import dayjs from 'dayjs';

async function main() {
  const today = dayjs().format('YYYYMMDD');
  const yesterday = dayjs().subtract(1, 'day').format('YYYYMMDD');
  const stockCodes = ['600151', '603601', '000825'];

  console.log(`测试日期: 昨天=${yesterday}, 今天=${today}\n`);

  for (const stockCode of stockCodes) {
    console.log(`=== ${stockCode} ===`);
    try {
      const klines = await klineCacheService.getKlines(stockCode, [yesterday, today]);
      
      const kYesterday = klines.get(yesterday);
      const kToday = klines.get(today);
      
      console.log(`  ${yesterday}: ${kYesterday ? `open=${kYesterday.open}, close=${kYesterday.close}` : 'MISSING'}`);
      console.log(`  ${today}: ${kToday ? `open=${kToday.open}, close=${kToday.close}` : 'MISSING'}`);
    } catch (error) {
      console.error(`  Error: ${(error as Error).message}`);
    }
    console.log('');
  }
}

main().catch(console.error);
