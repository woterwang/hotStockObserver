/**
 * 试盘类型定义
 */

// 试盘模式枚举
export enum TestPanPattern {
  UPPER_SHADOW = 'upper_shadow',     // 长上影线试盘
  LOWER_SHADOW = 'lower_shadow',     // 长下影线试盘
  WIDE_SHOCK = 'wide_shock',         // 宽幅震荡试盘
  LIMIT_UP_OPEN = 'limit_up_open',   // 涨停开板试盘
}

// 试盘模式中文名称映射
export const TestPanPatternNames: Record<TestPanPattern, string> = {
  [TestPanPattern.UPPER_SHADOW]: '长上影线试盘',
  [TestPanPattern.LOWER_SHADOW]: '长下影线试盘',
  [TestPanPattern.WIDE_SHOCK]: '宽幅震荡试盘',
  [TestPanPattern.LIMIT_UP_OPEN]: '涨停开板试盘',
};

// K线数据结构
export interface KlineData {
  date: string;           // YYYYMMDD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;         // 成交量（手）
  turnover: number;       // 成交额（元）
  preClose?: number;      // 前收盘价
  changePercent?: number; // 涨跌幅
  amplitude?: number;     // 振幅
  turnoverRate?: number;  // 换手率
}

// 试盘信号
export interface TestPanSignal {
  stockCode: string;
  stockName: string;
  date: string;                  // 试盘日期 YYYYMMDD
  pattern: TestPanPattern;       // 试盘模式
  patternName: string;           // 模式中文名
  
  // 关键数据
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnover: number;
  amplitude: number;             // 振幅 %
  changePercent: number;         // 涨跌幅 %
  turnoverRate: number;          // 换手率 %
  
  // 试盘特征值
  upperShadowRatio?: number;     // 上影线/实体 比值
  lowerShadowRatio?: number;     // 下影线/实体 比值
  volumeRatio?: number;          // 量比（相对前一日）
  
  // 突破确认
  breakoutConfirmed?: boolean;   // 是否突破成功
  breakoutDate?: string;         // 突破日期
  breakoutPrice?: number;        // 突破价格
}

// 试盘检测配置
export interface TestPanConfig {
  // 通用参数
  minStockPrice: number;         // 最低股价
  minTurnoverRate: number;       // 最低换手率 %
  maxTurnoverRate: number;       // 最高换手率 %
  minAmount: number;             // 最低成交额（元）
  
  // 长上影线参数
  upperShadowRatio: number;      // 上影线/实体最小比值
  upperHighBreakRatio: number;   // 冲高幅度（相对前高）
  upperCloseRange: number;       // 收盘涨跌幅绝对值上限
  upperVolumeRatio: number;      // 量比下限
  
  // 长下影线参数
  lowerShadowRatio: number;      // 下影线/实体最小比值
  lowerLowBreakRatio: number;    // 砸盘幅度（相对前低）
  lowerVolumeRatio: number;      // 量比下限
  
  // 宽幅震荡参数
  shockAmplitude: number;        // 最小振幅 %
  shockHighBreakRatio: number;   // 冲高幅度
  shockLowBreakRatio: number;    // 砸盘幅度
  shockVolumeRatio: number;      // 量比下限
  shockCenterRange: number;      // 收盘偏离震荡中枢上限
  
  // 涨停开板参数
  limitUpMinChange: number;      // 最低涨幅（触及涨停后回落）
}

// 默认配置
export const DEFAULT_TEST_PAN_CONFIG: TestPanConfig = {
  minStockPrice: 3,
  minTurnoverRate: 3,
  maxTurnoverRate: 25,
  minAmount: 500000000,          // 5亿
  
  upperShadowRatio: 2,
  upperHighBreakRatio: 1.03,
  upperCloseRange: 0.02,
  upperVolumeRatio: 1.3,
  
  lowerShadowRatio: 2,
  lowerLowBreakRatio: 0.97,
  lowerVolumeRatio: 1.2,
  
  shockAmplitude: 8,
  shockHighBreakRatio: 1.03,
  shockLowBreakRatio: 0.97,
  shockVolumeRatio: 1.5,
  shockCenterRange: 0.03,
  
  limitUpMinChange: 5,
};

// 入场方式枚举
export enum EntryMode {
  BREAKOUT_CLOSE = 'breakout_close',       // 突破日收盘价买入（原策略）
  NEXT_DAY_LOW = 'next_day_low',           // 突破次日低开买入
  PULLBACK_HIGH = 'pullback_high',         // 回踩试盘高点买入
}

// 止损方式枚举
export enum StopLossMode {
  FIXED_RATIO = 'fixed_ratio',             // 固定比例止损
  TEST_PAN_LOW = 'test_pan_low',           // 试盘日最低价止损
}

// 回测配置（优化版）
export interface TestPanBacktestConfig {
  holdDays: number;              // 持有天数
  breakoutDays: number;          // 突破确认天数
  stopLossRatio: number;         // 止损比例（负数，如 -0.07）
  takeProfitRatio?: number;      // 止盈比例（可选）
  
  // 🆕 优化参数
  entryMode: EntryMode;          // 入场方式
  stopLossMode: StopLossMode;    // 止损方式
  trailingStopTrigger?: number;  // 移动止盈触发点（如 0.05 表示盈利5%后启动）
  trailingStopToBreakeven?: boolean; // 触发后是否移动止损到成本价
  
  // 🆕 过滤条件
  minMarketMood?: number;        // 最低大盘情绪（strong字段）
  requireAboveMA5?: boolean;     // 是否要求站上5日均线
  maxRecentGain?: number;        // 最大近期涨幅（排除追高，如 0.3 表示30%）
  minAmount?: number;            // 最低成交额（覆盖默认值）
}

// 默认回测配置
export const DEFAULT_BACKTEST_CONFIG: TestPanBacktestConfig = {
  holdDays: 5,
  breakoutDays: 5,
  stopLossRatio: -0.07,
  entryMode: EntryMode.BREAKOUT_CLOSE,
  stopLossMode: StopLossMode.FIXED_RATIO,
};

// 优化版回测配置
export const OPTIMIZED_BACKTEST_CONFIG: TestPanBacktestConfig = {
  holdDays: 5,
  breakoutDays: 5,
  stopLossRatio: -0.07,                    // 备用固定止损（防止极端情况）
  entryMode: EntryMode.NEXT_DAY_LOW,       // 次日低开买入
  stopLossMode: StopLossMode.TEST_PAN_LOW, // 试盘日最低价止损
  trailingStopTrigger: 0.05,               // 盈利5%后启动移动止盈
  trailingStopToBreakeven: true,           // 移动止损到成本价
  minMarketMood: 50,                       // 大盘情绪 > 50
  requireAboveMA5: true,                   // 要求站上5日均线
  maxRecentGain: 0.30,                     // 排除近期涨幅超30%的
  minAmount: 800000000,                    // 成交额 > 8亿
};

// 单笔交易记录
export interface TestPanTradeRecord {
  stockCode: string;
  stockName: string;
  pattern: TestPanPattern;
  patternName: string;
  
  testPanDate: string;           // 试盘日
  breakoutDate: string;          // 突破日（入场日）
  entryPrice: number;            // 入场价
  exitDate: string;              // 出场日
  exitPrice: number;             // 出场价
  holdDays: number;              // 持有天数
  returnRate: number;            // 收益率
  exitReason: 'stop_loss' | 'take_profit' | 'max_days' | 'data_end';
}

// 回测结果
export interface TestPanBacktestResult {
  pattern: TestPanPattern;
  patternName: string;
  startDate: string;
  endDate: string;
  config: TestPanBacktestConfig;
  
  // 统计
  totalSignals: number;          // 总信号数
  breakoutCount: number;         // 突破成功数
  breakoutRate: number;          // 突破率
  totalTrades: number;           // 总交易数
  winTrades: number;             // 盈利次数
  lossTrades: number;            // 亏损次数
  winRate: number;               // 胜率
  
  // 收益
  totalReturn: number;           // 总收益率
  avgReturn: number;             // 平均收益率
  avgWinReturn: number;          // 平均盈利
  avgLossReturn: number;         // 平均亏损
  maxReturn: number;             // 最大单笔盈利
  maxLoss: number;               // 最大单笔亏损
  profitLossRatio: number;       // 盈亏比
  
  // 明细
  trades: TestPanTradeRecord[];
}

// 每日试盘信号存储结构
export interface DailyTestPanSignals {
  date: string;
  updateTime: string;
  signals: TestPanSignal[];
}

// 问财候选股
export interface WencaiCandidate {
  stockCode: string;
  stockName: string;
  changePercent?: number;
  amplitude?: number;
  turnoverRate?: number;
  amount?: number;
}
