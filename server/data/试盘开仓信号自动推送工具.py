import akshare as ak
import pandas as pd
import numpy as np
import tkinter as tk
from tkinter import messagebox
import schedule
import time
from datetime import datetime, timedelta
import os
import warnings
warnings.filterwarnings("ignore")

# ===================== 核心配置参数（可根据需求调整）=====================
# 开仓信号判断参数
HOLD_DAYS = 5                  # 持有天数（用于回测验证，不影响开仓信号）
BREAKOUT_DAYS = 3              # 试盘后多少天内突破算成功（1-3天最佳）
STOP_LOSS_RATIO = -0.07        # 止损比例（跌破试盘低点7%止损）
STOP_PROFIT_RATIO = 0.15       # 止盈比例（默认15%，可自定义）
MIN_TURNOVER_RATIO = 3         # 最低换手率（3%，过滤低流动性）
MAX_TURNOVER_RATIO = 25        # 最高换手率（25%，过滤过度炒作）
MIN_AMOUNT = 500000000         # 最低成交额（5亿元，过滤小票）
MIN_STOCK_PRICE = 3            # 最低股价（3元，过滤低价垃圾股）

# 定时运行配置（每日收盘后16:30自动启动，可修改）
SCHEDULE_TIME = "16:30"

# 保存路径配置（默认保存到当前目录，如果在Docker环境中没有桌面）
CURRENT_PATH = os.getcwd()
LOG_PATH = os.path.join(CURRENT_PATH, "试盘开仓信号日志")
if not os.path.exists(LOG_PATH):
    os.makedirs(LOG_PATH)

# ===================== 基础工具函数 =====================
def write_log(content):
    """写入日志文件（便于追溯历史信号）"""
    today = datetime.now().strftime("%Y%m%d")
    log_file = os.path.join(LOG_PATH, f"开仓信号日志_{today}.txt")
    with open(log_file, 'a', encoding='utf-8') as f:
        time_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        f.write(f"[{time_str}] {content}\n")

def get_stock_list():
    """获取A股股票列表（过滤ST、北交所除外的有效标的）"""
    try:
        stock_info_df = ak.stock_info_a_code_name()
        # 过滤ST股（名称含ST/*ST）、保留主板/创业板/科创板/北交所
        stock_info_df = stock_info_df[~stock_info_df['name'].str.contains('ST|*ST', na=False)]
        stock_list = stock_info_df['code'].tolist()
        write_log(f"成功获取A股股票列表，共{len(stock_list)}只标的")
        return stock_info_df  # 返回整个DataFrame，包含代码和名称
    except Exception as e:
        error_msg = f"获取股票列表失败：{str(e)}"
        write_log(error_msg)
        print(error_msg)  # 替代messagebox，在Docker中不支持GUI
        return pd.DataFrame()

def get_single_stock_data(code):
    """获取单只股票日线数据（后复权，含历史量价）"""
    try:
        # 获取后复权日线数据（确保收益计算准确）
        df = ak.stock_zh_a_hist(symbol=code, period="daily", adjust="hfq")
        if df.empty:
            return pd.DataFrame()
        
        # 数据预处理：重命名列、转换日期格式、排序
        df.columns = ['date', 'open', 'close', 'high', 'low', 'volume', 'amount']
        df['date'] = pd.to_datetime(df['date'])
        df = df.sort_values('date').reset_index(drop=True)
        
        # 计算基础指标（用于试盘识别和开仓判断）
        df['prev_close'] = df['close'].shift(1)  # 昨日收盘价
        df['prev_high'] = df['high'].shift(1)    # 昨日最高价
        df['prev_low'] = df['low'].shift(1)      # 昨日最低价
        df['prev_volume'] = df['volume'].shift(1)# 昨日成交量
        df['turnover_ratio'] = (df['volume'] / df['volume'].rolling(60).mean()) * 100  # 相对换手率
        
        # 过滤无效数据（价格为0、成交量为0）
        df = df[(df['close'] > 0) & (df['volume'] > 0)].dropna()
        return df
    except Exception as e:
        write_log(f"获取股票{code}数据失败：{str(e)}")
        return pd.DataFrame()

def judge_limit_up_multiple(code):
    """根据股票代码动态判断涨停倍率（无需手动调整）"""
    if code.startswith(('60', '00')):
        return 1.1  # 沪市/深市主板：10%涨停
    elif code.startswith(('300', '688')):
        return 1.2  # 创业板/科创板：20%涨停
    elif code.startswith('920'):
        return 1.3  # 北交所：30%涨停
    else:
        return 1.1  # 默认主板倍率

# ===================== 试盘识别函数（沿用之前的核心逻辑）=====================
def detect_test_patterns(df, code):
    """识别单只股票的5种试盘类型，返回含试盘标记的数据框"""
    df = df.copy()
    if df.empty:
        return df
    
    # 计算K线基础指标（上影线、下影线、实体）
    df['body'] = abs(df['open'] - df['close'])  # K线实体长度
    df['upper_shadow'] = df['high'] - df[['open', 'close']].max(axis=1)  # 上影线长度
    df['lower_shadow'] = df[['open', 'close']].min(axis=1) - df['low']  # 下影线长度
    
    # 1. 长上影线试盘（冲高回落，测试抛压）
    df['is_upper_shadow_test'] = (
        (df['upper_shadow'] / df['body'] > 2) &  # 上影线长度>实体2倍
        (df['body'] > 0.01 * df['close']) &      # 实体不为一字线（避免假信号）
        (df['high'] > df['prev_high'] * 1.03) &  # 冲高≥3%
        (abs(df['close'] - df['prev_close']) / df['prev_close'] < 0.02) &  # 回落企稳（涨跌幅≤2%）
        (df['volume'] > df['prev_volume'] * 1.3) &  # 放量≥30%
        (df['turnover_ratio'] >= MIN_TURNOVER_RATIO) &  # 换手率达标
        (df['amount'] >= MIN_AMOUNT)  # 成交额达标
    )
    
    # 2. 长下影线试盘（砸盘回升，测试承接）
    df['is_lower_shadow_test'] = (
        (df['lower_shadow'] / df['body'] > 2) &  # 下影线长度>实体2倍
        (df['body'] > 0.01 * df['close']) &      # 实体不为一字线
        (df['low'] < df['prev_low'] * 0.97) &    # 砸盘≥3%
        (df['close'] > df[['open', 'close']].max(axis=1) * 0.95) &  # 快速拉回（收盘价接近实体顶部）
        (df['volume'] > df['prev_volume'] * 1.2) &  # 放量≥20%
        (df['turnover_ratio'] >= MIN_TURNOVER_RATIO) &
        (df['amount'] >= MIN_AMOUNT)
    )
    
    # 3. 宽幅震荡试盘（大幅波动，测试情绪）
    df['amplitude'] = (df['high'] - df['low']) / df['prev_close']  # 振幅
    df['is_shock_test'] = (
        (df['amplitude'] > 0.08) &  # 振幅≥8%
        (df['high'] > df['prev_high'] * 1.03) &  # 冲高≥3%
        (df['low']< df['prev_low'] * 0.97) &    # 砸盘≥3%
        (abs(df['close'] - (df['high'] + df['low']) / 2) / ((df['high'] + df['low']) / 2)< 0.03) &  # 收盘在震荡中枢附近
        (df['volume'] > df['prev_volume'] * 1.5) &  # 放量≥50%
        (df['turnover_ratio'] >= MIN_TURNOVER_RATIO) &
        (df['amount'] >= MIN_AMOUNT)
    )
    
    # 4. 假突破试盘（突破后回落，测试阻力）
    df['recent_high_60'] = df['high'].rolling(60).max().shift(1)  # 近60日前期高点
    df['is_false_break_test'] = (
        (df['high'] > df['recent_high_60']) &  # 突破近60日高点
        (df['close'] < df['recent_high_60']) &  # 收录未站稳突破位
        (df['body'] / df['prev_close'] < 0.02) &  # K线实体较小（≤2%）
        (df['volume'] > df['prev_volume'] * 1.3) &  # 放量≥30%
        (df['volume'] < df['prev_volume'] * 5) &  # 放量不过度（≤5倍，避免出货）
        (df['turnover_ratio'] >= MIN_TURNOVER_RATIO) &
        (df['amount'] >= MIN_AMOUNT)
    )
    
    # 5. 涨停试盘（开板未封死，测试封单）
    df['limit_up_price'] = df['prev_close'] * judge_limit_up_multiple(code)  # 动态涨停价
    df['is_limit_up_test'] = (
        (df['high'] >= df['limit_up_price']) &  # 触及涨停价
        (df['close'] < df['limit_up_price']) &  # 未封死涨停
        (df['volume'] > df['prev_volume'] * 2) &  # 放量≥100%
        (df['turnover_ratio'] >= MIN_TURNOVER_RATIO) &
        (df['amount'] >= MIN_AMOUNT)
    )
    
    # 标记试盘类型（多个试盘类型叠加时，优先标注最强类型）
    df['test_type'] = ''
    df.loc[df['is_limit_up_test'], 'test_type'] = '涨停试盘'
    df.loc[df['is_false_break_test'] & (df['test_type'] == ''), 'test_type'] = '假突破试盘'
    df.loc[df['is_shock_test'] & (df['test_type'] == ''), 'test_type'] = '宽幅震荡试盘'
    df.loc[df['is_lower_shadow_test'] & (df['test_type'] == ''), 'test_type'] = '长下影线试盘'
    df.loc[df['is_upper_shadow_test'] & (df['test_type'] == ''), 'test_type'] = '长上影线试盘'
    
    return df

# ===================== 试盘成功确认与开仓信号判断（核心功能）=====================
def confirm_test_success_and_get_open_signal(df, code, name):
    """确认试盘是否成功，并生成开仓信号（突破开仓/回踩开仓）"""
    df = df.copy()
    if df.empty or len(df) < BREAKOUT_DAYS + 1:
        return None
    
    # 筛选出有试盘标记的日期
    test_dates = df[df['test_type'] != ''].index.tolist()
    if not test_dates:
        return None
    
    # 取最近一次试盘（优先判断最新试盘的成功情况，时效性最强）
    latest_test_idx = test_dates[-1]
    test_row = df.iloc[latest_test_idx]
    test_type = test_row['test_type']
    test_high = test_row['high']  # 试盘高点（突破判断基准）
    test_low = test_row['low']    # 试盘低点（止损基准）
    test_close = test_row['close']  # 试盘收盘价（企稳判断基准）
    
    # 确认试盘后1-BREAKOUT_DAYS天是否满足"成功信号"
    confirm_window = df.iloc[latest_test_idx+1 : latest_test_idx+1+BREAKOUT_DAYS]
    if confirm_window.empty:
        return None
    
    # 成功信号1：企稳（未跌破试盘关键位置）
    if test_type in ['长上影线试盘', '假突破试盘']:
        stable_cond = (confirm_window['low'] >= test_close * 0.98)  # 不跌破试盘收盘价2%
    elif test_type in ['长下影线试盘', '涨停试盘']:
        stable_cond = (confirm_window['low'] >= test_low * 1.02)  # 不跌破试盘低点2%
    else:  # 宽幅震荡试盘
        stable_cond = (confirm_window['close'] >= (test_high + test_low) / 2)  # 回到震荡中枢上方
    has_stable = stable_cond.any()
    
    # 成功信号2：缩量（试盘后缩量30%以上，筹码锁定）
    test_volume = test_row['volume']
    shrink_cond = (confirm_window['volume'] < test_volume * 0.7)  # 缩量≥30%
    has_shrink = shrink_cond.any()
    
    # 成功信号3：突破（突破试盘高点，启动信号）
    breakout_cond = (confirm_window['high'] >= test_high)  # 突破试盘高点
    has_breakout = breakout_cond.any()
    
    # 试盘成功判断（三大信号缺一不可）
    if not (has_stable and has_shrink and has_breakout):
        write_log(f"股票{code}（{name}）-{test_type}：试盘未成功（企稳/缩量/突破信号不完整）")
        return None
    
    # 寻找突破日（第一个突破试盘高点的日期）
    breakout_idx = confirm_window[breakout_cond].index.min()
    breakout_row = df.iloc[breakout_idx]
    breakout_price = breakout_row['close']  # 突破日收盘价（开仓参考价）
    
    # 开仓类型判断（突破开仓/回踩开仓）
    open_type = ""
    # 回踩开仓（突破后1-2天缩量回踩，未跌破试盘高点）
    if breakout_idx + 2 < len(df):
        pullback_window = df.iloc[breakout_idx+1 : breakout_idx+3]
        pullback_cond1 = (pullback_window['volume'] < breakout_row['volume'] * 0.8)  # 缩量回踩
        pullback_cond2 = (pullback_window['low'] >= test_high * 0.99)  # 回踩未跌破试盘高点1%
        if pullback_cond1.any() and pullback_cond2.any():
            open_type = "回踩开仓"
            open_price = pullback_window[pullback_cond1 & pullback_cond2]['close'].min()  # 回踩最低收盘价（最优开仓价）
        else:
            open_type = "突破开仓"
            open_price = breakout_price
    else:
        open_type = "突破开仓"
        open_price = breakout_price
    
    # 计算止损价和止盈价
    stop_loss_price = round(test_low * 0.99, 2)  # 止损价（试盘低点下方1%）
    stop_profit_price = round(open_price * (1 + STOP_PROFIT_RATIO), 2)  # 止盈价
    
    # 生成开仓信号字典
    open_signal = {
        '股票代码': code,
        '股票名称': name,
        '试盘类型': test_type,
        '开仓类型': open_type,
        '试盘日期': test_row['date'].strftime("%Y-%m-%d"),
        '突破日期': breakout_row['date'].strftime("%Y-%m-%d"),
        '推荐开仓价': round(open_price, 2),
        '止损价': stop_loss_price,
        '止盈价': stop_profit_price,
        '试盘高点': round(test_high, 2),
        '试盘低点': round(test_low, 2)
    }
    
    write_log(f"股票{code}（{name}）-{test_type}：试盘成功，生成{open_type}信号（开仓价：{open_price}，止损价：{stop_loss_price}，止盈价：{stop_profit_price}）")
    return open_signal

# ===================== 主运行函数（每日筛选+信号推送）=====================
def main_run():
    """主运行函数：每日筛选可开仓试盘股，并推送信号"""
    today = datetime.now().strftime("%Y-%m-%d")
    write_log(f"===================== 今日（{today}）试盘开仓信号筛选开始 =====================")
    
    # 1. 获取A股股票列表
    stock_info_df = get_stock_list()
    if stock_info_df.empty:
        write_log("无有效股票列表，筛选终止")
        print("无有效股票列表，筛选终止")  # 替代messagebox
        return
    
    # 创建股票代码到名称的映射，避免重复网络请求
    code_to_name = dict(zip(stock_info_df['code'], stock_info_df['name']))
    
    # 2. 遍历股票，筛选开仓信号
    all_open_signals = []
    total_stocks = len(stock_info_df)
    # 为提高运行速度，先测试前1000只股票（可改为全部，即range(total_stocks)）
    for i in range(min(1000, total_stocks)):
        code = stock_info_df.iloc[i]['code']
        name = code_to_name.get(code, "未知名称")  # 从映射中获取名称
        
        # 进度提示（每50只股票提示一次）
        if i % 50 == 0:
            progress = f"当前进度：{i}/{min(1000, total_stocks)}只股票"
            write_log(progress)
            print(progress)
        
        # 获取单只股票数据
        stock_df = get_single_stock_data(code)
        if stock_df.empty:
            continue
        
        # 识别试盘类型
        stock_df = detect_test_patterns(stock_df, code)
        if (stock_df['test_type'] == '').all():
            continue
        
        # 确认试盘成功并获取开仓信号
        open_signal = confirm_test_success_and_get_open_signal(stock_df, code, name)
        if open_signal:
            all_open_signals.append(open_signal)
    
    # 3. 信号推送与保存
    if all_open_signals:
        # 转换为DataFrame，便于保存和查看
        signal_df = pd.DataFrame(all_open_signals)
        # 按"试盘类型"排序（涨停试盘优先，其次假突破试盘）
        type_order = {'涨停试盘': 0, '假突破试盘': 1, '宽幅震荡试盘': 2, '长下影线试盘': 3, '长上影线试盘': 4}
        signal_df['type_sort'] = signal_df['试盘类型'].map(type_order)
        signal_df = signal_df.sort_values('type_sort').drop('type_sort', axis=1).reset_index(drop=True)
        
        # 保存到当前目录Excel文件
        excel_filename = f"试盘开仓信号_{today}.xlsx"
        excel_path = os.path.join(CURRENT_PATH, excel_filename)
        signal_df.to_excel(excel_path, index=False, engine='openpyxl')
        
        # 控制台输出结果（替代弹窗）
        msg = f"今日（{today}）试盘开仓信号筛选完成！\n共筛选出 {len(signal_df)} 只可开仓标的\n文件已保存到：{excel_path}\n\n重点关注：\n"
        for idx, row in signal_df.head(3).iterrows():
            msg += f"- {row['股票名称']}（{row['股票代码']}）：{row['试盘类型']}，{row['开仓类型']}（开仓价：{row['推荐开仓价']}）\n"
        print(msg)
        
        # 写入日志
        write_log(f"筛选完成，共生成{len(signal_df)}只开仓信号标的，文件已保存到：{excel_path}")
        print(f"筛选完成！共{len(signal_df)}只可开仓标的，文件保存路径：{excel_path}")
    else:
        # 无开仓信号提示
        msg = f"今日（{today}）未筛选出符合条件的试盘开仓标的"
        print(msg)  # 替代messagebox
        write_log(msg)
        print(msg)
    
    write_log(f"===================== 今日（{today}）试盘开仓信号筛选结束 =====================\n")

# ===================== 定时运行配置（每日自动启动）=====================
def start_schedule():
    """启动定时任务，每日SCHEDULE_TIME自动运行筛选"""
    # 定时任务：每日指定时间运行
    schedule.every().day.at(SCHEDULE_TIME).do(main_run)
    write_log(f"定时任务已启动，每日{SCHEDULE_TIME}自动筛选试盘开仓信号")
    print(f"试盘开仓信号自动推送工具已启动！\n每日{SCHEDULE_TIME}将自动筛选并推送可开仓标的\n日志和结果文件将保存到当前目录")
    
    # 循环执行定时任务
    while True:
        schedule.run_pending()
        time.sleep(60)  # 每60秒检查一次任务

# ===================== 程序入口（启动工具）=====================
if __name__ == "__main__":
    # 两种启动方式：
    # 1. 直接运行（立即执行一次筛选）
    main_run()
    
    # 2. 启动定时任务（每日自动运行，注释上面的main_run()，启用下面的start_schedule()）
    # start_schedule()