/**
 * 🧷 SFC `<script>` 开标签锚点 · 单一事实源（2026-11-16 实锤 mc-1794791855405-2e4db5ba）
 *
 * ## 病灶（属性顺序敏感的锚点判定 · 全管线共 15 处各写一套）
 * 历史上各消费点一律用 `/<script\s+setup[^>]*>/` 定位带 setup 的开标签——该正则要求
 * `setup` **紧跟在 `<script` + 空白之后**，即「属性必须写在 setup 后面」。
 *
 * 归属链契约（`section-identity-contract` §1）要求「本文件**根元素**必须带 `data-section-id`」，
 * 模型把它写到了 `<script>` 上（真机实锤 9 个文件，形态 `<script data-section-id="89:39" setup>`，
 * 甚至 `<script @click="…" data-section-id="2:7954" setup>`）⇒ `setup` 被挤到属性之后 ⇒
 * **所有**定位点同时失配，且全部是「静默跳过」而非报错：
 *   ① `resource-import-guard#injectResourceImports` 找不到插入点 → 走到末尾 `collectDiag` 分支直接
 *      `return cleanedCode`。此时**它已经执行过清理**（`defaultRe` 删同名 import、`placeholderRe`
 *      删 `const NAME =`）⇒ 已注入好的资源 import/占位声明被删且不再补回 = **净损失**；
 *   ② `post-process` / `card-visual-truth-rewriter` / `resource-img-src-healer` 的 helper/import
 *      注入同样 `.test('<script setup>')` 为假 → 整块跳过；
 *   ③ `healImgSrcBindings`(L3-c) 只看模板裸 `<img>` ⇒ 对本形态不可见；
 *   ④ 语义门禁把全部资源变量塞进 `implicitlyDeclared` 白名单 ⇒ `icon6` 被当成「已声明」放行；
 *   ⑤ 最终只在运行时暴露：`icon6 is not defined` → RUNTIME-004 硬 BLOCK + VISUAL-002。
 *
 * ## 判据（本模块唯一权威 · 属性顺序无关）
 * 开标签是否 setup，取决于**标签内的属性集合里有没有独立单词 `setup`**，与顺序无关。
 * 正则：`/<script\b(?=[^>]*\ssetup(?=[\s/>]))[^>]*>/i`
 *   · 独立单词 = `setup` 前有空白、后有空白 `/` `>` —— 故 `data-setup="1"` **不**命中（前导为 `-`）。
 *
 * ## 口径不放松（禁止把本模块当作宽松匹配闸）
 * · 只放宽「属性顺序」，**不放宽** `setup` 的存在性：`findScriptSetupOpen` 仍要求确有 setup。
 * · 需要「任意 script 段」时用 `findScriptOpen`（含 setup 优先，回退首个 `<script>`），
 *   与 `internal-subs-props-injector#findScriptBlock` 的既有口径逐字一致（本模块为该口径的上游）。
 * · 不改任何 severity、不新增白名单、不参与门禁判定。
 */

/** 带 setup 的 `<script>` 开标签（属性顺序无关，须为独立单词 setup）。 */
export const SCRIPT_SETUP_OPEN_RX = /<script\b(?=[^>]*\ssetup(?=[\s/>]))[^>]*>/i

/** 任意 `<script>` 开标签。 */
export const SCRIPT_OPEN_RX = /<script\b[^>]*>/i

/**
 * 定位带 setup 的 `<script>` 开标签。找不到返回 null（**不**回退）。
 *
 * @param {string} code
 * @returns {{index:number, tag:string} | null}
 */
export function findScriptSetupOpen(code) {
  if (typeof code !== 'string' || code.length === 0 || !code.includes('<script')) return null
  const m = SCRIPT_SETUP_OPEN_RX.exec(code)
  if (!m) return null
  return { index: m.index, tag: m[0] }
}

/**
 * 定位「应作为脚本段使用」的开标签：含 setup 优先，回退首个 `<script>`。
 * 口径与 `internal-subs-props-injector#findScriptBlock` 零漂移。
 *
 * @param {string} code
 * @returns {{index:number, tag:string, isSetup:boolean} | null}
 */
export function findScriptOpen(code) {
  const setup = findScriptSetupOpen(code)
  if (setup) return { ...setup, isSetup: true }
  if (typeof code !== 'string' || code.length === 0 || !code.includes('<script')) return null
  const m = SCRIPT_OPEN_RX.exec(code)
  if (!m) return null
  return { index: m.index, tag: m[0], isSetup: false }
}

/**
 * 取脚本段的内容区间（含 setup 优先、回退首个 script）。
 *
 * @param {string} code
 * @returns {{index:number, tag:string, isSetup:boolean, start:number, end:number, inner:string} | null}
 *   `start`/`end` = `<script …>` 之后、`</script>` 之前的绝对偏移；`inner` = 该区间文本。
 */
export function findScriptBlock(code) {
  const open = findScriptOpen(code)
  if (!open) return null
  const start = open.index + open.tag.length
  const closeIdx = code.indexOf('</script', start)
  const end = closeIdx === -1 ? code.length : closeIdx
  return { ...open, start, end, inner: code.slice(start, end) }
}

/**
 * 在脚本段开标签正下方注入文本（属性顺序无关，**保留原始开标签**）。
 * 找不到脚本段 ⇒ 原样返回（调用方自行决定 fail-open/fail-closed）。
 *
 * @param {string} code
 * @param {string} inject 要插入到开标签之后的文本
 * @returns {{code:string, injected:boolean}}
 */
export function injectIntoScript(code, inject) {
  const open = findScriptSetupOpen(code) || findScriptOpen(code)
  if (!open || !inject) return { code, injected: false }
  const pos = open.index + open.tag.length
  return { code: code.slice(0, pos) + inject + code.slice(pos), injected: true }
}

/**
 * 取**带 setup** 的脚本段（最严格的 setup 口径，不回退）。
 *
 * @param {string} code
 * @returns {{index:number, openTag:string, start:number, end:number, inner:string, closeIndex:number} | null}
 *   `start` = 开标签结束偏移；`end`/`closeIndex` = `</script` 起始偏移（缺失则为 code.length）；
 *   `inner` = `code.slice(start, end)`。
 */
export function findScriptSetupBlock(code) {
  const open = findScriptSetupOpen(code)
  if (!open) return null
  const start = open.index + open.tag.length
  const closeIndex = code.indexOf('</script', start)
  const end = closeIndex === -1 ? code.length : closeIndex
  return { index: open.index, openTag: open.tag, start, end, inner: code.slice(start, end), closeIndex }
}

/**
 * 替换**带 setup** 脚本段的内部内容，逐字保留原开标签（含 `lang` / `data-section-id` 等属性）。
 * 旧实现在多处写成 `` `<script setup>${fixed}</script>` ``，会把原属性整块丢掉。
 *
 * @param {string} code
 * @param {string} newInner
 * @returns {{code:string, replaced:boolean}}
 */
export function replaceScriptInner(code, newInner) {
  const b = findScriptSetupBlock(code)
  if (!b) return { code, replaced: false }
  const head = code.slice(0, b.start) + String(newInner)
  const tail = b.closeIndex === -1 ? '\n</script>\n' : code.slice(b.closeIndex)
  return { code: head + tail, replaced: true }
}

