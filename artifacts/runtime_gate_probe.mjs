import { renderScreenshot } from '/Users/smigoo/工作/mvgo/backend-node/src/ai-engine/roles/screenshot-renderer.js'

const result = await renderScreenshot({
  outputPath: '/Users/smigoo/工作/mvgo/frontend/workspace/custom-components/mc-1785682311850-5e7d84d1',
  sessionId: 'mc-1785682311850-5e7d84d1',
  componentName: 'mc-1785682311850-5e7d84d1',
  target: 'microcode',
  groupId: 'default-group',
  hardGate: true,
})

console.log(JSON.stringify(result, null, 2))
