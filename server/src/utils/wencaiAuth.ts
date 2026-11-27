import axios, { AxiosResponse } from 'axios';

export function getWencaiCookie (
  hexinV: string,
  _fallbackCookie: string = ''
): string {
  return `v=${hexinV}`;
}

export async function postWencaiQuery (
  payload: Record<string, unknown>,
  hexinV: string,
  timeout: number = 30000
): Promise<AxiosResponse<any>> {
  const question = String(payload.question ?? payload.query ?? '');
  const data = new URLSearchParams({
    query: question,
    urp_sort_way: String(payload.urp_sort_way ?? 'desc'),
    page: String(payload.page ?? 1),
    perpage: String(payload.perpage ?? 100),
    codelist: String(payload.codelist ?? ''),
    indexnamelimit: String(payload.indexnamelimit ?? ''),
    ret: 'json_all',
    source: 'Ths_iwencai_Xuangu',
    iwc_token: '',
    urp_use_sort: '1',
    query_type: 'stock',
    comp_id: '6933312',
    business_cat: 'soniu',
    uuid: '24087',
  });

  if (payload.urp_sort_index) {
    data.set('urp_sort_index', String(payload.urp_sort_index));
  }

  const response = await axios.post(
    'https://www.iwencai.com/gateway/urp/v7/landing/getDataList',
    data,
    {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'https://www.iwencai.com',
        'Referer': 'https://www.iwencai.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'hexin-v': hexinV,
      },
      timeout,
    }
  );

  const gatewayResult = response.data;
  const components = gatewayResult?.answer?.components || [];
  response.data = {
    ...gatewayResult,
    status_code: Number(gatewayResult?.status_code),
    data: {
      ...(gatewayResult?.data || {}),
      answer: [{
        txt: [{
          content: { components },
        }],
      }],
    },
  };

  return response;
}
