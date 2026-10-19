import { appendFileSync, existsSync, lstatSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";
import { nowIso } from "./fs.ts";
import { confinedDocument } from "./source.ts";
import { oneLine } from "./state.ts";
import type { QuestionChannel, QuestionChannelKind, QuestionRecord, WorkItem } from "./types.ts";

const KINDS: readonly QuestionChannelKind[] = ["cli", "ticket", "document", "mail"];

export function isQuestionChannelKind(value: unknown): value is QuestionChannelKind {
  return typeof value === "string" && (KINDS as readonly string[]).includes(value);
}

/** The questions file beside a document: `<documentPath>.questions.md`. */
export function questionsFile(documentPath: string): string {
  return `${documentPath}.questions.md`;
}

/**
 * Where a doubt goes (SP7 §10.3), in the order cli, ticket, document, mail: the conversation when
 * a person is present; the ticket (its url, else its id) when the source is a task manager; the
 * questions file beside a document; the project's own mail whenever the policy names a workspace.
 * Only the conversation is posted by being there; the rest is posted by the engine or the skill.
 */
export function questionChannels(
  work: WorkItem,
  context: { personPresent: boolean; workspace: string | null },
): QuestionChannel[] {
  const channels: QuestionChannel[] = [];
  if (context.personPresent) channels.push({ kind: "cli", posted: true, ref: null });
  const source = work.source;
  if (source?.channel === "task-manager")
    channels.push({ kind: "ticket", posted: false, ref: source.url ?? source.externalId ?? null });
  if (source?.channel === "document" && source.documentPath)
    channels.push({ kind: "document", posted: false, ref: questionsFile(source.documentPath) });
  if (context.workspace !== null) channels.push({ kind: "mail", posted: false, ref: null });
  return channels;
}

export function addQuestion(
  work: WorkItem,
  text: string,
  channels: QuestionChannel[],
): QuestionRecord {
  const questions = work.questions ?? [];
  const question: QuestionRecord = {
    id: `Q-${questions.length + 1}`,
    text,
    askedAt: nowIso(),
    channels: channels.map((c) => ({ ...c })),
    answer: null,
    by: null,
    answeredAt: null,
  };
  work.questions = [...questions, question];
  return question;
}

/**
 * Appends the question to the questions file beside the document, as a block quote (a `## Q-n`
 * inside the text forges no heading). Confined again at the write (security review of SP3 Task 4):
 * the document must still be a regular file inside the root's real path, the target's folder must
 * lie inside the real root, and a target that is a symlink is refused; nothing is written on a refusal.
 */
export function postDocumentQuestion(
  root: string,
  documentPath: string,
  question: QuestionRecord,
): { file: string } | { refused: string } {
  const document = confinedDocument(root, documentPath);
  if ("refused" in document) return document;
  const file = questionsFile(documentPath);
  const target = join(root, file);
  let rootReal: string;
  let parentReal: string;
  try {
    rootReal = realpathSync(root);
    parentReal = realpathSync(dirname(target));
  } catch {
    return { refused: `${file} cannot be written: its folder is not under the root` };
  }
  const rel = relative(rootReal, parentReal);
  if (rel.startsWith("..") || isAbsolute(rel))
    return { refused: `${file} resolves outside the root; nothing written` };
  try {
    if (lstatSync(target).isSymbolicLink())
      return { refused: `${file} is a symlink; nothing written` };
  } catch {
    // absent: created below
  }
  const quoted = question.text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  try {
    if (!existsSync(target)) appendFileSync(target, `# Questions on ${documentPath}\n`);
    appendFileSync(target, `\n## ${question.id} (${question.askedAt})\n\n${quoted}\n`);
  } catch (error) {
    return {
      refused: `${file} cannot be written: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  return { file };
}

/** The skill's record of a post it made (the ticket's comment, say): the channel posted with its reference. */
export function markPosted(
  work: WorkItem,
  id: string,
  kind: QuestionChannelKind,
  ref: string,
): QuestionRecord | { refused: string } {
  const question = work.questions?.find((q) => q.id === id);
  if (!question) return { refused: `no question ${id} on this item` };
  const channel = question.channels.find((c) => c.kind === kind);
  if (!channel)
    return {
      refused: `${id} has no ${kind} channel (${question.channels.map((c) => c.kind).join(", ")})`,
    };
  if (channel.posted)
    return {
      refused: `${id} was posted to ${kind} already${channel.ref ? ` (${channel.ref})` : ""}`,
    };
  channel.posted = true;
  channel.ref = ref;
  return question;
}

/** A person's answer, with who and when; an answered question is never answered again. */
export function answerQuestion(
  work: WorkItem,
  id: string,
  answer: string,
  by: string,
): QuestionRecord | { refused: string } {
  const question = work.questions?.find((q) => q.id === id);
  if (!question) return { refused: `no question ${id} on this item` };
  if (question.answer !== null)
    return { refused: `${id} was answered by ${question.by} (${question.answeredAt}) already` };
  const text = answer.trim();
  if (!text) return { refused: "an answer needs a text" };
  question.answer = text;
  question.by = by;
  question.answeredAt = nowIso();
  return question;
}

export function openQuestions(work: WorkItem): QuestionRecord[] {
  return (work.questions ?? []).filter((q) => q.answer === null);
}

/** Open first, then answered, each group in the order asked: how the status, the list and the mod show them. */
export function questionsSorted(work: WorkItem): QuestionRecord[] {
  const all = work.questions ?? [];
  return [...all.filter((q) => q.answer === null), ...all.filter((q) => q.answer !== null)];
}

/** `cli, ticket (<ref>), mail (M-1)`: the channels in one state, each with its reference when it has one. */
export function channelList(channels: readonly QuestionChannel[], posted: boolean): string {
  return channels
    .filter((c) => c.posted === posted)
    .map((c) => (c.ref ? `${c.kind} (${c.ref})` : c.kind))
    .join(", ");
}

/** `posted: cli, mail (M-1); to post: ticket (86c1)`: where the question went and what is left to the skill. */
export function channelsText(question: QuestionRecord): string {
  const posted = channelList(question.channels, true) || "none";
  const toPost = channelList(question.channels, false);
  return `posted: ${posted}${toPost ? `; to post: ${toPost}` : ""}`;
}

/** `cli (posted), ticket 86c1 (to post), mail M-1 (posted)`: the report's cell; `none` without a channel. */
export function questionChannelsCell(question: QuestionRecord): string {
  return (
    question.channels
      .map((c) => `${c.kind}${c.ref ? ` ${c.ref}` : ""} (${c.posted ? "posted" : "to post"})`)
      .join(", ") || "none"
  );
}

/** One line per question, as `crew question list` prints it. */
export function questionLine(question: QuestionRecord): string {
  const text = oneLine(question.text);
  if (question.answer === null)
    return `${question.id} · open · ${text} · ${channelsText(question)}`;
  return `${question.id} · answered by ${question.by} (${question.answeredAt}) · ${text} → ${oneLine(question.answer)}`;
}

/** The question as `--json` carries it: the record plus `open`. */
export function questionJson(question: QuestionRecord): QuestionRecord & { open: boolean } {
  return { ...question, open: question.answer === null };
}
