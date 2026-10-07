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

export function register(on) {
  on('session.start', async ($, e, next) => {
    await refresh($)
    // Registered last, and wrapped, so a taken name cannot skip the rest of the hook
    try {
      await $.command.register({
        name: 'crew',
        description: 'Crew: the state of the active work item, the panel, or the mode',
        argumentHint: '[status|panel|mode <partner|guide|pilot>]',
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
    if (verb !== 'status' && verb !== 'panel' && verb !== 'mode') {
      return { text: 'Crew: unknown verb; use /crew [status|panel|mode <partner|guide|pilot>]' }
    }
    if (verb === 'panel') {
      await refresh($)
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
    if (verb === 'mode') {
      const answer = await runCrew($, ['mode', ...words.slice(1)])
      return { text: 'Crew: ' + ((answer && answer.message) ? answer.message : 'crew gave no answer') }
    }
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
    lines.push(Text({ children: [' '] }))
    for (const c of status.criteria || []) {
      lines.push(Text({ children: [c.id + ' ' + c.kind + ' · ' + c.tdd + ' · ' + c.text] }))
    }
    lines.push(Text({ children: [' '] }))
    for (const r of status.runs || []) {
      lines.push(Text({ children: [r.gate + ' (' + r.target + '): ' + r.status + ' in ' + (r.durationMs / 1000).toFixed(1) + 's' + (r.reason ? ' (' + r.reason + ')' : '')] }))
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

// "receive › recognize › [build] › gate › deliver", the current phase in brackets
function phasesText() {
  return (status.phases || []).map((p) => (p === status.phase ? '[' + p + ']' : p)).join(' › ')
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

function hasWork() {
  return !!(status && status.active)
}

// The gates as one short list: "secrets ✓ test ✗ lint …", a planned gate with no run yet as "…"
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
  return parts.join(' ')
}

// "Proven: secrets, test" or "Not proven: <first reason>"
function verdictLine() {
  if (!hasWork()) return ''
  if (status.verdict === 'proven') {
    const passed = (status.runs || []).filter((r) => r.status === 'pass').map((r) => r.gate)
    return 'Proven: ' + (passed.length ? passed.join(', ') : 'nothing to run')
  }
  return 'Not proven: ' + (status.unproven && status.unproven[0] ? status.unproven[0] : 'gates have not run')
}

// The one line the strip shows; the unproven reason reads as the prompt hook writes it
function stripText() {
  if (!hasWork()) return ''
  const waiting = status.awaiting === 'user' ? ' · waiting for the user' : ''
  const verdict = status.verdict === 'proven' ? 'proven' : 'not proven (' + (status.unproven && status.unproven[0] ? status.unproven[0] : 'gates have not run') + ')'
  const gates = gatesText()
  return 'crew ' + status.active + ' · ' + status.phase + ' · ' + status.route + ' · ' + verdict + (gates ? ' · ' + gates : '') + waiting
}

// The text /crew prints in the transcript
function statusText() {
  if (error) return 'Crew: ' + error
  if (!hasWork()) return 'Crew: no active work item. A change starts with the crew skill.'
  const lines = [
    status.active + ' "' + status.title + '"',
    '  phase ' + status.phase + ', route ' + status.route + (status.awaiting === 'user' ? ', waiting for the user' : ''),
  ]
  for (const r of status.runs || []) {
    lines.push('  ' + r.gate + ' (' + r.target + '): ' + r.status + ' in ' + (r.durationMs / 1000).toFixed(1) + 's' + (r.reason ? ' (' + r.reason + ')' : ''))
  }
  lines.push(verdictLine())
  return lines.join('\n')
}
