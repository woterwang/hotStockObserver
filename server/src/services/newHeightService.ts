/*
 * @Author: hp.com
 * @Date: 2026-06-22 21:47:05
 * @LastEditors: WRG
 * @LastEditTime: 2026-06-29 00:56:04
 * @😍: 😃😃
 */
import { groupService } from './groupService';
import { logger } from '../utils';
import { HundredDayHigh } from '../models';
import { getToday, formatDate, getTodayStr } from '../utils/dateUtils';
import axios from 'axios';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const thsUtils = require('../utils/thsUtils');

// 导入市场情绪服务
import { marketSentimentService } from './marketSentimentService';
import { marketMoodService } from './marketMoodService';
import { tradingCalendarService } from './tradingCalendarService';
import { TrendScorer } from './TrendScorerService';
import { klineCacheService, CachedKline, fetchTencentRealTimeQuotes } from './klineCacheService';
import { thsConceptHotRankService } from './thsConceptHotRankService';
import { top200VolumeParser, type Top200VolumeStockRow } from './top200VolumeParser';

export class NewHeightService {

  private getHexinV (): string {
    try {
      return thsUtils.update();
    } catch (error) {
      logger.warn('生成 Hexin-V 失败，使用默认值');
      return 'Ax8Ssngzh0M9kINf4Czhe-DDqnmphHMgjdx3GrFqu4gVdzBiuVQDdp2oB0_C';
    }
  }

  /**
   * 延迟函数
   */
  private delay (ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 随机延迟（8-12秒），模拟真人操作
   */
  private async randomDelay (): Promise<void> {
    const minDelay = 8000;
    const maxDelay = 12000;
    const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
    logger.debug(`模拟真人操作，等待 ${(delay / 1000).toFixed(1)} 秒...`);
    await this.delay(delay);
  }

  /**
   * 通用问财查询
   */
  private async queryWencai (question: string): Promise<any[]> {
    try {
      const hexinV = this.getHexinV();

      const data: Record<string, string | number> = {
        'query': question,
        'urp_sort_way': 'desc',
        'page': '1',
        'perpage': '100',
        'codelist': '',
        'indexnamelimit': '',
        'logid': 'be61097505c8efcc59284eff7969d029',
        'ret': 'json_all',
        'sessionid': 'dbdfebdcdbc8ed20f7d67c017125cf0c',
        'source': 'Ths_iwencai_Xuangu',
        'iwc_token': '',
        'urp_use_sort': '1',
        'user_id': 'Ths_iwencai_Xuangu_e6cj4nqeyrtoifkfwr4wrqr57qwf4j4c',
        'uuids[0]': '24087',
        'query_type': 'stock',
        'comp_id': '6933312',
        'business_cat': 'soniu',
        'uuid': '24087'
      };
      let config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: 'https://www.iwencai.com/gateway/urp/v7/landing/getDataList',
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'zh-CN,zh;q=0.9',
          'Connection': 'keep-alive',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Origin': 'https://www.iwencai.com',
          'Referer': `https://www.iwencai.com/screener/result?w=${encodeURIComponent(question)}&querytype=stock&sign=1782221429927`,
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-origin',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
          'hexin-v': 'A16qrqwWuLNsm-xXsyor-9OQr_-lHyGutO7WrQj4zl6dB_ChcK9yqYRzJufb',
          'sec-ch-ua': '"Google Chrome";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
          'Cookie': `other_uid=Ths_iwencai_Xuangu_e6cj4nqeyrtoifkfwr4wrqr57qwf4j4c; _clck=elr9o9%7C2%7Cg75%7C0%7C0; cid=00fe07961a4b9ab3a0eeb30249290bdc1782221489; _clsk=1tqj3sp1b2wx%7C1782221661119%7C6%7C1%7C; v=${hexinV}; ComputerID=d136bc6a1d3aca1eaa9f3efb043ff0501776084397; WafStatus=0; cid=d136bc6a1d3aca1eaa9f3efb043ff0501776084397`
        },
        data: data,
        timeout: 30000,
      };
      logger.info(`问财请求参数: ${JSON.stringify(data)}`);
      const response = await axios.request(config);

      // 问财接口响应结构可能变化，需要遍历 components 查找数据
      const components = response.data?.answer?.components || [];

      for (const comp of components) {
        if (comp?.data?.datas && Array.isArray(comp.data.datas) && comp.data.datas.length > 0) {
          logger.info(`问财返回 ${comp.data.datas.length} 条数据 (${comp.show_type})`);
          return comp.data.datas;
        }
      }
      logger.warn('问财未返回有效数据');
      return [];
    } catch (error) {
      logger.error(`问财API调用失败: ${(error as Error).message}`);
      return [];
    }
  }

  private async queryWencaiWithGetDataList (question: string, currentDateStr: string): Promise<any[]> {
    const hexinV = this.getHexinV();

    const data: Record<string, string | number> = {
      'query': question,
      'urp_sort_way': 'desc',
      'urp_sort_index': `涨跌幅:前复权[${currentDateStr}]`,
      'page': '1',
      'perpage': '100',
      'codelist': '',
      'indexnamelimit': '',
      'logid': 'be61097505c8efcc59284eff7969d029',
      'ret': 'json_all',
      'sessionid': 'dbdfebdcdbc8ed20f7d67c017125cf0c',
      'source': 'Ths_iwencai_Xuangu',
      'iwc_token': '',
      'urp_use_sort': '1',
      'user_id': 'Ths_iwencai_Xuangu_e6cj4nqeyrtoifkfwr4wrqr57qwf4j4c',
      'uuids[0]': '24087',
      'query_type': 'stock',
      'comp_id': '6933312',
      'business_cat': 'soniu',
      'uuid': '24087'
    };
    let config = {
      method: 'post',
      maxBodyLength: Infinity,
      url: 'https://www.iwencai.com/gateway/urp/v7/landing/getDataList',
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Connection': 'keep-alive',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'https://www.iwencai.com',
        'Referer': `https://www.iwencai.com/screener/result?w=${encodeURIComponent(question)}&querytype=stock&sign=1782221429927`,
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
        'hexin-v': 'A16qrqwWuLNsm-xXsyor-9OQr_-lHyGutO7WrQj4zl6dB_ChcK9yqYRzJufb',
        'sec-ch-ua': '"Google Chrome";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'Cookie': `other_uid=Ths_iwencai_Xuangu_e6cj4nqeyrtoifkfwr4wrqr57qwf4j4c; _clck=elr9o9%7C2%7Cg75%7C0%7C0; cid=00fe07961a4b9ab3a0eeb30249290bdc1782221489; _clsk=1tqj3sp1b2wx%7C1782221661119%7C6%7C1%7C; v=${hexinV}; ComputerID=d136bc6a1d3aca1eaa9f3efb043ff0501776084397; WafStatus=0; cid=d136bc6a1d3aca1eaa9f3efb043ff0501776084397`
      },
      data: data,
      timeout: 30000,
    };
    logger.info(`问财请求参数: ${JSON.stringify(data)}`);

    try {
      const response = await axios.request(config);

      // 问财接口响应结构可能变化，需要遍历 components 查找数据
      const components = response.data?.answer?.components || [];

      for (const comp of components) {
        if (comp?.data?.datas && Array.isArray(comp.data.datas) && comp.data.datas.length > 0) {
          logger.info(`问财返回 ${comp.data.datas.length} 条数据 (${comp.show_type})`);
          return comp.data.datas;
        }
      }
      logger.warn('问财未返回有效数据');
      return [];
    } catch (error) {
      logger.error(`问财API调用失败: ${(error as Error).message}`);
      return [];
    }
  }

  //查询每日成交量前200的股票
  private async queryTop200VolumeStocksPage (dateStr: string, page: number): Promise<Top200VolumeStockRow[]> {
    const logDate = dateStr || 'realtime';
    const url = `https://q.10jqka.com.cn/index/index/board/all/field/cje/order/desc/page/${page}/ajax/1/`;

    try {
      const response = await axios.get<string>(url, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'hexin-v': this.getHexinV(),
          'accept': 'text/html, */*; q=0.01',
          'referer': 'https://q.10jqka.com.cn/'
        },
        timeout: 30000,
      });

      const html = typeof response.data === 'string' ? response.data : '';
      if (!html) {
        logger.warn(`[成交额TOP200] ${logDate} 第${page}页返回空响应`);
        return [];
      }

      const rows = top200VolumeParser.parseTop200VolumeHtml(html);
      logger.info(`[成交额TOP200] ${logDate} 第${page}页解析完成，共 ${rows.length} 条`);
      return rows;
    } catch (error) {
      logger.error(`[成交额TOP200] ${logDate} 第${page}页查询失败: ${(error as Error).message}`);
      return [];
    }
  }

  private async queryTop200VolumeStocks (dateStr: string = '', targetCount: number = 200): Promise<Top200VolumeStockRow[]> {
    const logDate = dateStr || 'realtime';
    const maxRows = Math.max(1, targetCount);
    const pageSize = 20;
    const maxPages = Math.ceil(maxRows / pageSize);
    const rows: Top200VolumeStockRow[] = [];
    const seenCodes = new Set<string>();

    for (let page = 1; page <= maxPages && rows.length < maxRows; page++) {
      const pageRows = await this.queryTop200VolumeStocksPage(dateStr, page);

      if (pageRows.length === 0) {
        break;
      }

      for (const row of pageRows) {
        if (seenCodes.has(row.code)) {
          continue;
        }

        seenCodes.add(row.code);
        rows.push(row);

        if (rows.length >= maxRows) {
          break;
        }
      }

      if (pageRows.length < pageSize) {
        break;
      }
    }

    logger.info(`[成交额TOP200] ${logDate} 聚合完成，共 ${rows.length} 条`);
    return rows;
  }

  /**
   * 获取上证指数是否站上20日均线
   */
  private async checkIndexAboveMa20 (dateStr: string): Promise<boolean> {
    try {
      const question = `上证指数${dateStr}收盘价>${dateStr} 20日均线`;
      const result = await this.queryWencai(question);
      return result.length > 0;
    } catch (error) {
      logger.warn('获取上证指数MA20状态失败');
      return true; // 默认返回true，避免误伤
    }
  }

  /**
   * 获取涨停股票信息（包含首板和连板）
   * 合并原 getFirstBoardList 和 getContinuousBoardInfo，减少API调用
   * @returns { firstBoardSet: 首板股票集合, continuousBoardMap: 连板股票->连板数 }
   */
  private async getLimitUpBoardInfo (dateStr: string): Promise<{
    firstBoardSet: Set<string>;
    continuousBoardMap: Map<string, number>;
  }> {
    const firstBoardSet = new Set<string>();
    const continuousBoardMap = new Map<string, number>();

    try {
      // 一次查询获取所有涨停股及连板天数
      const question = `${dateStr}涨停，非ST，非北交所，${dateStr}连续涨停天数`;
      const result = await this.queryWencai(question);

      result.forEach((item: any) => {
        const code = String(item.code || item['股票代码'] || '').replace(/[^0-9]/g, '');
        if (code.length !== 6) return;

        // 尝试从字段中获取连板天数
        let boardCount = 1; // 默认1天（首板）
        for (const key in item) {
          if (key.includes('连续涨停') && key.includes('天')) {
            const val = parseFloat(item[key]);
            if (!isNaN(val) && val >= 1) {
              boardCount = Math.floor(val);
            }
          }
        }

        if (boardCount === 1) {
          // 首板
          firstBoardSet.add(code);
        } else {
          // 连板（2板及以上）
          continuousBoardMap.set(code, boardCount);
        }
      });

      logger.info(`[涨停检测] ${dateStr} 首板数量: ${firstBoardSet.size}, 连板数量: ${continuousBoardMap.size}`);
    } catch (error) {
      logger.warn(`获取涨停信息失败: ${(error as Error).message}`);
    }

    return { firstBoardSet, continuousBoardMap };
  }

  private async fetchFromWencai (dateStr: string): Promise<any[]> {
    // ========================================
    // 🚀 "强势资金突破"策略 - 优化版
    // ========================================
    // 
    // 【核心条件】（必须满足）
    // 1. 涨幅>7%：确保强势
    // 2. 成交额排名前200：大资金战场
    // 3. 上影线<5%：收盘相对强势（放宽到5%）
    //
    // 【趋势条件】
    // 4. 收盘价>10日均线：短期趋势向上
    //
    // 【基础过滤】
    // 5. 非ST/新股/北交所/退市
    //
    // 【额外返回字段】
    // 6. 量比、换手率、振幅、下影线、5日均量比 - 用于评分计算
    //
    // 注：其他条件（20日新高、量能放大、底部抬升等）
    //     在代码中通过评分体系处理，避免过滤掉太多股票
    // ========================================
    const newHeightDays = 188;
    const question = [
      // 20250623涨幅>8%,20250623收盘价>20250623前100交易日最高价，20250623上影线<4.5%
      // 核心条件（宽松版，确保有数据）
      // `${dateStr}涨幅>7%`,
      `${dateStr}涨幅>8%`,
      `${dateStr}收盘价>${dateStr}前${newHeightDays}交易日最高价`,
      // `${dateStr}上影线<4.5%`,
      // 额外请求的字段（用于评分计算）
      `${dateStr}量比`,
      `${dateStr}换手率`,
      `${dateStr}振幅`,
      `${dateStr}涨幅`,
      // `${dateStr}下影线`,
      // `${dateStr}成交量/前5交易日平均成交量`,
      // 附加条件
      `所属概念`,
      '流通市值',
      // 其它过滤
      `非ST`,
      `非新股`,
      `非北交所`,
      `非退市`,
    ].join('，');

    logger.info(`[问财查询] ${question}`);
    return this.queryWencaiWithGetDataList(question, dateStr);
  }

  async scanAndSave (dateStr?: string): Promise<number> {
    const targetDate = dateStr || formatDate(getToday(), 'YYYYMMDD');
    // 记录涨幅不满足条件的股票数量
    let unsatisfiedCount = 0;

    // this.fetchFromWencai(targetDate);return 0;

    // 🔒 检查目标日期是否为交易日，防止在非交易日存储错误数据
    if (!tradingCalendarService.isTradingDay(targetDate)) {
      logger.warn(`[HundredDayHigh] ${targetDate} 不是交易日，跳过扫描`);
      return 0;
    }
    logger.info(`开始扫描百日新高股票: ${targetDate}`);

    // ========================================
    // 🔥 进阶优化：获取市场环境数据
    // ========================================

    // 1. 获取市场情绪数据（优先从 marketMoodService 获取）
    let marketSentimentScore = 50;
    let marketLimitUpCount = 0;
    let marketAdvice = 'normal';

    try {
      // 优先从龙虎榜市场情绪缓存获取 strong 值
      const moodData = marketMoodService.getMoodData(targetDate);
      if (moodData) {
        marketSentimentScore = moodData.strong;
        marketLimitUpCount = moodData.ztjs || 0;  // 涨跌家数作为参考
        // 根据 strong 值生成建议（统一阈值标准）
        if (moodData.strong >= 70) {
          marketAdvice = 'aggressive';  // 情绪高涨
        } else if (moodData.strong >= 50) {
          marketAdvice = 'normal';      // 情绪正常
        } else if (moodData.strong >= 30) {
          marketAdvice = 'cautious';    // 情绪偏弱
        } else {
          marketAdvice = 'pause';       // 情绪极弱
        }
        logger.info(`[市场情绪] 从缓存获取: 评分=${marketSentimentScore}, 涨跌家数=${marketLimitUpCount}, 建议=${marketAdvice}`);
      } else {
        // 缓存未命中，降级使用原有的 marketSentimentService
        logger.info(`[市场情绪] 缓存未命中 ${targetDate}，使用 marketSentimentService`);
        let sentiment = await marketSentimentService.fetchAndCalculateSentiment(targetDate);
        if (sentiment) {
          marketSentimentScore = sentiment?.score ?? 50;
          marketLimitUpCount = sentiment?.limitUpCount ?? 0;
          marketAdvice = sentiment?.advice ?? 'normal';
          logger.info(`[市场情绪] 评分=${marketSentimentScore}, 涨停数=${marketLimitUpCount}, 建议=${marketAdvice}`);
        } else {
          logger.info(`[市场情绪] 无法获取 ${targetDate} 的数据，使用默认值`);
        }
      }
    } catch (error) {
      logger.warn(`获取市场情绪失败: ${(error as Error).message}`);
    }

    // 2. 检查上证指数是否站上20日均线
    const indexAboveMa20 = true;
    logger.info(`[大盘趋势] 上证指数${indexAboveMa20 ? '站上' : '跌破'}20日均线`);

    // 3. 获取涨停股信息（首板+连板，合并为一次API调用）
    // await this.randomDelay();
    const { firstBoardSet, continuousBoardMap } = await this.getLimitUpBoardInfo(targetDate);
    logger.info(`[涨停检测] 首板数量: ${firstBoardSet.size}, 连板数量: ${continuousBoardMap.size}`);

    // 获取选股数据
    await this.randomDelay();
    const rawData = await this.fetchFromWencai(targetDate);
    logger.info(`获取到 ${rawData.length} 条原始数据`);

    if (rawData.length === 0) {
      logger.warn(`[HundredDayHigh] 无数据，跳过保存`);
      return 0;
    }

    // 直接使用字符串日期 YYYYMMDD 格式
    let count = 0;

    for (const item of rawData) {
      try {
        const stockCode = item.code || item['股票代码'];
        const stockName = item['股票简称'] || item['名称'];
        const price = parseFloat(item['最新价'] || 0);

        let changePercent = 0;
        let volumeRatio = 0;
        let volume: number = 0;
        let turnover = 0;
        let turnoverRate = 0;
        let industry = item['所属行业'] || '';
        let concept = item['所属概念'] || '';

        // 新增字段
        let amplitude = 0;        // 振幅
        let upperShadow = 0;      // 上影线
        let lowerShadow = 0;      // 下影线
        let volumeRatioTo5Day = 0; // 成交量/5日均量
        let limitUpReason = '';   // 涨停原因
        let closePrice = 0;       // 收盘价
        let marketCapitalization = 0;// 流通市值
        let listingDays = 0;   // 上市交易天数

        // 动态查找字段
        for (const key in item) {
          if (key.includes(`最新价`)) {
            closePrice = parseFloat(item[key] || 0);
          }
          if (key.includes('股市值')) {
            marketCapitalization = parseFloat(item[key] || 0);
          }
          if (key.includes(`上市交易天数`)) {
            listingDays = parseInt(item[key] || 0);
          }
          if (key.includes(`涨跌幅:前复权[${targetDate}]`)) {
            changePercent = parseFloat(item[key] || 0);
            changePercent = Math.round(changePercent * 100) / 100; // 模拟小数点后两位
          } else if (key.includes('量比')) {
            volumeRatio = parseFloat(item[key] || 0);
          } else if (key.includes('成交额') && !key.includes('排名')) {
            turnover = parseFloat(item[key] || 0);
          } else if (key.includes('换手率')) {
            turnoverRate = parseFloat(item[key] || 0);
          } else if (key.includes('所属行业') && !industry) {
            industry = item[key];
          } else if (key.includes('所属概念') && !concept) {
            concept = item[key];
          } else if (key.includes('振幅')) {
            amplitude = parseFloat(item[key] || 0);
          } else if (key.includes('上影线')) {
            upperShadow = parseFloat(item[key] || 0);
          } else if (key.includes('下影线')) {
            lowerShadow = parseFloat(item[key] || 0);
          } else if (key.includes(`成交量[${targetDate}]`) && !key.includes('}区间日均成交量')) {
            // 当日成交量（用于计算5日均量比）
            volume = Number(item[key]) || 0;
            // logger.info(`[数据提取] ${stockName} 当日成交量: ${volume}`);
          }
          //else if (key.includes('涨停原因') || key.includes('异动原因')) {
          //   limitUpReason = item[key] || '';
          // }
        }
        // 只保留涨幅>7%的数据
        if (changePercent < 7) {
          // logger.info(`[涨幅] ${stockName} 的涨幅 ${changePercent}% 不满足 >7%，跳过保存`);
          unsatisfiedCount++;
          continue;
        }

        // 必要条件：量比 ≥ 1.5
        if (volumeRatio < 1.5) {
          logger.info(`[成交量放大] ${stockName} 的量比 ${volumeRatio} 小于 1.5，跳过保存`);
          // continue;  // 量能未放大，直接过滤掉
        }

        // 获取上一交易日日期，用于计算5日均量比
        const prevDate = tradingCalendarService.getPrevTradingDay(targetDate);
        logger.info(`[日期] ${stockName} 的上一交易日日期: ${prevDate}`);
        if (!prevDate) {
          logger.info(`[日期] ${stockName} 未找到${targetDate}的上一交易日，跳过保存`);
          continue;
        }

        // K线
        const KlineData = await klineCacheService.loadCacheForHistory(stockCode, prevDate, 20, false);
        // 计算5日均量比
        volumeRatioTo5Day = await this.getVolumeRatioTo5Day(KlineData, volume);

        // 必要条件：volumeRatioTo5Day ≥ 1.8
        if (volumeRatioTo5Day < 1.8) {
          logger.info(`[成交量放大] ${stockName} 的5日均量比 ${volumeRatioTo5Day} 小于 1.8，跳过保存`);
          // continue;  // 5日均量未放大，直接过滤掉
        }

        // ========================================
        // 🔥 判断是否涨停、首板、连板
        // ========================================
        const codeStr = String(stockCode).replace(/[^0-9]/g, '');
        const isCreGem = codeStr.startsWith('30') || codeStr.startsWith('68');
        const limitThreshold = isCreGem ? 19.5 : 9.5;
        const isLimitUp = changePercent >= limitThreshold;
        const isFirstBoard = firstBoardSet.has(codeStr);
        const continuousBoardCount = continuousBoardMap.get(codeStr) || (isFirstBoard ? 1 : 0);
        // ========================================
        // 🚀 策略评分逻辑（满分100分 + 额外加分）
        // ========================================

        // ---- 基础评分 (0-100分) ----
        let baseScore = 0;
        // 加分日志
        const addScoreLogs: string[] = [];
        // 量价因子总览  量价因子总分：40 分（占 S_base 的 40%）
        // 1.量比（8 分）≥ 2.5，2.0-2.5（7 分），1.8-2.0（6 分），1.5-1.8（5 分）

        if (volumeRatio >= 2.5) {
          baseScore += 8;
          addScoreLogs.push(`量比 ${volumeRatio} ≥ 2.5，+8分`);
        } else if (volumeRatio >= 2.0) {
          baseScore += 7;
          addScoreLogs.push(`量比 ${volumeRatio} ≥ 2.0，+7分`);
        } else if (volumeRatio >= 1.8) {
          baseScore += 6;
          addScoreLogs.push(`量比 ${volumeRatio} ≥ 1.8，+6分`);
        } else if (volumeRatio >= 1.5) {
          baseScore += 5;
          addScoreLogs.push(`量比 ${volumeRatio} ≥ 1.5，+5分`);
        }

        // 2.放量上涨（Vol > MA5Vol × 1.8）（12 分, >= 2.5 12分，>= 2.2 10分，>= 2.0 8分）
        if (volumeRatioTo5Day >= 2.5) {
          baseScore += 12;
          addScoreLogs.push(`放量上涨 ${volumeRatioTo5Day} ≥ 2.5，+12分`);
        } else if (volumeRatioTo5Day >= 2.2) {
          baseScore += 10;
          addScoreLogs.push(`放量上涨 ${volumeRatioTo5Day} ≥ 2.2，+10分`);
        } else if (volumeRatioTo5Day >= 2.0) {
          baseScore += 8;
          addScoreLogs.push(`放量上涨 ${volumeRatioTo5Day} ≥ 2.0，+8分`);
        }

        // 3.收盘价 > MA5 / MA10 / MA20（12 分）
        const ma5 = await TrendScorer.calcMA(KlineData, 5) ?? 0;
        const ma10 = await TrendScorer.calcMA(KlineData, 10) ?? 0;
        const ma20 = await TrendScorer.calcMA(KlineData, 20) ?? 0;
        // 条件 - 得分
        // Close > MA5 > MA10 > MA20（完全多头） - 12​
        // Close > MA5 & MA10 & MA20（允许 MA5<MA10）- 10​
        // Close > MA5 & MA10，但 ≤ MA20- 6​
        // Close ≤ MA5 / MA10 / MA20 任一条- 0​

        // 📌 实战建议：
        // A 股短线，Close > MA5/MA10/MA20 同时成立是强入选条件
        // 若你希望更严格，可改为：不满足三条同时 > → 0 分
        if (closePrice > ma5 && ma5 > ma10 && ma10 > ma20) {
          baseScore += 12;
          addScoreLogs.push(`收盘价 ${closePrice} > MA5 ${ma5} > MA10 ${ma10} > MA20 ${ma20}，+12分`);
        } else if (closePrice > ma5 && closePrice > ma10 && closePrice > ma20) {
          baseScore += 10;
          addScoreLogs.push(`收盘价 ${closePrice} > MA5 ${ma5} > MA10 ${ma10}，+10分`);
        } else if (closePrice > ma5 && closePrice > ma10 && closePrice < ma20) {
          baseScore += 6;
          addScoreLogs.push(`收盘价 ${closePrice} > MA5 ${ma5} > MA10 ${ma10}，但 ≤ MA20 ${ma20}，+6分`);
        } else {
          baseScore = 0;
          addScoreLogs.push(`收盘价 ${closePrice} 不满足 > MA5 ${ma5} / MA10 ${ma10} / MA20 ${ma20} 任一条件，0分`);
        }

        // 4. 无长上影线（8 分）
        // 上影线比例	得分
        // ≤ 1.5%	8
        // ≤ 3.0%	6
        // ≤ 4.5%	3
        // > 4.5%	0（长上影，抛压重）
        if (upperShadow <= 1.5) {
          baseScore += 8;
          addScoreLogs.push(`无长上影线 ${upperShadow} ≤ 1.5%，+8分`);
        } else if (upperShadow <= 3) {
          baseScore += 6;
          addScoreLogs.push(`无长上影线 ${upperShadow} ≤ 3.0%，+6分`);
        } else if (upperShadow <= 4.5) {
          baseScore += 3;
          addScoreLogs.push(`无长上影线 ${upperShadow} ≤ 4.5%，+3分`);
        } else {
          baseScore = 0;
        }

        // 场景	处理
        //   量价因子 ≥ 30	✅ 合格
        //   25–29	⚠️ 勉强（需其他因子补）
        //   < 25	❌ 直接淘汰（尤其均线/放量不达标）
        logger.info(`[评分] ${stockCode} 量价关系评分 ${baseScore}`);
        if (baseScore >= 30) {
          logger.info(`[评分] ${stockCode} 评分 ${baseScore} - ✅ 合格`);
          // ✅ 合格
        } else if (baseScore >= 25) {
          logger.info(`[评分] ${stockCode} 评分 ${baseScore} - ⚠️ 勉强`);
          // ⚠️ 勉强（需其他因子补）
        } else {
          logger.info(`[评分] ${stockCode} 评分 ${baseScore} - ❌ 淘汰`);
          // ❌ 直接淘汰（尤其均线/放量不达标）
          continue;
        }

        // #### 2. 趋势因子（权重 30%）
        const trendScorer = TrendScorer.calculate(KlineData);
        logger.info(`[评分] ${stockCode} 趋势评分 ${trendScorer.score}`);
        addScoreLogs.push(`趋势评分 ${trendScorer.score}`);
        baseScore += trendScorer.score;

        // #### 3. 热点因子（权重 30%）
        const hotScorer = await this.scoreSectorLink(stockCode, targetDate, concept);
        logger.info(`[评分] ${stockCode} 热点因子 ${hotScorer.score}`);
        addScoreLogs.push(`热点因子 ${hotScorer.score} (${hotScorer.reason})`);
        baseScore += hotScorer.score;

        // #### 4. 保留总分 > 70分的股票，作为最终入选名单
        if (baseScore < 70) {
          logger.info(`[评分] ${stockCode} 评分 ${baseScore} - ❌ 淘汰`);
          // continue;  // 基础分未达标，直接过滤掉
        }

        // ---- 市场环境加分 (-20 ~ +15分) ----
        let marketBonus = 0;

        // 涨停家数加分
        if (marketLimitUpCount >= 100) {
          marketBonus += 10;  // 涨停过百，市场情绪火爆
          addScoreLogs.push(`涨停家数 ${marketLimitUpCount} ≥ 100，+10分`);
        } else if (marketLimitUpCount >= 60) {
          marketBonus += 5;   // 情绪较好
          addScoreLogs.push(`涨停家数 ${marketLimitUpCount} ≥ 60，+5分`);
        } else if (marketLimitUpCount < 30) {
          marketBonus -= 10;  // 情绪冰点，需要谨慎
          addScoreLogs.push(`涨停家数 ${marketLimitUpCount} < 30，-10分`);
        }

        // 大盘趋势加分
        if (indexAboveMa20) {
          marketBonus += 5;   // 大盘趋势向上
          addScoreLogs.push(`大盘趋势向上，+5分`);
        } else {
          marketBonus -= 10;  // 大盘趋势向下，风险增加
          addScoreLogs.push(`大盘趋势向下，-10分`);
        }

        // ---- 首板/连板加分 (0 ~ +15分) ----
        let boardBonus = 0;

        if (isFirstBoard) {
          boardBonus += 5;   // 首板最安全，启动点
          addScoreLogs.push(`首板，+5分`);
        } else if (continuousBoardCount === 2) {
          boardBonus -= 10;   // 2连板说明资金认可
          addScoreLogs.push(`2连板说明资金认可，-10分`);
        } else if (continuousBoardCount >= 3) {
          boardBonus -= 15;    // 3连板及以上，追高风险增加
          addScoreLogs.push(`3连板及以上，-15分`);
        }

        // ---- 计算最终评分 ----
        const strategyScore = Math.max(0, Math.min(120, baseScore + marketBonus + boardBonus));

        // ---- 风险等级判定 ----
        let riskLevel: 'low' | 'medium' | 'high' = 'medium';
        if (strategyScore >= 85 && indexAboveMa20 && marketLimitUpCount >= 60) {
          riskLevel = 'low';
        } else if (strategyScore < 60 || !indexAboveMa20 || marketLimitUpCount < 30) {
          riskLevel = 'high';
        }
        // 打印加分日志
        logger.info(`[加分] ${stockCode} ${stockName} ${riskLevel} ${strategyScore} ${addScoreLogs.join(' | ')}`);
        await HundredDayHigh.findOneAndUpdate(
          { date: targetDate, stockCode },
          {
            date: targetDate,
            stockCode,
            stockName,
            price,
            changePercent,
            volumeRatio,
            turnover,
            turnoverRate,
            industry,
            concept,
            // K线形态
            amplitude,
            upperShadow,
            lowerShadow,
            volumeRatioTo5Day,
            aboveMa10: true,
            is20DayHigh: true,
            isBottomRising: true,
            // 首板/连板
            isLimitUp,
            isFirstBoard,
            continuousBoardCount,
            limitUpReason,
            // 市场环境
            marketSentimentScore,
            marketLimitUpCount,
            indexAboveMa20,
            marketAdvice,
            // 评分
            strategyScore,
            baseScore,
            marketBonus,
            boardBonus,
            riskLevel,
            marketCapitalization,
            listingDays,
            status: 'pending',
            addScoreLogs: addScoreLogs.join(';'),
            volume,
          },
          { upsert: true, new: true }
        );
        count++;
      } catch (err) {
        logger.error(`保存百日新高数据失败: ${(err as Error).message}`);
      }
    }
    try {
      // 打印不满足涨幅条件的股票数量
      if (unsatisfiedCount > 0) {
        logger.info(`[涨幅] ${unsatisfiedCount} 只股票涨幅不满足 >7%，已跳过保存`);
      }
      // 查询当天所有百日新高备选股票，按照评分倒序排列并添加到当天的分组中
      const allSignals = await HundredDayHigh.find({ date: targetDate }).sort({ strategyScore: -1, changePercent: -1 });
      logger.info(`[百日新高] 今日百日新高股票: ${allSignals.length} 只`);
      // 获取所有股票代码
      const stockCodes = allSignals.map(s => s.stockCode);
      if (stockCodes.length > 0 && targetDate == getTodayStr()) {
        logger.info(`[百日新高] 今日备选股票: ${stockCodes.join(', ')}`);
        // 创建备选股票分组
        const groupId = await groupService.createGroup(`${targetDate}-百日新高备选`);
        logger.info(`[百日新高] 备选股票分组ID: ${groupId}`);
        groupService.addStocksToGroup(groupId, stockCodes);
      }
    } catch (err) {
      logger.error(`[百日新高] 保存备选股票失败: ${(err as Error).message}`);
    }

    return count;
  }

  async getList (dateStr: string): Promise<any[]> {
    // 直接使用字符串日期查询
    return HundredDayHigh.find({ date: dateStr }).sort({ strategyScore: -1, changePercent: -1 });
  }

  // 计算成交量/5日均量比
  async getVolumeRatioTo5Day (KlineData: CachedKline[], currentVolume: number): Promise<number> {
    if (!KlineData || KlineData.length === 0) {
      logger.info(`[计算成交量/5日均量比] K线数据为空`);
      return 0;
    }
    if (KlineData.length < 5) {
      logger.info(`[计算成交量/5日均量比] K线数据不足5天`);
      return 0;
    }
    //取最近5天的成交量
    let recent5Days: string[] = []
    const recent5DaysVolume = KlineData.slice(-5).map(k => {
      recent5Days.push(k.date);
      return k.volume;
    });
    logger.info(`[计算成交量/5日均量比] 最近5天${recent5Days.join(',')}的成交量: ${recent5DaysVolume}，当前成交量: ${currentVolume}`);
    const avgVolume5Day = recent5DaysVolume.reduce((sum, v) => sum + v, 0) / recent5DaysVolume.length;
    logger.info(`[计算成交量/5日均量比] 5日均量: ${avgVolume5Day}`);
    return (currentVolume / avgVolume5Day);
  }


  /**
   * 板块联动评分 (满分30分)
   */
  async scoreSectorLink (stockCode: string, dateStr: string, currentConcepts: string): Promise<{ score: number; reason: string }> {
    let score = 0;
    let reasons: string[] = [];

    // 第一步：解析concept数据
    const concepts = currentConcepts.split(';');
    // logger.info(`[BuySignal] scoreSectorLink 获取 ${stockCode} 在 ${dateStr} 的 ${JSON.stringify(concepts)} 数据: ${concepts}`);

    // 第二步：获取前一天的热门概念排行数据
    const conceptData = thsConceptHotRankService.readFromCache(`${dateStr}_concept`)
    // logger.info(`[BuySignal] scoreSectorLink 获取 ${dateStr} 的数据： ${JSON.stringify(conceptData?.items)}`);
    // 取前三个概念
    const topConcepts: string[] = conceptData?.items.slice(0, 3).map((item: any) => item.name) || [];
    // logger.info(`[BuySignal] scoreSectorLink 获取 ${dateStr} 的 ${JSON.stringify(topConcepts)} 数据: ${topConcepts}`);

    // 第三步：判断concepts中是否有热门概念
    const matchedConcepts = concepts.filter((concept: string) => topConcepts.includes(concept));
    if (matchedConcepts.length > 0) {
      score += 10;
      reasons.push(`所属概念${matchedConcepts.join('、')}在前3名热门概念中，板块联动强`);
      if (matchedConcepts.length > 1) {
        score += 10;
        reasons.push(`所属多个概念${matchedConcepts.join('、')}在前3名热门概念中，板块联动更强`);
      }
      if (matchedConcepts.length > 2) {
        score += 10;
        reasons.push(`所属多个概念${matchedConcepts.join('、')}在前3名热门概念中，板块联动更强`);
      }
    }

    return { score: score, reason: reasons.join('，') };
  }

  /**
   * 获取高质量信号（评分>=70分）
   * 这些是策略认为最优质的突破标的
   */
  async getHighQualitySignals (dateStr: string): Promise<any[]> {
    return HundredDayHigh.find({
      date: dateStr,
      strategyScore: { $gte: 70 }  // 评分>=70分
    }).sort({ strategyScore: -1 });
  }

  /**
   * 获取统计数据（增强版）
   */
  async getStats (dateStr: string): Promise<{
    total: number;
    highQualityCount: number;
    lowRiskCount: number;
    firstBoardCount: number;
    avgScore: number;
    maxScore: number;
    minScore: number;
    riskDistribution: { low: number; medium: number; high: number };
    industryDistribution: { name: string; count: number }[];
    marketInfo: {
      sentiment: number;
      limitUpCount: number;
      indexAboveMa20: boolean;
      advice: string;
    };
  }> {
    const all = await HundredDayHigh.find({ date: dateStr });

    if (all.length === 0) {
      return {
        total: 0,
        highQualityCount: 0,
        lowRiskCount: 0,
        firstBoardCount: 0,
        avgScore: 0,
        maxScore: 0,
        minScore: 0,
        riskDistribution: { low: 0, medium: 0, high: 0 },
        industryDistribution: [],
        marketInfo: {
          sentiment: 0,
          limitUpCount: 0,
          indexAboveMa20: false,
          advice: 'unknown',
        },
      };
    }

    const scores = all.map(s => s.strategyScore || 0);
    const highQualityCount = all.filter(s => (s.strategyScore || 0) >= 70).length;
    const lowRiskCount = all.filter(s => s.riskLevel === 'low').length;
    const firstBoardCount = all.filter(s => s.isFirstBoard).length;
    const avgScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;
    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);

    // 风险等级分布
    const riskDistribution = {
      low: all.filter(s => s.riskLevel === 'low').length,
      medium: all.filter(s => s.riskLevel === 'medium').length,
      high: all.filter(s => s.riskLevel === 'high').length,
    };

    // 获取第一条记录（用于获取 indexAboveMa20 等字段）
    const first = all[0];

    // 获取市场信息（优先从 marketMoodService 获取，降级使用数据库记录）
    const moodData = marketMoodService.getMoodData(dateStr);
    let marketInfo;
    if (moodData) {
      // 从缓存获取（统一阈值标准）
      let advice = 'normal';
      if (moodData.strong >= 70) {
        advice = 'aggressive';  // 情绪高涨
      } else if (moodData.strong >= 50) {
        advice = 'normal';      // 情绪正常
      } else if (moodData.strong >= 30) {
        advice = 'cautious';    // 情绪偏弱
      } else {
        advice = 'pause';       // 情绪极弱
      }
      marketInfo = {
        sentiment: moodData.strong,
        limitUpCount: moodData.ztjs || 0,
        indexAboveMa20: first.indexAboveMa20 || false,  // 这个字段仍从数据库取
        advice,
      };
    } else {
      // 降级从数据库记录获取
      marketInfo = {
        sentiment: first.marketSentimentScore || 0,
        limitUpCount: first.marketLimitUpCount || 0,
        indexAboveMa20: first.indexAboveMa20 || false,
        advice: first.marketAdvice || 'normal',
      };
    }

    // 按行业分组统计
    const industryMap = new Map<string, number>();
    all.forEach(s => {
      const industry = s.industry || '未知';
      industryMap.set(industry, (industryMap.get(industry) || 0) + 1);
    });

    const industryDistribution = Array.from(industryMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      total: all.length,
      highQualityCount,
      lowRiskCount,
      firstBoardCount,
      avgScore: Math.round(avgScore * 10) / 10,
      maxScore,
      minScore,
      riskDistribution,
      industryDistribution,
      marketInfo,
    };
  }

  /**
   * 获取首板股票列表
   */
  async getFirstBoardStocks (dateStr: string): Promise<any[]> {
    return HundredDayHigh.find({
      date: dateStr,
      isFirstBoard: true
    }).sort({ strategyScore: -1 });
  }

  /**
   * 获取低风险股票列表
   */
  async getLowRiskStocks (dateStr: string): Promise<any[]> {
    return HundredDayHigh.find({
      date: dateStr,
      riskLevel: 'low'
    }).sort({ strategyScore: -1 });
  }

  async getHistory (days: number = 30): Promise<any[]> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const result = await HundredDayHigh.aggregate([
      {
        $match: {
          date: { $gte: formatDate(startDate, 'YYYYMMDD'), $lte: formatDate(endDate, 'YYYYMMDD') }
        }
      },
      {
        $group: {
          _id: { $substr: ["$date", 0, 8] },  // 从字符串类型的date字段提取年月日部分
          count: { $sum: 1 },
          stocks: { $push: "$$ROOT" }
        }
      },
      { $sort: { _id: -1 } }
    ]);

    return result.map(item => ({
      date: item._id,
      count: item.count,
      successCount: 0,
      avgProfit: 0,
      stocks: item.stocks
    }));
  }

  async getAvailableDates (): Promise<string[]> {
    const result = await HundredDayHigh.distinct('date') as string[];
    return result
      .map((d: string) => d.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'))
      .sort((a, b) => b.localeCompare(a));
  }

  async clearAll (): Promise<void> {
    await HundredDayHigh.deleteMany({});
  }
}

export const hundredDayHighService = new NewHeightService();
export const newHeightService = hundredDayHighService;
