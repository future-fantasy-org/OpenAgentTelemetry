import { defineConfig } from 'vitest/config';

// vitest 默认无法解析 import 里的 .js 后缀到 .ts 源文件（ESM 约定）。
// resolve.alias 把 .js 后缀的裸路径交给 vite 正常处理 .ts。
// 这里通过只设 test 环境，保持构建产物仍用 .js 后缀。
export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    extensions: ['.ts', '.js', '.json'],
  },
});
