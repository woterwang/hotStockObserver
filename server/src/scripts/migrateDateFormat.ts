/**
 * 数据库日期格式迁移脚本
 * 
 * 目的：将所有集合中的日期字段从 Date 类型统一转换为字符串格式 "YYYYMMDD"
 * 
 * 使用方法：
 *   npx ts-node src/scripts/migrateDateFormat.ts
 * 
 * 或者先编译再运行：
 *   npx tsc src/scripts/migrateDateFormat.ts --outDir dist
 *   node dist/scripts/migrateDateFormat.js
 */

import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hot-stock-observer';

// 需要迁移的集合和日期字段映射
const COLLECTIONS_TO_MIGRATE = [
  {
    name: 'buySignals',  // 注意大小写
    dateFields: ['date'],  // 主要日期字段
  },
  {
    name: 'marketsentiments',
    dateFields: ['date'],
  },
  {
    name: 'hotstocks',  // 热门股票
    dateFields: ['date'],
  },
  {
    name: 'stocknews',  // 股票新闻
    dateFields: ['date'],
  },
  {
    name: 'marketindexes',  // 市场指数
    dateFields: ['date'],
  },
  {
    name: 'sectors',  // 板块数据
    dateFields: ['date'],
  },
  // 以下集合目前都是字符串格式，但为了安全起见也检查一下
  {
    name: 'volumesurges',
    dateFields: ['date'],
  },
  {
    name: 'pricebreakthroughs',
    dateFields: ['date'],
  },
  {
    name: 'tradingsignals',
    dateFields: ['signalDate', 'day1Date', 'day2Date'],  // 这个集合用不同的字段名
  },
];

/**
 * 将 Date 对象转换为 YYYYMMDD 字符串
 */
function dateToStr(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * 检查值是否是 Date 类型
 */
function isDateType(value: any): boolean {
  return value instanceof Date || (value && typeof value === 'object' && value.constructor?.name === 'Date');
}

/**
 * 迁移单个集合的日期字段
 */
async function migrateCollection(
  db: mongoose.mongo.Db,
  collectionName: string,
  dateFields: string[]
): Promise<{ total: number; converted: number; errors: number; deleted: number }> {
  const collection = db.collection(collectionName);
  const stats = { total: 0, converted: 0, errors: 0, deleted: 0 };
  
  console.log(`\n📦 处理集合: ${collectionName}`);
  console.log(`   日期字段: ${dateFields.join(', ')}`);
  
  for (const fieldName of dateFields) {
    // 查找所有 Date 类型的文档
    // MongoDB 中 Date 类型的判断：$type: 9 或 $type: "date"
    const cursor = collection.find({
      [fieldName]: { $type: 'date' }
    });
    
    const docsToUpdate = await cursor.toArray();
    stats.total += docsToUpdate.length;
    
    if (docsToUpdate.length === 0) {
      console.log(`   ✅ ${fieldName}: 无需迁移（没有 Date 类型数据）`);
      continue;
    }
    
    console.log(`   🔄 ${fieldName}: 发现 ${docsToUpdate.length} 条 Date 类型记录需要转换`);
    
    // 逐条更新，处理可能的重复键问题
    for (const doc of docsToUpdate) {
      try {
        const dateValue = doc[fieldName];
        if (dateValue && isDateType(dateValue)) {
          const dateStr = dateToStr(dateValue);
          
          // 先检查是否会产生重复键
          // 对于 buySignals，检查是否已存在相同 date + stockCode 的字符串格式记录
          if (collectionName === 'buySignals' && doc.stockCode) {
            const existingDoc = await collection.findOne({
              [fieldName]: dateStr,
              stockCode: doc.stockCode,
              _id: { $ne: doc._id }
            });
            
            if (existingDoc) {
              // 存在重复，删除当前的 Date 类型记录（保留字符串格式的）
              await collection.deleteOne({ _id: doc._id });
              stats.deleted++;
              continue;
            }
          }
          
          // 更新为字符串格式
          await collection.updateOne(
            { _id: doc._id },
            { $set: { [fieldName]: dateStr } }
          );
          stats.converted++;
        }
      } catch (err: any) {
        if (err.code === 11000) {
          // 重复键错误，删除当前记录
          try {
            await collection.deleteOne({ _id: doc._id });
            stats.deleted++;
            console.log(`   ⚠️ 删除重复记录: _id=${doc._id}`);
          } catch (delErr) {
            console.error(`   ❌ 删除失败: _id=${doc._id}, error=${delErr}`);
            stats.errors++;
          }
        } else {
          console.error(`   ❌ 转换失败: _id=${doc._id}, error=${err}`);
          stats.errors++;
        }
      }
    }
    
    console.log(`   ✅ ${fieldName}: 成功转换 ${stats.converted} 条，删除重复 ${stats.deleted} 条`);
  }
  
  return stats;
}

/**
 * 验证迁移结果
 */
async function verifyMigration(db: mongoose.mongo.Db): Promise<void> {
  console.log('\n\n📊 验证迁移结果...\n');
  console.log('=' .repeat(70));
  
  for (const { name, dateFields } of COLLECTIONS_TO_MIGRATE) {
    const collection = db.collection(name);
    const total = await collection.countDocuments();
    
    for (const fieldName of dateFields) {
      const stringCount = await collection.countDocuments({
        [fieldName]: { $type: 'string' }
      });
      const dateCount = await collection.countDocuments({
        [fieldName]: { $type: 'date' }
      });
      const nullCount = await collection.countDocuments({
        $or: [
          { [fieldName]: null },
          { [fieldName]: { $exists: false } }
        ]
      });
      
      const status = dateCount === 0 ? '✅' : '⚠️';
      console.log(`${status} ${name}.${fieldName}:`);
      console.log(`   总数: ${total}, 字符串: ${stringCount}, Date类型: ${dateCount}, 空值: ${nullCount}`);
    }
  }
  
  console.log('=' .repeat(70));
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  console.log('🚀 数据库日期格式迁移脚本');
  console.log('=' .repeat(70));
  console.log(`目标: 将所有 Date 类型日期字段转换为字符串格式 "YYYYMMDD"`);
  console.log(`数据库: ${MONGODB_URI}`);
  console.log('=' .repeat(70));
  
  try {
    // 连接数据库
    console.log('\n📡 连接数据库...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ 数据库连接成功');
    
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('无法获取数据库连接');
    }
    
    // 先显示当前状态
    console.log('\n\n📊 迁移前状态检查...');
    await verifyMigration(db);
    
    // 询问是否继续（在脚本中自动继续）
    console.log('\n\n🔄 开始迁移...');
    
    // 执行迁移
    const totalStats = { total: 0, converted: 0, errors: 0, deleted: 0 };
    
    for (const { name, dateFields } of COLLECTIONS_TO_MIGRATE) {
      const stats = await migrateCollection(db, name, dateFields);
      totalStats.total += stats.total;
      totalStats.converted += stats.converted;
      totalStats.errors += stats.errors;
      totalStats.deleted += stats.deleted;
    }
    
    // 显示汇总
    console.log('\n\n📈 迁移完成汇总:');
    console.log('=' .repeat(70));
    console.log(`   总发现 Date 类型记录: ${totalStats.total}`);
    console.log(`   成功转换: ${totalStats.converted}`);
    console.log(`   删除重复: ${totalStats.deleted}`);
    console.log(`   错误数: ${totalStats.errors}`);
    console.log('=' .repeat(70));
    
    // 验证迁移后状态
    await verifyMigration(db);
    
    if (totalStats.errors === 0 && totalStats.converted > 0) {
      console.log('\n\n🎉 迁移成功完成！所有日期字段已统一为字符串格式。');
    } else if (totalStats.total === 0) {
      console.log('\n\n✅ 无需迁移，所有日期字段已经是字符串格式。');
    } else if (totalStats.errors > 0) {
      console.log('\n\n⚠️ 迁移完成，但有部分错误。请检查上面的错误信息。');
    }
    
  } catch (error) {
    console.error('\n\n❌ 迁移失败:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n📡 数据库连接已关闭');
  }
}

// 运行
main().catch(console.error);
