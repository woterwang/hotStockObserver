import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { VolumeSurge } from '../../data/concept_cache/models';

// MongoDB 连接配置
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hot-stock-observer';
const OUTPUT_PATH = path.join(__dirname, '../data/volume_surge_stock_codes.txt');

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log(`Mongo connected: ${MONGODB_URI}`);

  const codes: string[] = await VolumeSurge.distinct('stockCode');
  console.log(`Distinct stockCode count: ${codes.length}`);

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, codes.join('\n'), 'utf-8');
  console.log(`Saved to ${OUTPUT_PATH}`);

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
