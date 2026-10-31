import { spawn, spawnSync } from "node:child_process";
import { closeSync, mkdirSync, openSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { JourneyDeps } from "./journey.ts";
import { claudeBinary, killGroup, pluginDirOf, processGone, processStart } from "./open.ts";

/** What a journey does on this machine: the real calls behind `JourneyDeps`. */
export function realJourneyDeps(processEnv: NodeJS.ProcessEnv): JourneyDeps {
  const home = processEnv.HOME ?? "";
  const run = (cmd: string, args: string[], cwd?: string) =>
    spawnSync(cmd, args, { encoding: "utf8", ...(cwd ? { cwd } : {}), env: processEnv });
  return {
    now: () => new Date(),
    platform: process.platform,
    home,
    uid: process.getuid?.() ?? 0,
    node: process.execPath,
    bundle: process.argv[1] ?? "",
    pathEntries: (processEnv.PATH ?? "").split(":").filter(Boolean),
    pluginDir: pluginDirOf(processEnv),
    baseEnv: processEnv,
    spawn: (args, options) => {
      mkdirSync(dirname(options.log), { recursive: true });
      const fd = openSync(options.log, "a");
      try {
        const child = spawn(claudeBinary(processEnv), args, {
          cwd: options.cwd,
          env: options.env,
          detached: true,
          stdio: ["ignore", fd, fd],
        });
        child.on("error", () => {});
        child.unref();
        if (child.pid === undefined) return { failed: "the session did not start (no pid)" };
        return { pid: child.pid, processStart: processStart(child.pid) };
      } finally {
        closeSync(fd);
      }
    },
    isSession: (pid, start) => !processGone(pid) && (!start || processStart(pid) === start),
    kill: (pid) => killGroup(pid),
    launchctl: (args) => {
      run("launchctl", args);
    },
    writePlist: (path, text) => {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, text);
    },
    removePlist: (path) => rmSync(path, { force: true }),
    lsRemote: (root) => {
      const listed = run("git", ["ls-remote", "origin"], root);
      return listed.status === 0 ? listed.stdout : null;
    },
    notify: (text) => {
      run("osascript", ["-e", `display notification ${JSON.stringify(text)} with title "Crew"`]);
    },
  };
}
