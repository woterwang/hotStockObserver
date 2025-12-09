/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 上涨颜色
        rise: {
          DEFAULT: '#ef4444',
          light: '#fef2f2',
        },
        // 下跌颜色
        fall: {
          DEFAULT: '#22c55e',
          light: '#f0fdf4',
        },
        // 持平颜色
        flat: {
          DEFAULT: '#6b7280',
          light: '#f9fafb',
        },
      },
    },
  },
  plugins: [],
};
