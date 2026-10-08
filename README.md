# Little wins

A Foldkit demo with shared counters. Add up to ten wins, then start again.

Open the app to create a session. Copy its link to another browser or person. Everyone on that link sees the same count live. Each session persists across refreshes and closed browsers. New session creates a separate counter.

Anyone with the link can read, add or reset wins. There is no login, session list or automatic expiry. Keep links private and do not use this demo for sensitive information. Each session supports up to 32 live connections. Additional browsers cannot edit until a connection becomes available.

## Run locally

```sh
mise install
mise exec -- pnpm install --frozen-lockfile
mise exec -- pnpm dev:shared
```

Open http://127.0.0.1:5188. This builds the frontend and runs the real Worker and SQLite Durable Object in Miniflare, without cloud access. Restart the command after editing source. Local session state stays in ignored `.local-state/`. Use `PORT` and `SESSION_STATE_DIR` to choose another port or local state directory.

The project pins Node 22.22.2 and pnpm 10.34.6. Plain `pnpm dev` or `pnpm preview` serves only the frontend, so shared sessions will not connect there.

## Checks

```sh
mise exec -- pnpm format:check
mise exec -- pnpm lint
mise exec -- pnpm typecheck
mise exec -- pnpm test
mise exec -- pnpm test:server
mise exec -- pnpm exec playwright install chromium --only-shell
mise exec -- pnpm test:e2e
```

Story and Scene tests check pure state transitions and controls. Backend tests run against real Miniflare SQLite objects, including concurrent writes, WebSocket broadcasts, invalid requests and persistence across runtime restarts.

Browser tests use two isolated clients at desktop and mobile sizes. They cover live updates, reset, separate sessions, reload, offline recovery and a committed mutation whose response is lost. They start and stop their own local server on port 5188 and never use your personal browser.

## Structure

- `src/main.ts` defines the Schema Model, Messages, pure init/update/view, Commands and scoped WebSocket Subscription.
- `src/entry.ts` supplies the browser URL and starts Foldkit.
- `src/shared/session.ts` validates session IDs and snapshots.
- `server/worker.ts` handles same-origin API requests and exports `WinSession`.
- `scripts/local-server.mjs` bundles the Worker and starts Miniflare with local assets and persistence.
- `public/_headers` prevents bearer session URLs leaking in referrer headers.

One SQLite-backed Durable Object owns each UUID session. Atomic updates increment a version and broadcast authoritative snapshots. Clients never optimistically change the count or replay mutations. They ignore older snapshots, disable editing while disconnected or pending, and reconnect to resolve uncertain outcomes. HTTP actions time out after ten seconds.

Foldkit 0.166.0 and Effect 4.0.0 are pinned. This is browser-rendered, not an SSR/SSG proof. The DevTools MCP relay is disabled. The native Cloudflare HTTP/WebSocket boundary uses platform APIs; the frontend retains Foldkit's pure Model/update/view architecture.

## Cloudflare deployment with Alchemy

Existing live URL: [Little wins](https://littlewins-website-prod-emrpru6kgj4uf3uk.rapid-bush-3b2c.workers.dev)

The live release is still the original browser-only counter. The shared-session update is locally verified and awaiting deployment approval.

`alchemy.run.ts` preserves the `LittleWins` stack, `Website` logical resource and existing Worker URL. The update adds the Worker entry point, `SESSIONS` binding and SQLite Durable Object class `WinSession`. API routes run the Worker first; static assets retain Cloudflare asset serving.

Target the personal Cloudflare account `bcd94aafc110a8c2e44a1d013e7e0081`, profile `default`, stage `prod`. Never add a paid service or upgrade billing implicitly.

```sh
mise exec -- pnpm cloudflare:login
mise exec -- pnpm cloudflare:plan
# Only after reviewing the account, exact plan and receiving approval:
mise exec -- pnpm cloudflare:deploy
```

Login is interactive. `ALCHEMY_TUI=1` works around Alchemy mistaking Pi in PATH for a non-interactive session. It is not deployment approval. Never print or commit credentials.

### Costs and limits

SQLite Durable Objects work on Workers Free. Published free limits include 100,000 Durable Object requests per day, 13,000 GB-seconds per day, 100,000 rows written per day, 5 million rows read per day and 5 GB stored. The entry Worker also has request/CPU quotas. These are account-wide allowances, not this app's private allocation.

On the Free plan, operations fail when quotas are exhausted rather than automatically upgrading billing. Existing paid accounts have different allowances and overage charges. This configuration does not change the account plan. Hibernatable WebSockets avoid idle-duration charging; small demo traffic should fit the free allowances. Public abuse can still exhaust them. Persistent sessions consume storage until explicitly removed.

See [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).

### State and recovery

Alchemy state stays in ignored `.alchemy/state/`. The first-deploy backup is `.alchemy/backups/first-deploy/`, local only. Keep another private backup before and after the session deployment. Never delete state, run concurrent deployments or deploy from another checkout without the state.

After an approved release, check the emitted URL and two disposable sessions for live synchronization, reset, isolation and refresh persistence. These smoke tests write session data and must be included in release approval.

After sessions exist, rollback must keep the `WinSession` export, `SESSIONS` binding and storage migration intact. Roll back the frontend or change application behavior without removing the Durable Object class. Do not redeploy the original assets-only infrastructure as a shortcut, because removing the class can delete session data. Destruction and data deletion require separate approval.

Alchemy is pinned to `2.0.0-beta.81`. TypeScript 6 satisfies its Cloudflare tooling peer range. SQL driver overrides keep transitive dependencies on Effect 4.0.0, matching Foldkit. Recheck these pins when upgrading.
