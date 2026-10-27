import { defineConfig, configDefaults } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: 'node',
    exclude: [...configDefaults.exclude, '**/.next/**', '**/out/**'],
  },
  resolve: { alias: { '@': path.resolve(rootDir, 'src') } },
});
