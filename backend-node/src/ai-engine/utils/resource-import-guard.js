/**
 * 资源 import 复核与重注入守卫
 *
 * 背景（2026-08-07 收口）：
 * 微码/Vue3 组件的图片资源变量（bg1/bg2/icon2…）由后处理器依据 resourceDomMapping
 * 自动注入到 .vue 文件，模型按规范**禁止手写**这些 import。
 *
 * 此前已修两处误杀：
 *   1) 微码 generateCode 内「语义门禁」跑在注入之前 → 注入是死代码 → 合规组件被门禁误杀
 *      （已把注入移入门禁前 + 磁盘兜底重载）。
 *   2) 微码 code-structure-validator 的 CODE-008 漏传 mapping → 把系统注入的 import 误判为
 *      模型手写打 BLOCK（已补齐 mapping 透传）。
 *
 * 本文件补上第三道防线：**refiner 写盘后复核**。
 * refiner（layout/style/merged/legacy）通过 applyPatchesToWorkspace 直接改磁盘 .vue 文件，
 * 若某个 PATCH 动了 <script> 段把已注入的 `import bg1` 删掉，由于 refiner 写盘后不再跑语义
 * 门禁，坏文件会直接漏网（仅缺声明、不再被任何校验拦截）。
 *
 * 修复策略：refiner 写盘后，对所有 .vue 文件做一次**幂等重注入**——只要模板/脚本仍引用该资源
 * 变量且映射里存在，就确保 import 存在；已存在则净零改动，缺失则补齐。
 *
 * 所有逻辑与 MicrocodeEngineer.injectResourceImports / Vue3Engineer.injectVue3ResourceUrls
 * 完全一致（此处为单一事实源，工程师方法已委托本模块），确保 generateCode 与 refiner 后
 * 的注入行为零漂移。
 */

import { existsSync, readFileSync, writeFileSync, readdirSync } from 'fs'
import { join } from 'path'

/**
 * 可用资源单一过滤帮手（R0-6，2026-09-01）。
 *
 * 契约：只收 `downloadStatus === 'success'` 的条目。全管线统一走这里，禁止各处手搓
 * filter——手搓漏写该条件时 available 为空 → varToMapping.size===0 → 校验/注入
 * 静默假通过（此坑已多次实锤）。生产链路保证字段存在（graph 会回填 'missing'），
 * 不要为兼容性放宽本过滤：会破坏与 injectResourceImports 的「同一命名事实源」零漂移。
 *
 * 注意：visual-parser / lite.service 接受 'css' 状态的语义不同，不在本帮手覆盖范围。
 *
 * @param {Array} resourceDomMapping
 * @returns {Array} 可用资源条目（downloadStatus === 'success'）
 */
export function filterAvailableResources(resourceDomMapping) {
  return (Array.isArray(resourceDomMapping) ? resourceDomMapping : []).filter(
    (m) => m && m.downloadStatus === 'success',
  )
}

/**
 * 构建 变量名 → mapping 的查找表（编号模式 bg1/icon2/img3 + 语义模式 semanticVarName）。
 * 微码与 Vue3 共用，保证两边变量编号规则一致。
 *
 * 单一事实源：优先读 mapping 生成阶段固化的 assignedVarName（figma-connector._buildResourceDomMapping），
 * prompt 侧（formatResourceMapping）与注入侧共用同一编号，杜绝「两边各自编号口径不一致」导致的图片错位。
 * 注入侧不按面板资源过滤（与编号口径一致：编号本身基于全量 success 资源），
 * 是否过滤面板资源由 prompt 展示侧（formatResourceMapping 的 filterPanelResources）决定。
 * 老 mapping（无 assignedVarName 字段）自动回退到旧逻辑，行为与历史一致。
 */
export function buildVarToMapping(resourceDomMapping) {
  const mappings = resourceDomMapping || []
  const hasAssigned = mappings.some(m => m.assignedVarName)

  const available = filterAvailableResources(mappings)
  const varToMapping = new Map()

  if (hasAssigned) {
    for (const m of available) {
      if (m.assignedVarName) {
        varToMapping.set(m.assignedVarName, m)
      }
    }
  } else {
    // 回退：老 mapping 无 assignedVarName，按角色顺序编号（与历史行为一致）
    const bgMappings = available.filter(m => m.previewAnalysisRole === 'bg')
    const iconMappings = available.filter(m => m.previewAnalysisRole === 'icon')
    const imgMappings = available.filter(m => m.previewAnalysisRole === 'img' || m.previewAnalysisRole === 'image')

    bgMappings.forEach((m, i) => varToMapping.set(`bg${i + 1}`, m))
    iconMappings.forEach((m, i) => varToMapping.set(`icon${i + 1}`, m))
    imgMappings.forEach((m, i) => varToMapping.set(`img${i + 1}`, m))
  }

  available.forEach(m => {
    if (m.semanticVarName) {
      varToMapping.set(m.semanticVarName, m)
    }
  })

  return { available, varToMapping }
}

/**
 * 提取资源映射会被注入的所有变量名（bg1/icon1/img1… + semanticVarName）。
 * 供语义校验器（validateVueScriptSemantics）把资源变量视为"已声明"，
 * 避免 per-chunk 门禁在系统注入之前误判"模板引用未声明变量"并死循环重试。
 * 与 injectResourceImports 共用同一命名事实源（buildVarToMapping），行为零漂移。
 */
export function extractResourceVarNames(resourceDomMapping) {
  const { varToMapping } = buildVarToMapping(resourceDomMapping)
  return [...varToMapping.keys()]
}

/**
 * 从代码中收集「已具名绑定」的变量名——只认 import / const|let|var 声明。
 *
 * 与编号扫描（\bbg1\b）不同，本函数用于「声明判定」：
 * 模板 `${bg2}` 插值是**运行时求值**，必须绑定到具名变量；但只出现变量名的字符串
 * （注释、字符串字面量、其它对象的 key）不算声明，必须是 import...from / const|let|var 声明。
 *
 * @param {string} code
 * @returns {Set<string>} 已声明的变量名集合
 */
function collectDeclaredBindings(code) {
  const declared = new Set()
  if (typeof code !== 'string' || code.length === 0) return declared
  // import bg2 from '...' / import { a, b } from '...' / import * as ns from '...'
  for (const m of code.matchAll(
    /import\s+([A-Za-z_$][\w$]*)\s*(?:,\s*\{[^}]*\})?\s*from\s*['"][^'"]+['"]/g,
  )) {
    declared.add(m[1])
  }
  for (const m of code.matchAll(
    /import\s*\{([^}]*)\}\s*from\s*['"][^'"]+['"]/g,
  )) {
    for (const part of String(m[1]).split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0]?.trim()
      if (name) declared.add(name)
    }
  }
  for (const m of code.matchAll(
    /import\s*\*\s*as\s+([A-Za-z_$][\w$]*)\s*from\s*['"][^'"]+['"]/g,
  )) {
    declared.add(m[1])
  }
  // const|let|var 声明（含解构、多声明符、无赋值裸声明）
  //
  // 🛡️ 2026-09-01 防御性审计：旧实现只认 `const|let|var NAME =`，漏掉三类声明：
  //   ① 解构 `const { bgtabActive } = defineProps(...)`
  //   ② 无赋值 `let bgtabActive;`
  //   ③ 多声明符的第二个起 `const a = 1, b = 2`（旧实现只取首个）
  // 后果：injectResourceImports 的清理步骤同样只清 `const|let NAME =`，
  // 于是漏网的声明 + 注入的 `import NAME` / `const NAME = 主名` → 重复声明 → SyntaxError。
  // 本集合用于「撞名复核」，扩大识别面只会让注入更保守（宁可不注入，也不炸 SyntaxError）。
  // 捕获到语句尾（`;` 或行尾），再用逗号切分声明符；每个声明符取 `NAME =` 或裸 `NAME`。
  // 要求标识符后紧跟 `=` / `;` / 结束，可过滤 `const s = 'a, b'` 里字符串内逗号造成的误判。
  const declRe = /(?:const|let|var)\s*(\{[^}]*\}|[^;\n]*)/g
  for (const m of code.matchAll(declRe)) {
    const rest = String(m[1]).trim()
    if (rest.startsWith('{')) {
      // 解构：`{ a, b: c }` → a、c
      for (const part of rest.slice(1, -1).split(',')) {
        const name = part.trim().split(':').pop()?.trim()
        if (name) declared.add(name)
      }
    } else {
      for (const part of rest.split(',')) {
        const id = part.trim().match(/^([A-Za-z_$][\w$]*)\s*(?:=|;|$)/)
        if (id) declared.add(id[1])
      }
    }
  }
  // 🛡️ defineProps 接收的 prop 名 = 已声明（模板直接引用等价于声明）。
  // 2026-09-01 W1.1 把对象简写 key 纳入 declared，防止 healUnavailableResourceRefs 把
  // 编号形态业务 prop（如 bg2）误当臆造编号剥掉。P0/D 契约（2026-09-09）要求子组件**只经
  // defineProps 接收资源**而非本地 import，因此此处必须能正确解析**嵌套对象**
  // （`{ icon1: { type: String, required: true } }`）与泛型（`<{ icon1: string }>`）。
  // 旧实现用 `/defineProps\s*\(\s*\{([^}]*)\}\s*\)/g`，`[^}]*` 遇首个 `}` 即停 → 嵌套对象
  // 的 key 全失配 → 合规的 P0/D 子组件被 CODE-018 误判 missing → 3×BLOCK 空转。
  // 改用括号配对，支持任意层级嵌套与泛型。注意：泛型参数形如 `<{...}>()`，内部 `}` 与
  // 外层 `>` 不对称，故配对时只按**同一开盘符**做对称匹配（open 为 `<` 则 close 仅 `(` 之外
  // 的同类 `<`/`>` 配对），避免把 `>` 误判为 close 提前截断。
  for (const m of code.matchAll(/defineProps\s*(<|\()/g)) {
    const openCh = m[1]
    const closeCh = openCh === '<' ? '>' : ')'
    const openIdx = m.index + m[0].length - 1
    let depth = 0
    let end = -1
    for (let i = openIdx; i < code.length; i += 1) {
      if (code[i] === openCh) depth += 1
      else if (code[i] === closeCh) {
        depth -= 1
        if (depth === 0) { end = i; break }
      }
    }
    if (end < 0) continue
    let arg = code.slice(openIdx + 1, end).trim()
    if (arg.startsWith('{') && arg.endsWith('}')) arg = arg.slice(1, -1)
    for (const part of splitTopLevel(arg, [',', ';'])) {
      const name = part.trim().replace(/\?$/, '').split(':')[0]?.trim()
      if (name && /^[A-Za-z_$][\w$]*$/.test(name)) declared.add(name)
    }
  }
  return declared
}

/**
 * 按顶层分隔符切分（忽略括号内的嵌套分隔符）。
 * 用于从 defineProps 的对象/泛型实参里提取第一层 prop 名。
 */
function splitTopLevel(text, seps) {
  const parts = []
  let depth = 0
  let cur = ''
  const pairs = { '{': '}', '[': ']', '(': ')', '<': '>' }
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (pairs[ch] !== undefined) { depth += 1; cur += ch; continue }
    if (Object.values(pairs).includes(ch)) { depth -= 1; cur += ch; continue }
    if (depth === 0 && seps.includes(ch)) { parts.push(cur); cur = '' }
    else cur += ch
  }
  if (cur.trim()) parts.push(cur)
  return parts
}

/**
 * 🆕 方案 3：子组件资源依赖校验（2026-08-31）
 *
 * 背景：mr7（mc-1788158950767-e7fbd410）实锤——TabSwitch.vue 模板写 `:style="{ backgroundImage: \`url(${bg2})\` }"`，
 * 但 <script setup> 里只 import 了 bgtabActive，没有 import bg2 → 运行时 `undefined` →
 * Tab 底托背景整图丢失。编号扫描（\bbg2\b）能看到「用了 bg2」，但看不到「没 import」。
 *
 * 校验逻辑（纯函数，可被 L0-B 门禁与生成时自检共用）：
 *   1) 收集「已注册资源变量名」（来自 resourceDomMapping，含 assignedVarName/semanticVarName）
 *   2) 收集「代码中实际使用的资源变量名」（编号扫描 + 语义词命中，但只保留「已注册」的）
 *   3) 对照「已具名声明」集合，缺失者输出 errors
 *
 * @param {string} content 子组件 .vue 文件内容
 * @param {string} filePath 文件路径（仅用于日志/报错定位）
 * @param {Array} resourceDomMapping 资源映射表（含 assignedVarName）
 * @returns {{valid:boolean, errors:string[], warnings:string[], declaredVars:string[], missingVars:string[]}}
 */
export function validateSubcomponentResourceDeps(content, filePath, resourceDomMapping) {
  const result = {
    valid: true,
    errors: [],
    warnings: [],
    declaredVars: [],
    missingVars: [],
  }
  if (typeof content !== 'string' || content.length === 0) return result

  const mappings = resourceDomMapping || []
  if (mappings.length === 0) return result

  const { varToMapping } = buildVarToMapping(mappings)
  if (varToMapping.size === 0) return result

  // 1) 收集代码中「使用」的资源变量（编号模式 + 语义模式，只保留已注册的）
  const usedVars = new Set()
  const numberedPattern = /\b(bg|icon|img)(\d+)\b/g
  let numMatch
  while ((numMatch = numberedPattern.exec(content)) !== null) {
    if (varToMapping.has(numMatch[0])) {
      usedVars.add(numMatch[0])
    }
  }
  for (const varName of varToMapping.keys()) {
    if (/^(bg|icon|img)\d+$/.test(varName)) continue
    const semPattern = new RegExp(`\\b${varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)
    if (semPattern.test(content)) {
      usedVars.add(varName)
    }
  }
  if (usedVars.size === 0) return result

  // 2) 收集「已具名声明」的变量（import / const|let|var）
  const declared = collectDeclaredBindings(content)
  const declaredVars = [...declared]
  result.declaredVars = declaredVars

  // 3) 使用 ∩ 资源变量，缺失声明者即错误
  const missing = []
  for (const v of usedVars) {
    if (!declared.has(v)) missing.push(v)
  }
  result.missingVars = missing

  if (missing.length > 0) {
    result.valid = false
    for (const v of missing) {
      const mapping = varToMapping.get(v)
      const resolved = mapping?.resourceFile || '(未知资源文件)'
      result.errors.push(
        `${filePath}: 模板/样式使用了资源变量 \`${v}\`，但 <script setup> 未 import 也未 const/let 声明（映射文件: ${resolved}）。运行时 undefined → 背景/图标静默丢失`,
      )
    }
  }
  return result
}

/**
 * 微码资源 import 注入（纯函数，幂等）。
 * 与原 MicrocodeEngineer.injectResourceImports 行为完全一致。
 *
 * P0-②（2026-09-01）：占位符终验并入本函数（可选第 4 参 diag，out-param，零破坏）。
 * 注入完成后对「仍残留的资源占位符」给出明确诊断，两类：
 *   - diag.residual：已注册变量被使用，但注入后仍无具名声明
 *     （mapping 缺 resourceFile / 文件无 <script setup> 块 → import 无处可插）
 *   - diag.unmapped：${bgN} 占位符引用了映射中不存在的变量（模型臆造编号，运行时 undefined）
 * 调用方传 { residual: [], unmapped: [] } 即收集；不传则行为与历史完全一致。
 */
export function injectResourceImports(code, resourceDomMapping, resourceRelBase = null, diag = null, options = null) {
  const collectDiag = (finalCode, usedVars, varToMapping) => {
    if (!diag || typeof diag !== 'object' || typeof finalCode !== 'string') return
    if (!Array.isArray(diag.residual)) diag.residual = []
    if (!Array.isArray(diag.unmapped)) diag.unmapped = []
    // 1) 已注册但注入后仍未声明（运行时 undefined → 背景/图标静默丢失）
    if (usedVars && usedVars.size > 0) {
      const declared = collectDeclaredBindings(finalCode)
      for (const v of usedVars) {
        if (declared.has(v)) continue
        const m = varToMapping.get(v)
        diag.residual.push({
          varName: v,
          resourceFile: m?.resourceFile || null,
          reason:
            m && !m.resourceFile
              ? '映射缺少 resourceFile，无法生成 import'
              : '注入后仍未具名声明（可能缺少 <script setup> 块）',
        })
      }
    }
    // 2) 未注册占位符：模板 ${bgN} 引用了映射中不存在的编号（去重，每变量报一次）
    const phRx = /\$\{\s*((?:bg|icon|img)\d+)\s*\}/g
    const seen = new Set()
    let pm
    while ((pm = phRx.exec(finalCode)) !== null) {
      if (seen.has(pm[1]) || varToMapping.has(pm[1])) continue
      seen.add(pm[1])
      diag.unmapped.push({
        varName: pm[1],
        reason: '模板占位符引用了映射中不存在的资源变量（运行时 undefined）',
      })
    }
  }

  const emptyVarToMapping = new Map()
  if (!resourceDomMapping || resourceDomMapping.length === 0) {
    collectDiag(code, null, emptyVarToMapping)
    return code
  }

  // 🎯 P0/D 契约（2026-09-09）：子组件只经 defineProps 接收资源，绝不本地 import。
  // 子组件调用处传 skipResourceVars=true → 跳过资源变量注入（资源由父级 import 经透传提供），
  // 避免「子组件本地 import + 又 defineProps 要求父传」双重持有导致的 CODE-019 不收敛。
  const skipResourceVars = !!(options && options.skipResourceVars)

  const { available, varToMapping } = buildVarToMapping(resourceDomMapping)
  if (available.length === 0) {
    collectDiag(code, null, varToMapping)
    return code // 没有可用资源
  }

  // ── 扫描代码中出现的所有已注册变量名 ──
  const usedVars = new Set()
  // 🎯 契约模式（forceAll）：主组件需全量 import 所有 success 资源，作为子组件透传的唯一来源。
  //   - 正常模式：只注入模板/脚本里「已使用」的资源变量（避免主组件凭空 import 一堆没用到的图）。
  //   - forceAll 模式：把 mapping 中全部 success 资源都 import 进主组件 script，供子组件
  //     `:prop="prop"` 透传时引用。这是「资源归主组件 import，子组件只 defineProps 接收」契约的
  //     落地前提——父不 import 则透传无源，自动接线（autoWire）也无从连线。
  const forceAll = !!(options && options.forceAll)
  if (forceAll) {
    for (const m of available) {
      const v = m.assignedVarName || m.semanticVarName
      if (v) usedVars.add(v)
    }
  } else {
    // 1) 编号模式扫描
    const numberedPattern = /\b(bg|icon|img)(\d+)\b/g
    let numMatch
    while ((numMatch = numberedPattern.exec(code)) !== null) {
      if (varToMapping.has(numMatch[0])) {
        usedVars.add(numMatch[0])
      }
    }

    // 2) 语义模式扫描
    for (const varName of varToMapping.keys()) {
      if (/^(bg|icon|img)\d+$/.test(varName)) continue
      const semPattern = new RegExp(`\\b${varName}\\b`)
      if (semPattern.test(code)) {
        usedVars.add(varName)
      }
    }
  }

  // 🎯 P0/D 契约：子组件跳过资源变量注入（资源由父级 import + 透传，本地绝不 import）
  if (skipResourceVars) {
    for (const v of [...usedVars]) {
      if (varToMapping.has(v)) usedVars.delete(v)
    }
  }

  if (usedVars.size === 0) {
    collectDiag(code, usedVars, varToMapping)
    return code // 没有使用资源变量，直接返回
  }

  // ── 生成 import 语句 ──
  const imports = []
  // 🛡️ W2 别名转发声明（2026-09-01 事故 5 · mc-max-1788239096135-c19dfe56）
  const aliasDecls = []
  // 🛡️ P0-1b（2026-08-29）：同一资源有 assignedVarName(bg1) + semanticVarName(bgm) 双名，
  // 模板里同时引用两名时 usedVars 会命中两次 → 同一 resourceFile 生成两条 import（冗余）。
  // 按 resourceFile 去重：同一资源只 import 一次（保留首个命中变量名）。
  //
  // ⚠️ W2 修正（2026-09-01）：旧实现命中已导入资源时直接 `return` 丢弃该别名，
  // 于是模板里写了别名（bgtabActive）却拿不到任何绑定 → 该名字又在语义门禁的
  // implicitlyDeclared 白名单里「被放行」→ 运行时 undefined → 背景/图标静默丢失
  // （对应日志「1 个文件存在未解析资源占位符」）。
  // 改为：首个命中生成 import，其余别名生成 `const alias = primary` 转发声明，
  // 保证「模板中出现的每个已注册变量名」都有绑定。
  const importedResources = new Set()
  const primaryVarByFile = new Map()
  usedVars.forEach(varName => {
    const mapping = varToMapping.get(varName)
    if (mapping && mapping.resourceFile) {
      const importPath = resourceRelBase
        ? `${resourceRelBase}${mapping.resourceFile.split('/').pop()}`
        : mapping.resourceFile
      if (!importedResources.has(mapping.resourceFile)) {
        importedResources.add(mapping.resourceFile)
        primaryVarByFile.set(mapping.resourceFile, varName)
        imports.push(`import ${varName} from '${importPath}'`)
      } else {
        const primary = primaryVarByFile.get(mapping.resourceFile)
        if (primary && primary !== varName) {
          aliasDecls.push(`const ${varName} = ${primary}`)
        }
      }
    }
  })

  if (imports.length === 0) {
    collectDiag(code, usedVars, varToMapping)
    return code
  }

  // ── 去重预处理：剔除已有同名资源 import，避免重复声明 ──
  const usedVarNames = [...usedVars]
  let cleanedCode = code
  for (const v of usedVarNames) {
    // 🛡️ P0 修复（2026-09-02 事故 mc-max-1788349718313-24e63b7c / mc-max-1788345051113-d22deaea）：
    // 旧正则尾段 `\s*;?\s*.*$` 中的 `\s` 会**匹配换行符**（`m` 标志下 `^` 只锚定行首，不阻止跨行），
    // 于是删除「重复的资源 import」时会越过空行、再由 `.*$` 把**紧随其后的下一条 import 整行吞掉**：
    //   import icon3 from '...png'      ← 该删
    //                                  ← 空行被 \s* 吃掉
    //   import { ref, ... } from 'vue'  ← 被 .*$ 误删，运行时 ref/echarts is not defined
    // 幂等性因此被破坏：每调用一次 injectResourceImports 就吃掉一行运行库 import
    // （实测第 2 次丢 vue、第 3 次丢 echarts）。
    // 修复：空白一律收窄为 `[ \t]`（不跨行），并去掉尾部 `.*`（行尾即语句结束，无多余内容可吃）。
    // `namedRe` 的 `([^}]*)` 保留跨行能力——多行具名 import 仍需匹配，且 `[^}]` 本身不会失控。
    //
    // 1) 清除 import 语句
    const defaultRe = new RegExp(`^[ \\t]*import[ \\t]+${v}[ \\t]+from[ \\t]*['"][^'"]*['"][ \\t]*;?[ \\t]*$`, 'gm')
    cleanedCode = cleanedCode.replace(defaultRe, '')
    const namedRe = new RegExp(`^[ \\t]*import[ \\t]*\\{[ \\t]*([^}]*)[ \\t]*\\}[ \\t]*from[ \\t]*['"][^'"]*['"][ \\t]*;?[ \\t]*$`, 'gm')
    cleanedCode = cleanedCode.replace(namedRe, (full, inner) => {
      const kept = inner.split(',').map((s) => s.trim()).filter((s) => s && s !== v)
      return kept.length === 0 ? '' : full.replace(inner, kept.join(', '))
    })

    // 2) 清除 const/let varName = ... 形式的声明（含 AI 生成的占位变量与真实资源引用声明）
    //    资源变量本应由下方 import 提供，必须清掉已有 const/let 声明，否则与 import 撞名 →
    //    Identifier 'X' has already been declared（如 const bg1 = runtimeBuilder?.resources?.bg1 || '' 与 import bg1 冲突）
    //    同上：`^[ \t]*` 不跨行，避免吃掉上一行尾部 / 合并相邻行。
    const placeholderRe = new RegExp(`^[ \\t]*(?:const|let)[ \\t]+${v}[ \\t]*=[ \\t]*.*$`, 'gm')
    cleanedCode = cleanedCode.replace(placeholderRe, '')
  }
  cleanedCode = cleanedCode.replace(/\n{3,}/g, '\n\n')

  // ── 撞名复核（2026-09-01 防御性审计）──────────────────────────────
  // 上面的清理只覆盖 `import NAME from` / `const|let NAME =` 两种形态，
  // 解构声明、无赋值声明、多声明符的第二个起都会漏网。
  // W2 之后「同一资源可声明多个名字」，注入点变多，撞名概率随之上升；
  // 一旦撞名就是重复声明 → SyntaxError（比原「静默 undefined」更糟，整块 SFC 编译失败）。
  // 故注入前再复核一次：清理后仍被声明的名字，一律不再注入（保留 LLM 自己的声明）。
  const survivedDecls = collectDeclaredBindings(cleanedCode)
  const safeImports = imports.filter((stmt) => {
    const n = stmt.match(/^import\s+([A-Za-z_$][\w$]*)\s+from/)?.[1]
    return !n || !survivedDecls.has(n)
  })
  const safeAliasDecls = aliasDecls.filter((stmt) => {
    const n = stmt.match(/^const\s+([A-Za-z_$][\w$]*)/)?.[1]
    return !n || !survivedDecls.has(n)
  })

  // ── 注入到 <script setup> 之后 ──
  const scriptSetupPattern = /<script\s+setup[^>]*>/
  const scriptMatch = cleanedCode.match(scriptSetupPattern)

  if (scriptMatch) {
    if (safeImports.length === 0 && safeAliasDecls.length === 0) {
      collectDiag(cleanedCode, usedVars, varToMapping)
      return cleanedCode
    }
    const insertPos = scriptMatch.index + scriptMatch[0].length
    // W2（2026-09-01）：import 之后紧跟别名转发声明，保证同资源的第二个名字也有绑定
    const aliasBlock = safeAliasDecls.length > 0 ? '\n' + safeAliasDecls.join('\n') : ''
    const importBlock = '\n' + safeImports.join('\n') + aliasBlock + '\n'
    const finalCode = cleanedCode.slice(0, insertPos) + importBlock + cleanedCode.slice(insertPos)
    collectDiag(finalCode, usedVars, varToMapping)
    return finalCode
  }

  collectDiag(cleanedCode, usedVars, varToMapping)
  return cleanedCode
}

/**
 * 🛡️ W1（2026-09-01 事故 5 · mc-max-1788239096135-c19dfe56）：
 * 剔除模板对「不可用资源变量」的引用，切断语义门禁 fail-closed 死循环。
 *
 * 实锤链路：Figma 节点 `tabs-icon` 是资源容器（FRAME 含 ≥2 资源子节点）→ 容器拆分导出
 * 后自身不产出图片 → downloadStatus='missing'。LLM 从结构树看到节点名，无视 prompt 给出的
 * bg1/icon1/icon2 编号名，自行拼出驼峰变量 `icontabsIcon` 写进模板。该名字：
 *   1) 不在 buildVarToMapping（只收 success）→ 永不注入 import；
 *   2) 不在 extractResourceVarNames 白名单 → 语义门禁判「模板引用未声明变量」→ fail-closed；
 *   3) 下一轮 LLM 看到的仍是同一棵结构树 → 确定性复现同一臆造（两轮报错逐字相同）
 *      → 重试预算纯浪费，任务必失败。
 *
 * 按治理原则 1（能确定性判定的，一律落盘前拦截，不靠 LLM 重试）：
 * 「引用了注定拿不到绑定的资源变量」属规则可枚举缺陷，落盘前直接剔除绑定让门禁放行，
 * 而不是把任务判死。
 *
 * 判定口径（与 injectResourceImports / buildVarToMapping 同一事实源，零漂移）：
 *   - mapping 中 downloadStatus!=='success' 条目携带的 semanticVarName / assignedVarName；
 *   - 或形如 bgN/iconN/imgN 但未出现在可用 varToMapping 里的臆造编号。
 * 且该名字在当前文件 script 中**确实没有声明**（已声明的自然无需处理）。
 *
 * @param {Object} allFiles 文件表（原地修改）
 * @param {Array} resourceDomMapping 资源映射表
 * @returns {Array<{file:string, vars:string[]}>} 修复清单
 */
export function healUnavailableResourceRefs(allFiles, resourceDomMapping) {
  const mappings = Array.isArray(resourceDomMapping) ? resourceDomMapping : []
  if (mappings.length === 0 || !allFiles || typeof allFiles !== 'object') return []

  const { varToMapping } = buildVarToMapping(mappings)

  // 1) 不可用资源变量名：非 success 条目携带的名字，且未出现在可用集合里
  const deadVars = new Set()
  for (const m of mappings) {
    if (!m || m.downloadStatus === 'success') continue
    for (const name of [m.semanticVarName, m.assignedVarName]) {
      if (name && !varToMapping.has(name)) deadVars.add(name)
    }
  }

  const escapeVar = (v) => String(v).replace(/\$/g, '\\$')

  const stripVarRefs = (code, varName) => {
    const esc = escapeVar(varName)
    let out = code
    // a) 精确属性绑定 :prop="X" → 删除该属性
    out = out.replace(new RegExp(`\\s+:[\\w.\\-]+="${esc}"`, 'g'), '')
    // b) 整体 url 插值绑定 :prop="`url(${X})`" → 删除该属性
    out = out.replace(
      new RegExp('\\s+:[\\w.\\-]+="`url\\(\\$\\{' + esc + '\\}\\)`"', 'g'),
      '',
    )
    // c) 残留的 url(${X})（三元/对象内的局部插值，无法整条删属性）→ none
    out = out.replace(new RegExp('url\\(\\s*\\$\\{' + esc + '\\}\\s*\\)', 'g'), 'none')
    // d) 文本插值 {{ X }} → 删除
    out = out.replace(new RegExp('\\{\\{\\s*' + esc + '\\s*\\}\\}', 'g'), '')
    // e) 非 url 的 ${X} 裸插值（模板字符串直接拼路径/文案）→ 删成空（W1.1）
    //    a/b 要求「整属性是纯变量 / 整属性是 url 插值」、c 要求 url() 包裹、d 要求 {{ }}，
    //    都无法覆盖 `:src="\`/assets/\${X}.png\`"` 这类「模板字符串里裸拼变量」的形态。
    //    而 sfc-semantics 会把 ${X} 里的 X 识别为「模板引用未声明变量」→ fail-closed。
    //    此处把 ${X} 整体删成空，X 不再是裸标识符，门禁即可通过（路径残破属下游资源漏用，
    //    由 RESOURCE-001 兜底，不会 fail-closed 死循环）。
    //    注意顺序：必须在 c) 之后，c) 已把 url(${X}) 替换成 none，e) 不会误伤 url 场景。
    out = out.replace(new RegExp('\\$\\{' + esc + '\\}', 'g'), '')
    return out
  }

  const fixes = []
  for (const [p, c] of Object.entries(allFiles)) {
    if (!p.endsWith('.vue') || typeof c !== 'string') continue
    const declared = collectDeclaredBindings(c)
    // 2) 臆造编号：形如 bgN/iconN/imgN 但不在可用集合且未声明
    const candidates = new Set(deadVars)
    const numberedPattern = /\b(bg|icon|img)(\d+)\b/g
    let nm
    while ((nm = numberedPattern.exec(c)) !== null) {
      if (!varToMapping.has(nm[0]) && !declared.has(nm[0])) candidates.add(nm[0])
    }

    let out = c
    const hitVars = []
    for (const varName of candidates) {
      if (declared.has(varName)) continue
      const before = out
      out = stripVarRefs(out, varName)
      if (out !== before) hitVars.push(varName)
    }
    if (hitVars.length > 0) {
      allFiles[p] = out
      fixes.push({ file: p, vars: [...new Set(hitVars)] })
    }
  }
  return fixes
}

/**
 * Vue3 资源 URL 注入（纯函数，幂等）。
 * 与原 Vue3Engineer.injectVue3ResourceUrls 行为一致，额外做了「预清除已有 URL 形式声明」，
 * 保证对 refiner 后已含 const X = new URL(...) 的文件重注入时不会产生重复 const。
 */
export function injectVue3ResourceUrls(code, resourceDomMapping, resourceRelBase) {
  const { varToMapping } = buildVarToMapping(resourceDomMapping)

  // 🛡️ 幂等关键：先清除已有的 URL 形式声明，否则重注入会再生成一份 → 重复 const 崩溃
  let cleaned = code
  for (const varName of varToMapping.keys()) {
    const re = new RegExp(`^\\s*const\\s+${varName}\\s*=\\s*new URL\\([^)]*\\)\\.href\\s*;?\\s*$`, 'gm')
    cleaned = cleaned.replace(re, '')
  }

  // 标准注入（静态 import 形态）—— 🎯 2026-08-24 治本修正：
  // 历史版本曾把静态 import 转换为 `const x = new URL('...', import.meta.url).href`，
  // 该形态在 vue3-sfc-loader 预览沙箱中因 import.meta 不可用/变体拼写（`import .meta`）
  // 解析失败 → 背景图与 icon 全部失效（mv-max-1787576934056 实锤）。
  // 静态 import 双链路原生支持：
  //   - 预览：loadVue3Runtime handleModule 对 BINARY_EXTS 返回可 fetch 的绝对 URL
  //   - 真实 Vite 构建：静态 png import 是标准资源导入语法
  const injected = injectResourceImports(cleaned, resourceDomMapping, resourceRelBase)

  // 兼容清理：历史产物可能残留 new URL 声明（含 `import .meta` 空格变体），统一转为静态 import
  const withImports = injected.replace(
    /^(\s*)const\s+([A-Za-z_$][\w$]*)\s*=\s*new URL\(\s*(['"])([^'"]*resources\/images\/[^'"]+)\3\s*,\s*import\s*\.?\s*meta\s*\.?\s*url\s*\)\s*\.href\s*;?\s*$/gm,
    (_, indent, variableName, _quote, resourcePath) =>
      `${indent}import ${variableName} from '${resourcePath}'`
  )

  const urlVariables = new Set()
  const urlDeclarationPattern = /^\s*const\s+([A-Za-z_$][\w$]*)\s*=\s*new URL\([^\n]+import[\s.]*meta[\s.]*url\)\.href\s*;?\s*$/gm
  let match
  while ((match = urlDeclarationPattern.exec(withImports)) !== null) {
    urlVariables.add(match[1])
  }

  if (urlVariables.size === 0) return withImports

  // 模型偶尔会为系统资源变量额外生成 ref('') 占位声明，必须删除以避免重复 const
  return withImports
    .split('\n')
    .filter(line => {
      const placeholder = line.match(/^\s*const\s+([A-Za-z_$][\w$]*)\s*=\s*ref\(\s*(?:['"]{2}|null)\s*\)\s*;?\s*$/)
      return !placeholder || !urlVariables.has(placeholder[1])
    })
    .join('\n')
}

/**
 * 🛡️ 解析有效的 resourceDomMapping（带磁盘兜底重载）。
 * 与工程师类内 _resolveResourceDomMapping 行为一致（单一事实源）。
 */
/**
 * 🛡️ 图片背景绑定本地图兜底（2026-08-25 防复发）：
 *
 * 背景：模型常把图片背景写成 `props.bg2`（defineProps 默认 ''），而同一 <script setup> 内其实已
 * `import bg2 from '...png'`。宿主预览若不注入该 prop（默认 ''），背景图整体消失（mv-max-1787649228186
 * 车型分布背景丢失实锤）。
 *
 * 修复：对每个**本地已导入**的图片变量 X，把样式/绑定里的 `props.X` 改写为 `props.X || X`，
 * 宿主注入优先、缺省回退本地导入图，预览必可见。仅当 X 本地已导入才改，避免改写未定义变量导致
 * ReferenceError。已存在 `props.X || X` 形式的不重复改写（负向先行断言）。幂等纯函数。
 *
 * @param {string} code .vue 文件内容
 * @returns {string} 修复后的代码（无图片 import 时原样返回）
 */
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|svg|webp|bmp|ico)$/i

export function healPropImageFallbacks(code) {
  if (typeof code !== 'string' || !code.includes('props.')) return code

  // 1) 收集本地图片 import 变量名
  const importedImages = new Set()
  const importRe = /^\s*import\s+([A-Za-z_$][\w$]*)\s+from\s*['"]([^'"]+)['"]\s*;?\s*$/gm
  let m
  while ((m = importRe.exec(code)) !== null) {
    if (IMAGE_EXT_RE.test(m[2])) importedImages.add(m[1])
  }
  if (importedImages.size === 0) return code

  // 2) 改写 props.X -> props.X || X（仅本地已导入的 X）
  let result = code
  for (const varName of importedImages) {
    const re = new RegExp(`props\\.${varName}\\b(?!\\s*\\|\\|\\s*${varName}\\b)`, 'g')
    result = result.replace(re, `props.${varName} || ${varName}`)
  }
  return result
}

export function resolveResourceDomMapping(resourceDomMapping, outputPath) {
  if (Array.isArray(resourceDomMapping) && resourceDomMapping.length > 0) {
    return resourceDomMapping
  }
  if (outputPath) {
    try {
      const mappingPath = join(outputPath, '.mc-gen', 'resource-dom-mapping.json')
      if (existsSync(mappingPath)) {
        const m = JSON.parse(readFileSync(mappingPath, 'utf-8'))
        if (Array.isArray(m) && m.length > 0) {
          return m
        }
      }
    } catch (e) {
      // 非阻断
    }
  }
  return null
}

/**
 * 递归收集目录下所有 .vue 文件绝对路径。
 */
function collectVueFiles(dir, acc = []) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return acc
  }
  for (const e of entries) {
    const p = join(dir, e.name)
    if (e.isDirectory()) {
      collectVueFiles(p, acc)
    } else if (e.isFile() && e.name.endsWith('.vue')) {
      acc.push(p)
    }
  }
  return acc
}

/**
 * refiner 写盘后资源 import 复核（核心防护）：
 * 遍历 outputRoot 下所有 .vue 文件，对仍在引用资源变量但缺失 import 的文件，幂等重注入。
 *
 * @param {string} outputRoot 组件输出目录（磁盘绝对路径）
 * @param {Array|null} resourceDomMapping in-memory 映射（可能为 null/空）
 * @param {'microcode'|'vue3'} target 目标类型
 * @param {object} [opts] { logger }
 * @returns {{ checked:number, fixed:string[], skipped?:boolean }}
 */
export async function ensureResourceImportsInWorkspace(outputRoot, resourceDomMapping, target = 'microcode', opts = {}) {
  const logger = opts.logger || null
  if (!outputRoot || !existsSync(outputRoot)) {
    return { checked: 0, fixed: [], skipped: true }
  }

  const mapping = resolveResourceDomMapping(resourceDomMapping, outputRoot)
  if (!mapping || mapping.length === 0) {
    logger?.warn?.('⚠️ refiner后资源import复核：映射为空（内存与磁盘 .mc-gen/resource-dom-mapping.json 均无），跳过', {
      outputRoot
    })
    return { checked: 0, fixed: [], skipped: true }
  }

  const vueFiles = collectVueFiles(outputRoot)
  const fixed = []

  for (const absPath of vueFiles) {
    const relPath = absPath.slice(outputRoot.length).replace(/^[/\\]/, '').split('\\').join('/')
    const relBase = relPath.startsWith('package/components/')
      ? '../../resources/images/'
      : '../resources/images/'

    let code
    try {
      code = readFileSync(absPath, 'utf-8')
    } catch {
      continue
    }

    let injected
    try {
      injected = target === 'vue3'
        ? injectVue3ResourceUrls(code, mapping, relBase)
        : injectResourceImports(code, mapping, relBase)
    } catch {
      continue
    }

    if (injected !== code) {
      try {
        writeFileSync(absPath, injected, 'utf-8')
        fixed.push(relPath)
        logger?.info?.('refiner后资源import复核：已重注入缺失资源import', { file: relPath, target })
      } catch {
        continue
      }
    }
  }

  if (fixed.length) {
    logger?.info?.('refiner后资源import复核完成', {
      checked: vueFiles.length,
      fixedCount: fixed.length,
      target
    })
  }

  return { checked: vueFiles.length, fixed }
}

/**
 * refiner 后复核的便捷封装：解析映射 + 重注入，整体非阻断（异常只告警不抛）。
 * 供各 refiner 图节点在 refiner.execute 返回后调用。
 */
export async function postRefineResourceImportGuard(outputRoot, inMemoryMapping, target, logger) {
  try {
    return await ensureResourceImportsInWorkspace(outputRoot, inMemoryMapping, target, { logger })
  } catch (e) {
    logger?.warn?.('refiner后资源import复核异常（非阻断）', { error: e.message })
    return { checked: 0, fixed: [], error: e.message }
  }
}

/**
 * 🛡️ CSS url() 路径校验（阶段0-2 新增）。
 *
 * 背景：模型在 <style> 里写 `background-image: url('../resources/images/xxx.png')` 完全靠 prompt 指导，
 * 后处理只修前缀（workspace-css-guard 插件），不校验文件是否真实存在。模型写错文件名 → 预览 404。
 *
 * 本函数扫描 .vue 文件所有 <style> 块内的 url(...)，校验 resources/ 路径对应的文件是否存在。
 * 返回 { valid, errors, warnings }，调用方可选择告警或阻断。
 *
 * @param {string} code .vue 文件内容
 * @param {string} vueFileAbsPath .vue 文件的绝对路径（用于计算 url 相对路径的基准目录）
 * @returns {{ valid: boolean, errors: Array<{url:string, resolvedPath:string, reason:string}>, warnings: string[] }}
 */
export function validateCssResourceUrls(code, vueFileAbsPath) {
  const errors = []
  const warnings = []

  // 提取所有 <style> 块内容（包括 scoped / lang=less 等）
  const stylePattern = /<style[^>]*>([\s\S]*?)<\/style>/g
  let styleMatch
  while ((styleMatch = stylePattern.exec(code)) !== null) {
    const styleContent = styleMatch[1]

    // 匹配 url(...) —— 支持 url('...') / url("...") / url(...)
    const urlPattern = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g
    let urlMatch
    while ((urlMatch = urlPattern.exec(styleContent)) !== null) {
      const rawUrl = urlMatch[2].trim()

      // 跳过：外部 URL（http/https）、data URI、CSS 变量引用、纯颜色函数
      if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://') ||
          rawUrl.startsWith('data:') || rawUrl.startsWith('#') ||
          rawUrl.startsWith('var(') || rawUrl.startsWith('linear-gradient') ||
          rawUrl.startsWith('radial-gradient')) {
        continue
      }

      // 只校验 resources/ 路径（业务资源引用）
      if (!rawUrl.includes('resources/')) continue

      // 计算绝对路径：vue 文件所在目录 + url 相对路径
      const vueFileDir = join(vueFileAbsPath, '..')
      const resolvedPath = join(vueFileDir, rawUrl)

      if (!existsSync(resolvedPath)) {
        errors.push({
          url: rawUrl,
          resolvedPath,
          reason: `CSS url() 引用的资源文件不存在: ${rawUrl} (解析为 ${resolvedPath})`
        })
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings }
}

/**
 * 🛡️ 工作区级 CSS url() 校验：遍历 outputRoot 下所有 .vue 文件，校验 CSS 资源路径。
 *
 * @param {string} outputRoot 组件输出目录
 * @param {object} [opts] { logger, failOnMissing: boolean }
 * @returns {{ checked: number, errors: Array, warnings: string[] }}
 */
export function validateCssUrlsInWorkspace(outputRoot, opts = {}) {
  const { logger = null, failOnMissing = false } = opts
  if (!outputRoot || !existsSync(outputRoot)) {
    return { checked: 0, errors: [], warnings: ['outputRoot 不存在，跳过校验'] }
  }

  const vueFiles = collectVueFiles(outputRoot)
  const allErrors = []
  const allWarnings = []

  for (const absPath of vueFiles) {
    const relPath = absPath.slice(outputRoot.length).replace(/^[/\\]/, '').split('\\').join('/')
    let code
    try {
      code = readFileSync(absPath, 'utf-8')
    } catch {
      continue
    }

    const result = validateCssResourceUrls(code, absPath)
    if (!result.valid) {
      for (const err of result.errors) {
        allErrors.push({ file: relPath, ...err })
        logger?.warn?.('⚠️ CSS url() 资源路径错误', { file: relPath, url: err.url, resolvedPath: err.resolvedPath })
      }
    }
    allWarnings.push(...result.warnings)
  }

  if (allErrors.length > 0) {
    const msg = `CSS url() 校验发现 ${allErrors.length} 个资源路径错误`
    if (failOnMissing) {
      logger?.error?.(`❌ ${msg}`, { errors: allErrors })
    } else {
      logger?.warn?.(`⚠️ ${msg}（非阻断，仅告警）`, { errors: allErrors })
    }
  }

  return { checked: vueFiles.length, errors: allErrors, warnings: allWarnings }
}

/**
 * 🛡️ P0-4（2026-08-29）：资源「是否已使用」的**单一事实源**判定。
 *
 * 旧口径三处缺陷（mc-max-1788056145870-6e65dc88 实锤）：
 *  1) **只扫 .vue** —— 模型把背景写进 common.less（url(../images/bg-7890.png)）时，
 *     挂载器与校验器双双判「未使用」→ 触发兜底挂载，把同一张图二次挂到 base-panel
 *     宿主外壳，出现 Figma/UI 上根本不存在的大背景。
 *  2) **只认变量名**（bg2）—— .less 里的 url() 只有文件名、没有变量，必漏判。
 *  3) 挂载器（microcode-engineer）与校验器（resource-attribution-validator）各实现一份，
 *     口径漂移即产生「挂载器说已用 / 校验器说未用」的矛盾判定。
 *
 * 新口径（任一命中即算已使用）：
 *  a) assignedVarName 或 semanticVarName 在任一**产物代码文件**中出现（词边界）
 *  b) 资源文件名（如 bg-7890.png）在任一产物代码文件中出现（覆盖 .less 的 url() 直引）
 * 判定前统一剥离 import 声明行——纯 import 不算真实使用。
 *
 * 使用方式：先 buildResourceUsageCorpus(files) 建一次语料，再对每条映射
 * isResourceUsedInCorpus(corpus, m)，避免在 N×M 循环里反复拼字符串。
 */

/** 参与「资源使用」判定的产物文件扩展名（旧口径只有 .vue） */
const RESOURCE_USAGE_FILE_RE = /\.(vue|less|css|scss|sass)$/i;

/** import 声明行（含解构 / 默认 / 命名空间 / 副作用导入），判定前剥离 */
const IMPORT_STMT_LINE_RE =
  /^[ \t]*(?:import\s+(?:[\w$]+|\*\s+as\s+[\w$]+|\{[^}]*\}|[\w$]+\s*,\s*\{[^}]*\})\s+from\s*)?['"][^'"]*['"][ \t]*;?[ \t]*$/gm;

/**
 * 「常量级隐藏」属性片段（只认写死的隐藏写法）。
 *
 * ⚠️ 刻意不匹配 class 属性里的 `hidden` 类名：那是样式层控制、可能由 JS 切换为可见，
 *    一刀切删除会把「条件显示」的合法用法误杀。
 */
const HIDDEN_ATTR_SRC = String.raw`(?:display\s*:\s*['"]?\s*none|visibility\s*:\s*['"]?\s*hidden|v-show\s*=\s*['"]?false)`;

/**
 * 隐藏的**成对**标签（含内部内容）：`<div v-show="false">…</div>`
 *
 * ⚠️ 必须以「隐藏属性」为正则锚点，**不能**写成「匹配任意标签 + 回调里判属性」：
 * 那样最外层的非隐藏标签（如 `<template>`）会先被匹配，正则 lastIndex 直接跳过整段，
 * 嵌套在内部的隐藏标签永远等不到匹配机会——实测 `<template><div v-show="false">…</div></template>`
 * 只会删掉 `<div v-show="false">` 开标签，里面的 `<img>` 原样保留，假绑定照样逃逸。
 */
const HIDDEN_PAIR_RE = new RegExp(
  String.raw`<([a-zA-Z][\w-]*)\b([^>]*${HIDDEN_ATTR_SRC}[^>]*)>([\s\S]*?)<\/\1\s*>`,
  'gi',
);

/** 隐藏的**单标签 / 自闭合**标签：`<img :src="icon1" style="display:none" />` */
const HIDDEN_SINGLE_RE = new RegExp(
  String.raw`<([a-zA-Z][\w-]*)\b([^>]*${HIDDEN_ATTR_SRC}[^>]*)\/?>`,
  'gi',
);

/**
 * 🛡️ 缺口②（2026-09-01）：清洗资源使用语料，剔除「假绑定」与注释引用。
 *
 * 实证 mc-max-1788186816558-fb3a1a7b（last-good = r-4e644c37）：
 * 入口 package/index.vue 写 `<img :src="icon1" style="display:none" alt="" />` ——
 * 变量名确实出现在代码中，RES-UNUSED 判定因此认定「已使用」，但该图标**永远不渲染**，
 * 纯属用隐藏元素充数规避门禁（同一 revision 里 5 张 bg 倒是真·未使用，两者都被放过）。
 *
 * 处理策略（在语料层一次性完成，所有基于 corpus 的判定自动生效，不新增并行实现）：
 *  ① 删除不可见元素（display:none / visibility:hidden / v-show="false"）的整个标签及内容；
 *  ② 删除 HTML 注释与 CSS/LESS 块注释（注释里的引用同样不算「真的用上」）。
 *
 * ⚠️ 不处理 `//` 行注释：会误伤 `http://` 之类的 URL 文本。
 *
 * @param {string} code 原始拼接语料
 * @returns {string} 清洗后语料
 */
function sanitizeUsageCorpus(code) {
  if (!code || typeof code !== 'string') return code;
  let out = code;

  // ①-a 隐藏的成对标签（连同内部内容一起删）
  out = out.replace(HIDDEN_PAIR_RE, '');
  // ①-b 隐藏的单标签 / 自闭合标签
  out = out.replace(HIDDEN_SINGLE_RE, '');

  // ② 注释：HTML 注释 + CSS/LESS 块注释
  out = out.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

  return out;
}

/**
 * 构建资源使用判定语料（已剥离不可见元素、注释与 import 声明行）
 * @param {Record<string,string>} files 产物 path → content
 * @returns {string}
 */
export function buildResourceUsageCorpus(files) {
  if (!files || typeof files !== 'object') return '';
  let raw = '';
  for (const [p, c] of Object.entries(files)) {
    if (typeof p !== 'string' || typeof c !== 'string') continue;
    if (!RESOURCE_USAGE_FILE_RE.test(p)) continue;
    raw += `${c}\n`;
  }
  return sanitizeUsageCorpus(raw.replace(IMPORT_STMT_LINE_RE, ''));
}

/**
 * 判断单条资源映射是否已在产物中被真实使用
 * @param {string} corpus buildResourceUsageCorpus 的输出
 * @param {object} m resourceDomMapping 单条
 * @returns {boolean}
 */
export function isResourceUsedInCorpus(corpus, m) {
  if (!corpus || typeof corpus !== 'string' || !m) return false;

  const names = [m.assignedVarName, m.semanticVarName].filter(
    (n) => typeof n === 'string' && n.length > 0,
  );
  for (const n of names) {
    const esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${esc}\\b`).test(corpus)) return true;
  }

  // 文件名级兜底：覆盖 .less/.css 中的 url(../images/bg-7890.png) 直引
  const file = String(m.resourceFile || m.name || '')
    .split(/[\\/]/)
    .pop();
  if (file && file.length > 0 && corpus.includes(file)) return true;

  return false;
}

/**
 * 🛡️ 修复 B（运行库 import 兜底，2026-09-02）：幂等补齐 vue / echarts 运行库 import。
 *
 * 背景：资源 import 去重正则曾跨行吞噬紧随其后的 vue/echarts import（1.2 已修根因），
 * 但 fixedFiles 覆写等路径仍可能在终态落盘前丢掉运行库 import → 预览报 `echarts is not defined`。
 * 本函数作为终态落盘前的最后一道纯函数兜底：只补缺失的 import、绝不删已有内容（幂等，零回归）。
 *
 * @param {string} content .vue 文件内容
 * @returns {string} 补齐 import 后的内容（无需补齐时原样返回，引用相等）
 */
export function ensureRuntimeLibraryImports(content) {
  if (typeof content !== 'string' || !content.includes('<script')) return content;
  const body = content;
  const hasEcharts =
    /\becharts\s*\.\s*(init|setOption|dispose)/.test(body) ||
    /\becharts\.init\(/.test(body);
  const usedVue = new Set();
  for (const n of [
    'ref',
    'reactive',
    'computed',
    'watch',
    'onMounted',
    'onUnmounted',
    'nextTick',
    'onBeforeUnmount',
  ]) {
    if (new RegExp(`\\b${n}\\s*\\(`).test(body)) usedVue.add(n);
  }
  const missingEcharts =
    hasEcharts && !/import\s+\*\s+as\s+echarts\s+from\s*['"]echarts['"]/.test(body);
  const existingVue = new Set();
  for (const m of body.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]vue['"]/g)) {
    for (const s of m[1].split(',')) existingVue.add(s.trim());
  }
  const missingVue = [...usedVue].filter((n) => !existingVue.has(n));
  if (!missingEcharts && missingVue.length === 0) return content;
  const lines = [];
  if (missingEcharts) lines.push(`import * as echarts from 'echarts'`);
  if (missingVue.length > 0) lines.push(`import { ${missingVue.join(', ')} } from 'vue'`);
  const inject = '\n' + lines.join('\n') + '\n';
  return body.replace(/<script\s+setup[^>]*>/, (m) => m + inject);
}

export default {
  injectResourceImports,
  injectVue3ResourceUrls,
  resolveResourceDomMapping,
  extractResourceVarNames,
  healPropImageFallbacks,
  ensureResourceImportsInWorkspace,
  postRefineResourceImportGuard,
  validateCssResourceUrls,
  validateCssUrlsInWorkspace,
  buildResourceUsageCorpus,
  isResourceUsedInCorpus,
  ensureRuntimeLibraryImports,
}
