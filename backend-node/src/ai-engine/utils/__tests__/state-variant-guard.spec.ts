/**
 * state-variant-guard · T3-C 单测（2026-11-04 · c-device-monitor-878b3ef1 实锤）
 *
 * 病灶：Figma 节点 `89:38`（name=`switch`）把同一控件的 `active` / `default`
 * 两个**互斥状态变体并列画出**；产物无法表达状态机，把两态文本展平并列成
 * 一个 2×N 的 `<a-table>`（8 条文本全部来自这 10 条真值子集，零臆造）。
 *
 * 对照纪律：阳性必配阴性（证明判据既不「全放行」也不「全拦」）。
 */
import {
  scanStateVariantFlatten,
  collectVariantContainers,
  collectArtifactTexts,
  summarizeStateVariantIssues,
} from '../state-variant-guard.js'

/** 真机形态：89:38 switch = active + default 两态，各含 5 个 TEXT */
function figmaSwitch() {
  return {
    document: {
      id: '2:8417',
      type: 'FRAME',
      name: 'cp-设备监测',
      children: [
        {
          id: '89:40',
          type: 'FRAME',
          name: 'slot-con',
          children: [
            {
              id: '89:38',
              type: 'FRAME',
              name: 'switch',
              children: [
                {
                  id: '2:8787',
                  type: 'GROUP',
                  name: 'active',
                  children: [
                    { id: '2:8791', type: 'TEXT', name: 't-隧道设备', characters: '隧道设备' },
                    { id: '2:8793', type: 'TEXT', name: 't-总数:', characters: '总数:' },
                    { id: '2:8794', type: 'TEXT', name: 'd-56302', characters: '56302' },
                    { id: '2:8796', type: 'TEXT', name: 't-异常数:', characters: '异常数:' },
                    { id: '2:8797', type: 'TEXT', name: 'd-5', characters: '5' },
                  ],
                },
                {
                  id: '2:8806',
                  type: 'GROUP',
                  name: 'default',
                  children: [
                    { id: '2:8811', type: 'TEXT', name: 't-总数:', characters: '总数:' },
                    { id: '2:8812', type: 'TEXT', name: 'd-1280', characters: '1280' },
                    { id: '2:8814', type: 'TEXT', name: 't-异常数:', characters: '异常数:' },
                    { id: '2:8815', type: 'TEXT', name: 'd-3', characters: '3' },
                    { id: '2:8816', type: 'TEXT', name: 't-南北接线 设备', characters: '南北接线\n设备' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  }
}

/** 真机形态：StatsSection.vue（a-table 承载两态文本） */
const STATS_SFC = [
  '<template>',
  '  <div data-section-id="89:38" style="display:flex;flex-direction:column;height:65px;">',
  '    <a-table :columns="cols" :data-source="rows">',
  '      <template #headerCell="{ column }"><span>{{ column.title }}</span></template>',
  '      <template #bodyCell="{ column, record }"><span>{{ record[column.dataIndex].text }}</span></template>',
  '    </a-table>',
  '  </div>',
  '</template>',
  '',
  '<script setup>',
  'const cols = [{ title: "56302", dataIndex: "c0" }, { title: "1280", dataIndex: "c1" }];',
  'const rows = [{ c0: { text: "总数:" }, c1: { text: "隧道设备" } }, { c0: { text: "南北接线\\n设备" } }];',
  '</script>',
].join('\n')

/** 只渲染 active 一态的产物（应放行） */
const ACTIVE_ONLY_SFC = [
  '<template>',
  '  <div data-section-id="89:38"><span>{{ label }}</span><span>{{ value }}</span></div>',
  '</template>',
  '<script setup>',
  'const label = "隧道设备";',
  'const value = "56302";',
  '</script>',
].join('\n')

describe('state-variant-guard：互斥状态变体展平（T3-C · 2026-11-04）', () => {
  it('阳性：真机 89:38（switch = active + default）被展平渲染 ⇒ 命中 1 条', () => {
    const files = [{ path: 'package/components/StatsSection.vue', content: STATS_SFC }]
    const { issues } = scanStateVariantFlatten({ files, figmaRoot: figmaSwitch() })
    expect(issues).toHaveLength(1)
    expect(issues[0].sectionId).toBe('89:38')
    expect(issues[0].nodeName).toBe('switch')
    expect(issues[0].variants.sort()).toEqual(['active', 'default'])
    // 命中证据：active 独有（隧道设备/56302）+ default 独有（1280/南北接线 设备）
    expect(issues[0].sampleTexts).toEqual(expect.arrayContaining(['隧道设备', '56302']))
    expect(issues[0].sampleTexts).toEqual(expect.arrayContaining(['1280', '南北接线 设备']))
  })

  it('阴性①：真值树无状态变体容器 ⇒ 恒 0', () => {
    const root = { document: { id: '1:1', type: 'FRAME', name: 'x', children: [{ id: '1:2', type: 'TEXT', characters: 'a' }] } }
    const files = [{ path: 'package/components/A.vue', content: STATS_SFC }]
    expect(scanStateVariantFlatten({ files, figmaRoot: root }).issues).toHaveLength(0)
  })

  it('阴性②：产物只出现单个变体的独有文本 ⇒ 不报（宁漏不误报）', () => {
    const files = [{ path: 'package/components/StatsSection.vue', content: ACTIVE_ONLY_SFC }]
    expect(scanStateVariantFlatten({ files, figmaRoot: figmaSwitch() }).issues).toHaveLength(0)
  })

  it('阴性③：文件含多个 data-section-id（聚合 index.vue 形态）⇒ 跳过', () => {
    const files = [
      {
        path: 'package/index.vue',
        content: '<template>\n<div data-section-id="89:38"></div>\n<div data-section-id="89:39"></div>\n</template>\n<script setup>\nconst a = "56302"; const b = "1280"; const c = "隧道设备"; const d = "南北接线\\n设备";\n</script>',
      },
    ]
    expect(scanStateVariantFlatten({ files, figmaRoot: figmaSwitch() }).issues).toHaveLength(0)
  })

  it('阴性④：两变体文本全同（无独有文本）⇒ 容器不被收集', () => {
    const root = {
      document: {
        id: '1:1',
        type: 'FRAME',
        name: 'x',
        children: [
          { id: '9:9', type: 'FRAME', name: 'btn', children: [
            { id: '9:a', type: 'GROUP', name: 'active', children: [{ id: '9:1', type: 'TEXT', characters: '总数:' }] },
            { id: '9:b', type: 'GROUP', name: 'default', children: [{ id: '9:2', type: 'TEXT', characters: '总数:' }] },
          ] },
        ],
      },
    }
    expect(collectVariantContainers(root)).toHaveLength(0)
  })

  it('阴性⑤：状态词子节点占比 < 0.5 ⇒ 不判为状态变体容器', () => {
    const kids = [
      { id: '9:a', type: 'GROUP', name: 'active', children: [{ id: '9:1', type: 'TEXT', characters: 'A' }] },
      { id: '9:b', type: 'GROUP', name: 'default', children: [{ id: '9:2', type: 'TEXT', characters: 'B' }] },
      { id: '9:c', type: 'GROUP', name: 'row1' },
      { id: '9:d', type: 'GROUP', name: 'row2' },
      { id: '9:e', type: 'GROUP', name: 'row3' },
    ]
    const root = { document: { id: '1:1', type: 'FRAME', children: [{ id: '9:9', type: 'FRAME', children: kids }] } }
    expect(collectVariantContainers(root)).toHaveLength(0)
  })

  it('双形态输入（Record 形态）同样命中', () => {
    const files = { 'package/components/StatsSection.vue': STATS_SFC }
    expect(scanStateVariantFlatten({ files, figmaRoot: figmaSwitch() }).issues).toHaveLength(1)
  })

  it('非 .vue 文件（css/js）不参与判定', () => {
    const files = [{ path: 'resources/styles/index.css', content: STATS_SFC }]
    expect(scanStateVariantFlatten({ files, figmaRoot: figmaSwitch() }).issues).toHaveLength(0)
  })

  it('collectArtifactTexts：复用抽取规则，拿到 cols.title 与 rows.text', () => {
    const texts = collectArtifactTexts(STATS_SFC)
    expect(texts.has('56302')).toBe(true) // cols.title（T3-A ⑤ 分支）
    expect(texts.has('1280')).toBe(true)
    expect(texts.has('总数:')).toBe(true) // rows.text
    expect(texts.has('南北接线 设备')).toBe(true) // JS 转义解码 + 归一
  })

  it('summarize：空输入返回空串，命中返回摘要', () => {
    expect(summarizeStateVariantIssues([])).toBe('')
    const files = [{ path: 'package/components/StatsSection.vue', content: STATS_SFC }]
    const { issues } = scanStateVariantFlatten({ files, figmaRoot: figmaSwitch() })
    expect(summarizeStateVariantIssues(issues)).toContain('89:38')
  })
})
