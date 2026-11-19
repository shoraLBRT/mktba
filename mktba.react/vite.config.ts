import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { reactRouter } from '@react-router/dev/vite'

// The React Router plugin builds the SSR app; Vitest renders components on its own and only needs JSX.
const isVitest = !!process.env.VITEST

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), isVitest ? react() : reactRouter()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
  },
})
