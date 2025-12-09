# 每日热搜股票观察系统

> A股每日热搜股票观察与分析平台，帮助投资者快速复盘市场热度，提升交易决策效率。

## 📋 项目简介

本系统提供A股每日热搜股票的实时展示、阶段统计分析和个股详情查看功能，主要包括：

- **信息概览**：核心指数展示、热搜Top20、热门板块、强势股筛选
- **阶段统计**：N天持续热搜股票统计、趋势分析
- **个股详情**：K线图、分时图、涨跌分析、相关新闻

## 🛠️ 技术栈

### 前端
- React 18 + TypeScript
- Vite（构建工具）
- TailwindCSS（样式）
- ECharts（图表）
- Axios（HTTP请求）
- React Router（路由）

### 后端
- Node.js + Express + TypeScript
- MongoDB + Mongoose（数据库）
- Node-cron（定时任务）
- Winston（日志）

## 📁 项目结构

```
hot-stock-observer/
├── client/                 # 前端项目
│   ├── src/
│   │   ├── components/     # 通用组件
│   │   ├── pages/          # 页面组件
│   │   ├── services/       # API服务
│   │   ├── hooks/          # 自定义Hooks
│   │   ├── types/          # TypeScript类型
│   │   ├── utils/          # 工具函数
│   │   └── App.tsx
│   ├── package.json
│   └── vite.config.ts
│
├── server/                 # 后端项目
│   ├── src/
│   │   ├── controllers/    # 控制器
│   │   ├── models/         # 数据模型
│   │   ├── routes/         # 路由
│   │   ├── services/       # 业务服务
│   │   ├── jobs/           # 定时任务
│   │   ├── utils/          # 工具函数
│   │   └── app.ts
│   ├── package.json
│   └── tsconfig.json
│
├── docs/                   # 文档
│   ├── API.md              # API文档
│   └── DEPLOY.md           # 部署文档
│
└── README.md
```

## 🚀 快速开始

### 环境要求

- Node.js >= 18.0.0
- MongoDB >= 6.0
- npm >= 9.0.0

### 安装步骤

1. **克隆项目**
```bash
cd C:\Users\WaRo996\Desktop\codes\hot-stock-observer
```

2. **安装后端依赖**
```bash
cd server
npm install
```

3. **安装前端依赖**
```bash
cd ../client
npm install
```

4. **配置环境变量**
```bash
# 复制后端环境变量模板
cd ../server
cp .env.example .env
# 编辑 .env 文件，配置MongoDB连接等
```

5. **启动MongoDB**
```bash
# Windows
mongod

# 或使用 MongoDB Compass 启动
```

6. **启动后端服务**
```bash
cd server
npm run dev
```

7. **启动前端服务**
```bash
cd client
npm run dev
```

8. **访问应用**
- 前端：http://localhost:5173
- 后端API：http://localhost:3000

## 📊 功能特性

### 信息概览
- ✅ 上证指数、深证成指、创业板指、中小板指实时展示
- ✅ 热搜股票Top20列表
- ✅ 今日热门板块
- ✅ 成交额Top10且涨幅>5%的强势股
- ✅ 横盘突破趋势股筛选

### 阶段统计
- ✅ N天（默认7天）持续热搜股票统计
- ✅ 涨跌幅趋势图表
- ✅ 成交额趋势图表
- ✅ 相关新闻聚合

### 个股详情
- ✅ 基本信息展示
- ✅ K线图（日K/周K/月K）
- ✅ 分时图
- ✅ 上涨原因分析
- ✅ 相关新闻

## 📡 API接口

详见 [API文档](./docs/API.md)

## 🔧 部署

详见 [部署文档](./docs/DEPLOY.md)

## 📝 更新日志

### v1.0.0 (2024-12-04)
- 初始版本发布
- 实现信息概览、阶段统计、个股详情三大核心功能

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交Issue和Pull Request！
