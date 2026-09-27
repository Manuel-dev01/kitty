import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Real sandbox calls. Run on demand with `npm run test:live`; never in CI.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.live.ts'],
    setupFiles: ['src/test/live-setup.ts'],
    testTimeout: 120_000,
    fileParallelism: false,
  },
});
