const mongoose = require('mongoose');

// 修正数据库名称，与 .env 保持一致
const MONGODB_URI = 'mongodb://localhost:27017/hot-stock-observer';

async function count() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // 列出所有集合
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('Collections:', collections.map(c => c.name));

    const collectionName = 'volumesurges';
    
    // 检查集合是否存在
    if (!collections.find(c => c.name === collectionName)) {
        console.log(`Collection ${collectionName} NOT found!`);
        // 尝试查找类似的
        const similar = collections.find(c => c.name.toLowerCase().includes('volume'));
        if (similar) {
            console.log(`Did you mean ${similar.name}?`);
        }
    } else {
        // 查询所有数据数量
        const total = await mongoose.connection.collection(collectionName).countDocuments({});
        console.log(`Total documents in ${collectionName}: ${total}`);

        if (total > 0) {
             // 查询 2025-12-10 的数据
            // 考虑到时区，我们查询这一天的数据
            // 假设服务器运行在 UTC+8
            const start = new Date('2025-12-09T16:00:00.000Z'); // 2025-12-10 00:00:00 CST
            const end = new Date('2025-12-10T16:00:00.000Z');   // 2025-12-11 00:00:00 CST
            
            const count = await mongoose.connection.collection(collectionName).countDocuments({
                date: {
                    $gte: start,
                    $lt: end
                }
            });
            
            console.log(`Found ${count} documents in ${collectionName} for date 2025-12-10 (Range Query)`);
            
            // 打印第一条数据的日期
            const first = await mongoose.connection.collection(collectionName).findOne({});
            console.log('First document date:', first.date);
        }
    }

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  } catch (err) {
    console.error('Error:', err);
  }
}

count();
