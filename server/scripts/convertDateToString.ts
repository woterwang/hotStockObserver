import mongoose from 'mongoose';
import { toDateStr } from '../src/utils/dateUtils';

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/hot-stock-observer';

async function run() {
  await mongoose.connect(uri);
  const col = mongoose.connection.collection('hotstocks');

  const cursor = col.find({ date: { $type: 'date' } }, { projection: { date: 1 } });
  let converted = 0;
  let skipped = 0;
  let errors = 0;

  while (await cursor.hasNext()) {
    const doc: any = await cursor.next();
    const dateStr = toDateStr(doc.date);
    if (!dateStr) {
      skipped += 1;
      continue;
    }
    try {
      await col.updateOne({ _id: doc._id }, { $set: { date: dateStr } });
      converted += 1;
    } catch (err: any) {
      if (err?.code === 11000) {
        // duplicate key after conversion; skip but count
        skipped += 1;
      } else {
        errors += 1;
        console.error('update error', doc._id, err?.message || err);
      }
    }
  }

  console.log({ converted, skipped, errors });
  await mongoose.disconnect();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
