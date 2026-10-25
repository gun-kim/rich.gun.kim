import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    // 실제 외부 API 를 호출한다.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
