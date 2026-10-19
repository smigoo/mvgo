/**
 * 🛡️ 业务术语规则（`businessTextRules`）**透传接线自检**（2026-10-19）
 *
 * 为什么需要它：本项目有实锤教训——新入参穿过
 *   `DTO → service(解构) → service(传参) → graph(解构) → initialState → execute(白名单) → execute(解构) → generateCode(input)`
 *   共 8 个检查点，**任一层未显式解构/未进 initialState 就会静默丢失、零报错零日志**
 *   （2026-10-10 `secondaryNode` 实锤；`userComponentId` 曾在最后一跳漏传 ⇒ 恒不生效）。
 *
 * 本脚本做**静态可达性断言**：逐个检查点确认字段存在。将来有人重构漏掉某一跳 ⇒ 立即失败。
 *
 * 只读：不修改任何文件、不写 dist、不部署。
 *
 * 用法：
 *   node scripts/verify-business-text-rules-wiring.mjs
 *   node scripts/verify-business-text-rules-wiring.mjs --json
 */
import { readFileSync, existsSync } from 'node:fs'

const BASE = '/Users/smigoo/工作/mvgo/backend-node'
const FIELD = 'businessTextRules'
const AS_JSON = process.argv.includes('--json')
const AS_SELFTEST = process.argv.includes('--selftest')

/**
 * 检查点：文件 + **区间锚点** `[from, to)`。
 *
 * ⚠️ 教训（本脚本自身踩过两次假绿，2026-10-19）：
 *   ① 用 `themeNodes,` 当锚点 → 首次命中在**解构处**，于是「只改了解构、没真传参」仍判绿；
 *   ② 用「锚点 ±N 字符双向窗口」→ 窗口覆盖了相邻的另一处出现 ⇒ **删掉本跳字段后仍判绿**
 *      （判据域过宽，鉴别力为零，实测 9 跳里 4 跳如此）。
 *   ⇒ 一律改用 **`[from, to)` 区间 + 窗口内命中数必须 === 1**：命中 0 报断线，命中 ≥2 报「区间过宽」。
 */
const CHECKPOINTS = [
  {
    hop: '1. DTO 字段声明',
    file: 'src/phase2/dto/generate-phase2.dto.ts',
    from: "primaryRole?: 'first' | 'second' = 'first';",
    to: '@IsString()', // 字段块之后的下一个装饰器（区间内只有本字段一行命中）
    why: '白名单式校验类不声明 ⇒ 被 ValidationPipe 静默剥离',
  },
  {
    hop: '2. service 解构',
    file: 'src/phase2/phase2.service.ts',
    from: 'async startGeneration(',
    to: '} = dto;',
    why: '不解构 ⇒ 下游拿不到',
  },
  {
    hop: '3a. service → executeGeneration',
    file: 'src/phase2/phase2.service.ts',
    from: 'this.executeGeneration(sessionId, {',
    to: 'Phase 1 generation failed:',
    why: '不传 ⇒ executeGeneration 的 params 里没有该字段',
  },
  {
    hop: '3b. executeGeneration → runGeneration(graph)',
    file: 'src/phase2/phase2.service.ts',
    // 🩸 实锤易漏跳：这里才是**真正进图**的一跳（microcode 档 runGeneration = runPhase2Generation），
    // 旁边就是 secondaryNode / themeNodes / primaryRole 的 `params.xxx` 转发。
    // 只在 3a 传而不在此转发 ⇒ 字段止步于 service 内部，图侧恒 undefined（本次真实踩到）。
    from: 'genResult = await runGeneration({',
    to: 'onProgress: (data) => {',
    why: '不转发 ⇒ 图侧恒收不到（本跳曾真实缺失）',
  },
  {
    hop: '4. graph 解构白名单',
    file: 'src/ai-engine/graphs/mc-component-graph-phase2.js',
    from: 'export async function runPhase2Generation(options) {',
    to: '} = options;',
    why: '显式解构白名单，漏即 undefined',
  },
  {
    hop: '5. graph initialState',
    file: 'src/ai-engine/graphs/mc-component-graph-phase2.js',
    from: 'const initialState = {',
    to: 'graph.run(initialState);',
    why: '不进 state ⇒ 后续节点全拿不到',
  },
  {
    hop: '6. state → engineer 最后一跳',
    file: 'src/ai-engine/graphs/mc-component-graph-phase2.js',
    from: 'dualTruth: state.dualTruth || null,',
    to: '_visualDegraded: state._visualDegraded,',
    why: '同是显式白名单；既有实锤 userComponentId 在此漏传',
  },
  {
    hop: '7. engineer.execute 解构',
    file: 'src/ai-engine/roles/microcode-engineer.js',
    from: 'async execute(params) {',
    to: 'const codeResult = await this.generateCode({',
    why: 'execute 把 params 解构成局部变量，未解构 ⇒ 裸变量 undefined',
  },
  {
    hop: '8. generateCode input',
    file: 'src/ai-engine/roles/microcode-engineer.js',
    from: 'const codeResult = await this.generateCode({',
    to: '// 🛡️ 统一产物契约',
    why: 'generateCode 通篇用 input.xxx，不传 ⇒ 规则静默失效',
  },
  {
    hop: '9. 下发层应用（prompt）',
    file: 'src/ai-engine/roles/microcode/prompt-builder.js',
    // 透传接通 ≠ 生效：必须**真的被消费**。此处是「喂 LLM 的样式事实真值」包装点，
    // 若有人把 4 处调用改回裸 buildSectionStyleFacts ⇒ 规则静默失效。
    from: 'export function buildSectionStyleFactsForPrompt(input, figmaNodeData) {',
    to: '/**\n * 业务口径指令段',
    why: '不消费 ⇒ 真值表仍是原始词，与「业务口径指令」自相矛盾',
  },
  {
    hop: '10. 下发层应用（文本白名单）',
    file: 'src/ai-engine/roles/microcode/prompt-builder.js',
    // 白名单必须同步过规则，否则「只能使用白名单文字」与「必须写小汽车」直接冲突。
    from: 'export function buildTextTruthWhitelist(figmaNodeData, rules) {',
    to: '## 🛡️ 文字真值白名单（强制遵守）',
    why: '白名单不过规则 ⇒ LLM 写业务口径词被 TEXT-TRUTH 判臆造 BLOCK',
    field: 'applyRulesToLine',
  },
  {
    hop: '11. validator options（TEXT-TRUTH 判据）',
    file: 'src/ai-engine/graphs/mc-component-graph-phase2.js',
    // 不传 ⇒ 产物写业务口径词被 TEXT-TRUTH 判臆造 BLOCK（与下发指令自相矛盾）
    from: 'figmaNodeData: state.figmaNodeData || null,',
    to: 'componentPlan: state.subComponentPlan || null,',
    why: 'TEXT-TRUTH 拿不到规则 ⇒ 改写词被判臆造，重试空转',
  },
  {
    hop: '12. 自愈规则 fix-text-truth（防改回原词）',
    file: 'src/ai-engine/roles/microcode-engineer.js',
    // 🩸 最隐蔽的一跳：这里不传 ⇒ 自愈器把「小汽车」按最近真值改回「客车」，
    //   与业务口径**直接对抗**（改一次、门禁再改回去，循环到重试耗尽）。
    from: 'figmaNodeData,\n          // 🛡️ 2026-10-19',
    to: 'sectionHeights: this._buildSectionHeightsMap(',
    why: '自愈器把业务口径词改回设计稿原词（对抗性失败）',
  },
  {
    hop: '13. 自愈规则入参解构',
    file: 'src/ai-engine/validators/code-fix-rules.js',
    from: 'export function registerBuiltinFixRules(pipeline, engineer, context = {}) {',
    to: 'const _indexTemplateFacts =',
    why: 'context 是显式解构白名单，不解构 ⇒ 上跳传了也拿不到',
  },
]

/** 统计区间内**含该字段的行数**（⚠️ 不能用子串次数：`businessTextRules: state.businessTextRules || null,` 一行含 2 个子串） */
function countLinesWith(text, needle) {
  if (!needle) return 0
  let n = 0
  for (const line of text.split('\n')) if (line.includes(needle)) n += 1
  return n
}

/**
 * 在 `[from, to)` 区间内查找字段；`searchBack` 时区间取 `[to, from)`（字段在锚点之前，如解构块）。
 * 命中数必须 === 1：0 ⇒ 断线；≥2 ⇒ 区间过宽 / 锚点不唯一，判据不可信（防假绿）。
 */
function findFieldInRange(content, field, from, to, searchBack) {
  const a = searchBack ? to : from
  const b = searchBack ? from : to
  const ia = content.indexOf(a)
  if (ia < 0) return { ok: false, reason: `起始锚点未找到: ${a}` }
  const ib = content.indexOf(b, ia + 1)
  if (ib < 0) return { ok: false, reason: `结束锚点未在起始锚点之后找到: ${b}` }
  const slice = content.slice(ia, ib)
  const hits = countLinesWith(slice, field)
  if (hits === 0) return { ok: false, reason: `[${a} … ${b}] 区间内没有 ${field}` }
  if (hits > 1) return { ok: false, reason: `区间内 ${field} 命中 ${hits} 行 ⇒ 区间过宽/锚点不唯一，判据不可信` }
  return { ok: true, note: `区间 ${ib - ia} 字符，命中 1 行` }
}

const results = []
for (const cp of CHECKPOINTS) {
  const path = `${BASE}/${cp.file}`
  if (!existsSync(path)) {
    results.push({ ...cp, ok: false, reason: '文件不存在' })
    continue
  }
  const content = readFileSync(path, 'utf-8')
  const field = cp.field || FIELD // 应用类检查点校验的是「消费点符号」而非字段本身
  const r = findFieldInRange(content, field, cp.from, cp.to, !!cp.searchBack)
  results.push({
    hop: cp.hop,
    file: cp.file,
    ok: r.ok,
    reason: r.reason || '',
    note: r.note || '',
    why: cp.why,
    from: cp.from,
    // 🧪 鉴别力（阳性对照）：把区间内该字段改名，本跳必须变红。
    // 若删了仍判绿 ⇒ 该跳是假绿（判据域没锁住真实位置），自检本身不可信。
    selfTest: discriminationCheck(content, field, cp),
  })
}

/**
 * 鉴别力检查：把区间内**唯一**出现的字段改名后重判，应变为 false。
 * 返回 true = 有鉴别力（不是恒绿）。
 */
function discriminationCheck(content, field, cp) {
  const a = cp.searchBack ? cp.to : cp.from
  const b = cp.searchBack ? cp.from : cp.to
  const ia = content.indexOf(a)
  if (ia < 0) return false
  const ib = content.indexOf(b, ia + 1)
  if (ib < 0) return false
  const head = content.slice(0, ia)
  const body = content.slice(ia, ib)
  const tail = content.slice(ib)
  if (!body.includes(field)) return false // 本就判红，谈不上鉴别力
  const mutated = head + body.split(field).join('__FIELD_REMOVED__') + tail
  return !findFieldInRange(mutated, field, cp.from, cp.to, !!cp.searchBack).ok
}

const failed = results.filter((r) => !r.ok)
const blind = results.filter((r) => r.ok && r.selfTest === false)
const TOTAL = CHECKPOINTS.length
if (AS_JSON || AS_SELFTEST) {
  console.log(
    JSON.stringify(
      { total: TOTAL, failed: failed.length, blind: blind.length, results },
      null,
      2,
    ),
  )
} else {
  console.log('=== businessTextRules 透传接线自检 ===')
  for (const r of results) {
    const disc = r.ok ? (r.selfTest ? ' 🧪有鉴别力' : ' ⚠️假绿风险') : ''
    console.log(`${r.ok ? '✅' : '❌'} ${r.hop}  (${r.file})${r.ok ? '' : ` — ${r.reason}`}${r.note ? `  ${r.note}` : ''}${disc}`)
  }
  console.log(`\n${failed.length === 0 ? `✅ ${TOTAL}/${TOTAL} 跳全部接通` : `🔴 ${failed.length} 跳断线：`}`)
  for (const f of failed) console.log(`   ${f.hop} — ${f.reason}｜后果：${f.why}`)
  if (blind.length > 0) {
    console.log(`\n🔴 ${blind.length} 跳「假绿风险」（删掉字段后仍判绿 ⇒ 判据域没锁住真实位置）：`)
    for (const b of blind) console.log(`   ${b.hop} — 区间: [${b.from} …]`)
  }
}
process.exit(failed.length === 0 && blind.length === 0 ? 0 : 1)
