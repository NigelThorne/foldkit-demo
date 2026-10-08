import * as Alchemy from 'alchemy'
import * as Cloudflare from 'alchemy/Cloudflare'
import { localState } from 'alchemy/State/LocalState'
import * as Effect from 'effect/Effect'

export const Website = Cloudflare.Website.Foldkit('Website', {
  main: 'server/worker.ts',
  env: {
    SESSIONS: Cloudflare.DurableObject('WinSession', {
      className: 'WinSession',
    }),
  },
  assets: { runWorkerFirst: ['/api/*'] },
})

export default Alchemy.Stack(
  'LittleWins',
  {
    providers: Cloudflare.providers(),
    state: localState(),
  },
  Effect.gen(function* () {
    const website = yield* Website
    return { url: website.url }
  }),
)
