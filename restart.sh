#!/bin/bash
###
 # @Author: hp.com
 # @Date: 2026-01-17 20:07:18
 # @LastEditors: WRG
 # @LastEditTime: 2026-04-28 08:42:38
 # @😍: 😃😃
### 

echo "=== 重启 start.sh 脚本 ==="
# 获取当前脚本所在目录
SCRIPT_DIR=$(dirname "$(readlink -f "$0")")
# 查找 3000 与 80 端口的进程并杀死它们
echo "正在查找并杀死占用 3000 和 80 端口的进程..."
PORTS=(3000 80)
for PORT in "${PORTS[@]}"; do
    PIDS=$(lsof -t -i:"$PORT")
    if [ -n "$PIDS" ]; then
        echo "找到占用端口 $PORT 的进程: $PIDS"
        kill -9 $PIDS
        echo "已杀死占用端口 $PORT 的进程: $PIDS"
    else
        echo "没有找到占用端口 $PORT 的进程"
    fi
done
# 进入脚本所在目录
cd "$SCRIPT_DIR"
# 启动 start.sh 脚本 并 将输出重定向到 ${日期}.log 文件
LOG_FILE="${SCRIPT_DIR}/$(date +%Y-%m-%d).log"
echo "正在启动 start.sh 脚本，日志将输出到 $LOG_FILE..."
nohup bash start.sh > "$LOG_FILE" 2>&1 &
# 输出 start.sh 脚本的 PID
echo "start.sh 脚本已启动，PID: $!"
# 开始检查 mongodb 进程
echo "正在检查 mongodb 进程..."
# 检查 mongodb 进程是否存在，如果不存在则启动它
if ! pgrep -x "mongod" > /dev/null; then
    echo "mongodb 进程未找到，正在启动 mongodb..."
    # mongod --dbpath /data/db --logpath /data/log/mongodb.log --fork
    mongo-manage status
    echo "mongodb 已启动"
else
    echo "mongodb 进程已存在，跳过启动"
fi
echo "=== 重启 start.sh 脚本 完成 ==="