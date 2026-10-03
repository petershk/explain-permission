import { test, expect } from 'claude-code/testing'
import { sections, riskLevel } from './register'

const PANE = {
  component: 'Pane',
  requestId: 'explain-permission',
  props: { title: 'What is Claude asking?', isFocused: false, bodyColumns: 50, placement: 'dock' } as any,
} as const

async function findText(ui: any, pattern: RegExp) {
  for (let i = 0; i < 20; i++) {
    const found = await ui.find({ type: 'Text', text: pattern })
    if (found) return found
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  return undefined
}

test('a permission request opens the pane and shows a plain-English explanation', async ($, on) => {
  const opened: string[] = []
  const prompts: string[] = []
  on('ui.open', ($, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('model.fork', ($, e) => {
    prompts.push(e.prompt)
    return { value: { isAnswered: true, text: 'WHAT: Publishes your website.\nWHY: You asked to go live.\nRISK: medium, it becomes public.', usage: { input_tokens: 1, output_tokens: 1 } } } as any
  })
  on('classic.PermissionRequest', () => ({}) as any)

  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'npx wrangler pages deploy public' } } as any)

  expect(opened).toEqual(['explain-permission'])
  expect(prompts[0]).toContain('npx wrangler pages deploy public')

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'explain-permission', surface, ...PANE })
    expect(await findText(ui, /Claude wants to use: Bash/)).toBeDefined()
    expect(await findText(ui, /^WHAT$/)).toBeDefined()
    expect(await findText(ui, /^RISK · MEDIUM$/)).toBeDefined()
    expect(await findText(ui, /^it becomes public./)).toBeDefined()
    await ui.unmount()
  }
})

test('falls back to a quick model when there is no conversation to fork', async ($, on) => {
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('model.fork', () => ({ value: { isAnswered: false, reason: 'nothing-to-fork' } }) as any)
  on('model.complete', () => ({ value: { isAnswered: true, text: 'WHAT: Reads a file.', usage: { input_tokens: 1, output_tokens: 1 } } }) as any)
  on('classic.PermissionRequest', () => ({}) as any)

  await $.classic.PermissionRequest({ tool_name: 'Read', tool_input: { file_path: 'C:/secret.txt' } } as any)

  const ui = await $.ui.mount({ plugin: 'explain-permission', surface: 'terminal', ...PANE })
  expect(await findText(ui, /^Reads a file./)).toBeDefined()
  await ui.unmount()
})

test('the reply is split into WHAT, WHY and RISK with the risk level read out', () => {
  const parts = sections(['**WHAT:** Deletes a folder.', 'WHY: You asked to clean up.', 'still why', 'RISK: High - it cannot be undone.'].join('\n'))
  expect(parts.map(p => p.label)).toEqual(['WHAT', 'WHY', 'RISK'])
  expect(parts[1]!.body).toBe('You asked to clean up. still why')
  expect(riskLevel(parts[2]!.body)).toBe('high')
})
