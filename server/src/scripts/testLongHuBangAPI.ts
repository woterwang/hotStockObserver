/**
 * 测试龙虎榜API
 */
import axios from 'axios';

async function testLongHuBangAPI() {
  console.log('开始测试龙虎榜API...');
  
  const url = 'https://apphis.longhuvip.com/w1/api/index.php';
  const params = 'Day=2025-12-10&PhoneOSNew=2&VerSion=5.20.0.9&a=HisZhangFuDetail&apiv=w41&c=HisHomeDingPan';
  
  try {
    const resp = await axios.post(url, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
        'User-Agent': 'lhb/5.20.9 (com.kaipanla.www; build:1; iOS 18.2.1) Alamofire/4.9.1',
        'Accept': '*/*',
      },
      timeout: 15000,
    });
    
    console.log('=== 原始响应 ===');
    console.log(JSON.stringify(resp.data, null, 2));
    
    // 解析数据
    const info = resp.data.info;
    if (info) {
      console.log('\n=== 解析数据 ===');
      console.log('涨停数(SJZT):', info.SJZT);
      console.log('跌停数(SJDT):', info.SJDT);
      console.log('上涨家数(SZJS):', info.SZJS);
      console.log('下跌家数(XDJS):', info.XDJS);
      console.log('平盘(0):', info['0']);
      console.log('情绪描述(sign):', info.sign);
    }
  } catch (error: any) {
    console.error('请求失败:', error.message);
    if (error.response) {
      console.error('响应状态:', error.response.status);
      console.error('响应数据:', error.response.data);
    }
  }
}

testLongHuBangAPI();
