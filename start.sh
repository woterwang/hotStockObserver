#!/bin/bash

echo "========================================"
echo "  每日热搜股票观察系统 - 生产启动脚本"
echo "========================================"
echo

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "[错误] 未找到 Node.js，请先安装 Node.js"
    exit 1
fi
echo "[OK] Node.js $(node -v)"

# 检查 PM2
if ! command -v pm2 &> /dev/null; then
    echo "[错误] 未找到 PM2，请先执行: npm install -g pm2"
    exit 1
fi
echo "[OK] PM2 $(pm2 -v)"

PORT="${PORT:-8080}"

# 检查 MongoDB
if ! command -v mongod &> /dev/null; then
    echo "[警告] 未找到 mongod 命令，请确认 MongoDB 已作为服务启动"
else
    echo "[OK] MongoDB 已安装"
fi

# 获取脚本所在目录
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# 安装依赖
echo
echo "[1/6] 安装后端依赖..."
cd "$SCRIPT_DIR/server"
if [ ! -d "node_modules" ]; then
    npm install
else
    echo "[OK] 后端依赖已安装"
fi

echo
echo "[2/6] 安装前端依赖..."
cd "$SCRIPT_DIR/client"
if [ ! -d "node_modules" ]; then
    npm install
else
    echo "[OK] 前端依赖已安装"
fi

# 配置环境变量
cd "$SCRIPT_DIR/server"
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo "[OK] 已创建 .env 配置文件"
fi

mkdir -p "$SCRIPT_DIR/server/logs"

echo
echo "[3/6] 构建前端..."
cd "$SCRIPT_DIR/client"
npm run build

echo
echo "[4/6] 构建后端..."
cd "$SCRIPT_DIR/server"
npm run build

# 启动服务
echo
echo "[5/6] 启动 PM2 服务..."
cd "$SCRIPT_DIR"
pm2 start ecosystem.config.js --update-env

echo
echo "[6/6] 保存 PM2 进程列表..."
pm2 save

pm2 status

echo
echo "========================================"
echo "  服务已启动!"
echo "  访问入口: http://localhost:${PORT}"
echo "  健康检查: http://localhost:${PORT}/api/health"
echo "========================================"
echo
echo "停止服务请执行: pm2 delete hot-stock-observer"
