import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url))

// The loop sentences against the real LLM (#216, `npm run test:loop-sentences`): by hand only, never in `npm test`.
export default defineConfig({
  resolve: {
    alias: {
      '#shared': path('./shared'),
      '~': path('./app'),
    },
  },
  test: {
    include: ['test/llm/**/*.llm.test.ts'],
    environment: 'node',
    env: loadEnv('', process.cwd(), 'NUXT_LOOP_LLM_'),
    testTimeout: 30_000,
    fileParallelism: false,
  },
})
