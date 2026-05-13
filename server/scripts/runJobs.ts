import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { formatDate } from '../src/utils/dateUtils';
import { tradingCalendarService, priceBreakthroughService, volumeSurgeService, marketSentimentService, tradingSignalService, dataFetchService, marketMoodService } from '../src/services';
import { buySignalService } from '../src/services/buySignalService';
import { logger } from '../src/utils';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hot-stock-observer';

const normalizeDate = (input?: string): string => {
  if (!input) return formatDate(new Date(), 'YYYYMMDD');
  const normalized = input.replace(/-/g, '');
  if (!/^\d{8}$/.test(normalized)) {
    throw new Error('日期格式应为 YYYYMMDD 或 YYYY-MM-DD');
  }
  return normalized;
};

async function run() {
  const targetDate = normalizeDate(process.argv[2]);
  logger.info(`手动执行全量任务，目标日期: ${targetDate}`);

  await mongoose.connect(MONGODB_URI);
  logger.info('MongoDB connected');

  // 初始化缓存
  await tradingCalendarService.init();
  await marketMoodService.init();

  const isTradingDay = tradingCalendarService.isTradingDay(targetDate);
  if (!isTradingDay) {
    logger.warn('非交易日，仍强制执行后续任务');
  }

  // 交易日历缓存更新
  try {
    const ok = await tradingCalendarService.updateCache();
    logger.info(`[手动] 交易日历更新${ok ? '成功' : '失败'}`);
  } catch (err) {
    logger.error(`[手动] 交易日历更新失败: ${(err as Error).message}`);
  }

  // 市场情绪缓存更新（早间/集合竞价前）
  try {
    const ok = await marketMoodService.updateCache();
    logger.info(`[手动] 市场情绪缓存更新${ok ? '成功' : '失败'}`);
  } catch (err) {
    logger.error(`[手动] 市场情绪缓存更新失败: ${(err as Error).message}`);
  }

  // 热搜股票更新（盘中任务，手动执行一次）
  try {
    const hotStocks = await dataFetchService.fetchHotStocks();
    const savedCount = await dataFetchService.saveHotStocks(hotStocks);
    logger.info(`[手动] 热搜股票更新完成，数量: ${savedCount}`);
  } catch (err) {
    logger.error(`[手动] 热搜股票更新失败: ${(err as Error).message}`);
  }

  // 价格突破扫描
  try {
    const breakthroughCount = await priceBreakthroughService.scanAndSave();
    logger.info(`[手动] 价格突破扫描完成，数量: ${breakthroughCount}`);
  } catch (err) {
    logger.error(`[手动] 价格突破扫描失败: ${(err as Error).message}`);
  }

  // 放量大涨扫描
  try {
    const surgeCount = await volumeSurgeService.scanAndSave(targetDate);
    logger.info(`[手动] 放量大涨扫描完成，数量: ${surgeCount}`);
  } catch (err) {
    logger.error(`[手动] 放量大涨扫描失败: ${(err as Error).message}`);
  }

  // 市场情绪计算（收盘后）
  try {
    const sentiment = await marketSentimentService.fetchAndCalculateSentiment(targetDate);
    logger.info(`[手动] 市场情绪完成: ${JSON.stringify(sentiment)}`);
  } catch (err) {
    logger.error(`[手动] 市场情绪失败: ${(err as Error).message}`);
  }

  // 盘后信号生成（价格突破策略）
  try {
    const signalResult = await tradingSignalService.generateSignalsAfterMarketClose(targetDate);
    logger.info(`[手动] 盘后信号生成完成，数量: ${signalResult.count}, 入场日: ${signalResult.signalDate}`);
  } catch (err) {
    logger.error(`[手动] 盘后信号生成失败: ${(err as Error).message}`);
  }

  // 集合竞价后条件更新（价格突破策略）
  try {
    const auctionResult = await tradingSignalService.updateSignalsAfterAuction(targetDate);
    logger.info(`[手动] 集合竞价更新完成: 可入场=${auctionResult.ready}, 部分满足=${auctionResult.partial}, 不满足=${auctionResult.rejected}`);
  } catch (err) {
    logger.error(`[手动] 集合竞价更新失败: ${(err as Error).message}`);
  }

  // 集合竞价后条件更新（放量大涨策略）
  try {
    const buySignals = await buySignalService.generateBuySignals(targetDate, undefined, 50);
    logger.info(`[手动] 放量大涨买入信号生成完成，数量: ${buySignals.length}, 入场日: ${buySignals[0]?.date}`);
  } catch (err) {
    logger.error(`[手动] 放量大涨买入信号生成失败: ${(err as Error).message}`);
  }

  await mongoose.disconnect();
  logger.info('手动任务执行完毕');
}

run().catch(err => {
  logger.error(`手动任务异常: ${(err as Error).message}`);
  mongoose.disconnect();
  process.exit(1);
});
