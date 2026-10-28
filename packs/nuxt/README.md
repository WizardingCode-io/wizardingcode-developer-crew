# wizardingcode-pack-nuxt

A stack pack for the WizardingCode Developer Crew: data the crew engine serves, never code. It holds one detector rule and one knowledge file the expert reads. It has no checklist, no skill, no agent and no hook; the crew skill reads what the engine prints for it (`crew pack files`), and the engine refuses it whole when a check fails (ADR 0010 of the core repository).

Verified against: Nuxt 4.x, Vitest 5.0.5, ESLint 10.13.0, @nuxt/eslint 1.17.0, @nuxt/test-utils 4.3.4 (the documentation read on 2026-10-28; the latest 4.x tag was v4.6.3, released on 2026-10-27).

## What it changes in a project

- **The profile.** In a folder whose `package.json` sits beside a `nuxt.config.ts`, `nuxt.config.js` or `nuxt.config.mjs`, the rule refines the core's Node target: the test gate `npx vitest run`, the lint gate `npx eslint .`, the type-check gate `npx nuxi typecheck` and the scoped test template `npx vitest related {files} --run`, and the target is tagged `nuxt`. The package manager stays the core's (the lockfile's, or the `packageManager` field of `package.json`), and so do the gates the rule does not name: the `build` script, an end-to-end runner proposed from a Playwright or Cypress config, and the environment the core proposes from the `dev` script on port 3000. Each of the pack's commands enters the profile as proposed and runs only once a person confirmed it in that project (`crew profile confirm <gate>`; `crew profile confirm test` confirms the scoped template with the test gate); until then the gate says `unavailable: pack wizardingcode-pack-nuxt's command is not confirmed`, and `crew tdd` without `--` refuses it with the same text.
- **`npx` and a package the project has not installed.** `npx` runs the project's own binary under `node_modules`, and for a package that is not installed it fetches one from the registry. Confirm a command only in a project that has installed what it names (`vitest`; `eslint` with the `@nuxt/eslint` module; `vue-tsc` or Golar for the type check): the hold above is the guard, and a project that runs its checks another way sets its own command (`crew profile set test "<cmd>"`) or unsets the gate (`crew profile unset lint`).
- **The type check.** The 4.x documentation writes `npx nuxt typecheck`; the `nuxt` package ships both bins, `nuxi` and `nuxt`, so the rule's `npx nuxi typecheck` runs the same command. It runs vue-tsc (or Golar) over the project's generated project references, offers to install a missing checker, keeps its cache under `.nuxt/cache/typecheck` and sets `NODE_ENV` to `production` for the run; `nuxt prepare` or a dev server run writes the `.nuxt` folder it reads.
- **The lint.** `eslint .` reads the flat config `eslint.config.mjs` that the `@nuxt/eslint` module writes at the first server start; it imports `./.nuxt/eslint.config.mjs`, so the `.nuxt` folder exists before the first lint. A project without the module sets its own lint command or unsets the gate.
- **The expert.** When the item's changed files sit in the tagged target, `crew pack files knowledge --item <id>` prints `knowledge/nuxt.md` and the expert reads it before proposing.
- **No checklist.** A Nuxt page is a screen: the core's `screen` checklist and the frontend pack's `screen`, `motion` and `design-contract` checklists serve the gap round. Install `wizardingcode-pack-frontend` beside this pack and set its template and specialists in the project's policy for the pages (`{ "team": { "template": "frontend", "specialists": ["wizardingcode-pack-frontend:frontend", "wizardingcode-pack-frontend:motion"] } }`). A checklist for a Nitro handler is a later revision of this pack.

## Install

From the WizardingCode marketplace, with the core plugin at 0.16.0 or later, the release that ships this pack (the brace marker and the empty package manager of the rule are the core's since SP9 Task 9; `pack.json`'s `core` bound is the engine's version at each release, written by the release script, so until that release it carries the engine's current one):

```sh
claude plugin install wizardingcode-pack-nuxt@wizardingcode-plugins
```

The engine registers it at the next session start (`crew pack list` shows it). From a checkout of the core repository, in any runtime:

```sh
crew pack add packs/nuxt
```

## The cases

The pack ships with the cases that show its difference (`plugins/core/evals` of the core repository, SP9 Task 11): `pack-nuxt-refines-the-gates` (a Nuxt-shaped Node tree with the pack registered: the profile's three gates proposed with the pack's name, `test=npx vitest run [proposed] (pack wizardingcode-pack-nuxt)`, the target tagged `nuxt`, the knowledge path printed by `crew team`; the kit's sandbox has no `npx`, so the prompt relays, as the person's decision, `node` commands over faked local packages committed in the fixture for the three gates, and the gate runs green) beside `pack-nuxt-absent` (the same tree without the pack: the core's Node target, no pack mark, no tag, no knowledge path). Their figures are in the item's evals record, `docs/evals/2026-10-28-sp9-task-11-results.md` of the core repository: on 2026-10-28, one run each with the plugin, the with case passed every grader at its first run (the pack's proposals printed with its name, the relayed `node` test command confirmed in the profile, the tag, the gate green, the knowledge path, the util added, an honest ending that names the stubs for what they are) and the absent case passed its own at its first (no pack gate, no pack in the profile, no tag, no knowledge path, the util added, an honest ending), so the pair's difference is the pack's three commands, its tag and its knowledge file alone, as the pack claims.

## Sources read on 2026-10-28

Every URL the pack's files name, with the claim it supports.

- https://nuxt.com/docs/4.x/getting-started/upgrade · the `app/` source directory (`srcDir` `app`, the `~` alias, the folders under it and the ones at the root, the v3 layout kept with `srcDir: '.'` and `dir: { app: 'app' }`); the data-fetching changes (`data` a shallow ref, `data` and `error` `undefined`, shared keys and the options that must agree, `dedupe` `cancel` or `defer`, `pending` only while pending, `immediate: false` and the first fetch, `getCachedData`'s `ctx.cause`, the `experimental` flags that revert); `route.name` and `pages:resolved`; the TypeScript project references and `noUncheckedIndexedAccess`; `future.compatibilityVersion: 5`; the skeleton's `typecheck` script with `vue-tsc -b --noEmit`.
- https://nuxt.com/docs/4.x/guide/concepts/auto-imports · the scanned folders, `server/utils/`, `#imports`, `imports.autoImport`, `imports.scan`, `components.dirs`, `imports.presets`, the `Nuxt instance is unavailable` error, `ref` and `computed` not unwrapped in a template.
- https://nuxt.com/docs/4.x/directory-structure/app/composables · top-level files alone scanned, the `index.ts` re-export, `imports.dirs`, the default export named after the file, the types from `.nuxt/imports.d.ts` after `nuxt prepare`, `nuxt dev` or `nuxt build`.
- https://nuxt.com/docs/4.x/directory-structure/app/utils · `utils/` scanned as `composables/` and different in meaning alone, the Vue part of the app alone, `server/utils` in the server alone, `app/types/`, `server/types/` and `shared/types/`.
- https://nuxt.com/docs/4.x/getting-started/data-fetching · when to use `useFetch`, `useAsyncData` and `$fetch`; a bare `$fetch` in setup fetching twice; the keys; `server`, `lazy`, `immediate`, `default`, `pick`, `transform`, `watch`, `deep`, `getCachedData`; `status`, `refresh`, `execute`, `clear`; `useLazyFetch` and `useLazyAsyncData`; `useRequestFetch` and `useRequestHeaders`.
- https://nuxt.com/docs/4.x/api/composables/use-fetch · called in setup, a plugin or a route middleware; the payload; `deep` default `false`; `dedupe` default `'cancel'`; `timeout`; the reserved name and `createUseFetch`; a string `data` from `@vueuse/core`'s `useFetch`.
- https://nuxt.com/docs/4.x/getting-started/state-management · `useState` serialised to JSON, no class, function or symbol, no `ref` outside setup, the composable wrapper, `callOnce`, `clearNuxtState`, Pinia.
- https://nuxt.com/docs/4.x/api/components/client-only · `<ClientOnly>`, `fallback` and `placeholder` with their tags, the default slot tree-shaken out of the server build, a template ref watched once.
- https://nuxt.com/docs/4.x/api/utils/define-page-meta · the compiler macro for `app/pages/`, its keys, `name` from the path, `viewTransition` experimental, `groups` from 4.3, custom keys.
- https://nuxt.com/docs/4.x/directory-structure/server · `server/api/`, `server/routes/`, `server/middleware/`, `server/plugins/`, `server/utils/`, `defineEventHandler`, the method suffixes and the 405, the bracket params, the catch-all, `readBody`, `getQuery`, `parseCookies`, `createError`, `setResponseStatus`, `sendRedirect`, `useRuntimeConfig(event)`, no import across `server/` and `app/`, `server/types/`, the server's project reference.
- https://nuxt.com/docs/4.x/guide/going-further/runtime-config · private and `public` keys, the `NUXT_` overrides, `destr`, the `.env` file read by the CLI and not by the built server, `useRuntimeConfig` in the app, a plugin and a server route, `runtimeConfig.app` reserved, the `nuxt/schema` augmentation.
- https://nuxt.com/docs/4.x/guide/concepts/rendering · universal rendering and hydration, `ssr: false`, `routeRules` with `prerender`, `swr` and `isr`, not with `nuxt generate`, `import.meta.prerender`.
- https://nuxt.com/docs/4.x/api/nuxt-config · `srcDir` `app`, `dir.app`, `typescript.typeCheck` (`false`, `true`, `'build'`), `typescript.strict`, `ssr`, `app.pageTransition` and `app.layoutTransition` `false`, `imports.scan`, `components.dirs`, `runtimeConfig`'s default, `devServer.port` 3000.
- https://nuxt.com/docs/4.x/getting-started/testing · `@nuxt/test-utils`, its peers, `defineVitestProject`, the projects by `include`, the `nuxt` environment and its options, the runtime helpers, the e2e helpers, the runners, the one-file rule.
- https://nuxt.com/docs/4.x/api/commands/typecheck · `nuxt typecheck` running vue-tsc or Golar, the install offer, `--cwd`, `--logLevel`, `--dotenv`, `--extends`, `--checker`, `--build`, `--incremental`, the cache, `NODE_ENV`, the heap limit.
- https://nuxt.com/docs/4.x/getting-started/installation · Node.js 22.x or newer, an even version, the create command per manager, the dev server at port 3000.
- https://vuejs.org/guide/scaling-up/ssr.html · hydration, the three causes of a mismatch (invalid nesting, random values, time zones), the recovery, `data-allow-mismatch` in Vue 3.5, cross-request state pollution and a fresh app per request.
- https://eslint.nuxt.com/packages/module · the module's install, the generated `eslint.config.mjs` with `withNuxt`, `autoInit`, the `lint` script, `config.stylistic`, `config.standalone`, `checker`, flat config from ESLint 8.45 and the default since 9.
- https://vitest.dev/guide/cli · `vitest`, `vitest run`, `vitest watch`, `vitest related` with `--run`, the file filter, `--reporter`, `--passWithNoTests`, `--bail`.
- https://github.com/nuxt/nuxt/releases · the latest tag on the day, v4.6.3 (27 Oct).
- https://registry.npmjs.org/nuxt · nuxt 4.6.3 (2026-10-27), the bins `nuxi` and `nuxt`, the engines `^22.22.3 || ^24.15.0 || >=26.0.0`.
- https://registry.npmjs.org/vitest · vitest 5.0.5 (2026-10-15), the engines `^22.12.0 || ^24.0.0 || >=26.0.0`.
- https://registry.npmjs.org/eslint · eslint 10.13.0 (2026-10-16).
- https://registry.npmjs.org/@nuxt/eslint · @nuxt/eslint 1.17.0 (2026-08-06).
- https://registry.npmjs.org/@nuxt/test-utils · @nuxt/test-utils 4.3.4 (2026-10-16), the engines `^20.19.0 || ^22.12.0 || >=24.0.0`.
- https://registry.npmjs.org/@nuxt/cli · @nuxt/cli 4.0.1 (2026-10-09), the bins `nuxi`, `nuxt`, `nuxi-ng` and `nuxt-cli`.
- https://registry.npmjs.org/vue-tsc · vue-tsc 3.3.13 (2026-10-10).
- https://github.com/WizardingCode-io/wizardingcode-developer-crew · the core repository (the plugin manifest's homepage and repository).
- https://wizardingcode.io · the author.

## Licence

MIT, as the core.
