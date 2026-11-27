import fs from 'fs/promises';
import path from 'path';
import dayjs from 'dayjs';
import { groupService } from './groupService';

export interface ThsTicketStatus {
  configured: boolean;
  hasUser: boolean;
  updatedAt: string | null;
  expiresAt: string | null;
  remainingDays: number | null;
}

export interface ThsTicketUpdate {
  ticket: string;
  user?: string;
}

class ThsCredentialService {
  private readonly envPath = process.env.THS_ENV_FILE
    || path.resolve(process.cwd(), '.env');

  getStatus (): ThsTicketStatus {
    const expiresAt = process.env.THS_TICKET_EXPIRES_AT?.trim() || null;
    const updatedAt = process.env.THS_TICKET_UPDATED_AT?.trim() || null;
    const remainingDays = expiresAt && dayjs(expiresAt).isValid()
      ? dayjs(expiresAt).startOf('day').diff(dayjs().startOf('day'), 'day')
      : null;

    return {
      configured: Boolean(process.env.THS_TICKET?.trim()),
      hasUser: Boolean(process.env.THS_USER?.trim()),
      updatedAt,
      expiresAt,
      remainingDays,
    };
  }

  async updateTicket (input: ThsTicketUpdate): Promise<ThsTicketStatus> {
    const ticket = input.ticket.trim();
    const user = input.user?.trim() || process.env.THS_USER?.trim() || '';

    await this.validateTicket(ticket, user);

    const updatedAt = dayjs().format('YYYY-MM-DD');
    const expiresAt = dayjs().add(90, 'day').format('YYYY-MM-DD');
    await this.updateEnvFile({
      THS_TICKET: ticket,
      THS_USER: user,
      THS_TICKET_UPDATED_AT: updatedAt,
      THS_TICKET_EXPIRES_AT: expiresAt,
    });

    process.env.THS_TICKET = ticket;
    process.env.THS_USER = user;
    process.env.THS_TICKET_UPDATED_AT = updatedAt;
    process.env.THS_TICKET_EXPIRES_AT = expiresAt;

    return this.getStatus();
  }

  private async validateTicket (ticketValue: string, userValue?: string): Promise<void> {
    const ticket = ticketValue.trim();
    const user = userValue?.trim() || process.env.THS_USER?.trim() || '';
    this.validateCredentials(ticket, user);
    await groupService.validateCredentials(ticket, user);
  }

  private validateCredentials (ticket: string, user: string): void {
    if (!/^[a-f0-9]{32}$/i.test(ticket)) {
      throw new Error('Ticket 格式无效，应为32位十六进制字符');
    }
    if (!user || user.length > 4096 || /[\s;\r\n]/.test(user)) {
      throw new Error('User Cookie 值无效；可留空以继续使用当前值');
    }
  }

  private async updateEnvFile (values: Record<string, string>): Promise<void> {
    let content = '';
    try {
      content = await fs.readFile(this.envPath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    const remainingLines = content
      .split(/\r?\n/)
      .filter(line => {
        const key = line.match(/^([A-Z][A-Z0-9_]*)=/)?.[1];
        return !key || !(key in values);
      });
    const nextContent = [
      ...remainingLines.filter(line => line !== ''),
      ...Object.entries(values).map(([key, value]) => `${key}="${this.escapeEnvValue(value)}"`),
      '',
    ].join('\n');
    const tempPath = `${this.envPath}.tmp`;

    await fs.writeFile(tempPath, nextContent, 'utf8');
    await fs.rename(tempPath, this.envPath);
  }

  private escapeEnvValue (value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }
}

export const thsCredentialService = new ThsCredentialService();
