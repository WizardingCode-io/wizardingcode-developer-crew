// The path kinds the registry and the gate planning read from a name alone (SP9 Task 5): an
// interface file by its extension or its folder segment, a design contract by its name and place.

import { expect, test } from "bun:test";
import { isDesignContractPath, isInterfacePath, isTestPath } from "../src/paths-kind.ts";

test("SP9-T5 AC-3: an interface file is also a .ts, .js, .mts or .mjs under a components, composables, layouts, pages, animations, transitions or motion segment, never under pages/api, server or hooks, nor a test, a spec, a story or a declaration", () => {
  for (const path of [
    "composables/useCart.ts",
    "app/components/Button.ts",
    "src/animations/fade.mjs",
    "src/motion/spring.js",
    "layouts/default.ts",
    "pages/checkout.ts",
    "transitions/slide.mts",
    "src/Components/Button.ts",
    "src\\components\\Button.ts",
    // The existing kinds stay.
    "src/App.vue",
    "styles/app.css",
    "resources/views/home.blade.php",
  ])
    expect(isInterfacePath(path), path).toBe(true);
  for (const path of [
    "pages/api/users.ts",
    "src/pages/api/x.ts",
    "server/api/cart.ts",
    "server/components/x.ts",
    "src/hooks/useCart.ts",
    "src/components/hooks/useX.ts",
    "src\\pages\\api\\x.ts",
    "components/Button.test.ts",
    "composables/useCart.spec.ts",
    "components/Button.stories.ts",
    "components/Button.d.ts",
    "src/components.ts",
    "src/mycomponents/a.ts",
    "src/services/cart.ts",
    "src/a.ts",
    "tests/App.vue.test.ts",
  ])
    expect(isInterfacePath(path), path).toBe(false);
});

test("SP9-T5 AC-4: a design contract is DESIGN.md at the root or under docs, a tailwind or uno config at the root or a workspace root, a *.tokens.json, or tokens and theme files at the root or under styles, assets or design; case-insensitive; a test never", () => {
  for (const path of [
    "DESIGN.md",
    "design.md",
    "docs/DESIGN.md",
    "docs\\DESIGN.md",
    "docs/design/DESIGN.md",
    "tailwind.config.ts",
    "Tailwind.Config.TS",
    "tailwind.config.mjs",
    "uno.config.ts",
    "packages/web/tailwind.config.js",
    "apps/shop/uno.config.ts",
    "design/brand.tokens.json",
    "src/styles/tokens.css",
    "src/styles/theme.ts",
    "assets/css/theme.css",
    "theme.ts",
    "src/design/theme.json",
    "styles/tokens.scss",
  ])
    expect(isDesignContractPath(path), path).toBe(true);
  for (const path of [
    "src/DESIGN.md",
    "docs/DESIGN.md.bak",
    "src/lib/tailwind.config.ts",
    "packages/web/src/tailwind.config.ts",
    "packages/web/src/uno.config.ts",
    "src/docs/DESIGN.md",
    "tokens.json",
    "src/theme.ts",
    "src/components/theme.css",
    "src/lib/styles.css",
    "tests/fixtures/brand.tokens.json",
    "theme.test.ts",
    "src/App.vue",
    "README.md",
  ])
    expect(isDesignContractPath(path), path).toBe(false);
  // A test path is read first, as isInterfacePath reads it.
  expect(isTestPath("tests/fixtures/brand.tokens.json")).toBe(true);
});
