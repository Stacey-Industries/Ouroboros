export const tailSchema = {
  workspaceSnapshots: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        commitHash: { type: 'string' },
        sessionId: { type: 'string' },
        sessionLabel: { type: 'string' },
        timestamp: { type: 'number' },
        type: { type: 'string' },
        fileCount: { type: 'number' }
      }
    },
    default: []
  },
  commandBlocksEnabled: {
    type: 'boolean',
    default: true
  },
  promptPattern: {
    type: 'string',
    default: ''
  },
  terminalCursorStyle: {
    type: 'string',
    enum: ['block', 'underline', 'bar'],
    default: 'block'
  },
  richInputEnabled: {
    type: 'boolean',
    default: true
  },
  richInputSubmitKey: {
    type: 'string',
    enum: ['ctrl+enter', 'shift+enter'],
    default: 'ctrl+enter'
  },
  formatOnSave: {
    type: 'boolean',
    default: false
  }
}
