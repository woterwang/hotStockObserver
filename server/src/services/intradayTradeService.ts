/*
 * @Author: hp.com
 * @Date: 2026-01-18 17:16:06
 * @LastEditors: WRG
 * @LastEditTime: 2026-01-18 21:44:49
 * @😍: 😃😃
 */
import axios from 'axios';
import { logger } from '../utils';

// 同花顺分时成交数据API
const THS_INTRADAY_API = 'https://quota-h.10jqka.com.cn/fuyao/common_hq_aggr/quote/v1/single_trend';

// JWT Token (用于API认证)
const FUYAO_AUTH_TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJhdXRob3JpemVyX25hbWVzcGFjZSI6ImNvbW1vbi1ocS1hZ2dyIiwibGljZW5zZWVfdHlwZSI6IkZST05UX0FQUCIsImxpY2Vuc2VlX25hbWVzcGFjZSI6Imh4a2xpbmUtQUlNRV9Db21wb25lbnRfTGlicmFyeV9Db21wb25lbnQifQ.MWqYrKk4Y2_oWTbG3XZjNGoHK_GmIi_KeJKc_mNDqTA';

/**
 * 分时成交数据项
 */
export interface IntradayTradeItem {
  timestamp: number;      // 成交时间戳（毫秒）
  time: string;           // 成交时间（HH:mm:ss格式）
  basePrice: number;      // 基准价（昨收价）
  price: number;          // 成交价格
  volume: number;         // 累计成交量
  turnover: number;       // 累计成交额
}

/**
 * 单只股票的分时成交数据
 */
export interface IntradayTradeData {
  stockCode: string;      // 股票代码
  tradeDate: string;      // 交易日期（YYYYMMDD格式）
  market: string;         // 市场（33=深圳，17=上海）
  basePrice: number;      // 基准价（昨收价）
  trades: IntradayTradeItem[];  // 分时成交数据列表
}

/**
 * 查询请求参数
 */
export interface IntradayTradeQuery {
  stockCode: string;      // 股票代码
  tradeDate: string | number;  // 交易日期（YYYYMMDD格式）
}

/**
 * 批量查询结果
 */
export interface BatchIntradayTradeResult {
  success: IntradayTradeData[];    // 成功获取的数据
  failed: {
    stockCode: string;
    tradeDate: string | number;
    error: string;
  }[];                             // 失败的查询
}

/**
 * 开盘信息（从分时数据提取）
 */
export interface OpeningInfo {
  stockCode: string;          // 股票代码
  tradeDate: string;          // 交易日期
  openPrice: number;          // 开盘价
  openChangePercent: number;  // 开盘涨幅（%）
  auctionVolume: number;      // 集合竞价成交量
  auctionTurnover: number;    // 集合竞价成交额
  auctionAmountRatio: number; // 竞价金额占全天成交额比例（%）
  firstTradeTime: string;     // 首笔成交时间
}

/**
 * 分时成交数据服务
 * 用于查询股票在指定交易日的分时成交记录
 */
export class IntradayTradeService {
  private timeout: number;

  constructor() {
    this.timeout = parseInt(process.env.REQUEST_TIMEOUT || '10000');
  }

  /**
   * 根据股票代码获取市场标识
   * @param stockCode 股票代码
   * @returns 市场标识（33=深圳，17=上海，16=北交所）
   */
  private getMarketCode(stockCode: string): string {
    // 上海: 6开头、688科创板
    if (stockCode.startsWith('6')) {
      return '17';
    }
    // 深圳: 0开头、3创业板
    if (stockCode.startsWith('0') || stockCode.startsWith('3')) {
      return '33';
    }
    // 北交所: 92开头
    if (stockCode.startsWith('92')) {
      return '16';
    }
    return '33'; // 默认深圳
  }

  /**
   * 格式化交易日期
   * @param date 日期（支持YYYYMMDD数字或字符串，YYYY-MM-DD格式）
   * @returns YYYYMMDD格式的数字
   */
  private formatTradeDate(date: string | number): number {
    if (typeof date === 'number') {
      return date;
    }
    // 如果是YYYY-MM-DD格式，转换为YYYYMMDD
    if (date.includes('-')) {
      return parseInt(date.replace(/-/g, ''));
    }
    return parseInt(date);
  }

  /**
   * 将时间戳转换为时间字符串
   * @param timestamp 时间戳（毫秒）
   * @returns HH:mm:ss格式的时间字符串
   */
  private formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }

  /**
   * 查询单只股票的分时成交数据
   * @param stockCode 股票代码
   * @param tradeDate 交易日期（YYYYMMDD格式）
   * @returns 分时成交数据
   */
  async fetchIntradayTrade(stockCode: string, tradeDate: string | number): Promise<IntradayTradeData> {
	logger.info(`开始查询分时成交数据 [${stockCode}/${tradeDate}]`);
    const market = this.getMarketCode(stockCode);
    const formattedDate = this.formatTradeDate(tradeDate);

    const requestBody = {
      code_list: [
        {
          codes: [stockCode],
          market: market
        }
      ],
      trade_date: formattedDate,
      gpid: 1,
      time_zone: 'Asia/Shanghai',
      trade_class: 'intraday'
    };

    try {
      const response = await axios.post(THS_INTRADAY_API, requestBody, {
        timeout: this.timeout,
        headers: {
          'Content-Type': 'application/json',
          'Accept': '*/*',
          'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
          'Origin': 'https://search.10jqka.com.cn',
          'Referer': 'https://search.10jqka.com.cn/',
          'platform': 'hxkline',
          'source-id': 'hxkline-AIME_Component_Library_Component',
          'x-auth-appname': 'AINVEST',
          'x-auth-progid': '7047',
          'x-auth-type': 'ths',
          'x-auth-version': '1.0',
        //   'x-fuyao-auth': FUYAO_AUTH_TOKEN
        }
      });

      const data = response.data;

      if (data.status_code !== 0) {
        throw new Error(`API返回错误: status_code=${data.status_code}`);
      }

      const quoteData = data.data?.quote_data?.[0];
      if (!quoteData) {
        throw new Error('未获取到行情数据');
      }

      // 解析分时数据
      const trades: IntradayTradeItem[] = [];
      const valueList = quoteData.value || [];

      for (const item of valueList) {
        if (Array.isArray(item) && item.length >= 4) {
          const timestamp = item[0];
          trades.push({
            timestamp,
            time: this.formatTime(timestamp),
			basePrice: quoteData.base_price,
            price: item[1],      // 成交价格
            volume: item[2],     // 累计成交量
            turnover: item[3]    // 累计成交额
          });
        }
      }

      return {
        stockCode,
        tradeDate: formattedDate.toString(),
        market,
        basePrice: quoteData.base_price || 0,
        trades
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '未知错误';
      logger.error(`获取分时成交数据失败 [${stockCode}/${tradeDate}]: ${errorMsg}`);
      throw new Error(`获取分时成交数据失败: ${errorMsg}`);
    }
  }

  /**
   * 批量查询分时成交数据（同一交易日的多只股票）
   * 利用API的code_list参数支持批量查询，减少请求次数
   * @param stockCodes 股票代码列表
   * @param tradeDate 交易日期
   * @returns 批量查询结果
   */
  async fetchMultipleStocksIntradayTrade(stockCodes: string[], tradeDate: string | number): Promise<BatchIntradayTradeResult> {
    const result: BatchIntradayTradeResult = {
      success: [],
      failed: []
    };

    if (stockCodes.length === 0) {
      return result;
    }

    const formattedDate = this.formatTradeDate(tradeDate);

    // 按市场分组股票代码
    const marketGroups: Map<string, string[]> = new Map();
    for (const stockCode of stockCodes) {
      const market = this.getMarketCode(stockCode);
      if (!marketGroups.has(market)) {
        marketGroups.set(market, []);
      }
      marketGroups.get(market)!.push(stockCode);
    }

    // 构建code_list参数
    const codeList = Array.from(marketGroups.entries()).map(([market, codes]) => ({
      codes,
      market
    }));
	logger.info(`批量查询分时成交数据请求体: ${JSON.stringify({ codeList, trade_date: formattedDate })}`);

    const requestBody = {
      code_list: codeList,
      trade_date: formattedDate,
      gpid: 1,
      time_zone: 'Asia/Shanghai',
      trade_class: 'intraday'
    };
	logger.info(`开始批量查询分时成交数据[${tradeDate}]: 股票数量=${stockCodes.length}`);

    try {
      const response = await axios.post(THS_INTRADAY_API, requestBody, {
        timeout: this.timeout,
        headers: {
          'Content-Type': 'application/json',
          'Accept': '*/*',
          'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
          'Origin': 'https://search.10jqka.com.cn',
          'Referer': 'https://search.10jqka.com.cn/',
          'platform': 'hxkline',
          'source-id': 'hxkline-AIME_Component_Library_Component',
          'x-auth-appname': 'AINVEST',
          'x-auth-progid': '7047',
          'x-auth-type': 'ths',
          'x-auth-version': '1.0',
        }
      });

      const data = response.data;

      if (data.status_code !== 0) {
        // 整个请求失败，所有股票都记录为失败
        for (const stockCode of stockCodes) {
          result.failed.push({
            stockCode,
            tradeDate,
            error: `API返回错误: status_code=${data.status_code}`
          });
        }
        return result;
      }

      const quoteDataList = data.data?.quote_data || [];
      const returnedCodes = new Set<string>();

      // 解析返回的数据
      for (const quoteData of quoteDataList) {
        const stockCode = quoteData.code;
        returnedCodes.add(stockCode);

        const trades: IntradayTradeItem[] = [];
        const valueList = quoteData.value || [];

        for (const item of valueList) {
          if (Array.isArray(item) && item.length >= 4) {
            const timestamp = item[0];
            trades.push({
              timestamp,
              time: this.formatTime(timestamp),
              price: item[1],
              volume: item[2],
              turnover: item[3]
            });
          }
        }

        result.success.push({
          stockCode,
          tradeDate: formattedDate.toString(),
          market: quoteData.market,
          basePrice: quoteData.base_price || 0,
          trades
        });
      }

      // 检查哪些股票没有返回数据
      for (const stockCode of stockCodes) {
        if (!returnedCodes.has(stockCode)) {
          result.failed.push({
            stockCode,
            tradeDate,
            error: '未获取到该股票的数据'
          });
        }
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '未知错误';
      logger.error(`批量获取分时成交数据失败 [${tradeDate}]: ${errorMsg}`);
      // 请求异常，所有股票都记录为失败
      for (const stockCode of stockCodes) {
        result.failed.push({
          stockCode,
          tradeDate,
          error: errorMsg
        });
      }
    }

    logger.info(`批量查询分时成交数据完成[${tradeDate}]: 成功${result.success.length}条, 失败${result.failed.length}条`);
    return result;
  }

    /**
   * 批量查询分时成交数据（同一交易日的多只股票）
   * 利用for循环分批调用API，控制每次请求的股票数量
   * @param stockCodes 股票代码列表
   * @param tradeDate 交易日期
   * @returns 批量查询结果
   */
  async fetchMultipleStocksIntradayTrade_Batched(stockCodes: string[], tradeDate: string | number): Promise<BatchIntradayTradeResult> {
	const result: BatchIntradayTradeResult = {
	  success: [],
	  failed: []
	};
	if (stockCodes.length === 0) {
	  return result;
	}
	
	const batchSize = 50; // 每次请求的股票数量
	const formattedDate = this.formatTradeDate(tradeDate);
	logger.info(`开始批量查询分时成交数据[${tradeDate}]: 股票数量=${stockCodes.length}`);
	for (let i = 0; i < stockCodes.length; i += batchSize) {
	  const batchCodes = stockCodes.slice(i, i + batchSize);
	  const batchResult = await this.fetchIntradayTrade(batchCodes[0], formattedDate);
	  result.success.push(batchResult);
	//   result.failed.push(...batchResult.failed);
	  await this.delay(1000+Math.random()*2000); // 每批次之间延迟1-3秒
	}
	logger.info(`批量查询分时成交数据完成[${tradeDate}]: 成功${result.success.length}条, 失败${result.failed.length}条`);
	return result;
  }

  /**
   * 批量查询分时成交数据（支持不同交易日的多只股票）
   * @param queries 查询参数列表
   * @returns 批量查询结果
   */
  async fetchBatchIntradayTrade(queries: IntradayTradeQuery[]): Promise<BatchIntradayTradeResult> {
    const result: BatchIntradayTradeResult = {
      success: [],
      failed: []
    };

    if (queries.length === 0) {
      return result;
    }

    // 按交易日期分组（因为API的trade_date是单个值，同一请求只能查询同一天的数据）
    const dateGroups: Map<number, string[]> = new Map();
    for (const query of queries) {
      const formattedDate = this.formatTradeDate(query.tradeDate);
      if (!dateGroups.has(formattedDate)) {
        dateGroups.set(formattedDate, []);
      }
      dateGroups.get(formattedDate)!.push(query.stockCode);
    }

    // 按日期分组并行查询
    const dateEntries = Array.from(dateGroups.entries());
    const concurrencyLimit = 3; // 并发请求数限制

    for (let i = 0; i < dateEntries.length; i += concurrencyLimit) {
      const batch = dateEntries.slice(i, i + concurrencyLimit);
      
      const promises = batch.map(([tradeDate, stockCodes]) => 
        this.fetchMultipleStocksIntradayTrade(stockCodes, tradeDate)
      );

      const batchResults = await Promise.all(promises);

      for (const batchResult of batchResults) {
        result.success.push(...batchResult.success);
        result.failed.push(...batchResult.failed);
      }

      // 批次间延迟
      if (i + concurrencyLimit < dateEntries.length) {
        await this.delay(300);
      }
    }

    logger.info(`批量查询分时成交数据完成: 成功${result.success.length}条, 失败${result.failed.length}条`);
    return result;
  }

  /**
   * 查询单只股票多个交易日的分时成交数据
   * @param stockCode 股票代码
   * @param tradeDates 交易日期列表
   * @returns 批量查询结果
   */
  async fetchMultipleDaysIntradayTrade(stockCode: string, tradeDates: (string | number)[]): Promise<BatchIntradayTradeResult> {
    const queries: IntradayTradeQuery[] = tradeDates.map(tradeDate => ({
      stockCode,
      tradeDate
    }));
    return this.fetchBatchIntradayTrade(queries);
  }
  /**
   * 从分时数据中提取开盘信息
   * @param intradayData 分时成交数据
   * @returns 开盘信息
   */
  extractOpeningInfo(intradayData: IntradayTradeData): OpeningInfo {
    const { stockCode, tradeDate, basePrice, trades } = intradayData;

    // 默认值
    const result: OpeningInfo = {
      stockCode,
      tradeDate,
      openPrice: 0,
      openChangePercent: 0,
      auctionVolume: 0,
      auctionTurnover: 0,
      auctionAmountRatio: 0,
      firstTradeTime: '',
    };

    if (!trades || trades.length === 0) {
      return result;
    }

    // 第一条分时数据即为集合竞价结果（9:25的数据）
    const firstTrade = trades[0];
    result.openPrice = firstTrade.price;
    result.firstTradeTime = firstTrade.time;
    result.auctionVolume = firstTrade.volume;
    result.auctionTurnover = firstTrade.turnover;

    // 计算开盘涨幅（相对于昨收价basePrice）
    if (basePrice > 0) {
      result.openChangePercent = Math.round(((firstTrade.price - basePrice) / basePrice) * 10000) / 100;
    }

    // 计算竞价金额占比（需要全天成交额，取最后一条分时数据）
    const lastTrade = trades[trades.length - 1];
    if (lastTrade && lastTrade.turnover > 0) {
      result.auctionAmountRatio = Math.round((firstTrade.turnover / lastTrade.turnover) * 10000) / 100;
    }

    return result;
  }

  /**
   * 批量获取多只股票的开盘信息（同一交易日）
   * @param stockCodes 股票代码列表
   * @param tradeDate 交易日期
   * @returns 开盘信息Map，key为股票代码
   */
  async fetchBatchOpeningInfo(stockCodes: string[], tradeDate: string | number): Promise<Map<string, OpeningInfo>> {
    const openingInfoMap = new Map<string, OpeningInfo>();

    if (stockCodes.length === 0) {
      return openingInfoMap;
    }

    // 批量获取分时数据
    const batchResult = await this.fetchMultipleStocksIntradayTrade(stockCodes, tradeDate);

    // 从分时数据中提取开盘信息
    for (const intradayData of batchResult.success) {
      const openingInfo = this.extractOpeningInfo(intradayData);
      openingInfoMap.set(intradayData.stockCode, openingInfo);
    }

    // 对于失败的股票，记录日志但不阻塞
    if (batchResult.failed.length > 0) {
      logger.warn(`批量获取开盘信息: ${batchResult.failed.length}只股票获取失败`);
    }

    logger.info(`批量获取开盘信息完成[${tradeDate}]: 成功${openingInfoMap.size}条`);
    return openingInfoMap;
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 导出单例
export const intradayTradeService = new IntradayTradeService();
