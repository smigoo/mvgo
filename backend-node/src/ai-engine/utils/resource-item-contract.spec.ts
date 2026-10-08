import { buildResourceItemContract, buildResourceBindingPromptBlock } from './resource-item-contract.js'
import { scanThemeVariantParity, scanOrphanResources } from './style-parity-guard.js'

// d9a0ab7d 真实 mapping 形态（.mc-gen/resource-dom-mapping.json 摘录，figmaBox 真值）
const D9A0_MAPPING = [
  { previewAnalysisRole: 'bg', assignedVarName: 'bg1', ownerSectionId: '136:129', downloadStatus: 'success', resourceFile: '../resources/images/bg-125.png', figmaBox: { x: 37, y: 984, width: 140.48, height: 74.19 } },
  { previewAnalysisRole: 'icon', assignedVarName: 'icon4', ownerSectionId: '136:129', downloadStatus: 'success', resourceFile: '../resources/images/icon-8036.png', figmaBox: { x: 40.6, y: 1004, width: 47.9, height: 47.5 } },
  { previewAnalysisRole: 'bg', assignedVarName: 'bg2', ownerSectionId: '136:128', downloadStatus: 'success', resourceFile: '../resources/images/bg-124.png', figmaBox: { x: 166, y: 984, width: 120, height: 74.19 } },
  { previewAnalysisRole: 'icon', assignedVarName: 'icon5', ownerSectionId: '136:128', downloadStatus: 'success', resourceFile: '../resources/images/icon-8049.png', figmaBox: { x: 169.5, y: 1004, width: 47.5, height: 47.5 } },
  { previewAnalysisRole: 'bg', assignedVarName: 'bg3', ownerSectionId: '136:127', downloadStatus: 'success', resourceFile: '../resources/images/bg-126.png', figmaBox: { x: 274, y: 984, width: 141, height: 74.19 } },
  { previewAnalysisRole: 'icon', assignedVarName: 'icon3', ownerSectionId: '136:127', downloadStatus: 'success', resourceFile: '../resources/images/icon-123.png', figmaBox: { x: 302.5, y: 999, width: 47.5, height: 52.3 } },
  { previewAnalysisRole: 'icon', assignedVarName: 'icon2', ownerSectionId: '136:122', downloadStatus: 'success', resourceFile: '../resources/images/icon-8070.png', figmaBox: { x: 36, y: 966, width: 18, height: 18.25 } },
] as any

describe('buildResourceItemContract · 同构卡片项绑定契约（宁缺勿造）', () => {
  it('d9a0ab7d 阳性对照：三卡横排，视觉序 136:129→136:128→136:127，逐卡 bg/icon 配对', () => {
    const c = buildResourceItemContract(D9A0_MAPPING)!
    expect(c).not.toBeNull()
    expect(c!.direction).toBe('horizontal')
    expect(c!.items.map((i) => i.sectionId)).toEqual(['136:129', '136:128', '136:127'])
    expect(c!.items.map((i) => i.order)).toEqual([1, 2, 3])
    expect(c!.items[0]).toMatchObject({ bgVar: 'bg1', bgFile: 'bg-125.png', iconVar: 'icon4', iconFile: 'icon-8036.png' })
    expect(c!.items[2]).toMatchObject({ bgVar: 'bg3', bgFile: 'bg-126.png', iconVar: 'icon3' })
  })

  it('不可辨即 null：孤 icon 组 / 单组 / 组内 2 bg / 空输入', () => {
    expect(buildResourceItemContract([])).toBeNull()
    expect(buildResourceItemContract(null as any)).toBeNull()
    // 只有 1 组卡片项
    expect(buildResourceItemContract(D9A0_MAPPING.filter((m) => m.ownerSectionId !== '136:128' && m.ownerSectionId !== '136:127'))).toBeNull()
    // 组内 2 bg（tabs-list 形态）→ 不构成卡片项组
    const tabsLike = D9A0_MAPPING.filter((m) => m.ownerSectionId !== '136:127').concat([
      { previewAnalysisRole: 'bg', assignedVarName: 'bg9', ownerSectionId: '136:128', downloadStatus: 'success', resourceFile: 'bg-9.png', figmaBox: { x: 166, y: 984, width: 100, height: 74 } },
    ] as any)
    expect(buildResourceItemContract(tabsLike)).toBeNull()
  })

  it('下载失败/缺几何/缺变量名的条目被过滤（宁缺勿造）', () => {
    const noisy = D9A0_MAPPING.concat([
      { previewAnalysisRole: 'bg', assignedVarName: 'bgX', ownerSectionId: '136:130', downloadStatus: 'missing', resourceFile: null, figmaBox: { x: 500, y: 984, width: 100, height: 74 } },
      { previewAnalysisRole: 'icon', assignedVarName: null, ownerSectionId: '136:130', downloadStatus: 'success', resourceFile: 'i.png', figmaBox: { x: 500, y: 990, width: 40, height: 40 } },
    ] as any)
    const c = buildResourceItemContract(noisy)!
    expect(c!.items).toHaveLength(3)
    expect(c!.items.map((i) => i.sectionId)).not.toContain('136:130')
  })

  it('竖排序列：x 对齐 y 递增 → vertical + y 升序', () => {
    const vertical = D9A0_MAPPING.map((m, idx) => ({
      ...m,
      ownerSectionId: `s${Math.floor(idx / 2)}`,
      figmaBox: { ...m.figmaBox, x: 100 + (idx % 2) * 10, y: 900 + Math.floor(idx / 2) * 90 },
    })) as any
    const c = buildResourceItemContract(vertical.filter((m: any) => m.previewAnalysisRole === 'bg' || m.ownerSectionId !== 's3'))!
    expect(c).not.toBeNull()
    expect(c!.direction).toBe('vertical')
    expect(c!.items.map((i) => i.order)).toEqual([1, 2, 3])
  })

  it('prompt 块：含逐卡绑定表/视觉序断言/孤儿禁令/inline 例外层写法；不可辨返回空串', () => {
    const block = buildResourceBindingPromptBlock(D9A0_MAPPING)
    expect(block).toContain('data-section-id="136:129"')
    expect(block).toContain('bg-125.png')
    expect(block).toContain('DOM 顺序必须等于视觉序')
    expect(block).toContain('1:1 全引用')
    expect(block).toContain('禁止')
    expect(block).toContain('::before')
    expect(buildResourceBindingPromptBlock([{ previewAnalysisRole: 'bg', assignedVarName: 'bg1', ownerSectionId: 's1', downloadStatus: 'success', resourceFile: 'b.png', figmaBox: { x: 0, y: 0, width: 10, height: 10 } }] as any)).toBe('')
  })
})

describe('scanThemeVariantParity · 主题变体值一致性（13.2 评审修正）', () => {
  it('d9a0ab7d 阳性对照：.dark/.light 同 text-shadow 字面量 → 命中', () => {
    const css = `.c-sub { color: var(--colorTextPrimary, #333); }
.dark .c-sub { color: var(--colorTextPrimary, #333); text-shadow: 0px 5.0479px 5.0479px #333333; }
.light .c-sub { color: var(--colorTextPrimary, #333); text-shadow: 0px 5.0479px 5.0479px #333333; }`
    const r = scanThemeVariantParity([{ path: 'package/resources/styles/index.css', content: css }] as any)
    expect(r.checked).toBe(1)
    expect(r.violations).toHaveLength(1)
    expect(r.violations[0].prop).toBe('text-shadow')
    expect(r.violations[0].selector).toBe('.c-sub')
  })

  it('令牌化声明（var()）不命中；单侧声明不命中；无主题分层文件零开销', () => {
    const css = `.dark .x { color: #fff; }
.light .x { color: #333; }
.dark .y { color: var(--colorTextBase, #333); }
.light .y { color: var(--colorTextBase, #333); }`
    const r = scanThemeVariantParity([{ path: 'a.css', content: css }] as any)
    expect(r.violations).toHaveLength(0)
    expect(scanThemeVariantParity([{ path: 'plain.css', content: '.a { color: #333 }' }] as any).checked).toBe(0)
  })
})

describe('scanOrphanResources · 已下载未引用资源（d9a0ab7d 实锤）', () => {
  const files = [
    { path: 'package/components/ListSection.vue', content: "import bg3 from '../resources/images/bg-126.png'\nimport icon4 from '../resources/images/icon-8036.png'\n:style=\"{ backgroundImage: 'url(' + bg3 + ')' }\"\n<img :src=\"icon4\">" },
  ]

  it('bg-126/icon-8036 已引用不报；bg-124/bg-125 孤儿命中', () => {
    const mapping = [
      { assignedVarName: 'bg3', downloadStatus: 'success', resourceFile: '../resources/images/bg-126.png', ownerSectionId: '136:127' },
      { assignedVarName: 'icon4', downloadStatus: 'success', resourceFile: '../resources/images/icon-8036.png', ownerSectionId: '136:129' },
      { assignedVarName: 'bg1', downloadStatus: 'success', resourceFile: '../resources/images/bg-125.png', ownerSectionId: '136:129' },
      { assignedVarName: 'bg2', downloadStatus: 'success', resourceFile: '../resources/images/bg-124.png', ownerSectionId: '136:128' },
    ] as any
    const r = scanOrphanResources(mapping, files as any)
    expect(r.checked).toBe(4)
    expect(r.orphans.map((o) => o.varName).sort()).toEqual(['bg1', 'bg2'])
    expect(r.orphans[0].hint).toContain('1:1')
  })

  it('d9a0ab7d 实锤形态：import 了但变量零使用 → unused-import（死 import 视觉缺失）', () => {
    const filesDead = [
      { path: 'package/index.vue', content: "import bg2 from '../resources/images/bg-124.png'\nimport bg3 from '../resources/images/bg-126.png'" },
      { path: 'package/components/ListSection.vue', content: ":style=\"{ backgroundImage: 'url(' + bg3 + ')' }\"" },
    ]
    const mapping = [
      { assignedVarName: 'bg2', downloadStatus: 'success', resourceFile: '../resources/images/bg-124.png', ownerSectionId: '136:128' },
      { assignedVarName: 'bg3', downloadStatus: 'success', resourceFile: '../resources/images/bg-126.png', ownerSectionId: '136:127' },
    ] as any
    const r = scanOrphanResources(mapping, filesDead as any)
    expect(r.checked).toBe(2)
    expect(r.orphans).toHaveLength(1)
    expect(r.orphans[0]).toMatchObject({ varName: 'bg2', kind: 'unused-import' })
  })

  it('空输入 fail-open', () => {
    expect(scanOrphanResources([], files as any).orphans).toHaveLength(0)
    expect(scanOrphanResources(null as any, null as any).orphans).toHaveLength(0)
  })
})
