/**
 * 🧩 子组件覆盖度判据（写盘唯一出口 + 完整性出口共用）
 *
 * 病灶（2026-11-08 · mc-max-1794076626809-402679ed 真机实锤）：
 *   `subcomponent-planner` 已按 R2 密度拆出 `totalSubcomponents = leafSections + internalSubcomponents = 5`
 *   （`microcode-engineer.js:1064` 明确「必须拆分为 5 个独立子组件文件」「数量和对应关系不得缩减」），
 *   但模型只生成 3 个组件文件（index + StatsSection + MainSection），缩水 2 个内部子组件，
 *   **链路上没有任何校验**：
 *     · microcode 端无 `minFiles` / `expectedMinFiles` 消费（vue3 端 `vue3-engineer.js:2148` 有）；
 *     · C8 `genSubComponents` 只在「被引用但缺文件」时递归补（模型没引用 ⇒ dangling=0 ⇒ 不触发）；
 *     · 结果靠 `TEXT-COVERAGE` 事后发现（27 条真值只覆盖 10 条 / 37%），且被 L0-B 软失败降级放行。
 *   ⇒ 产物被判 `completed` + `runtimeVerified=true`，用户看到的是「12 张卡片变一张 4×2 表」。
 *
 * 口径（与 vue3-engineer#subComponentCoverage 同源，不另建第二套计数）：
 *   expected = isForced ? minFiles : 0
 *   generated = `<outputPath>/package/components/*.vue` 的个数（布局容器不占槽，天然不计）
 *   missing = max(0, expected - generated)
 *
 * 🧩 2026-11-08 三合一扩展（评审修订版 §4）：
 *   ① 数量：generated >= expected（原口径，不变）
 *   ② 逐组内容锚点：每个 internalSubcomponents[i] 的 textTruths ∪ elementNames 至少 1 条
 *      落在某个一级 `package/components/*.vue`（不认文件名，只认结构锚点）；
 *      · 锚点集为空（纯图形/图表组）⇒ 计 unanchoredGroups，仅由 ①③ 兜底，不误判；
 *      · ≥2 组全部落在唯一同一文件 ⇒ 判「未真正拆分」（not-split），整组计入缺失；
 *   ③ 引用完整性：仅在拿到 `package/index.vue`（全量写盘）时评估；否则 orphanCheck='skipped:partial'。
 *      只认 import/import()/require() 的 .vue 字面量，按 basename 匹配，避免路径归一误判。
 *
 * ⚠️ 本模块只出判据，不决定阻断级别；落盘处只留痕 + 计数行（skip/no-plan 也打）。
 *    升级为 BLOCK 由 L0-B 图节点决定（见 docs/2026-11-08-子组件覆盖度P1P2治本方案-评审修订版.md）。
 */

/** 组件子目录前缀（与 `microcode-engineer.js` 其余地方一致，单一来源）。 */
export const SUBCOMPONENT_DIR_PREFIX = 'package/components/'

/** 只数「一级 .vue」，`.less/.ts/declare` 与 `components/xx/yy.vue` 都不计。 */
const SUBCOMPONENT_FILE_RE = /^package\/components\/[^/]+\.vue$/

/**
 * 本地 .vue 引用识别（静态 import / 动态 import() / require）。
 * 形态与 `code-structure-validator#findDeadSubComponentImports` 同源，但语义不同：
 *   前者判「import 了但模板未使用」，本处判「文件存在但无人 import」——不是同一判据，不合并。
 * 用 source 每次新建实例，避免全局正则 lastIndex 污染。
 */
const LOCAL_VUE_IMPORT_SOURCE =
  /(?:import\s*(?:[\w$*{}\s,]+)\s*from\s*|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+\.vue)['"]/g

/** 归一化 files：支持 `{ path: content }` 与路径数组两种形态。 */
function asEntries(files) {
  if (Array.isArray(files)) {
    return files
      .filter((p) => typeof p === 'string' && p.length > 0)
      .map((p) => [p, ''])
  }
  if (files && typeof files === 'object') {
    return Object.entries(files).filter(([p]) => typeof p === 'string' && p.length > 0)
  }
  return []
}

/** 只保留非空字符串（锚点去噪）。 */
function stringsOf(v) {
  return Array.isArray(v)
    ? v.filter((x) => typeof x === 'string' && x.trim().length > 0).map((s) => s.trim())
    : []
}

/**
 * @param {{ subPlan?: object|null, files?: object|Array }} input
 *   subPlan: { isForced, minFiles, internalSubcomponents[] }
 *           null/undefined ⇒ skippedReason='no-plan'（planner 尚未记账，禁止打「零缺失」假绿）
 *   files:   写盘文件表 `{ 'package/components/X.vue': '...' }`，或路径数组
 * @returns {{ isForced:boolean, expected:number, generated:number, missing:number, ok:boolean,
 *             internalExpected:number, generatedFiles:string[],
 *             missingSubcomponents:Array<{subId:string|null,responsibility:string,reason:string,missingAnchors:string[]}>,
 *             anchoredGroups:number, unanchoredGroups:number,
 *             orphanFiles:string[], orphanCheck:string, skippedReason:string|null }}
 */
export function assessSubComponentCoverage({ subPlan, files } = {}) {
  const hasPlan = subPlan !== null && subPlan !== undefined
  const plan = hasPlan && typeof subPlan === 'object' ? subPlan : {}
  const isForced = plan.isForced === true
  const expected = isForced ? Math.max(0, Number(plan.minFiles) || 0) : 0
  const subs = Array.isArray(plan.internalSubcomponents) ? plan.internalSubcomponents : []
  const internalExpected = subs.length

  const entries = asEntries(files)
  const contentOf = new Map(entries)
  const generatedFiles = entries
    .map(([p]) => p)
    .filter((p) => SUBCOMPONENT_FILE_RE.test(p))
    .sort()

  const generated = generatedFiles.length
  const missing = Math.max(0, expected - generated)

  // ── ② 逐组内容锚点 ─────────────────────────────────────────────
  const missingSubcomponents = []
  const hostsBySub = new Map()
  let anchoredGroups = 0
  let unanchoredGroups = 0

  for (let i = 0; i < subs.length; i++) {
    const sub = subs[i] && typeof subs[i] === 'object' ? subs[i] : {}
    const anchors = [...new Set([...stringsOf(sub.textTruths), ...stringsOf(sub.elementNames)])]
    if (anchors.length === 0) {
      unanchoredGroups++
      continue
    }
    const hosts = generatedFiles.filter((p) => {
      const c = contentOf.get(p)
      return typeof c === 'string' && c.length > 0 && anchors.some((a) => c.includes(a))
    })
    if (hosts.length === 0) {
      missingSubcomponents.push({
        subId: sub.id != null ? String(sub.id) : null,
        responsibility: String(sub.responsibility || ''),
        reason: 'anchors-not-materialized',
        missingAnchors: anchors.slice(0, 3),
      })
      continue
    }
    anchoredGroups++
    hostsBySub.set(i, hosts)
  }

  // 同宿：≥2 组全部落在唯一同一文件 ⇒ 未真正拆分（内联在父文件里也算未拆）
  if (hostsBySub.size >= 2) {
    const allHosts = new Set([...hostsBySub.values()].flat())
    if (allHosts.size === 1) {
      const only = [...allHosts][0]
      for (const [i] of hostsBySub) {
        const sub = subs[i] || {}
        missingSubcomponents.push({
          subId: sub.id != null ? String(sub.id) : null,
          responsibility: String(sub.responsibility || ''),
          reason: 'not-split',
          host: only,
          missingAnchors: [],
        })
      }
      hostsBySub.clear()
      anchoredGroups = 0
    }
  }

  // ── ③ 引用完整性（全产物引用图；仅全量写盘可评估）────────────────
  const referencedBasenames = new Set()
  for (const [, content] of entries) {
    if (typeof content !== 'string' || content.length === 0) continue
    const re = new RegExp(LOCAL_VUE_IMPORT_SOURCE.source, 'g')
    let m
    while ((m = re.exec(content)) !== null) {
      const base = String(m[1]).split('/').pop()
      if (base) referencedBasenames.add(base)
    }
  }
  const indexPresent = contentOf.has('package/index.vue')
  const orphanFiles = indexPresent
    ? generatedFiles.filter((p) => !referencedBasenames.has(p.split('/').pop()))
    : []
  const orphanCheck = indexPresent ? 'evaluated' : 'skipped:partial'

  return {
    isForced,
    expected,
    generated,
    missing,
    // 数量达标但逐组锚点缺失（空壳/未拆）同样不算 ok
    ok: missing === 0 && missingSubcomponents.length === 0,
    internalExpected,
    generatedFiles,
    missingSubcomponents,
    anchoredGroups,
    unanchoredGroups,
    orphanFiles,
    orphanCheck,
    skippedReason: hasPlan ? null : 'no-plan',
  }
}

/**
 * 计数行格式（skip / no-plan 与零缺失必须可区分）。
 * message 保持 2026-11-08 首版格式不变（旧 spec 逐字断言），
 * 仅在 skipped 时追加 ` skipped=<reason>`；缺口明细走 meta 结构化字段。
 * @param {ReturnType<typeof assessSubComponentCoverage>} report
 */
export function formatSubComponentCoverage(report) {
  const r = report && typeof report === 'object' ? report : {}
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
  const skipped = typeof r.skippedReason === 'string' && r.skippedReason.length > 0
  return {
    message:
      `🧩 子组件覆盖度: expected=${num(r.expected)} generated=${num(r.generated)} ` +
      `missing=${num(r.missing)} internalExpected=${num(r.internalExpected)} ` +
      `forced=${r.isForced === true ? 1 : 0}` +
      (skipped ? ` skipped=${r.skippedReason}` : ''),
    meta: {
      isForced: r.isForced === true,
      expected: num(r.expected),
      generated: num(r.generated),
      missing: num(r.missing),
      internalExpected: num(r.internalExpected),
      ok: r.ok === true,
      generatedFiles: Array.isArray(r.generatedFiles) ? r.generatedFiles : [],
      // 三合一明细（判据/日志消费方只看结构化字段，不解析 message）
      anchoredGroups: num(r.anchoredGroups),
      unanchoredGroups: num(r.unanchoredGroups),
      missingSubcomponents: Array.isArray(r.missingSubcomponents) ? r.missingSubcomponents : [],
      orphanFiles: Array.isArray(r.orphanFiles) ? r.orphanFiles : [],
      orphanCheck: typeof r.orphanCheck === 'string' ? r.orphanCheck : 'skipped:partial',
      skippedReason: skipped ? r.skippedReason : null,
    },
  }
}
