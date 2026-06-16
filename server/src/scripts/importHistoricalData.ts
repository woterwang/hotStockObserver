/**
 * 历史热搜数据导入脚本
 * 
 * 用于将 data 目录中的 JSON 文件（同花顺热搜 API 历史数据）导入到 MongoDB 数据库
 * 
 * 使用方法:
 *   npx ts-node src/scripts/importHistoricalData.ts
 *   或
 *   npm run import-data
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { HotStock } from '../../data/concept_cache/models';
import { dataFetchService } from '../services/dataFetchService';

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hot_stock_observer';
const DATA_DIR = path.join(__dirname, '../../data');

// 同花顺热搜数据结构
interface THSHotStockItem {
  order: number;
  code: string;
  name: string;
  rate: string;
  market?: number;
  topic?: {
    title?: string;
    topic_code?: string;
  } | null;
  hot_rank_chg?: number;
  analyse_title?: string;
  tag?: {
    concept_tag?: string[];
    popularity_tag?: string;
    continuous_firing_days?: number;
  };
}

/**
 * 解析日期字符串（格式：YYYYMMDD）为 Date 对象
 */
function parseDate(dateStr: string): Date {
  const year = parseInt(dateStr.substring(0, 4));
  const month = parseInt(dateStr.substring(4, 6)) - 1; // 月份从0开始
  const day = parseInt(dateStr.substring(6, 8));
  return new Date(year, month, day);
}

/**
 * 导入单个 JSON 文件的数据
 */
async function importSingleFile(filePath: string): Promise<number> {
  const fileName = path.basename(filePath, '.json');
  const date = parseDate(fileName);
  
  console.log(`正在导入 ${fileName} 的数据...`);
  
  // 读取 JSON 文件
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  let stockList: THSHotStockItem[] = JSON.parse(fileContent);
  
  if (!Array.isArray(stockList) || stockList.length === 0) {
    console.log(`  ${fileName} 没有有效数据，跳过`);
    return 0;
  }
  
  // 只取前20条数据
  stockList = stockList.slice(0, 20);
  
  let savedCount = 0;
  
  // 批量获取股票历史行情数据（使用东方财富历史K线API）
  const stockCodes = stockList.map(s => s.code);
  let historyQuotes = new Map();
  
  try {
    console.log(`  正在获取 ${stockCodes.length} 只股票在 ${fileName} 的历史行情...`);
    historyQuotes = await dataFetchService.fetchHistoryQuotesByDate(stockCodes, fileName);
    console.log(`  成功获取 ${historyQuotes.size} 只股票的历史行情`);
  } catch (error) {
    console.log(`  获取历史行情数据失败，将使用默认值: ${(error as Error).message}`);
  }
  
  for (const stock of stockList) {
    try {
      // 获取该股票的历史行情数据
      const historyQuote = historyQuotes.get(stock.code);
      
      // 提取概念板块
      let concepts: string[] = [];
      if (stock.tag?.concept_tag) {
        concepts = stock.tag.concept_tag;
      }
      
      // 提取上涨原因
      let riseReason = '';
      if (stock.analyse_title) {
        riseReason = stock.analyse_title;
      } else if (stock.topic?.title) {
        riseReason = stock.topic.title;
      } else if (concepts.length > 0) {
        riseReason = concepts.slice(0, 3).join('、');
      }
      
      // 提取所属板块（取第一个概念标签作为主板块）
      const sector = concepts.length > 0 ? concepts[0] : '';
      
      // 热度分数
      const hotScore = parseInt(stock.rate) || 0;
      
      const hotStockData = {
        date: date,
        stockCode: stock.code,
        stockName: stock.name,
        // 使用历史K线数据
        currentPrice: historyQuote?.close || 0,        // 收盘价作为当前价
        changePercent: historyQuote?.changePercent || 0,
        changeAmount: historyQuote?.changeAmount || 0,
        volume: historyQuote?.volume || 0,
        turnover: historyQuote?.turnover || 0,
        rank: stock.order,
        consecutiveDays: stock.tag?.continuous_firing_days || 1,
        hotScore: hotScore,
        sector: sector,
        sectorCode: '',
        riseReason: riseReason,
        concept: concepts,
      };
      
      // 使用 upsert 更新或插入（避免重复）
      await HotStock.findOneAndUpdate(
        { date: date, stockCode: stock.code },
        hotStockData,
        { upsert: true, new: true }
      );
      
      savedCount++;
    } catch (error) {
      console.error(`  保存股票 ${stock.code} 失败: ${(error as Error).message}`);
    }
  }
  
  console.log(`  ${fileName} 导入完成，共 ${savedCount} 条数据`);
  return savedCount;
}

/**
 * 导入所有历史数据
 */
async function importAllData(): Promise<void> {
  console.log('='.repeat(60));
  console.log('热搜股票历史数据导入工具');
  console.log('='.repeat(60));
  console.log(`数据目录: ${DATA_DIR}`);
  console.log(`数据库: ${MONGODB_URI}`);
  console.log('');
  
  // 连接数据库
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✓ 数据库连接成功');
  } catch (error) {
    console.error('✗ 数据库连接失败:', (error as Error).message);
    process.exit(1);
  }
  
  // 读取 data 目录下所有 JSON 文件
  if (!fs.existsSync(DATA_DIR)) {
    console.error(`✗ 数据目录不存在: ${DATA_DIR}`);
    await mongoose.disconnect();
    process.exit(1);
  }
  
  const files = fs.readdirSync(DATA_DIR)
    .filter(f => f.endsWith('.json'))
    .sort(); // 按日期排序
  
  if (files.length === 0) {
    console.log('没有找到 JSON 文件');
    await mongoose.disconnect();
    return;
  }
  
  console.log(`找到 ${files.length} 个数据文件`);
  console.log('-'.repeat(60));
  
  let totalCount = 0;
  let successFiles = 0;
  let failedFiles = 0;
  
  for (const file of files) {
    const filePath = path.join(DATA_DIR, file);
    try {
      const count = await importSingleFile(filePath);
      totalCount += count;
      if (count > 0) {
        successFiles++;
      }
      
      // 每个文件间隔一点时间，避免请求过快
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`导入 ${file} 失败: ${(error as Error).message}`);
      failedFiles++;
    }
  }
  
  console.log('-'.repeat(60));
  console.log('导入完成!');
  console.log(`  成功导入: ${successFiles} 个文件`);
  console.log(`  失败: ${failedFiles} 个文件`);
  console.log(`  总数据量: ${totalCount} 条`);
  console.log('='.repeat(60));
  
  // 断开数据库连接
  await mongoose.disconnect();
  console.log('数据库连接已断开');
}

/**
 * 只导入指定日期的数据
 */
async function importByDate(dateStr: string): Promise<void> {
  console.log(`导入指定日期数据: ${dateStr}`);
  
  // 连接数据库
  await mongoose.connect(MONGODB_URI);
  console.log('✓ 数据库连接成功');
  
  const filePath = path.join(DATA_DIR, `${dateStr}.json`);
  
  if (!fs.existsSync(filePath)) {
    console.error(`文件不存在: ${filePath}`);
    await mongoose.disconnect();
    process.exit(1);
  }
  
  await importSingleFile(filePath);
  
  await mongoose.disconnect();
  console.log('数据库连接已断开');
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length > 0 && args[0].match(/^\d{8}$/)) {
    // 指定日期导入
    await importByDate(args[0]);
  } else {
    // 导入所有数据
    await importAllData();
  }
}

main().catch(error => {
  console.error('导入失败:', error);
  process.exit(1);
});
