import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

/**
 * 策略中心列表
 */
const strategyItems = [
  { id: 'breakthrough', name: '价格突破', icon: '🚀', description: '价格突破188日新高扫描', path: '/breakthrough' },
  { id: 'volume_surge', name: '强势资金突破', icon: '🔥', description: '成交额前200+趋势突破', path: '/volume-surge' },
  { id: 'concept_resonance', name: '主线共振', icon: '🎯', description: '量价突破+板块概念共振', path: '/concept-resonance' },
];

/**
 * 信号中心列表
 */
const signalItems = [
  { id: 'signals', name: '突破三天交易信号', icon: '🎯', description: '策略产生的交易信号', path: '/signals' },
  { id: 'signals', name: '放量上涨交易信号', icon: '📊', description: '策略产生的交易信号', path: '/buy-signal' },
  { id: 'ma_crossover', name: '均线金叉', icon: '📉', description: '均线金叉买入', path: '#', disabled: true },
  { id: 'limit_up_follow', name: '涨停追踪', icon: '⚡', description: '涨停板次日追踪', path: '#', disabled: true },
];

/**
 * 页面头部导航
 */
export const Header: React.FC = () => {
  const location = useLocation();
  const [showStrategyMenu, setShowStrategyMenu] = useState(false);
  const [showSignalMenu, setShowSignalMenu] = useState(false);

  const navItems = [
    { path: '/', label: '信息概览', icon: '📊' },
    { path: '/stats', label: '阶段统计', icon: '📈' },
    { path: '/backtest', label: '策略回测', icon: '🧪' },
  ];

  // 关闭所有菜单
  const closeAllMenus = () => {
    setShowStrategyMenu(false);
    setShowSignalMenu(false);
  };

  return (
    <header className="bg-white shadow-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-2">
            <span className="text-2xl">🔥</span>
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
            
            {/* 策略中心下拉菜单 */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowStrategyMenu(!showStrategyMenu);
                  setShowSignalMenu(false);
                }}
                className={`flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  showStrategyMenu || ['/breakthrough', '/volume-surge', '/concept-resonance'].includes(location.pathname)
                    ? 'bg-purple-50 text-purple-600'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span className="mr-1">🧠</span>
                策略中心
                <svg className="ml-1 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              {showStrategyMenu && (
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                  <div className="px-4 py-2 border-b border-gray-100">
                    <div className="text-sm font-semibold text-gray-700">策略中心</div>
                    <div className="text-xs text-gray-500">选择并配置交易策略</div>
                  </div>
                  {strategyItems.map((strategy) => (
                    <Link
                      key={strategy.id}
                      to={strategy.path}
                      className="block px-4 py-2 hover:bg-gray-50"
                      onClick={() => closeAllMenus()}
                    >
                      <div className="flex items-center">
                        <span className="mr-2">{strategy.icon}</span>
                        <div>
                          <div className="text-sm font-medium text-gray-800">{strategy.name}</div>
                          <div className="text-xs text-gray-500">{strategy.description}</div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* 信号中心下拉菜单 */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowSignalMenu(!showSignalMenu);
                  setShowStrategyMenu(false);
                }}
                className={`flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  showSignalMenu || ['/signals', '/buy-signal'].includes(location.pathname)
                    ? 'bg-green-50 text-green-600'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span className="mr-1">🎯</span>
                信号中心
                <svg className="ml-1 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              {showSignalMenu && (
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                  <div className="px-4 py-2 border-b border-gray-100">
                    <div className="text-sm font-semibold text-gray-700">信号中心</div>
                    <div className="text-xs text-gray-500">策略产生的交易信号</div>
                  </div>
                  {signalItems.map((item) => (
                    <Link
                      key={item.id}
                      to={item.disabled ? '#' : item.path}
                      className={`block px-4 py-2 hover:bg-gray-50 ${item.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                      onClick={(e) => {
                        if (item.disabled) {
                          e.preventDefault();
                        } else {
                          closeAllMenus();
                        }
                      }}
                    >
                      <div className="flex items-center">
                        <span className="mr-2">{item.icon}</span>
                        <div>
                          <div className="text-sm font-medium text-gray-800">
                            {item.name}
                            {item.disabled && <span className="ml-2 text-xs text-gray-400">(开发中)</span>}
                          </div>
                          <div className="text-xs text-gray-500">{item.description}</div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
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
