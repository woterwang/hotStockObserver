import axios from 'axios';
import { logger } from '../utils';
import { HotStock, StockNews } from '../models';
import { formatDate, getToday, getDaysAgo } from '../utils/dateUtils';
import iconv from 'iconv-lite';

// 同花顺热搜API配置
const THS_API_BASE = 'https://eq.10jqka.com.cn';
const HOT_STOCK_API = `${THS_API_BASE}/open/api/hot_list/v1/hot_stock/a/day/data.txt`;

// 腾讯股票行情API
const TENCENT_STOCK_API = 'https://qt.gtimg.cn/q=';

// 东方财富历史K线API
const EASTMONEY_KLINE_API = 'https://push2his.eastmoney.com/api/qt/stock/kline/get';

// 东方财富股票新闻API
const EASTMONEY_NEWS_API = 'https://search-api-web.eastmoney.com/search/jsonp';

// 请求配置
const axiosInstance = axios.create({
  timeout: parseInt(process.env.REQUEST_TIMEOUT || '10000'),
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Referer': 'https://eq.10jqka.com.cn/',
  },
});

// 股票行情数据接口
interface StockQuote {
  stockCode: string;
  stockName: string;
  currentPrice: number;
  yesterdayClose: number;
  changePercent: number;
  changeAmount: number;
  volume: number;
  turnover: number; // 成交额（元）
}

// 历史K线数据接口
export interface HistoryKline {
  date: string;           // 日期 YYYY-MM-DD
  open: number;           // 开盘价
  close: number;          // 收盘价
  high: number;           // 最高价
  low: number;            // 最低价
  volume: number;         // 成交量（手）
  turnover: number;       // 成交额（元）
  amplitude: number;      // 振幅（%）
  changePercent: number;  // 涨跌幅（%）
  changeAmount: number;   // 涨跌额
  turnoverRate: number;   // 换手率（%）
}

interface THSHotStockItem {
  code: string;
  name: string;
  order: number;
  hot_rank_chg?: number;
  rise_and_fall?: number;
  rate?: number;
  hot?: number;
  concept?: string;
  reason?: string;
  analyse?: string;  // 同花顺AI分析的上涨原因
  tag?: {
    continuous_firing_days?: number;
    concept_tag?: string[];  // 概念标签
    popularity_tag?: string; // 人气标签
    [key: string]: any;
  };
}

interface THSHotStockResponse {
  status_code: number;
  status_msg: string;
  data: {
    stock_list: THSHotStockItem[];
    update_time?: string;
  };
}

/**
 * 数据抓取服务
 */
export class DataFetchService {
  private retryTimes: number;

  constructor() {
    this.retryTimes = parseInt(process.env.REQUEST_RETRY_TIMES || '3');
  }

  /**
   * 根据股票代码判断市场（上海还是深圳）
   */
  private getMarketPrefix(stockCode: string): string {
    // 上海: 6开头
    // 深圳: 0、3开头
    // 科创板: 688开头（上海）
    // 创业板: 300开头（深圳）
    // 北交所: 8、4开头（暂不支持腾讯API）
    if (stockCode.startsWith('6') || stockCode.startsWith('688')) {
      return 'sh';
    } else if (stockCode.startsWith('0') || stockCode.startsWith('3')) {
      return 'sz';
    } else if (stockCode.startsWith('8') || stockCode.startsWith('4')) {
      return 'bj'; // 北交所，腾讯API可能不支持
    }
    return 'sz'; // 默认深圳
  }

  /**
   * 批量获取股票行情数据（使用腾讯API）
   */
  async fetchStockQuotes(stockCodes: string[]): Promise<Map<string, StockQuote>> {
    const quotes = new Map<string, StockQuote>();
    
    // 每次最多请求50只股票
    const batchSize = 50;
    
    for (let i = 0; i < stockCodes.length; i += batchSize) {
      const batch = stockCodes.slice(i, i + batchSize);
      const symbols = batch.map(code => `${this.getMarketPrefix(code)}${code}`).join(',');
      
      try {
        const response = await axios.get(`${TENCENT_STOCK_API}${symbols}`, {
          responseType: 'arraybuffer',
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        });
        
        // 腾讯API返回GBK编码，需要转换
        const text = iconv.decode(Buffer.from(response.data), 'GBK');
        
        // 解析返回数据
        const lines = text.split(';').filter(line => line.trim());
        
        for (const line of lines) {
          try {
            // 格式: v_sz000547="51~航天发展~000547~19.62~18.70~..."
            const match = line.match(/v_(\w+)="(.+)"/);
            if (!match) continue;
            
            const data = match[2].split('~');
            if (data.length < 40) continue;
            
            const stockCode = data[2];
            const currentPrice = parseFloat(data[3]) || 0;
            const yesterdayClose = parseFloat(data[4]) || 0;
            const volume = parseInt(data[6]) || 0;
            
            // 成交额在索引37，单位是万元，需要转换为元
            const turnoverWan = parseFloat(data[37]) || 0;
            const turnover = turnoverWan * 10000;
            
            // 计算涨跌幅和涨跌额
            const changeAmount = yesterdayClose > 0 ? currentPrice - yesterdayClose : 0;
            const changePercent = yesterdayClose > 0 ? (changeAmount / yesterdayClose) * 100 : 0;
            
            quotes.set(stockCode, {
              stockCode,
              stockName: data[1],
              currentPrice,
              yesterdayClose,
              changePercent: Math.round(changePercent * 100) / 100, // 保留两位小数
              changeAmount: Math.round(changeAmount * 100) / 100,
              volume,
              turnover,
            });
          } catch (e) {
            // 解析单条数据失败，继续处理其他
          }
        }
        
        // 批次间稍微延迟，避免请求过快
        if (i + batchSize < stockCodes.length) {
          await this.delay(200);
        }
      } catch (error) {
        logger.warn(`获取股票行情失败: ${(error as Error).message}`);
      }
    }
    
    logger.info(`成功获取 ${quotes.size} 只股票的行情数据`);
    return quotes;
  }

  /**
   * 获取热搜股票数据
   */
  async fetchHotStocks(): Promise<THSHotStockItem[]> {
    let lastError: Error | null = null;

    for (let i = 0; i < this.retryTimes; i++) {
      try {
        logger.info(`正在获取热搜股票数据，尝试次数: ${i + 1}`);
        
        const response = await axiosInstance.get<THSHotStockResponse>(HOT_STOCK_API);
        
        if (response.data.status_code === 0 && response.data.data?.stock_list) {
          logger.info(`成功获取热搜股票数据，共 ${response.data.data.stock_list.length} 条`);
          return response.data.data.stock_list;
        } else {
          throw new Error(`API返回错误: ${response.data.status_msg}`);
        }
      } catch (error) {
        lastError = error as Error;
        logger.warn(`获取热搜股票数据失败，尝试次数: ${i + 1}，错误: ${lastError.message}`);
        
        if (i < this.retryTimes - 1) {
          // 等待后重试
          await this.delay(1000 * (i + 1));
        }
      }
    }

    throw lastError || new Error('获取热搜股票数据失败');
  }

  /**
   * 保存热搜股票数据到数据库
   */
  async saveHotStocks(stocks: THSHotStockItem[]): Promise<number> {
    const today = getToday();
    let savedCount = 0;

    // 先批量获取所有股票的行情数据
    const stockCodes = stocks.map(s => s.code);
    const quotes = await this.fetchStockQuotes(stockCodes);

    for (const stock of stocks) {
      try {
        // 计算连续上榜天数
        const consecutiveDays = await this.calculateConsecutiveDays(stock.code);

        // 获取该股票的行情数据
        const quote = quotes.get(stock.code);

        // 提取上涨原因（优先级：analyse > reason > concept_tag）
        let riseReason = '';
        if (stock.analyse) {
          // 同花顺AI分析，提取第一段作为摘要（通常很长，截取前100个字符）
          const firstParagraph = stock.analyse.split('\n')[0];
          riseReason = firstParagraph.length > 100 
            ? firstParagraph.substring(0, 100) + '...' 
            : firstParagraph;
        } else if (stock.reason) {
          riseReason = stock.reason;
        } else if (stock.tag?.concept_tag && stock.tag.concept_tag.length > 0) {
          // 使用概念标签作为备用
          riseReason = stock.tag.concept_tag.slice(0, 3).join('、');
        }

        // 提取概念板块
        let concepts: string[] = [];
        if (stock.concept) {
          concepts = stock.concept.split(',').filter(c => c.trim());
        } else if (stock.tag?.concept_tag) {
          concepts = stock.tag.concept_tag;
        }

        // 提取所属板块（取第一个概念标签作为主板块）
        const sector = concepts.length > 0 ? concepts[0] : '';

        const hotStockData = {
          date: today,
          stockCode: stock.code,
          stockName: stock.name,
          currentPrice: quote?.currentPrice || 0,
          changePercent: quote?.changePercent || 0,
          changeAmount: quote?.changeAmount || 0,
          volume: quote?.volume || 0,
          turnover: quote?.turnover || 0,
          rank: stock.order,
          consecutiveDays: stock.tag?.continuous_firing_days || consecutiveDays,
          hotScore: stock.hot || parseInt(stock.rate as any) || 0,
          sector: sector,
          sectorCode: '',
          riseReason: riseReason,
          concept: concepts,
        };

        // 使用upsert更新或插入
        await HotStock.findOneAndUpdate(
          { date: today, stockCode: stock.code },
          hotStockData,
          { upsert: true, new: true }
        );

        savedCount++;
      } catch (error) {
        logger.error(`保存股票 ${stock.code} 数据失败: ${(error as Error).message}`);
      }
    }

    logger.info(`成功保存 ${savedCount} 条热搜股票数据`);
    return savedCount;
  }

  /**
   * 计算股票连续上榜天数
   */
  private async calculateConsecutiveDays(stockCode: string): Promise<number> {
    const today = getToday();
    let consecutiveDays = 1;
    let checkDate = getDaysAgo(1);

    while (true) {
      const record = await HotStock.findOne({
        stockCode,
        date: {
          $gte: checkDate,
          $lt: new Date(checkDate.getTime() + 24 * 60 * 60 * 1000),
        },
      });

      if (record) {
        consecutiveDays++;
        checkDate = new Date(checkDate.getTime() - 24 * 60 * 60 * 1000);
      } else {
        break;
      }

      // 最多检查30天
      if (consecutiveDays >= 30) break;
    }

    return consecutiveDays;
  }

  /**
   * 获取股票详细信息（扩展功能）
   */
  async fetchStockDetail(stockCode: string): Promise<any> {
    try {
      // 这里可以调用其他API获取详细信息
      // 例如：分时数据、K线数据等
      logger.info(`获取股票 ${stockCode} 详细信息`);
      
      // 返回模拟数据，实际使用时需要对接真实API
      return {
        stockCode,
        stockName: '',
        currentPrice: 0,
        changePercent: 0,
      };
    } catch (error) {
      logger.error(`获取股票 ${stockCode} 详细信息失败: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * 获取大盘指数数据
   */
  async fetchMarketIndices(): Promise<any[]> {
    // 主要指数代码
    const indices = [
      { code: 'sh000001', name: '上证指数' },
      { code: 'sz399001', name: '深证成指' },
      { code: 'sz399006', name: '创业板指' },
      { code: 'sz399005', name: '中小100' },
    ];

    try {
      const symbols = indices.map(idx => idx.code).join(',');
      const response = await axios.get(`${TENCENT_STOCK_API}${symbols}`, {
        responseType: 'arraybuffer',
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      const text = iconv.decode(Buffer.from(response.data), 'GBK');
      const lines = text.split(';').filter(line => line.trim());
      
      const result: any[] = [];
      
      for (const line of lines) {
        try {
          const match = line.match(/v_(\w+)="(.+)"/);
          if (!match) continue;
          
          const data = match[2].split('~');
          if (data.length < 40) continue;
          
          const currentPoint = parseFloat(data[3]) || 0;
          const yesterdayClose = parseFloat(data[4]) || 0;
          const changePoint = yesterdayClose > 0 ? currentPoint - yesterdayClose : 0;
          const changePercent = yesterdayClose > 0 ? (changePoint / yesterdayClose) * 100 : 0;
          
          // 成交额（亿元）
          const turnoverWan = parseFloat(data[37]) || 0;
          const turnoverYi = turnoverWan / 10000;
          
          result.push({
            indexCode: data[2],
            indexName: data[1],
            currentPoint: Math.round(currentPoint * 100) / 100,
            changePercent: Math.round(changePercent * 100) / 100,
            changePoint: Math.round(changePoint * 100) / 100,
            volume: parseInt(data[6]) || 0,
            turnover: Math.round(turnoverYi * 100) / 100, // 亿元
          });
        } catch (e) {
          // 解析失败，继续处理其他
        }
      }
      
      logger.info(`成功获取 ${result.length} 个指数数据`);
      return result;
    } catch (error) {
      logger.error(`获取大盘指数失败: ${(error as Error).message}`);
      // 返回空数据结构
      return indices.map(idx => ({
        indexCode: idx.code.slice(2),
        indexName: idx.name,
        currentPoint: 0,
        changePercent: 0,
        changePoint: 0,
        volume: 0,
        turnover: 0,
      }));
    }
  }

  /**
   * 获取热门板块数据（使用东方财富API）
   */
  async fetchHotSectors(limit: number = 10): Promise<any[]> {
    try {
      // 东方财富行业板块API，按涨幅降序排列
      const url = `https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=${limit}&fs=m:90+t:2&fields=f2,f3,f4,f12,f14&fid=f3&po=1`;
      
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://quote.eastmoney.com/',
        },
      });

      if (response.data?.rc === 0 && response.data?.data?.diff) {
        const diff = response.data.data.diff;
        const sectors: any[] = [];

        // diff 是一个对象，key 是索引
        for (const key of Object.keys(diff)) {
          const item = diff[key];
          if (item) {
            // f2: 最新价（需要除以100）, f3: 涨跌幅（需要除以100）, f4: 涨跌额, f12: 代码, f14: 名称
            sectors.push({
              sectorCode: item.f12 || '',
              sectorName: (item.f14 || '').trim(),
              changePercent: item.f3 ? item.f3 / 100 : 0, // 转换为百分比
              changeAmount: item.f4 ? item.f4 / 100 : 0,
              leadingStock: '', // API 不提供领涨股
              stockCount: 0,
            });
          }
        }

        logger.info(`成功获取 ${sectors.length} 个热门板块`);
        return sectors;
      }

      return [];
    } catch (error) {
      logger.error(`获取热门板块失败: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * 根据股票代码获取东方财富市场ID
   * 深圳=0，上海=1
   */
  private getEastMoneyMarketId(stockCode: string): number {
    if (stockCode.startsWith('6')) {
      return 1; // 上海
    }
    return 0; // 深圳（包括创业板300）
  }

  /**
   * 获取单只股票的历史K线数据（使用东方财富API）
   * @param stockCode 股票代码，如 000592
   * @param startDate 开始日期，格式 YYYYMMDD
   * @param endDate 结束日期，格式 YYYYMMDD
   */
  async fetchHistoryKline(
    stockCode: string,
    startDate: string,
    endDate: string
  ): Promise<HistoryKline[]> {
    const marketId = this.getEastMoneyMarketId(stockCode);
    const secid = `${marketId}.${stockCode}`;

    // 重试机制
    for (let retry = 0; retry < 3; retry++) {
      try {
        const response = await axios.get(EASTMONEY_KLINE_API, {
          params: {
            secid,
            fields1: 'f1,f2,f3,f4,f5,f6',
            fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61',
            klt: 101,     // 日K线
            fqt: 1,       // 前复权
            beg: startDate,
            end: endDate,
            lmt: 1000,
          },
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://quote.eastmoney.com/',
          },
          timeout: 15000,
        });

        if (response.data?.rc !== 0 || !response.data?.data?.klines) {
          return [];
        }

        const klines: HistoryKline[] = response.data.data.klines.map((line: string) => {
          const parts = line.split(',');
          return {
            date: parts[0],
            open: parseFloat(parts[1]) || 0,
            close: parseFloat(parts[2]) || 0,
            high: parseFloat(parts[3]) || 0,
            low: parseFloat(parts[4]) || 0,
            volume: parseInt(parts[5]) || 0,
            turnover: parseFloat(parts[6]) || 0,
            amplitude: parseFloat(parts[7]) || 0,
            changePercent: parseFloat(parts[8]) || 0,
            changeAmount: parseFloat(parts[9]) || 0,
            turnoverRate: parseFloat(parts[10]) || 0,
          };
        });

        return klines;
      } catch (error) {
        const errMsg = (error as Error).message;
        if (retry < 2 && (errMsg.includes('socket hang up') || errMsg.includes('ECONNRESET') || errMsg.includes('timeout'))) {
          // 网络错误，等待后重试
          await this.delay(500 * (retry + 1));
          continue;
        }
        logger.warn(`获取 ${stockCode} 历史K线失败: ${errMsg}`);
        return [];
      }
    }
    return [];
  }

  /**
   * 批量获取多只股票指定日期的历史行情
   * @param stockCodes 股票代码数组
   * @param dateStr 日期，格式 YYYYMMDD
   * @returns Map<stockCode, HistoryKline>
   */
  async fetchHistoryQuotesByDate(
    stockCodes: string[],
    dateStr: string
  ): Promise<Map<string, HistoryKline>> {
    const quotes = new Map<string, HistoryKline>();
    
    // 逐个获取（东方财富API不支持批量查询）
    for (let i = 0; i < stockCodes.length; i++) {
      const code = stockCodes[i];
      
      try {
        const klines = await this.fetchHistoryKline(code, dateStr, dateStr);
        if (klines.length > 0) {
          quotes.set(code, klines[0]);
        }
      } catch (error) {
        // 单只失败不影响其他
      }
      
      // 每只股票后延迟200ms，避免请求过快被限流
      if (i < stockCodes.length - 1) {
        await this.delay(200);
      }
    }
    
    logger.info(`成功获取 ${quotes.size}/${stockCodes.length} 只股票在 ${dateStr} 的历史行情`);
    return quotes;
  }

  /**
   * 获取股票相关新闻（使用东方财富搜索API）
   * @param stockCode 股票代码
   * @param stockName 股票名称
   * @param limit 返回条数，默认5条
   */
  async fetchStockNews(
    stockCode: string,
    stockName: string,
    limit: number = 5
  ): Promise<any[]> {
    try {
      // 使用股票名称搜索新闻
      const searchKey = stockName || stockCode;
      const timestamp = Date.now();
      
      const url = `${EASTMONEY_NEWS_API}?cb=jQuery&param={"uid":"","keyword":"${encodeURIComponent(searchKey)}","type":["cmsArticleWebOld"],"client":"web","clientType":"web","clientVersion":"curr","param":{"cmsArticleWebOld":{"searchScope":"default","sort":"default","pageIndex":1,"pageSize":${limit},"preTag":"<em>","postTag":"</em>"}}}&_=${timestamp}`;
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://so.eastmoney.com/',
        },
        timeout: 10000,
      });

      // 解析JSONP响应
      const jsonpData = response.data;
      const jsonMatch = jsonpData.match(/jQuery\((.*)\)/s);
      if (!jsonMatch) {
        return [];
      }

      const data = JSON.parse(jsonMatch[1]);
      
      if (!data?.result?.cmsArticleWebOld?.list) {
        return [];
      }

      const newsList = data.result.cmsArticleWebOld.list;
      
      const news = newsList.map((item: any) => ({
        stockCode,
        title: (item.title || '').replace(/<\/?em>/g, ''), // 移除高亮标签
        summary: (item.content || '').replace(/<\/?em>/g, '').substring(0, 200),
        source: item.mediaName || '东方财富',
        url: item.url || '',
        publishTime: new Date(item.date || Date.now()),
        sentiment: 'neutral',
      }));

      return news;
    } catch (error) {
      logger.warn(`获取 ${stockCode} 新闻失败: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * 获取并保存股票新闻到数据库
   * @param stockCode 股票代码
   * @param stockName 股票名称
   * @param limit 获取条数
   */
  async fetchAndSaveStockNews(
    stockCode: string,
    stockName: string,
    limit: number = 5
  ): Promise<number> {
    const newsList = await this.fetchStockNews(stockCode, stockName, limit);
    
    let savedCount = 0;
    for (const news of newsList) {
      try {
        // 使用 upsert 避免重复
        await StockNews.findOneAndUpdate(
          { stockCode: news.stockCode, title: news.title },
          news,
          { upsert: true, new: true }
        );
        savedCount++;
      } catch (error) {
        // 忽略重复错误
      }
    }
    
    if (savedCount > 0) {
      logger.info(`保存 ${stockCode} 的 ${savedCount} 条新闻`);
    }
    return savedCount;
  }

  /**
   * 延时函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const dataFetchService = new DataFetchService();
