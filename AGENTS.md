# Agent Development Notes

This is a Foldkit app. Read [`FOLDKIT.md`](./FOLDKIT.md) before writing any code in this project. It covers the architecture, the APIs, and the conventions the project is built on.

Foldkit owns `FOLDKIT.md` and replaces it whole on upgrade. This file is yours. Anything you want an agent to know about this project goes below, where an upgrade won't touch it.

`FOLDKIT.md` reads the line below to decide whether it has already offered to vendor the Foldkit source. Leave it in place.

subtree_prompted: false

## Project Notes

Little wins is a Foldkit SPA demo. Count from zero to ten, then reset. No persistence, backend or analytics. Alchemy declares an assets-only Cloudflare deployment; consult README.md and get approval before cloud writes. Never add a paid service or billing upgrade implicitly.

Use the pinned tools with `mise exec -- pnpm <script>`. Tests include Story, Scene and isolated Playwright checks. Do not automate the user's desktop or personal browser. The DevTools MCP relay is disabled.

The full reference subtree is optional and has not been added; use installed types and release-matched docs for this small demo.
