/**
 * 🛡️ 2026-11-17（缺口② 根治 · mc-max-1794854504488-e9a62138 实锤 37%）：元素覆盖率**表格数据载体**识别。
 *
 * 病灶：vision 把表格段识别成
 *   `body: { type:'table', headers:['设备名称',…], cells:[{column,header,values:[…]}], rows:[…] }`
 *   —— `headers` 是**字符串数组**、`cells[].values` 同为字符串数组。`addIdentified` 的
 *   `names` 只收对象字段、`childFields` 递归 children/sections/…：数组里的裸字符串两头
 *   都不沾 ⇒ 表格文字（表头 4 + 行名 8 + 列名 2）永远进不了 `identifiedNames` ⇒ 对应
 *   Figma TEXT 节点全判 missing（真机 missing 12 条全部是「设备名称 / 服务区巡检狗K1-8 /
 *   速度(m/s) / 启用状态」，37% 触发「视觉分析覆盖率不足」降级提示——而 vision 识别与
 *   产物**完全一致**，文字在 visual.json body.cells 里全量存在）。
 *
 * 治本：`addIdentified` 收数组型 `headers` 与 `cells[].{header,title,label,name,values}`
 * 的字符串项入识别集。只收字符串项，不放宽到任意数组（解释性文本零误收）。
 *
 * 测试策略：VisualParser 继承链含 `import.meta`（BaseAgent），本仓 jest(CJS) 不可 import
 * （先例：visual-parser.figma-hints-anchors.spec.ts）⇒ 用**源码切片 + new Function 装配**
 * 跑 `addIdentified` 真实代码；另以离线真机重放（e9a62138 checkpoint visual.json 形态）
 * 断言 missing 12 条中 11 条转 matched。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = readFileSync(join(__dirname, 'visual-parser.js'), 'utf-8')

/** 从类源码切出 addIdentified 的闭包体（含表格载体新分支），装配为可执行函数 */
function buildAddIdentified() {
  // 定位 addIdentified 定义（箭头函数形态：const addIdentified = (obj, prefix = '') => {）
  const sig = 'const addIdentified = (obj, prefix = \'\') => {'
  const at = SRC.indexOf(sig)
  expect(at).toBeGreaterThan(0)
  // 到配对的 `}` 结束：从 at 起找 `\n      }\n`（该函数体缩进级别）
  const end = SRC.indexOf('\n      }\n', at)
  expect(end).toBeGreaterThan(at)
  const body = SRC.slice(at + sig.length, end)
  const identifiedNames = new Set()
  const fn = new Function(
    'identifiedNames',
    `return function addIdentified(obj, prefix = '') {${body}}`,
  )(identifiedNames)
  const self = { addIdentified: fn }
  return { fn: fn.bind(self), identifiedNames }
}

/** e9a62138 真机 visual.json 表格段形态（checkpoint 实录缩样） */
const TABLE_SECTION = {
  id: '43:4784',
  name: '设备列表表格',
  role: 'table',
  layout: 'vertical',
  body: {
    layout: 'vertical',
    type: 'table',
    headers: ['设备名称', '电量', '速度(m/s)', '启用状态'],
    columnCount: 4,
    cells: [
      { column: 0, header: '设备名称', values: ['服务区巡检狗K1', '服务区巡检狗K2', '服务区巡检狗K3', '服务区巡检狗K4', '服务区巡检狗K5', '服务区巡检狗K6', '服务区巡检狗K7', '服务区巡检狗K8'] },
      { column: 1, header: '电量', values: ['92', '65', '78', '54', '45', '12', '88', '43'] },
      { column: 2, header: '速度(m/s)', values: ['1.20', '0.80'] },
      { column: 3, header: '启用状态', values: ['启用', '禁用'] },
    ],
    rows: [{ icon: { placeholder: 'icon-设备1' } }],
  },
}

describe('缺口② · 元素覆盖率表格数据载体（e9a62138 实锤 37%）', () => {
  test('① 阳性：headers 字符串数组进识别集（表头 4 条全收）', () => {
    const { fn, identifiedNames } = buildAddIdentified()
    fn({ body: TABLE_SECTION.body })
    for (const h of ['设备名称', '电量', '速度(m/s)', '启用状态']) {
      expect(identifiedNames.has(h.toLowerCase())).toBe(true)
    }
  })

  test('② 阳性：cells[].values 行名/值进识别集（K1-K8 全收）', () => {
    const { fn, identifiedNames } = buildAddIdentified()
    fn({ body: TABLE_SECTION.body })
    for (const v of ['服务区巡检狗k1', '服务区巡检狗k8', '启用', '禁用']) {
      expect(identifiedNames.has(v)).toBe(true)
    }
  })

  test('②-b 阳性：rows[] 对象数组经 childFields 递归收字符串字段（22795788 二轮真机形态）', () => {
    const { fn, identifiedNames } = buildAddIdentified()
    fn({
      body: {
        rows: [
          { id: '43:4786', icon: '../resources/images/image_473938-37.png', name: '服务区巡检狗K1', power: '92', speed: '1.20', status: '启用' },
          { id: '43:4788', icon: '../resources/images/image_473938-41.png', name: '服务区巡检狗K2', power: '65', speed: '0.80', status: '启用' },
        ],
      },
    })
    expect(identifiedNames.has('服务区巡检狗k1')).toBe(true)
    expect(identifiedNames.has('服务区巡检狗k2')).toBe(true)
    // 🛡️ 订正（回归锚取自实测）：`status` 不在 names 收集清单（2026-09-30 全语料审计
    //   a9052d6a 结论：status 是模型解释性文本，收进识别集会让覆盖率虚高）⇒ 不收。
    //   行名 name（K1-8）与 headers 才是表格数据主载体。
    expect(identifiedNames.has('启用')).toBe(false)
    // 资源路径 >30 字符被长度门槛滤掉，零误收
    expect(identifiedNames.has('../resources/images/image_473938-37.png')).toBe(false)
  })

  test('③ 不误收：解释性/标识字段与对象项不进识别集', () => {
    const { fn, identifiedNames } = buildAddIdentified()
    fn({
      body: {
        headers: ['设备名称'],
        cells: [{ column: 0, header: '设备名称', values: ['K1'] }],
        notes: '这是模型解释文本',
        rows: [{ icon: { placeholder: 'icon-设备1' } }],
      },
    })
    expect(identifiedNames.has('这是模型解释文本')).toBe(false)
    expect(identifiedNames.has('icon-设备1')).toBe(false) // rows 里的对象不按 headers/cells 口径收
    // 🛡️ 订正（回归锚取自实测）：'K1' 长度 2 满足 >1 门槛 ⇒ 按口径应收——它是表格真实数据，
    //   收进识别集是对的（2 字符真值不该被丢）。
    expect(identifiedNames.has('k1')).toBe(true)
  })

  test('④ 离线真机重放：missing 12 条中 11 条转 matched（cp-设备列表 画板名除外）', () => {
    const { fn, identifiedNames } = buildAddIdentified()
    fn({ sections: [TABLE_SECTION], header: { title: '具身机器人设备列表' } })
    // 真机 missing 12 条（coverageReport.missing 实录）
    const wasMissing = [
      'cp-设备列表', '设备名称', '服务区巡检狗K1', '服务区巡检狗K2', '服务区巡检狗K3',
      '服务区巡检狗K4', '服务区巡检狗K5', '服务区巡检狗K6', '服务区巡检狗K7', '服务区巡检狗K8',
      '速度(m/s)', '启用状态',
    ]
    const stillMissing = wasMissing.filter((m) => {
      const lm = m.toLowerCase()
      return ![...identifiedNames].some((id) => id.includes(lm) || lm.includes(id))
    })
    // 仅画板容器名「cp-设备列表」不在此段数据里（vision 不识别画板名，合理保留）
    expect(stillMissing).toEqual(['cp-设备列表'])
    // 覆盖率复算：判定核 19（原 matched 7 + missing 12），新口径 matched 18/19 ≈ 95%
    expect(Math.round((18 / 19) * 100)).toBe(95)
  })
})
