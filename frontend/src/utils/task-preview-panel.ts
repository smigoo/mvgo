export type PreviewPanelKey = 'default-panel' | 'model-panels' | 'aio-panel' | 'empty'

export function resolveGenerationPanelType(
  selectedPanel: PreviewPanelKey,
  primaryThemePanel: PreviewPanelKey | undefined,
  submitThemeNodes: boolean,
): PreviewPanelKey {
  return submitThemeNodes && primaryThemePanel ? primaryThemePanel : selectedPanel
}

export function resolveTaskPreviewPanelType(
  target: string | undefined,
  panelKey: string | undefined,
  hasMultipleThemes: boolean,
): PreviewPanelKey | '' {
  if (target === 'vue3' || hasMultipleThemes) return ''
  if (
    panelKey === 'default-panel' ||
    panelKey === 'model-panels' ||
    panelKey === 'aio-panel' ||
    panelKey === 'empty'
  ) {
    return panelKey
  }
  return ''
}

export function assertTaskPreviewPanelTypeBehavior(): void {
  const generationCases: Array<[
    PreviewPanelKey,
    PreviewPanelKey | undefined,
    boolean,
    PreviewPanelKey,
    string,
  ]> = [
    ['aio-panel', 'default-panel', false, 'aio-panel', 'single-theme request keeps the selected panel'],
    ['aio-panel', 'default-panel', true, 'default-panel', 'submitted themes use the primary theme panel'],
    ['default-panel', 'aio-panel', false, 'default-panel', 'stale theme state cannot override a single-theme request'],
    ['aio-panel', undefined, true, 'aio-panel', 'missing primary theme panel falls back to the selected panel'],
  ]

  for (const [selectedPanel, primaryThemePanel, submitThemeNodes, expected, label] of generationCases) {
    const actual = resolveGenerationPanelType(selectedPanel, primaryThemePanel, submitThemeNodes)
    if (actual !== expected) {
      throw new Error(`${label}: expected ${expected}, received ${actual}`)
    }
  }

  const cases: Array<[string | undefined, string | undefined, boolean, PreviewPanelKey | '', string]> = [
    ['microcode', 'aio-panel', false, 'aio-panel', 'single-theme microcode preserves aio-panel'],
    ['microcode', 'default-panel', false, 'default-panel', 'single-theme microcode preserves default-panel'],
    ['vue3', 'aio-panel', false, '', 'Vue3 does not receive panel override'],
    ['microcode', 'aio-panel', true, '', 'multi-theme keeps automatic panel selection'],
    ['microcode', undefined, false, '', 'missing panel metadata leaves artifact default'],
    ['microcode', 'unknown-panel', false, '', 'unknown panel metadata leaves artifact default'],
  ]

  for (const [target, panelKey, hasMultipleThemes, expected, label] of cases) {
    const actual = resolveTaskPreviewPanelType(target, panelKey, hasMultipleThemes)
    if (actual !== expected) {
      throw new Error(`${label}: expected ${expected || '<empty>'}, received ${actual || '<empty>'}`)
    }
  }
}
