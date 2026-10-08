import { build } from 'esbuild'
import { Miniflare } from 'miniflare'
import { resolve } from 'node:path'

const port = Number(process.env.PORT ?? 5188)
const bundle = await build({
  entryPoints: ['server/worker.ts'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  external: ['cloudflare:workers'],
  write: false,
})

const runtime = new Miniflare({
  host: '127.0.0.1',
  port,
  name: 'little-wins-local',
  modules: true,
  script: bundle.outputFiles[0].text,
  compatibilityDate: '2026-07-01',
  durableObjects: { SESSIONS: { className: 'WinSession', useSQLite: true } },
  durableObjectsPersist:
    process.env.SESSION_STATE_DIR ?? resolve('.local-state'),
  assets: {
    directory: resolve('dist'),
    binding: 'ASSETS',
    routerConfig: {
      has_user_worker: true,
      invoke_user_worker_ahead_of_assets: true,
    },
    assetConfig: { not_found_handling: 'single-page-application' },
  },
})
console.log(`Local shared sessions: ${await runtime.ready}`)
const stop = async () => {
  await runtime.dispose()
  process.exit(0)
}
process.once('SIGTERM', stop)
process.once('SIGINT', stop)
