/**
 * 使用腾讯实时行情更新交易信号的开盘价
 */

import axios from 'axios';
import * as iconv from 'iconv-lite';
import mongoose from 'mongoose';

interface RealtimeQuote {
  stockCode: string;
  stockName: string;
  open: number;
  preClose: number;
  current: number;
  high: number;
  low: number;
  volume: number;
  turnover: number;
  date: string;
  time: string;
  changePercent: number;
}

const MONGODB_URI = 'mongodb://localhost:27017/hot-stock-observer';

function getQQStockCode(stockCode: string): string {
  if (stockCode.startsWith('6')) {
    return `sh${stockCode}`;
  } else if (stockCode.startsWith('0') || stockCode.startsWith('3')) {
    return `sz${stockCode}`;
  } else if (stockCode.startsWith('688')) {
    return `sh${stockCode}`;
  }
  return `sh${stockCode}`;
}

async function fetchRealtimeQuotes(stockCodes: string[]): Promise<Map<string, RealtimeQuote>> {
  const result = new Map<string, RealtimeQuote>();
  
  try {
    const qqCodes = stockCodes.map(code => getQQStockCode(code)).join(',');
    const url = `https://qt.gtimg.cn/q=${qqCodes}`;
    
    console.log(`请求: ${url}`);
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://finance.qq.com/',
      },
      responseType: 'arraybuffer',
      timeout: 10000,
    });
    
    const dataStr = iconv.decode(response.data, 'gbk');
    const lines = dataStr.split(';').filter((line: string) => line.trim());
    
    for (const line of lines) {
      const codeMatch = line.match(/v_(\w+)=/);
      if (!codeMatch) continue;
      
      const qqCode = codeMatch[1];
      const stockCode = qqCode.substring(2);
      
      const dataMatch = line.match(/="([^"]+)"/);
      if (!dataMatch || !dataMatch[1]) continue;
      
      const parts = dataMatch[1].split('~');
      if (parts.length < 45) continue;
      
      const current = parseFloat(parts[3]) || 0;
      const preClose = parseFloat(parts[4]) || 0;
      const open = parseFloat(parts[5]) || 0;
      
      if (open === 0) continue;
      
      const timeStr = parts[30] || '';
      const date = timeStr.length >= 8 ? `${timeStr.substring(0,4)}-${timeStr.substring(4,6)}-${timeStr.substring(6,8)}` : '';
      const time = timeStr.length >= 14 ? `${timeStr.substring(8,10)}:${timeStr.substring(10,12)}:${timeStr.substring(12,14)}` : '';
      
      const quote: RealtimeQuote = {
        stockCode,
        stockName: parts[1],
        open,
        preClose,
        current,
        high: parseFloat(parts[33]) || 0,
        low: parseFloat(parts[34]) || 0,
        volume: parseFloat(parts[6]) || 0,
        turnover: (parseFloat(parts[37]) || 0) * 10000,
        date,
        time,
        changePercent: parseFloat(parts[32]) || 0,
      };
      
      result.set(stockCode, quote);
    }
  } catch (error) {
    console.error(`获取实时行情失败: ${(error as Error).message}`);
  }
  
  return result;
}

async function main() {
  console.log('='.repeat(60));
  console.log('使用腾讯实时行情更新交易信号开盘价');
  console.log('='.repeat(60));
  
  // 连接数据库
  await mongoose.connect(MONGODB_URI);
  console.log('已连接数据库:', MONGODB_URI);
  
  try {
    // 定义信号模型
    const TradingSignal = mongoose.model('TradingSignal', new mongoose.Schema({}, { strict: false }), 'trading_signals');
    
    // 查询需要更新的信号（day3Open 为空或为 null）
    const signals = await TradingSignal.find({
      status: { $in: ['pending', 'ready'] },
      $or: [
        { day3Open: null },
        { day3Open: { $exists: false } },
      ],
    });
    
    console.log(`\n找到 ${signals.length} 个需要更新开盘价的信号\n`);
    
    if (signals.length === 0) {
      console.log('没有需要更新的信号');
      return;
    }
    
    // 收集股票代码
    const stockCodes = signals.map((s: any) => s.stockCode);
    console.log(`股票代码: ${stockCodes.join(', ')}`);
    
    // 批量获取实时行情
    const quotes = await fetchRealtimeQuotes(stockCodes);
    console.log(`\n获取到 ${quotes.size} 只股票的实时行情\n`);
    
    // 更新每个信号
    for (const signal of signals) {
      const stockCode = signal.get('stockCode');
      const stockName = signal.get('stockName');
      const quote = quotes.get(stockCode);
      
      if (quote) {
        // 计算开盘涨幅
        const openChangePercent = quote.preClose > 0 
          ? ((quote.open - quote.preClose) / quote.preClose) * 100 
          : 0;
        
        await TradingSignal.updateOne(
          { _id: signal._id },
          {
            $set: {
              day3Open: quote.open,
              day3OpenChangePercent: parseFloat(openChangePercent.toFixed(2)),
              updatedAt: new Date(),
            },
          }
        );
        
        console.log(`✅ ${stockCode} ${stockName}:`);
        console.log(`   开盘价: ${quote.open}`);
        console.log(`   开盘涨幅: ${openChangePercent.toFixed(2)}%`);
        console.log(`   当前价: ${quote.current} (${quote.changePercent > 0 ? '+' : ''}${quote.changePercent.toFixed(2)}%)`);
      } else {
        console.log(`❌ ${stockCode} ${stockName}: 无法获取行情`);
      }
    }
    
    console.log('\n更新完成');
    
  } finally {
    await mongoose.disconnect();
    console.log('\n数据库连接已关闭');
  }
  
  console.log('='.repeat(60));
}

main().catch(console.error);
