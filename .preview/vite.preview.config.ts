import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'

// Preview the RENDERER as a plain web app — to see branding + colours only.
// The Electron backend isn't here, so live agents/terminals won't function;
// the UI, layout, and theme render. Root is the app repo (one level up).
const R = resolve(__dirname, '..')
export default defineConfig({
  root: resolve(R, 'src/renderer'),
  define: { __APP_VERSION__: JSON.stringify('preview') },
  plugins: [
    react(),
    {   // Inject the preview-only `window.cth` stub before any app module runs.
      name: 'preview-cth-stub',
      transformIndexHtml(html: string) {
        const stub = readFileSync(resolve(__dirname, 'stub-cth.js'), 'utf8')
        return html.replace('<head>', `<head><script>${stub}</script>`)
      },
    },
  ],
  resolve: {
    alias: {
      '@': resolve(R, 'src/renderer/src'),
      '@brand': resolve(R, 'docs'),
      '@shared': resolve(R, 'src/shared'),
    },
  },
  server: { host: '0.0.0.0', port: 5199, watch: { usePolling: true } },
})
