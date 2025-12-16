import axios from 'axios';

async function testWencai() {
  const url = 'http://www.iwencai.com/customized/chart/get-robot-data';
  
  // 简化查询
  const question = '涨幅大于8%，股价创188日新高，非ST，非新股';
  
  const hexinV = 'A' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
  
  const data = {
    question,
    perpage: 10,
    page: 1,
    source: 'Ths_iwencai_Xuangu',
    version: '2.0',
    secondary_intent: 'stock',
  };
  
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Hexin-V': hexinV,
  };

  console.log('Sending request...');
  
  try {
    const response = await axios.post(url, data, { headers, timeout: 30000 });
    
    const result = response.data;
    console.log('Status code:', result.status_code);
    
    if (result.status_code !== 0) {
      console.log('Error:', result.status_msg || '未知错误');
      console.log('Full response:', JSON.stringify(result, null, 2).slice(0, 500));
      return;
    }

    const answer = result?.data?.answer;
    if (!answer || !answer[0] || !answer[0].txt || !answer[0].txt[0]) {
      console.log('Data structure issue');
      return;
    }

    const components = answer[0].txt[0]?.content?.components;
    if (!components || !components[0] || !components[0].data || !components[0].data.datas) {
      console.log('No components');
      return;
    }

    const datas = components[0].data.datas;
    console.log('Found', datas.length, 'stocks');
    
    if (datas.length > 0) {
      console.log('\n=== First record fields ===');
      console.log(Object.keys(datas[0]).join('\n'));
      console.log('\n=== First record data ===');
      console.log(JSON.stringify(datas[0], null, 2));
    }
  } catch (error: any) {
    console.error('Request failed:', error.message);
    if (error.response) {
      console.log('Response status:', error.response.status);
    }
  }
}

testWencai();
