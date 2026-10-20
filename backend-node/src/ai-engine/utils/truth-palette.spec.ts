/**
 * #139（N3）：node 侧真值色板 + 变量补齐「真值优先」。
 *
 * 事故（e7a50be7 实锤）：产物 theme-vars.less 有 142 个 `// 自动添加（语义推断）` 颜色变量，
 * 值全部按名字猜——group-bg-gold→#ffffff、group-glow-gold→#333333、accent-gold→#409EFF（蓝），
 * 而 Figma 真值分别是 rgba(226,208,132,0.2)、#ffc800、#ffc800。样式整体漂移。
 */
import {
  buildTruthPalette,
  bucketOfProperty,
  colorFamily,
  familyFromVarName,
  findConsumerProperty,
  narrowTruthCandidates,
  NEUTRAL_BY_BUCKET,
  neutralForBucket,
  parseCssColor,
  pickTruthCandidate,
} from './truth-palette.js'

function fixtureFigma() {
  return {
    id: '1:1',
    type: 'FRAME',
    name: 'root',
    absoluteBoundingBox: { x: 0, y: 0, width: 600, height: 400 },
    children: [
      {
        // 面板底：黄 20%（半透明 ⟂ rgba 形态）
        id: '38:3138',
        type: 'RECTANGLE',
        absoluteBoundingBox: { x: 0, y: 0, width: 600, height: 160 },
        fills: [{ type: 'SOLID', color: { r: 0.886, g: 0.816, b: 0.517, a: 0.2 } }],
        effects: [
          {
            type: 'INNER_SHADOW',
            visible: true,
            color: { r: 1, g: 0.784, b: 0, a: 1 },
            offset: { x: 0, y: 0 },
            radius: 16,
            spread: 0,
          },
        ],
      },
      {
        // chips 底：米白不透明 ⟂ hex 形态
        id: '38:3141',
        type: 'FRAME',
        absoluteBoundingBox: { x: 10, y: 10, width: 120, height: 30 },
        fills: [{ type: 'SOLID', color: { r: 1, g: 0.992, b: 0.945, a: 1 } }],
        strokes: [{ type: 'SOLID', color: { r: 0.91, g: 0.91, b: 0.91, a: 1 } }],
      },
      {
        id: '38:3143',
        type: 'TEXT',
        absoluteBoundingBox: { x: 20, y: 15, width: 60, height: 20 },
        characters: '8台',
        fills: [{ type: 'SOLID', color: { r: 0.725, g: 0.627, b: 0, a: 1 } }],
      },
      { id: '38:3144', type: 'RECTANGLE', absoluteBoundingBox: { x: 0, y: 0, width: 0, height: 0 }, fills: [] },
    ],
  }
}

describe('buildTruthPalette（node 出颜色 · 按用途分桶）', () => {
  const palette = buildTruthPalette(fixtureFigma())

  test('半透明填充 ⇒ rgba 形态进 backgrounds', () => {
    expect(palette.backgrounds).toContain('rgba(226, 208, 132, 0.2)')
  })

  test('不透明填充 ⇒ hex 形态进 backgrounds', () => {
    expect(palette.backgrounds).toContain('#fffdf1')
    // 不透明必须落成 hex（而不是 rgba(x,x,x,1)），否则 LESS 里求值形态与真值不一致
    expect(palette.backgrounds.filter((v) => v.startsWith('#')).length).toBeGreaterThan(0)
    expect(palette.backgrounds).not.toContain('rgba(255, 253, 241, 1)')
  })

  test('INNER_SHADOW 颜色进 shadows（发光真值）', () => {
    expect(palette.shadows).toContain('#ffc800')
  })

  test('strokes 颜色进 borders', () => {
    expect(palette.borders).toContain('#e8e8e8')
  })

  test('TEXT 填充色进 texts', () => {
    expect(palette.texts).toContain('#b9a000')
  })

  test('零面积节点不参与（不污染候选集）', () => {
    expect(palette.backgrounds.length).toBeGreaterThan(0)
    expect(palette.backgrounds.every((v) => typeof v === 'string' && v.length > 0)).toBe(true)
  })

  test('去重保序：同色只保留一次', () => {
    const dup = buildTruthPalette({
      id: 'r',
      type: 'FRAME',
      absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 },
      children: [
        { id: 'a', type: 'RECTANGLE', absoluteBoundingBox: { x: 0, y: 0, width: 5, height: 5 }, fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 } }] },
        { id: 'b', type: 'RECTANGLE', absoluteBoundingBox: { x: 0, y: 0, width: 5, height: 5 }, fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 } }] },
      ],
    })
    expect(dup.backgrounds.filter((v) => v === '#ff0000')).toHaveLength(1)
  })

  test('兼容 {document:{…}} 包装', () => {
    const wrapped = buildTruthPalette({ document: fixtureFigma() })
    expect(wrapped.backgrounds).toContain('rgba(226, 208, 132, 0.2)')
  })
})

describe('变量消费属性 → 真值桶', () => {
  test('属性归桶正确', () => {
    expect(bucketOfProperty('background')).toBe('backgrounds')
    expect(bucketOfProperty('background-color')).toBe('backgrounds')
    expect(bucketOfProperty('box-shadow')).toBe('shadows')
    expect(bucketOfProperty('border')).toBe('borders')
    expect(bucketOfProperty('border-color')).toBe('borders')
    expect(bucketOfProperty('color')).toBe('texts')
    expect(bucketOfProperty('padding')).toBeNull()
  })

  test('findConsumerProperty 从样式文本定位变量消费属性', () => {
    const styleText = `
      .x { background: @color-group-bg-gold; }
      .y { box-shadow: inset 0 0 16px 0 @color-group-glow-gold; }
    `
    expect(findConsumerProperty(styleText, 'color-group-bg-gold')).toBe('background')
    expect(findConsumerProperty(styleText, 'color-group-glow-gold')).toBe('box-shadow')
    expect(findConsumerProperty(styleText, 'color-not-used')).toBeNull()
  })

  test('变量名边界：@a 不误命中 @ab', () => {
    const styleText = `.z { color: @color-ab; }`
    expect(findConsumerProperty(styleText, 'color-a')).toBeNull()
    expect(findConsumerProperty(styleText, 'color-ab')).toBe('color')
  })
})

describe('桶内中性兜底（无真值时不编造语义色）', () => {
  test('backgrounds 用全透明（不改变视觉）', () => {
    expect(NEUTRAL_BY_BUCKET.backgrounds).toBe('rgba(0, 0, 0, 0)')
  })
  test('shadows / borders / texts 为可求值中性色', () => {
    expect(NEUTRAL_BY_BUCKET.shadows).toMatch(/^rgba?\(/)
    expect(NEUTRAL_BY_BUCKET.borders).toMatch(/^#/)
    expect(NEUTRAL_BY_BUCKET.texts).toMatch(/^#/)
  })
})

describe('neutralForBucket（明暗感知、绝不语义彩色）', () => {
  test('backgrounds 不能是透明（否则面板/卡片底直接消失）', () => {
    expect(neutralForBucket('backgrounds', { dark: false })).toBe('#ffffff')
    expect(neutralForBucket('backgrounds', { dark: true })).toBe('#2b2b2b')
  })
  test('borders / texts 按明暗分叉', () => {
    expect(neutralForBucket('borders', { dark: true })).toBe('#4b4b4b')
    expect(neutralForBucket('texts', { dark: true })).toBe('#e6e6e6')
  })
  test('任何兜底都不含语义色（#409EFF/#52c41a/#faad14/#f5222d 是猜色来路）', () => {
    const forbidden = ['#409eff', '#52c41a', '#faad14', '#f5222d']
    for (const bucket of ['backgrounds', 'shadows', 'borders', 'texts']) {
      for (const dark of [true, false]) {
        expect(forbidden).not.toContain(neutralForBucket(bucket, { dark }).toLowerCase())
      }
    }
  })
})

describe('parseCssColor / colorFamily（色系判定）', () => {
  test('解析 #hex / rgba / 渐变首 stop', () => {
    expect(parseCssColor('#ffc800')).toMatchObject({ r: 255, g: 200, b: 0 })
    expect(parseCssColor('rgba(226, 208, 132, 0.2)')).toMatchObject({ a: 0.2 })
    expect(parseCssColor('linear-gradient(180deg, #d4e3ff 0%, #c1d6ff 100%)')).toMatchObject({ r: 212 })
    expect(parseCssColor('not-a-color')).toBeNull()
  })

  test('色系与 e7a50be7 真值对齐（gold / green / cyan / blue）', () => {
    expect(colorFamily('#ffc800')).toBe('gold')
    expect(colorFamily('rgba(226, 208, 132, 0.2)')).toBe('gold')
    expect(colorFamily('#b9a000')).toBe('gold')
    expect(colorFamily('rgba(216, 255, 233, 0.32)')).toBe('green')
    expect(colorFamily('rgba(53, 190, 82, 0.82)')).toBe('green')
    expect(colorFamily('rgba(25, 181, 186, 0.67)')).toBe('cyan')
    expect(colorFamily('#409EFF')).toBe('blue')
  })

  test('近中性色无色系（#fff/#333/#eee 不得被塞进任何色系）', () => {
    expect(colorFamily('#ffffff')).toBeNull()
    expect(colorFamily('#333333')).toBeNull()
    expect(colorFamily('#eeeeee')).toBeNull()
  })
})

describe('familyFromVarName（变量名色系词）', () => {
  test('命中常见色系词', () => {
    expect(familyFromVarName('color-group-bg-gold')).toBe('gold')
    expect(familyFromVarName('@color-accent-mint')).toBe('green')
    expect(familyFromVarName('color-group-glow-cyan')).toBe('cyan')
  })
  test('无色系词返回 null', () => {
    expect(familyFromVarName('color-bg-card-panel')).toBeNull()
    expect(familyFromVarName('color-vendor-count-active')).toBeNull()
  })
  test('按 - 分片匹配，避免 goldenrod 之类误命中', () => {
    expect(familyFromVarName('color-goldenrod')).toBeNull()
  })
})

describe('narrowTruthCandidates / pickTruthCandidate（只收窄、不发明）', () => {
  const palette = {
    backgrounds: [
      'linear-gradient(180deg, #d4e3ff 0%, #c1d6ff 100%)',
      'rgba(226, 208, 132, 0.2)',
      '#fffdf1',
      'rgba(216, 255, 233, 0.32)',
      '#f6fff7',
      'rgba(244, 254, 255, 0.35)',
      '#f2fdff',
    ],
    shadows: ['#ffc800', 'rgba(53, 190, 82, 0.82)', 'rgba(25, 181, 186, 0.67)'],
    borders: ['#a0c1ff'],
    texts: ['#b9a000', 'linear-gradient(180deg, #fee127 0%, #988717 100%)', '#00ac2e', '#333333'],
  }

  test('色系 + 透明度档位收窄到唯一：group-bg-gold ⇒ 半透明金面板底', () => {
    expect(
      pickTruthCandidate(palette, 'backgrounds', {
        varName: 'color-group-bg-gold',
        property: 'background',
      }),
    ).toBe('rgba(226, 208, 132, 0.2)')
  })

  test('发光色：gold/mint/cyan 一色一族，各自唯一', () => {
    expect(pickTruthCandidate(palette, 'shadows', { varName: 'color-accent-gold', property: 'box-shadow' })).toBe('#ffc800')
    expect(pickTruthCandidate(palette, 'shadows', { varName: 'color-group-glow-mint', property: 'box-shadow' })).toBe('rgba(53, 190, 82, 0.82)')
    expect(pickTruthCandidate(palette, 'shadows', { varName: 'color-group-glow-cyan', property: 'box-shadow' })).toBe('rgba(25, 181, 186, 0.67)')
  })

  test('color 属性不接受渐变 ⇒ 排除渐变真值后唯一', () => {
    expect(pickTruthCandidate(palette, 'texts', { varName: 'color-count-gold', property: 'color' })).toBe('#b9a000')
    expect(pickTruthCandidate(palette, 'texts', { varName: 'color-list-value-mint', property: 'color' })).toBe('#00ac2e')
  })

  test('无真值的变量名 ⇒ 全部候选皆非（不误判），返回 null', () => {
    // 无色系词 + 多候选（3 个半透明面板底）⇒ 不可判定
    expect(pickTruthCandidate(palette, 'backgrounds', { varName: 'color-bg-card-panel', property: 'background' })).toBeNull()
  })

  test('收窄只做交集：结果必是桶内已有候选的子集', () => {
    const narrowed = narrowTruthCandidates(palette, 'backgrounds', {
      varName: 'color-group-bg-mint',
      property: 'background',
    })
    expect(narrowed.length).toBeGreaterThan(0)
    for (const v of narrowed) expect(palette.backgrounds).toContain(v)
  })

  test('空色板 / 未知桶 ⇒ 空数组（fail-closed）', () => {
    expect(narrowTruthCandidates(null, 'shadows', {})).toEqual([])
    expect(narrowTruthCandidates(palette, 'unknown', {})).toEqual([])
  })
})
