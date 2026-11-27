import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { NextFunction, Request, Response, Router } from 'express';
import { logger } from '../utils';

const COOKIE_NAME = 'hso_access';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_CHALLENGES = 1000;
const challenges = new Map<string, Challenge>();

interface Challenge {
  expiresAt: number;
  fingerprint: string;
  targetPosition: number;
}

interface AccessTokenPayload {
  expiresAt: number;
  version: 1;
}

function getSecret(): string {
  return (process.env.ACCESS_GATE_SECRET || process.env.ADMIN_API_KEY || '').trim();
}

function getFingerprint(req: Request): string {
  const value = `${req.ip || ''}|${req.header('user-agent') || ''}`;
  return createHmac('sha256', getSecret()).update(value).digest('base64url');
}

function sign(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

function createSessionToken(): string {
  const payload: AccessTokenPayload = {
    expiresAt: Date.now() + SESSION_TTL_MS,
    version: 1,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encodedPayload}.${sign(encodedPayload, getSecret())}`;
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) {
    return {};
  }

  return header.split(';').reduce<Record<string, string>>((cookies, part) => {
    const separator = part.indexOf('=');
    if (separator < 0) {
      return cookies;
    }

    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name) {
      try {
        cookies[name] = decodeURIComponent(value);
      } catch {
        cookies[name] = value;
      }
    }
    return cookies;
  }, {});
}

function hasValidSession(req: Request): boolean {
  const token = parseCookies(req.header('cookie'))[COOKIE_NAME];
  const secret = getSecret();
  if (!token || !secret) {
    return false;
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return false;
  }

  const [encodedPayload, providedSignature] = parts;
  const expectedSignature = sign(encodedPayload, secret);
  const providedBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    providedBuffer.length !== expectedBuffer.length
    || !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return false;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8')
    ) as Partial<AccessTokenPayload>;
    return payload.version === 1
      && typeof payload.expiresAt === 'number'
      && payload.expiresAt > Date.now()
      && payload.expiresAt <= Date.now() + SESSION_TTL_MS + 60_000;
  } catch {
    return false;
  }
}

function isEnabled(): boolean {
  return process.env.ACCESS_GATE_ENABLED?.trim().toLowerCase() !== 'false';
}

function removeExpiredChallenges(): void {
  const now = Date.now();
  for (const [id, challenge] of challenges) {
    if (challenge.expiresAt <= now) {
      challenges.delete(id);
    }
  }
}

function safeReturnTo(value: unknown): string {
  if (
    typeof value === 'string'
    && value.startsWith('/')
    && !value.startsWith('//')
    && !value.includes('\\')
  ) {
    return value;
  }

  return '/';
}

function setChallengePageHeaders(res: Response, nonce: string): void {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.setHeader(
    'Content-Security-Policy',
    `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`
  );
}

export function sendAccessChallengePage(req: Request, res: Response): void {
  if (!isEnabled()) {
    res.redirect(safeReturnTo(req.query.next));
    return;
  }

  if (hasValidSession(req)) {
    res.redirect(safeReturnTo(req.query.next));
    return;
  }

  if (!getSecret()) {
    logger.error('[访问验证] 未配置 ACCESS_GATE_SECRET 或 ADMIN_API_KEY');
    res.status(503).send('访问验证服务未正确配置');
    return;
  }

  const nonce = randomBytes(18).toString('base64');
  const returnTo = JSON.stringify(safeReturnTo(req.query.next)).replace(/</g, '\\u003c');
  setChallengePageHeaders(res, nonce);
  res.status(200).type('html').send(`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <title>访问验证</title>
  <style nonce="${nonce}">
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px;
      color: #172033; background: #f2f5f9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    main {
      width: min(100%, 420px); padding: 28px; border: 1px solid #e2e8f0;
      border-radius: 18px; background: #fff; box-shadow: 0 16px 50px rgba(15, 23, 42, .10);
    }
    h1 { margin: 0 0 10px; font-size: 22px; }
    p { margin: 0; color: #64748b; font-size: 14px; line-height: 1.7; }
    .panel { margin-top: 24px; }
    .track-wrap { position: relative; padding: 20px 0 6px; }
    .target {
      position: absolute; top: 8px; width: 2px; height: 36px; border-radius: 2px;
      background: #16a34a; transform: translateX(-1px);
      box-shadow: 0 0 0 5px rgba(22, 163, 74, .10);
    }
    .target::before {
      content: ""; position: absolute; left: 50%; top: -7px; width: 8px; height: 8px;
      border-radius: 50%; background: #16a34a; transform: translateX(-50%);
    }
    input[type="range"] { width: 100%; margin: 0; accent-color: #2563eb; touch-action: none; }
    button {
      width: 100%; margin-top: 18px; border: 0; border-radius: 10px;
      padding: 12px 16px; color: white; background: #2563eb; font-size: 15px; cursor: pointer;
    }
    button:disabled { cursor: wait; opacity: .6; }
    #message { min-height: 24px; margin-top: 14px; color: #b91c1c; font-size: 13px; }
    .hint { margin-top: 10px; font-size: 12px; }
  </style>
</head>
<body>
  <main>
    <h1>请先完成访问验证</h1>
    <p>将滑块拖动到绿色标记附近，然后点击“验证并进入”。验证通过后当天无需重复操作。</p>
    <div class="panel">
      <div class="track-wrap">
        <span id="target" class="target" hidden></span>
        <input id="slider" type="range" min="0" max="100" step="0.1" value="0" aria-label="拖动滑块到绿色标记" disabled>
      </div>
      <button id="submit" type="button" disabled>正在准备验证...</button>
      <div id="message" role="status" aria-live="polite"></div>
      <p class="hint">验证只用于阻挡普通自动访问，不会收集个人信息。</p>
    </div>
  </main>
  <script nonce="${nonce}">
    (() => {
      const slider = document.getElementById('slider');
      const target = document.getElementById('target');
      const submit = document.getElementById('submit');
      const message = document.getElementById('message');
      const returnTo = ${returnTo};
      let challengeId = '';
      let startedAt = 0;

      const showError = (text) => {
        message.textContent = text;
      };

      const loadChallenge = async () => {
        challengeId = '';
        submit.disabled = true;
        slider.disabled = true;
        submit.textContent = '正在准备验证...';
        showError('');
        try {
          const response = await fetch('/api/access/challenge', {
            headers: { Accept: 'application/json' },
            cache: 'no-store'
          });
          const result = await response.json();
          if (!response.ok || !result.success) {
            throw new Error(result.message || '无法加载验证');
          }
          challengeId = result.data.id;
          target.style.left = result.data.targetPosition + '%';
          target.hidden = false;
          slider.value = '0';
          startedAt = 0;
          slider.disabled = false;
          submit.disabled = false;
          submit.textContent = '验证并进入';
        } catch (error) {
          showError(error instanceof Error ? error.message : '无法加载验证');
          submit.textContent = '重试';
          submit.disabled = false;
        }
      };

      slider.addEventListener('pointerdown', () => {
        startedAt = performance.now();
      });

      submit.addEventListener('click', async () => {
        if (!challengeId) {
          await loadChallenge();
          return;
        }

        submit.disabled = true;
        slider.disabled = true;
        submit.textContent = '验证中...';
        showError('');
        try {
          const response = await fetch('/api/access/verify', {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              challengeId,
              position: Number(slider.value),
              duration: startedAt ? performance.now() - startedAt : 0
            })
          });
          const result = await response.json();
          if (!response.ok || !result.success) {
            throw new Error(result.message || '验证未通过');
          }
          window.location.replace(returnTo);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : '验证失败，请重试';
          await loadChallenge();
          showError(errorMessage);
        }
      });

      loadChallenge();
    })();
  </script>
</body>
</html>`);
}

export function createAccessRouter(): Router {
  const router = Router();

  router.get('/challenge', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!getSecret()) {
      res.status(503).json({ success: false, message: '访问验证服务未正确配置' });
      return;
    }

    removeExpiredChallenges();
    while (challenges.size >= MAX_CHALLENGES) {
      const oldestId = challenges.keys().next().value;
      if (!oldestId) {
        break;
      }
      challenges.delete(oldestId);
    }

    const id = randomBytes(24).toString('base64url');
    const targetPosition = randomInt(24, 77);
    challenges.set(id, {
      expiresAt: Date.now() + CHALLENGE_TTL_MS,
      fingerprint: getFingerprint(req),
      targetPosition,
    });

    res.json({
      success: true,
      data: {
        id,
        targetPosition,
        expiresAt: Date.now() + CHALLENGE_TTL_MS,
      },
    });
  });

  router.post('/verify', (req, res) => {
    if (!getSecret()) {
      res.status(503).json({ success: false, message: '访问验证服务未正确配置' });
      return;
    }

    const challengeId = typeof req.body?.challengeId === 'string'
      ? req.body.challengeId
      : '';
    const position = Number(req.body?.position);
    const duration = Number(req.body?.duration);
    const challenge = challenges.get(challengeId);
    challenges.delete(challengeId);

    if (
      !challenge
      || challenge.expiresAt <= Date.now()
      || challenge.fingerprint !== getFingerprint(req)
    ) {
      res.status(400).json({ success: false, message: '验证已过期，请重新验证' });
      return;
    }

    if (
      !Number.isFinite(position)
      || !Number.isFinite(duration)
      || duration < 250
      || duration > 15_000
      || Math.abs(position - challenge.targetPosition) > 2.5
    ) {
      res.status(400).json({ success: false, message: '滑块位置不正确，请重试' });
      return;
    }

    res.cookie(COOKIE_NAME, createSessionToken(), {
      httpOnly: true,
      maxAge: SESSION_TTL_MS,
      path: '/',
      sameSite: 'lax',
      secure: req.secure || process.env.ACCESS_GATE_COOKIE_SECURE === 'true',
    });
    res.json({
      success: true,
      data: { validForSeconds: SESSION_TTL_MS / 1000 },
    });
  });

  return router;
}

export function requireSiteAccess(req: Request, res: Response, next: NextFunction): void {
  if (!isEnabled() || hasValidSession(req)) {
    next();
    return;
  }

  if (!getSecret()) {
    logger.error('[访问验证] 未配置 ACCESS_GATE_SECRET 或 ADMIN_API_KEY');
    res.status(503).json({ success: false, message: '访问验证服务未正确配置' });
    return;
  }

  if (req.path.startsWith('/api/')) {
    res.status(401).json({
      success: false,
      code: 'ACCESS_VERIFICATION_REQUIRED',
      message: '请先完成页面访问验证',
    });
    return;
  }

  res.redirect(`/access?next=${encodeURIComponent(req.originalUrl)}`);
}
