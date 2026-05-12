#!/bin/bash
###
 # @Author: hp.com
 # @Date: 2026-04-29 18:39:13
 # @LastEditors: WRG
 # @LastEditTime: 2026-05-12 19:58:05
 # @😍: 😃😃
### 

set -euo pipefail

echo "========================================"
echo "  每日热搜股票观察系统 - 生产重启脚本"
echo "========================================"
echo

if ! command -v node &> /dev/null; then
    echo "[错误] 未找到 Node.js，请先安装 Node.js"
    exit 1
fi

if ! command -v pm2 &> /dev/null; then
    echo "[错误] 未找到 PM2，请先执行: npm install -g pm2"
    exit 1
fi

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PORT="${PORT:-8080}"

echo "[1/4] 检查 MongoDB..."
if ! command -v mongod &> /dev/null; then
    echo "[警告] 未找到 mongod 命令，请确认 MongoDB 已作为服务启动"
else
    echo "[OK] MongoDB 已安装"
fi

echo
echo "[2/4] 重新构建项目..."
cd "$SCRIPT_DIR"
npm run build

echo
echo "[3/4] 重启 PM2 服务..."
if pm2 describe hot-stock-observer > /dev/null 2>&1; then
    pm2 restart ecosystem.config.js --update-env
else
    pm2 start ecosystem.config.js --update-env
fi

echo
echo "[4/4] 保存 PM2 进程列表..."
pm2 save
pm2 status

echo
echo "========================================"
echo "  服务已重启!"
echo "  访问入口: http://localhost:${PORT}"
echo "  健康检查: http://localhost:${PORT}/api/health"
echo "========================================"