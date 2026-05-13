# Docker 部署（PM2 + Express）

本文档适用于这类场景：

- 不在宿主机直接执行 [start.sh](../start.sh)
- 通过 Docker 镜像构建并运行项目
- 前端由 Express 在容器内直接托管
- 使用 PM2 Runtime 作为容器主进程

## 当前推荐方式

容器内不再执行 [start.sh](../start.sh)。

原因：

- [start.sh](../start.sh) 是宿主机运维脚本，包含安装依赖、构建、PM2 守护等步骤
- Docker 场景下，这些动作应拆分到 Dockerfile 的构建阶段和容器启动阶段
- 容器主进程应使用 pm2-runtime，而不是 pm2 daemon + nohup 这一类宿主机模式

仓库里已经新增以下 Docker 文件：

- [Dockerfile](../Dockerfile)
- [docker/docker-entrypoint.sh](../docker/docker-entrypoint.sh)
- [.dockerignore](../.dockerignore)

## 方案说明

### 方案 A：基于你现有的 node2020 镜像构建

如果你的 node2020 镜像里已经有 node、pm2、mongodb，可以直接基于它构建：

```bash
docker build -t hot-stock-observer:latest --build-arg BASE_IMAGE=node2020 .
```

如果 node2020 镜像本身没有 pm2，也没关系，Dockerfile 会补装。

### 方案 B：直接使用标准 Node 20 镜像构建

```bash
docker build -t hot-stock-observer:latest .
```

## 启动命令

### 容器内 MongoDB 也一起启动

适用于你的 node2020 镜像已经安装 mongod 的情况：

```bash
docker run -d \
  --name hot-stock-observer \
  -p 8080:3000 \
  -e PORT=3000 \
  -e NODE_ENV=production \
  -e START_MONGODB=true \
  -e MONGODB_URI=mongodb://127.0.0.1:27017/hot_stock_observer \
  -v hot_stock_mongo_data:/data/db \
  hot-stock-observer:latest
```

这样外网访问宿主机 8080，实际进入的是容器内 3000 端口上的 Express 服务。

### MongoDB 使用外部容器或外部服务

如果 MongoDB 不是和应用跑在一个容器里：

```bash
docker run -d \
  --name hot-stock-observer \
  -p 8080:3000 \
  -e PORT=3000 \
  -e NODE_ENV=production \
  -e START_MONGODB=false \
  -e MONGODB_URI=mongodb://<mongo-host>:27017/hot_stock_observer \
  hot-stock-observer:latest
```

## 健康检查

```bash
curl http://127.0.0.1:8080/api/health
docker logs -f hot-stock-observer
docker exec -it hot-stock-observer pm2 status
```

## 更新发布

```bash
docker build -t hot-stock-observer:latest --build-arg BASE_IMAGE=node2020 .
docker rm -f hot-stock-observer
docker run -d \
  --name hot-stock-observer \
  -p 8080:3000 \
  -e PORT=3000 \
  -e NODE_ENV=production \
  -e START_MONGODB=true \
  -e MONGODB_URI=mongodb://127.0.0.1:27017/hot_stock_observer \
  -v hot_stock_mongo_data:/data/db \
  hot-stock-observer:latest
```

## 你当前场景下的判断

你现在说的是：

- Docker 里有一个 node2020 容器
- node2020 里有 pm2、nodejs、mongodb
- 对外暴露 80 到宿主机 8080

针对这个场景，更合适的做法不是在宿主机上执行 [start.sh](../start.sh)，而是：

1. 用 [Dockerfile](../Dockerfile) 基于 node2020 构建应用镜像
2. 用 -p 8080:3000 把宿主机 8080 映射到应用容器 3000
3. 让容器内的 [docker/docker-entrypoint.sh](../docker/docker-entrypoint.sh) 负责启动 MongoDB 和 pm2-runtime

这样外网访问 8080 时，访问到的就是这个项目，而不是宿主机上另一套独立服务。