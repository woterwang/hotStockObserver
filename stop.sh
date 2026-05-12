#!/bin/bash

set -euo pipefail

echo "========================================"
echo "  每日热搜股票观察系统 - 生产停止脚本"
echo "========================================"
echo

if ! command -v pm2 &> /dev/null; then
    echo "[错误] 未找到 PM2，请先执行: npm install -g pm2"
    exit 1
fi

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "[1/2] 停止 PM2 服务..."
cd "$SCRIPT_DIR"

if pm2 describe hot-stock-observer > /dev/null 2>&1; then
    pm2 delete hot-stock-observer
else
    echo "[OK] 未发现运行中的 hot-stock-observer 进程"
fi

echo
echo "[2/2] 保存 PM2 进程列表..."
pm2 save
pm2 status

echo
echo "========================================"
echo "  服务已停止!"
echo "========================================"