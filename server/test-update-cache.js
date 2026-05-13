#!/usr/bin/env node

/**
 * 用于测试 updateCache 方法的脚本
 * 由于 Jest 测试通常在构建后运行，此脚本提供了一个简单的手动测试方式
 */

const fs = require('fs');
const path = require('path');
const { tradingCalendarService } = require('./dist/services/tradingCalendarService');

async function testUpdateCache() {
  console.log('开始测试 updateCache 方法...');
  
  try {
    // 尝试更新缓存
    const startTime = Date.now();
    console.log('正在调用 updateCache 方法...');
    
    const result = await tradingCalendarService.updateCache();
    
    const endTime = Date.now();
    console.log(`updateCache 方法执行完毕，耗时: ${endTime - startTime} ms`);
    console.log(`返回结果: ${result}`);
    
    if (result) {
      console.log('✅ 缓存更新成功！');
      
      // 检查缓存文件是否存在
      const cachePath = path.join(__dirname, 'data', 'trading_calendar.json');
      if (fs.existsSync(cachePath)) {
        const cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
        console.log(`📊 缓存包含 ${cacheData.tradingDays.length} 个交易日`);
        console.log(`📅 最近的更新时间: ${cacheData.updatedAt}`);
        
        if (cacheData.tradingDays.length > 0) {
          console.log(`🗓️  最早的交易日: ${cacheData.tradingDays[0]}`);
          console.log(`🗓️  最晚的交易日: ${cacheData.tradingDays[cacheData.tradingDays.length - 1]}`);
          
          // 显示最近的几个交易日
          const recentDays = cacheData.tradingDays.slice(-5);
          console.log(`🗓️  最近的5个交易日: ${recentDays.join(', ')}`);
        }
      } else {
        console.log('❌ 缓存文件未找到');
      }
    } else {
      console.log('❌ 缓存更新失败！');
    }
  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error.message);
  }
}

// 运行测试
testUpdateCache().then(() => {
  console.log('\n测试完成！');
}).catch(error => {
  console.error('测试失败:', error);
});