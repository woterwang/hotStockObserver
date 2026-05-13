/**
 * 数据迁移脚本
 * 将数据库中的 Date 类型字段转换为 YYYYMMDD 字符串格式
 * 
 * 涉及的集合：
 * - volumesurges: date 字段
 * - buysignals: date, selectionDate 字段
 * - pricebreakthroughs: date 字段
 * - tradingsignals: signalDate, day1Date, day2Date 字段
 * 
 * 使用方法:
 *   npx ts-node src/scripts/migrateDate2String.ts
 */

import mongoose from 'mongoose';
import dayjs from 'dayjs';

// MongoDB 连接配置
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hot-stock-observer';

// 辅助函数：将 Date 转换为 YYYYMMDD 字符串
function dateToString(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  
  // 如果已经是字符串，检查格式
  if (typeof date === 'string') {
    // 如果已经是 YYYYMMDD 格式，直接返回
    if (/^\d{8}$/.test(date)) {
      return date;
    }
    // 如果是 YYYY-MM-DD 格式，转换
    if (/^\d{4}-\d{2}-\d{2}/.test(date)) {
      return date.replace(/-/g, '').substring(0, 8);
    }
  }
  
  // 如果是 Date 对象，转换为字符串
  // 注意：MongoDB 存储的是 UTC 时间，需要转换为北京时间
  const d = dayjs(date).add(8, 'hour'); // UTC+8
  return d.format('YYYYMMDD');
}

async function migrateCollection(
  db: mongoose.Connection,
  collectionName: string,
  dateFields: string[]
): Promise<{ updated: number; skipped: number; errors: number }> {
  console.log(`\n开始迁移 ${collectionName}...`);
  
  const collection = db.collection(collectionName);
  const cursor = collection.find({});
  
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  
  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    if (!doc) continue;
    
    try {
      const updates: Record<string, string> = {};
      let needsUpdate = false;
      
      for (const field of dateFields) {
        const value = doc[field];
        
        // 检查是否需要转换
        if (value instanceof Date) {
          const stringValue = dateToString(value);
          if (stringValue) {
            updates[field] = stringValue;
            needsUpdate = true;
          }
        } else if (typeof value === 'string' && value.includes('T')) {
          // ISO 日期字符串格式 (e.g., "2024-12-15T00:00:00.000Z")
          const stringValue = dateToString(value);
          if (stringValue) {
            updates[field] = stringValue;
            needsUpdate = true;
          }
        }
      }
      
      if (needsUpdate) {
        await collection.updateOne(
          { _id: doc._id },
          { $set: updates }
        );
        updated++;
        
        if (updated % 100 === 0) {
          console.log(`  已更新 ${updated} 条记录...`);
        }
      } else {
        skipped++;
      }
    } catch (err) {
      console.error(`  错误: ${(err as Error).message}`);
      errors++;
    }
  }
  
  console.log(`${collectionName} 迁移完成: 更新 ${updated}, 跳过 ${skipped}, 错误 ${errors}`);
  return { updated, skipped, errors };
}

async function main() {
  console.log('='.repeat(60));
  console.log('日期字段迁移脚本');
  console.log('将 Date 类型转换为 YYYYMMDD 字符串格式');
  console.log('='.repeat(60));
  
  try {
    // 连接数据库
    console.log(`\n连接数据库: ${MONGODB_URI}`);
    await mongoose.connect(MONGODB_URI);
    const db = mongoose.connection;
    console.log('数据库连接成功');
    
    // 迁移各个集合
    const collections = [
      { name: 'volumesurges', fields: ['date'] },
      { name: 'buysignals', fields: ['date', 'selectionDate'] },
      { name: 'pricebreakthroughs', fields: ['date'] },
      { name: 'tradingsignals', fields: ['signalDate', 'day1Date', 'day2Date'] },
    ];
    
    const results: Record<string, { updated: number; skipped: number; errors: number }> = {};
    
    for (const { name, fields } of collections) {
      results[name] = await migrateCollection(db, name, fields);
    }
    
    // 打印汇总
    console.log('\n' + '='.repeat(60));
    console.log('迁移汇总:');
    console.log('='.repeat(60));
    
    let totalUpdated = 0;
    let totalSkipped = 0;
    let totalErrors = 0;
    
    for (const [name, result] of Object.entries(results)) {
      console.log(`${name}: 更新 ${result.updated}, 跳过 ${result.skipped}, 错误 ${result.errors}`);
      totalUpdated += result.updated;
      totalSkipped += result.skipped;
      totalErrors += result.errors;
    }
    
    console.log('-'.repeat(60));
    console.log(`总计: 更新 ${totalUpdated}, 跳过 ${totalSkipped}, 错误 ${totalErrors}`);
    
    if (totalErrors > 0) {
      console.log('\n⚠️ 有错误发生，请检查日志');
    } else {
      console.log('\n✅ 迁移完成！');
    }
    
  } catch (error) {
    console.error('迁移失败:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n数据库连接已关闭');
  }
}

main();
