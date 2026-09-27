import { fileURLToPath } from 'node:url'
import { defineVitestProject } from '@nuxt/test-utils/config'
import { defineConfig } from 'vitest/config'

const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url))

export default defineConfig({
  test: {
    projects: [
      // Pure functions, no Nuxt runtime: fast.
      {
        resolve: {
          alias: {
            '#shared': path('./shared'),
            '~': path('./app'),
          },
        },
        test: {
          name: 'unit',
          include: ['test/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      // Code relying on Nuxt auto-imports (stores, composables). Network calls are mocked in the tests,
      // and Supabase points to a dummy URL so no test can reach the real project.
      await defineVitestProject({
        test: {
          name: 'nuxt',
          include: ['test/nuxt/**/*.test.ts'],
          environment: 'nuxt',
          environmentOptions: {
            nuxt: {
              overrides: {
                supabase: { url: 'http://localhost:54321', key: 'test-key' },
              },
            },
          },
        },
      }),
    ],
  },
})
