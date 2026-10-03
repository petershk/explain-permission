export type Explanation = {
  id: number
  tool: string
  request: string
  status: 'thinking' | 'ready' | 'failed'
  text: string
}

declare module 'claude-code' {
  interface PluginState {
    'explain-permission': { current: Explanation | null }
  }
}
