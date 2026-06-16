import mongoose from 'mongoose';
import dayjs from 'dayjs';
import { VolumeSurge } from '../../data/concept_cache/models';
import { klineCacheService } from '../services/klineCacheService';
import { tradingCalendarService } from '../services/tradingCalendarService';
import { logger } from '../utils';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hot-stock-observer';

async function main() {
  await tradingCalendarService.init();
  await mongoose.connect(MONGODB_URI);
  logger.info(`Mongo connected: ${MONGODB_URI}`);

  const stockCodes: string[] = await VolumeSurge.distinct('stockCode');
  logger.info(`volume_surge distinct stockCode count: ${stockCodes.length}`);
  console.log('stockCodes:', stockCodes.join(','));

  const today = dayjs().format('YYYYMMDD');

  for (const code of stockCodes) {
    try {
      logger.info(`[Kline backfill] ${code} start`);
      await klineCacheService.ensureKlines(code, { targetDates: [today], preferDays: 1800 });
      // 简单节流，避免频繁请求被限流
      await new Promise(res => setTimeout(res, 300));
    } catch (err) {
      logger.warn(`[Kline backfill] ${code} failed: ${(err as Error).message}`);
    }
  }

  await mongoose.disconnect();
  logger.info('Done');
}

main().catch(err => {
  logger.error(err);
  mongoose.disconnect();
});
