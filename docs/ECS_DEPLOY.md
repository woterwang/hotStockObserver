# 阿里云 ECS 部署清单

本文档适用于当前仓库的生产模式：先构建前后端，再由 server 进程托管 client/dist，Nginx 只做 80/443 入口反向代理。

## 架构说明

- 浏览器 -> Nginx -> Node.js/Express (3000)
- Node.js/Express -> MongoDB (27017)
- 前端静态资源由 server/dist/app.js 在生产环境下统一提供

对应代码入口：

- server 生产静态托管见 [server/src/app.ts](../server/src/app.ts)
- PM2 配置见 [ecosystem.config.js](../ecosystem.config.js)
- 生产启动脚本见 [start.sh](../start.sh)

## ECS 安全组建议

- 放行 22 端口用于 SSH
- 放行 80 端口用于 HTTP
- 放行 443 端口用于 HTTPS
- 不要对公网开放 3000 和 27017

## 部署命令清单

以下示例默认系统为 Ubuntu 22.04，项目部署目录为 /opt/hot-stock-observer-source。

### 1. 安装系统依赖

```bash
sudo apt update
sudo apt install -y git nginx curl ca-certificates
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
npm run pm2:start
pm2 save
pm2 startup systemd -u $USER --hp $HOME
```

### 7. 部署 Nginx 配置

仓库内已提供可直接复用的 ECS 配置样例：

- [deploy/nginx/hot-stock-observer.ecs.conf](../deploy/nginx/hot-stock-observer.ecs.conf)

部署命令：

```bash
sudo cp /opt/hot-stock-observer-source/deploy/nginx/hot-stock-observer.ecs.conf /etc/nginx/sites-available/hot-stock-observer
sudo ln -sf /etc/nginx/sites-available/hot-stock-observer /etc/nginx/sites-enabled/hot-stock-observer
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl enable nginx
```

如果你已经有域名，把配置中的 server_name _ 改成你的域名即可。

### 8. 健康检查

```bash
curl http://127.0.0.1:3000/api/health
curl http://<你的域名或ECS公网IP>/api/health
pm2 status
pm2 logs hot-stock-observer --lines 100
```

## 更新部署命令

后续更新代码时，可直接执行：

```bash
cd /opt/hot-stock-observer-source
git pull
npm run build
npm run pm2:restart
```

## HTTPS 可选步骤

如果已经绑定域名，可以继续接入 Let's Encrypt：

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d <你的域名>
```

## 排障命令

```bash
pm2 status
pm2 logs hot-stock-observer --lines 200
sudo systemctl status nginx --no-pager
sudo systemctl status mongod --no-pager
sudo ss -lntp | grep -E ':80|:3000|:27017'
curl -I http://127.0.0.1:3000
curl http://127.0.0.1:3000/api/health
```