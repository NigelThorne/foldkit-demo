# Agent Development Notes

This is a Foldkit app. Read [`FOLDKIT.md`](./FOLDKIT.md) before writing any code in this project. It covers the architecture, the APIs, and the conventions the project is built on.

Foldkit owns `FOLDKIT.md` and replaces it whole on upgrade. This file is yours. Anything you want an agent to know about this project goes below, where an upgrade won't touch it.

`FOLDKIT.md` reads the line below to decide whether it has already offered to vendor the Foldkit source. Leave it in place.

subtree_prompted: false

## Project Notes

Little wins is a Foldkit SPA with shared URL sessions. Each session counts from zero to ten, then resets. A SQLite Durable Object persists and serializes changes; hibernatable WebSockets broadcast snapshots. Anyone with the unguessable session link can edit. No login or analytics. Client state updates remain pure Foldkit; the native Cloudflare Worker and Durable Object are the low-level platform boundary.

Alchemy preserves the existing Website resource and Worker URL. Consult README.md and get approval before cloud writes, including live smoke-test sessions. Never add a paid service or billing upgrade implicitly. Never remove or rename the WinSession class or SESSIONS binding during rollback, because sessions are persistent data.

Use the pinned tools with `mise exec -- pnpm <script>`. `pnpm dev:shared` starts the local-only Miniflare stack; plain Vite has no session backend. Tests include Story, Scene, Miniflare backend integration and isolated Playwright checks. Do not automate the user's desktop or personal browser. The DevTools MCP relay is disabled.

The full reference subtree is optional and has not been added; use installed types and release-matched docs for this small demo.
