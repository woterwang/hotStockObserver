/*
 * @Author: WRG
 * @Date: 2025-12-19
 * @Description: 同花顺概念板块热度排行服务 - 获取实时板块热度数据
 */
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils';
import { toDateStr } from '../utils/dateUtils';

/** ETF相关信息 */
export interface ThsConceptEtfInfo {
  /** ETF产品ID */
  productId: string;
  /** ETF名称 */
  name: string;
  /** ETF涨跌幅(%) */
  changeRatio: number;
  /** ETF市场ID */
  marketId: number;
}

/** 概念板块热度信息 */
export interface ThsConceptHotItem {
  /** 板块代码 */
  code: string;
  /** 板块名称 */
  name: string;
  /** 涨跌幅(%) */
  changeRatio: number;
  /** 热度值 */
  hotRate: number;
  /** 排名 */
  order: number;
  /** 市场ID */
  marketId: number;
  /** 热度标签，如"连续39天上榜"、"首次上榜" */
  hotTag: string | null;
  /** 涨停信息，如"5家涨停" */
  limitUpTag: string | null;
  /** 排名变化，正数为上升，负数为下降 */
  rankChange: number;
  /** 相关ETF信息 */
  etf: ThsConceptEtfInfo | null;
}

/** 板块类型 */
export type ThsPlateType = 'concept' | 'industry';

/** 查询结果 */
export interface ThsConceptHotRankResult {
  /** 板块类型 */
  type: ThsPlateType;
  /** 板块热度列表 */
  items: ThsConceptHotItem[];
  /** 数据来源 */
  source: 'ths';
  /** 查询时间 */
  queryTime: string;
  /** 原始数据(可选) */
  raw?: any;
}

/**
 * 同花顺概念板块热度排行服务
 */
class ThsConceptHotRankService {
  private readonly baseUrl = 'https://dq.10jqka.com.cn/fuyao/hot_list_data/out/hot_list/v1/plate';
  private readonly cacheDir = path.join(__dirname, '../../data/concept_cache');

  /**
   * 获取板块热度排行
   * @param type 板块类型：concept-概念板块，industry-行业板块
   * @param includeRaw 是否包含原始数据
   */
  async fetchHotRank(
    type: ThsPlateType = 'concept',
    includeRaw = false
  ): Promise<ThsConceptHotRankResult> {
    const today = toDateStr(new Date());
    const cacheKey = `${today}_${type}`;
    
    try {
      const response = await axios.get(this.baseUrl, {
        params: {
          type,
        },
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
          'Origin': 'https://eq.10jqka.com.cn',
          'Referer': 'https://eq.10jqka.com.cn/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
        },
        timeout: 15000,
      });

      const { status_code, data, status_msg } = response.data || {};

      if (status_code !== 0) {
        throw new Error(`同花顺接口返回错误: ${status_msg || '未知错误'}`);
      }

      const items: ThsConceptHotItem[] = Array.isArray(data?.plate_list)
        ? data.plate_list.map((item: any) => this.parseHotItem(item))
        : [];

      const result: ThsConceptHotRankResult = {
        type,
        items,
        source: 'ths',
        queryTime: new Date().toISOString(),
      };

      if (includeRaw) {
        result.raw = response.data;
      }

      // 保存到缓存
      this.saveToCache(cacheKey, result);
      
      return result;
    } catch (error) {
      logger.error(`获取同花顺板块热度排行失败: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * 获取概念板块热度排行（便捷方法）
   */
  async fetchConceptHotRank(includeRaw = false): Promise<ThsConceptHotRankResult> {
    return this.fetchHotRank('concept', includeRaw);
  }

  /**
   * 获取行业板块热度排行（便捷方法）
   */
  async fetchIndustryHotRank(includeRaw = false): Promise<ThsConceptHotRankResult> {
    return this.fetchHotRank('industry', includeRaw);
  }

  /**
   * 解析单个板块热度数据
   */
  private parseHotItem(item: any): ThsConceptHotItem {
    // 解析ETF信息
    let etf: ThsConceptEtfInfo | null = null;
    if (item.etf_product_id) {
      etf = {
        productId: item.etf_product_id,
        name: item.etf_name || '',
        changeRatio: parseFloat(item.etf_rise_and_fall) || 0,
        marketId: item.etf_market_id || 0,
      };
    }

    return {
      code: item.code || '',
      name: item.name || '',
      changeRatio: parseFloat(item.rise_and_fall) || 0,
      hotRate: parseFloat(item.rate) || 0,
      order: item.order || 0,
      marketId: item.market_id || 0,
      hotTag: item.hot_tag || null,
      limitUpTag: item.tag || null,
      rankChange: item.hot_rank_chg || 0,
      etf,
    };
  }
  
  /**
   * 保存数据到缓存
   */
  private saveToCache(cacheKey: string, data: ThsConceptHotRankResult): void {
    try {
      // 确保缓存目录存在
      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      }
      
      const cacheFile = path.join(this.cacheDir, `${cacheKey}.json`);
      fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2), 'utf-8');
      logger.info(`[concept-hot-rank] 数据已缓存: ${cacheFile}`);
    } catch (err) {
      logger.warn(`[concept-hot-rank] 缓存保存失败: ${cacheKey}`, err);
    }
  }

  /**
   * 从缓存中读取数据
   */
  public readFromCache(cacheKey: string): ThsConceptHotRankResult | null {
    const cacheFile = path.join(this.cacheDir, `${cacheKey}.json`);
    if (fs.existsSync(cacheFile)) {
      try {
        const cachedData = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
        return cachedData;
      } catch (err) {
        logger.warn(`[concept-hot-rank] 缓存读取失败: ${cacheKey}`, err);
      }
    }
    return null;
  }
}

export const thsConceptHotRankService = new ThsConceptHotRankService();