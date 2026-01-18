import { intradayTradeService } from './intradayTradeService';

describe('intradayTradeService', () => {
  // 使用有效的交易日（2026年1月16日是周五，交易日）
  const validTradeDate = '20260116';

  it('should fetch single stock intraday trade data', async () => {
    const result = await intradayTradeService.fetchIntradayTrade('300098', validTradeDate);
    expect(result).toHaveProperty('stockCode', '300098');
    expect(result).toHaveProperty('tradeDate', validTradeDate);
    expect(Array.isArray(result.trades)).toBe(true);
  });

  it('should batch fetch multiple stocks for the same date', async () => {
    const batchResult = await intradayTradeService.fetchMultipleStocksIntradayTrade(['300098', '600519'], validTradeDate);
    expect(Array.isArray(batchResult.success)).toBe(true);
    expect(Array.isArray(batchResult.failed)).toBe(true);
  });

  it('should batch fetch multiple stocks for multiple dates', async () => {
    const queries = [
      { stockCode: '300098', tradeDate: '20260115' },
      { stockCode: '600519', tradeDate: validTradeDate }
    ];
    const batchResult = await intradayTradeService.fetchBatchIntradayTrade(queries);
    expect(Array.isArray(batchResult.success)).toBe(true);
    expect(Array.isArray(batchResult.failed)).toBe(true);
  });

  it('should batch fetch opening info for multiple stocks', async () => {
    const openingInfoMap = await intradayTradeService.fetchBatchOpeningInfo(['300098', '600519'], validTradeDate);
    expect(openingInfoMap instanceof Map).toBe(true);
    // 检查返回的开盘信息结构
    for (const [stockCode, openingInfo] of openingInfoMap) {
      expect(openingInfo).toHaveProperty('stockCode');
      expect(openingInfo).toHaveProperty('openPrice');
      expect(openingInfo).toHaveProperty('openChangePercent');
      expect(openingInfo).toHaveProperty('auctionAmountRatio');
    }
  });
});
