/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '"Segoe UI"', 'Nirmala UI', 'sans-serif'],
        mono: ['ui-monospace', '"Cascadia Code"', 'Consolas', 'monospace'],
      },
      colors: {
        ink: { 950: '#0e0d0c', 900: '#141312', 850: '#191816', 800: '#201d1a', 700: '#2a2623', 600: '#3a3530' },
        cream: { 50: '#fff9f1', 100: '#f4eee6', 200: '#e8dccb', 300: '#cdc1b0', 400: '#a09585', 500: '#786f63' },
        accent: { 300: '#f6bd86', 400: '#f39d52', 500: '#ee8430', 600: '#d06d1f' },
        tan: '#f0b27a',
        clay: { 700: '#7d5129', 800: '#6a4423', 900: '#4d311a' },
      },
      boxShadow: { card: '0 1px 0 rgba(255,255,255,0.03) inset, 0 8px 24px -12px rgba(0,0,0,0.6)' },
    },
  },
  plugins: [],
}
