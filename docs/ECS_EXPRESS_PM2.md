# 阿里云 ECS 部署清单（Express + PM2，无 Nginx）

本文档适用于当前仓库的无 Nginx 部署方式：

- 先构建 client 和 server
- 由 Express 在 production 模式下直接托管 client/dist
- 由 PM2 守护 Node.js 进程
- 浏览器直接访问 ECS 公网 IP 或域名对应端口

## 适用场景

- 单机部署
- 访问量中低
- 追求部署简单
- 不需要额外的反向代理、静态缓存和多服务转发

## 架构说明

- 浏览器 -> Node.js/Express (3000 或自定义端口)
- Node.js/Express -> MongoDB (27017)
- 前端静态资源由 Express 在生产模式下直接提供

对应代码入口：

- Express 生产静态托管见 [server/src/app.ts](../server/src/app.ts)
- PM2 配置见 [ecosystem.config.js](../ecosystem.config.js)
- 启动脚本见 [start.sh](../start.sh)

## ECS 安全组建议

如果你直接开放 3000 端口：

- 放行 22 端口用于 SSH
- 放行 3000 端口用于 Web 访问
- 不要对公网开放 27017

如果你希望直接用 80 端口：

- 放行 22 端口用于 SSH
- 放行 80 端口用于 Web 访问
- 不要对公网开放 27017

## 部署命令清单

以下示例默认系统为 Ubuntu 22.04，项目部署目录为 /opt/hot-stock-observer-source。

### 1. 安装系统依赖

```bash
sudo apt update
sudo apt install -y git curl ca-certificates
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

### 2. 安装并启动 MongoDB

```bash
wget -qO - https://www.mongodb.org/static/pgp/server-7.0.asc | sudo gpg --dearmor -o /usr/share/keyrings/mongodb-server-7.0.gpg
echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt update
sudo apt install -y mongodb-org
sudo systemctl enable mongod
sudo systemctl start mongod
sudo systemctl status mongod --no-pager
```

### 3. 拉取代码

```bash
cd /opt
sudo git clone <你的仓库地址> hot-stock-observer-source
sudo chown -R $USER:$USER /opt/hot-stock-observer-source
cd /opt/hot-stock-observer-source
```

### 4. 安装依赖并构建

```bash
npm run install:all
npm run build
```

### 5. 配置环境变量

```bash
cd /opt/hot-stock-observer-source/server
cp .env.example .env
mkdir -p logs
```

建议至少配置以下内容：

```env
PORT=3000
NODE_ENV=production
MONGODB_URI=mongodb://127.0.0.1:27017/hot_stock_observer
LOG_LEVEL=info
CRON_UPDATE_INTERVAL=*/5 9-15 * * 1-5
```

### 6. 使用 PM2 启动

```bash
cd /opt/hot-stock-observer-source
export PORT=3000
export NODE_ENV=production
npm run pm2:start
pm2 save
pm2 startup systemd -u $USER --hp $HOME
```

### 7. 健康检查

```bash
curl http://127.0.0.1:3000/api/health
curl http://<ECS公网IP>:3000/api/health
pm2 status
pm2 logs hot-stock-observer --lines 100
```

## 如果想直接监听 80 端口

Node.js 默认不能直接绑定 80 这种低端口，除非使用 root 或给 node 可执行文件赋权。更推荐继续用 3000 端口；如果你确定要直接开放 80，可用下面方式赋权：

```bash
sudo setcap 'cap_net_bind_service=+ep' $(readlink -f $(which node))
```

然后重新设置端口并启动：

```bash
cd /opt/hot-stock-observer-source
export PORT=80
export NODE_ENV=production
npm run pm2:restart
```

健康检查变成：

```bash
curl http://127.0.0.1/api/health
curl http://<ECS公网IP>/api/health
```

## 更新部署命令

后续更新代码时，可直接执行：

```bash
cd /opt/hot-stock-observer-source
git pull
npm run build
npm run pm2:restart
```

## 排障命令

```bash
pm2 status
pm2 logs hot-stock-observer --lines 200
sudo systemctl status mongod --no-pager
sudo ss -lntp | grep -E ':80|:3000|:27017'
curl -I http://127.0.0.1:${PORT:-3000}
curl http://127.0.0.1:${PORT:-3000}/api/health
```

## 说明

- 这种方式不需要安装 Nginx
- 生产入口就是 Express 本身
- 如果未来要做 HTTPS、静态缓存、多个服务转发，再考虑加 Nginx 更合适