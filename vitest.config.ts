import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Scoped to this project's own sources. Without an explicit include,
    // a run started from a parent directory sweeps in sibling repositories.
    root: __dirname,
    include: ['src/**/*.{test,spec}.{ts,tsx,js}'],
    environment: 'node',
    passWithNoTests: false
  }
});
