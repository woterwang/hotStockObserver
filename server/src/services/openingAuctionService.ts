import dayjs from 'dayjs';
import { klineCacheService } from './klineCacheService';
import { getStockTrendMinute } from './stockTrendService';
import { logger } from '../utils';

export interface OpeningDataSnapshot {
  openPrice: number;
  openChangePercent: number;
  openVolumeRatio: number;
  auctionAmount: number;
  auctionAmountRatio: number;
  isLimitUp: boolean;
  sealAmount?: number;
  sealRatio?: number;
  openTimes?: number;
}

class OpeningAuctionService {
  private static readonly OPENING_VOLUME_BASELINE = 0.03;

  private formatDateStr (date: Date | string): string {
    if (typeof date === 'string') {
      return date.replace(/-/g, '').slice(0, 8);
    }
    return dayjs(date).format('YYYYMMDD');
  }

  private getLimitUpFactor (stockCode: string): number {
    // 主板默认10%，科创/创业20%，北交所30%
    if (stockCode.startsWith('300') || stockCode.startsWith('301') || stockCode.startsWith('688') || stockCode.startsWith('689')) {
      return 1.2;
    }
    if (stockCode.startsWith('8') || stockCode.startsWith('4') || stockCode.startsWith('920')) {
      return 1.3;
    }
    return 1.1;
  }

  async getOpeningData (stockCode: string, dateStr: string): Promise<OpeningDataSnapshot | null> {
    logger.info(`[OpeningAuction] 获取 ${stockCode} ${dateStr} 开盘数据`);

    try {
      const targetDateStr = this.formatDateStr(dateStr);
      const todayStr = dayjs().format('YYYYMMDD');

      const klineData = await klineCacheService.fetchKlineByDate(stockCode, targetDateStr);
      if (!klineData || klineData.length === 0) {
        logger.info(`[OpeningAuction] ${stockCode} 无K线数据`);
        return null;
      }

      // 统一升序，确保前一日定位和窗口计算稳定
      const sorted = [...klineData].sort((a, b) => a.date.localeCompare(b.date));
      const targetIdx = sorted.findIndex(k => k.date === targetDateStr);
      if (targetIdx === -1) {
        logger.info(`[OpeningAuction] ${stockCode} 未找到 ${targetDateStr} K线，无法计算开盘快照`);
        return null;
      }

      const target = sorted[targetIdx];
      const prev = targetIdx > 0 ? sorted[targetIdx - 1] : null;
      if (!prev || prev.close <= 0) {
        logger.info(`[OpeningAuction] ${stockCode} 缺失前一交易日收盘，无法计算开盘涨幅`);
        return null;
      }

      const openChangePercent = ((target.open - prev.close) / prev.close) * 100;

      let openingVolume = 0;
      let openingTurnover = 0;
      try {
        const minuteData = await getStockTrendMinute(stockCode, targetDateStr, '09:30');
        if (minuteData) {
          // 数据格式: [time, lastPrice, avgPrice, volume, ...]
          const minuteVolume = Number(minuteData[3]) || 0;
          const minutePrice = Number(minuteData[2]) || Number(minuteData[1]) || 0;
          // 原始历史接口 volume 单位需按历史口径转股数
          openingVolume = minuteVolume * 100;
          openingTurnover = openingVolume * minutePrice;
        }
      } catch (error) {
        logger.warn(`[OpeningAuction] ${stockCode} 历史分时拉取失败，使用降级逻辑`, error);
      }

      // 历史场景严禁使用当日全日成交额做集合竞价估算，避免未来函数
      const auctionAmount = openingTurnover > 0
        ? openingTurnover
        : (targetDateStr === todayStr ? (target.turnover || 0) : 0);

      const auctionAmountRatio = prev.turnover > 0
        ? (auctionAmount / prev.turnover) * 100
        : 0;

      // 分钟成交量缺失时，回退到日量口径；有分钟量时做开盘段等效折算
      let openVolumeRatio = 1;
      const previousVolWindow = sorted.slice(Math.max(0, targetIdx - 5), targetIdx);
      if (previousVolWindow.length > 0) {
        const avg5Vol = previousVolWindow.reduce((sum, k) => sum + (k.volume || 0), 0) / previousVolWindow.length;
        if (avg5Vol > 0) {
          const equivalentDailyVolume = openingVolume > 0
            ? (openingVolume / OpeningAuctionService.OPENING_VOLUME_BASELINE)
            : (target.volume || 0);
          openVolumeRatio = equivalentDailyVolume / avg5Vol;
        }
      }

      // 开盘信号使用 open 判定涨停，不使用当日 close/high，避免未来函数
      const limitUpPrice = prev.close * this.getLimitUpFactor(stockCode);
      const isLimitUp = target.open >= limitUpPrice * 0.995;

      return {
        openPrice: target.open,
        openChangePercent: Math.round(openChangePercent * 100) / 100,
        openVolumeRatio: Math.round(openVolumeRatio * 100) / 100,
        auctionAmount: Math.round(auctionAmount),
        auctionAmountRatio: Math.round(auctionAmountRatio * 100) / 100,
        isLimitUp,
        sealAmount: undefined,
        sealRatio: undefined,
        openTimes: undefined,
      };
    } catch (error) {
      logger.warn(`[OpeningAuction] 获取 ${stockCode} 开盘数据失败`, error);
      return null;
    }
  }
}

export const openingAuctionService = new OpeningAuctionService();
