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

/**
 * 🧩 P1-3（2026-11-12 · 8b15a757 实锤）：同构段收敛后的覆盖度豁免通道。
 *
 * ## 病灶（真机 expected=9 generated=2 missing=7 的三重来源）
 * planner R2 密度拆分把三厂商段拆成 group1/2/3 记账（minFiles=9），而刀66 同构收敛
 * 把三段收成 1 个 v-for + 1 份模板（物理文件 2 个）——**记账与产物两种建模都各自正确**，
 * 按文件数对账恒 missing=7。锚点也被两处拆断：
 *   ① 锚串「大华股份 8台」是整串，产物把条目拆成 `{"name":"大华股份","value":"8台"}` 后
 *      整串不存在（anchors-not-materialized 假阳）；
 *   ② `missing` 计数把 v-for 复用当缺文件。
 *
 * ## 豁免判据（全部满足；任一不满足 ⇒ 走原判据，红线：不误放水）
 *  ① 调用方传入 `isoGroupedSectionIds`（同构收敛实际生效的段 id 集，来自刀66 改写
 *     applied 记录；空集 ⇒ 完全零行为变更）；
 *  ② internalSubcomponent 的 id 形如 `<isoSectionId>-group<N>` / `-col<N>` / `-nested`
 *     （planner R2/R3 的派生 id 形态），宿主段在同构组内；
 *  ③ 该组的锚点在**同构产物**里真实可寻：锚串整串命中，或拆分形态命中
 *     （`"name":"X","value":"V"` / `>{{X}}` / `{{X}}` 模板插值——值段拼接等价，
 *      与 C1b 拼接等价判据同口径）。
 *     锚点找不到 ⇒ **不豁免**（真缺席照拦，防止「v-for 收敛」成为万能免死金牌）。
 *  ④ expected 基数同步折算：同构组内每个被收敛的段不再按「每段 N 个文件」计，
 *     折算为组内实际落盘文件数（v-for 复用算 1 份模板 + 各成员数据行，不计成员文件）。
 */
function anchorHitInIsoArtifact(content, anchors) {
  if (typeof content !== 'string' || content.length === 0) return false
  const text = content
  // 拆分形态归一：{"name":"X","value":"V"} / {{X}} 插值 / >X< 文本节点
  const normAnchor = (a) => a.replace(/\s+/g, ' ').trim()
  for (const raw of anchors) {
    const a = normAnchor(raw)
    if (!a) continue
    if (text.includes(a)) return true
    // 「名称 数值」拆分等价：`华为技术 8台` → `"name":"华为技术","value":"8台"`
    const sp = a.match(/^(.+?)\s+([\d.]+\S*)$/)
    if (sp) {
      const [, nm, val] = sp
      if (
        new RegExp(`"name"\\s*:\\s*"?"?${nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"?"?\\s*,\\s*"value"\\s*:\\s*"?"?${val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"?"?`).test(text)
      ) return true
      // 模板插值形态（成员数据行 + 插值）：只要名称能寻到（值由数据行承载）
      if (text.includes(nm)) return true
    }
  }
  return false
}

/** planner R2/R3 派生 id 形态：`<sectionId>-group<N>` / `-col<N>` / `-nested`。 */
const PLANNER_DERIVED_SUBID_RE = /^(.+)-(group|col|nested)\d*$/

/** 只保留非空字符串（锚点去噪）。 */
function stringsOf(v) {
  return Array.isArray(v)
    ? v.filter((x) => typeof x === 'string' && x.trim().length > 0).map((s) => s.trim())
    : []
}

/**
 * @param {{ subPlan?: object|null, files?: object|Array, isoGroupedSectionIds?: Array<string|number> }} input
 *   subPlan: { isForced, minFiles, internalSubcomponents[] }
 *           null/undefined ⇒ skippedReason='no-plan'（planner 尚未记账，禁止打「零缺失」假绿）
 *   files:   写盘文件表 `{ 'package/components/X.vue': '...' }`，或路径数组
 *   isoGroupedSectionIds: 刀66 同构收敛**实际生效**的段 id 集（P1-3 豁免通道；
 *           未传/空 ⇒ 完全走原判据，零行为变更）
 * @returns {{ isForced:boolean, expected:number, generated:number, missing:number, ok:boolean,
 *             internalExpected:number, generatedFiles:string[],
 *             missingSubcomponents:Array<{subId:string|null,responsibility:string,reason:string,missingAnchors:string[]}>,
 *             anchoredGroups:number, unanchoredGroups:number,
 *             orphanFiles:string[], orphanCheck:string, skippedReason:string|null }}
 */
export function assessSubComponentCoverage({ subPlan, files, isoGroupedSectionIds } = {}) {
  const hasPlan = subPlan !== null && subPlan !== undefined
  const plan = hasPlan && typeof subPlan === 'object' ? subPlan : {}
  const isForced = plan.isForced === true
  // 🧩 P1-3：同构收敛生效的段 id 集（字符串化一次，供豁免判定）
  const isoIds = new Set(
    (Array.isArray(isoGroupedSectionIds) ? isoGroupedSectionIds : []).map((x) => String(x)),
  )
  const subs = Array.isArray(plan.internalSubcomponents) ? plan.internalSubcomponents : []
  // P1-3 ④：expected 折算——同构组内 planner 派生子组件（-group/-col/-nested）不按
  //   「每派生组一个文件」计（v-for 收敛后由数据行承载，物理文件=组模板数）。
  //   折算只作用于「派生组且宿主段在同构组内」，leaf 段与其余拆分一概不动。
  const subsInIso = subs.filter((s) => {
    const m = PLANNER_DERIVED_SUBID_RE.exec(String(s?.id ?? ''))
    return !!(m && isoIds.has(m[1]))
  })
  const expectedBase = isForced ? Math.max(0, Number(plan.minFiles) || 0) : 0
  const expected = Math.max(0, expectedBase - subsInIso.length)
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
    // 🧩 P1-3 ②③：planner 派生组（宿主段在同构收敛组内）的锚点改在**全产物**里寻
    //   （v-for 收敛后成员数据在 index.vue，不在子组件文件）；锚点可寻 ⇒ 计入
    //   anchoredGroups（豁免 missing 计数）；不可寻 ⇒ 原判据照拦（真缺席不放水）。
    const derivedM = PLANNER_DERIVED_SUBID_RE.exec(String(sub.id ?? ''))
    if (derivedM && isoIds.has(derivedM[1]) && anchors.length > 0) {
      const hit = entries.some(
        ([, c]) => typeof c === 'string' && c.length > 0 && anchorHitInIsoArtifact(c, anchors),
      )
      if (hit) {
        anchoredGroups++
        continue
      }
      // 锚点全产物不可寻：真缺席，走下方原判据（会落 anchors-not-materialized）
    }
    if (anchors.length === 0) {
      unanchoredGroups++
      continue
    }
    // 🧩 P1-3 补充（与 C1b 拼接等价同口径）：宿主候选先按原判据（子组件文件含整串）；
    //   未命中且**同构收敛生效**（段 id 在 isoIds 内——代表段组件不含条目文本，
    //   条目数据在 index.vue 的 v-for 行里）⇒ 全产物按拆分形态寻（{"name":"X","value":"V"}
    //   / 插值 / 名称可寻）。找不到 ⇒ 真缺席照拦。
    let hosts = generatedFiles.filter((p) => {
      const c = contentOf.get(p)
      return typeof c === 'string' && c.length > 0 && anchors.some((a) => c.includes(a))
    })
    if (hosts.length === 0 && isoIds.has(String(sub.id ?? ''))) {
      const hit = entries.some(
        ([, c]) => typeof c === 'string' && c.length > 0 && anchorHitInIsoArtifact(c, anchors),
      )
      if (hit) {
        anchoredGroups++
        continue
      }
    }
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
