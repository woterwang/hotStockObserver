import axios from 'axios';
import { logger } from '../utils';

export interface WeChatStockSignalSummary {
  strategy: string;
  stockCodes: string[];
}

interface WeChatWebhookResponse {
  errcode?: number;
  errmsg?: string;
}

class WeChatWorkNotifyService {
  async sendStockSignalSummary (
    date: string,
    summaries: WeChatStockSignalSummary[]
  ): Promise<boolean> {
    const webhookUrl = process.env.WECHAT_WORK_BOT_WEBHOOK?.trim();
    if (!webhookUrl || webhookUrl.includes('YOUR_KEY_HERE')) {
      logger.warn('[企业微信通知] WECHAT_WORK_BOT_WEBHOOK 尚未配置，跳过推送');
      return false;
    }

    const parsedUrl = new URL(webhookUrl);
    if (
      parsedUrl.protocol !== 'https:'
      || parsedUrl.hostname !== 'qyapi.weixin.qq.com'
      || parsedUrl.pathname !== '/cgi-bin/webhook/send'
      || !parsedUrl.searchParams.get('key')
    ) {
      throw new Error('WECHAT_WORK_BOT_WEBHOOK 不是有效的企业微信机器人 Webhook 地址');
    }

    const availableSummaries = summaries.filter(summary => summary.stockCodes.length > 0);
    if (availableSummaries.length === 0) {
      return false;
    }

    const content = [
      `## ${this.formatDate(date)} 竞价选股结果`,
      ...availableSummaries.flatMap(summary => [
        `### ${summary.strategy}`,
        ...summary.stockCodes.map((stockCode, index) => `${index + 1}. \`${stockCode}\``),
      ]),
      '',
      `> 共 ${availableSummaries.reduce((total, summary) => total + summary.stockCodes.length, 0)} 个标的已加入对应分组`,
    ].join('\n');

    const timeout = Number(process.env.WECHAT_NOTIFY_TIMEOUT || 10000);
    const response = await axios.post<WeChatWebhookResponse>(
      webhookUrl,
      {
        msgtype: 'markdown',
        markdown: { content },
      },
      { timeout }
    );

    if (response.data.errcode !== 0) {
      throw new Error(`企业微信机器人返回错误: ${response.data.errmsg || '未知错误'}`);
    }

    logger.info(`[企业微信通知] 推送成功，策略数=${availableSummaries.length}`);
    return true;
  }

  private formatDate (date: string): string {
    if (!/^\d{8}$/.test(date)) {
      return date;
    }
    return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
  }
}

export const wechatWorkNotifyService = new WeChatWorkNotifyService();
