/**
 * Less 变量完整性检查器
 * 检测并自动添加缺失的 Less 变量到 .common()
 *
 * 问题：AI 生成代码时使用了未定义的 Less 变量，导致编译报错
 * 解决：自动扫描所有 .vue/.less 文件中使用的变量，对比 .common() 定义，自动添加缺失的变量
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join, extname } from 'path'
import { createLogger } from '../logger/index.js'
import { safeLessVarValue } from '../roles/microcode/file-writer.js'
import { collectColorFnVars } from '../utils/less-color-funcs.js'
import {
  isCommonColorConflictVar,
  FRAMEWORK_PRESET_NAMES,
  healFileLevelSlotOverrides,
} from '../utils/theme-color-guard.js'

const logger = createLogger({ name: 'less-variable-checker' })

/** 框架预设变量名集合（cssVariableConfig 的 key 同源；这类变量必须「透传映射」而非落真值） */
const PRESET_VAR_NAMES = new Set(FRAMEWORK_PRESET_NAMES)

export class LessVariableChecker {
  /**
   * 检查并修复 Less 变量
   * @param {string} componentDir - 组件目录路径
   * @returns {object} 检查结果
   */
  static async check(componentDir) {
    logger.info('开始检查 Less 变量', { componentDir })

    try {
      const result = {
        usedVariables: new Set(),
        definedVariables: new Set(),
        missingVariables: [],
        fixed: false,
        uninferredVariables: [],  // 无法推断真值、用了兜底的变量（结构化告警）
        // 🛡️ 刀 16b：被 LESS 颜色函数（lighten/darken/fade…）当**实参**引用的变量名集合。
        // 这类变量的兜底值必须是「可求值的真颜色」，否则整个 <style> 块编译失败。
        colorFnVariables: new Set(),
        // 🛡️ 2026-09-15：从 .common() 移除的、已被两个主题 mixin 定义的颜色变量名
        healedCommonColorVars: [],
        error: null
      }

      // 1. 扫描所有 .vue 和 .less 文件，收集使用的变量（含颜色函数实参变量）
      this.scanUsedVariables(componentDir, result.usedVariables, result.colorFnVariables)

      // 2. 读取 theme-vars.less 中定义的变量
      // 🛡️ 2026-09-15 治本：改扫**全部 mixin**（.common() + .theme-light() + .theme-dark()）。
      //    历史 bug：只扫 .common() → 把 .theme-light()/.theme-dark() 已有的颜色变量
      //    当「缺失」补进 .common() → LESS 的 mixin 变量**不覆盖 caller 作用域已有同名变量**，
      //    .common() 抢先定义浅色值后 .theme-dark() 被静默忽略 → .dark/.light 编译结果完全相同
      //    （c-env-monitor-1cffd7ce 实锤：7 处主题色零响应）。
      //    主题 mixin 已定义的变量在 index.less 的 `.theme-light()`/`.theme-dark()` 调用后
      //    即可见，无需补进 .common()。
      const themeVarsPath = join(componentDir, 'resources/styles/themes/theme-vars.less')
      if (existsSync(themeVarsPath)) {
        this.scanAllMixinVariables(themeVarsPath, result.definedVariables)
      }

      // 3. 找出缺失的变量
      result.missingVariables = Array.from(result.usedVariables)
        .filter(v => !result.definedVariables.has(v))

      logger.info('Less 变量扫描完成', {
        usedCount: result.usedVariables.size,
        definedCount: result.definedVariables.size,
        missingCount: result.missingVariables.length
      })

      // 4. 如果有缺失的变量，自动添加到 .common()
      if (result.missingVariables.length > 0 && existsSync(themeVarsPath)) {
        const warnings = []
        this.addMissingVariables(themeVarsPath, result.missingVariables, warnings, result.colorFnVariables)
        result.fixed = true
        result.uninferredVariables = warnings
        logger.info('已自动添加缺失的 Less 变量', {
          count: result.missingVariables.length,
          variables: result.missingVariables,
          uninferred: warnings.length > 0 ? warnings : undefined
        })
      }

      // 5. 确保 .common() 被调用：如果 .common() 中定义了 Less 变量，
      //    必须在顶层调用 .common(); 才能将变量暴露到全局作用域。
      if (existsSync(themeVarsPath) && this.shouldCallCommonMixin(themeVarsPath) && !this.hasTopLevelCommonCall(themeVarsPath)) {
        this.addCommonMixinCall(themeVarsPath)
        result.fixed = true
        logger.info('已自动在 theme-vars.less 顶层添加 .common() 调用')
      }

      // 6. 🛡️ 2026-09-15 确定性自愈；🛡️ 2026-10-09 放宽前置条件（单侧/双侧缺失都先补写再删）。
      //    否则 LESS mixin 变量不覆盖 caller 同名变量 → .theme-dark() 被静默忽略 → 切主题零生效。
      if (existsSync(themeVarsPath)) {
        const healed = this.healCommonColorVars(themeVarsPath)
        if (healed.removed > 0) {
          result.fixed = true
          result.healedCommonColorVars = healed.names
          result.injectedCommonColorVars = healed.injected
          logger.info('已把 .common() 里的颜色变量迁入主题 mixin', {
            removed: healed.removed,
            variables: healed.names,
            injected: healed.injected,
          })
        }
      }

      // 7. 🛡️ 2026-09-16 确定性自愈：删除 common.less / .vue <style> 顶层对 @color-* / @shadow-* 的
      //    【字面量】重声明。否则 LESS「首个定义者胜出」→ 主题 mixin 被静默忽略 → 切主题零生效
      //    （实测 c-vehicle-monitor-326051b2：仅 2 行就让整套差异化失效）。自愈与门禁同源互逆，
      //    删后磁盘文件干净，构建期 .dark/.light 才真分开。
      {
        const healedSlots = this.healFileLevelSlotOverrides(componentDir)
        if (healedSlots.removed > 0) {
          result.fixed = true
          result.healedFileLevelSlotOverrides = healedSlots
          logger.info('已删除文件级槽位字面量重声明', {
            count: healedSlots.removed,
            files: healedSlots.files.map(f => f.split('/').slice(-3).join('/')),
          })
        }
      }

      return result

    } catch (error) {
      logger.error('Less 变量检查失败', { error: error.message })
      return {
        usedVariables: new Set(),
        definedVariables: new Set(),
        missingVariables: [],
        fixed: false,
        uninferredVariables: [],
        colorFnVariables: new Set(),
        error: error.message
      }
    }
  }

  /**
   * 扫描目录中所有文件，收集使用的 Less 变量
   * @param {string} dir
   * @param {Set<string>} usedVariables 所有被引用的变量名
   * @param {Set<string>} [colorFnVariables] 被 LESS 颜色函数当实参引用的变量名（刀 16b）
   */
  static scanUsedVariables(dir, usedVariables, colorFnVariables) {
    try {
      const files = readdirSync(dir)

      for (const file of files) {
        const filePath = join(dir, file)
        const stat = statSync(filePath)

        if (stat.isDirectory()) {
          // 递归扫描子目录
          this.scanUsedVariables(filePath, usedVariables, colorFnVariables)
        } else if (stat.isFile()) {
          const ext = extname(file)
          // 只处理 .vue 和 .less 文件
          if (ext === '.vue' || ext === '.less') {
            this.extractVariablesFromFile(filePath, usedVariables, colorFnVariables)
          }
        }
      }
    } catch (error) {
      logger.error('扫描文件失败', { dir, error: error.message })
    }
  }

  /**
   * 从文件中提取使用的 Less 变量
   * @param {string} filePath
   * @param {Set<string>} usedVariables
   * @param {Set<string>} [colorFnVariables] 被 LESS 颜色函数当实参引用的变量名（刀 16b）
   */
  static extractVariablesFromFile(filePath, usedVariables, colorFnVariables) {
    try {
      const content = readFileSync(filePath, 'utf-8')
      const sources = extname(filePath) === '.vue'
        ? Array.from(content.matchAll(/<style\b[^>]*\blang\s*=\s*["']less["'][^>]*>([\s\S]*?)<\/style>/gi), match => match[1] || '')
        : [content]

      // Vue 文件只扫描 <style lang="less">，禁止把模板事件 @click/@change 误判为 LESS 变量。
      const variablePattern = /@([a-zA-Z0-9_-]+)/g
      for (const source of sources) {
        let match
        while ((match = variablePattern.exec(source)) !== null) {
          const variable = match[1]
          if (this.isValidLessVariable(variable)) {
            usedVariables.add(variable)
          }
        }
        variablePattern.lastIndex = 0

        // 🛡️ 刀 16b：同一份样式文本里，收集出现在颜色函数实参位置的变量
        // （`lighten(@x, 10%)`）—— 这些变量的兜底值必须是可求值真颜色。
        if (colorFnVariables) {
          for (const v of collectColorFnVars(source)) colorFnVariables.add(v)
        }
      }
    } catch (error) {
      logger.error('提取变量失败', { filePath, error: error.message })
    }
  }

  /**
   * 验证是否是有效的 Less 变量名
   */
  static isValidLessVariable(variable) {
    // 排除 Less 关键字和特殊指令
    const excludedKeywords = [
      'import', 'media', 'keyframes', 'font-face',
      'charset', 'namespace', 'supports', 'document'
    ]

    if (excludedKeywords.includes(variable)) {
      return false
    }

    // 排除看起来像选择器或属性的
    if (variable.includes(':') || variable.includes('.')) {
      return false
    }

    return true
  }

  /**
   * 扫描 theme-vars.less 中**所有 mixin 块**（.common() / .theme-light() / .theme-dark() …）
   * 定义的变量名集合。
   *
   * 🛡️ 2026-09-15：与 scanDefinedVariables（仅 .common()）的区别 ——
   * 本方法用于「判断某变量是否已可见」，主题 mixin 里的变量在 index.less 调用
   * `.theme-light()`/`.theme-dark()` 之后同样可见，因此**不应**被当成缺失补进 .common()。
   * （补进去会让 .common() 抢先定义，theme mixin 的覆盖被 LESS 静默忽略。）
   */
  static scanAllMixinVariables(themeVarsPath, definedVariables) {
    try {
      const content = readFileSync(themeVarsPath, 'utf-8')
      const vars = this.extractAllMixinVars(content)
      for (const name of vars.keys()) definedVariables.add(name)
    } catch (error) {
      logger.error('扫描全部 mixin 变量失败', { themeVarsPath, error: error.message })
    }
  }

  /**
   * 扫描 theme-vars.less 的 .common() 中定义的变量。
   * ⚠️ 只限 .common() 作用域 —— 用于判断「顶层是否需要 .common(); 调用暴露变量」。
   */
  static scanDefinedVariables(themeVarsPath, definedVariables) {
    try {
      const content = readFileSync(themeVarsPath, 'utf-8')

      // 只匹配 .common() { ... } 块内的变量定义
      const commonMatch = content.match(/\.common\s*\(\s*\)\s*\{([^}]*)\}/)
      if (!commonMatch) return;

      const blockContent = commonMatch[1];
      const definePattern = /@([a-zA-Z0-9_-]+)\s*:/g
      let match

      while ((match = definePattern.exec(blockContent)) !== null) {
        definedVariables.add(match[1])
      }
    } catch (error) {
      logger.error('扫描定义变量失败', { themeVarsPath, error: error.message })
    }
  }

  /**
   * 从 theme-vars.less 的所有 mixin 块中提取已定义的变量值。
   * 覆盖 .common() /.theme-light() /.theme-dark() 等所有 .xxx() { } 块。
   * 优先级：首次出现（即 .common() 优先于 light/dark）
   * @param {string} content theme-vars.less 文件内容
   * @returns {Map<string, string>} variableName → value
   */
  static extractAllMixinVars(content) {
    const vars = new Map();
    const mixinBlockRe = /\.[a-zA-Z0-9_-]+\(\)\s*\{([^}]*)\}/g;
    let match;
    while ((match = mixinBlockRe.exec(content)) !== null) {
      const blockContent = match[1];
      const varRe = /@([a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g;
      let vmatch;
      while ((vmatch = varRe.exec(blockContent)) !== null) {
        const name = vmatch[1];
        const value = vmatch[2].trim();
        if (!vars.has(name)) {
          vars.set(name, value);
        }
      }
    }
    return vars;
  }

  /**
   * 添加缺失的变量到 theme-vars.less 的 .common()。
   * 值推断优先级：
   *   1. 从同文件的 .theme-light() / .theme-dark() 等 mixin 复制已有真值
   *   2. 按变量名语义猜测（safeLessVarValue）
   *   3. 以上均不可得时用 'unset'（比 inherit 更安全——inherit 在某些属性上会导致
   *      不可见/崩溃，unset 回退到浏览器默认行为）
   * @param {string} themeVarsPath theme-vars.less 路径
   * @param {string[]} missingVariables 缺失的变量名列表
   * @param {string[]} [warnings] 无法推断含义、用了兜底值的变量名清单（用于结构化告警）
   * @param {Set<string>} [colorFnVariables] 被 LESS 颜色函数当实参引用的变量名（刀 16b）
   * @returns {string[]} 无法推断含义、用了兜底值的变量名清单（用于结构化告警）
   */
  static addMissingVariables(themeVarsPath, missingVariables, warnings = [], colorFnVariables = new Set()) {
    let content
    try {
      content = readFileSync(themeVarsPath, 'utf-8')
    } catch (e) {
      logger.error('读取 theme-vars.less 失败', { themeVarsPath, error: e.message })
      return
    }

    // 提取当前 theme-vars.less 中已有的变量值（包括 light/dark mixin 中的）
    const existingVars = this.extractAllMixinVars(content)

    const commonPattern = /\.common\s*\(\s*\)\s*\{([^}]*)\}/
    // 🛡️ 2026-09-15 治本：颜色类变量**禁止**补进 .common()。
    //    LESS 的 mixin 变量不覆盖 caller 作用域已有同名变量 —— .common() 一旦抢先定义
    //    @colorX，随后的 .theme-dark() / .theme-light() 会被静默忽略 → 两主题编译结果
    //    完全相同 → 切主题零生效（c-env-monitor-1cffd7ce 实锤）。
    //    故：颜色类 → 补进两个主题 mixin；非颜色类（字号/圆角）→ 才进 .common()。
    const isColourVar = (name) => /color|bg|background|border|fill|stroke/i.test(name)

    const renderVarLine = (v) => {
      // 优先级 1：从同文件的 sibling mixin（theme-light/theme-dark）复制真值
      if (existingVars.has(v)) {
        const value = existingVars.get(v)
        // 颜色变量必须用真实颜色（#/rgba），否则 lighten()/darken()/fade() 无法求值。
        return `  @${v}: ${value}; // 自动添加（从 theme mixin 复制）`
      }
      // 优先级 2：按变量名语义猜测
      const usesColorFn = colorFnVariables.has(v)
      const guess = safeLessVarValue(`@${v}`, { usedByColorFn: usesColorFn })
      if (guess !== 'unset') {
        if (usesColorFn) {
          warnings.push(v)
          return `  @${v}: ${guess}; // ⚠️ 自动添加（颜色函数实参，兜底中立色，请核对真值）`
        }
        return `  @${v}: ${guess}; // 自动添加（语义推断）`
      }
      // 优先级 3：无法推断——记录结构化告警
      warnings.push(v)
      return `  @${v}: unset; // ⚠️ 自动添加（无真值源，请人工修正）`
    }

    // 🛡️ 2026-09-16：框架预设名（= cssVariableConfig 的 key，如 colorTextBase/colorPrimary）
    //    必须走**透传映射** `@key: var(--key);` 进 .common() —— 这是 css-variable-pattern.md
    //    的规范形态（「.common() mixin 中映射了所有 cssVariableConfig 的 key」）。
    //    若落成真值（@colorPrimary: #559EFF）会丢掉运行期 CSS 变量响应，属反模式。
    const isPresetVar = (v) => PRESET_VAR_NAMES.has(v)
    const presetVarNames = missingVariables.filter(isPresetVar)
    const colourVarNames = missingVariables.filter((v) => !isPresetVar(v) && isColourVar(v))
    const otherVarNames = missingVariables.filter((v) => !isPresetVar(v) && !isColourVar(v))

    const presetLines = presetVarNames
      .map((v) => `  @${v}: var(--${v}); // 自动添加（框架预设透传映射，规范形态）`)
      .join('\n')
    const newVariables = [presetLines, otherVarNames.map(renderVarLine).join('\n')]
      .filter(Boolean)
      .join('\n')
    const themeVarLines = colourVarNames.map(renderVarLine).join('\n')

    try {
      // ── 非颜色变量 → .common()（字号/圆角等跨主题共享令牌）──
      if (newVariables) {
        const commonPattern = /\.common\s*\(\s*\)\s*\{([^}]*)\}/
        if (commonPattern.test(content)) {
          content = content.replace(commonPattern, (match, innerContent) => {
            return `.common() {\n${innerContent.trim()}\n${newVariables}\n}`
          })
        } else {
          content += `\n\n.common() {\n${newVariables}\n}\n`
        }
      }

      // ── 颜色变量 → 两个主题 mixin（禁止进 .common()，否则挡住主题覆盖）──
      if (themeVarLines) {
        for (const mixinName of ['theme-light', 'theme-dark']) {
          content = this.appendToMixin(content, mixinName, themeVarLines)
        }
      }

      writeFileSync(themeVarsPath, content, 'utf-8')
      logger.info('已更新 theme-vars.less')

    } catch (error) {
      logger.error('添加变量失败', { themeVarsPath, error: error.message })
      throw error
    }
  }

  /**
   * 向指定 mixin 块追加变量声明行（不存在则创建该 mixin）。
   * @param {string} content theme-vars.less 内容
   * @param {string} mixinName 如 'theme-light'
   * @param {string} lines 变量声明行（已含缩进）
   * @returns {string}
   */
  static appendToMixin(content, mixinName, lines) {
    const re = new RegExp(`\\.${mixinName}\\s*\\(\\s*\\)\\s*\\{([^}]*)\\}`)
    if (re.test(content)) {
      return content.replace(re, (m, inner) =>
        `.${mixinName}() {\n${String(inner).trim()}\n${lines}\n}`,
      )
    }
    return content + `\n\n.${mixinName}() {\n${lines}\n}\n`
  }

  /**
   * 提取指定 mixin 块内声明的变量名集合。
   * @param {string} content theme-vars.less 内容
   * @param {string} mixinName 如 'theme-light'
   * @returns {Set<string>}
   */
  static mixinVarNames(content, mixinName) {
    // ⚠️ 必须用 [^}]*（mixin 块内无嵌套）。用 [\s\S]*?\n\s*\} 会在 .common() 写成单行
    // `{ ... }` 时跨块匹配到下一个 mixin 的右括号，误判变量归属并破坏文件结构。
    const re = new RegExp(`\\.${mixinName}\\s*\\(\\s*\\)\\s*\\{([^}]*)\\}`)
    const m = String(content).match(re)
    if (!m) return new Set()
    const names = new Set()
    const vr = /@([a-zA-Z0-9_-]+)\s*:/g
    let x
    while ((x = vr.exec(m[1])) !== null) names.add(x[1])
    return names
  }

  /**
   * 🛡️ 2026-09-15 确定性自愈；🛡️ 2026-10-09 **放宽前置条件**（覆盖「单侧/双侧缺失」形态）。
   *
   * 根因：LESS 的 mixin 变量**不覆盖** caller 作用域已存在的同名变量。
   * index.less / dark.less / light.less 都是 `.common(); .theme-X();` 顺序调用，
   * 故 `.common()` 里的 @colorX 会让随后 `.theme-light()`/`.theme-dark()` 的同名定义
   * 被静默忽略 → `.dark`/`.light` 编译结果完全相同 → 切主题零生效。
   *
   * 旧版只在「light 与 dark **都**已定义」时才删（怕删出未定义变量导致编译失败）→
   * 「颜色只写在 .common()、主题 mixin 里根本没有」的形态永远清不掉
   * （实锤 c-traffic-monitor-140cbd45 的 @color-error / @color-predict-line / @color-truck-value），
   * 门禁常年 WARN、切主题零生效却无人修。
   *
   * 现版改为 **先补写再删**：该颜色在某主题 mixin 里缺失时，先按 `.common()` 的原值补进去，
   * 再从 `.common()` 移除。既保证不产生未定义变量（可编译、颜色外观逐字不变），
   * 又让颜色回到「主题 mixin 定义」的正确归属 —— 后续精修 / 深浅派生才有作用点。
   *
   * 判据复用 `isCommonColorConflictVar`（与门禁 THEME-COMMON-COLOR-VAR、生成器
   * style-tokens#renderMicrocodeThemeVarsLess **同源**，不写正则副本）；
   * 几何/字号令牌（@border-radius-base 等）与 `var()` 透传令牌一律保留。
   *
   * @param {string} themeVarsPath
   * @returns {{removed:number, names:string[], injected:string[]}}
   */
  static healCommonColorVars(themeVarsPath) {
    const EMPTY = { removed: 0, names: [], injected: [] }
    let content
    try {
      content = readFileSync(themeVarsPath, 'utf-8')
    } catch (e) {
      return EMPTY
    }
    // ⚠️ [^}]* 而非 [\s\S]*?\n\s*\}：后者在 .common() 为单行时跨块误匹配（见 mixinVarNames 注释）
    const commonM = content.match(/\.common\s*\(\s*\)\s*\{([^}]*)\}/)
    if (!commonM) return EMPTY

    const lightVars = this.mixinVarNames(content, 'theme-light')
    const darkVars = this.mixinVarNames(content, 'theme-dark')
    // 两个主题 mixin 都不存在 → 无从补写，保守不动（fail-open，不制造未定义变量）
    if (lightVars.size === 0 && darkVars.size === 0) return EMPTY

    const kept = []
    const names = []
    const toInject = { 'theme-light': [], 'theme-dark': [] }
    for (const line of commonM[1].split('\n')) {
      const m = line.match(/@([a-zA-Z0-9_-]+)\s*:\s*([^;]+);/)
      if (m && isCommonColorConflictVar(m[1], m[2])) {
        names.push(m[1])
        const pair = { name: m[1], value: m[2].trim() }
        if (!lightVars.has(m[1])) toInject['theme-light'].push(pair)
        if (!darkVars.has(m[1])) toInject['theme-dark'].push(pair)
        continue
      }
      kept.push(line)
    }
    if (names.length === 0) return EMPTY

    const inner = kept.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '')
    let next = content.replace(commonM[0], `.common() {${inner}\n}`)

    // 先把缺失的颜色补进对应主题 mixin（闭括号前插入），再一次性落盘 —— 不留中间态
    const injected = []
    for (const mixinName of ['theme-light', 'theme-dark']) {
      const list = toInject[mixinName]
      if (!list.length) continue
      next = this.appendVarsToMixin(next, mixinName, list)
      injected.push(...list.map((v) => `@${v.name}→.${mixinName}()`))
    }

    try {
      writeFileSync(themeVarsPath, next, 'utf-8')
    } catch (e) {
      logger.error('清除 .common() 颜色变量失败', { themeVarsPath, error: e.message })
      return EMPTY
    }
    return { removed: names.length, names, injected }
  }

  /**
   * 在指定 mixin 的闭括号前追加 `@name: value;` 行（找不到该 mixin 时原样返回）。
   *
   * ⚠️ 同 `mixinVarNames`：用 `[^}]*` 匹配块体，避免单行 mixin 时跨块误伤。
   * ⚠️ 只匹配**定义形态**（`.theme-x() {`）—— 调用形态 `.theme-x();` 后面没有 `{`，不会命中。
   *
   * @param {string} content
   * @param {string} mixinName 不含点号，如 'theme-light'
   * @param {Array<{name:string, value:string}>} pairs
   * @returns {string}
   */
  static appendVarsToMixin(content, mixinName, pairs) {
    const re = new RegExp(`(\\.${mixinName}\\s*\\(\\s*\\)\\s*\\{)([^}]*)(\\})`)
    return String(content).replace(re, (all, head, body, tail) => {
      const trimmed = body.replace(/\s+$/, '')
      const add = pairs
        .map((p) => `\n  @${p.name}: ${p.value}; // 自愈：从 .common() 迁出`)
        .join('')
      return `${head}${trimmed}${add}\n${tail}`
    })
  }

  /**
   * 🛡️ 2026-09-16 确定性自愈（磁盘版）：读取组件目录下 common.less 与全部 .vue，
   * 删除文件级槽位（@color-*、@shadow-*）字面量重声明，写回干净文件。
   *
   * 复用 theme-color-guard.healFileLevelSlotOverrides（与门禁 THEME-SLOT-LOCAL-OVERRIDE 同源互逆）。
   * 仅对确实变化的文件写盘，避免无谓改动影响构建缓存。
   *
   * @param {string} componentDir
   * @returns {{removed:number, files:string[]}}
   */
  static healFileLevelSlotOverrides(componentDir) {
    const targets = []
    try {
      const commonLess = join(componentDir, 'resources/styles/common.less')
      if (existsSync(commonLess)) targets.push(commonLess)
      // 递归收集所有 .vue 文件
      const walk = (dir) => {
        let entries
        try { entries = readdirSync(dir) } catch (e) { return }
        for (const name of entries) {
          const fp = join(dir, name)
          let st
          try { st = statSync(fp) } catch (e) { continue }
          if (st.isDirectory()) walk(fp)
          else if (st.isFile() && extname(fp) === '.vue') targets.push(fp)
        }
      }
      walk(componentDir)
    } catch (e) {
      logger.error('收集自愈目标文件失败', { componentDir, error: e.message })
    }

    const files = []
    for (const p of targets) {
      try {
        const content = readFileSync(p, 'utf-8')
        files.push({ path: p, content })
      } catch (e) {
        logger.error('读取自愈目标文件失败', { p, error: e.message })
      }
    }
    if (files.length === 0) return { removed: 0, files: [] }

    const healResult = healFileLevelSlotOverrides(files)
    if (!healResult.changed) return { removed: 0, files: [] }

    const changedFiles = []
    for (const f of files) {
      // 仅内容确有变化的写回（path 在磁盘上、content 已被自愈 mutate）
      const onDisk = readFileSync(f.path, 'utf-8')
      if (onDisk !== f.content) {
        try {
          writeFileSync(f.path, f.content, 'utf-8')
          changedFiles.push(f.path)
        } catch (e) {
          logger.error('写回自愈结果失败', { path: f.path, error: e.message })
        }
      }
    }
    return { removed: healResult.removed, files: changedFiles }
  }

  /**
   * 判断 .common() mixin 是否包含 Less 变量定义
   */
  static hasLessVariablesInCommonMixin(themeVarsPath) {
    try {
      const content = readFileSync(themeVarsPath, 'utf-8')
      const commonMatch = content.match(/\.common\s*\(\s*\)\s*\{([^}]*)\}/)
      if (!commonMatch) return false
      return /@[a-zA-Z0-9_-]+\s*:/.test(commonMatch[1])
    } catch (error) {
      logger.error('检查 .common() 变量失败', { themeVarsPath, error: error.message })
      return false
    }
  }

  /**
   * 综合判断：是否需要确保 .common() 被调用
   */
  static shouldCallCommonMixin(themeVarsPath) {
    return this.hasLessVariablesInCommonMixin(themeVarsPath)
  }

  /**
   * 检查 theme-vars.less 顶层是否已调用 .common();
   */
  static hasTopLevelCommonCall(themeVarsPath) {
    try {
      const content = readFileSync(themeVarsPath, 'utf-8')
      // 去除注释后，检查是否有顶层的 .common(); 调用
      const noComments = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
      return /(?:^|\n)\s*\.common\s*\(\s*\)\s*;\s*(?:\n|$)/.test(noComments)
    } catch (error) {
      logger.error('检查 .common() 调用失败', { themeVarsPath, error: error.message })
      return false
    }
  }

  /**
   * 在 theme-vars.less 末尾添加 .common(); 调用
   */
  static addCommonMixinCall(themeVarsPath) {
    try {
      let content = readFileSync(themeVarsPath, 'utf-8')
      content = content.trimEnd() + '\n\n// 自动添加：将 .common() 中的 Less 变量暴露到全局作用域\n.common();\n'
      writeFileSync(themeVarsPath, content, 'utf-8')
      logger.info('已更新 theme-vars.less，添加 .common() 调用')
    } catch (error) {
      logger.error('添加 .common() 调用失败', { themeVarsPath, error: error.message })
      throw error
    }
  }
}

export default LessVariableChecker
