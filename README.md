# Little wins

An example app built with **Foldkit, Effect and Cloudflare Durable Objects**, deployed with Alchemy.

It is a small shared counter: open a session, share its URL, and add up to ten wins together. Every browser on that link sees updates live. Counts survive refreshes, closed browsers and server restarts.

[Try the hosted demo](https://littlewins-website-prod-emrpru6kgj4uf3uk.rapid-bush-3b2c.workers.dev). The hosted version may lag behind this repository.

## What this example demonstrates

- Foldkit's typed Model, Message, update and view architecture.
- Commands for side effects and a scoped WebSocket subscription.
- Schema-validated, server-authoritative state with version ordering.
- Atomic SQLite updates in one Durable Object per session.
- Reconnection without automatically replaying uncertain mutations.
- A local Cloudflare runtime with persistent, isolated test data.
- Infrastructure declared in TypeScript with Alchemy.

This is a learning example, not a production-ready application. Anyone with a session link can read, increment or reset that session. There is no login, session expiry or account-level abuse protection. Each session permits up to 32 live connections. Do not use it for sensitive data.

## Architecture

```text
Foldkit browser app
    │ HTTP POST for increment/reset
    ▼
Cloudflare Worker
    │ routes by session UUID
    ▼
Durable Object ──► SQLite
    │
    └── WebSocket snapshots ──► connected browsers
```

| Part                 | Technology                              |
| -------------------- | --------------------------------------- |
| Frontend             | Foldkit, TypeScript, Effect, CSS        |
| Request handling     | Cloudflare Workers                      |
| Session coordination | Durable Objects                         |
| Persistence          | SQLite inside each Durable Object       |
| Live updates         | Hibernatable WebSockets                 |
| Hosting              | Cloudflare Workers Static Assets        |
| Deployment           | Alchemy                                 |
| Local backend        | Miniflare and workerd                   |
| Build                | Vite                                    |
| Tests                | Vitest, Foldkit Story/Scene, Playwright |
| Toolchain            | mise and pnpm                           |

The browser is a client-rendered SPA. It does not optimistically change the count. The server commits each update, then broadcasts a versioned snapshot. Clients ignore older snapshots and disable edits while disconnected or awaiting an action response.

## Run locally

Install [mise](https://mise.jdx.dev/getting-started.html), then:

```sh
git clone https://github.com/NigelThorne/foldkit-demo.git
cd foldkit-demo
mise trust
mise install
mise exec -- pnpm install --frozen-lockfile
mise exec -- pnpm dev:shared
```

Open **http://127.0.0.1:5188**. Open the same session URL in another browser to try synchronization.

This runs the Worker, Durable Objects, SQLite and frontend locally. No Cloudflare account is required. Node 22.22.2 and pnpm 10.34.6 are pinned in `mise.toml`.

- Local state is stored in ignored `.local-state/`.
- Restart the command after source changes. This runner serves a build, not hot reload.
- Set `PORT` or `SESSION_STATE_DIR` to change the port or local data directory.
- Plain `pnpm dev` and `pnpm preview` serve only the frontend, without the session backend.

## Optional: isolated stacks

If you have Stack Manager installed, `.stack-manager.config` provides a separate Git worktree, port, dependencies and SQLite state for each stack. Stack Manager is optional and is not included in this repository; the standard local command above works without it.

```sh
stack-manager add "$PWD" --json
stack-manager up foldkit-demo --name little-wins-local --components app --json
stack-manager health little-wins-local --json
stack-manager urls little-wins-local --json
```

Ports start at 21880. Use the URL returned by the tool. Worktrees live under `../foldkit-demo.worktrees/` and start from committed `HEAD`; uncommitted changes are not copied.

`scripts/start-stack.sh` installs locked dependencies while preferring the local package cache, builds the app and starts Miniflare. It trusts the current worktree's `mise.toml` for that process. Startup logs are in `.local-state/stack-start.log` inside the worktree.

```sh
stack-manager stop little-wins-local --json
stack-manager start little-wins-local --json
```

Stopping preserves local sessions. Removing the worktree deletes them. Stop a crashed stack before starting it again. Each stack's sessions are separate from other stacks and production, even when their UUIDs match. No Cloudflare credentials are copied and no cloud deployment runs.

## Tests and checks

```sh
mise exec -- pnpm format:check
mise exec -- pnpm lint
mise exec -- pnpm typecheck
mise exec -- pnpm test
mise exec -- pnpm test:server
mise exec -- pnpm exec playwright install chromium --only-shell
mise exec -- pnpm test:e2e
```

The tests cover state transitions, accessible controls, socket cleanup, concurrent writes, session isolation, reconnection, malformed responses, lost HTTP responses and persistence across runtime restarts. Browser tests run in isolated headless Chromium at desktop and mobile sizes. They use port 5188 and do not touch a personal browser or production.

## Source map

| File                        | Responsibility                                          |
| --------------------------- | ------------------------------------------------------- |
| `src/model.ts`              | Tagged session, connection, mutation and failure states |
| `src/message.ts`            | Typed messages                                          |
| `src/main.ts`               | Commands, pure init/update and subscription wiring      |
| `src/view.ts`               | Rendering                                               |
| `src/session-connection.ts` | Socket ownership, cleanup and reconnects                |
| `src/shared/session.ts`     | Shared session ID and snapshot validation               |
| `src/entry.ts`              | Browser runtime startup                                 |
| `server/worker.ts`          | HTTP API and SQLite Durable Object                      |
| `scripts/local-server.mjs`  | Local Miniflare runtime                                 |
| `alchemy.run.ts`            | Cloudflare infrastructure                               |

## Deploy your own copy

Alchemy is pinned to `2.0.0-beta.81`; its APIs and Foldkit's APIs may change. The Effect-related dependency versions and overrides are intentional. Check compatibility before upgrading them separately.

The deployment declares a `LittleWins` stack with one `Website` Worker, a `SESSIONS` binding and a SQLite-backed `WinSession` Durable Object class. Static assets are served directly; `/api/*` routes invoke the Worker.

```sh
mise exec -- pnpm cloudflare:login
mise exec -- pnpm cloudflare:plan
# Review the target account, prod stage, resources and costs first.
mise exec -- pnpm cloudflare:deploy
```

These commands use your Alchemy `default` profile and the `prod` stage. Authenticate to your own Cloudflare account. The login script enables Alchemy's interactive UI; it does not approve deployment. No credentials or deployment state are included in this repository.

SQLite Durable Objects are compatible with Workers Free, but requests, compute and storage have quotas. Free-plan operations fail when quotas are exhausted; paid plans have included usage and overage charges. Review [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) and [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) before deploying.

### Keep deployment state private

Alchemy state lives in ignored `.alchemy/state/`. Back it up privately before and after deployments. Never commit `.alchemy/`, `.env` files, private keys or local SQLite databases. Do not delete deployment state to recover from an error or run concurrent deployments.

Once sessions exist, a rollback must retain the `WinSession` export, `SESSIONS` binding and storage migrations. Reverting to an assets-only infrastructure definition can delete session data. Roll back application behavior without removing those resources.
