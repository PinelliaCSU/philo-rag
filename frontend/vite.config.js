import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath, URL } from 'node:url';

// 产物直接落进 Python 包的静态目录：pip 装完即可 `python -m philo_rag` 起服务。
const restricted = process.env.VITE_RESTRICTED_BUILD === '1';

export default defineConfig({
  plugins: [svelte()],
  base: '/',
  // 受限环境（不允许子进程管道）里 esbuild 起不来：关掉转译与压缩，
  // 输出仍是可运行的 ESM，只是没被压缩。
  esbuild: restricted ? false : undefined,
  build: {
    outDir: fileURLToPath(new URL('../philo_rag/web/dist', import.meta.url)),
    emptyOutDir: true,
    assetsDir: 'assets',
    minify: restricted ? false : 'esbuild',
    cssMinify: restricted ? false : 'esbuild',
  },
  resolve: {
    // 浏览器条件：测试在 jsdom 里跑，也不该解析到 svelte 的服务端入口
    conditions: ['browser', 'module', 'import'],
  },
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true } },
  },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.js'],
    globals: true,
  },
});
