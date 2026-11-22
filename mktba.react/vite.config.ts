import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { reactRouter } from '@react-router/dev/vite'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Plugin } from 'vite'
import { isLocaleChunk, LOCALE_CHUNK_QUERY, pickLocaleChunk } from './src/localization/chunks.ts'

// The React Router plugin builds the SSR app; Vitest renders components on its own and only needs JSX.
const isVitest = !!process.env.VITEST

const localeFilePattern = /[\\/]localization[\\/]locales[\\/][^\\/]+[\\/][^\\/]+\.json$/

// Serves `locales/<lang>/<namespace>.json?locale-chunk=<chunk>` as the part of that file that belongs to
// the chunk (src/localization/chunks.ts), so the admin's strings stay out of the public first load
// (I-02, #106). Vite's JSON plugin then turns the picked JSON into a module as usual.
const localeChunks = (): Plugin => ({
  name: 'mktba:locale-chunks',
  enforce: 'pre',
  async load(id) {
    const [file, query] = id.split('?')
    if (!query || !localeFilePattern.test(file)) return null
    const chunk = new URLSearchParams(query).get(LOCALE_CHUNK_QUERY)
    if (chunk === null) return null
    if (!isLocaleChunk(chunk)) this.error(`Unknown locale chunk "${chunk}" in ${id}`)
    this.addWatchFile(file)
    const data = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>
    return JSON.stringify(pickLocaleChunk(path.basename(file, '.json'), data, chunk))
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [localeChunks(), tailwindcss(), isVitest ? react() : reactRouter()],
  // Pre-bundled at dev start: route modules load lazily, and a dependency found only then makes
  // Vite re-optimize and reload the page under the user (or an e2e test).
  optimizeDeps: {
    include: [
      'axios',
      '@tanstack/react-query',
      'clsx',
      'tailwind-merge',
      'lucide-react',
      'react-markdown',
      'mdast-util-gfm',
      'micromark-extension-gfm',
      'rehype-sanitize',
      '@tiptap/core',
      '@tiptap/pm/state',
      '@tiptap/react',
      '@tiptap/starter-kit',
      '@tiptap/extensions',
    ],
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
  },
})
