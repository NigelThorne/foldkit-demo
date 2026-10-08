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

Foldkit 0.166.0 and Effect 4.0.0 are pinned. This is a browser-rendered demo, not an SSR/SSG proof. The DevTools MCP relay is disabled.

## Cloudflare deployment with Alchemy

`alchemy.run.ts` declares one assets-only Foldkit website. It uses the `LittleWins` stack, the `prod` stage and the `default` authentication profile. Confirm that profile is your personal Cloudflare account before deploying.

```sh
mise exec -- pnpm cloudflare:login
mise exec -- pnpm cloudflare:plan
# Only after reviewing the account and exact plan:
mise exec -- pnpm cloudflare:deploy
```

Login is interactive. The login script sets `ALCHEMY_TUI=1` because Alchemy otherwise mistakes a normal terminal with Pi in its PATH for an agent session and refuses to show prompts. This override is only for login, not deployment approval. Never paste credentials into chat or commit them. No billing upgrade, domain purchase, database, R2 bucket or cloud state service is configured. Cloudflare currently serves static assets with free unlimited requests and no storage charge. Extra server code or services would need a separate cost review.

State stays in the ignored `.alchemy/state/` directory. Keep a private backup after deployment; never delete it to fix an error or deploy from another checkout without the state. Do not run concurrent deployments. This local-state approach is for this solo demo, not shared CI.

Before release, run all checks above. After release, open the emitted URL and verify the count, limit and reset. For an update rollback, restore the prior application revision, rebuild and deploy using the same state/profile/stage after approval. Removing the demo uses `alchemy destroy --stage prod --profile default` only after explicit deletion approval.

Alchemy is pinned to `2.0.0-beta.81`. TypeScript 6 satisfies its Cloudflare tooling's peer range. The SQL driver overrides keep Alchemy's transitive dependencies on Effect 4.0.0, matching Foldkit's exact peer requirement. Hono is pinned to satisfy the frontend-frameworks peer dependency. Recheck these pins when upgrading.
