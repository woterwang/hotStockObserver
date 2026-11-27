import { Router } from 'express';
import { timingSafeEqual } from 'crypto';
import { logger } from '../utils';
import { thsCredentialService } from '../services/thsCredentialService';

const router = Router();

function isValidAdminKey (providedKey: string, configuredKey: string): boolean {
  const provided = Buffer.from(providedKey);
  const configured = Buffer.from(configuredKey);
  return provided.length === configured.length
    && timingSafeEqual(provided, configured);
}

router.use((req, res, next) => {
  const configuredKey = process.env.ADMIN_API_KEY?.trim();
  if (!configuredKey) {
    res.status(503).json({ success: false, message: '服务端未配置 ADMIN_API_KEY' });
    return;
  }

  const providedKey = String(req.header('X-Admin-Key') || '');
  if (!isValidAdminKey(providedKey, configuredKey)) {
    res.status(401).json({ success: false, message: '管理员密钥无效' });
    return;
  }

  next();
});

router.get('/ths-ticket/status', (_req, res) => {
  res.json({
    success: true,
    data: thsCredentialService.getStatus(),
  });
});

router.put('/ths-ticket', async (req, res) => {
  const ticket = typeof req.body?.ticket === 'string' ? req.body.ticket : '';
  const user = typeof req.body?.user === 'string' ? req.body.user : undefined;

  try {
    const status = await thsCredentialService.updateTicket({ ticket, user });
    logger.info('[管理接口] 同花顺 Ticket 已通过界面更新');
    res.json({
      success: true,
      message: 'Ticket 更新成功，已立即生效',
      data: status,
    });
  } catch (error) {
    logger.warn(`[管理接口] 同花顺 Ticket 更新失败: ${(error as Error).message}`);
    res.status(400).json({
      success: false,
      message: (error as Error).message,
    });
  }
});

export default router;
