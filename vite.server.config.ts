import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'));

/**
 * The server bundle: the main process, built for plain node.
 *
 * Two things make this possible with no changes to src/main. `electron` is
 * aliased to the shim, so modules that import `app` or `Notification` get a
 * headless equivalent instead of a missing dependency. And native modules stay
 * external — better-sqlite3 and node-pty are .node binaries that must be
 * require()d from node_modules at runtime, never bundled.
 */
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __POSTHOG_KEY__: JSON.stringify(''),
    __POSTHOG_HOST__: JSON.stringify('')
  },
  resolve: {
    alias: {
      electron: resolve(__dirname, 'src/server/electronShim.ts'),
      '@shared': resolve(__dirname, 'src/shared')
    }
  },
  build: {
    target: 'node20',
    outDir: 'out/server',
    emptyOutDir: true,
    ssr: true,
    rollupOptions: {
      input: resolve(__dirname, 'src/server/index.ts'),
      output: { format: 'cjs', entryFileNames: 'index.cjs' },
      external: [
        'better-sqlite3', 'node-pty', 'posthog-node', 'tunnelmole',
        /^node:/, 'fs', 'path', 'os', 'http', 'https', 'crypto', 'child_process',
        'events', 'net', 'stream', 'url', 'zlib', 'util', 'tty', 'readline'
      ]
    }
  }
});
