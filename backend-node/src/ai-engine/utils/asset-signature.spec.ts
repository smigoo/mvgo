import { generateContainerSignature } from './asset-signature.js'

/**
 * 容器子树签名（资源下载去重，2026-09-02）。
 * 实锤场景：mc-max-1788280167414-49dfbe7d 的 12 个列表项共享同一 bg GROUP，
 * 因 GROUP 无自有 fills、fill 签名为 null 而未去重 → 同图下载 12 次存 12 份。
 */

const GRAD = (r: number) => ({
  type: 'GRADIENT_LINEAR',
  visible: true,
  gradientStops: [
    { color: { r, g: 0.5, b: 0.8 }, position: 0 },
    { color: { r: 0.1, g: 0.2, b: 0.3 }, position: 1 },
  ],
})

/** 模拟列表项共享的 bg GROUP：仅绝对坐标不同，子树结构完全一致 */
function mkRowBg(y: number, xNoise = 0) {
  return {
    id: `2:${8400 + Math.round(y)}`,
    name: 'bg',
    type: 'GROUP',
    absoluteBoundingBox: { x: 1518 + xNoise, y, width: 117, height: 64 },
    opacity: 0.5,
    children: [
      {
        id: 'v1',
        name: 'Vector',
        type: 'VECTOR',
        absoluteBoundingBox: { x: 1518 + xNoise, y, width: 117, height: 64 },
        fills: [GRAD(0.2)],
      },
      {
        id: 'v2',
        name: 'Vector',
        type: 'VECTOR',
        absoluteBoundingBox: { x: 1518 + xNoise, y, width: 117, height: 64 },
        opacity: 0.8,
        fills: [{ type: 'SOLID', visible: true, color: { r: 1, g: 1, b: 1 } }],
      },
    ],
  }
}

describe('generateContainerSignature 容器子树签名（资源去重）', () => {
  it('⭐ 同构 GROUP：仅绝对 y 不同 → 签名相同（列表项共享背景场景）', () => {
    const ys = [550, 627, 704, 781, 858, 935, 1012, 1089, 1166, 1243, 1320, 1397]
    const sigs = new Set(ys.map((y) => generateContainerSignature(mkRowBg(y))))
    expect(sigs.size).toBe(1)
  })

  it('⭐ 浮点噪声免疫：x 差 0.000002 → 签名相同', () => {
    const a = generateContainerSignature(mkRowBg(550, 0))
    const b = generateContainerSignature(mkRowBg(550, 0.000002))
    expect(a).toBe(b)
  })

  it('防误去重：渐变 stop 颜色不同 → 签名不同', () => {
    const a = mkRowBg(550)
    const b = mkRowBg(550)
    b.children[0].fills = [GRAD(0.9)]
    expect(generateContainerSignature(a)).not.toBe(generateContainerSignature(b))
  })

  it('防误去重：尺寸不同 → 签名不同', () => {
    const a = mkRowBg(550)
    const b = mkRowBg(550)
    b.absoluteBoundingBox.width = 200
    expect(generateContainerSignature(a)).not.toBe(generateContainerSignature(b))
  })

  it('防误去重：文本内容不同 → 签名不同', () => {
    const withText = (chars: string) => ({
      name: 'bg',
      type: 'GROUP',
      absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 40 },
      children: [
        {
          name: 'label',
          type: 'TEXT',
          characters: chars,
          absoluteBoundingBox: { x: 4, y: 4, width: 80, height: 16 },
        },
      ],
    })
    expect(generateContainerSignature(withText('CO/VI检测器'))).not.toBe(
      generateContainerSignature(withText('激光雷达')),
    )
  })

  it('防误去重：name 不同 → 签名不同（保守策略：同名是复制件的强信号）', () => {
    const a = mkRowBg(550)
    const b = mkRowBg(550)
    b.name = 'background'
    expect(generateContainerSignature(a)).not.toBe(generateContainerSignature(b))
  })

  it('防误去重：子节点顺序不同（z-index 不同）→ 签名不同', () => {
    const a = mkRowBg(550)
    const b = mkRowBg(550)
    b.children = [b.children[1], b.children[0]]
    expect(generateContainerSignature(a)).not.toBe(generateContainerSignature(b))
  })

  it('无效输入 → null', () => {
    expect(generateContainerSignature(null)).toBeNull()
    expect(generateContainerSignature(undefined)).toBeNull()
    expect(generateContainerSignature('x' as any)).toBeNull()
  })
})
