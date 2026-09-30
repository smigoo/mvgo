// ============================================================
// 大屏布局 · 单文件 HTML 导出
// ------------------------------------------------------------
// 为什么需要它：用户点完「下载 ZIP」拿到的是一个压缩包，还得解压、找入口、
// 起服务才能看到东西 —— 反馈断在最后一米。这里给一条立刻能用的出口：
// 双击就能打开、零外部依赖、且**真的按所选适配策略响应窗口**。
//
// 纯前端确定性生成：不调模型、不依赖后端会话，随时可导出。
// ============================================================

import type { ScreenLayout, ZoneConfig } from '@/types/screen-layout'

/** HTML 文本转义 —— 布局名/组件名是用户输入，必须转义后再拼进文档 */
function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function frValue(width: string | undefined): number {
  const m = /^(\d+(?:\.\d+)?)fr$/.exec(width || '')
  return m ? parseFloat(m[1]) : 1
}

/** 画布底色是不是浅色（决定骨架装饰色走深色还是浅色主题） */
function isLightColor(hex: string | undefined): boolean {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((hex || '').trim())
  if (!m) return false
  let h = m[1]
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.6
}

/**
 * 骨架装饰色（描边 / 占位文字 / 组件条）。
 *
 * 🔑 必须随画布底色明暗自适应，不能写死深色主题：
 *    设计稿画布默认是白色，若沿用深色主题的浅蓝描边 + 浅色文字，
 *    导出的文件白底浅字、虚线几乎看不见 —— 用户拿到手第一眼就是"坏的"。
 *    （与编辑器内 `LayoutWireframe` 的处理**方向相反**：线框是结构预览、
 *      刻意固定蓝图底色；导出物要忠实画布背景，所以改为配色自适应。）
 */
function decorColor(light: boolean): Record<string, string> {
  return light
    ? {
        text: '#1c2a3a',
        border: 'rgba(40, 90, 180, 0.42)',
        zoneBg: 'rgba(56, 132, 255, 0.08)',
        hint: 'rgba(40, 90, 180, 0.78)',
        tag: 'rgba(40, 90, 180, 0.85)',
        hfBorder: 'rgba(40, 90, 180, 0.3)',
        compBg: 'rgba(56, 132, 255, 0.14)',
        compText: 'rgba(20, 45, 90, 0.9)',
      }
    : {
        text: '#dbe6f5',
        border: 'rgba(120, 170, 255, 0.35)',
        zoneBg: 'rgba(56, 132, 255, 0.06)',
        hint: 'rgba(160, 200, 255, 0.65)',
        tag: 'rgba(160, 200, 255, 0.7)',
        hfBorder: 'rgba(90, 150, 255, 0.22)',
        compBg: 'rgba(56, 132, 255, 0.14)',
        compText: 'rgba(200, 220, 255, 0.85)',
      }
}

/**
 * 适配策略 → 根容器 CSS。
 *
 * 🔑 五种策略一律**只改盒子 / 只做等比缩放**，绝不非等比拉伸
 *    （`scale(sx, sy)` 会让圆变椭圆、文字压扁 —— 所以不提供那个选项）。
 *    fluid 连缩放都不做：盒 = 视口，列宽用 fr 自然伸缩 ⇒ 天然不变形。
 */
function rootCss(layout: ScreenLayout): { css: string; note: string } {
  const w = layout.canvas.width || 1920
  const h = layout.canvas.height || 1080
  const mode = layout.canvas.outputScaleMode || 'fluid'

  const buildRoot = (extra: string) =>
    `.screen-root{width:${w}px;height:${h}px;transform-origin:center center;${extra}}`

  switch (mode) {
    case 'contain':
      return {
        css: buildRoot(`transform:scale(min(calc(100vw / ${w}), calc(100vh / ${h})));`),
        note: '整体等比缩放（contain）：多余方向留边，内容绝不裁切',
      }
    case 'fillWidth':
      return {
        css: buildRoot(`transform:scale(calc(100vw / ${w}));`),
        note: '宽度填满（fillWidth）：高度按比例推出，超出部分裁切',
      }
    case 'fillHeight':
      return {
        css: buildRoot(`transform:scale(calc(100vh / ${h}));`),
        note: '高度填满（fillHeight）：宽度按比例推出，超出部分裁切',
      }
    case 'none':
      return {
        css: buildRoot(''),
        note: '不缩放（none）：按设计稿 1:1 渲染，容器不够时出现滚动条',
      }
    case 'hybrid':
      return {
        css: buildRoot(
          // 等比缩放到「贴合视口」；只有当两轴比例差 ≤12% 时才允许贴边（吃掉留边），
          // 否则退回等比内接 —— 全程等比，所以永远不会变形。
          `--kx:calc(100vw / ${w});--ky:calc(100vh / ${h});` +
            `--kmin:min(var(--kx),var(--ky));--kmax:max(var(--kx),var(--ky));` +
            `transform:scale(clamp(var(--kmin), var(--kmax), calc(var(--kmin) * 1.1364)));`,
        ),
        note: '等比 + 弹性混合（hybrid）：等比缩放为主，比例差 ≤12% 时吃掉留边',
      }
    case 'fluid':
    default:
      return {
        css: '.screen-root{width:100vw;height:100vh;}',
        note: '铺满不变形（fluid）：盒 = 视口，骨架（列宽 / 间距）弹性伸缩，元素比例保持',
      }
  }
}

/** 渲染一个区域 */
function renderZone(z: ZoneConfig, colNo: number, seq: number): string {
  const pad = z.padding
  const style = [
    pad ? `padding:${pad.top} ${pad.right} ${pad.bottom} ${pad.left}` : '',
    z.width ? `flex:0 0 ${z.width}` : '',
    z.height ? `height:${z.height}` : '',
  ]
    .filter(Boolean)
    .join(';')

  const comps = z.gridConfig?.components || []
  const inner = comps.length
    ? `<ul class="sl-comp">${comps.map((c) => `<li>${esc(c.componentName || '组件')}</li>`).join('')}</ul>`
    : `<span class="sl-hint">${colNo}区${seq}</span>`

  return `<div class="sl-zone"${style ? ` style="${esc(style)}"` : ''}>${inner}</div>`
}

/**
 * 由 ScreenLayout 生成自包含的单文件 HTML。
 * 输出可直接双击打开，拖动窗口即可看到所选策略的响应效果。
 */
export function buildStandaloneHtml(layout: ScreenLayout): string {
  const { canvas, header, footer, body } = layout
  const zones = body.zones || []
  const sample = zones[0]
  const gap = sample?.padding?.left || '8px'
  const bodyPad = sample?.padding
    ? `${sample.padding.top} ${sample.padding.right} ${sample.padding.bottom} ${sample.padding.left}`
    : gap

  const fit = rootCss(layout)
  // 骨架装饰色随画布明暗自适应（白底设计稿极常见，写死深色主题会看不见）
  const C = decorColor(isLightColor(canvas.backgroundColor))

  // 列 → 区域
  const colsHtml = (body.columns || [])
    .map((col, ci) => {
      const mine = zones.filter((z) => z.colIndex === ci)
      const inner = mine.length
        ? mine.map((z, i) => renderZone(z, ci + 1, i + 1)).join('\n        ')
        : '<span class="sl-hint">空列</span>'
      return `      <section class="sl-col" style="flex-grow:${frValue(col.width)}">\n        ${inner}\n      </section>`
    })
    .join('\n')

  const headerHtml = header?.enabled
    ? `    <header class="sl-header" style="height:${esc(header.height)}${header.backgroundColor ? `;background:${esc(header.backgroundColor)}` : ''}">\n      <span class="sl-hf-tag">HEADER ${esc(header.height)}</span>\n    </header>\n`
    : ''

  const footerHtml = footer?.enabled
    ? `\n    <footer class="sl-footer" style="height:${esc(footer.height)}${footer.backgroundColor ? `;background:${esc(footer.backgroundColor)}` : ''}">\n      <span class="sl-hf-tag">FOOTER ${esc(footer.height)}</span>\n    </footer>`
    : ''

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(layout.name || '大屏布局')}</title>
<!--
  由 mvgo 大屏布局编辑器导出 · 单文件、零外部依赖
  设计稿基准：${canvas.width} × ${canvas.height}
  适配策略：${canvas.outputScaleMode || 'fluid'}
  ${fit.note}
  拖动浏览器窗口即可验证响应效果。
-->
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  html,body{width:100%;height:100%;background:#0a1628;overflow:hidden;}
  body{display:flex;align-items:center;justify-content:center;}

  /* ── 适配策略（由布局设置决定，只改盒子 / 只做等比缩放） ── */
  ${fit.css}

  .screen-root{
    display:flex;flex-direction:column;overflow:hidden;
    background:${esc(canvas.backgroundColor || '#0a1628')};
    color:${C.text};
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'PingFang SC','Microsoft YaHei',sans-serif;
  }
  .sl-header,.sl-footer{
    flex:0 0 auto;display:flex;align-items:center;justify-content:center;
    border-bottom:1px solid ${C.hfBorder};
  }
  .sl-footer{border-bottom:none;border-top:1px solid ${C.hfBorder};}
  .sl-hf-tag{font-size:11px;letter-spacing:.5px;color:${C.tag};font-family:ui-monospace,Menlo,monospace;}
  .sl-body{
    flex:1 1 auto;min-height:0;display:flex;
    gap:${gap};padding:${bodyPad};
  }
  .sl-col{flex:1 1 0;min-width:0;display:flex;flex-direction:column;gap:${gap};}
  .sl-zone{
    flex:1 1 0;min-height:0;min-width:0;overflow:hidden;
    display:flex;align-items:center;justify-content:center;
    border:1px dashed ${C.border};border-radius:6px;
    background:${C.zoneBg};
  }
  .sl-hint{font-size:12px;color:${C.hint};font-family:ui-monospace,Menlo,monospace;}
  .sl-comp{list-style:none;width:100%;padding:8px;display:flex;flex-direction:column;gap:6px;}
  .sl-comp li{
    font-size:12px;color:${C.compText};
    background:${C.compBg};border-radius:4px;padding:4px 8px;
  }
</style>
</head>
<body>
  <div class="screen-root">
${headerHtml}    <main class="sl-body">
${colsHtml}
    </main>${footerHtml}
  </div>
</body>
</html>
`
}

/** 触发浏览器下载（文件名取布局名） */
export function downloadStandaloneHtml(layout: ScreenLayout): void {
  const html = buildStandaloneHtml(layout)
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${(layout.name || 'screen-layout').replace(/[\\/:*?"<>|]/g, '_')}.html`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
