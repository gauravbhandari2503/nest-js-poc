import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';
import tsconfigPaths from 'vite-tsconfig-paths';

// Integration/e2e tests run against the test database, never the dev one.
config({ path: '.env.test', override: true, quiet: true });

export default defineConfig({
  // SWC emits the decorator metadata Nest's DI needs (esbuild, vitest's default, does not).
  plugins: [tsconfigPaths(), swc.vite({ module: { type: 'es6' } })],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
  },
});
