import { conceptResonanceService } from '../src/services/conceptResonanceService';

(async () => {
  console.log('开始测试 updateKlineCacheForDate("20250121")...');
  await conceptResonanceService.updateKlineCacheForDate('20250121');
  console.log('测试完成！');
})();
