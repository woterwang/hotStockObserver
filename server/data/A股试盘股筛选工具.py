import akshare as ak
import pandas as pd
import tkinter as tk
from tkinter import ttk, messagebox
from datetime import datetime
import os

# 全局变量：存储筛选结果
result_df = pd.DataFrame()

def get_stock_data():
    """获取A股当日收盘数据（自动过滤无效数据）"""
    try:
        # 获取A股全市场当日数据
        stock_zh_a_df = ak.stock_zh_a_spot_em()
        # 数据预处理
        df = stock_zh_a_df.copy()
        # 保留核心字段
        core_columns = [
            '代码', '名称', '最新价', '涨跌幅', '成交量', '成交额', '换手率',
            '开盘价', '最高价', '最低价', '昨收价'
        ]
        df = df[core_columns].dropna()
        
        # 数据类型转换
        df['最新价'] = pd.to_numeric(df['最新价'], errors='coerce')
        df['涨跌幅'] = pd.to_numeric(df['涨跌幅'], errors='coerce')
        df['成交量'] = pd.to_numeric(df['成交量'], errors='coerce')
        df['成交额'] = pd.to_numeric(df['成交额'], errors='coerce')
        df['换手率'] = pd.to_numeric(df['换手率'], errors='coerce')
        df['开盘价'] = pd.to_numeric(df['开盘价'], errors='coerce')
        df['最高价'] = pd.to_numeric(df['最高价'], errors='coerce')
        df['最低价'] = pd.to_numeric(df['最低价'], errors='coerce')
        df['昨收价'] = pd.to_numeric(df['昨收价'], errors='coerce')
        
        # 剔除无效数据（价格为0、成交额为0）
        df = df[(df['最新价'] > 0) & (df['成交额'] > 0)]
        
        return df
    except Exception as e:
        messagebox.showerror("数据获取失败", f"获取A股数据时出错：{str(e)}")
        return pd.DataFrame()

def filter_base_pool(df):
    """基础池过滤：排除ST、低流动性、次新股等"""
    if df.empty:
        return pd.DataFrame()
    
    try:
        # 1. 排除ST股（名称包含ST、*ST）
        df = df[~df['名称'].str.contains('ST|*ST', na=False)]
        
        # 2. 成交额 > 5亿元（转换单位：万元→亿元，成交额字段单位是万元）
        df = df[df['成交额'] >= 50000]
        
        # 3. 换手率 3% ~ 25%
        df = df[(df['换手率'] >= 3) & (df['换手率'] <= 25)]
        
        # 4. 涨跌幅 -7% ~ +7%
        df = df[(df['涨跌幅'] >= -7) & (df['涨跌幅'] <= 7)]
        
        # 5. 排除上市不足180天的次新股（akshare免费数据暂无法直接获取上市日期，暂注释，可通过付费接口补充）
        # 若需精确筛选，可对接tushare付费接口获取上市日期
        
        return df
    except Exception as e:
        messagebox.showerror("基础过滤失败", f"过滤基础池时出错：{str(e)}")
        return pd.DataFrame()

def judge_limit_up_multiple(code):
    """根据股票代码判断涨停倍率"""
    if code.startswith(('60', '00')):
        return 1.1  # 主板10%
    elif code.startswith(('300', '688')):
        return 1.2  # 创业板、科创板20%
    elif code.startswith('920'):
        return 1.3  # 北交所30%
    else:
        return 1.1

def screen_test_stock(df):
    """筛选符合试盘特征的股票"""
    if df.empty:
        return pd.DataFrame()
    
    try:
        # 复制数据框，避免修改原数据
        df_screen = df.copy()
        # 初始化试盘类型列
        df_screen['试盘类型'] = ''
        
        # ---------------------- 1. 长上影线试盘 ----------------------
        # 计算上影线长度和K线实体
        df_screen['上影线长度'] = df_screen['最高价'] - df_screen[['开盘价', '最新价']].max(axis=1)
        df_screen['K线实体'] = df_screen[['开盘价', '最新价']].max(axis=1) - df_screen[['开盘价', '最新价']].min(axis=1)
        # 避免除零错误
        df_screen['K线实体'] = df_screen['K线实体'].replace(0, 0.001)
        # 长上影条件
        upper_shadow_cond1 = (df_screen['上影线长度'] / df_screen['K线实体']) > 2
        upper_shadow_cond2 = df_screen['K线实体'] > 0.01 * df_screen['最新价']  # 实体不为一字线
        upper_shadow_cond3 = df_screen['最高价'] > df_screen['昨收价'] * 1.03  # 冲高3%以上
        upper_shadow_cond4 = (abs(df_screen['最新价'] - df_screen['昨收价']) / df_screen['昨收价']) < 0.02  # 回落企稳
        # 量能条件：当日成交量 > 昨日成交量1.3倍（akshare免费数据无昨日成交量，用换手率替代：换手率>昨日1.3倍，暂简化为换手率>=3%已过滤）
        upper_shadow_cond5 = df_screen['换手率'] >= 3  # 简化量能条件，精确版需对接历史数据
        
        # 标记长上影试盘
        upper_shadow_mask = upper_shadow_cond1 & upper_shadow_cond2 & upper_shadow_cond3 & upper_shadow_cond4 & upper_shadow_cond5
        df_screen.loc[upper_shadow_mask, '试盘类型'] += '长上影线试盘、'
        
        # ---------------------- 2. 长下影线试盘 ----------------------
        # 计算下影线长度
        df_screen['下影线长度'] = df_screen[['开盘价', '最新价']].min(axis=1) - df_screen['最低价']
        # 长下影条件
        lower_shadow_cond1 = (df_screen['下影线长度'] / df_screen['K线实体']) > 2
        lower_shadow_cond2 = df_screen['最低价'] < df_screen['昨收价'] * 0.97  # 砸盘3%以上
        lower_shadow_cond3 = df_screen['最新价'] > df_screen[['开盘价', '最新价']].max(axis=1) * 0.95  # 快速拉回
        lower_shadow_cond4 = df_screen['换手率'] >= 3  # 简化量能条件
        
        # 标记长下影试盘
        lower_shadow_mask = lower_shadow_cond1 & lower_shadow_cond2 & lower_shadow_cond3 & lower_shadow_cond4
        df_screen.loc[lower_shadow_mask, '试盘类型'] += '长下影线试盘、'
        
        # ---------------------- 3. 宽幅震荡试盘 ----------------------
        # 计算振幅
        df_screen['振幅'] = (df_screen['最高价'] - df_screen['最低价']) / df_screen['昨收价'] * 100
        # 宽幅震荡条件
        shock_cond1 = df_screen['振幅'] > 8  # 振幅>8%
        shock_cond2 = (df_screen['最高价'] > df_screen['昨收价'] * 1.03) & (df_screen['最低价'] < df_screen['昨收价'] * 0.97)
        shock_cond3 = abs(df_screen['最新价'] - (df_screen['最高价'] + df_screen['最低价']) / 2) / ((df_screen['最高价'] + df_screen['最低价']) / 2) < 0.03
        shock_cond4 = df_screen['换手率'] >= 5  # 简化量能条件（震荡需更大成交量）
        
        # 标记宽幅震荡试盘
        shock_mask = shock_cond1 & shock_cond2 & shock_cond3 & shock_cond4
        df_screen.loc[shock_mask, '试盘类型'] += '宽幅震荡试盘、'
        
        # ---------------------- 4. 涨停试盘（开板未封死） ----------------------
        # 计算涨停价
        df_screen['涨停倍率'] = df_screen['代码'].apply(judge_limit_up_multiple)
        df_screen['涨停价'] = df_screen['昨收价'] * df_screen['涨停倍率']
        # 涨停试盘条件
        limit_up_cond1 = df_screen['最高价'] >= df_screen['涨停价']  # 触及涨停
        limit_up_cond2 = df_screen['最新价'] < df_screen['涨停价']  # 未封死涨停
        limit_up_cond3 = df_screen['换手率'] >= 5  # 简化量能条件
        
        # 标记涨停试盘
        limit_up_mask = limit_up_cond1 & limit_up_cond2 & limit_up_cond3
        df_screen.loc[limit_up_mask, '试盘类型'] += '涨停试盘、'
        
        # ---------------------- 5. 整理结果 ----------------------
        # 过滤出有试盘类型的股票
        df_result = df_screen[df_screen['试盘类型'] != ''].copy()
        # 去除试盘类型末尾的顿号
        df_result['试盘类型'] = df_result['试盘类型'].str.rstrip('、')
        # 保留核心列
        result_columns = ['代码', '名称', '最新价', '涨跌幅', '换手率', '成交额', '试盘类型']
        df_result = df_result[result_columns].reset_index(drop=True)
        
        return df_result
    except Exception as e:
        messagebox.showerror("筛选失败", f"筛选试盘股时出错：{str(e)}")
        return pd.DataFrame()

def run_screening():
    """执行筛选（按钮点击事件）"""
    global result_df
    # 1. 获取数据
    messagebox.showinfo("提示", "开始获取A股数据，请稍候（网络较慢时可能需要1-2分钟）")
    stock_df = get_stock_data()
    if stock_df.empty:
        return
    
    # 2. 基础过滤
    base_df = filter_base_pool(stock_df)
    if base_df.empty:
        messagebox.showwarning("提示", "基础池过滤后无有效数据")
        return
    
    # 3. 试盘股筛选
    result_df = screen_test_stock(base_df)
    
    # 4. 显示结果
    show_result()
    
    # 5. 提示完成
    if not result_df.empty:
        messagebox.showinfo("筛选完成", f"共筛选出 {len(result_df)} 只疑似试盘股")
    else:
        messagebox.showwarning("筛选结果", "未筛选出符合条件的试盘股")

def show_result():
    """在界面显示筛选结果"""
    # 清空表格
    for item in tree.get_children():
        tree.delete(item)
    
    if result_df.empty:
        return
    
    # 添加数据到表格
    for index, row in result_df.iterrows():
        tree.insert('', tk.END, values=(
            row['代码'],
            row['名称'],
            round(row['最新价'], 2),
            round(row['涨跌幅'], 2),
            round(row['换手率'], 2),
            round(row['成交额']/10000, 2),  # 转换为亿元
            row['试盘类型']
        ))

def export_to_excel():
    """导出结果到Excel"""
    global result_df
    if result_df.empty:
        messagebox.showwarning("提示", "无筛选结果可导出")
        return
    
    try:
        # 生成文件名
        today = datetime.now().strftime("%Y%m%d")
        filename = f"A股试盘股筛选结果_{today}.xlsx"
        # 保存到桌面
        desktop_path = os.path.join(os.path.expanduser("~"), "Desktop")
        file_path = os.path.join(desktop_path, filename)
        
        # 导出Excel
        result_df.to_excel(file_path, index=False, engine='openpyxl')
        
        messagebox.showinfo("导出成功", f"筛选结果已导出到桌面：\n{filename}")
    except Exception as e:
        messagebox.showerror("导出失败", f"导出Excel时出错：{str(e)}")

# ---------------------- 构建可视化界面 ----------------------
if __name__ == "__main__":
    # 创建主窗口
    root = tk.Tk()
    root.title("A股试盘股筛选工具")
    root.geometry("1200x600")
    
    # 创建按钮框架
    btn_frame = ttk.Frame(root, padding=10)
    btn_frame.pack(fill=tk.X)
    
    # 筛选按钮
    screen_btn = ttk.Button(btn_frame, text="开始筛选试盘股", command=run_screening)
    screen_btn.pack(side=tk.LEFT, padx=5)
    
    # 导出按钮
    export_btn = ttk.Button(btn_frame, text="导出结果到Excel", command=export_to_excel)
    export_btn.pack(side=tk.LEFT, padx=5)
    
    # 创建表格框架
    table_frame = ttk.Frame(root, padding=10)
    table_frame.pack(fill=tk.BOTH, expand=True)
    
    # 定义表格列
    columns = ('代码', '名称', '最新价', '涨跌幅(%)', '换手率(%)', '成交额(亿元)', '试盘类型')
    tree = ttk.Treeview(table_frame, columns=columns, show='headings')
    
    # 设置列标题和宽度
    tree.heading('代码', text='股票代码')
    tree.heading('名称', text='股票名称')
    tree.heading('最新价', text='最新价')
    tree.heading('涨跌幅(%)', text='涨跌幅(%)')
    tree.heading('换手率(%)', text='换手率(%)')
    tree.heading('成交额(亿元)', text='成交额(亿元)')
    tree.heading('试盘类型', text='试盘类型')
    
    tree.column('代码', width=80)
    tree.column('名称', width=100)
    tree.column('最新价', width=80)
    tree.column('涨跌幅(%)', width=100)
    tree.column('换手率(%)', width=100)
    tree.column('成交额(亿元)', width=120)
    tree.column('试盘类型', width=200)
    
    # 添加滚动条
    scrollbar = ttk.Scrollbar(table_frame, orient=tk.VERTICAL, command=tree.yview)
    tree.configure(yscrollcommand=scrollbar.set)
    
    tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
    scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
    
    # 运行主循环
    root.mainloop()