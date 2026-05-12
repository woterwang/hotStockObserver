/**
 * @Author: hp.com
 * @Date: 2025-12-06 11:54:09
 * @LastEditors: WRG
 * @LastEditTime: 2026-05-12 20:17:47
 * @😍: 😃😃
 */
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
      NODE_ENV: process.env.NODE_ENV || 'production',
      PORT: process.env.PORT || 80
    },
    env_development: {
      NODE_ENV: 'development',
      PORT: process.env.PORT || 80
    },
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    merge_logs: true,
  }]
};
