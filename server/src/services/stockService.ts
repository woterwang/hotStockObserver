import { HotStock, MarketIndex, Sector, StockNews } from '../models';
import { logger } from '../utils';
import { formatDate, getToday, getDaysAgo, parseDate } from '../utils/dateUtils';
import { PeriodStats } from '../types';
import { dataFetchService } from './dataFetchService';

/**
 * 股票数据服务
 */
export class StockService {
  /**
   * 获取今日热搜股票列表
   */
  async getTodayHotStocks(limit: number = 20) {
    const today = getToday();
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

    const stocks = await HotStock.find({
      date: { $gte: today, $lt: tomorrow },
    })
      .sort({ rank: 1 })
      .limit(limit)
      .lean();

    return stocks;
  }

  /**
   * 获取指定日期的热搜股票
   */
  async getHotStocksByDate(dateStr: string, limit: number = 20) {
    const date = parseDate(dateStr);
    const nextDay = new Date(date.getTime() + 24 * 60 * 60 * 1000);

    const stocks = await HotStock.find({
      date: { $gte: date, $lt: nextDay },
    })
      .sort({ rank: 1 })
      .limit(limit)
      .lean();

    return stocks;
  }

  /**
   * 计算股票在指定日期范围内的最大连续上榜天数
   * @param records 股票的上榜记录（按日期排序）
   * @param allDatesInRange 指定范围内所有有数据的日期集合
   */
  private calculateMaxConsecutiveDays(
    records: Array<{ date: Date }>,
    allDatesInRange: Set<string>
  ): number {
    if (records.length === 0) return 0;
    if (records.length === 1) return 1;

    // 将记录按日期排序，并转换为日期字符串
    const sortedDates = records
      .map(r => formatDate(new Date(r.date)))
      .sort();

    // 将范围内所有日期转换为有序数组
    const allDates = Array.from(allDatesInRange).sort();
    
    // 创建一个 Set 方便快速查找股票是否在某天上榜
    const stockDatesSet = new Set(sortedDates);

    let maxConsecutive = 0;
    let currentConsecutive = 0;

    // 遍历范围内的所有日期，计算连续上榜天数
    for (const date of allDates) {
      if (stockDatesSet.has(date)) {
        currentConsecutive++;
        maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
      } else {
        currentConsecutive = 0;
      }
    }

    return maxConsecutive;
  }

  /**
   * 获取N天内持续热搜的股票统计
   */
  async getPeriodHotStocks(days: number = 7): Promise<PeriodStats[]> {
    // 获取数据库中最新的数据日期，而不是使用今天的日期
    // 这样可以确保即使没有最新数据，也能正确统计历史数据
    const latestRecord = await HotStock.findOne().sort({ date: -1 }).select('date').lean();
    
    if (!latestRecord) {
      logger.warn('数据库中没有热搜数据');
      return [];
    }
    
    const endDate = new Date(latestRecord.date);
    // 将结束日期设置为当天的23:59:59，确保包含当天的所有数据
    endDate.setHours(23, 59, 59, 999);
    
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - days + 1);
    startDate.setHours(0, 0, 0, 0);

    logger.info(`阶段统计查询范围: ${formatDate(startDate)} ~ ${formatDate(endDate)}, 天数: ${days}`);

    // 首先获取指定范围内所有有数据的日期（用于计算连续天数）
    const allDatesResult = await HotStock.aggregate([
      {
        $match: {
          date: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
        },
      },
    ]);
    const allDatesInRange = new Set<string>(allDatesResult.map((d: any) => d._id));
    logger.info(`范围内有数据的日期数: ${allDatesInRange.size}`);

    // 聚合查询：统计每只股票在这段时间内的出现次数
    const stats = await HotStock.aggregate([
      {
        $match: {
          date: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: '$stockCode',
          stockCode: { $first: '$stockCode' },
          stockName: { $first: '$stockName' },
          appearCount: { $sum: 1 },
          totalTurnover: { $sum: '$turnover' },
          avgTurnover: { $avg: '$turnover' },
          maxRank: { $min: '$rank' },
          avgRank: { $avg: '$rank' },
          latestPrice: { $last: '$currentPrice' },
          firstPrice: { $first: '$currentPrice' },
          maxChangePercent: { $max: '$changePercent' },
          minChangePercent: { $min: '$changePercent' },
          records: {
            $push: {
              date: '$date',
              price: '$currentPrice',
              changePercent: '$changePercent',
              turnover: '$turnover',
              rank: '$rank',
            },
          },
        },
      },
      {
        $match: {
          appearCount: { $gte: Math.ceil(days * 0.5) }, // 至少出现50%的天数
        },
      },
      {
        $sort: { appearCount: -1, avgRank: 1 },
      },
      {
        $limit: 50,
      },
    ]);

    // 转换为PeriodStats格式，并计算真正的连续上榜天数
    return stats.map((item: any) => {
      // 根据实际记录计算最大连续上榜天数
      const consecutiveDays = this.calculateMaxConsecutiveDays(item.records, allDatesInRange);
      
      return {
        stockCode: item.stockCode,
        stockName: item.stockName,
        consecutiveDays: consecutiveDays,
        totalTurnover: item.totalTurnover,
        avgTurnover: item.avgTurnover,
        startPrice: item.firstPrice,
        endPrice: item.latestPrice,
        totalChangePercent: item.firstPrice > 0 
          ? ((item.latestPrice - item.firstPrice) / item.firstPrice * 100)
          : 0,
        maxChangePercent: item.maxChangePercent,
        minChangePercent: item.minChangePercent,
        avgRank: Math.round(item.avgRank * 10) / 10,
        trendData: item.records.sort((a: any, b: any) => 
          new Date(a.date).getTime() - new Date(b.date).getTime()
        ),
      };
    });
  }

  /**
   * 获取单只股票的历史热搜记录
   */
  async getStockHistory(stockCode: string, days: number = 30) {
    const endDate = getToday();
    const startDate = getDaysAgo(days);

    const records = await HotStock.find({
      stockCode,
      date: { $gte: startDate, $lte: endDate },
    })
      .sort({ date: 1 })
      .lean();

    return records;
  }

  /**
   * 获取强势股（成交额Top10且涨幅>5%）
   */
  async getStrongStocks(minChangePercent: number = 5, limit: number = 10) {
    const today = getToday();
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

    const stocks = await HotStock.find({
      date: { $gte: today, $lt: tomorrow },
      changePercent: { $gte: minChangePercent },
    })
      .sort({ turnover: -1 })
      .limit(limit)
      .lean();

    return stocks;
  }

  /**
   * 获取大盘指数
   */
  async getMarketIndices(dateStr?: string) {
    const date = dateStr ? parseDate(dateStr) : getToday();
    const nextDay = new Date(date.getTime() + 24 * 60 * 60 * 1000);

    const indices = await MarketIndex.find({
      date: { $gte: date, $lt: nextDay },
    }).lean();

    return indices;
  }

  /**
   * 获取热门板块
   */
  async getHotSectors(dateStr?: string, limit: number = 10) {
    const date = dateStr ? parseDate(dateStr) : getToday();
    const nextDay = new Date(date.getTime() + 24 * 60 * 60 * 1000);

    const sectors = await Sector.find({
      date: { $gte: date, $lt: nextDay },
    })
      .sort({ changePercent: -1 })
      .limit(limit)
      .lean();

    return sectors;
  }

  /**
   * 获取股票相关新闻
   */
  async getStockNews(stockCode: string, limit: number = 20) {
    const news = await StockNews.find({ stockCode })
      .sort({ publishTime: -1 })
      .limit(limit)
      .lean();

    return news;
  }

  /**
   * 搜索股票
   */
  async searchStocks(keyword: string, limit: number = 20) {
    const regex = new RegExp(keyword, 'i');
    
    const stocks = await HotStock.find({
      $or: [
        { stockCode: regex },
        { stockName: regex },
      ],
    })
      .sort({ date: -1 })
      .limit(limit)
      .lean();

    // 去重，只保留每只股票最新的记录
    const uniqueStocks = stocks.reduce((acc: any[], stock) => {
      if (!acc.find(s => s.stockCode === stock.stockCode)) {
        acc.push(stock);
      }
      return acc;
    }, []);

    return uniqueStocks;
  }

  /**
   * 获取股票详情
   */
  async getStockDetail(stockCode: string) {
    // 获取最新热搜记录
    const latestRecord = await HotStock.findOne({ stockCode })
      .sort({ date: -1 })
      .lean();

    // 获取历史记录
    const history = await this.getStockHistory(stockCode, 30);

    // 获取相关新闻：每次都尝试获取最新新闻
    let news: any[] = [];
    
    if (latestRecord) {
      try {
        // 直接从API获取最新新闻（不依赖数据库缓存，确保是最新的）
        news = await dataFetchService.fetchStockNews(
          stockCode,
          latestRecord.stockName,
          5
        );
        
        // 异步保存到数据库（不阻塞返回）
        if (news.length > 0) {
          dataFetchService.fetchAndSaveStockNews(
            stockCode,
            latestRecord.stockName,
            5
          ).catch(() => {}); // 忽略保存错误
        }
      } catch (error) {
        logger.warn(`获取 ${stockCode} 新闻失败: ${(error as Error).message}`);
        // 如果实时获取失败，尝试从数据库读取缓存
        news = await this.getStockNews(stockCode, 5);
      }
    }

    return {
      basic: latestRecord,
      history,
      news,
    };
  }
}

export const stockService = new StockService();
