@echo off
echo ========================================
echo   每日热搜股票观察系统 - 启动脚本
echo ========================================
echo.

:: 检查 Node.js
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [错误] 未找到 Node.js，请先安装 Node.js
    pause
    exit /b 1
)

:: 检查 MongoDB
echo [1/4] 检查 MongoDB...
mongod --version >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [警告] 未找到 MongoDB，请确保 MongoDB 服务已启动
) else (
    echo [OK] MongoDB 已安装
)

:: 安装依赖
echo.
echo [2/4] 安装后端依赖...
cd server
if not exist node_modules (
    call npm install
) else (
    echo [OK] 后端依赖已安装
)

echo.
echo [3/4] 安装前端依赖...
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

:: 启动服务
echo.
echo [4/4] 启动服务...
echo.
echo 正在启动后端服务 (端口 3000)...
start "Hot Stock Server" cmd /k "cd /d %~dp0server && npm run dev"

timeout /t 3 /nobreak >nul

echo 正在启动前端服务 (端口 5173)...
start "Hot Stock Client" cmd /k "cd /d %~dp0client && npm run dev"

echo.
echo ========================================
echo   服务已启动!
echo   前端地址: http://localhost:5173
echo   后端地址: http://localhost:3000
echo ========================================
echo.
echo 按任意键打开浏览器...
pause >nul

start http://localhost:5173
