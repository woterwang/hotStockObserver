const mongoose = require('mongoose');
const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/hot-stock-observer';
(async () => {
  await mongoose.connect(uri);
  const col = mongoose.connection.collection('hotstocks');
  const byType = await col.aggregate([
    { $group: { _id: { $type: '$date' }, count: { $sum: 1 }, sample: { $first: '$date' } } },
    { $sort: { count: -1 } },
  ]).toArray();
  console.log(byType);
  await mongoose.disconnect();
})();
