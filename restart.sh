#!/bin/bash

echo "=== 重启 start.sh 脚本 ==="

# 查找并停止进程
PID=$(ps aux | grep "bash start.sh" | grep -v grep | awk '{print $2}')

if [ -n "$PID" ]; then
    echo "找到正在运行的进程 PID: $PID"
    echo "正在停止进程..."
    kill $PID
    sleep 3
    echo "进程已停止"
else
    echo "未找到正在运行的进程"
fi

# 备份旧日志
if [ -f "output.log" ]; then
    mv output.log output.log.$(date +%Y%m%d_%H%M%S)
    echo "已备份旧日志"
fi

# 重新启动
echo "正在重新启动脚本..."
nohup bash start.sh > output.log 2>&1 &

NEW_PID=$!
echo "新进程已启动，PID: $NEW_PID"
echo "查看日志: tail -f output.log"
echo "查看进程: ps aux | grep $NEW_PID"