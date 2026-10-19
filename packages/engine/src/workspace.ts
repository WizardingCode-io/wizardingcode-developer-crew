import { existsSync } from "node:fs";
import { join } from "node:path";
import { readEnvRecord } from "./environment.ts";
import {
  heldMessages,
  inboxSummary,
  isLive,
  loadRegistry,
  type MailContext,
  mailContext,
  mailSelf,
  unanswered,
} from "./mail.ts";
import { mailStatus, threadOf } from "./mail-status.ts";
import { isAlive } from "./open.ts";
import { type CrewPaths, canonical, pathsFor, userDirOf } from "./paths.ts";
import { loadPolicy } from "./policy.ts";
import type { Message, Policy } from "./types.ts";
import { openItems } from "./work.ts";

/** The environment as the local record says, with no probe: a record is up, the engine's record of a dead pid is down, no record is none (SP7b decision 17). */
export type EnvironmentState = "up" | "down" | "none";

/** One project of the workspace as the registry and its records show it; nothing of it is run. */
export interface ProjectStatus {
  name: string;
  root: string;
  live: boolean;
  /** The folder the registry names holds no repository any more; the counts are then 0. */
  gone: boolean;
  items: number;
  unread: number;
  threads: number;
  priorities: number;
  environment: EnvironmentState;
}

export interface WorkspaceStatus {
  workspace: string;
  projects: ProjectStatus[];
}

/** One thread of a project's mail, for `crew status --json` and the mod (SP7b decision 18). */
export interface ThreadSummary {
  root: string;
  subject: string;
  messages: number;
  /** The thread's messages addressed to this project, sent and unanswered. */
  unread: number;
  /** A message of the thread is neither done, refused nor expired. */
  open: boolean;
}

const NO_WORKSPACE =
  "no workspace in policy.json (mail.workspace): crew workspace status lists the projects of one workspace";

const CLOSED = new Set(["done", "refused", "expired"]);

function isOpen(m: Message): boolean {
  return !CLOSED.has(mailStatus(m));
}

/** The messages whose priority was proposed and never confirmed or lowered (SP7 §9). */
function unconfirmedPriorities(messages: readonly Message[]): number {
  return messages.filter((m) => m.priority !== undefined && m.priorityDecision === undefined)
    .length;
}

export function environmentState(paths: CrewPaths): EnvironmentState {
  const record = readEnvRecord(paths);
  if (!record) return "none";
  if (record.managed && record.pid !== null && !isAlive(record.pid)) return "down";
  return "up";
}

/** The project's threads from the messages it holds, by root: the counts the mod draws. */
export function projectThreads(ctx: MailContext): ThreadSummary[] {
  const held = heldMessages(ctx);
  const byRoot = new Map<string, Message[]>();
  for (const m of held) {
    const root = threadOf(m);
    byRoot.set(root, [...(byRoot.get(root) ?? []), m]);
  }
  return [...byRoot.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([root, messages]) => ({
      root,
      subject: (messages.find((m) => m.id === root) ?? messages[0])?.subject ?? "",
      messages: messages.length,
      // The inbox's own rule, over the messages addressed to this project (a sender's copy is never unread).
      unread: messages.filter((m) => m.from.project !== ctx.self.project && unanswered(m)).length,
      open: messages.some(isOpen),
    }));
}

/**
 * Where every project of this workspace stands (SP7b decision 17), from the registry and each
 * project's records: live by its hooks, open items, unread mail, open threads, unconfirmed
 * priorities and the environment's record. A root is the folder the registry names, never a
 * parent found by walking up; one without a repository is gone. Nothing is run in any project.
 */
export function workspaceStatus(
  paths: CrewPaths,
  policy: Policy,
  env: NodeJS.ProcessEnv,
): WorkspaceStatus | { none: string } {
  const self = mailSelf(paths, policy, env);
  if (self.workspace === null) return { none: NO_WORKSPACE };
  const userDir = canonical(userDirOf(env));
  const projects = loadRegistry(paths.userDir)
    .projects.filter((p) => p.workspace === self.workspace && p.worktreeOf === undefined)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry): ProjectStatus => {
      const root = canonical(entry.root);
      const live = isLive(entry);
      const empty = {
        name: entry.name,
        root,
        live,
        items: 0,
        unread: 0,
        threads: 0,
        priorities: 0,
      };
      if (!existsSync(join(root, ".git"))) return { ...empty, gone: true, environment: "none" };
      const projectPaths = pathsFor(root, userDir);
      const ctx = mailContext(projectPaths, loadPolicy(projectPaths).policy, env);
      const held = heldMessages(ctx);
      return {
        ...empty,
        gone: false,
        items: openItems(projectPaths).length,
        unread: inboxSummary(ctx).unread,
        threads: projectThreads(ctx).filter((t) => t.open).length,
        priorities: unconfirmedPriorities(held),
        environment: environmentState(projectPaths),
      };
    });
  return { workspace: self.workspace, projects };
}
