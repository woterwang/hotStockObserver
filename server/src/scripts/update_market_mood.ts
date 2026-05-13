import { marketMoodService } from '../services/marketMoodService';
import { logger } from '../utils';

async function main() {
  try {
    logger.info('开始手动更新市场情绪缓存...');
    
    // 初始化服务（加载现有缓存）
    await marketMoodService.init();
    
    // 更新缓存
    const success = await marketMoodService.updateCache();
    
    if (success) {
      const status = marketMoodService.getCacheStatus();
      logger.info('市场情绪缓存更新成功！');
      logger.info(`当前状态: ${JSON.stringify(status, null, 2)}`);
      
      // 打印最新的几条数据看看
      const latest = marketMoodService.getLatestMood();
      logger.info(`最新情绪: ${JSON.stringify(latest)}`);
    } else {
      logger.error('市场情绪缓存更新失败');
    }
    
  } catch (error) {
    logger.error(`执行出错: ${(error as Error).message}`);
  }
}

main();
