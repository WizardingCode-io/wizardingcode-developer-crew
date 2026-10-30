#!/bin/sh
# evals/fixtures/flag-env.sh: the socketless environment of env-observed-proof (SP7b decision 19), shared by the ui
# cases (SP9 Task 14). A flag file under var/, ignored by git, stands for the running application: start writes it,
# health tests it, stop removes it. No port, so the sandbox's denial (finding #37) does not apply.
# Sourced by a case's fixture.sh; flag_env_write writes the script, flag_env_profile (after crew detect) sets the
# four keys of the profile's environment, as the user sets them.
flag_env_write() {
  mkdir -p scripts
  cat > scripts/env.mjs <<'ENV'
// The socketless environment: a flag under var/ stands for the running application; every call logs its verb.
import { appendFileSync, existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";

const flag = "var/up";
const verb = process.argv[2];
mkdirSync("var", { recursive: true });
appendFileSync("var/log.txt", `${verb}\n`);
if (verb === "start") writeFileSync(flag, "up\n");
else if (verb === "health") process.exit(existsSync(flag) ? 0 : 1);
else if (verb === "stop") {
  if (existsSync(flag)) unlinkSync(flag);
} else {
  console.error("usage: node scripts/env.mjs start|health|stop");
  process.exit(2);
}
ENV
}

flag_env_profile() {
  crew profile set environment.start "node scripts/env.mjs start" > /dev/null
  crew profile set environment.health "node scripts/env.mjs health" > /dev/null
  crew profile set environment.stop "node scripts/env.mjs stop" > /dev/null
  crew profile set environment.timeout 20 > /dev/null
}
