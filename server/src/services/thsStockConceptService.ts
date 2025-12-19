/*
 * @Author: WRG
 * @Date: 2025-12-19
 * @Description: 同花顺个股概念服务 - 获取更详细的概念信息和联动个股
 */
import axios from 'axios';
import { logger } from '../utils';

/** 联动股票信息 */
export interface ThsRelatedStock {
  /** 股票代码 */
  code: string;
  /** 股票名称 */
  name: string;
  /** 市场ID */
  marketId: string;
  /** 收盘价 */
  closePrice: number;
  /** 涨跌幅(%) */
  changeRatio: number;
  /** 权重 */
  weight: number;
  /** 连板信息，如"首板"、"2连板"、"3天2板" */
  boardInfo: string | null;
}

/** 概念板块信息 */
export interface ThsConceptInfo {
  /** 概念ID */
  conceptId: number;
  /** 概念名称 */
  name: string;
  /** 概念代码 */
  quoteCode: string;
  /** 概念解释/上榜理由 */
  explain: string;
  /** 涨跌幅(%) */
  changeRatio: number;
  /** 上涨家数 */
  riseCount: number;
  /** 下跌家数 */
  fallCount: number;
  /** 涨停数量 */
  limitUpCount: number | null;
  /** 跌停数量 */
  limitDownCount: number | null;
  /** 收盘价/指数 */
  closePrice: number;
  /** 标签，如"走势最相关" */
  tags: string[];
  /** 龙头股列表 */
  leading: ThsRelatedStock[];
  /** 主要成分股列表 */
  components: ThsRelatedStock[];
  /** 贡献者 */
  bestDevote: string | null;
}

/** 查询结果 */
export interface ThsStockConceptResult {
  /** 股票代码 */
  code: string;
  /** 市场ID */
  marketId: string;
  /** 概念列表 */
  concepts: ThsConceptInfo[];
  /** 数据来源 */
  source: 'ths';
  /** 原始数据(可选) */
  raw?: any;
}

/**
 * 根据股票代码获取市场ID
 * 规则：
 * - 60开头 -> 17 (上证)
 * - 00/30开头 -> 33 (深证)
 * - 68开头 -> 17 (科创板，上证)
 * - 8/4开头 -> 151 (北交所)
 * - 92开头 -> 151 (北交所新股)
 */
function getMarketId(code: string): string {
  if (!code) return '17';
  
  if (code.startsWith('60') || code.startsWith('68')) {
    return '17'; // 上证
  } else if (code.startsWith('00') || code.startsWith('30')) {
    return '33'; // 深证
  } else if (code.startsWith('8') || code.startsWith('4') || code.startsWith('92')) {
    return '151'; // 北交所
  }
  
  return '17'; // 默认上证
}

/**
 * 同花顺个股概念服务
 */
class ThsStockConceptService {
  private readonly baseUrl = 'https://basic.10jqka.com.cn/fuyao/f10_stock_index/concept/v1/stock_concept_list';

  /**
   * 获取个股的概念信息和联动个股
   * @param stockCode 股票代码（如 603601）
   * @param marketId 市场ID（可选，不传则自动根据代码判断）
   * @param includeRaw 是否包含原始数据
   */
  async fetchConcepts(
    stockCode: string,
    marketId?: string,
    includeRaw = false
  ): Promise<ThsStockConceptResult> {
    if (!stockCode) {
      throw new Error('股票代码不能为空');
    }

    // 自动判断市场ID
    const mktId = marketId || getMarketId(stockCode);

    try {
      const response = await axios.get(this.baseUrl, {
        params: {
          code: stockCode,
          locale: 'zh_CN',
          market_id: mktId,
        },
        headers: {
          'Host': 'basic.10jqka.com.cn',
          'Content-Type': 'application/json',
          'Accept': '*/*',
          'User-Agent': 'IHexin/11.60.62 (iPhone; iOS 18.2.1; Scale/3.00)',
          'Accept-Language': 'zh-Hans-CN;q=1',
          'Accept-Encoding': 'gzip, deflate, br',
        },
        timeout: 15000,
      });

      const { status_code, data, status_msg } = response.data || {};

      if (status_code !== 0) {
        throw new Error(`同花顺接口返回错误: ${status_msg || '未知错误'}`);
      }

      const concepts: ThsConceptInfo[] = Array.isArray(data)
        ? data.map((item: any) => this.parseConceptItem(item))
        : [];

      const result: ThsStockConceptResult = {
        code: stockCode,
        marketId: mktId,
        concepts,
        source: 'ths',
      };

      if (includeRaw) {
        result.raw = response.data;
      }

      return result;
    } catch (error) {
      logger.error(`获取同花顺个股概念失败(${stockCode}): ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * 解析单个概念项
   */
  private parseConceptItem(item: any): ThsConceptInfo {
    return {
      conceptId: item.concept_id || 0,
      name: item.name || '',
      quoteCode: item.quote_code || '',
      explain: item.explain || '',
      changeRatio: parseFloat(item.price_change_ratio_pct) || 0,
      riseCount: parseInt(item.rise_cnt) || 0,
      fallCount: parseInt(item.fall_cnt) || 0,
      limitUpCount: item.up_down_limit_up_num ? parseInt(item.up_down_limit_up_num) : null,
      limitDownCount: item.up_down_limit_down_num ? parseInt(item.up_down_limit_down_num) : null,
      closePrice: parseFloat(item.close_price) || 0,
      tags: Array.isArray(item.tags) ? item.tags : [],
      leading: Array.isArray(item.leading)
        ? item.leading.map((s: any) => this.parseRelatedStock(s))
        : [],
      components: Array.isArray(item.components)
        ? item.components.map((s: any) => this.parseRelatedStock(s))
        : [],
      bestDevote: item.best_devote || null,
    };
  }

  /**
   * 解析联动股票信息
   */
  private parseRelatedStock(stock: any): ThsRelatedStock {
    return {
      code: stock.code || '',
      name: stock.name || '',
      marketId: stock.market_id || '',
      closePrice: parseFloat(stock.close_price) || 0,
      changeRatio: parseFloat(stock.price_change_ratio_pct) || 0,
      weight: stock.weight || 0,
      boardInfo: stock.stock_boards_for_days || null,
    };
  }
}

export const thsStockConceptService = new ThsStockConceptService();
