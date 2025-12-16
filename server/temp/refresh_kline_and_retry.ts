/**
 * 刷新 K 线缓存并重试开盘价获取
 * 
 * 用于解决以下问题：
 * - K线缓存文件过期，没有最新日期的数据
 * - K线缓存文件不存在
 */

import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import mongoose from 'mongoose';

interface KlineData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnover: number;
}

const KLINE_CACHE_DIR = path.join(__dirname, 'data/kline_cache');
const MONGODB_URI = 'mongodb://localhost:27017/hot-stock-observer';

// 获取市场代码
function getMarketId(stockCode: string): string {
  if (stockCode.startsWith('6')) {
    return '17'; // 上证
  } else if (stockCode.startsWith('0') || stockCode.startsWith('3')) {
    return '33'; // 深证
  } else if (stockCode.startsWith('688')) {
    return '17'; // 科创板
  } else if (stockCode.startsWith('8') || stockCode.startsWith('4')) {
    return '151'; // 北交所
  }
  return '17';
}

// 从同花顺获取K线数据
async function fetchKlineFromTHS(stockCode: string, days: number = 100): Promise<Map<string, KlineData>> {
  const result = new Map<string, KlineData>();
  try {
    const marketId = getMarketId(stockCode);
    const url = `https://d.10jqka.com.cn/v6/line/${marketId}_${stockCode}/01/last${days}.js`;
    
    console.log(`[Kline] 正在从同花顺获取 ${stockCode} 的 K 线数据...`);
    console.log(`[Kline] URL: ${url}`);
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'http://www.10jqka.com.cn/',
        'hexin-v': String(Date.now()),
      },
      timeout: 10000,
    });

    if (response.data && typeof response.data === 'string') {
      const dataStr = response.data;
      const startIdx = dataStr.indexOf('({');
      if (startIdx !== -1) {
        const jsonStr = dataStr.substring(startIdx + 1, dataStr.length - 1);
        const data = JSON.parse(jsonStr);
        if (data && data.data) {
          const klineList = data.data.split(';');
          for (const item of klineList) {
            const parts = item.split(',');
            if (parts.length >= 7) {
              const [day, openPrice, highPrice, lowPrice, closePrice, vol, total] = parts;
              if (day && day.length === 8) {
                result.set(day, {
                  date: day,
                  open: parseFloat(openPrice) || 0,
                  high: parseFloat(highPrice) || 0,
                  low: parseFloat(lowPrice) || 0,
                  close: parseFloat(closePrice) || 0,
                  volume: parseFloat(vol) || 0,
                  turnover: parseFloat(total) || 0,
                });
              }
            }
          }
        }
      }
    }
    console.log(`[Kline] 获取到 ${result.size} 条 K 线数据`);
  } catch (error) {
    console.error(`[Kline] 获取 ${stockCode} K 线失败:`, (error as Error).message);
  }
  return result;
}

// 保存K线数据到缓存
function saveKlineToCache(stockCode: string, klines: Map<string, KlineData>): void {
  try {
    const cacheFile = path.join(KLINE_CACHE_DIR, `${stockCode}.json`);
    let existingData: any = { stockCode, cacheTime: Date.now(), klines: {} };
    
    // 读取现有缓存
    if (fs.existsSync(cacheFile)) {
      existingData = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
    }
    
    // 合并新数据
    for (const [date, kline] of klines) {
      existingData.klines[date] = kline;
    }
    existingData.cacheTime = Date.now();
    
    // 确保目录存在
    if (!fs.existsSync(KLINE_CACHE_DIR)) {
      fs.mkdirSync(KLINE_CACHE_DIR, { recursive: true });
    }
    
    fs.writeFileSync(cacheFile, JSON.stringify(existingData), 'utf-8');
    console.log(`[Kline] 已保存 ${stockCode} 缓存到 ${cacheFile}`);
  } catch (error) {
    console.error(`[Kline] 保存 ${stockCode} 缓存失败:`, (error as Error).message);
  }
}

// 获取开盘价
function getOpenPriceFromCache(stockCode: string, dateStr: string): number | null {
  const cacheFile = path.join(KLINE_CACHE_DIR, `${stockCode}.json`);
  if (fs.existsSync(cacheFile)) {
    const cacheData = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
    if (cacheData.klines && cacheData.klines[dateStr]) {
      return cacheData.klines[dateStr].open;
    }
  }
  return null;
}

async function main() {
  // 需要刷新的股票
  const stocksToRefresh = ['600693', '002544', '688119'];
  const targetDate = '20251215';  // 今天的日期
  
  console.log('='.repeat(60));
  console.log('刷新 K 线缓存并重试开盘价获取');
  console.log('='.repeat(60));
  console.log(`目标日期: ${targetDate}`);
  console.log(`需要刷新的股票: ${stocksToRefresh.join(', ')}\n`);

  // 1. 刷新 K 线缓存
  for (const stockCode of stocksToRefresh) {
    console.log(`\n--- 处理 ${stockCode} ---`);
    
    // 获取最新 K 线
    const klines = await fetchKlineFromTHS(stockCode, 100);
    
    if (klines.size > 0) {
      // 保存到缓存
      saveKlineToCache(stockCode, klines);
      
      // 检查目标日期
      if (klines.has(targetDate)) {
        const kline = klines.get(targetDate)!;
        console.log(`[成功] ${stockCode} ${targetDate}:`);
        console.log(`  - 开盘价: ${kline.open}`);
        console.log(`  - 最高价: ${kline.high}`);
        console.log(`  - 最低价: ${kline.low}`);
        console.log(`  - 收盘价: ${kline.close}`);
      } else {
        // 显示最新日期
        const dates = Array.from(klines.keys()).sort();
        const latestDate = dates[dates.length - 1];
        console.log(`[警告] ${stockCode} 没有 ${targetDate} 的数据`);
        console.log(`  - 最新日期: ${latestDate}`);
      }
    } else {
      console.log(`[失败] ${stockCode} 获取 K 线失败`);
    }
    
    // 避免请求过快
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // 2. 连接数据库并更新交易信号
  console.log('\n\n--- 更新数据库中的交易信号 ---');
  
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('已连接数据库:', MONGODB_URI);
    
    // 定义信号模型
    const TradingSignal = mongoose.model('TradingSignal', new mongoose.Schema({}, { strict: false }), 'trading_signals');
    
    // 查询需要更新的信号
    const signals = await TradingSignal.find({
      stockCode: { $in: stocksToRefresh },
      status: { $in: ['pending', 'ready'] },
    });
    
    console.log(`找到 ${signals.length} 个需要更新的信号`);
    
    for (const signal of signals) {
      const openPrice = getOpenPriceFromCache(signal.get('stockCode'), targetDate);
      if (openPrice !== null) {
        await TradingSignal.updateOne(
          { _id: signal._id },
          {
            $set: {
              day3Open: openPrice,
              updatedAt: new Date(),
            },
          }
        );
        console.log(`[更新] ${signal.get('stockCode')} ${signal.get('stockName')}: day3Open = ${openPrice}`);
      } else {
        console.log(`[跳过] ${signal.get('stockCode')} 仍无法获取开盘价`);
      }
    }
    
  } catch (error) {
    console.error('数据库操作失败:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n数据库连接已关闭');
  }
  
  console.log('\n='.repeat(60));
  console.log('完成');
  console.log('='.repeat(60));
}

main().catch(console.error);
