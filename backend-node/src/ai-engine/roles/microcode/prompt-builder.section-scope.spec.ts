/**
 * Phase I-1/2（2026-11-02）：子组件 chunk 的「段归属」契约锁。
 *
 * 病灶（真机 `mc-max-1793582674250-3b0689c9` 铁证）：
 *   `buildSubcomponentScopedInput` 原来靠 `tagWords(tagName)` 去 `sec.id/responsibility/title`
 *   里 `includes` 反猜归属。子组件名是英文（`ContentSection` / `ListSection`），段标题是中文
 *   （「底部汇总」/「节点列表」），**无词交集** ⇒ `matchedSection=null`
 *   ⇒ 资源过滤 / layoutStructure.sections 子集 / figma 子树 **三处全链 fail-open 回退全量**
 *   ⇒ 每个子组件 chunk 都看到兄弟段的全部事实，且 prompt 里没有任何一句说明「本文件只负责哪一段」
 *   ⇒ `ContentSection.vue` 自己又渲染了一遍列表 ⇒ 页面上同一份内容上下重复、样式还不同。
 *
 * 本 spec 锁四件事（防止治理被静默回退）：
 *   ① 组件名 → section **精确反查**（`assignSectionComponentNames` 同源）；未知名不得模糊命中；
 *   ② 映射命中后裁剪真的收口（`layoutStructure.sections` 由 2 收到 1），并下发 `scopedInputCut` 观测；
 *   ③ 子组件 chunk 拿到**段身份契约**（`data-section-id` + 本段真值全集 + 禁跨段），
 *      且真值**不含兄弟段文案**（ContentSection 不得拿到「江苏联网节点」，ListSection 不得拿到「共 6 个节点」）；
 *   ④ 零漂移：名字对不上 / 无 `_sectionScope` ⇒ 契约空串、不写 `_sectionScope`。
 */
jest.mock('../../utils/prompt-loader.js', () => ({
  buildSharedSections: () => '',
  buildConcerns: () => '',
  buildFigmaStage: () => '',
  formatAssetsList: () => '',
  trimConstraintsForContext: (c = '') => c,
}))

jest.mock('../../../config/backend-root.js', () => ({
  workspaceRoot: process.cwd(),
  logsDir: '/tmp/mvgo-test-logs',
}), { virtual: true })

import {
  matchSectionByComponentName,
  countSameShapeSiblings,
  findFigmaNodeByIds,
  countNodes,
  buildSubcomponentScopedInput,
  buildSectionIdentityContract,
  buildChunkMiddle,
  resolveSectionScopeFacts,
  pruneSectionsToId,
  buildSectionStyleFactsForPrompt,
  buildTextTruthWhitelist,
  buildCodePrompt,
} from './prompt-builder.js'

// ── 真机夹具（3b0689c9 逐字：两段 + Figma 结构） ──────────────────────────────
const PLAN = {
  isForced: true,
  effectiveSections: [
    {
      id: '48:5798',
      title: '节点列表',
      responsibility:
        '列表项布局区：1 个 item 模板 + v-for 渲染 6 项，禁止拆成 6 个子组件文件',
      type: 'list',
      collapsed: true,
      itemCount: 6,
      sourceNodeIds: ['48:5798'],
      items: [
        {
          id: '48:5798-card1',
          name: '江苏联网节点',
          role: 'list-item',
          icon: { placeholder: 'icon-node-1' },
          content: {
            elements: [
              { type: 'label', text: '江苏联网节点' },
              { type: 'label', text: '江苏省南京市建邺区江东中路' },
            ],
          },
          status: {
            elements: [
              { type: 'value', text: '3,792' },
              { type: 'label', text: '在线' },
            ],
          },
        },
        {
          id: '48:5798-card2',
          name: '江苏沿江公司节点',
          role: 'list-item',
          content: { elements: [{ type: 'label', text: '江苏沿江公司节点' }] },
          status: { elements: [{ type: 'value', text: '2,138' }] },
        },
      ],
    },
    {
      id: 'footer-summary',
      title: '底部汇总',
      responsibility: '底部汇总区/分页/全局操作',
      type: 'footer',
      collapsed: false,
      sourceNodeIds: [], // 合成段：无真实 Figma 节点
      body: {
        layout: 'horizontal-2-items',
        items: [
          { content: { elements: [{ type: 'label', text: '共 6 个节点' }] } },
          {
            content: {
              elements: [
                { type: 'label', text: '接入设备 ' },
                { type: 'value', text: '10810' },
              ],
            },
          },
        ],
      },
    },
  ],
}

/** 真机结构：root → bg / header(565:2) / slot-con(565:3) → 6 张同形卡 + 2 条汇总文案 */
const card = (id: string) => ({
  id,
  type: 'GROUP',
  name: `Group ${id}`,
  absoluteBoundingBox: { x: 0, y: 0, width: 470, height: 72 },
  children: [{ id: `${id}-t`, type: 'TEXT', characters: `节点 ${id}` }],
})

const FIGMA = {
  id: '48:5796',
  type: 'GROUP',
  name: 'cp-aiot-dpjh-bsjd',
  children: [
    { id: '48:5797', type: 'RECTANGLE', name: 'bg', children: [] },
    {
      id: '565:2',
      type: 'GROUP',
      name: 'header',
      absoluteBoundingBox: { x: 0, y: 0, width: 470, height: 48 },
      children: [
        { id: '48:5901', type: 'TEXT', characters: '部署节点概览', children: [] },
      ],
    },
    {
      id: '565:3',
      type: 'GROUP',
      name: 'slot-con',
      children: [
        card('48:5798'),
        card('48:5813'),
        card('48:5828'),
        card('48:5843'),
        card('48:5858'),
        card('48:5873'),
        { id: '48:5888', type: 'TEXT', characters: '共 6 个节点', children: [] },
        { id: '48:5889', type: 'TEXT', characters: '接入设备 10810', children: [] },
      ],
    },
  ],
}

const makeInput = (plan: any = PLAN) => ({
  figmaNodeData: FIGMA,
  resourceDomMapping: [],
  elementStyleMap: {},
  layoutStructure: { sections: plan.effectiveSections.map((s: any) => ({ id: s.id, title: s.title })) },
  subComponentPlan: plan,
})

const makeLogger = () => {
  const logs: Array<{ msg: string; payload: any }> = []
  return {
    logs,
    logger: {
      info: (msg: string, payload: any) => logs.push({ msg, payload }),
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
  }
}

const cutOf = (logs: Array<{ msg: string; payload: any }>) =>
  logs.find((l) => String(l.msg).includes('事实裁剪'))?.payload?.scopedInputCut

describe('Phase I-1/2 · 组件名 → section 精确反查', () => {
  const secs = PLAN.effectiveSections

  test('真机两段全命中（ListSection→48:5798 / ContentSection→footer-summary）', () => {
    expect(matchSectionByComponentName('ListSection', secs)?.id).toBe('48:5798')
    expect(matchSectionByComponentName('ContentSection', secs)?.id).toBe('footer-summary')
  })

  test('分隔符不敏感（LLM 偶尔写 Content-Section / content_section）', () => {
    expect(matchSectionByComponentName('content-section', secs)?.id).toBe('footer-summary')
    expect(matchSectionByComponentName('LIST_SECTION', secs)?.id).toBe('48:5798')
  })

  test('未知名不模糊命中（禁止降级成前缀/包含匹配：错绑比漏绑代价高）', () => {
    expect(matchSectionByComponentName('FooterSection', secs)).toBeNull()
    expect(matchSectionByComponentName('Content', secs)).toBeNull()
    expect(matchSectionByComponentName('ListSection2', secs)).toBeNull()
  })
})

describe('Phase I-1/2 · 裁剪收口 + scopedInputCut 观测', () => {
  test('ContentSection：byMapper 命中，sections 由 2 收到 1，观测三字段齐备', () => {
    const { logs, logger } = makeLogger()
    const scoped = buildSubcomponentScopedInput(
      'package/components/ContentSection.vue',
      '',
      makeInput(),
      { logger },
    )
    const cut = cutOf(logs)
    expect(cut).toBeDefined()
    expect(cut.byMapper).toBe(true)
    expect(cut.sectionId).toBe('footer-summary')
    expect(cut.keptSections).toBe(1) // 旧实现：null 归属 ⇒ 2（全量）
    expect(cut.totalSections).toBe(2)
    expect(scoped.layoutStructure?.sections?.map((s: any) => s.id)).toEqual(['footer-summary'])
  })

  test('ListSection：同样收口到本段，且 `_sectionRef` 携带归属（L7 fileSectionMap 用）', () => {
    const { logs, logger } = makeLogger()
    const scoped = buildSubcomponentScopedInput(
      'package/components/ListSection.vue',
      '',
      makeInput(),
      { logger },
    )
    expect(cutOf(logs).sectionId).toBe('48:5798')
    expect(cutOf(logs).byMapper).toBe(true)
    expect(scoped.layoutStructure?.sections?.map((s: any) => s.id)).toEqual(['48:5798'])
  })

  test('名字对不上 ⇒ 不写 `_sectionScope`（零漂移边界）', () => {
    const { logs, logger } = makeLogger()
    const scoped = buildSubcomponentScopedInput(
      'package/components/WhateverSection.vue',
      '',
      makeInput(),
      { logger },
    )
    expect(scoped._sectionScope).toBeUndefined()
    expect(cutOf(logs).byMapper).toBe(false)
  })
})

describe('Phase I-1/2 · 段身份契约（真值不跨段）', () => {
  const contractOf = (file: string) => {
    const { logger } = makeLogger()
    const scoped = buildSubcomponentScopedInput(
      `package/components/${file}`,
      '',
      makeInput(),
      { logger },
    )
    return buildSectionIdentityContract({ files: [`package/components/${file}`], scopedInput: scoped })
  }

  test('ContentSection：data-section-id=footer-summary + 只含本段真值，不含列表条目文案', () => {
    const p = contractOf('ContentSection.vue')
    expect(p).toContain('data-section-id="footer-summary"')
    expect(p).toContain('共 6 个节点')
    expect(p).toContain('接入设备')
    expect(p).toContain('10810')
    // 🔴 核心：兄弟段（列表）的条目文案不得出现在本段契约里
    expect(p).not.toContain('江苏联网节点')
    expect(p).not.toContain('3,792')
    expect(p).not.toContain('在线')
    expect(p).toContain('禁止渲染目标段之外的任何内容')
  })

  test('ListSection：data-section-id=48:5798，真值含 6 条实例文案，不含汇总段文案', () => {
    const p = contractOf('ListSection.vue')
    expect(p).toContain('data-section-id="48:5798"')
    // items[] 实例文案（body 只有 1 份模板，必须由 items 补全）
    expect(p).toContain('江苏联网节点')
    expect(p).toContain('江苏沿江公司节点')
    expect(p).toContain('3,792')
    // 兄弟段（汇总）文案不得出现
    expect(p).not.toContain('共 6 个节点')
    expect(p).not.toContain('10810')
  })

  test('无 scopedInput / 无 _sectionScope ⇒ 空串（index.vue 等 chunk 零漂移）', () => {
    expect(buildSectionIdentityContract({ files: ['package/index.vue'] })).toBe('')
    expect(
      buildSectionIdentityContract({ files: ['package/index.vue'], scopedInput: {} }),
    ).toBe('')
  })

  test('契约**真的接进** chunk prompt 正文，且 index.vue chunk 不受污染（防「写了没接=死代码」）', () => {
    const { logger } = makeLogger()
    const scopedInput = buildSubcomponentScopedInput(
      'package/components/ContentSection.vue',
      '',
      makeInput(),
      { logger },
    )
    const base = {
      componentName: 'c-aiot-dpjh-bsjd',
      backgroundBrightness: 'dark',
      resourceDomMapping: [],
      figmaNodeData: FIGMA,
    }
    const midSub = buildChunkMiddle(
      { files: ['package/components/ContentSection.vue'], scopedInput, index: 5, total: 6 },
      base,
    )
    expect(midSub).toContain('data-section-id="footer-summary"')
    expect(midSub).toContain('禁止渲染目标段之外的任何内容')

    const midIndex = buildChunkMiddle(
      { files: ['package/index.vue'], index: 3, total: 6 },
      base,
    )
    expect(midIndex).not.toContain('段身份契约')
  })
})

describe('Phase I-1/2 · Figma 精确裁图守卫', () => {
  test('重复组模板实例（6 张同形卡）⇒ 不按锚点裁图（裁了会丢 5 个兄弟实例）', () => {
    expect(countSameShapeSiblings(FIGMA, '48:5798')).toBe(6)
    const { logger } = makeLogger()
    const scoped = buildSubcomponentScopedInput(
      'package/components/ListSection.vue',
      '',
      makeInput(),
      { logger },
    )
    expect(scoped.figmaNodeData).toBeUndefined()
  })

  test('唯一锚点 ⇒ 精确裁到该节点（对照组：证明裁图路径真的会生效）', () => {
    expect(countSameShapeSiblings(FIGMA, '565:2')).toBe(1)
    expect(countNodes(findFigmaNodeByIds(FIGMA, ['565:2']))).toBeLessThan(countNodes(FIGMA))
  })

  test('合成段 id（footer-summary）在 Figma 树里找不到 ⇒ 不裁（fail-open 保真）', () => {
    expect(findFigmaNodeByIds(FIGMA, ['footer-summary'])).toBeNull()
  })
})

describe('Phase I-1/2b · chunk 事实源作用域（堵住「契约约束得住、事实却在投毒」）', () => {
  const scopedOf = (file: string) => {
    const { logger } = makeLogger()
    return buildSubcomponentScopedInput(
      `package/components/${file}`,
      '',
      makeInput(),
      { logger },
    )
  }
  const effOf = (scoped: any) => ({ ...makeInput(), ...(scoped || {}) })

  test('无 `_sectionScope` ⇒ mode=off，树原样返回、sections=null（整稿/template chunk 零漂移）', () => {
    const s = resolveSectionScopeFacts(makeInput())
    expect(s.mode).toBe('off')
    expect(s.sections).toBeNull()
    expect(s.figmaNodeData).toBe(FIGMA)
  })

  test('合成段（footer-summary，sourceNodeIds=[]）⇒ mode=none，node=null（fail-closed 不下发整页事实）', () => {
    const s = resolveSectionScopeFacts(effOf(scopedOf('ContentSection.vue')))
    expect(s.mode).toBe('none')
    expect(s.figmaNodeData).toBeNull()
    expect(s.sections.map((x: any) => x.id)).toEqual(['footer-summary'])
  })

  test('重复组实例（48:5798，6 张同形卡）⇒ mode=subtree 且上抬到父容器 565:3（保住全部实例）', () => {
    const s = resolveSectionScopeFacts(effOf(scopedOf('ListSection.vue')))
    expect(s.mode).toBe('subtree')
    expect(s.figmaNodeData?.id).toBe('565:3')
    expect(s.figmaNodeData.children.filter((c: any) => c.type === 'GROUP').length).toBe(6)
    expect(s.sections.map((x: any) => x.id)).toEqual(['48:5798'])
  })

  test('🔴 chunk prompt 层：ContentSection 不再收到兄弟段卡片文案（样式事实/白名单两通道全关）', () => {
    const scopedInput = scopedOf('ContentSection.vue')
    const mid = buildChunkMiddle(
      { files: ['package/components/ContentSection.vue'], scopedInput, index: 5, total: 6 },
      effOf(scopedInput),
    )
    expect(mid).not.toContain('江苏联网节点')
    expect(mid).not.toContain('3,792')
    expect(mid).not.toContain('Group 48:5813')
    // 样式事实块整块不下发（本段在 Figma 侧无锚点）
    expect(mid).not.toContain('语义化样式真值')
    // 但契约仍在（真值走 vision 侧通道）
    expect(mid).toContain('data-section-id="footer-summary"')
    expect(mid).toContain('共 6 个节点')
  })

  test('🔴 白名单通道：合成段白名单为空串（= 不授权写任何文字），重复段白名单收窄到父容器', () => {
    const c = resolveSectionScopeFacts(effOf(scopedOf('ContentSection.vue')))
    expect(buildTextTruthWhitelist(c.figmaNodeData)).toBe('')

    const l = resolveSectionScopeFacts(effOf(scopedOf('ListSection.vue')))
    const wl = buildTextTruthWhitelist(l.figmaNodeData)
    // 本段真值（6 张卡 + 汇总文案，全在父容器 slot-con 内）：必须保留
    expect(wl).toContain('节点 48:5798')
    expect(wl).toContain('节点 48:5873')
    // 兄弟段（header 565:2，在 slot-con 之外）：必须剔除
    expect(wl).not.toContain('部署节点概览')
  })

  test('🔴 接线（防「写了没接=死代码」）：全 prompt 级白名单块也随段收窄', () => {
    const fullPromptOf = (file: string) => {
      const scopedInput = scopedOf(file)
      const effInput = effOf(scopedInput)
      return buildCodePrompt(
        { ...effInput, componentName: 'c-aiot-dpjh-bsjd', backgroundBrightness: 'dark' },
        { files: [`package/components/${file}`], segmentType: 'component', sharedFilter: 'component' },
        {},
      )
    }
    // 合成段：白名单整块不下发（否则整页文案都成了「允许写」）
    const pContent = fullPromptOf('ContentSection.vue')
    expect(pContent).not.toContain('文字真值白名单')
    expect(pContent).not.toContain('部署节点概览')
    // 重复段：白名单下发，但剔除 header 兄弟段文案
    const pList = fullPromptOf('ListSection.vue')
    expect(pList).toContain('文字真值白名单')
    expect(pList).toContain('节点 48:5798')
    expect(pList).not.toContain('部署节点概览')
  })

  test('零漂移：不传 planSections 时与旧单参调用逐字等价', () => {
    const input = makeInput()
    expect(buildSectionStyleFactsForPrompt(input, FIGMA, undefined)).toBe(
      buildSectionStyleFactsForPrompt(input, FIGMA),
    )
    expect(buildSectionStyleFactsForPrompt(input, FIGMA)).toContain('48:5798')
  })

  test('剪枝保留祖先链（`buildSectionStyleFacts` 的容器布局轨依赖祖先，不能只留叶子）', () => {
    const nested = [
      {
        id: 'container-1',
        type: 'container',
        children: [{ id: 'leaf-1', type: 'list', children: [] }],
      },
      { id: 'other', type: 'header', children: [] },
    ]
    const pruned = pruneSectionsToId(nested, 'leaf-1')
    expect(pruned.map((s: any) => s.id)).toEqual(['container-1'])
    expect(pruned[0].children.map((s: any) => s.id)).toEqual(['leaf-1'])
  })
})

// ── 刀64（2026-11-06 · 6c554acf 双 table）：蓝图段裁剪形态失配治本 ──────────────
// 病灶：visual-parser 返回 `layoutStructure.layout.sections`（真机形态），Phase I-1/2
// 蓝图裁剪手写 `ls.sections` → 形态失配 → 裁剪自上线起静默失效（keptSections 恒 0/0）→
// 全量蓝图（含兄弟段表格数据）下发 → LLM 复写兄弟段 → 接管器再出一份 → 双 table。
// 本 describe 用**真机形态** fixture 锁：① 裁剪真收口；② 观测行计数非 0；③ fail-open。
// 🔴 教训：旧 fixture（:159 顶层数组形态）与真机形态不一致 = 改者与验者同口径假绿。
import { extractSections, replaceSections } from '../../utils/figma-format.js'

describe('刀64 · 蓝图段裁剪形态失配（真机 layout.sections 形态）', () => {
  /** 真机形态：visual-parser `layoutStructure: analysisResult` → sections 在 `.layout.sections` */
  const makeInputRealShape = (extraTop: any = {}) => ({
    ...makeInput(),
    ...extraTop,
    // 覆盖 makeInput 的顶层数组形态为真机嵌套形态
    layoutStructure: {
      ...extraTop,
      layout: {
        type: 'vertical-stack',
        sections: PLAN.effectiveSections.map((s: any) => ({ id: s.id, title: s.title })),
      },
    },
  })

  test('阳性·真机形态：ContentSection 裁剪收口到本段，顶层其他字段保留', () => {
    const { logs, logger } = makeLogger()
    const scoped = buildSubcomponentScopedInput(
      'package/components/ContentSection.vue',
      '',
      makeInputRealShape({ repeatedCardTruth: { kind: 'uniform', size: 3 } }),
      { logger },
    )
    const cut = cutOf(logs)
    expect(cut).toBeDefined()
    expect(cut.byMapper).toBe(true)
    expect(cut.sectionId).toBe('footer-summary')
    // 🔴 核心：真机形态下旧实现 keptSections/totalSections 恒 0/0（形态失配静默失效）
    expect(cut.totalSections).toBe(2)
    expect(cut.keptSections).toBe(1)
    // 回写必须落在 `.layout.sections` 容器（保持原形态），且顶层字段不丢
    expect(scoped.layoutStructure?.layout?.sections?.map((s: any) => s.id)).toEqual([
      'footer-summary',
    ])
    expect(scoped.layoutStructure?.repeatedCardTruth).toEqual({ kind: 'uniform', size: 3 })
    expect(extractSections(scoped.layoutStructure)).toHaveLength(1)
  })

  test('阳性·真机形态：ListSection 同样收口（id 精确）', () => {
    const { logs, logger } = makeLogger()
    const scoped = buildSubcomponentScopedInput(
      'package/components/ListSection.vue',
      '',
      makeInputRealShape(),
      { logger },
    )
    const cut = cutOf(logs)
    expect(cut.keptSections).toBe(1)
    expect(extractSections(scoped.layoutStructure).map((s: any) => s.id)).toEqual(['48:5798'])
  })

  test('阴性·无可识别 sections 形态 ⇒ fail-open 保持全量（不写 scoped.layoutStructure）', () => {
    const input = { ...makeInput(), layoutStructure: { summary: '无 sections 字段' } }
    const { logger } = makeLogger()
    const scoped = buildSubcomponentScopedInput(
      'package/components/ContentSection.vue',
      '',
      input,
      { logger },
    )
    expect(scoped.layoutStructure).toBeUndefined()
  })

  test('replaceSections 纯函数：不 mutate 输入、顶层字段保留、未知形态返回 null', () => {
    const real = {
      componentName: 'x',
      layout: { type: 'vertical-stack', sections: [{ id: 'a' }, { id: 'b' }] },
    }
    const snapshot = JSON.stringify(real)
    const out = replaceSections(real, [{ id: 'b' }])
    // 输入不被 mutate
    expect(JSON.stringify(real)).toBe(snapshot)
    // 返回新对象、容器替换、顶层字段保留
    expect(out).not.toBe(real)
    expect(out.layout.sections).toEqual([{ id: 'b' }])
    expect(out.componentName).toBe('x')
    // 顶层数组形态
    const flat: any = { sections: [{ id: 'a' }], degraded: false }
    expect(replaceSections(flat, [{ id: 'c' }]).sections).toEqual([{ id: 'c' }])
    expect(replaceSections(flat, [{ id: 'c' }]).degraded).toBe(false)
    // 未知形态 ⇒ null（调用方 fail-open）
    expect(replaceSections({ summary: 'x' }, [{ id: 'a' }])).toBeNull()
    expect(replaceSections(null, [{ id: 'a' }])).toBeNull()
    expect(replaceSections(real, [])).toBeNull()
  })
})
