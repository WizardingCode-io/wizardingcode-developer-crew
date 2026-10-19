// plugins/core/hooks/register.js
// The crew mod: the live view of the engine's state inside Claude Code. It enforces nothing;
// the settings hooks and the `crew` command carry the guarantee. This file only asks the
// engine what it knows and draws it. The hooks module has no Node APIs, so the engine is
// reached by running the bundled CLI with `$.process.run`.

const PANE = 'crew'

// The last answer of `crew status --json`, or null before the first refresh
let status = null
// The last reason a refresh produced no status, or null
let error = null
// The last answer of `crew mail inbox --json`, fetched for the panel alone, or null
let inbox = null
// The last answer of `crew workspace status --json`, fetched for the panel alone, or null (SP7b Task 6)
let workspace = null

export function register(on) {
  on('session.start', async ($, e, next) => {
    await refresh($)
    // Registered last, and wrapped, so a taken name cannot skip the rest of the hook
    try {
      await $.command.register({
        name: 'crew',
        description: 'Crew: the state of the active work item, the panel, or the mode',
        argumentHint: '[status|panel|mail|todo|team|mode <partner|guide|pilot>]',
      })
    } catch {
      try {
        await $.ui.log('could not register /crew: it is taken by another plugin')
      } catch {
        /* a log line that fails must not take the session start with it */
      }
    }
    return next(e)
  })

  // A gating hook: a failure here must not hold up the session the settings hooks start
  on('classic.SessionStart', { source: ['clear', 'resume', 'fork'] }, async ($, e, next) => {
    try {
      await refresh($)
      return await next(e)
    } catch {
      return {}
    }
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'crew' }, async ($, e) => {
    const words = (e.args || '').trim().split(/\s+/).filter(Boolean)
    const verb = words[0] || 'status'
    if (!['status', 'panel', 'mail', 'todo', 'team', 'workspace', 'thread', 'brief', 'questions', 'mode'].includes(verb)) {
      return { text: 'Crew: unknown verb; use /crew [status|panel|mail|todo|team|workspace|thread <id>|brief T-n|questions|mode <partner|guide|pilot>]' }
    }
    // The workspace, a thread and a todo's brief come from the engine's own commands (SP7b Task 6).
    if (verb === 'workspace') return { text: crewText(await runCrew($, ['workspace', 'status'])) }
    if (verb === 'thread') {
      if (!words[1]) return { text: 'Crew: /crew thread needs a message id' }
      return { text: crewText(await runCrew($, ['mail', 'thread', words[1]])) }
    }
    // The item's questions, open first, from the engine's own command (SP3 Task 4)
    if (verb === 'questions') {
      await refresh($)
      if (!hasWork()) return { text: 'Crew: no active work item. A change starts with the crew skill.' }
      return { text: crewText(await runCrew($, ['question', status.active, 'list'])) }
    }
    if (verb === 'brief') {
      if (!words[1]) return { text: 'Crew: /crew brief needs a task (T-n)' }
      await refresh($)
      if (!hasWork()) return { text: 'Crew: no active work item. A change starts with the crew skill.' }
      return { text: crewText(await runCrew($, ['task', status.active, 'brief', words[1], '--print'])) }
    }
    if (verb === 'panel') {
      await refresh($)
      await refreshInbox($)
      await refreshWorkspace($)
      let placed
      try {
        placed = await $.ui.open({ id: PANE, title: 'Crew', focus: true, closeOnEscape: true })
      } catch (err) {
        try {
          await $.ui.toast('Crew: the panel could not open: ' + reasonOf(err))
        } catch {
          /* a toast that fails must not take the command with it */
        }
        return {}
      }
      if (placed && placed.isPlaced === false) {
        try {
          await $.ui.toast('Crew: the panel waits for a wider terminal' + (placed.reason ? ': ' + placed.reason : ''))
        } catch {
          /* a toast that fails must not take the command with it */
        }
      }
      return {}
    }
    if (verb === 'todo') {
      await refresh($)
      return { text: todoText() }
    }
    if (verb === 'team') {
      await refresh($)
      return { text: teamText() }
    }
    if (verb === 'mail') return { text: crewText(await runCrew($, ['mail', 'inbox'])) }
    if (verb === 'mode') return { text: crewText(await runCrew($, ['mode', ...words.slice(1)])) }
    await refresh($)
    return { text: statusText() }
  })

  on('turn.complete', async ($, e, next) => {
    await refresh($)
    if (!hasWork()) return next(e)
    return { text: verdictLine() }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // Other mods draw here too; their tree stays below ours
    const theirs = await next(e)
    if (!hasWork()) return theirs
    const { Box, Text } = $.ui.resolve(e)
    return Box({
      flexDirection: 'column',
      children: [Text({ dimColor: true, wrap: 'truncate-end', children: [stripText()] }), theirs],
    })
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    return paneTree($, e)
  })
}

// The whole pane, built from the last status each time Claude Code asks for it
function paneTree($, e) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const redraw = () => $.ui.invalidate('ui.render')
  const buttons = Box({
    flexDirection: 'row',
    columnGap: 3,
    children: [
      Button({
        key: 'refresh',
        label: 'Refresh',
        hotkey: 'r',
        plain: true,
        onPress: async () => {
          await refresh($)
          await refreshInbox($)
          await refreshWorkspace($)
          redraw()
        },
      }),
      Button({
        key: 'close',
        label: 'Close',
        hotkey: 'q',
        plain: true,
        onPress: async () => {
          await $.ui.close({ id: PANE })
        },
      }),
    ],
  })
  const lines = []
  if (error) {
    lines.push(Text({ children: [error] }))
  } else if (!hasWork()) {
    lines.push(Text({ children: ['No active work item. A change starts with the crew skill.'] }))
  } else {
    lines.push(Text({ bold: true, children: [status.active + ' "' + status.title + '"'] }))
    lines.push(Text({ dimColor: true, children: [phasesText()] }))
    // The checkout's branch, from an engine that prints it (0.6.0)
    if (status.branch) lines.push(Text({ dimColor: true, children: ['Branch: ' + status.branch] }))
    // The questions first, open before answered (SP3 Task 4): a doubt a person has to answer; an
    // engine without the field draws no block
    if (Array.isArray(status.questions) && status.questions.length) {
      lines.push(Text({ dimColor: true, children: ['Questions'] }))
      for (const q of status.questions) lines.push(Text({ children: [questionRow(q)] }))
    }
    lines.push(Text({ children: [' '] }))
    for (const c of status.criteria || []) {
      lines.push(Text({ children: [c.id + ' ' + c.kind + ' · ' + c.tdd + ' · ' + c.text] }))
    }
    for (const d of status.decisions || []) {
      lines.push(Text({ children: [decisionText(d)] }))
    }
    for (const o of status.objections || []) {
      const open = o.severity === 'blocking' && o.status === 'open'
      lines.push(open ? Text({ color: 'red', children: [objectionText(o)] }) : Text({ children: [objectionText(o)] }))
    }
    if (status.debate && status.debate !== 'none') {
      lines.push(Text({ dimColor: true, children: ['debate ' + status.debate] }))
    }
    lines.push(Text({ children: [' '] }))
    for (const r of status.runs || []) {
      lines.push(Text({ children: [r.gate + ' (' + r.target + '): ' + r.status + ' in ' + (r.durationMs / 1000).toFixed(1) + 's' + (r.reason ? ' (' + r.reason + ')' : '')] }))
    }
    for (const j of status.judgement || []) {
      lines.push(Text({ children: [judgementText(j)] }))
    }
    // The seats, the todo with its checks and the roles working, from an engine that prints them
    // (0.6.0, SP7 §14); an older engine's status has none of the fields and draws as before
    if (status.team && status.team.length) {
      lines.push(Text({ dimColor: true, children: ['Team (primary ' + status.primaryTeam + ')'] }))
      for (const s of status.team) lines.push(Text({ children: [s.role + ' · ' + s.reason] }))
    }
    if (status.todo && status.todo.total) {
      lines.push(Text({ dimColor: true, children: ['Todo ' + status.todo.done + '/' + status.todo.total] }))
      for (const t of status.todo.items) lines.push(Text({ children: [todoRow(t)] }))
    }
    if (status.working && status.working.length) lines.push(Text({ children: ['Working: ' + workingNames()] }))
    // The tasks of the item and its mail, from an engine that prints them (0.5.0); an older engine's
    // status has neither field and draws as before
    if (status.tasks && status.tasks.length) {
      lines.push(Text({ dimColor: true, children: ['Tasks'] }))
      for (const t of status.tasks) lines.push(Text({ children: [taskText(t)] }))
    }
    if (Array.isArray(status.threads)) {
      lines.push(Text({ children: ['Mail: ' + threadsLine()] }))
      for (const t of status.threads) lines.push(Text({ children: [threadRow(t)] }))
    } else if (status.mail) {
      lines.push(Text({ children: ['Mail: ' + status.mail.unread + ' unread, ' + status.mail.answered + ' answered'] }))
      if (inbox && inbox.message) {
        for (const line of String(inbox.message).split('\n').slice(1)) lines.push(Text({ children: [line.trim()] }))
      }
    }
    // The workspace's projects, from an engine that prints them (0.7.0)
    if (workspace && workspace.message) {
      lines.push(Text({ dimColor: true, children: ['Workspace ' + workspace.workspace] }))
      for (const line of String(workspace.message).split('\n').slice(1)) lines.push(Text({ children: [line.trim()] }))
    }
    for (const reason of status.unproven || []) {
      lines.push(Text({ color: 'red', children: ['✗ ' + reason] }))
    }
    for (const s of status.skips || []) {
      lines.push(Text({ dimColor: true, children: ['skipped ' + s.step + ': ' + s.reason] }))
    }
    lines.push(Text({ children: [' '] }))
    lines.push(Text({ bold: true, children: [verdictLine()] }))
  }
  return Box({ flexDirection: 'column', children: [...lines, Text({ children: [' '] }), buttons] })
}

// "? Q-2 · And the colour? · to post: ticket (86c1)" or "✓ Q-1 · Gold or silver first? → Gold"
function questionRow(q) {
  const list = (posted) => (q.channels || []).filter((c) => !!c.posted === posted).map((c) => (c.ref ? c.kind + ' (' + c.ref + ')' : c.kind)).join(', ')
  if (q.open) {
    const toPost = list(false)
    return '? ' + q.id + ' · ' + q.text + ' · ' + (toPost ? 'to post: ' + toPost : 'posted: ' + (list(true) || 'none'))
  }
  return '✓ ' + q.id + ' · ' + q.text + ' → ' + q.answer
}

// "T-2 · AC-2 · crew/<short>/T-2 · <child> · proven · merged abc1234"; a task with no reply yet has no child
function taskText(t) {
  const task = t.task || {}
  return task.task + ' · ' + (task.criteria || []).join(',') + ' · ' + task.branch + ' · ' + (task.child || 'no child yet') + ' · ' + t.verdict + (task.mergedAt ? ' · merged ' + String(task.mergeCommit || '').slice(0, 7) : '')
}

// "✓ T-1 · AC-1 · briefed · inline" or "○ T-2 · AC-2 · handed"
function todoRow(t) {
  return (t.state === 'briefed' ? '✓ ' : '○ ') + t.task + ' · ' + (t.criteria || []).join(',') + ' · ' + t.state + (t.inline ? ' · inline' : '')
}

// The text /crew todo prints: the todo of the active item, or why there is none
function todoText() {
  if (error) return 'Crew: ' + error
  if (!hasWork()) return 'Crew: no active work item. A change starts with the crew skill.'
  if (!status.todo) return 'Crew: this engine prints no todo (0.6.0 or later does)'
  if (!status.todo.total) return 'Crew: no todo yet for ' + status.active + " (the plan's tasks appear here)"
  return ['Crew: todo ' + status.todo.done + '/' + status.todo.total + ' of ' + status.active, ...status.todo.items.map((t) => '  ' + todoRow(t))].join('\n')
}

// The text /crew team prints: every seat with its reason
function teamText() {
  if (error) return 'Crew: ' + error
  if (!hasWork()) return 'Crew: no active work item. A change starts with the crew skill.'
  if (!status.team) return 'Crew: this engine prints no team (0.6.0 or later does)'
  if (!status.team.length) return 'Crew: team of ' + status.active + ': no seat (fast route)'
  return 'Crew: team of ' + status.active + ' (primary ' + status.primaryTeam + '): ' + status.team.map((s) => s.role + ' (' + s.reason + ')').join(', ')
}

// " · todo 1/2" or ''
function todoPart() {
  return status.todo && status.todo.total ? ' · todo ' + status.todo.done + '/' + status.todo.total : ''
}

// " · working review-code-quality, judge" or ''
function workingPart() {
  return status.working && status.working.length ? ' · working ' + status.working.map((w) => w.agent).join(', ') : ''
}

// "review-code-quality (Review the diff), judge"
function workingNames() {
  return (status.working || []).map((w) => (w.description ? w.agent + ' (' + w.description + ')' : w.agent)).join(', ')
}

// " · waiting for the user", " · waiting for the roles", " · waiting for a reply to M-…", or '' when the item waits for nothing
function waitingText() {
  if (!status) return ''
  if (status.awaiting === 'user') return ' · waiting for the user'
  if (status.awaiting === 'role') return ' · waiting for the roles'
  if (status.awaiting === 'mail') return ' · waiting for a reply to ' + (status.awaitingMessage || 'a message')
  return ''
}

// "receive › recognize › [build] › gate › deliver", the current phase in brackets
function phasesText() {
  return (status.phases || []).map((p) => (p === status.phase ? '[' + p + ']' : p)).join(' › ')
}

// "D-1 Erasure or deactivation? → deactivation (by user)", or "→ unanswered"
function decisionText(d) {
  const answer = d.answer ? d.answer + (d.by ? ' (by ' + d.by + ')' : '') : 'unanswered'
  return d.id + ' ' + d.question + ' → ' + answer
}

// "O-1 blocking open · <text>"; an engine before SP2b sends no text
function objectionText(o) {
  return o.id + ' ' + o.severity + ' ' + o.status + (o.text ? ' · ' + o.text : '')
}

const JUDGEMENT_WORDS = { planned: 'planned', proven: 'proven', 'not-proven': 'not proven', 'not-run': 'not run', stale: 'stale', skipped: 'skipped' }

// "code-quality: proven (0 findings)", "ui-ux: not run (no browser)", "security: planned"
function judgementText(j) {
  const word = JUDGEMENT_WORDS[j.status] || j.status
  if (j.status === 'planned') return j.gate + ': ' + word
  if (j.status === 'not-run' || j.status === 'stale' || j.status === 'skipped') return j.gate + ': ' + word + (j.reason ? ' (' + j.reason + ')' : '')
  const n = j.findings || 0
  return j.gate + ': ' + word + ' (' + n + (n === 1 ? ' finding)' : ' findings)')
}

// "decisions 2 (1 unanswered) · objections 1 (1 blocking open) · debate open", or '' when the item has none
function conclaveText() {
  const decisions = status.decisions || []
  const objections = status.objections || []
  const parts = []
  if (decisions.length) parts.push('decisions ' + decisions.length + ' (' + decisions.filter((d) => !d.answer).length + ' unanswered)')
  if (objections.length) parts.push('objections ' + objections.length + ' (' + objections.filter((o) => o.severity === 'blocking' && o.status === 'open').length + ' blocking open)')
  if (status.debate && status.debate !== 'none') parts.push('debate ' + status.debate)
  return parts.join(' · ')
}

// "Crew: <the engine's message>", or the one line that says the engine gave none
function crewText(answer) {
  return 'Crew: ' + ((answer && answer.message) ? answer.message : 'crew gave no answer')
}

// Runs the bundled CLI in the session's folder and returns its JSON answer.
// Every failure becomes { ok: false, message } so no hook ever throws because of it.
async function runCrew($, args) {
  let root
  let cwd
  try {
    root = $.plugin.root
    cwd = await $.session.cwd()
  } catch (err) {
    return { ok: false, message: 'crew could not run: ' + reasonOf(err) }
  }
  let run
  try {
    run = await $.process.run(['node', root + '/dist/crew.mjs', ...args, '--json'], { cwd, timeoutMs: 10000 })
  } catch (err) {
    return { ok: false, message: 'crew could not run: ' + reasonOf(err) }
  }
  try {
    return JSON.parse(run.stdout)
  } catch {
    const text = (run.stderr || run.stdout || 'crew printed nothing').trim()
    return { ok: false, message: text.split('\n')[0] }
  }
}

function reasonOf(err) {
  return err && err.message ? err.message : String(err)
}

async function refresh($) {
  const answer = await runCrew($, ['status'])
  if (answer && answer.ok) {
    status = answer
    error = null
  } else {
    status = null
    error = answer && answer.message ? answer.message : 'crew gave no answer'
  }
  // An open pane and the strip draw from the new status without the person pressing r
  try {
    await $.ui.invalidate('ui.render')
  } catch {
    /* nothing open to redraw is not a failure */
  }
}

// The inbox, for the panel alone: fetched when the panel opens or refreshes, and only from an engine
// that prints a mail summary (0.5.0); an answer that is not ok draws no inbox lines
async function refreshInbox($) {
  if (!(status && status.mail)) {
    inbox = null
    return
  }
  const answer = await runCrew($, ['mail', 'inbox'])
  inbox = answer && answer.ok ? answer : null
}

// The workspace, for the panel alone: fetched with the inbox, and only from an engine that prints it
// (0.7.0); an answer that is not ok, or the none case, draws no block
async function refreshWorkspace($) {
  if (!status) {
    workspace = null
    return
  }
  const answer = await runCrew($, ['workspace', 'status'])
  workspace = answer && answer.ok && answer.workspace ? answer : null
}

// "2 threads (1 open, 1 unread)" from status.threads
function threadsLine() {
  const threads = status.threads || []
  const open = threads.filter((t) => t.open).length
  const unread = threads.reduce((sum, t) => sum + (t.unread || 0), 0)
  return threads.length + ' thread' + (threads.length === 1 ? '' : 's') + ' (' + open + ' open, ' + unread + ' unread)'
}

// "M-1 · loyalty_tier · 2 messages · 1 unread · open"
function threadRow(t) {
  return t.root + ' · ' + t.subject + ' · ' + t.messages + ' message' + (t.messages === 1 ? '' : 's') + ' · ' + t.unread + ' unread · ' + (t.open ? 'open' : 'closed')
}

function hasWork() {
  return !!(status && status.active)
}

// The gates as one short list: "secrets ✓ test ✗ lint …", a planned gate with no run yet as "…";
// the judgement gates follow with the same marks, "?" for not run, "…" for planned or stale
function gatesText() {
  const marks = { pass: '✓', fail: '✗', skipped: '–', unavailable: '?' }
  const runs = status.runs || []
  const names = Array.isArray(status.expected) ? status.expected : [...new Set(runs.map((r) => r.gate))]
  const parts = []
  for (const name of names) {
    const ran = runs.filter((r) => r.gate === name)
    if (ran.length === 0) parts.push(name + ' …')
    for (const r of ran) parts.push(r.gate + ' ' + (marks[r.status] || '?'))
  }
  const judged = { proven: '✓', 'not-proven': '✗', 'not-run': '?', planned: '…', stale: '…', skipped: '–' }
  for (const j of status.judgement || []) parts.push(j.gate + ' ' + (judged[j.status] || '?'))
  return parts.join(' ')
}

// "Proven: secrets, test" or "Not proven: <first reason>"
function verdictLine() {
  if (!hasWork()) return ''
  if (status.verdict === 'proven') {
    const passed = (status.runs || []).filter((r) => r.status === 'pass').map((r) => r.gate)
    const judged = (status.judgement || []).filter((j) => j.status === 'proven').map((j) => j.gate)
    const names = [...passed, ...judged]
    return 'Proven: ' + (names.length ? names.join(', ') : 'nothing to run')
  }
  return 'Not proven: ' + (status.unproven && status.unproven[0] ? status.unproven[0] : 'gates have not run')
}

// The one line the strip shows; the unproven reason reads as the prompt hook writes it
function stripText() {
  if (!hasWork()) return ''
  const unread = status.mail && status.mail.unread ? ' · mail ' + status.mail.unread + ' unread' : ''
  const waiting = waitingText()
  const verdict = status.verdict === 'proven' ? 'proven' : 'not proven (' + (status.unproven && status.unproven[0] ? status.unproven[0] : 'gates have not run') + ')'
  const gates = gatesText()
  // An unconfirmed triage (SP3): the proposal, marked, until the business priorities are signed
  const unconfirmed = status.triage && status.triage.confirmed === null ? ' (unconfirmed)' : ''
  const priority = status.priority && status.priority !== 'normal' ? ' · priority ' + status.priority + unconfirmed : ''
  return 'crew ' + status.active + ' · ' + status.phase + ' · ' + status.route + priority + ' · ' + verdict + (gates ? ' · ' + gates : '') + todoPart() + workingPart() + unread + waiting
}

// The text /crew prints in the transcript
function statusText() {
  if (error) return 'Crew: ' + error
  if (!hasWork()) return 'Crew: no active work item. A change starts with the crew skill.'
  const lines = [
    status.active + ' "' + status.title + '"',
    '  phase ' + status.phase + ', route ' + status.route + (waitingText() ? ', ' + waitingText().slice(3) : ''),
  ]
  if (status.branch) lines.push('  branch ' + status.branch)
  if (status.team && status.team.length) lines.push('  team: ' + status.team.map((s) => s.role).join(', ') + ' (primary ' + status.primaryTeam + ')')
  if ((status.todo && status.todo.total) || (status.working && status.working.length)) {
    lines.push('  ' + [status.todo && status.todo.total ? 'todo ' + status.todo.done + '/' + status.todo.total : null, status.working && status.working.length ? 'working: ' + status.working.map((w) => w.agent).join(', ') : null].filter(Boolean).join(' · '))
  }
  if (Array.isArray(status.threads)) {
    if (status.threads.length) lines.push('  mail: ' + threadsLine())
  } else if (status.mail && status.mail.unread) lines.push('  mail: ' + status.mail.unread + ' unread')
  const conclave = conclaveText()
  if (conclave) lines.push('  ' + conclave)
  for (const r of status.runs || []) {
    lines.push('  ' + r.gate + ' (' + r.target + '): ' + r.status + ' in ' + (r.durationMs / 1000).toFixed(1) + 's' + (r.reason ? ' (' + r.reason + ')' : ''))
  }
  for (const j of status.judgement || []) lines.push('  ' + judgementText(j))
  lines.push(verdictLine())
  return lines.join('\n')
}
