import { join } from "node:path";
import { loadEvidence, saveEvidence } from "../evidence.ts";
import { nowIso, readText, writeText } from "../fs.ts";
import { withLock } from "../lock.ts";
import { loadItemMail, reply } from "../mail.ts";
import { mailStatus } from "../mail-status.ts";
import { workDir } from "../paths.ts";
import { clearWorking } from "../state.ts";
import { PERSONALITIES, ROLE_NAMES, TEAMS, type TeamDef } from "../team.ts";
import type { Message, Personality, RoleRecord, TeamName } from "../types.ts";
import { LEAD_TEAMS } from "../validation.ts";
import { activeWork, loadWork, saveWork } from "../work.ts";
import { leaveNotice } from "./notices.ts";
import type { HookContext, HookPayload, HookResponse } from "./types.ts";

const PLUGIN_PREFIX = "wizardingcode-developer-crew:";
// The registry's names (SP7a): the mail's pattern and the hooks.json matcher derive from the same list.
const BARE_ROLE = new RegExp(`^(${ROLE_NAMES.join("|")})$`);

/**
 * The role behind an agent type: ours, with the plugin's prefix, as the SubagentStop matcher in
 * `plugins/core/hooks/hooks.json` names them (spike A4; the two lists agree, a test checks it);
 * null for any other agent.
 */
export function roleOf(agentType: string | undefined): string | null {
  if (!agentType?.startsWith(PLUGIN_PREFIX)) return null;
  const name = agentType.slice(PLUGIN_PREFIX.length);
  return BARE_ROLE.test(name) ? name : null;
}

/** The lens a debate role declares on its second line (`personality: <name>`, SP7 §6.3): one of the five, `unknown` for another word, nothing when absent (a reviewer). */
export function personalityOf(answer: string): Personality | "unknown" | null {
  const line = answer
    .split("\n")
    .slice(0, 3)
    .find((l) => /^personality:\s*\S/.test(l.trim()));
  if (!line) return null;
  const name = line.trim().slice("personality:".length).trim().toLowerCase();
  return (PERSONALITIES as readonly string[]).includes(name) ? (name as Personality) : "unknown";
}

/** A tech lead's first line: the team (the parser's own list) and what it validated. */
const LEAD_LINE = new RegExp(
  `^# (${LEAD_TEAMS}) lead's validation of \\S+: (spec|plan|delivery)\\b`,
);

/** The team and the subject a tech lead's answer names on its first line (`# <team> lead's validation of <id>: <spec|delivery>`), or null. */
export function leadAnswer(
  answer: string,
): { team: TeamName; what: "spec" | "plan" | "delivery" } | null {
  const match = LEAD_LINE.exec(unfenced(answer));
  if (!match) return null;
  return { team: match[1] as TeamName, what: match[2] as "spec" | "plan" | "delivery" };
}

/** The team a role belongs to in the registry (its lead or one of its members); null for the judge, the CTO and the debate roles. */
export function teamOf(agent: string): TeamName | null {
  for (const [name, def] of Object.entries(TEAMS) as [TeamName, TeamDef][])
    if (def.lead === agent || def.members.includes(agent)) return name;
  return null;
}

type Line = {
  type?: string;
  requestId?: string;
  message?: { content?: unknown; usage?: Record<string, unknown> };
};

function lines(transcriptPath: string | undefined): Line[] {
  const text = transcriptPath ? readText(transcriptPath) : null;
  if (text === null) return [];
  const out: Line[] = [];
  for (const raw of text.split("\n")) {
    if (!raw.trim()) continue;
    try {
      out.push(JSON.parse(raw) as Line);
    } catch {
      // a partial line at the end of a transcript still being written
    }
  }
  return out;
}

/**
 * The role's answer: the `message` of its last SubagentHandback call when it handed back that way
 * (since 2.1.271 the final text is then only a closing line; spike A5), else the final text the
 * payload gives.
 */
export function roleAnswer(
  transcriptPath: string | undefined,
  lastMessage: string | undefined,
): string {
  let handback: string | null = null;
  for (const line of lines(transcriptPath)) {
    if (line.type !== "assistant" || !Array.isArray(line.message?.content)) continue;
    for (const part of line.message.content as {
      type?: string;
      name?: string;
      input?: { message?: unknown };
    }[]) {
      if (
        part.type === "tool_use" &&
        part.name === "SubagentHandback" &&
        typeof part.input?.message === "string"
      )
        handback = part.input.message;
    }
  }
  return (handback ?? lastMessage ?? "").trim();
}

const SPENT = ["input_tokens", "output_tokens", "cache_creation_input_tokens"];

/**
 * The tokens the role spent: input, output and cache written, once per request (one usage object
 * repeats on every content block of a request; a cache read is not spent). Within a few percent of
 * the harness's own figure (finding #27).
 */
export function roleTokens(transcriptPath: string | undefined): {
  tokens: number;
  from: "transcript" | "none";
} {
  const perRequest = new Map<string, number>();
  let unnamed = 0;
  for (const line of lines(transcriptPath)) {
    const usage = line.type === "assistant" ? line.message?.usage : undefined;
    if (!usage) continue;
    const key = typeof line.requestId === "string" ? line.requestId : `line-${unnamed++}`;
    if (perRequest.has(key)) continue;
    let spent = 0;
    for (const field of SPENT)
      if (typeof usage[field] === "number") spent += usage[field] as number;
    perRequest.set(key, spent);
  }
  if (!perRequest.size) return { tokens: 0, from: "none" };
  return { tokens: [...perRequest.values()].reduce((a, b) => a + b, 0), from: "transcript" };
}

function unfenced(text: string): string {
  const fence = /^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/.exec(text.trim());
  return fence?.[1] ?? text.trim();
}

/** The end of the JSON object that opens at `open`, strings and their escapes skipped; -1 when it never closes. */
function closingBrace(text: string, open: number): number {
  let depth = 0;
  let quoted = false;
  for (let i = open; i < text.length; i++) {
    const c = text.charAt(i);
    if (quoted) {
      if (c === "\\") i++;
      else if (c === '"') quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return i;
  }
  return -1;
}

/**
 * The gates' ruling in a judge's answer: the whole answer, a fenced block, or the object that
 * carries `"rulings"` inside text the judge wrote around it (a judge on a clean diff tends to
 * explain first; finding #44). Null when the answer holds no such object.
 */
export function gatesRuling(answer: string): string | null {
  const body = unfenced(answer);
  const candidates = [body];
  const at = body.indexOf('"rulings"');
  const open = at >= 0 ? body.lastIndexOf("{", at) : -1;
  const close = open >= 0 ? closingBrace(body, open) : -1;
  if (close > open) candidates.push(body.slice(open, close + 1));
  for (const text of candidates) {
    try {
      const parsed: unknown = JSON.parse(text);
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        Array.isArray((parsed as { rulings?: unknown }).rulings)
      )
        return text;
    } catch {
      // not the gates' JSON
    }
  }
  return null;
}

/** Where an agent's first answer is saved, by the agent (`review-<gate>`, `judge`, `expert-<n>`, a critic) and the shape of the answer. */
export function answerFile(agent: string, answer: string): string {
  if (agent.startsWith("review-")) return `review/${agent.slice("review-".length)}.findings.md`;
  // A lead's validation and the CTO's plan sit beside the debate's files (SP7 §6.4, §6.5). The tech
  // lead is one agent for five teams: its answer's first line names the team and what it validated.
  if (agent === "tech-lead") {
    const lead = leadAnswer(answer);
    return lead
      ? `conclave/lead-${lead.team}${lead.what === "delivery" ? ".delivery" : ""}.md`
      : "conclave/tech-lead.md";
  }
  if (agent.startsWith("lead-")) return `conclave/${agent}.md`;
  if (agent === "cto") return "conclave/cto.md";
  if (agent === "judge") {
    if (gatesRuling(answer)) return "review/ruling.json";
    const validator = /^# Validator, ([a-z-]+)/.exec(unfenced(answer));
    return validator ? `conclave/validator-${validator[1]}.md` : "conclave/judge.md";
  }
  return `conclave/${agent}.md`;
}

/** The name a role's record carries: the role itself, except an expert, which takes the next number after the experts already recorded (`expert-<n>`). */
export function agentName(role: string, roles: RoleRecord[]): string {
  if (role !== "expert") return role;
  const experts = new Set(roles.map((r) => r.agent).filter((a) => /^expert-\d+$/.test(a)));
  return `expert-${experts.size + 1}`;
}

/** The lead's command for a reply the hook could not send, with the role's file attached. */
function sendByHand(workId: string, mid: string, agent: string, file: string | null): string {
  return `crew mail reply ${mid} "<text>" --as ${agent}${file ? ` --file .crew/work/${workId}/${file}` : ""}`;
}

/** Where the answer is, as a note says it. */
function whereSaved(saved: { file: string | null }): string {
  return saved.file ? `is saved at ${saved.file}` : "is in its transcript";
}

/** The two phrases a note needs: where the answer is saved, and what became of the reply a relayed question still waits for. */
function savedAndUnsentPhrases(
  workId: string,
  saved: { file: string | null; agent: string },
  pending: string | null,
): { where: string; unsent: string } {
  return {
    where: whereSaved(saved),
    unsent: pending
      ? `; the reply to ${pending} was not sent: send it with ${sendByHand(workId, pending, saved.agent, saved.file)}.`
      : ".",
  };
}

/**
 * A role of this plugin stopped: its answer is saved where its type says, its end and its tokens
 * go into the active item's evidence, a judge's stop ends a `role` wait, and a resumed role's
 * answer joins its earlier file, as the reply to a pending question when the lead relayed one
 * (SP2c §7, §9, §11). Never blocks the subagent; any other agent type is ignored. What could not
 * be saved or recorded, or was not there to save, is said in `systemMessage`, never dropped in
 * silence (risk review): the session then saves the answer from the transcript or runs the role
 * again, instead of reading an earlier round's file as the current answer.
 */
export function onSubagentStop(ctx: HookContext, payload: HookPayload): HookResponse {
  const role = roleOf(payload.agent_type);
  if (!role) return {};
  // The role is no longer working, whatever became of its answer (SP7 §14): cleared before any
  // check of the item or the transcript, so a stop with nothing to record still clears.
  clearWorking(ctx.paths, role);
  // What this hook says reaches the person in `systemMessage`; the session's model reads it as a
  // notice at its next tool call, prompt or blocked turn end (hooks/notices.ts).
  const tell = (text: string): HookResponse => {
    leaveNotice(ctx, text);
    return { systemMessage: text };
  };
  const active = activeWork(ctx.paths);
  if (!active?.work)
    return tell(`Crew: ${role} stopped with no active work item: its answer was not recorded.`);
  const id = active.work.id;
  const transcriptNote = payload.agent_transcript_path ? ` (${payload.agent_transcript_path})` : "";
  const nothingSaved = (reason: string): HookResponse =>
    tell(
      `Crew: ${role} stopped but nothing was saved for ${id} (${reason}): save its answer from the transcript${transcriptNote} by hand, or run the role again.`,
    );
  if (active.tampered) return nothingSaved(tamperedItem(id));
  // What the record got done before a failure, so the session is told what is on disk and what is not.
  const progress: Progress = { saved: null, recorded: false, pending: null, reply: null };
  try {
    // Several roles stop at once (the reviewers run in parallel): the item's folder is read and
    // written under its lock, so no record is lost and the integrity record stays in step. A lock
    // held past the wait saves nothing rather than racing, and says so.
    let note = withLock(
      workDir(ctx.paths, id),
      () => recordStop(ctx, id, role, payload, transcriptNote, progress),
      { what: "work folder" },
    );
    // The reply to a relayed question goes out after the record and outside the item's lock, so the
    // lock covers the record alone and the mailbox's waits never hold the other roles' stops (risk
    // review, round 14). A passing cause (a lock, a write) clears on its own; a refusal names what
    // the mail will not take.
    if (progress.pending && progress.reply && progress.saved) {
      const question = progress.pending;
      const { agent, file } = progress.saved;
      const relayed = relay(ctx, question, progress.reply, agent);
      progress.pending = null;
      if ("refused" in relayed)
        note = `Crew: ${agent}'s answer to ${question} ${whereSaved(progress.saved)} but the reply was not sent: ${relayed.refused}. Once that is cleared, send it with ${sendByHand(id, question, agent, file)}.`;
      else if (relayed.notes.length)
        note = `Crew: ${agent}'s answer to ${question} was sent, but ${relayed.notes.join("; ")}.`;
    }
    return note ? tell(note) : {};
  } catch (error) {
    const why = (error as Error).message;
    if (!progress.saved) return nothingSaved(why);
    const { agent } = progress.saved;
    // The reply to a relayed question goes out after the record, so a failure here left it unsent.
    const { where, unsent } = savedAndUnsentPhrases(id, progress.saved, progress.pending);
    if (!progress.recorded)
      return tell(
        `Crew: ${agent}'s answer ${where} but its end and tokens are not recorded (${why})${unsent}`,
      );
    return tell(
      `Crew: ${agent}'s answer ${where} and its end is recorded, but the role wait was not cleared (${why}): crew resume ${id} clears it${unsent}`,
    );
  }
}

interface Progress {
  saved: { file: string | null; agent: string } | null;
  recorded: boolean;
  /** The relayed question still waiting for this answer as its reply. */
  pending: string | null;
  /** The answer to send as that reply once the item's lock is released. */
  reply: string | null;
}

function tamperedItem(id: string): string {
  return `work.json changed outside the engine; crew accept ${id}`;
}

/**
 * Under the work folder's lock: the item and its evidence are read here, not before the lock, so
 * what is saved is what was there when the lock was taken. Returns the note for the session when
 * something was saved but not all of it, null when all went well; throws when it could not go on,
 * with `progress` saying how far it got.
 */
function recordStop(
  ctx: HookContext,
  id: string,
  role: string,
  payload: HookPayload,
  transcriptNote: string,
  progress: Progress,
): string | null {
  const dir = workDir(ctx.paths, id);
  const item = loadWork(ctx.paths, id);
  const work = item.work;
  if (!work) throw new Error(`work.json of ${id} could not be read`);
  if (item.tampered) throw new Error(tamperedItem(id));
  const read = loadEvidence(ctx.paths, id);
  const evidence = read.evidence;
  const roles = evidence.roles ?? [];
  const answer = roleAnswer(payload.agent_transcript_path, payload.last_assistant_message);
  const { tokens, from } = roleTokens(payload.agent_transcript_path);
  // The same agent again: a resumed role, with its first answer on disk or not; its name is the
  // one its first record took.
  const earlier = payload.agent_id ? roles.find((r) => r.agentId === payload.agent_id) : undefined;
  const agent = earlier?.agent ?? agentName(role, roles);
  let saved: { file: string | null; agent: string };
  let note: string | null = null;
  if (!answer) {
    // A role cut off, or one whose last turn was only a tool call: its end is recorded, no file is
    // written, and the session is told, so an earlier round's file is not read as this answer.
    saved = { file: null, agent };
    note = `Crew: ${agent} stopped with no answer (no hand-back and an empty last message): its end is recorded with no file; an earlier file of this role, if any, is not this round's answer. Run the role again or save its answer from the transcript${transcriptNote}.`;
  } else if (earlier?.file) {
    // A resumed role's answer joins its earlier file, never overwrites it.
    saved = { file: joinEarlierFile(dir, agent, answer), agent };
  } else {
    // The first answer: the role's own, or a resumed role's whose earlier stop left no file.
    const file = answerFile(agent, answer);
    // A ruling file holds the JSON alone, so `crew judgement record --ruling` reads it as it is.
    writeText(
      join(dir, file),
      file.endsWith(".json") ? `${gatesRuling(answer) ?? unfenced(answer)}\n` : `${answer}\n`,
    );
    saved = { file, agent };
  }
  progress.saved = saved;
  // A resumed role may have a relayed question waiting, whether or not its earlier stop left a
  // file: its answer is also the reply to it, sent once the end is recorded (SP2c §7).
  const pending = earlier && answer ? pendingQuestion(ctx, id, agent) : undefined;
  progress.pending = pending?.id ?? null;
  // Evidence changed outside the engine: the answer is on disk, the record would be overwritten
  // as the engine's own, so it is not made, nothing more is sent, and the session is told.
  if (read.tampered) {
    const tampered = `evidence.json of ${id} changed outside the engine (crew accept ${id})`;
    if (!answer)
      return `Crew: ${agent} stopped with no answer (no hand-back and an empty last message) and its end is not recorded: ${tampered}. Run the role again or save its answer from the transcript${transcriptNote}.`;
    const { where, unsent } = savedAndUnsentPhrases(id, saved, pending?.id ?? null);
    return `Crew: ${agent}'s answer ${where} but its end and tokens are not recorded: ${tampered}${unsent}`;
  }
  // The lens the role declared and the team the registry gives it (SP7 §6.3), when either exists.
  const personality = personalityOf(answer);
  const team =
    saved.agent === "tech-lead" ? (leadAnswer(answer)?.team ?? null) : teamOf(saved.agent);
  evidence.roles = [
    ...roles,
    {
      agent: saved.agent,
      ...(payload.agent_id ? { agentId: payload.agent_id } : {}),
      at: nowIso(),
      tokens,
      tokensFrom: from,
      file: saved.file,
      ...(personality ? { personality } : {}),
      ...(team ? { team } : {}),
    },
  ];
  saveEvidence(ctx.paths, id, evidence);
  progress.recorded = true;
  if (role === "judge" && work.awaiting === "role") {
    work.awaiting = null;
    saveWork(ctx.paths, work);
  }
  // The reply to the relayed question is the caller's to send, once this lock is released.
  if (pending) progress.reply = answer;
  return note;
}

/** The question the lead relayed to this role and nobody answered yet, if any. */
function pendingQuestion(ctx: HookContext, workId: string, agent: string): Message | undefined {
  return loadItemMail(ctx.paths, workId).box.messages.find(
    (m) =>
      m.relayed &&
      m.to.agent === agent &&
      (mailStatus(m) === "sent" || mailStatus(m) === "read") &&
      !m.replyTo,
  );
}

/**
 * A resumed role's answer joins its earlier file: a reviewer's under the one "Clarifications"
 * section of its findings file (the judge's questions), another role's after its earlier replies in
 * `conclave/<role>-reply.md`. The role's first answer is never overwritten (risk review, round 3).
 */
function joinEarlierFile(dir: string, agent: string, answer: string): string {
  if (agent.startsWith("review-")) {
    const file = answerFile(agent, answer);
    const current = (readText(join(dir, file)) ?? "").trimEnd();
    const heading = "\n## Clarifications";
    const body = current.includes(heading) ? current : `${current}\n${heading}`;
    writeText(join(dir, file), `${body}\n- ${answer.replace(/\n/g, "\n  ")}\n`);
    return file;
  }
  // A tech lead resumed for another round answers for one team: its reply joins that team's own
  // file, never one the leads would share (finding 78).
  const lead = agent === "tech-lead" ? leadAnswer(answer) : null;
  const file = lead
    ? `conclave/lead-${lead.team}${lead.what === "delivery" ? ".delivery" : ""}-reply.md`
    : `conclave/${agent}-reply.md`;
  const current = readText(join(dir, file));
  writeText(join(dir, file), current ? `${current.trimEnd()}\n\n${answer}\n` : `${answer}\n`);
  return file;
}

/**
 * The answer recorded in the mail as the role's reply, relayed by the lead (SP2c §7). When sent, the
 * notes of the answered pass (a copy of the question it could not change, named for the session to
 * read); else why not, a refusal or a mailbox that could not be written.
 */
function relay(
  ctx: HookContext,
  questionId: string,
  answer: string,
  agent: string,
): { refused: string } | { notes: string[] } {
  const notes: string[] = [];
  try {
    const sent = reply(ctx.mail, questionId, answer, { as: agent }, notes);
    return "refused" in sent ? { refused: sent.refused } : { notes };
  } catch (error) {
    return { refused: (error as Error).message };
  }
}
