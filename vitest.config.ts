import { defineConfig } from 'vitest/config';

/** Keeps Vitest from resolving workspace paths through restricted Windows links. */
export default defineConfig({
  resolve: {
    preserveSymlinks: true,
  },
  test: {
    environment: 'node',
  },
});
