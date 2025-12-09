import React from 'react';
import { useNavigate } from 'react-router-dom';
import type { HotStock } from '../../types';

interface HotStockTableProps {
  stocks: HotStock[];
  showRank?: boolean;
}

/**
 * 热搜股票表格组件
 */
export const HotStockTable: React.FC<HotStockTableProps> = ({ 
  stocks, 
  showRank = true 
}) => {
  const navigate = useNavigate();

  const formatTurnover = (value: number): string => {
    if (value >= 100000000) {
      return `${(value / 100000000).toFixed(2)}亿`;
    }
    if (value >= 10000) {
      return `${(value / 10000).toFixed(2)}万`;
    }
    return value.toFixed(2);
  };

  const getPriceColor = (value: number): string => {
    if (value > 0) return 'text-rise';
    if (value < 0) return 'text-fall';
    return 'text-flat';
  };

  const handleRowClick = (stockCode: string) => {
    navigate(`/stock/${stockCode}`);
  };

  return (
    <div className="overflow-x-auto">
      <table className="stock-table">
        <thead>
          <tr>
            {showRank && <th className="w-12">排名</th>}
            <th>股票代码</th>
            <th>股票名称</th>
            <th className="text-right">最新价</th>
            <th className="text-right">涨跌幅</th>
            <th className="text-right">成交额</th>
            <th>所属板块</th>
            <th>上涨原因</th>
          </tr>
        </thead>
        <tbody>
          {stocks.map((stock) => (
            <tr 
              key={stock.stockCode}
              onClick={() => handleRowClick(stock.stockCode)}
              className="cursor-pointer hover:bg-gray-50"
            >
              {showRank && (
                <td>
                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${
                    stock.rank <= 3 
                      ? 'bg-red-500 text-white' 
                      : stock.rank <= 10 
                        ? 'bg-orange-100 text-orange-600'
                        : 'bg-gray-100 text-gray-600'
                  }`}>
                    {stock.rank}
                  </span>
                </td>
              )}
              <td className="font-mono text-gray-600">{stock.stockCode}</td>
              <td className="font-medium">{stock.stockName}</td>
              <td className={`text-right font-mono ${getPriceColor(stock.changePercent)}`}>
                {stock.currentPrice.toFixed(2)}
              </td>
              <td className={`text-right font-mono ${getPriceColor(stock.changePercent)}`}>
                {stock.changePercent > 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
              </td>
              <td className="text-right text-gray-600">
                {formatTurnover(stock.turnover)}
              </td>
              <td>
                {stock.sector ? (
                  <span className="inline-block px-2 py-0.5 bg-blue-50 text-blue-600 text-xs rounded">
                    {stock.sector}
                  </span>
                ) : '-'}
              </td>
              <td className="relative group">
                <span 
                  className="text-sm text-gray-500 truncate max-w-[150px] block cursor-help"
                  title={stock.riseReason || '-'}
                >
                  {stock.riseReason || '-'}
                </span>
                {/* 悬停显示完整内容的 Tooltip */}
                {stock.riseReason && stock.riseReason.length > 20 && (
                  <div className="absolute z-50 invisible group-hover:visible opacity-0 group-hover:opacity-100 
                    transition-opacity duration-200 bottom-full left-0 mb-2 w-80 p-3 
                    bg-gray-800 text-white text-sm rounded-lg shadow-lg">
                    <div className="font-medium mb-1 text-yellow-300">上涨原因</div>
                    <div className="leading-relaxed whitespace-pre-wrap">{stock.riseReason}</div>
                    {/* 小三角箭头 */}
                    <div className="absolute top-full left-4 border-8 border-transparent border-t-gray-800"></div>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

interface HotStockListProps {
  stocks: HotStock[];
}

/**
 * 热搜股票列表组件（卡片式）
 */
export const HotStockList: React.FC<HotStockListProps> = ({ stocks }) => {
  const navigate = useNavigate();

  const getPriceColor = (value: number): string => {
    if (value > 0) return 'text-rise';
    if (value < 0) return 'text-fall';
    return 'text-flat';
  };

  return (
    <div className="divide-y divide-gray-100">
      {stocks.map((stock) => (
        <div
          key={stock.stockCode}
          className="stock-row"
          onClick={() => navigate(`/stock/${stock.stockCode}`)}
        >
          <div className="flex items-center space-x-3">
            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${
              stock.rank <= 3 
                ? 'bg-red-500 text-white' 
                : 'bg-gray-100 text-gray-600'
            }`}>
              {stock.rank}
            </span>
            <div>
              <div className="font-medium">{stock.stockName}</div>
              <div className="text-xs text-gray-500">{stock.stockCode}</div>
            </div>
          </div>
          <div className="text-right">
            <div className={`font-mono ${getPriceColor(stock.changePercent)}`}>
              {stock.currentPrice.toFixed(2)}
            </div>
            <div className={`text-sm font-mono ${getPriceColor(stock.changePercent)}`}>
              {stock.changePercent > 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
