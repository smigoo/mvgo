import {
  assertTaskPreviewPanelTypeBehavior,
  resolveGenerationPanelType,
  resolveTaskPreviewPanelType,
} from './task-preview-panel'

assertTaskPreviewPanelTypeBehavior()

describe('resolveGenerationPanelType', () => {
  it('keeps the top-level panel when theme nodes are not submitted', () => {
    expect(resolveGenerationPanelType('aio-panel', 'default-panel', false)).toBe('aio-panel')
  })

  it('uses the primary theme panel only when theme nodes are submitted', () => {
    expect(resolveGenerationPanelType('aio-panel', 'default-panel', true)).toBe('default-panel')
  })

  it('falls back to the top-level panel when the primary theme has no panel', () => {
    expect(resolveGenerationPanelType('aio-panel', undefined, true)).toBe('aio-panel')
  })
})

describe('resolveTaskPreviewPanelType', () => {
  it('uses the panel selected for a single-theme microcode task', () => {
    expect(resolveTaskPreviewPanelType('microcode', 'aio-panel', false)).toBe('aio-panel')
    expect(resolveTaskPreviewPanelType('microcode', 'default-panel', false)).toBe('default-panel')
  })

  it('does not inject a panel override for Vue3 or multi-theme tasks', () => {
    expect(resolveTaskPreviewPanelType('vue3', 'aio-panel', false)).toBe('')
    expect(resolveTaskPreviewPanelType('microcode', 'aio-panel', true)).toBe('')
  })

  it('leaves unknown or missing panel metadata to the artifact default', () => {
    expect(resolveTaskPreviewPanelType('microcode', undefined, false)).toBe('')
    expect(resolveTaskPreviewPanelType('microcode', 'unknown-panel', false)).toBe('')
  })
})
