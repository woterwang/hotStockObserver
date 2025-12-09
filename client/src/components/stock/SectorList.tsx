import React from 'react';
import type { Sector } from '../../types';

interface SectorListProps {
  sectors: Sector[];
}

/**
 * 热门板块列表组件
 */
export const SectorList: React.FC<SectorListProps> = ({ sectors }) => {
  const getPriceColor = (value: number): string => {
    if (value > 0) return 'text-rise';
    if (value < 0) return 'text-fall';
    return 'text-flat';
  };

  const formatTurnover = (value: number): string => {
    if (value >= 100000000) {
      return `${(value / 100000000).toFixed(2)}亿`;
    }
    if (value >= 10000) {
      return `${(value / 10000).toFixed(2)}万`;
    }
    return value.toFixed(2);
  };

  return (
    <div className="space-y-2">
      {sectors.map((sector, index) => (
        <div 
          key={sector.sectorCode || index}
          className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer"
        >
          <div className="flex items-center space-x-3">
            <span className={`inline-flex items-center justify-center w-5 h-5 rounded text-xs font-medium ${
              index < 3 ? 'bg-orange-500 text-white' : 'bg-gray-200 text-gray-600'
            }`}>
              {index + 1}
            </span>
            <span className="font-medium">{sector.sectorName}</span>
          </div>
          <div className="flex items-center space-x-4">
            <span className={`font-mono ${getPriceColor(sector.changePercent)}`}>
              {sector.changePercent > 0 ? '+' : ''}{sector.changePercent.toFixed(2)}%
            </span>
            {sector.turnover > 0 && (
              <span className="text-sm text-gray-500">
                {formatTurnover(sector.turnover)}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
