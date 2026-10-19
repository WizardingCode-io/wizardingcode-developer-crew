import { afterAll } from "bun:test";
import { removeTempDirs } from "./helpers.ts";

// Named by both bunfig.toml files (the root's and the engine's): the fixtures every test made are
// removed once the whole run ends (finding 74); WIZARDINGCODE_CREW_KEEP_FIXTURES=1 keeps them. The
// per-test timeout is not set here: bun 1.3.9 reads no timeout key from bunfig.toml and applies a
// preload's setDefaultTimeout to one file only, so the root script carries --timeout 30000 and the
// tests that run commands or sleep declare their own budget.
afterAll(() => {
  removeTempDirs();
});
