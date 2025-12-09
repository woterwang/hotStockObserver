/*
 * @Author: hp.com
 * @Date: 2025-12-04 17:37:06
 * @LastEditors: WRG
 * @LastEditTime: 2025-12-05 09:16:10
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
	host:"0.0.0.0",
    port: 8080,
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
