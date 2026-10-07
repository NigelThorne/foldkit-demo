# Little wins

A small Foldkit SPA. Add up to ten wins, watch the progress fill, then start again.

No account, backend, storage, or external requests. Reloading resets the count.

## Run locally

```sh
mise install
mise exec -- pnpm install --frozen-lockfile
mise exec -- pnpm dev --host 127.0.0.1 --port 5187 --strictPort
```

Open http://127.0.0.1:5187. The project pins Node 22.22.2 and pnpm 10.34.6. The scaffolder's workspace settings do not work with pnpm 9.

## Checks

```sh
mise exec -- pnpm format:check
mise exec -- pnpm lint
mise exec -- pnpm typecheck
mise exec -- pnpm test
mise exec -- pnpm exec playwright install chromium --only-shell
mise exec -- pnpm test:e2e
```

`test:e2e` builds production assets and runs isolated headless Chromium checks at desktop and mobile sizes. It starts and stops its own preview server on port 5188. It never uses your personal browser.

## Structure

- `src/main.ts` defines the Schema Model, Messages, pure update and view.
- `src/entry.ts` starts the Foldkit runtime.
- `src/styles.css` contains the responsive layout and visual styling.
- `src/story.test.ts` checks state transitions and the ten-win cap.
- `src/scene.test.ts` checks interactions through Foldkit's view tree.
- `e2e/wins.spec.ts` checks the built app, keyboard input, reset, reload and horizontal overflow.

Foldkit 0.166.0 and Effect 4.0.0 are pinned. This is a browser-rendered demo, not an SSR/SSG proof. No Alchemy setup or deployment is included. The DevTools MCP relay is disabled.
