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

// 同花顺快讯新闻API
const THS_NEWS_API = 'https://news.10jqka.com.cn/app/flash/flashnews/v1/list';

// 同花顺个股新闻API
const THS_STOCK_NEWS_API = 'https://basic.10jqka.com.cn/api/stockph/news';

// 新浪财经7x24小时滚动新闻API
const SINA_7X24_NEWS_API = 'https://zhibo.sina.com.cn/api/zhibo/feed';

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
   * 从新浪财经7x24小时获取与股票相关的新闻
   * @param stockCode 股票代码
   * @param stockName 股票名称
   * @param limit 返回条数
   */
  async fetchStockNewsFromSina(
    stockCode: string,
    stockName: string,
    limit: number = 10
  ): Promise<any[]> {
    try {
      // 将股票代码转换为新浪格式
      const prefix = this.getMarketPrefix(stockCode);
      const sinaSymbol = `${prefix}${stockCode}`.toLowerCase();

      // 获取多页新闻以增加匹配概率
      const allNews: any[] = [];
      const pagesToFetch = 3; // 获取3页

      for (let page = 1; page <= pagesToFetch; page++) {
        try {
          // 新浪7x24小时滚动新闻API
          const response = await axios.get(SINA_7X24_NEWS_API, {
            params: {
              callback: '', // 不需要callback，直接返回JSON
              page,
              page_size: 50, // 每页50条
              zhibo_id: 152, // 财经频道
              tag_id: 0,
              type: 0,
            },
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Referer': 'https://finance.sina.com.cn/7x24/',
              'Accept': 'application/json, text/javascript, */*',
            },
            timeout: 10000,
          });

          let data = response.data;
          // 处理JSONP响应
          if (typeof data === 'string') {
            const match = data.match(/try\{cb\((.*)\);\}catch\(e\)\{\}/s);
            if (match) {
              data = JSON.parse(match[1]);
            }
          }

          if (data?.result?.data?.feed?.list) {
            allNews.push(...data.result.data.feed.list);
          }
        } catch (e) {
          // 单页获取失败继续下一页
        }
      }

      if (allNews.length === 0) {
        logger.warn(`新浪7x24 API返回数据为空`);
        return [];
      }

      logger.info(`新浪7x24获取到 ${allNews.length} 条新闻，正在筛选与 ${stockCode}(${stockName}) 相关的新闻...`);
      
      // 筛选与当前股票相关的新闻
      const relatedNews = allNews.filter((item: any) => {
        // 方式1：通过stocks字段匹配
        if (item.ext) {
          try {
            const ext = typeof item.ext === 'string' ? JSON.parse(item.ext) : item.ext;
            if (ext.stocks && Array.isArray(ext.stocks)) {
              // 检查是否有匹配的股票代码
              const hasMatch = ext.stocks.some((s: any) => {
                if (s.symbol) {
                  const symbolLower = s.symbol.toLowerCase();
                  return symbolLower.includes(stockCode) || symbolLower === sinaSymbol;
                }
                return false;
              });
              if (hasMatch) return true;
            }
          } catch (e) {
            // ext解析失败，继续用文本匹配
          }
        }
        
        // 方式2：通过新闻内容匹配股票名称
        const content = item.rich_text || '';
        if (stockName && stockName.length >= 2) {
          // 去除ST前缀做匹配
          const cleanName = stockName.replace(/^(ST|\*ST|S\*ST|N)/, '');
          if (content.includes(stockName) || (cleanName.length >= 2 && content.includes(cleanName))) {
            return true;
          }
        }
        
        return false;
      });

      // 转换为统一格式
      const news = relatedNews.slice(0, limit).map((item: any) => {
        let docurl = '';
        try {
          const ext = typeof item.ext === 'string' ? JSON.parse(item.ext) : item.ext;
          docurl = ext?.docurl || item.docurl || '';
        } catch (e) {
          docurl = item.docurl || '';
        }

        return {
          stockCode,
          title: (item.rich_text || '').substring(0, 100),
          summary: (item.rich_text || '').substring(0, 300),
          source: '新浪财经',
          url: docurl,
          publishTime: new Date(item.create_time || Date.now()),
          sentiment: 'neutral',
        };
      });

      logger.debug(`从新浪7x24获取 ${stockCode}(${stockName}) 新闻: ${news.length}条`);
      return news;
    } catch (error) {
      logger.warn(`从新浪7x24获取 ${stockCode} 新闻失败: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * 从同花顺快讯中获取与股票相关的新闻
   * @param stockCode 股票代码
   * @param limit 返回条数
   */
  async fetchStockNewsFromTHS(
    stockCode: string,
    limit: number = 5
  ): Promise<any[]> {
    try {
      // 同花顺快讯API，获取最新的异动新闻
      const response = await axios.get(THS_NEWS_API, {
        params: {
          seq: 0,
          tagId: 21111,  // 异动标签
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://news.10jqka.com.cn/',
        },
        timeout: 10000,
      });

      if (response.data?.status_code !== 0 || !response.data?.data?.list) {
        return [];
      }

      // 筛选出与当前股票相关的新闻
      const allNews = response.data.data.list;
      const relatedNews = allNews.filter((item: any) => {
        if (!item.stocks || !Array.isArray(item.stocks)) return false;
        return item.stocks.some((s: any) => s.stockCode === stockCode);
      });

      // 取前limit条
      const news = relatedNews.slice(0, limit).map((item: any) => ({
        stockCode,
        title: item.title || '',
        summary: item.summary || '',
        source: '同花顺',
        url: item.url || item.shareUrl || '',
        publishTime: new Date(item.createTime * 1000),
        sentiment: 'neutral',
      }));

      return news;
    } catch (error) {
      logger.warn(`从同花顺获取 ${stockCode} 新闻失败: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * 从雪球获取股票相关新闻
   * @param stockCode 股票代码  
   * @param limit 返回条数
   */
  async fetchStockNewsFromXueqiu(
    stockCode: string,
    limit: number = 5
  ): Promise<any[]> {
    try {
      // 根据股票代码确定市场前缀
      const prefix = this.getMarketPrefix(stockCode).toUpperCase();
      const symbol = `${prefix}${stockCode}`;
      
      // 雪球个股新闻API
      const response = await axios.get('https://stock.xueqiu.com/v5/stock/news.json', {
        params: {
          symbol: symbol,
          page: 1,
          count: limit,
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': `https://xueqiu.com/S/${symbol}`,
          'Cookie': 'xq_a_token=your_token;', // 可能需要cookie
        },
        timeout: 10000,
      });

      if (!response.data?.data?.list) {
        return [];
      }

      const news = response.data.data.list.slice(0, limit).map((item: any) => ({
        stockCode,
        title: item.title || item.text?.substring(0, 50) || '',
        summary: (item.text || '').substring(0, 200),
        source: '雪球',
        url: `https://xueqiu.com${item.target || ''}`,
        publishTime: new Date(item.created_at || Date.now()),
        sentiment: 'neutral',
      }));

      return news;
    } catch (error) {
      // 雪球可能需要登录，失败时静默处理
      return [];
    }
  }

  /**
   * 获取股票相关新闻（整合多个数据源）
   * @param stockCode 股票代码
   * @param stockName 股票名称
   * @param limit 返回条数，默认5条
   */
  async fetchStockNews(
    stockCode: string,
    stockName: string,
    limit: number = 5
  ): Promise<any[]> {
    const allNews: any[] = [];
    
    logger.info(`开始获取 ${stockCode}(${stockName}) 的相关新闻...`);

    // 1. 优先从新浪7x24小时获取（数据最丰富、最可靠）
    try {
      const sinaNews = await this.fetchStockNewsFromSina(stockCode, stockName, limit * 2);
      if (sinaNews.length > 0) {
        logger.info(`从新浪7x24获取到 ${sinaNews.length} 条新闻`);
        allNews.push(...sinaNews);
      }
    } catch (e) {
      logger.warn(`新浪7x24新闻获取失败: ${(e as Error).message}`);
    }

    // 2. 如果新浪新闻不够，从同花顺快讯补充
    if (allNews.length < limit) {
      try {
        const thsNews = await this.fetchStockNewsFromTHS(stockCode, limit);
        if (thsNews.length > 0) {
          logger.info(`从同花顺获取到 ${thsNews.length} 条新闻`);
          allNews.push(...thsNews);
        }
      } catch (e) {
        // 忽略错误
      }
    }

    // 3. 如果还不够，从东方财富搜索补充
    if (allNews.length < limit) {
      try {
        const searchKey = stockName || stockCode;
        const timestamp = Date.now();
        const needCount = limit - allNews.length;
        
        const url = `${EASTMONEY_NEWS_API}?cb=jQuery&param={"uid":"","keyword":"${encodeURIComponent(searchKey)}","type":["cmsArticleWebOld"],"client":"web","clientType":"web","clientVersion":"curr","param":{"cmsArticleWebOld":{"searchScope":"default","sort":"default","pageIndex":1,"pageSize":${needCount + 5},"preTag":"<em>","postTag":"</em>"}}}&_=${timestamp}`;
        
        const response = await axios.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://so.eastmoney.com/',
          },
          timeout: 10000,
        });

        const jsonpData = response.data;
        const jsonMatch = jsonpData.match(/jQuery\((.*)\)/s);
        if (jsonMatch) {
          const data = JSON.parse(jsonMatch[1]);
          if (data?.result?.cmsArticleWebOld?.list) {
            const eastMoneyNews = data.result.cmsArticleWebOld.list.map((item: any) => ({
              stockCode,
              title: (item.title || '').replace(/<\/?em>/g, ''),
              summary: (item.content || '').replace(/<\/?em>/g, '').substring(0, 200),
              source: item.mediaName || '东方财富',
              url: item.url || '',
              publishTime: new Date(item.date || Date.now()),
              sentiment: 'neutral',
            }));
            if (eastMoneyNews.length > 0) {
              logger.info(`从东方财富获取到 ${eastMoneyNews.length} 条新闻`);
              allNews.push(...eastMoneyNews);
            }
          }
        }
      } catch (e) {
        // 忽略错误
      }
    }

    // 4. 去重（按标题）并按时间排序，取前limit条
    const seen = new Set<string>();
    const uniqueNews = allNews.filter(news => {
      const normalizedTitle = news.title.substring(0, 50); // 用标题前50字符做去重
      if (seen.has(normalizedTitle)) return false;
      seen.add(normalizedTitle);
      return true;
    });

    // 按发布时间降序排序
    uniqueNews.sort((a, b) => 
      new Date(b.publishTime).getTime() - new Date(a.publishTime).getTime()
    );

    const result = uniqueNews.slice(0, limit);
    logger.info(`最终返回 ${stockCode} 新闻 ${result.length} 条`);
    return result;
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
