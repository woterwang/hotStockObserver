import akshare as ak
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import warnings
import time
import random
import traceback
warnings.filterwarnings("ignore")

# ===================== 配置参数 =====================
BACKTEST_YEARS = 2                # 回测最近几年
HOLD_DAYS = 5                     # 持有天数
BREAKOUT_DAYS = 5                 # 多少天内突破算成功
STOP_LOSS_RATIO = -0.07           # 止损比例
MIN_STOCK_PRICE = 3               # 最低股价过滤
MIN_TURNOVER_RATIO = 3            # 最低换手率
MAX_TURNOVER_RATIO = 25           # 最高换手率
MIN_AMOUNT = 500000000            # 最低成交额 5 亿

# ===================== 工具函数 =====================
def test_akshare_connection():
    """测试akshare连接是否正常"""
    try:
        print("正在测试akshare连接...")
        # 尝试获取少量数据进行测试
        stock_list = ak.stock_info_a_code_name()
        print(f"成功获取股票列表，共有 {len(stock_list)} 只股票")
        
        # 尝试获取一只股票的历史数据
        test_stock = stock_list.iloc[0]['code']
        print(f"正在测试获取股票 {test_stock} 的数据...")
        test_data = ak.stock_zh_a_hist(symbol=test_stock, period="daily", adjust="hfq", start_date="20230101", end_date="20230131")
        print(f"成功获取股票 {test_stock} 的 {len(test_data)} 条数据")
        return True
    except Exception as e:
        print(f"akshare连接测试失败: {str(e)}")
        traceback.print_exc()
        return False

def get_stock_list():
    """获取A股股票列表"""
    try:
        stock_info_df = ak.stock_info_a_code_name()
        # 过滤ST股，使用转义字符处理正则表达式特殊字符
        stock_info_df = stock_info_df[~stock_info_df['name'].str.contains(r'ST|\*ST', na=False)]
        return stock_info_df['code'].tolist()
    except Exception as e:
        print(f"获取股票列表失败: {str(e)}")
        traceback.print_exc()
        return []

def get_stock_data(code, max_retries=3):
    """获取单只股票后复权日线数据，带重试机制"""
    for attempt in range(max_retries):
        try:
            # 添加较长的随机延时，减少请求频率
            time.sleep(random.uniform(2.0, 4.0))  # 增加延时时间
            df = ak.stock_zh_a_hist(symbol=code, period="daily", adjust="hfq")
            if df.empty:
                print(f"警告: 股票{code}数据为空")
                return pd.DataFrame()
            df.columns = ['date', 'open', 'close', 'high', 'low', 'volume', 'amount']
            df['date'] = pd.to_datetime(df['date'])
            df = df.sort_values('date').reset_index(drop=True)
            return df
        except Exception as e:
            print(f"获取股票{code}数据失败 (尝试 {attempt+1}/{max_retries}): {str(e)}")
            if attempt == max_retries - 1:
                # 最后一次尝试仍然失败，返回空DataFrame
                return pd.DataFrame()
            # 等待更长时间再重试
            time.sleep(3 * (attempt + 1))  # 更长的退避时间
    return pd.DataFrame()

def judge_limit_up_multiple(code):
    """判断涨停倍率"""
    if code.startswith(('60', '00')):
        return 1.1
    elif code.startswith(('300', '688')):
        return 1.2
    elif code.startswith('920'):
        return 1.3
    else:
        return 1.1

# ===================== 试盘识别函数 =====================
def detect_test_patterns(df):
    """识别所有试盘模式"""
    if df.empty or len(df) < 120:
        return df
    
    df = df.copy()
    
    # 基础计算
    df['prev_close'] = df['close'].shift(1)
    df['prev_high'] = df['high'].shift(1)
    df['prev_low'] = df['low'].shift(1)
    df['volume_prev'] = df['volume'].shift(1)
    df['turnover_ratio'] = (df['volume'] / df['volume'].rolling(60).mean()) * 100  # 相对换手率
    
    # 排除无效数据
    df = df.dropna()
    
    # 计算K线基础指标（上影线、下影线、实体）
    df['body'] = abs(df['open'] - df['close'])  # K线实体长度
    df['upper_shadow'] = df['high'] - df[['open', 'close']].max(axis=1)  # 上影线长度
    df['lower_shadow'] = df[['open', 'close']].min(axis=1) - df['low']  # 下影线长度
    
    # 1. 长上影线试盘
    df['is_upper_shadow_test'] = (
        (df['upper_shadow'] / (df['body'] + 1e-10) > 2) &  # 上影线长度>实体2倍（防止除零错误）
        (df['body'] > 0.01 * df['close']) &  # 实体不为一字线
        (df['high'] > df['prev_high'] * 1.03) &  # 冲高≥3%
        (abs(df['close'] - df['prev_close']) / (df['prev_close'] + 1e-10) < 0.02) &  # 回落企稳（涨跌幅≤2%）(防止除零错误)
        (df['volume'] > df['volume_prev'] * 1.3) &  # 放量≥30%
        (df['turnover_ratio'] >= MIN_TURNOVER_RATIO) &  # 换手率达标
        (df['amount'] >= MIN_AMOUNT)  # 成交额达标
    )
    
    # 2. 长下影线试盘
    df['is_lower_shadow_test'] = (
        (df['lower_shadow'] / (df['body'] + 1e-10) > 2) &  # 下影线长度>实体2倍（防止除零错误）
        (df['body'] > 0.01 * df['close']) &  # 实体不为一字线
        (df['low'] < df['prev_low'] * 0.97) &  # 砸盘≥3%
        (df['close'] > df[['open', 'close']].max(axis=1) * 0.95) &  # 快速拉回（收盘价接近实体顶部）
        (df['volume'] > df['volume_prev'] * 1.2) &  # 放量≥20%
        (df['turnover_ratio'] >= MIN_TURNOVER_RATIO) &  # 换手率达标
        (df['amount'] >= MIN_AMOUNT)  # 成交额达标
    )
    
    # 3. 宽幅震荡试盘
    df['amplitude'] = (df['high'] - df['low']) / (df['prev_close'] + 1e-10)  # 振幅（防止除零错误）
    df['is_shock_test'] = (
        (df['amplitude'] > 0.08) &  # 振幅≥8%
        (df['high'] > df['prev_high'] * 1.03) &  # 冲高≥3%
        (df['low'] < df['prev_low'] * 0.97) &  # 砸盘≥3%
        (abs(df['close'] - (df['high'] + df['low']) / 2) / ((df['high'] + df['low']) / 2 + 1e-10) < 0.03) &  # 收盘在震荡中枢附近
        (df['volume'] > df['volume_prev'] * 1.5) &  # 放量≥50%
        (df['turnover_ratio'] >= MIN_TURNOVER_RATIO) &  # 换手率达标
        (df['amount'] >= MIN_AMOUNT)  # 成交额达标
    )
    
    # 4. 涨停试盘（开板未封死）- 暂时简化实现
    df['is_limit_up_test'] = False  # 暂时禁用此条件，避免复杂判断逻辑

    return df

# ===================== 回测函数 =====================
def backtest_strategy(df, pattern_col):
    """回测单个试盘模式"""
    df = df.copy()
    results = []
    
    test_dates = df[df[pattern_col]].index.tolist()
    
    for date_idx in test_dates:
        if date_idx + BREAKOUT_DAYS >= len(df):
            continue
        
        test_row = df.iloc[date_idx]
        test_high = test_row['high']
        test_low = test_row['low']
        entry_price = test_row['close']
        
        # 检查未来 BREAKOUT_DAYS 天是否突破试盘高点
        if date_idx+1 >= len(df) or date_idx+1+BREAKOUT_DAYS > len(df):
            continue
        
        breakout_window = df.iloc[date_idx+1 : date_idx+1+BREAKOUT_DAYS]
        if breakout_window.empty:
            continue
            
        has_breakout = (breakout_window['high'] >= test_high).any()
        
        if not has_breakout:
            continue
        
        # 找到突破日
        breakout_day_indices = breakout_window[breakout_window['high'] >= test_high].index
        if len(breakout_day_indices) == 0:
            continue
            
        breakout_day = breakout_day_indices.min()
        if pd.isna(breakout_day):
            continue
        
        # 开仓价 = 突破日的收盘价
        entry_idx = breakout_day
        if entry_idx + HOLD_DAYS >= len(df):
            continue
        
        entry_price = df.iloc[entry_idx]['close']
        
        # 持有 HOLD_DAYS 天，或止损
        if entry_idx + 1 + HOLD_DAYS <= len(df):
            hold_window = df.iloc[entry_idx+1 : entry_idx+1+HOLD_DAYS]
        else:
            hold_window = df.iloc[entry_idx+1:]
            
        if hold_window.empty:
            continue

        # 计算止损
        min_prices = hold_window['low'].values
        exit_price = entry_price  # 默认持有到期
        stopped_out = False

        for price in min_prices:
            if (price - entry_price) / entry_price <= STOP_LOSS_RATIO:
                exit_price = price * 0.99  # 略微低于止损价
                stopped_out = True
                break

        if not stopped_out and not hold_window.empty:
            exit_price = hold_window.iloc[-1]['close']

        return_rate = (exit_price - entry_price) / entry_price
        results.append(return_rate)
    
    if not results:
        return {
            'count': 0,
            'success_rate': 0,
            'avg_return': 0,
            'max_return': 0,
            'max_loss': 0,
            'std': 0
        }
    
    success_rate = len([r for r in results if r > 0]) / len(results) if len(results) > 0 else 0
    
    return {
        'count': len(results),
        'success_rate': success_rate,
        'avg_return': np.mean(results) if results else 0,
        'max_return': np.max(results) if results else 0,
        'max_loss': np.min(results) if results else 0,
        'std': np.std(results) if results else 0
    }

# ===================== 主函数 =====================
def main():
    # 首先测试连接
    if not test_akshare_connection():
        print("akshare连接测试失败，程序退出")
        return
    
    print("正在获取股票列表...")
    stock_list = get_stock_list()
    if not stock_list:
        print("获取股票列表失败，程序退出")
        return
    
    total_stocks = len(stock_list)
    print(f"共获取 {total_stocks} 只股票")
    
    results = {
        'upper_shadow': [],
        'lower_shadow': [],
        'shock': [],
        'limit_up': []
    }
    
    # 统计各种模式的发现次数
    pattern_counts = {
        'upper_shadow_found': 0,
        'lower_shadow_found': 0,
        'shock_found': 0,
        'limit_up_found': 0
    }
    
    processed_count = 0  # 计数器
    successful_fetches = 0  # 成功获取数据的股票数
    
    for i, code in enumerate(stock_list):
        if i % 50 == 0:
            print(f"进度: {i}/{total_stocks}")
            processed_count = i  # 更新计数器
            
        df = get_stock_data(code)
        if df.empty or len(df) < 120:
            continue
        
        successful_fetches += 1
        df = detect_test_patterns(df)
        if df.empty:
            continue

        # 检查是否包含试盘模式
        if 'is_upper_shadow_test' in df.columns:
            pattern_counts['upper_shadow_found'] += df['is_upper_shadow_test'].sum()
        if 'is_lower_shadow_test' in df.columns:
            pattern_counts['lower_shadow_found'] += df['is_lower_shadow_test'].sum()
        if 'is_shock_test' in df.columns:
            pattern_counts['shock_found'] += df['is_shock_test'].sum()
        if 'is_limit_up_test' in df.columns:
            pattern_counts['limit_up_found'] += df['is_limit_up_test'].sum()
        
        res1 = backtest_strategy(df, 'is_upper_shadow_test')
        res2 = backtest_strategy(df, 'is_lower_shadow_test')
        res3 = backtest_strategy(df, 'is_shock_test')
        res4 = backtest_strategy(df, 'is_limit_up_test')
        
        results['upper_shadow'].append(res1)
        results['lower_shadow'].append(res2)
        results['shock'].append(res3)
        results['limit_up'].append(res4)
    
    print(f"\n总共处理了 {processed_count} 只股票")
    print(f"成功获取数据的股票数: {successful_fetches}")
    print(f"\n总共发现的各类模式数量:")
    print(f"长上影线试盘: {pattern_counts['upper_shadow_found']}")
    print(f"长下影线试盘: {pattern_counts['lower_shadow_found']}")
    print(f"宽幅震荡试盘: {pattern_counts['shock_found']}")
    print(f"涨停试盘: {pattern_counts['limit_up_found']}")
    
    # 统计有效回测结果数量
    valid_results = {
        'upper_shadow': len([r for r in results['upper_shadow'] if r['count'] > 0]),
        'lower_shadow': len([r for r in results['lower_shadow'] if r['count'] > 0]),
        'shock': len([r for r in results['shock'] if r['count'] > 0]),
        'limit_up': len([r for r in results['limit_up'] if r['count'] > 0])
    }
    
    print(f"\n有回测结果的股票数量:")
    print(f"长上影线试盘: {valid_results['upper_shadow']}")
    print(f"长下影线试盘: {valid_results['lower_shadow']}")
    print(f"宽幅震荡试盘: {valid_results['shock']}")
    print(f"涨停试盘: {valid_results['limit_up']}")
    
    # 汇总结果
    def summarize(name):
        all_res = results[name]
        valid = [r for r in all_res if r['count'] > 0]
        if not valid:
            # 返回None而不是空的DataFrame，这样在final列表中就不会有空DataFrame
            return None

        df = pd.DataFrame(valid)
        return {
            '试盘类型': name,
            '总样本数': df['count'].sum(),
            '平均成功率': df['success_rate'].mean(),
            '平均收益': df['avg_return'].mean(),
            '最大收益': df['max_return'].max(),
            '最大亏损': df['max_loss'].min(),
            '收益标准差': df['std'].mean()
        }
    
    final = [
        summarize('upper_shadow'),
        summarize('lower_shadow'),
        summarize('shock'),
        summarize('limit_up')
    ]
    
    # 过滤掉None值
    final = [item for item in final if item is not None]
    
    if not final:
        print("没有找到任何有效的试盘模式结果")
        return
    
    final_df = pd.DataFrame(final)
    print(final_df)
    final_df.to_excel('试盘类型回测结果.xlsx', index=False)
    print("回测完成，结果已保存到 试盘类型回测结果.xlsx")

if __name__ == "__main__":
    main()