const mongoose = require('mongoose');
const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/hot_stock_observer';
(async () => {
  try {
    await mongoose.connect(uri);
    const col = mongoose.connection.collection('hotstocks');
    const total = await col.countDocuments();
    const datesAgg = await col.aggregate([
      { $group: { _id: '$date' } },
      { $sort: { _id: 1 } },
      {
        $group: {
          _id: null,
          dates: { $push: '$_id' },
          totalDates: { $sum: 1 },
          first: { $first: '$_id' },
          last: { $last: '$_id' },
        },
      },
      {
        $project: {
          _id: 0,
          totalDates: 1,
          first: 1,
          last: 1,
          last10: { $slice: ['$dates', -10, 10] },
        },
      },
    ]).toArray();
    console.log({ totalDocs: total, ...datesAgg[0] });
  } catch (e) {
    console.error('err', e);
  } finally {
    await mongoose.disconnect();
  }
})();
