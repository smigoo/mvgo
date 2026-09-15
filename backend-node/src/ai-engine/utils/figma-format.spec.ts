import { formatFigmaStyleData } from './figma-format.js'

describe('formatFigmaStyleData：Figma 样式格式化', () => {
  it('SOLID fill 带 alpha', () => {
    const node = {
      name: 'bg', type: 'FRAME',
      fills: [{ type: 'SOLID', color: { r: 0.1, g: 0.2, b: 0.3 }, opacity: 0.5 }],
    }
    const out = formatFigmaStyleData(node)
    expect(out).toMatch(/SOLID: #1a334d \(alpha: 0\.5\)/)
  })

  it('GRADIENT fill 补填充级 opacity（2026-09-15 刀24-B 实锤：半透明渐变不再输出成不透明）', () => {
    const node = {
      name: 'tabs-list', type: 'FRAME',
      fills: [{
        type: 'GRADIENT_LINEAR',
        opacity: 0.6, // 填充级透明度（本例 tabs-list 底图 0.6）
        gradientStops: [
          { color: { r: 0.1, g: 0.2, b: 0.3 }, position: 0 },
          { color: { r: 0.9, g: 0.8, b: 0.7 }, position: 1 },
        ],
      }],
    }
    const out = formatFigmaStyleData(node)
    expect(out).toMatch(/GRADIENT_LINEAR: #1a334d \(alpha: 0\.6\) 0%/)
    expect(out).toMatch(/#e6ccb3 \(alpha: 0\.6\) 100%/)
  })

  it('GRADIENT stop 级 opacity 优先于填充级', () => {
    const node = {
      name: 'g', type: 'FRAME',
      fills: [{
        type: 'GRADIENT_LINEAR', opacity: 0.6,
        gradientStops: [
          { color: { r: 0.1, g: 0.2, b: 0.3 }, position: 0, opacity: 0.9 },
        ],
      }],
    }
    const out = formatFigmaStyleData(node)
    expect(out).toMatch(/alpha: 0\.9/) // stop 0.9 覆盖填充 0.6
  })

  it('无 opacity 的渐变不输出 alpha 噪声', () => {
    const node = {
      name: 'g', type: 'FRAME',
      fills: [{
        type: 'GRADIENT_LINEAR',
        gradientStops: [{ color: { r: 0.1, g: 0.2, b: 0.3 }, position: 0 }],
      }],
    }
    const out = formatFigmaStyleData(node)
    expect(out).toMatch(/#1a334d 0%/)
    expect(out).not.toMatch(/alpha/)
  })
})
