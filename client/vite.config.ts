/*
 * @Author: hp.com
 * @Date: 2025-12-04 17:37:06
 * @LastEditors: WRG
 * @LastEditTime: 2026-01-06 21:57:33
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
  allowedHosts: ['localhost', '0.0.0.0', 'api.woter.cloud'],
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
  },
});
