const axios = require('axios');
const path = require('path');
const thsUtils = require('./src/utils/thsUtils');

async function testVolumeSurge() {
  console.log('开始测试放量大涨接口...');

  // 获取当前日期 YYYYMMDD
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const dateStr = `${year}${month}${day}`;
  
  console.log(`测试日期: ${dateStr}`);

  const question = `${dateStr}量比大于2，${dateStr}涨幅大于5%，非ST，非新股，非北交所`;
  console.log(`查询语句: ${question}`);

  const url = 'http://www.iwencai.com/customized/chart/get-robot-data';
  
  let hexinV;
  try {
    hexinV = thsUtils.update();
    console.log('Hexin-V 生成成功:', hexinV);
  } catch (error) {
    console.error('Hexin-V 生成失败:', error.message);
    hexinV = 'Ax8Ssngzh0M9kINf4Czhe-DDqnmphHMgjdx3GrFqu4gVdzBiuVQDdp2oB0_C';
  }

  const data = {
    question,
    perpage: 100,
    page: 1,
    source: 'Ths_iwencai_Xuangu',
    version: '2.0',
    query_area: '',
    block_list: '',
    add_info: JSON.stringify({ urp: { scene: 1, company: 1, business: 1 }, contentType: 'json', searchInfo: true }),
    secondary_intent: 'stock',
    log_info: JSON.stringify({ input_type: 'typewrite' }),
    rsh: 'Ths_iwencai_Xuangu_0k9ulnwt96k6xiozeacd2z20dhuy0s9b',
  };

  try {
    const response = await axios.post(url, data, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'hexin-v': hexinV,
      },
    });

    if (
      response.data &&
      response.data.data &&
      response.data.data.answer &&
      response.data.data.answer.length > 0 &&
      response.data.data.answer[0].txt &&
      response.data.data.answer[0].txt.length > 0 &&
      response.data.data.answer[0].txt[0].content &&
      response.data.data.answer[0].txt[0].content.components &&
      response.data.data.answer[0].txt[0].content.components.length > 0 &&
      response.data.data.answer[0].txt[0].content.components[0].data &&
      response.data.data.answer[0].txt[0].content.components[0].data.datas
    ) {
      const results = response.data.data.answer[0].txt[0].content.components[0].data.datas;
      console.log(`接口调用成功！获取到 ${results.length} 条数据。`);
      if (results.length > 0) {
        console.log('第一条数据示例:');
        const first = results[0];
        console.log(JSON.stringify(first, null, 2));
      }
    } else {
      console.log('接口调用成功，但未返回有效数据结构。可能今天没有符合条件的股票，或者数据结构已变更。');
      console.log('原始响应数据:', JSON.stringify(response.data).substring(0, 500) + '...');
    }
  } catch (error) {
    console.error('接口调用失败:', error.message);
    if (error.response) {
      console.error('状态码:', error.response.status);
      console.error('响应头:', error.response.headers);
    }
  }
}

testVolumeSurge();
