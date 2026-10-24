import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    // 실제 외부 API 를 호출한다. CODEF 는 기관 스크래핑이라 한 번에 수십 초가 걸리기도 한다.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
