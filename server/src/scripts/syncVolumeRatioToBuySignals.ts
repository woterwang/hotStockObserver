import mongoose, { FilterQuery } from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { BuySignal, VolumeSurge } from '../models';

interface SyncOptions {
  apply: boolean;
  batchSize: number;
  limit?: number;
  date?: string;
  startDate?: string;
  endDate?: string;
  selectionDate?: string;
  startSelectionDate?: string;
  endSelectionDate?: string;
}

interface BuySignalLite {
  _id: mongoose.Types.ObjectId;
  sourceId?: string;
  stockCode: string;
  selectionDate: string;
  volumeRatio?: number;
}

interface SyncStats {
  scanned: number;
  sourceIdMissing: number;
  sourceIdInvalid: number;
  sourceNotFound: number;
  sourceKeyMismatch: number;
  sourceMatched: number;
  unchanged: number;
  needsUpdate: number;
  updated: number;
  writeBatches: number;
}

interface ChangeSample {
  buySignalId: string;
  sourceId: string;
  stockCode: string;
  selectionDate: string;
  oldVolumeRatio?: number;
  newVolumeRatio: number;
}

dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGODB_URI =
  process.env.MONGODB_URI ||
  process.env.MONGO_URI ||
  'mongodb://localhost:27017/hot_stock_observer';

function printUsage(): void {
  console.log('Sync volumeRatio from VolumeSurge to buySignals');
  console.log('');
  console.log('Usage:');
  console.log('  tsx src/scripts/syncVolumeRatioToBuySignals.ts');
  console.log('  tsx src/scripts/syncVolumeRatioToBuySignals.ts --apply');
  console.log('  tsx src/scripts/syncVolumeRatioToBuySignals.ts --apply --batch-size=500 --limit=10000');
  console.log('  tsx src/scripts/syncVolumeRatioToBuySignals.ts --date=20260115');
  console.log('  tsx src/scripts/syncVolumeRatioToBuySignals.ts --start-date=20260101 --end-date=20260131');
  console.log('  tsx src/scripts/syncVolumeRatioToBuySignals.ts --selection-date=20260114');
  console.log('  tsx src/scripts/syncVolumeRatioToBuySignals.ts --start-selection-date=20260101 --end-selection-date=20260131');
  console.log('');
  console.log('Options:');
  console.log('  --apply                 Execute database updates (default is dry-run)');
  console.log('  --batch-size=<number>   Batch size for reads/writes, default 500');
  console.log('  --limit=<number>        Max records to scan');
  console.log('  --date=<YYYYMMDD>       Filter buySignals.date');
  console.log('  --start-date=<YYYYMMDD> Filter buySignals.date >= start-date');
  console.log('  --end-date=<YYYYMMDD>   Filter buySignals.date <= end-date');
  console.log('  --selection-date=<YYYYMMDD> Filter buySignals.selectionDate');
  console.log('  --start-selection-date=<YYYYMMDD> Filter buySignals.selectionDate >= start-selection-date');
  console.log('  --end-selection-date=<YYYYMMDD>   Filter buySignals.selectionDate <= end-selection-date');
  console.log('  --help                  Show this help message');
}

function parsePositiveInt(value: string, name: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer, got: ${value}`);
  }
  return parsed;
}

function parseDateArg(value: string, name: string): string {
  if (!/^\d{8}$/.test(value)) {
    throw new Error(`${name} must be YYYYMMDD, got: ${value}`);
  }
  return value;
}

function parseArgs(argv: string[]): SyncOptions {
  const options: SyncOptions = {
    apply: false,
    batchSize: 500,
  };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }

    if (arg === '--apply') {
      options.apply = true;
      continue;
    }

    if (arg.startsWith('--batch-size=')) {
      options.batchSize = parsePositiveInt(arg.split('=')[1], 'batch-size');
      continue;
    }

    if (arg.startsWith('--limit=')) {
      options.limit = parsePositiveInt(arg.split('=')[1], 'limit');
      continue;
    }

    if (arg.startsWith('--date=')) {
      options.date = parseDateArg(arg.split('=')[1], 'date');
      continue;
    }

    if (arg.startsWith('--start-date=')) {
      options.startDate = parseDateArg(arg.split('=')[1], 'start-date');
      continue;
    }

    if (arg.startsWith('--end-date=')) {
      options.endDate = parseDateArg(arg.split('=')[1], 'end-date');
      continue;
    }

    if (arg.startsWith('--selection-date=')) {
      options.selectionDate = parseDateArg(arg.split('=')[1], 'selection-date');
      continue;
    }

    if (arg.startsWith('--start-selection-date=')) {
      options.startSelectionDate = parseDateArg(arg.split('=')[1], 'start-selection-date');
      continue;
    }

    if (arg.startsWith('--end-selection-date=')) {
      options.endSelectionDate = parseDateArg(arg.split('=')[1], 'end-selection-date');
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.date && (options.startDate || options.endDate)) {
    throw new Error('--date cannot be used together with --start-date/--end-date');
  }

  if (options.selectionDate && (options.startSelectionDate || options.endSelectionDate)) {
    throw new Error('--selection-date cannot be used together with --start-selection-date/--end-selection-date');
  }

  if (options.startDate && options.endDate && options.startDate > options.endDate) {
    throw new Error('--start-date cannot be later than --end-date');
  }

  if (options.startSelectionDate && options.endSelectionDate && options.startSelectionDate > options.endSelectionDate) {
    throw new Error('--start-selection-date cannot be later than --end-selection-date');
  }

  return options;
}

function buildDateRangeFilter (
  exact?: string,
  start?: string,
  end?: string
): string | { $gte?: string; $lte?: string } | undefined {
  if (exact) {
    return exact;
  }

  if (!start && !end) {
    return undefined;
  }

  const range: { $gte?: string; $lte?: string } = {};
  if (start) {
    range.$gte = start;
  }
  if (end) {
    range.$lte = end;
  }
  return range;
}

function isSameNumber(a: number | undefined, b: number): boolean {
  if (typeof a !== 'number' || !Number.isFinite(a)) {
    return false;
  }
  return Math.abs(a - b) < 1e-9;
}

async function flushBatch(
  docs: BuySignalLite[],
  options: SyncOptions,
  stats: SyncStats,
  samples: ChangeSample[]
): Promise<void> {
  if (docs.length === 0) {
    return;
  }

  const sourceIds = docs
    .map(doc => doc.sourceId)
    .filter((id): id is string => Boolean(id));

  const validSourceIds = Array.from(
    new Set(sourceIds.filter(id => mongoose.Types.ObjectId.isValid(id)))
  );

  const surgeDocs = validSourceIds.length > 0
    ? await VolumeSurge.find(
      { _id: { $in: validSourceIds } },
      { _id: 1, stockCode: 1, date: 1, volumeRatio: 1 }
    ).lean()
    : [];

  const sourceById = new Map<string, { stockCode: string; date: string; volumeRatio: number }>();
  for (const surge of surgeDocs) {
    sourceById.set(String(surge._id), {
      stockCode: String(surge.stockCode),
      date: String(surge.date),
      volumeRatio: Number(surge.volumeRatio),
    });
  }

  const bulkOps: Array<{
    updateOne: {
      filter: { _id: mongoose.Types.ObjectId; strategyType: string; sourceId: string };
      update: { $set: { volumeRatio: number } };
    };
  }> = [];

  for (const doc of docs) {
    if (!doc.sourceId) {
      stats.sourceIdMissing++;
      continue;
    }

    if (!mongoose.Types.ObjectId.isValid(doc.sourceId)) {
      stats.sourceIdInvalid++;
      continue;
    }

    const source = sourceById.get(doc.sourceId);
    if (!source || !Number.isFinite(source.volumeRatio)) {
      stats.sourceNotFound++;
      continue;
    }

    if (source.stockCode !== doc.stockCode || source.date !== doc.selectionDate) {
      stats.sourceKeyMismatch++;
      continue;
    }

    stats.sourceMatched++;

    if (isSameNumber(doc.volumeRatio, source.volumeRatio)) {
      stats.unchanged++;
      continue;
    }

    stats.needsUpdate++;

    if (samples.length < 20) {
      samples.push({
        buySignalId: String(doc._id),
        sourceId: doc.sourceId,
        stockCode: doc.stockCode,
        selectionDate: doc.selectionDate,
        oldVolumeRatio: doc.volumeRatio,
        newVolumeRatio: source.volumeRatio,
      });
    }

    bulkOps.push({
      updateOne: {
        filter: {
          _id: doc._id,
          strategyType: 'volume_surge',
          sourceId: doc.sourceId,
        },
        update: {
          $set: {
            volumeRatio: source.volumeRatio,
          },
        },
      },
    });
  }

  if (!options.apply || bulkOps.length === 0) {
    return;
  }

  const result = await BuySignal.bulkWrite(bulkOps, { ordered: false });
  stats.updated += result.modifiedCount;
  stats.writeBatches++;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  console.log('============================================================');
  console.log('buySignals.volumeRatio sync script');
  console.log('============================================================');
  console.log(`Database: ${MONGODB_URI}`);
  console.log(`Mode: ${options.apply ? 'APPLY (write enabled)' : 'DRY-RUN (no write)'}`);
  console.log(`Batch size: ${options.batchSize}`);
  if (options.limit) console.log(`Limit: ${options.limit}`);
  if (options.date) console.log(`Filter date: ${options.date}`);
  if (options.startDate || options.endDate) {
    console.log(`Filter date range: ${options.startDate || '*'} ~ ${options.endDate || '*'}`);
  }
  if (options.selectionDate) console.log(`Filter selectionDate: ${options.selectionDate}`);
  if (options.startSelectionDate || options.endSelectionDate) {
    console.log(`Filter selectionDate range: ${options.startSelectionDate || '*'} ~ ${options.endSelectionDate || '*'}`);
  }
  console.log('');

  const stats: SyncStats = {
    scanned: 0,
    sourceIdMissing: 0,
    sourceIdInvalid: 0,
    sourceNotFound: 0,
    sourceKeyMismatch: 0,
    sourceMatched: 0,
    unchanged: 0,
    needsUpdate: 0,
    updated: 0,
    writeBatches: 0,
  };
  const samples: ChangeSample[] = [];

  try {
    await mongoose.connect(MONGODB_URI);

    const query: FilterQuery<unknown> = {
      strategyType: 'volume_surge',
    };

    const dateFilter = buildDateRangeFilter(options.date, options.startDate, options.endDate);
    if (dateFilter) query.date = dateFilter;

    const selectionDateFilter = buildDateRangeFilter(
      options.selectionDate,
      options.startSelectionDate,
      options.endSelectionDate
    );
    if (selectionDateFilter) query.selectionDate = selectionDateFilter;

    const cursor = BuySignal.find(
      query,
      {
        _id: 1,
        sourceId: 1,
        stockCode: 1,
        selectionDate: 1,
        volumeRatio: 1,
      }
    ).lean().cursor();

    let batch: BuySignalLite[] = [];

    try {
      for await (const rawDoc of cursor) {
        if (options.limit && stats.scanned >= options.limit) {
          break;
        }

        const doc = rawDoc as BuySignalLite;
        batch.push(doc);
        stats.scanned++;

        if (batch.length >= options.batchSize) {
          await flushBatch(batch, options, stats, samples);
          batch = [];
        }
      }
    } finally {
      await cursor.close();
    }

    if (batch.length > 0) {
      await flushBatch(batch, options, stats, samples);
    }

    console.log('------------------------------ Summary ------------------------------');
    console.log(`Scanned buySignals: ${stats.scanned}`);
    console.log(`Matched sourceId in VolumeSurge: ${stats.sourceMatched}`);
    console.log(`Missing sourceId: ${stats.sourceIdMissing}`);
    console.log(`Invalid sourceId: ${stats.sourceIdInvalid}`);
    console.log(`Source not found: ${stats.sourceNotFound}`);
    console.log(`Source key mismatch: ${stats.sourceKeyMismatch}`);
    console.log(`Unchanged: ${stats.unchanged}`);
    console.log(`Needs update: ${stats.needsUpdate}`);
    if (options.apply) {
      console.log(`Updated: ${stats.updated}`);
      console.log(`Write batches: ${stats.writeBatches}`);
    } else {
      console.log('Dry-run only, no database writes executed.');
    }

    if (samples.length > 0) {
      console.log('');
      console.log('Sample changes (up to 20):');
      for (const sample of samples) {
        console.log(
          `- buySignal=${sample.buySignalId} stock=${sample.stockCode} selectionDate=${sample.selectionDate} sourceId=${sample.sourceId} ${sample.oldVolumeRatio ?? 'undefined'} -> ${sample.newVolumeRatio}`
        );
      }
    }

    if (!options.apply) {
      console.log('');
      console.log('To execute updates, rerun with --apply');
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error('Sync failed:', error);
  process.exit(1);
});
