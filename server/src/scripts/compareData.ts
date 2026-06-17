/**
 * 对比 breakthrough 和 signals 数据
 */
import mongoose from 'mongoose';
import { PriceBreakthrough } from '../../data/concept_cache/models/PriceBreakthrough';
import { TradingSignal } from '../../data/concept_cache/models/TradingSignal';

async function main() {
  await mongoose.connect('mongodb://localhost:27017/hot-stock');
  
  // 查询 breakthrough 20251215
  const breakthroughs = await PriceBreakthrough.find({ dateStr: '20251215' }).limit(50);
  console.log('=== breakthrough/list?date=20251215 ===');
  console.log('数量:', breakthroughs.length);
  breakthroughs.forEach(b => console.log(' -', b.stockCode, b.stockName));
  
  // 查询 signals date=20251217 (Day3=20251217)
  const signals = await TradingSignal.find({ signalDate: '20251217' }).limit(50);
  console.log('\n=== signals/today?date=20251217 ===');
  console.log('数量:', signals.length);
  signals.forEach(s => {
    console.log(' -', s.stockCode, s.stockName);
    console.log('   Day1='+s.day1Date, 'Day2='+s.day2Date, 'strategy='+s.strategy);
  });
  
  // 检查 signals 的 Day1 是否在 breakthrough 中
  console.log('\n=== 交叉检查 ===');
  const breakthroughCodes = new Set(breakthroughs.map(b => b.stockCode));
  for (const s of signals) {
    const inBreakthrough = breakthroughCodes.has(s.stockCode);
    console.log(`${s.stockCode} ${s.stockName}: Day1=${s.day1Date}, 在breakthrough中=${inBreakthrough}`);
  }
  
  await mongoose.disconnect();
}

main().catch(console.error);
