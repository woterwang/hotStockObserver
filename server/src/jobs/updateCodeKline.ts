import { VolumeSurge } from '../models/VolumeSurge';
import { PriceBreakthrough } from '../models/PriceBreakthrough';
import { ConceptResonance } from '../models/ConceptResonance';
import { tradingCalendarService } from '../services/tradingCalendarService';
import { formatDate } from '../utils/dateUtils';
import { klineCacheService } from '../services/klineCacheService';
export async function updateCodeKline () {
	const today = formatDate(new Date(), 'YYYYMMDD');
	const prevDateStr = tradingCalendarService.getPrevTradingDay(today);
	if(!tradingCalendarService.isTradingDay(today)) return; // 今日不是交易日，不执行任务
	try {
		const VolumeSurgeRecords = await VolumeSurge.find({
			date: prevDateStr,
			strategyScore: { $gte: 40 },
		}).sort({ strategyScore: -1 });

		const PriceBreakthroughRecords = await PriceBreakthrough.find({
			date: prevDateStr,
			turnoverRatio: { $gte: 1.5 },
		}).sort({ turnoverRatio: -1 });

		const ConceptResonanceRecords = await ConceptResonance.find({
			date: prevDateStr,
			strategyScore: { $gte: -1 },
			conceptScore: { $gte: 30 }
		}).sort({ strategyScore: -1, changePercent: -1 });

		const allCodesSet = new Set<string>();
		VolumeSurgeRecords.forEach(record => allCodesSet.add(record.stockCode));
		PriceBreakthroughRecords.forEach(record => allCodesSet.add(record.stockCode));
		ConceptResonanceRecords.forEach(record => allCodesSet.add(record.stockCode));
		const allCodes = Array.from(allCodesSet);
		// 调用K线更新服务
		klineCacheService.fetchKlinesByCodes(allCodes);
	} catch (error) {
		console.error('Error in scheduled task:', error);
	}
}