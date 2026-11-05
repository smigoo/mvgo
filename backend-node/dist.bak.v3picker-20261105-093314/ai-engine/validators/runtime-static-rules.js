/**
 * RUNTIME-STATIC-* 规则编号中心表（2026-09-10 立项 G3）
 *
 * 纯函数、零依赖、**无 import.meta**，便于 jest 单测。
 *
 * === 为什么需要这张表 ===
 * mvgo 生成产物有两类「运行时报 JS / 渲染错误」防线，此前**命名分叉**：
 *   1. 生成期静态门禁（写盘前，确定性）：规则编号形如 `VUE-VIF-VFOR-001` / `CSS-CALC-SELFREF-001`，
 *      或仅以函数名存在（如引用型 TDZ 的 `findTdzReferences`，此前**无编号**）；
 *   2. 运行时门禁（Puppeteer 真渲染）：编号形如 `RUNTIME-004/009/010`，见 screenshot-renderer.js。
 * 两者覆盖同一类缺陷、却没有统一的对应关系 → 排查时「静态报 A、运行时报 B」，无法一眼对上。
 *
 * 本表为**唯一事实源**：把「生成期可静态判定的运行时错误」统一登记为 `RUNTIME-STATIC-*`，
 * 并显式标注它**预防哪些运行时 RUNTIME-* 码**。既有 legacyId（如 VUE-VIF-VFOR-001 / CSS-CALC-SELFREF-001）
 * **保持不变**（不破坏现有 spec / 日志 / 前端展示），本表仅做「编号中心 + 映射」，即：
 *   staticId (RUNTIME-STATIC-xxx)  ←→  legacyId（既有规则号）  →  runtimeCodes（防的运行时码）
 *
 * === 扩展方式 ===
 * 新增一处生成期静态拦截时，**必须**在本表登记一条；`runtime-static-rules.spec.ts` 会校验：
 *   - staticId 唯一且形如 RUNTIME-STATIC-\\d{3}；
 *   - runtimeCodes 非空且均为已知 RUNTIME-* 码；
 *   - 无重复 legacyId。
 *
 * ⚠️ 红线：本表**只登记**，不改变任何门禁行为；静态规则**不得**越界去改运行时门禁判定。
 */

/**
 * 已知运行时 RUNTIME-* 码全集（与 screenshot-renderer.js addBlock 一一对应，2026-09-10 审计）。
 * 作为「静态规则预防目标」的取值域校验基准。
 */
export const RUNTIME_CODES = {
  'RUNTIME-001': '真实预览页不可达（导航）',
  'RUNTIME-002': '真实预览导航失败（HTTP）',
  'RUNTIME-003': '真实预览未进入 ready/error（超时）',
  'RUNTIME-004': '真实预览状态非 ready（preview-status，含 errorType=vue-render 渲染崩溃）',
  'RUNTIME-005': '预览根容器尺寸为空（layout）',
  'RUNTIME-006': '组件 ready 但无可见根节点（blank-render）',
  'RUNTIME-007': 'HTTP 资源加载错误',
  'RUNTIME-008': '网络请求失败',
  'RUNTIME-009': '未捕获页面异常（pageerror）',
  'RUNTIME-010': 'console.error 输出',
  'RUNTIME-011': '截图失败（renderer）',
  'RUNTIME-012': '真实预览截图像素近似全白 / 无有效内容（blank-render 像素级）',
  'RUNTIME-013': '仅完成静态抽取（static-fallback），无法证明组件可在真实 Vue 运行时加载',
  'RUNTIME-014': '无法构建组件截图容器（renderer）',
  'RUNTIME-015': '截图渲染失败（renderer，异常抛出）',
}

/**
 * RUNTIME-STATIC-* 中心表。
 * @type {Array<{staticId:string, legacyId:string, runtimeCodes:string[], category:string, title:string, detect:string, fix:string, implRef:string}>}
 */
export const RUNTIME_STATIC_RULES = [
  {
    staticId: 'RUNTIME-STATIC-001',
    legacyId: 'SFC-TDZ-REF',
    runtimeCodes: ['RUNTIME-009', 'RUNTIME-010'],
    category: 'vue-script',
    title: '引用型/赋值型 TDZ：变量在被声明前被引用',
    detect: '脚本中非声明语句读取/调用了晚于自身声明的 const/let/class（如 watch(activeTab) 早于 const activeTab）',
    fix: 'autoFixTdzReferences 把被提前引用的声明上移到首次引用之前（语义等价）；残留则 fail-closed',
    implRef: 'src/ai-engine/utils/sfc-tdz.js:findTdzReferences / autoFixTdzReferences（渲染期文本见 runtime-error-classifier.js）',
  },
  {
    staticId: 'RUNTIME-STATIC-002',
    legacyId: 'VUE-VIF-VFOR-001',
    runtimeCodes: ['RUNTIME-009', 'RUNTIME-010'],
    category: 'vue-template',
    title: 'v-if 与 v-for 同元素（v-if 优先级高 → 读取 undefined）',
    detect: '模板同一元素同时含 v-for 与 v-if（如 <div v-for="t in list" v-if="active===t">）',
    fix: 'stripVIfOnVFor 把 v-if 折叠进 v-for 数据源（list.filter(...)），移除同元素 v-if，DOM 不变',
    implRef: 'src/ai-engine/roles/microcode/code-healer.js:stripVIfOnVFor；注册于 validators/code-fix-rules.js:777',
  },
  {
    staticId: 'RUNTIME-STATIC-003',
    legacyId: 'CSS-CALC-SELFREF-001',
    runtimeCodes: ['RUNTIME-005'],
    category: 'style',
    title: 'CSS calc() var() 自引用双写默认值',
    detect: 'calc(var(--x, var(--x)) * n)：第二个参数自引用第一个变量，默认值永远不生效',
    fix: '改写为 calc(var(--x, <默认值>) * n)，保留首个回退值、去掉自引用双写',
    implRef: 'src/ai-engine/validators/code-fix-rules.js:1101',
  },
]

/**
 * legacyId → staticId 反查（既有规则号 → 统一编号）。
 * @param {string} legacyId
 * @returns {string|null}
 */
export function resolveStaticCode(legacyId) {
  const hit = RUNTIME_STATIC_RULES.find((r) => r.legacyId === legacyId)
  return hit ? hit.staticId : null
}

/**
 * staticId → 记录反查。
 * @param {string} staticId
 * @returns {object|null}
 */
export function getStaticRule(staticId) {
  return RUNTIME_STATIC_RULES.find((r) => r.staticId === staticId) || null
}

/**
 * 校验中心表自洽（供 spec 与 CI 使用；纯函数，不抛异常，返回问题清单）。
 * @returns {string[]} 问题描述数组（空数组 = 自洽）
 */
export function validateStaticRuleRegistry() {
  const issues = []
  const seenStatic = new Set()
  const seenLegacy = new Set()
  for (const r of RUNTIME_STATIC_RULES) {
    if (!/^RUNTIME-STATIC-\d{3}$/.test(r.staticId)) {
      issues.push(`staticId 格式非法：${r.staticId}（应形如 RUNTIME-STATIC-001）`)
    }
    if (seenStatic.has(r.staticId)) issues.push(`staticId 重复：${r.staticId}`)
    seenStatic.add(r.staticId)
    if (seenLegacy.has(r.legacyId)) issues.push(`legacyId 重复：${r.legacyId}`)
    seenLegacy.add(r.legacyId)
    if (!Array.isArray(r.runtimeCodes) || r.runtimeCodes.length === 0) {
      issues.push(`${r.staticId} 的 runtimeCodes 为空（必须标注预防哪些运行时码）`)
    } else {
      for (const c of r.runtimeCodes) {
        if (!RUNTIME_CODES[c]) issues.push(`${r.staticId} 引用了未知运行时码：${c}`)
      }
    }
    for (const k of ['category', 'title', 'detect', 'fix', 'implRef']) {
      if (!r[k]) issues.push(`${r.staticId} 缺字段：${k}`)
    }
  }
  return issues
}
