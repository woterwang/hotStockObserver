/**
 * 测试样例：验证 TrendScorer 在 601212 / 20260114 的评分结果
 */
import fs from 'node:fs';
import path from 'node:path';
import { TrendScorer } from '../services/TrendScorerService';

type KlineEntry = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnover: number;
};

type KlineCacheFile = {
  stockCode: string;
  klines: Record<string, KlineEntry>;
};

function assertTrue(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function toTrendInput(klines: KlineEntry[]) {
  return klines.map(item => ({
    open: item.open,
    high: item.high,
    low: item.low,
    close: item.close,
    volume: item.volume,
  }));
}

async function main(): Promise<void> {
  const stockCode = '601212';
  const targetDate = '20260114';

  const cachePath = path.resolve(process.cwd(), 'data', 'kline_cache', `${stockCode}.json`);
  assertTrue(fs.existsSync(cachePath), `样本文件不存在: ${cachePath}`);

  const cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8')) as KlineCacheFile;
  assertTrue(cache.stockCode === stockCode, `样本 stockCode 不匹配: ${cache.stockCode}`);
  assertTrue(Boolean(cache.klines[targetDate]), `样本中不存在目标日期: ${targetDate}`);

  // 仅使用目标日及之前数据，避免前视偏差；TrendScorer 要求倒序（最新在前）
  const history = Object.values(cache.klines)
    .filter(k => k.date <= targetDate)
    .sort((a, b) => b.date.localeCompare(a.date));

  assertTrue(history.length >= 20, `历史数据不足20条，当前=${history.length}`);
  assertTrue(history[0].date === targetDate, `目标日不在首位，当前首位=${history[0].date}`);

  const input = toTrendInput(history);
  const result = TrendScorer.calculate(input);
  const mappedScore = TrendScorer.toBuySignalScore(result.score);

  assertTrue(result.score >= 0 && result.score <= 100, `原始趋势分越界: ${result.score}`);
  assertTrue(mappedScore >= 0 && mappedScore <= 15, `映射趋势分越界: ${mappedScore}`);

  console.log(`[CASE] stock=${stockCode} date=${targetDate}`);
  console.log(`[TREND] rawScore=${result.score.toFixed(2)} tag=${result.tag} mappedScore=${mappedScore}`);
  console.log(`[INPUT] historyCount=${history.length} latestDate=${history[0].date} oldestDate=${history[history.length - 1].date}`);
  console.log('PASS: TrendScorer 样例测试通过');
}

main().catch((error) => {
  console.error('FAIL:', (error as Error).message);
  process.exit(1);
});
