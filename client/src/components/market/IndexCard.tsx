import React from 'react';
import type { MarketIndex } from '../../types';

interface IndexCardProps {
  index: MarketIndex;
}

/**
 * 指数卡片组件
 */
export const IndexCard: React.FC<IndexCardProps> = ({ index }) => {
  const isRise = index.changePercent > 0;
  const isFall = index.changePercent < 0;
  
  const colorClass = isRise ? 'rise' : isFall ? 'fall' : 'flat';
  const textColorClass = isRise ? 'text-rise' : isFall ? 'text-fall' : 'text-flat';
  const sign = isRise ? '+' : '';

  return (
    <div className={`index-card ${colorClass}`}>
      <div className="text-sm text-gray-500 mb-1">{index.indexName}</div>
      <div className={`index-value ${textColorClass}`}>
        {index.currentPoint.toFixed(2)}
      </div>
      <div className="flex items-center space-x-3 mt-1">
        <span className={`text-sm ${textColorClass}`}>
          {sign}{index.changePoint.toFixed(2)}
        </span>
        <span className={`text-sm font-medium ${textColorClass}`}>
          {sign}{index.changePercent.toFixed(2)}%
        </span>
      </div>
    </div>
  );
};

interface IndexListProps {
  indices: MarketIndex[];
}

/**
 * 指数列表组件
 */
export const IndexList: React.FC<IndexListProps> = ({ indices }) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
      {indices.map((index) => (
        <IndexCard key={index.indexCode} index={index} />
      ))}
    </div>
  );
};
