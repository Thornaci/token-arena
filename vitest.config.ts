/// <reference types="vitest" />
import { getViteConfig } from 'astro/config';

export default getViteConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Scaffold stage only: the first real test suite lands with the engine.
    // Remove this flag as soon as tests exist so an empty run can't pass CI.
    passWithNoTests: true,
  },
});
