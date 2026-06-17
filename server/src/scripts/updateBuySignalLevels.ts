/**
 * 批量更新 BuySignal 历史数据的信号等级
 * 
 * 根据新的评分规则更新 buySignal 字段：
 *   - totalBuyScore >= 80 → strong_buy (强烈买入)
 *   - totalBuyScore >= 70 → buy (建议买入)
 *   - totalBuyScore >= 50 → hold (观望)
 *   - totalBuyScore < 50 → pass (放弃)
 * 
 * 使用方法:
 *   npx ts-node src/scripts/updateBuySignalLevels.ts
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { BuySignal } from '../../data/concept_cache/models';

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hot_stock_observer';

/**
 * 根据 totalBuyScore 计算新的信号等级和仓位
 */
function calculateSignalLevel(totalScore: number): {
  buySignal: 'strong_buy' | 'buy' | 'hold' | 'pass';
  suggestedPosition: number;
} {
  if (totalScore >= 80) {
    return { buySignal: 'strong_buy', suggestedPosition: 30 };
  } else if (totalScore >= 70) {
    return { buySignal: 'buy', suggestedPosition: 20 };
  } else if (totalScore >= 50) {
    return { buySignal: 'hold', suggestedPosition: 10 };
  } else {
    return { buySignal: 'pass', suggestedPosition: 0 };
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('========================================');
  console.log('BuySignal 历史数据信号等级更新脚本');
  console.log('========================================\n');
  
  console.log('新的评分规则:');
  console.log('  ≥ 80 分 → strong_buy (强烈买入, 3成仓)');
  console.log('  ≥ 70 分 → buy (建议买入, 2成仓)');
  console.log('  ≥ 50 分 → hold (观望, 1成仓)');
  console.log('  < 50 分 → pass (放弃, 0成仓)');
  console.log('');

  try {
    // 连接数据库
    console.log(`连接数据库: ${MONGODB_URI}`);
    await mongoose.connect(MONGODB_URI);
    console.log('数据库连接成功\n');

    // 统计当前数据分布
    console.log('========== 更新前统计 ==========');
    const beforeStats = await BuySignal.aggregate([
      {
        $group: {
          _id: '$buySignal',
          count: { $sum: 1 }
        }
      }
    ]);
    console.log('当前信号分布:');
    beforeStats.forEach(stat => {
      console.log(`  ${stat._id}: ${stat.count} 条`);
    });

    // 统计评分分布
    const scoreStats = await BuySignal.aggregate([
      {
        $bucket: {
          groupBy: '$totalBuyScore',
          boundaries: [0, 50, 60, 70, 80, 101],
          default: 'unknown',
          output: {
            count: { $sum: 1 }
          }
        }
      }
    ]);
    console.log('\n评分区间分布:');
    scoreStats.forEach(stat => {
      const range = stat._id === 'unknown' ? '未知' : 
                    stat._id === 0 ? '0-49' :
                    stat._id === 50 ? '50-59' :
                    stat._id === 60 ? '60-69' :
                    stat._id === 70 ? '70-79' :
                    stat._id === 80 ? '80-100' : String(stat._id);
      console.log(`  ${range} 分: ${stat.count} 条`);
    });

    // 查询所有需要更新的记录
    console.log('\n========== 开始更新 ==========');
    const allRecords = await BuySignal.find({}).lean();
    console.log(`总记录数: ${allRecords.length}`);

    let updatedCount = 0;
    let unchangedCount = 0;
    const updateDetails = {
      toStrongBuy: 0,
      toBuy: 0,
      toHold: 0,
      toPass: 0
    };

    // 批量更新
    const bulkOps: any[] = [];
    
    for (const record of allRecords) {
      const { buySignal: newSignal, suggestedPosition: newPosition } = calculateSignalLevel(record.totalBuyScore);
      
      // 只更新信号等级发生变化的记录
      if (record.buySignal !== newSignal || record.suggestedPosition !== newPosition) {
        bulkOps.push({
          updateOne: {
            filter: { _id: record._id },
            update: {
              $set: {
                buySignal: newSignal,
                suggestedPosition: newPosition
              }
            }
          }
        });
        
        updatedCount++;
        
        // 统计变更详情
        if (newSignal === 'strong_buy') updateDetails.toStrongBuy++;
        else if (newSignal === 'buy') updateDetails.toBuy++;
        else if (newSignal === 'hold') updateDetails.toHold++;
        else updateDetails.toPass++;
      } else {
        unchangedCount++;
      }
    }

    // 执行批量更新
    if (bulkOps.length > 0) {
      const result = await BuySignal.bulkWrite(bulkOps);
      console.log(`批量更新完成: ${result.modifiedCount} 条记录已更新`);
    }

    console.log(`\n更新详情:`);
    console.log(`  → strong_buy: ${updateDetails.toStrongBuy} 条`);
    console.log(`  → buy: ${updateDetails.toBuy} 条`);
    console.log(`  → hold: ${updateDetails.toHold} 条`);
    console.log(`  → pass: ${updateDetails.toPass} 条`);
    console.log(`  未变化: ${unchangedCount} 条`);

    // 统计更新后的数据分布
    console.log('\n========== 更新后统计 ==========');
    const afterStats = await BuySignal.aggregate([
      {
        $group: {
          _id: '$buySignal',
          count: { $sum: 1 }
        }
      }
    ]);
    console.log('新的信号分布:');
    afterStats.forEach(stat => {
      console.log(`  ${stat._id}: ${stat.count} 条`);
    });

    console.log('\n========== 更新完成 ==========');
    
  } catch (error) {
    console.error('更新失败:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n数据库连接已关闭');
  }
}

// 执行主函数
main();
