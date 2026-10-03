import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Explanation } from '../types'

const PANE = 'explain-permission'
const TITLE = 'What is Claude asking?'
const current = atom({ plugin: 'explain-permission', key: 'current' } as const, null)

// The request as one readable line: the command for Bash, the file for edits, else the arguments.
export function describe(tool: string, input: unknown): string {
  const args = (input ?? {}) as Record<string, unknown>
  if (typeof args.command === 'string') return args.command
  if (typeof args.file_path === 'string') return args.file_path
  if (typeof args.url === 'string') return args.url
  const json = JSON.stringify(args)
  return json.length > 400 ? json.slice(0, 400) + '...' : json
}

export function promptFor(tool: string, request: string): string {
  return [
    'A permission dialog is asking the user whether to let you run this:',
    `Tool: ${tool}`,
    `Request: ${request}`,
    '',
    'Explain it to someone who is not a programmer, in plain English, with no jargon and no markdown.',
    'Write three short lines, each starting with its label:',
    'WHAT: what this will actually do on their computer or online.',
    'WHY: why it is needed for what they asked for (use the conversation so far).',
    'RISK: low, medium or high, and what could go wrong or what changes for good (anything sent, deleted, published or paid for).',
    'Keep it under 90 words. Do not run anything.',
  ].join('\n')
}

type Section = { label?: 'WHAT' | 'WHY' | 'RISK'; body: string }

// Splits the reply into its WHAT / WHY / RISK parts; a line under no label stays plain text.
export function sections(text: string): Section[] {
  const out: Section[] = []
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\*\*/g, '').trim()
    if (!line) continue
    const m = line.match(/^(WHAT|WHY|RISK)\s*:\s*(.*)$/i)
    if (m) out.push({ label: m[1]!.toUpperCase() as Section['label'], body: m[2]! })
    else if (out.length && out[out.length - 1]!.label) out[out.length - 1]!.body += ' ' + line
    else out.push({ body: line })
  }
  return out
}

export function riskLevel(body: string): 'low' | 'medium' | 'high' | 'unknown' {
  const m = body.match(/\b(low|medium|high)\b/i)
  return m ? (m[1]!.toLowerCase() as 'low' | 'medium' | 'high') : 'unknown'
}

// WHAT is cyan, WHY is magenta, RISK is green / yellow / red by its level.
function colorFor(label: Section['label'], body: string): string {
  if (label === 'WHAT') return 'cyan'
  if (label === 'WHY') return 'magenta'
  return { low: 'green', medium: 'yellow', high: 'red', unknown: 'yellow' }[riskLevel(body)]
}

let nextId = 1

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'explain-permission',
      description: 'Show the plain-English permission explainer pane',
    })
    return next(e)
  })

  on('command.run', { command: 'explain-permission' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })
    return { text: 'Permission explainer opened.' }
  })

  // Fires just before the engine shows the "is this ok?" dialog to the person.
  on('classic.PermissionRequest', async ($, e, next) => {
    const tool = e.tool_name
    if (tool === 'AskUserQuestion' || tool === 'ExitPlanMode') return next(e)

    const entry: Explanation = {
      id: nextId++,
      tool,
      request: describe(tool, e.tool_input),
      status: 'thinking',
      text: '',
    }
    await update($, current, () => entry)
    const opened = await $.ui.open({ id: PANE, title: TITLE }).catch(() => undefined)
    if (opened && !opened.isPlaced) $.ui.toast('Permission explainer: widen the terminal or type /explain-permission to see it')

    // Explain in the background so the dialog is never held up.
    void (async () => {
      const prompt = promptFor(tool, entry.request)
      let reply = await $.model.fork({ prompt })
      if (!reply.isAnswered) reply = await $.model.complete({ model: 'haiku', prompt, maxTokens: 300 })
      const done: Partial<Explanation> = reply.isAnswered
        ? { status: 'ready', text: reply.text.trim() }
        : { status: 'failed', text: `Could not get an explanation (${reply.reason}).` }
      await update($, current, now => (now && now.id === entry.id ? { ...now, ...done } : now))
    })().catch(err => {
      void update($, current, now =>
        now && now.id === entry.id ? { ...now, status: 'failed', text: String(err) } : now,
      )
    })

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const now = await read($, current)
    if (!now) return <Text dimColor>No permission requests yet. When Claude asks "is this ok?", the plain-English version shows up here.</Text>

    return (
      <Box flexDirection="column">
        <Text bold>Claude wants to use: {now.tool}</Text>
        <Text dimColor>{now.request}</Text>
        <Text> </Text>
        {now.status === 'thinking' && <Text color="yellow">Working out what this means...</Text>}
        {now.status === 'failed' && <Text color="red">{now.text}</Text>}
        {now.status === 'ready' &&
          sections(now.text).map(part =>
            part.label ? (
              <Box flexDirection="column" marginBottom={1}>
                <Text bold color={colorFor(part.label, part.body)}>{part.label === 'RISK' && riskLevel(part.body) !== 'unknown' ? `RISK · ${riskLevel(part.body).toUpperCase()}` : part.label}</Text>
                <Text>{part.label === 'RISK' ? part.body.replace(/^(low|medium|high)\b[\s,.:;-]*/i, '') : part.body}</Text>
              </Box>
            ) : (
              <Text>{part.body}</Text>
            ),
          )}
      </Box>
    )
  })
}
