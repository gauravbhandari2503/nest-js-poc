import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

// Integration/e2e tests run against the test database, never the dev one.
config({ path: '.env.test', override: true, quiet: true });

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
  },
});
