/**
 * 测试样例：601212 从 20260114 起点验证开盘快照与评分逻辑
 */
import fs from 'node:fs';
import path from 'node:path';
import { openingAuctionService } from '../services/openingAuctionService';
import { BuySignalScorer } from '../services/buySignalService';

function assertTrue(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

type KlineCacheFile = {
  stockCode: string;
  klines: Record<string, {
    date: string;
    open: number;
    close: number;
    volume: number;
    turnover: number;
  }>;
};

async function main(): Promise<void> {
  const stockCode = '601212';
  const startDate = '20260114';
  const testDates = ['20260114', '20260115', '20260116'];

  const cachePath = path.resolve(process.cwd(), 'data', 'kline_cache', `${stockCode}.json`);
  assertTrue(fs.existsSync(cachePath), `样本文件不存在: ${cachePath}`);

  const cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8')) as KlineCacheFile;
  assertTrue(cache.stockCode === stockCode, `样本 stockCode 不匹配: ${cache.stockCode}`);
  assertTrue(Boolean(cache.klines[startDate]), `样本中不存在起点日期 ${startDate}`);

  const startOpen = cache.klines[startDate].open;
  assertTrue(startOpen > 0, `${startDate} open 非法: ${startOpen}`);

  console.log(`[CASE] stock=${stockCode}, startDate=${startDate}, open=${startOpen}`);

  for (const dateStr of testDates) {
    const openData = await openingAuctionService.getOpeningData(stockCode, dateStr);
    if (!openData) {
      throw new Error(`${dateStr} 获取开盘快照失败`);
    }

    const volumeResult = BuySignalScorer.scoreVolumeConfirm(openData.openVolumeRatio, openData.openChangePercent);
    const auctionResult = BuySignalScorer.scoreAuction(openData.auctionAmountRatio, openData.openChangePercent);

    assertTrue(volumeResult.score >= 0 && volumeResult.score <= 15, `${dateStr} 量能评分越界: ${volumeResult.score}`);
    assertTrue(auctionResult.score >= 0 && auctionResult.score <= 15, `${dateStr} 竞价评分越界: ${auctionResult.score}`);

    console.log(
      [
        `[${dateStr}]`,
        `openChange=${openData.openChangePercent}%`,
        `openVolRatio=${openData.openVolumeRatio}`,
        `auctionRatio=${openData.auctionAmountRatio}%`,
        `volScore=${volumeResult.score}`,
        `auctionScore=${auctionResult.score}`,
      ].join(' ')
    );
  }

  console.log('PASS: 601212 开盘样例测试通过');
}

main().catch((error) => {
  console.error('FAIL:', error.message);
  process.exit(1);
});
