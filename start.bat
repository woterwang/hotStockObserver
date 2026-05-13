@echo off
echo ========================================
echo   每日热搜股票观察系统 - 生产启动脚本
echo ========================================
echo.

:: 检查 Node.js
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [错误] 未找到 Node.js，请先安装 Node.js
    pause
    exit /b 1
)

:: 检查 PM2
where pm2 >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [错误] 未找到 PM2，请先执行 npm install -g pm2
    pause
    exit /b 1
)

:: 检查 MongoDB
echo [1/6] 检查 MongoDB...
mongod --version >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [警告] 未找到 MongoDB，请确保 MongoDB 服务已启动
) else (
    echo [OK] MongoDB 已安装
)

:: 安装依赖
echo.
echo [2/6] 安装后端依赖...
cd server
if not exist node_modules (
    call npm install
) else (
    echo [OK] 后端依赖已安装
)

echo.
echo [3/6] 安装前端依赖...
cd ../client
if not exist node_modules (
    call npm install
) else (
    echo [OK] 前端依赖已安装
)

:: 配置环境变量
cd ../server
if not exist .env (
    copy .env.example .env
    echo [OK] 已创建 .env 配置文件
)

if not exist logs mkdir logs

echo.
echo [4/6] 构建前端...
cd ../client
call npm run build
if %ERRORLEVEL% neq 0 exit /b 1

echo.
echo [5/6] 构建后端...
cd ../server
call npm run build
if %ERRORLEVEL% neq 0 exit /b 1

:: 启动服务
echo.
echo [6/6] 启动 PM2 服务...
cd /d %~dp0
call pm2 start ecosystem.config.js --update-env
call pm2 save
call pm2 status

echo.
echo ========================================
echo   服务已启动!
echo   访问入口: http://localhost:3000
echo   健康检查: http://localhost:3000/api/health
echo ========================================
echo.
echo 停止服务请执行: pm2 delete hot-stock-observer
pause >nul
