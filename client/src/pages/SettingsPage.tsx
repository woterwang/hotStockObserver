import React, { useEffect, useState } from 'react';
import { Layout } from '../components';
import { adminApi } from '../services/api';

interface TicketStatus {
  configured: boolean;
  hasUser: boolean;
  updatedAt: string | null;
  expiresAt: string | null;
  remainingDays: number | null;
}

const getErrorMessage = (error: unknown): string => {
  const axiosError = error as {
    response?: { data?: { message?: string } };
    message?: string;
  };
  return axiosError.response?.data?.message || axiosError.message || '操作失败';
};

const SettingsPage: React.FC = () => {
  const [adminKey, setAdminKey] = useState(() => sessionStorage.getItem('ths-admin-key') || '');
  const [ticket, setTicket] = useState('');
  const [user, setUser] = useState('');
  const [status, setStatus] = useState<TicketStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadStatus = async (key: string) => {
    if (!key.trim()) {
      setMessage({ type: 'error', text: '请输入管理员密钥' });
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const response = await adminApi.getThsTicketStatus(key.trim());
      setStatus(response.data);
      sessionStorage.setItem('ths-admin-key', key.trim());
    } catch (error) {
      setStatus(null);
      setMessage({ type: 'error', text: getErrorMessage(error) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (adminKey) {
      void loadStatus(adminKey);
    }
  }, []);

  const updateTicket = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!adminKey.trim()) {
      setMessage({ type: 'error', text: '请输入管理员密钥' });
      return;
    }
    if (!ticket.trim()) {
      setMessage({ type: 'error', text: '请输入新的 Ticket' });
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const response = await adminApi.updateThsTicket(
        adminKey.trim(),
        ticket.trim(),
        user.trim() || undefined
      );
      setStatus(response.data);
      setTicket('');
      setUser('');
      sessionStorage.setItem('ths-admin-key', adminKey.trim());
      setMessage({ type: 'success', text: response.message || 'Ticket 更新成功' });
    } catch (error) {
      setMessage({ type: 'error', text: getErrorMessage(error) });
    } finally {
      setLoading(false);
    }
  };

  const daysRemaining = status?.remainingDays;
  const urgencyClass = daysRemaining !== null && daysRemaining !== undefined && daysRemaining <= 5
    ? 'text-red-600'
    : 'text-green-600';

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">系统设置</h1>
          <p className="mt-1 text-sm text-gray-500">
            管理同花顺自选分组认证。更新后立即生效，不需要重启 PM2。
          </p>
        </div>

        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">管理员验证</h2>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              type="password"
              value={adminKey}
              onChange={(event) => setAdminKey(event.target.value)}
              placeholder="输入 server/.env 中的 ADMIN_API_KEY"
              className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
            <button
              type="button"
              onClick={() => void loadStatus(adminKey)}
              disabled={loading}
              className="rounded-lg bg-gray-800 px-4 py-2 text-white disabled:opacity-50"
            >
              {loading ? '处理中...' : '验证并读取状态'}
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            密钥仅保存在当前浏览器标签会话中，不会写入页面或日志。
          </p>
        </section>

        {status && (
          <section className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="text-sm text-gray-500">当前状态</div>
              <div className={`mt-1 font-semibold ${status.configured ? 'text-green-600' : 'text-red-600'}`}>
                {status.configured ? '已配置' : '未配置'}
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="text-sm text-gray-500">到期日期</div>
              <div className="mt-1 font-semibold text-gray-900">{status.expiresAt || '未设置'}</div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="text-sm text-gray-500">剩余天数</div>
              <div className={`mt-1 font-semibold ${urgencyClass}`}>
                {daysRemaining === null || daysRemaining === undefined ? '未知' : daysRemaining < 0 ? `已过期 ${Math.abs(daysRemaining)} 天` : `${daysRemaining} 天`}
              </div>
            </div>
          </section>
        )}

        <form onSubmit={updateTicket} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">更新同花顺 Ticket</h2>
          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">新 Ticket</label>
              <input
                type="password"
                value={ticket}
                onChange={(event) => setTicket(event.target.value)}
                placeholder="32位 Ticket"
                autoComplete="off"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                User Cookie
                <span className="ml-1 font-normal text-gray-400">（可选，留空继续使用当前值）</span>
              </label>
              <textarea
                value={user}
                onChange={(event) => setUser(event.target.value)}
                placeholder={status?.hasUser ? '当前已配置；通常只更新 Ticket 即可' : '首次使用需填写 Cookie 中 user= 后面的值'}
                rows={3}
                autoComplete="off"
                className="mt-1 w-full resize-y rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>

          <div className="mt-5 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-800">
            提交前会调用同花顺分组接口进行无副作用认证验证。验证成功后自动设置 90 天有效期并立即生效。
          </div>

          {message && (
            <div className={`mt-4 rounded-lg px-4 py-3 text-sm ${
              message.type === 'success'
                ? 'bg-green-50 text-green-700'
                : 'bg-red-50 text-red-700'
            }`}>
              {message.text}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-5 w-full rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? '验证并更新中...' : '验证并更新 Ticket'}
          </button>
        </form>
      </div>
    </Layout>
  );
};

export default SettingsPage;
