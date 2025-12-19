/*
 * @Author: hp.com
 * @Date: 2025-12-19 19:30:56
 * @LastEditors: WRG
 * @LastEditTime: 2025-12-19 19:39:54
 * @😍: 😃😃
 */
import axios from 'axios';
import { logger } from '../utils';

export interface StockConceptItem {
  code: string;
  name: string;
  analysis: string;
  mostRelevant: boolean;
}

export interface StockTopicItem {
  name: string;
  analysis: string;
}

export interface StockConceptResult {
  code: string;
  name: string;
  concepts: StockConceptItem[];
  topics: StockTopicItem[];
  source: 'kaipanla';
  raw?: any;
}

class StockConceptService {
  private readonly baseUrl = 'https://apparticle.longhuvip.com/w1/api/index.php';
  private readonly version = '5.20.0.9';
  private readonly apiVer = 'w41';

  async fetchConcepts(stockCode: string, includeRaw = false): Promise<StockConceptResult> {
    if (!stockCode) {
      throw new Error('股票代码不能为空');
    }

    const payload = new URLSearchParams({
      c: 'StockF10Basic',
      a: 'GetIndex',
      StockID: stockCode,
    //   UserID: process.env.KPL_USER_ID || '360908',
    //   Token: process.env.KPL_TOKEN || '9674f51d229c4cb1fddb2375eb4a152b',
    //   DeviceID: process.env.KPL_DEVICE_ID || '86c65473e79a0f7906d5b758c190382e3983240a',
      PhoneOSNew: '2',
      VerSion: this.version,
      apiv: this.apiVer,
    });

    try {
      const response = await axios.post(this.baseUrl, payload.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Origin': 'https://apppage.longhuvip.com',
          'Referer': 'https://apppage.longhuvip.com/',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) ;kaipanla 5.20.0.9',
        },
        timeout: 15000,
      });

      const data = response.data || {};
      const concepts: StockConceptItem[] = Array.isArray(data.Concept) ? data.Concept.map((item: any, idx: number) => ({
        code: item?.CCode || '',
        name: item?.CName || '',
        analysis: item?.Analysis || '',
        mostRelevant: idx === 0,
      })) : [];

      const topics: StockTopicItem[] = Array.isArray(data.Topic) ? data.Topic.map((item: any) => ({
        name: item?.CName || '',
        analysis: item?.Analysis || '',
      })) : [];

      const result: StockConceptResult = {
        code: data.Record?.Code || stockCode,
        name: data.Record?.Name || '',
        concepts,
        topics,
        source: 'kaipanla',
      };

      if (includeRaw) {
        result.raw = data;
      }

      return result;
    } catch (error) {
      logger.error(`获取个股概念失败(${stockCode}): ${(error as Error).message}`);
      throw error;
    }
  }
}

export const stockConceptService = new StockConceptService();
