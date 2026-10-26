/**
 * R25-a（2026-10-26 · B 批 · mc-max-1792985029695-58de7d47 真机实锤）：
 * **vision 声明「锚点 id ↔ 可见文案」与 Figma 真值对账** 的判据 spec。
 *
 * 阳性对照**不是手编夹具**，而是从真机 checkpoint 复刻的忠实数据：
 *   · 真值树 `.mc-gen/cache/figma-node-data.json` 的 `36:1693` 子树（逐节点 id/type/characters 原样）；
 *   · vision 声明 `.checkpoint/visual.json` 的 3 个 section（逐对 id/text 原样）。
 * 断言的是**模块自身跑真机数据得到的计数**（24 对 / 1 命中 / 23 错配；三段 29 / 1 / 27 / 1）。
 *
 * 判据一律「判落位」：既验命中/错配报得对，也验**不误伤**（挂容器仍命中、id 不在树不报 issue）。
 */
import {
  auditContentAnchorConsistency,
  collectDeclaredTexts,
  isDeclaredContentEntry,
  readDeclaredTexts,
  CONTENT_TEXT_FIELDS,
} from './vision-content-anchor-consistency.js'

/** TEXT 真值节点（characters 为唯一文案真值） */
function text(id: string, characters: string) {
  return { id, name: characters, type: 'TEXT', characters, children: [] }
}
/** 非文本真值节点 */
function box(id: string, name: string, type = 'RECTANGLE') {
  return { id, name, type, children: [] }
}

/**
 * 🔴 真机真值树（原样复刻）：`36:1693` FRAME → `801:3` GROUP → {36:1698, 36:1708, 36:1719,
 * `81:7` GROUP(24 个 TEXT，含非连续 `81:3`/`81:5`/`81:4`/`81:6`), 36:1721, 36:1722 FRAME}
 * —— `36:1696` **刻意不存在**（vision 的幻觉 id）。
 */
function makeRealFigma() {
  // `81:7` 内 24 个 TEXT 的**真值树序**（12 组「标签/值」，穿插 4 个非连续前缀节点）
  const rowOrder: Array<[string, string]> = [
    ['36:1699', '所属产品'],
    ['36:1700', '所属路公司'],
    ['36:1701', '设备类型'],
    ['36:1702', '产品厂家'],
    ['36:1703', '链接分类'],
    ['36:1704', '父级设备'],
    ['36:1705', '设备IP'],
    ['36:1706', '端口号'],
    ['36:1707', '桩号'],
    ['81:3', '设备精度'],
    ['36:1709', '位置'],
    ['81:5', '设备维度'],
    ['36:1710', '爆闪灯'],
    ['36:1711', '江苏通行宝'],
    ['36:1712', '具身机器人'],
    ['36:1713', '感动科技'],
    ['36:1714', '直连设备'],
    ['36:1715', 'AP12343'],
    ['36:1716', '192.168.245.123'],
    ['36:1717', '8088'],
    ['36:1718', 'k200+150'],
    ['81:4', '118.782781'],
    ['36:1720', 'G42高速公路上'],
    ['81:6', '32.061262'],
  ]
  const LONG_DESC =
    '该设备为太阳能供电一体化爆闪灯，采用红蓝双色高壳LED阵列，支持远程开关控制与闪烁频率调节，具备低功耗、全天候防水及自动光感启闭功能，广泛应用于高速公路施工警示、事故现场防护、隧道出入口提示等场景。'

  return {
    document: {
      id: '36:1693',
      name: 'cp-设备详情',
      type: 'FRAME',
      absoluteBoundingBox: { x: 0, y: 0, width: 603, height: 555 },
      children: [
        box('36:1694', 'bg'),
        box('36:1697', 'header', 'VECTOR'),
        {
          id: '801:3',
          name: 'slot-icon',
          type: 'GROUP',
          absoluteBoundingBox: { x: 0, y: 0, width: 547, height: 493 },
          children: [
            box('36:1695', 'Rectangle 346242326'),
            text('36:1698', '编码'),
            text('36:1708', '产品描述'),
            text('36:1719', LONG_DESC),
            {
              id: '81:7',
              name: 'Group 2136638454',
              type: 'GROUP',
              absoluteBoundingBox: { x: 0, y: 0, width: 440, height: 135.25 },
              children: rowOrder.map(([id, c]) => text(id, c)),
            },
            text('36:1721', '爆闪灯'),
            {
              id: '36:1722',
              name: 'Frame 2136639901',
              type: 'FRAME',
              children: [text('36:1723', 'ROB004')],
            },
            text('36:1724', 'GD-Robot-04'),
          ],
        },
      ],
    },
  }
}

/**
 * 🔴 真机 vision 声明（原样复刻）：`36:1698` 段 24 对 `{id, text}`，
 * 文案读对了、id 按**行序**顺延贴（第 2 项起整体错位）。
 */
const REAL_DECLARED_24: Array<[string, string]> = [
  ['36:1699', '所属产品'],
  ['36:1700', '爆闪灯'],
  ['36:1701', '产品厂家'],
  ['36:1702', '感动科技'],
  ['36:1703', '设备类型'],
  ['36:1704', '具身机器人'],
  ['36:1705', '所属路公司'],
  ['36:1706', '江苏通行宝'],
  ['36:1707', '链接分类'],
  ['36:1708', '直连设备'],
  ['36:1709', '父级设备'],
  ['36:1710', 'AP12343'],
  ['36:1711', '设备IP'],
  ['36:1712', '192.168.245.123'],
  ['36:1713', '端口号'],
  ['36:1714', '8088'],
  ['36:1715', '桩号'],
  ['36:1716', 'k200+150'],
  ['36:1717', '位置'],
  ['36:1718', 'G42高速公路上'],
  ['36:1719', '设备精度'],
  ['36:1720', '118.782781'],
  ['36:1721', '设备维度'],
  ['36:1722', '32.061262'],
]

const LONG_DESC =
  '该设备为太阳能供电一体化爆闪灯，采用红蓝双色高壳LED阵列，支持远程开关控制与闪烁频率调节，具备低功耗、全天候防水及自动光感启闭功能，广泛应用于高速公路施工警示、事故现场防护、隧道出入口提示等场景。'

/** 真机 3 个 section（顶层 36:1693 / 36:1723 / 36:1698） */
function makeRealSections() {
  return [
    {
      id: '36:1693',
      name: '设备头部信息',
      role: '常驻',
      body: {
        children: [
          { id: '801:3', name: '设备图', role: 'image', type: 'image' },
          { id: '36:1694', name: '设备编号', role: 'text', type: 'title', text: 'GD-Robot-04' },
          { id: '36:1695', name: '编码', role: 'text', type: 'label', text: '编码' },
          { id: '36:1696', name: '编码值', role: 'text', type: 'value', text: 'ROB004' },
          { id: '36:1697', name: '设备名称', role: 'text', type: 'label', text: '爆闪灯' },
        ],
      },
    },
    {
      id: '36:1723',
      name: '产品描述',
      role: '常驻',
      body: {
        children: [
          { id: '36:1724', name: '产品描述值', role: 'text', type: 'value', text: LONG_DESC },
        ],
      },
    },
    {
      id: '36:1698',
      name: '属性列表',
      role: '常驻',
      body: {
        layout: 'grid',
        gridColumns: 2,
        children: REAL_DECLARED_24.map(([id, t]) => {
          const isValue = ['爆闪灯', '感动科技', '具身机器人', '江苏通行宝', '直连设备', 'AP12343', '192.168.245.123', '8088', 'k200+150', '118.782781', '32.061262', 'G42高速公路上'].includes(t)
          return { id, name: isValue ? '值' : t, role: 'text', type: isValue ? 'value' : 'label', text: t }
        }),
      },
    },
  ]
}

describe('R25-a auditContentAnchorConsistency：vision 文案 ↔ 锚点 id 对账', () => {
  test('🔴 真机阳性对照：36:1698 段 24 对 ⇒ 1 命中 / 23 错配（内容串味实锤）', () => {
    const sections = makeRealSections()
    const report = auditContentAnchorConsistency({ sections: [sections[2]], figmaNodeData: makeRealFigma() })

    expect(report.skipped).toBe(false)
    expect(report.pairs).toBe(24)
    expect(report.matched).toBe(1)
    expect(report.mismatched).toBe(23)
    expect(report.notInTree).toBe(0)
    expect(report.ratio).toBe(4.2) // 1/24 = 4.17% → 保留一位
    expect(report.evaluated).toBe(24)
  })

  test('🔴 真机阳性对照：错配 issue 精确落位（declared 与真值文本域都给全）', () => {
    const report = auditContentAnchorConsistency({
      sections: [makeRealSections()[2]],
      figmaNodeData: makeRealFigma(),
    })

    // 36:1700 声明「爆闪灯」，真值却是「所属路公司」
    const hit = report.issues.find((i: any) => i.id === '36:1700')
    expect(hit).toMatchObject({
      sectionId: '36:1698',
      id: '36:1700',
      declared: '爆闪灯',
      truthTexts: ['所属路公司'],
      truthType: 'TEXT',
    })
    // 唯一命中项（36:1699）不得出现在 issues
    expect(report.issues.some((i: any) => i.id === '36:1699')).toBe(false)
  })

  test('🔴 真机三段合计：29 对 / 1 命中 / 27 错配 / 1 不在树 / ratio 3.6', () => {
    const report = auditContentAnchorConsistency({
      sections: makeRealSections(),
      figmaNodeData: makeRealFigma(),
    })

    expect(report.pairs).toBe(29)
    expect(report.matched).toBe(1)
    expect(report.mismatched).toBe(27)
    expect(report.notInTree).toBe(1)
    expect(report.ratio).toBe(3.6) // 1/28 = 3.57%
  })

  test('🔴 幻觉 id（36:1696）只计 notInTree，不报 issue（归属 validateVisionAnchors 单一来源）', () => {
    const report = auditContentAnchorConsistency({
      sections: makeRealSections(),
      figmaNodeData: makeRealFigma(),
    })

    expect(report.notInTree).toBe(1)
    expect(report.issues.some((i: any) => i.id === '36:1696')).toBe(false)
    // 不在树的对计入 pairs，但不进 judged（ratio 分母 = matched+mismatched）
    expect(report.pairs).toBe(report.matched + report.mismatched + report.notInTree)
  })

  test('阳性对照：真值文案与声明一致 ⇒ 零 issue（判据不是恒真）', () => {
    const figma = {
      document: {
        id: '1:1',
        name: 'page',
        type: 'FRAME',
        children: [text('5:5', '所属产品'), text('6:6', '爆闪灯')],
      },
    }
    const sections = [
      {
        id: '1:1',
        name: '属性列表',
        body: { children: [{ id: '5:5', text: '所属产品' }, { id: '6:6', text: '爆闪灯' }] },
      },
    ]
    const report = auditContentAnchorConsistency({ sections, figmaNodeData: figma })

    expect(report.pairs).toBe(2)
    expect(report.matched).toBe(2)
    expect(report.mismatched).toBe(0)
    expect(report.issues).toHaveLength(0)
    expect(report.ratio).toBe(100)
  })

  test('阴性对照一：文案挂在**容器** id 上仍命中（子树文本域，不误伤）', () => {
    const figma = {
      document: {
        id: '1:1',
        name: 'page',
        type: 'FRAME',
        children: [
          {
            id: '4:4',
            name: 'cardA',
            type: 'GROUP',
            children: [text('5:5', '所属产品'), text('6:6', '爆闪灯')],
          },
        ],
      },
    }
    const sections = [
      { id: '1:1', body: { children: [{ id: '4:4', text: '爆闪灯' }] } },
    ]
    const report = auditContentAnchorConsistency({ sections, figmaNodeData: figma })

    expect(report.matched).toBe(1)
    expect(report.mismatched).toBe(0)
    expect(report.issues).toHaveLength(0)
  })

  test('阴性对照二：声明文案是容器子树文本的**超串/子串**（OCR 截断）仍命中', () => {
    const figma = {
      document: {
        id: '1:1',
        name: 'page',
        type: 'FRAME',
        children: [text('5:5', 'G42高速公路上')],
      },
    }
    const sections = [
      { id: '1:1', body: { children: [{ id: '5:5', text: 'G42高速公路' }] } },
    ]
    const report = auditContentAnchorConsistency({ sections, figmaNodeData: figma })

    expect(report.matched).toBe(1)
    expect(report.issues).toHaveLength(0)
  })

  test('阴性对照三：归一化剔空白 ⇒ 空格差异不误报', () => {
    const figma = {
      document: {
        id: '1:1',
        name: 'page',
        type: 'FRAME',
        children: [text('5:5', '所属产品')],
      },
    }
    const sections = [
      { id: '1:1', body: { children: [{ id: '5:5', text: '所属 产品' }] } },
    ]
    const report = auditContentAnchorConsistency({ sections, figmaNodeData: figma })

    expect(report.matched).toBe(1)
    expect(report.issues).toHaveLength(0)
  })

  test('🔴 只认 text/characters/content —— name/role/type 不得被当作文案（防 _extractVisionTexts 污染回归）', () => {
    expect(CONTENT_TEXT_FIELDS).toEqual(['text', 'characters', 'content'])

    const figma = {
      document: {
        id: '1:1',
        name: 'page',
        type: 'FRAME',
        children: [text('5:5', '爆闪灯')],
      },
    }
    // name 是「值」这类描述/图层名，text 才是渲染文案；误收 name 会凭空多出「值」这一对
    const sections = [
      { id: '1:1', body: { children: [{ id: '5:5', name: '所属产品值', role: 'value', type: 'value', text: '爆闪灯' }] } },
    ]
    const report = auditContentAnchorConsistency({ sections, figmaNodeData: figma })

    expect(report.pairs).toBe(1) // 只有 text 一对
    expect(report.matched).toBe(1)
    expect(report.issues).toHaveLength(0)
  })

  test('语义 id（非 Figma 形态）不采集；同 id 同 text 去重', () => {
    const figma = {
      document: { id: '1:1', name: 'page', type: 'FRAME', children: [text('5:5', '爆闪灯')] },
    }
    const sections = [
      {
        id: '1:1',
        body: {
          children: [
            { id: 'section-child', text: '语义名不算锚点' },
            { id: '5:5', text: '爆闪灯' },
            { id: '5:5', text: '爆闪灯' },
          ],
        },
      },
    ]
    const report = auditContentAnchorConsistency({ sections, figmaNodeData: figma })

    expect(report.pairs).toBe(1)
    expect(report.matched).toBe(1)
  })

  test('issue 明细上限 40（防幻觉风暴撑爆 checkpoint）', () => {
    const kids = Array.from({ length: 45 }, (_, i) => ({ id: `${10 + i}:1`, text: `文案${i}` }))
    const figma = {
      document: {
        id: '1:1',
        name: 'page',
        type: 'FRAME',
        children: kids.map((k) => text(k.id, '真值')),
      },
    }
    const sections = [{ id: '1:1', body: { children: kids } }]
    const report = auditContentAnchorConsistency({ sections, figmaNodeData: figma })

    expect(report.pairs).toBe(45)
    expect(report.mismatched).toBe(45)
    expect(report.issues).toHaveLength(40)
  })

  test('fail-open 三态：无 sections / 无真值树 / 无声明对', () => {
    const figma = makeRealFigma()

    expect(auditContentAnchorConsistency({ sections: [], figmaNodeData: figma })).toMatchObject({
      skipped: true,
      skippedReason: 'no-sections',
      evaluated: 0,
      ratio: null,
      issues: [],
    })
    expect(auditContentAnchorConsistency({ sections: makeRealSections(), figmaNodeData: null })).toMatchObject({
      skipped: true,
      skippedReason: 'no-figma-tree',
    })
    expect(
      auditContentAnchorConsistency({
        sections: [{ id: '1:1', name: '空段', body: { children: [] } }],
        figmaNodeData: figma,
      }),
    ).toMatchObject({ skipped: true, skippedReason: 'no-declared-pairs' })
  })

  test('裸根真值树（无 document 包装）同样可用；非法入参零副作用', () => {
    const bare = makeRealFigma().document
    const report = auditContentAnchorConsistency({
      sections: [makeRealSections()[2]],
      figmaNodeData: bare,
    })
    expect(report.matched).toBe(1)
    expect(report.mismatched).toBe(23)

    expect(auditContentAnchorConsistency().skipped).toBe(true)
    expect(auditContentAnchorConsistency(null as any).skipped).toBe(true)
    expect(auditContentAnchorConsistency({ sections: null, figmaNodeData: bare }).skipped).toBe(true)
  })

  test('纯诊断：不得篡改传入的 sections（只留痕）', () => {
    const sections = makeRealSections()
    const snapshot = JSON.stringify(sections)
    auditContentAnchorConsistency({ sections, figmaNodeData: makeRealFigma() })
    expect(JSON.stringify(sections)).toBe(snapshot)
  })
})

/**
 * R25-a 第二部分：**形态门禁采集器** `collectDeclaredTexts`。
 *
 * 消费方 `visual-parser#_extractVisionTexts`（原实现递归收**所有**字符串、只排 5 个技术键，
 * 真机实测 475 串 / 44 条被误判为「可疑文字」，100% 是 pipeline 注解与图层名）。
 * 本组用例锁定三件事：
 *   ① 真机载荷 ⇒ 采集 **29** 串（与真机一致），注解/图层名/段描述一律不入集；
 *   ② **检测力不丢**：非 section 容器（`charts` / `headerSlots` / `elements`）里声明的真实
 *      OCR 错字仍会被采集（限定 sections 会让这些位置的误读静默漏检）；
 *   ③ 门禁本体（`isDeclaredContentEntry` / `readDeclaredTexts`）为**单一来源**，字段域可验。
 */
describe('R25-a collectDeclaredTexts：形态门禁采集器（供 visual-parser#_extractVisionTexts 复用）', () => {
  test('🔴 真机阳性对照：真机 3 段载荷 ⇒ 采集 29 串（与真机一致），pipeline 注解零入集', () => {
    // 下面这些「注解 / 图层名 / 段描述 / 技术字段」正是旧口径（排除 5 键）误收的东西
    const parsed = {
      layoutStructure: { layout: { sections: makeRealSections() } },
      notes: '设备详情面板',
      elements: [
        { name: '包含设备图标', description: '视觉元素存在但 headerSlots 为空' },
        { id: 'not-a-figma-id', text: '未显示的下拉选项' },
      ],
      theme: 'dark',
      direction: 'vertical',
      layoutSource: 'inferred',
    }

    const texts = collectDeclaredTexts(parsed)

    expect(texts).toHaveLength(29)
    expect(texts).toContain('GD-Robot-04')
    expect(texts).toContain('ROB004')
    expect(texts).toContain(LONG_DESC)
    // 旧口径采集到的噪声，一律不入集
    for (const noise of [
      '设备详情面板',
      '包含设备图标',
      '视觉元素存在但 headerSlots 为空',
      '未显示的下拉选项',
      'dark',
      'vertical',
      'inferred',
    ]) {
      expect(texts).not.toContain(noise)
    }
  })

  test('🔴 检测力不丢：非 section 容器里声明的文案照样采集（含真 OCR 错字）', () => {
    const parsed = {
      layoutStructure: { layout: { sections: [] } },
      charts: [{ id: '36:1799', text: '爆闪燈' }], // 真 OCR 错字（真值应为「爆闪灯」）⇒ 必须能被抓
      headerSlots: [{ id: '36:1800', characters: '设备名称' }],
    }

    expect(collectDeclaredTexts(parsed)).toEqual(['爆闪燈', '设备名称'])
  })

  test('形态门禁（单一来源）：缺 Figma 形态 id / 无文案字段 ⇒ 不采集', () => {
    const node = {
      id: '36:1699', // ✅ Figma 形态
      text: '所属产品', // ✅ 文案字段
      name: '所属产品值', // ❌ 图层名（真机里是「值」这类描述）
      role: 'label', // ❌ 结构元数据
      type: 'text', // ❌
      layout: 'grid', // ❌
      reason: 'vision 自述', // ❌
      description: '段描述', // ❌
    }
    expect(isDeclaredContentEntry(node)).toBe(true)
    expect(readDeclaredTexts(node)).toEqual(['所属产品'])

    // 语义 id（非 Figma 形态）即便带 text 也不算「声称自己是 Figma 节点」
    expect(isDeclaredContentEntry({ id: 'section-cards', text: '语义 id 不算' })).toBe(false)
    // 有 id 无文案 / 有文案无 id / 文案全空白 / 非对象
    expect(isDeclaredContentEntry({ id: '36:1699' })).toBe(false)
    expect(isDeclaredContentEntry({ text: '无 id' })).toBe(false)
    expect(isDeclaredContentEntry({ id: '36:1699', text: '   ' })).toBe(false)
    expect(isDeclaredContentEntry(null as any)).toBe(false)
    expect(isDeclaredContentEntry('36:1699')).toBe(false)

    // 字段域与 `CONTENT_TEXT_FIELDS` 同源（改这里必改那个常量，反之亦然）
    expect(CONTENT_TEXT_FIELDS).toEqual(['text', 'characters', 'content'])
    expect(
      collectDeclaredTexts({
        x: [
          { id: '2:2', characters: '编码' },
          { id: '2:3', content: '产品描述' },
          { id: '2:4', title: 'title 不在域内' },
        ],
      }),
    ).toEqual(['编码', '产品描述'])
  })

  test('去重键 = id\\u0000text：同 id 同文案只留一次；同文案挂不同 id 各自保留', () => {
    const parsed = {
      a: [
        { id: '1:1', text: '爆闪灯' },
        { id: '1:1', text: '爆闪灯' },
        { id: '1:2', text: '爆闪灯' },
      ],
      b: [{ id: '1:1', text: '爆闪灯' }], // 跨挂载点重复 ⇒ 仍只留一次
      c: [{ id: '1:1', characters: '编码' }, { id: '1:1', text: '编码' }], // 同 id 跨字段同文案 ⇒ 去重
    }
    expect(collectDeclaredTexts(parsed)).toEqual(['爆闪灯', '爆闪灯', '编码'])
  })

  test('fail-open：null / undefined / 标量入参零抛错', () => {
    expect(collectDeclaredTexts(null)).toEqual([])
    expect(collectDeclaredTexts(undefined)).toEqual([])
    expect(collectDeclaredTexts('abc')).toEqual([])
    expect(collectDeclaredTexts(42)).toEqual([])
    expect(collectDeclaredTexts([])).toEqual([])
  })
})
