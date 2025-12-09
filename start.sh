#!/bin/bash

echo "========================================"
echo "  每日热搜股票观察系统 - 启动脚本"
echo "========================================"
echo

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "[错误] 未找到 Node.js，请先安装 Node.js"
    exit 1
fi
echo "[OK] Node.js $(node -v)"

# 检查 MongoDB
if ! command -v mongod &> /dev/null; then
    echo "[警告] 未找到 MongoDB，请确保 MongoDB 服务已启动"
else
    echo "[OK] MongoDB 已安装"
fi

# 获取脚本所在目录
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# 安装依赖
echo
echo "[1/4] 安装后端依赖..."
cd "$SCRIPT_DIR/server"
if [ ! -d "node_modules" ]; then
    npm install
else
    echo "[OK] 后端依赖已安装"
fi

echo
echo "[2/4] 安装前端依赖..."
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

# 启动服务
echo
echo "[3/4] 启动后端服务 (端口 3000)..."
cd "$SCRIPT_DIR/server"
npm run dev &
SERVER_PID=$!

sleep 3

echo "[4/4] 启动前端服务 (端口 5173)..."
cd "$SCRIPT_DIR/client"
npm run dev &
CLIENT_PID=$!

echo
echo "========================================"
echo "  服务已启动!"
echo "  前端地址: http://localhost:5173"
echo "  后端地址: http://localhost:3000"
echo "========================================"
echo
echo "按 Ctrl+C 停止服务"

# 等待进程
wait $SERVER_PID $CLIENT_PID
