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
      $.ui.log('could not register /crew: it is taken by another plugin')
    }
    return next(e)
  })

  on('classic.SessionStart', { source: ['clear', 'resume', 'fork'] }, async ($, e, next) => {
    await refresh($)
    return next(e)
  })

  on('command.run', { command: 'crew' }, async ($, e) => {
    const words = (e.args || '').trim().split(/\s+/).filter(Boolean)
    const verb = words[0] || 'status'
    if (verb === 'panel') {
      await refresh($)
      await $.ui.open({ id: PANE, title: 'Crew', focus: true, closeOnEscape: true })
      return {}
    }
    if (verb === 'mode') {
      const answer = await runCrew($, ['mode', ...words.slice(1)])
      return { text: 'Crew: ' + answer.message }
    }
    await refresh($)
    return { text: statusText() }
  })
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
    run = await $.process.run(['node', root + '/dist/crew.mjs', ...args, '--json'], { cwd, timeoutMs: 20000 })
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
}

function hasWork() {
  return !!(status && status.active)
}

// The gates as one short list: "secrets ✓ test ✗ lint –"
function gatesText() {
  const marks = { pass: '✓', fail: '✗', skipped: '–', unavailable: '?' }
  return (status.runs || []).map((r) => r.gate + ' ' + (marks[r.status] || '?')).join(' ')
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

// The one line the strip shows
function stripText() {
  if (!hasWork()) return ''
  const waiting = status.awaiting === 'user' ? ' · waiting for the user' : ''
  const gates = gatesText()
  return 'crew ' + status.active + ' · ' + status.phase + ' · ' + status.route + (gates ? ' · ' + gates : '') + ' · ' + (status.verdict === 'proven' ? 'proven' : 'not proven') + waiting
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
