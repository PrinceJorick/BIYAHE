import { defineConfig } from 'vitest/config'

// Test-only config. Kept separate from vite.config.ts so the React and PWA plugins
// are not loaded: the tests cover pure domain logic and need no DOM.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    restoreMocks: true,
  },
})
