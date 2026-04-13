import axios from 'axios';
import { logger } from '../utils';

const GROUP_API_BASE = 'https://ugc.10jqka.com.cn/optdata/selfgroup/open/api';

const Cookies = 'v=BADDy5VprsPdaVjQPIVvgHAF0wV3ABoAsQBsALsATgAVD-QAP_w6A0YAWANw; IFUserCookieKey={"userid":"263055735","escapename":"woter_wang","custid":"100104455815"}; cuc=070dc70807d548ac8532745f86a711e3; escapename=woter_wang; sess_tk=eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NiIsImtpZCI6InNlc3NfdGtfMSIsImJ0eSI6InNlc3NfdGsifQ.eyJqdGkiOiIwMDJjYzk4NDlkMmE0MjAxMTA2NjQxZmNmOTE4OGE4YjEiLCJpYXQiOjE3NzU2MTQ1MDksImV4cCI6MTc3NjIxOTMwOSwic3ViIjoiMjYzMDU1NzM1IiwiaXNzIjoidXBhc3MuMTBqcWthLmNvbS5jbiIsImF1ZCI6IjIwMjMwODA0OTA3NTEyOTIiLCJhY3QiOiJvZmMiLCJjdWhzIjoiNmNiMjI5MzkxYjI5ODgzNjA0MTA3ZGVkNzAzZTdiMGI4ZGU5OTMzYjAzZmFjZTFmNTc0MjcyNDMyYjc5ODYxZSJ9.wRpPtZ3vefagXnAZPef_SpmRXZLs104Ogfe058dpMWYEhDK1DdDnyIpO2yrtECO6Mf9jr6BGoMpRRIWFtN8mqQ; ticket=93108f91486453e83748e5dad2115b28; u_name=woter_wang; user=MDp3b3Rlcl93YW5nOjpOb25lOjUwMDoyNzMwNTU3MzU6NywxMTExMTExMTExMSw0MDs0NCwxMSw0MDs2LDEsNDA7NSwxLDQwOzEsMTAxLDQwOzIsMSw0MDszLDEsNDA7NSwxLDQwOzgsMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDEsNDA7MTAyLDEsNDA6MjQ6OjoyNjMwNTU3MzU6MTc3NTYxNDUwOTo6OjE0MzM1NzU4MDA6NjA0ODAwOjA6MThiOGExOGY5ZmM0MTY2MTAwMTQyMmE5ZDg0YzkyYzAwOjow; user_status=0; userid=263055735; _clck=vyi5nl%7C2%7Cg4w%7C0%7C0'

/**
 * 获取股票的同花顺市场代码
 * 上证(6开头) = 17, 深证(0/3开头) = 33,
 */
function getMarketCode (stockCode: string): string {
	if (stockCode.startsWith('6')) return '17';
	if (stockCode.startsWith('920')) return '151';
	return '33';
}

class GroupService {
	private version = 0;

	private getCookie (): string {
		const cookie = Cookies || process.env.THS_AUTH_COOKIE;
		if (!cookie) {
			throw new Error('THS_AUTH_COOKIE 环境变量未配置');
		}
		return cookie;
	}

	private getHeaders () {
		return {
			'Content-Type': 'application/x-www-form-urlencoded',
			'Cookie': this.getCookie(),
			'User-Agent': '%E5%90%8C%E8%8A%B1%E9%A1%BA/12.01.00 CFNetwork/1568.300.101 Darwin/24.2.0',
		};
	}

	/**
	 * 手动构建 form body，避免 URLSearchParams 对 content 中的逗号过度编码
	 */
	private buildFormBody (params: Record<string, string>): string {
		return Object.entries(params)
			.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value).replace(/%2C/g, ',')}`)
			.join('&');
	}

	/**
	 * 发送带 version 的 POST 请求，自动处理 version outdated 重试
	 */
	private async postWithVersion (url: string, params: Record<string, string>): Promise<any> {
		const makeBody = () => this.buildFormBody({ ...params, version: String(this.version) });

		const response = await axios.post(url, makeBody(), { headers: this.getHeaders() });
		const data = response.data;

		if (data.status_code === 1 && data.status_msg === 'version outdated' && data.data?.version) {
			logger.info(`[GroupService] version outdated, 更新 version: ${this.version} -> ${data.data.version}`);
			this.version = data.data.version;
			const retryResponse = await axios.post(url, makeBody(), { headers: this.getHeaders() });
			return retryResponse.data;
		}

		return data;
	}

	/**
	 * 创建自选股分组
	 * @param name 分组名称
	 * @returns groupId 分组ID
	 */
	async createGroup (name: string): Promise<string> {
		const url = `${GROUP_API_BASE}/group/v1/add`;

		logger.info(`[GroupService] 创建分组: ${name}`);

		const data = await this.postWithVersion(url, {
			from: 'sjcg_ios',
			name,
			type: '0',
		});

		if (data.status_code !== 0) {
			throw new Error(`创建分组失败: ${data.status_msg}`);
		}

		this.version = data.data.version;
		const groupId = data.data.id;
		logger.info(`[GroupService] 分组创建成功, id=${groupId}, version=${this.version}`);
		return groupId;
	}

	/**
	 * 添加股票到分组
	 * @param groupId 分组ID (如 "0_42")
	 * @param stockCodes 股票代码列表 (如 ["300058", "600519"])
	 */
	async addStocksToGroup (groupId: string, stockCodes: string[]): Promise<number> {
		const url = `${GROUP_API_BASE}/content/v1/add`;
		logger.info(`[GroupService] 添加股票到分组 ${groupId}: ${stockCodes.join(', ')}`);

		let totalAdded = 0;
		for (const stockCode of stockCodes) {
			// 单只股票格式已验证可用: stockCode|,marketCode|
			const content = `${stockCode}|,${getMarketCode(stockCode)}|`;
			const data = await this.postWithVersion(url, {
				from: 'sjcg_ios',
				id: groupId,
				content,
				num: '1',
				add_mode: 'prepend',
			});

			if (data.status_code !== 0) {
				throw new Error(`添加股票到分组失败(${stockCode}): ${data.status_msg}`);
			}

			this.version = data.data.version;
			totalAdded += Number(data.data.added_num || 0);
		}

		logger.info(`[GroupService] 添加成功, added=${totalAdded}, version=${this.version}`);
		return totalAdded;
	}
}

export const groupService = new GroupService();
