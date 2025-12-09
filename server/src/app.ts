import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

import routes from './routes';
import { jobScheduler } from './jobs';
import { logger } from './utils';

// 加载环境变量
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hot_stock_observer';

// 中间件
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'],
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 请求限流
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1分钟
  max: 100, // 每个IP每分钟最多100个请求
  message: { success: false, message: '请求过于频繁，请稍后再试' },
});
app.use('/api', limiter);

// API路由
app.use('/api', routes);

// 手动触发更新路由
app.post('/api/admin/update', async (req, res) => {
  try {
    const count = await jobScheduler.manualUpdate();
    res.json({ success: true, message: `更新成功，共保存 ${count} 条数据` });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
});

// 静态文件服务（生产环境）
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../client/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../client/dist/index.html'));
  });
}

// 错误处理中间件
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error(`Error: ${err.message}`, { stack: err.stack });
  res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'development' ? err.message : '服务器内部错误',
  });
});

// 404处理
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: '接口不存在',
  });
});

// 连接数据库并启动服务器
async function startServer() {
  try {
    // 连接MongoDB
    await mongoose.connect(MONGODB_URI);
    logger.info('MongoDB 连接成功');

    // 启动定时任务
    jobScheduler.start();

    // 启动服务器
    app.listen(PORT, () => {
      logger.info(`服务器已启动，端口: ${PORT}`);
      logger.info(`API地址: http://localhost:${PORT}/api`);
      logger.info(`健康检查: http://localhost:${PORT}/api/health`);
    });
  } catch (error) {
    logger.error('服务器启动失败:', error);
    process.exit(1);
  }
}

// 优雅关闭
process.on('SIGTERM', async () => {
  logger.info('收到SIGTERM信号，正在关闭服务器...');
  jobScheduler.stop();
  await mongoose.connection.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('收到SIGINT信号，正在关闭服务器...');
  jobScheduler.stop();
  await mongoose.connection.close();
  process.exit(0);
});

// 启动服务器
startServer();

export default app;
