import React from 'react';
import { Link, useLocation } from 'react-router-dom';

/**
 * 页面头部导航
 */
export const Header: React.FC = () => {
  const location = useLocation();

  const navItems = [
    { path: '/', label: '信息概览', icon: '📊' },
    { path: '/stats', label: '阶段统计', icon: '📈' },
    { path: '/breakthrough', label: '价格突破', icon: '🚀' },
    { path: '/signals', label: '交易信号', icon: '🎯' },
    { path: '/backtest', label: '策略回测', icon: '🧪' },
  ];

  return (
    <header className="bg-white shadow-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-2">
            <span className="text-2xl">🔥</span>
            <span className="text-xl font-bold text-gray-800">热搜股票观察</span>
          </Link>

          {/* 导航 */}
          <nav className="flex items-center space-x-1">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  location.pathname === item.path
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span className="mr-1">{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </nav>

          {/* 更新时间 */}
          <div className="text-sm text-gray-500">
            <span>最后更新: </span>
            <span>{new Date().toLocaleTimeString()}</span>
          </div>
        </div>
      </div>
    </header>
  );
};

/**
 * 页面底部
 */
export const Footer: React.FC = () => {
  return (
    <footer className="bg-white border-t border-gray-200 mt-8">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="text-center text-gray-500 text-sm">
          <p>每日热搜股票观察系统 © {new Date().getFullYear()}</p>
          <p className="mt-1">数据仅供参考，不构成投资建议</p>
        </div>
      </div>
    </footer>
  );
};

interface LayoutProps {
  children: React.ReactNode;
}

/**
 * 页面布局
 */
export const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        {children}
      </main>
      <Footer />
    </div>
  );
};
