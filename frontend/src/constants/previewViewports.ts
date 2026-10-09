/**
 * 预览视口档位 —— 全仓唯一数据源。
 *
 * ── 为什么必须收敛 ──────────────────────────────────────────────
 * 改造前档位清单散落三处（views/demo/index.vue 的 resolutionOptions、
 * views/components/ComponentDetail.vue 的 viewports、以及各处硬编码字面量），
 * 新增档位时必然漏改（R4）。任何页面需要「设备档位」都必须 import 本文件，
 * 禁止再写本地副本。
 *
 * 尺寸单位一律 CSS 像素（不做 DPR 模拟 —— 1x 视口已足够验证响应式）。
 */

export type PreviewViewportPreset = {
  /** 稳定 key，用于持久化与高亮匹配 */
  key: string
  /** 界面显示名 */
  label: string
  /** 短标签，工具栏空间紧张时用 */
  short: string
  width: number
  height: number
  /** 分组，用于工具栏分段展示 */
  group: 'mobile' | 'tablet' | 'desktop'
}

export const PREVIEW_VIEWPORT_PRESETS: PreviewViewportPreset[] = [
  { key: 'mobile-375', label: '手机 375×667', short: '375', width: 375, height: 667, group: 'mobile' },
  { key: 'mobile-414', label: '手机 414×896', short: '414', width: 414, height: 896, group: 'mobile' },
  { key: 'tablet-768', label: '平板 768×1024', short: '768', width: 768, height: 1024, group: 'tablet' },
  { key: 'desktop-1280', label: '桌面 1280×720', short: '1280', width: 1280, height: 720, group: 'desktop' },
  { key: 'desktop-1440', label: '桌面 1440×900', short: '1440', width: 1440, height: 900, group: 'desktop' },
]

/** 按 key 取档位 */
export function findViewportPreset(key: string): PreviewViewportPreset | undefined {
  return PREVIEW_VIEWPORT_PRESETS.find((p) => p.key === key)
}

/** 按宽度就近匹配档位（用于把「用户拖出来的 380px」显示成「375 附近」） */
export function nearestViewportPresetKey(width: number): string {
  let best = PREVIEW_VIEWPORT_PRESETS[0]
  let bestDiff = Number.POSITIVE_INFINITY
  for (const p of PREVIEW_VIEWPORT_PRESETS) {
    const diff = Math.abs(p.width - width)
    if (diff < bestDiff) {
      bestDiff = diff
      best = p
    }
  }
  return bestDiff <= 24 ? best.key : 'custom'
}
