import React from 'react';
import type { CSSProperties } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsOption } from 'echarts';

echarts.use([LineChart, BarChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

interface ChartProps {
  option: EChartsOption;
  style?: CSSProperties;
  className?: string;
  notMerge?: boolean;
  lazyUpdate?: boolean;
}

const Chart: React.FC<ChartProps> = ({ option, style, className, notMerge, lazyUpdate }) => {
  return (
    <ReactEChartsCore
      echarts={echarts}
      option={option}
      style={style}
      className={className}
      notMerge={notMerge}
      lazyUpdate={lazyUpdate}
    />
  );
};

export default Chart;