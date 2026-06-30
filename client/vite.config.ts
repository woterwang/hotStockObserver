/*
 * @Author: hp.com
 * @Date: 2025-12-04 17:37:06
 * @LastEditors: WRG
 * @LastEditTime: 2026-06-22 18:44:19
 * @😍: 😃😃
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
  allowedHosts: ['localhost', '0.0.0.0', 'api.woter.cloud','127.0.0.1'],
	host:"0.0.0.0",
    port: 80,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
		//
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    reportCompressedSize: false,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        // Split large third-party dependencies to reduce single chunk pressure.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;

          if (
            id.includes('react') ||
            id.includes('react-dom') ||
            id.includes('react-router-dom')
          ) {
            return 'react-vendor';
          }

          if (
            id.includes('echarts-for-react')
          ) {
            return 'chart-react-vendor';
          }

          if (id.includes('zrender')) {
            return 'zrender-vendor';
          }

          if (id.includes('echarts')) {
            return 'chart-vendor';
          }

          if (
            id.includes('axios') ||
            id.includes('dayjs') ||
            id.includes('classnames')
          ) {
            return 'utils-vendor';
          }

          return 'vendor';
        },
      },
    },
  },
});
