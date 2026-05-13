# 部署文档

## 目录

- [环境要求](#环境要求)
- [本地部署](#本地部署)
- [生产环境部署](#生产环境部署)
- [常见问题](#常见问题)

---

## 环境要求

### 软件要求

- **Node.js**: >= 18.0.0
- **MongoDB**: >= 6.0
- **npm**: >= 9.0.0

### 硬件要求（最低配置）

- CPU: 1核
- 内存: 1GB
- 磁盘: 10GB

---

## 本地部署

### 1. 安装 MongoDB

**Windows:**

1. 下载 MongoDB Community Server: https://www.mongodb.com/try/download/community
2. 安装并启动服务
3. 或使用 MongoDB Compass 图形界面

**Linux (Ubuntu):**

```bash
# 导入公钥
wget -qO - https://www.mongodb.org/static/pgp/server-7.0.asc | sudo apt-key add -

# 添加源
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list

# 安装
sudo apt-get update
sudo apt-get install -y mongodb-org

# 启动
sudo systemctl start mongod
sudo systemctl enable mongod
```

### 2. 安装依赖

```bash
# 进入项目目录
cd hot-stock-observer

# 安装后端依赖
cd server
npm install

# 安装前端依赖
cd ../client
npm install
```

### 3. 配置环境变量

```bash
# 复制环境变量模板
cd server
cp .env.example .env

# 编辑配置
nano .env
```

主要配置项：

```env
PORT=3000
MONGODB_URI=mongodb://localhost:27017/hot_stock_observer
LOG_LEVEL=info
CRON_UPDATE_INTERVAL=*/15 9-15 * * 1-5
```

### 4. 启动服务

**开发模式：**

```bash
# 终端1：启动后端
cd server
npm run dev

# 终端2：启动前端
cd client
npm run dev
```

**访问地址：**
- 前端: http://localhost:5173
- 后端: http://localhost:3000

---

## 生产环境部署

### 方式零：Express + PM2 直接部署（无 Nginx）

当前仓库已经支持由 Express 在 production 模式下直接托管前端静态资源，因此可以不安装 Nginx，只保留 Node.js、MongoDB 和 PM2。

阿里云 ECS 的完整步骤见：

- [docs/ECS_EXPRESS_PM2.md](./ECS_EXPRESS_PM2.md)

### 方式一：PM2 部署（推荐）

当前仓库的生产模式已经调整为：

- 先构建 client 和 server
- 由 server 在 production 模式下直接托管 client/dist
- Nginx 统一反向代理到 127.0.0.1:3000

如果你要部署到阿里云 ECS，优先参考：

- [docs/ECS_DEPLOY.md](./ECS_DEPLOY.md)

#### 1. 安装 PM2

```bash
npm install -g pm2
```

#### 2. 构建项目

```bash
# 构建前端
cd client
npm run build

# 构建后端
cd ../server
npm run build
```

#### 3. 创建 PM2 配置

创建 `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'hot-stock-observer',
    script: './dist/app.js',
    cwd: './server',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
```

#### 4. 启动服务

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # 设置开机自启
```

#### 5. 配置 Nginx

```nginx
server {
    listen 80;
  server_name your-domain.com;

  location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    }
}
```

仓库示例配置见：

- [deploy/nginx/hot-stock-observer.ecs.conf](../deploy/nginx/hot-stock-observer.ecs.conf)

### 方式二：Docker 部署

当前仓库的可执行 Docker 方案请优先参考：

- [docs/DOCKER_PM2.md](./DOCKER_PM2.md)

#### 1. 创建 Dockerfile

**后端 Dockerfile (server/Dockerfile):**

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist ./dist

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/app.js"]
```

**前端 Dockerfile (client/Dockerfile):**

```dockerfile
FROM node:18-alpine as builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

#### 2. 创建 docker-compose.yml

```yaml
version: '3.8'

services:
  mongodb:
    image: mongo:7
    container_name: hot-stock-mongo
    volumes:
      - mongo_data:/data/db
    ports:
      - "27017:27017"
    restart: always

  server:
    build: ./server
    container_name: hot-stock-server
    ports:
      - "3000:3000"
    environment:
      - MONGODB_URI=mongodb://mongodb:27017/hot_stock_observer
      - NODE_ENV=production
    depends_on:
      - mongodb
    restart: always

  client:
    build: ./client
    container_name: hot-stock-client
    ports:
      - "80:80"
    depends_on:
      - server
    restart: always

volumes:
  mongo_data:
```

#### 3. 启动容器

```bash
docker-compose up -d
```

---

## 运维命令

### PM2 常用命令

```bash
pm2 list              # 查看进程列表
pm2 logs              # 查看日志
pm2 restart all       # 重启所有进程
pm2 stop all          # 停止所有进程
pm2 delete all        # 删除所有进程
pm2 monit             # 监控面板
```

### 数据备份

```bash
# 备份 MongoDB
mongodump --db hot_stock_observer --out /backup/$(date +%Y%m%d)

# 恢复
mongorestore --db hot_stock_observer /backup/20241204/hot_stock_observer
```

### 日志查看

```bash
# 查看后端日志
tail -f server/logs/combined.log

# 查看错误日志
tail -f server/logs/error.log
```

---

## 常见问题

### 1. MongoDB 连接失败

确保 MongoDB 服务已启动：

```bash
# Windows
net start MongoDB

# Linux
sudo systemctl status mongod
```

### 2. 端口被占用

```bash
# 查看端口占用
netstat -ano | findstr :3000  # Windows
lsof -i :3000                 # Linux

# 修改配置中的端口
```

### 3. 数据更新失败

1. 检查网络连接
2. 检查同花顺接口是否可访问
3. 手动触发更新: `POST /api/admin/update`

### 4. 前端页面空白

1. 检查 `client/dist` 目录是否存在
2. 检查 Nginx 配置是否正确
3. 查看浏览器控制台错误

---

## 更新部署

```bash
# 拉取最新代码
git pull origin main

# 重新构建
cd client && npm run build
cd ../server && npm run build

# 重启服务
pm2 restart all
```
