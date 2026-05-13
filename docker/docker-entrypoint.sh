#!/bin/bash

set -euo pipefail

cd /app

echo "========================================"
echo "  Hot Stock Observer Docker Entrypoint"
echo "========================================"
echo "NODE_ENV=${NODE_ENV:-production}"
echo "PORT=${PORT:-3000}"

if [[ "${START_MONGODB:-false}" == "true" ]]; then
    if command -v mongod > /dev/null 2>&1; then
        mkdir -p "${MONGO_DB_PATH:-/data/db}"
        mkdir -p "$(dirname "${MONGO_LOG_PATH:-/var/log/mongodb/mongod.log}")"

        if ! pgrep -x mongod > /dev/null 2>&1; then
            echo "[entrypoint] 启动容器内 MongoDB..."
            mongod \
                --bind_ip 127.0.0.1 \
                --dbpath "${MONGO_DB_PATH:-/data/db}" \
                --logpath "${MONGO_LOG_PATH:-/var/log/mongodb/mongod.log}" \
                --fork
        else
            echo "[entrypoint] MongoDB 已在运行，跳过启动"
        fi
    else
        echo "[entrypoint] START_MONGODB=true，但镜像中未找到 mongod 命令"
        exit 1
    fi
fi

mkdir -p /app/server/logs

echo "[entrypoint] 启动 PM2 Runtime..."
exec pm2-runtime start ecosystem.config.js --env production
