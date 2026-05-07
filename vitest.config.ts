import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    reporters: ['default'],
    coverage: {
      reporter: ['text', 'html'],
      exclude: ['examples/**', 'dist/**'],
    },
  },
});
