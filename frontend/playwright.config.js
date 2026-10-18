import { defineConfig } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// e2e 要的是「能离线跑通」的服务：把 config.yaml 复制成同目录的 config.e2e.yaml，
// 只把生成后端换成 template。同目录是为了让里面的相对路径（store/、lexicon/）照常解析。
const root = fileURLToPath(new URL('..', import.meta.url));
const base = readFileSync(join(root, 'config.yaml'), 'utf8');
writeFileSync(
  join(root, 'config.e2e.yaml'),
  base.replace(/^(\s*)backend: api\s*$/m, '$1backend: template'),
);

const python = process.env.PHILO_PY || 'python';

export default defineConfig({
  testDir: './e2e',
  timeout: 150_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:8000',
    viewport: { width: 1280, height: 800 },   // 桌面最小视口 1024×720 之上
    channel: process.env.PHILO_CHANNEL || undefined,
    trace: 'off',
  },
  webServer: {
    command: python + ' -m philo_rag --port 8000 --config config.e2e.yaml',
    cwd: root,
    url: 'http://127.0.0.1:8000/api/stats',
    reuseExistingServer: true,
    timeout: 300_000,
  },
});
