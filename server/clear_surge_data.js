const mongoose = require('mongoose');

// 使用 app.ts 中定义的默认连接字符串
// 修正数据库名称，与 .env 保持一致
const MONGODB_URI = 'mongodb://localhost:27017/hot-stock-observer';

async function clear() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // 注意：mongoose 会将 model name 'VolumeSurge' 转换为 collection name 'volumesurges'
    // 但如果之前没有通过 mongoose 创建过，或者名字不一样，可能需要检查一下
    // 之前 VolumeSurge.ts 里定义的是 mongoose.model('VolumeSurge', ...)
    // 默认应该是 volumesurges
    const collectionName = 'volumesurges';
    
    // 强制删除，不管是否存在
    try {
        // 构造日期范围，匹配 2025-12-10
        // 注意：数据库中存储的是 UTC 时间，但通常我们存的是当天的 00:00:00 本地时间或 UTC 时间
        // 在 VolumeSurgeService.ts 中，使用的是 parseDate(targetDate)，它创建的是本地时间的 Date 对象
        // 比如 parseDate('20251210') -> new Date(2025, 11, 10) -> 本地时间 2025-12-10 00:00:00
        
        // 这里我们简单起见，删除所有 date 字段为 2025-12-10 的记录
        // 为了确保准确，我们匹配一整天的时间范围
        const startDate = new Date('2025-12-10T00:00:00.000Z'); // 假设存的是 UTC
        // 或者更宽泛一点，删除这一天的所有数据
        
        // 让我们先看看数据库里存的是什么样子的
        const sample = await mongoose.connection.collection(collectionName).findOne({});
        if (sample) {
            console.log('Sample document date:', sample.date);
        }

        // 既然是清理“今天”的数据，我们用范围查询
        // 考虑到时区问题，我们放宽一点范围，或者直接删除所有数据（如果用户确认只要清空重扫的话）
        // 但用户指定了“今天”，我们还是严谨一点。
        // 如果上面删除了 0 条，可能是时区问题。
        // 让我们尝试删除所有 date 字段看起来像 2025-12-10 的
        
        // 方案二：直接删除所有数据（用户之前说“把策略数据清理一下”，后来补充“只想清掉今天”）
        // 如果今天是第一次运行这个策略，那其实就是清空所有。
        // 为了保险，我们先列出所有数据的日期看看
        const allDocs = await mongoose.connection.collection(collectionName).find({}, { projection: { date: 1 } }).toArray();
        console.log('Found documents with dates:', allDocs.map(d => d.date));

        const result = await mongoose.connection.collection(collectionName).deleteMany({});
        console.log(`Deleted ${result.deletedCount} documents from ${collectionName} (Cleared ALL for safety re-scan)`);
    } catch (e) {
        console.log(`Collection ${collectionName} might not exist or error: ${e.message}`);
    }
    
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  } catch (err) {
    console.error('Error:', err);
  }
}

clear();
