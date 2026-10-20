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
// 🔴 #139（N3 · e7a50be7 实锤）：颜色变量补齐 / 矫正的**真值源**。
//   本 checker 是「语义推断」注释的唯一产出点（L451），也是 LLM 自造颜色变量
//   拿到值的最后一站 —— 真值不接到这里，改 file-writer 的 safeLessVarValue 等于没改。
import {
  buildTruthPalette,
  bucketOfProperty,
  colorFamily,
  familyFromVarName,
  findConsumerProperty,
  narrowTruthCandidates,
} from '../utils/truth-palette.js'
import {
  isCommonColorConflictVar,
  FRAMEWORK_PRESET_NAMES,
  healFileLevelSlotOverrides,
} from '../utils/theme-color-guard.js'
// 🔴 2026-10-13：dark 三核心枚举从生成器同源 import（不写字面量副本 ——
//   「判据直接 import 源头」既有纪律；M4-10 锁的值与生成器共用这一张表）
import { MC_DARK_THEME_COLOR_ENUM_CORE } from '../utils/style-tokens.js'

const logger = createLogger({ name: 'less-variable-checker' })

/** 框架预设变量名集合（cssVariableConfig 的 key 同源；这类变量必须「透传映射」而非落真值） */
const PRESET_VAR_NAMES = new Set(FRAMEWORK_PRESET_NAMES)

/**
 * 🔴🔴 2026-10-12（真机实锤）：**参与 Less 算术运算的预设变量** → 必须落字面量。
 *
 * 背景：`PRESET_VAR_NAMES` 里的变量默认按「透传映射」写成 `@k: var(--k)`，
 *   这对**颜色**是对的（保住运行期 CSS 变量响应，且颜色槽位不参与 Less 运算）；
 *   但对**尺寸**是错的 —— Less 变量只要值是 `var()`，就**无法参与算术运算**，
 *   业务样式写 `@fontSize * 1.5` 时编译报 `Operation on an invalid type`
 *   （真机 `common.less:312`，session mc-max-1791782604925-13f19781）。
 *
 * ⚠️ 本表是**第二道闸**：渲染期 `style-tokens.js#deVarMathLessVars` 已做同样处理，
 *   但本 checker 在其**之后**运行（写盘 → checker 补齐），会把字面量**写回 var()**。
 *   真机日志顺序已证实：`microcode-engineer 文件已写入` → `less-variable-checker 已更新`×2。
 *   两处**字面量必须一致**，否则互相覆盖。
 *   值与 `style-tokens.js#MC_SIZE_LITERAL_DEFAULTS` 保持同源。
 *
 * 🔴🔴 2026-10-12：**`fontSize` 已从本表移除**（与 `style-tokens.js#deVarMathLessVars`
 *   的 `exempt` 同步）。
 *   原因：mc-check M5-6（`mc-check.cjs:1122-1134`）**硬性要求**
 *   `theme-vars.less` 里存在 `@fontSize: var(--fontSize)` 映射声明，正则不接受替代写法。
 *   实测：把官方全绿 demo（`38/0`）的 `@fontSize` 改成 `12px` 立刻掉到 `37/1`：
 *     [M5-6] theme-vars.less 缺少 @fontSize: var(--fontSize) 映射声明
 *   字号倍数运算的正确解法是业务侧写 `calc(@fontSize * N)`（Less 不求值 calc），
 *   而非把变量从 `var()` 改成字面量。
 */
const MATH_OPERAND_VARS = new Map([
  ['lineHeight', '1.5'],
  ['borderRadius', '4px'],
  ['spacing', '4px'],
])

export class LessVariableChecker {
  /**
   * 检查并修复 Less 变量
   * @param {string} componentDir - 组件目录路径
   * @param {{figmaRoot?: object, truthPalette?: object}} [opts]
   *   #139（N3）：node 真值上下文。`figmaRoot` 给 Figma 节点树即自动构建真值色板；
   *   也可直接给已构建的 `truthPalette`。缺省则 fail-open（颜色变量落中性色，绝不编造）。
   * @returns {object} 检查结果
   */
  static async check(componentDir, opts = {}) {
    logger.info('开始检查 Less 变量', { componentDir })

    // 🔴 #139（N3）：真值上下文（色板 + 样式语料）。
    //   `styleText` 用于判定「变量被哪个 CSS 属性消费」→ 决定取哪个真值桶
    //   （box-shadow→发光色、background→底/面板色、color→文字色）。
    //   不传 styleText ⇒ 桶恒为 null ⇒ 全部退化成中性色（比错色好，但真值用不上）。
    const truthCtx = this.buildTruthContext(componentDir, opts)

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
        this.addMissingVariables(
          themeVarsPath,
          result.missingVariables,
          warnings,
          result.colorFnVariables,
          truthCtx,
        )
        result.fixed = true
        result.uninferredVariables = warnings
        logger.info('已自动添加缺失的 Less 变量', {
          count: result.missingVariables.length,
          variables: result.missingVariables,
          uninferred: warnings.length > 0 ? warnings : undefined
        })
      }

      // 4b. 🔴🔴 #139（N3 · e7a50be7 实锤）：「名字说 gold、值是蓝」的**存量**矫正。
      //   事故：`@color-accent-gold: #409EFF` / `@color-accent-mint: #409EFF` 已存在于
      //   theme-vars.less（早前按名猜色的产物，后被 healCommonColorVars 从 .common() 迁出），
      //   `addMissingVariables` **只补缺失** ⇒ 永远不会被碰到 ⇒ 蓝色发光/蓝块长期存在。
      //   本刀按真值收窄后唯一才改写（收窄不到 1 个 = 真值不可判定 ⇒ 不动，交中性兜底逻辑）。
      //   不依赖 figma 真值也能生效（「同文件其它 mixin 同色系值」路径），故不做 truthPalette 前置门。
      if (existsSync(themeVarsPath)) {
        try {
          const healedFabricated = this.healFabricatedColorVarValues(themeVarsPath, truthCtx)
          if (healedFabricated.changed.length > 0) {
            result.fixed = true
            result.healedFabricatedColorVars = healedFabricated.changed
            logger.info('已按 node 真值矫正按名猜色的颜色变量', {
              count: healedFabricated.changed.length,
              changes: healedFabricated.changed,
            })
          }
        } catch (e) {
          logger.warn('⚠️ 颜色变量真值矫正失败（非阻断）', { error: e?.message || e })
        }
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

      // 7. 🔴 2026-10-13 确定性自愈：theme-vars.less 的 .theme-dark() 三核心
      //    必须为 M4-10 枚举值（与 css-vars.js 同口径）。存量产物写盘即收敛。
      if (existsSync(themeVarsPath)) {
        const darkCore = this.healThemeVarsDarkCore(themeVarsPath)
        if (darkCore.fixed) {
          result.fixed = true
          result.healedThemeVarsDarkCore = darkCore.changed
          logger.info('已把 theme-vars.less 的 .theme-dark() 三核心校正为 M4-10 枚举值', {
            changed: darkCore.changed,
          })
        }
      }

      // 8. 🔴🔴 2026-10-13 确定性自愈：根作用域缺槽位补齐（生成失败级——
      //    common.less 引用了仅 dark 定义的槽位 ⇒ 根作用域编译断）。
      if (existsSync(themeVarsPath) && existsSync(join(themeVarsPath, '..', '..', 'common.less'))) {
        const rootSlots = this.healRootScopeMissingSlots(
          themeVarsPath,
          join(themeVarsPath, '..', '..', 'common.less'),
        )
        if (rootSlots.fixed) {
          result.fixed = true
          result.healedRootScopeMissingSlots = rootSlots.injected
          logger.info('已补齐根作用域缺失槽位（common.less 引用但部分主题未定义）', {
            injected: rootSlots.injected,
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
   *
   * 🔴 2026-10-12 治本 B：新增 `brightness` 参数做**明暗分池**。
   *   不传时行为与旧版一致（单池、按出现顺序取第一个）；
   *   传 `'light'` / `'dark'` 时，**只收该明暗的 mixin**（`.common()` 两池都算），
   *   避免「light 排最前 → 其它 mixin 复制到 light 值」导致三套主题同色。
   *
   * @param {string} content theme-vars.less 文件内容
   * @param {'light'|'dark'} [brightness] 明暗池；省略 = 不分池（旧行为）
   * @returns {Map<string, string>} variableName → value
   */
  static extractAllMixinVars(content, brightness = null) {
    const vars = new Map();
    const mixinBlockRe = /\.([a-zA-Z0-9_-]+)\(\)\s*\{([^}]*)\}/g;
    let match;
    while ((match = mixinBlockRe.exec(content)) !== null) {
      const mixinName = match[1];
      // 🔴 明暗过滤：`.common()` 两池共享；其余按 mixin 名判明暗
      if (brightness && mixinName !== 'common') {
        const isDarkMixin = /dark|深色|夜|night/i.test(mixinName);
        if (isDarkMixin !== (brightness === 'dark')) continue;
      }
      const blockContent = match[2];
      // 🔴🔴 2026-10-12 治本 B（关键）：**跳过「推断值」**。
      //   带「自动添加」注释的行是**语义推断**产物（不是 Figma 真值）。
      //   若把它们纳入「已有真值」池，则 light/dark 两池会命中**同一个推断值**
      //   （旧版把 `#ffffff` 同时写进两个 mixin）⇒ 优先级 1「复制」永远复制到
      //   那个错值 ⇒ 明暗分流完全失效（真机实锤：产物 c-aiot-dpjh-bsjd-def7310d
      //   三主题切出来全同色）。
      const varRe = /^([ \t]*)@([a-zA-Z0-9_-]+)\s*:\s*([^;]+);([^\n]*)$/gm;
      let vmatch;
      while ((vmatch = varRe.exec(blockContent)) !== null) {
        const name = vmatch[2];
        const value = vmatch[3].trim();
        const trailing = vmatch[4] || '';
        // 推断值不入池（让优先级 2 按明暗重新推断）
        if (/自动添加/.test(trailing)) continue;
        if (!vars.has(name)) {
          vars.set(name, value);
        }
      }
    }
    return vars;
  }

  /**
   * 构建 node 真值上下文（#139 · N3）。
   *   - `truthPalette`：按用途分桶的精确色值（backgrounds/shadows/borders/texts）
   *   - `styleText`：组件全部样式语料，用于判定「变量被哪个 CSS 属性消费」→ 选桶
   *
   * 两者缺一，颜色变量就只能落中性兜底（旧行为是按名猜语义色，即蓝色块的来路）。
   * fail-open：任何异常都降级为空上下文，绝不阻断生成。
   *
   * @param {string} componentDir 组件目录
   * @param {{figmaRoot?: object, truthPalette?: object}} opts
   * @returns {{truthPalette: object|null, styleText: string}}
   */
  static buildTruthContext(componentDir, opts = {}) {
    let truthPalette = opts.truthPalette || null
    if (!truthPalette && opts.figmaRoot) {
      try {
        truthPalette = buildTruthPalette(opts.figmaRoot)
      } catch (e) {
        logger.warn('⚠️ 真值色板构建失败（颜色变量将走中性兜底）', { error: e?.message || e })
        truthPalette = null
      }
    }
    if (truthPalette) {
      logger.info('真值色板已注入 Less 变量补齐链路', {
        backgrounds: truthPalette.backgrounds?.length || 0,
        shadows: truthPalette.shadows?.length || 0,
        borders: truthPalette.borders?.length || 0,
        texts: truthPalette.texts?.length || 0,
      })
    }
    let styleText = ''
    try {
      styleText = this.collectStyleText(componentDir)
    } catch (e) {
      logger.warn('⚠️ 样式语料收集失败（变量消费属性不可判定，取中性兜底）', { error: e?.message || e })
      styleText = ''
    }
    return { truthPalette, styleText }
  }

  /** 收集组件目录下全部样式/模板文本（判定变量消费属性用；上限 4MB 防爆内存） */
  static collectStyleText(dir, state = { total: 0, buf: [] }) {
    const CAP = 4 * 1024 * 1024
    if (!dir || state.total > CAP) return state.buf.join('\n')
    let entries
    try {
      entries = readdirSync(dir)
    } catch {
      return state.buf.join('\n')
    }
    for (const name of entries) {
      if (name === 'node_modules' || name === '.git' || name.startsWith('.')) continue
      const filePath = join(dir, name)
      let st
      try {
        st = statSync(filePath)
      } catch {
        continue
      }
      if (st.isDirectory()) {
        this.collectStyleText(filePath, state)
        continue
      }
      if (!['.vue', '.less', '.css', '.js'].includes(extname(filePath))) continue
      if (state.total > CAP) break
      try {
        const txt = readFileSync(filePath, 'utf-8')
        state.total += txt.length
        state.buf.push(txt)
      } catch {
        /* 单文件读失败忽略 */
      }
    }
    return state.buf.join('\n')
  }

  /**
   * 按 node 真值矫正「名字说某色系、值却不是该色系」的颜色变量（#139 · N3）。
   *
   * 事故（e7a50be7）：`@color-accent-gold: #409EFF`、`@color-accent-mint: #409EFF`
   *   —— 名字是金/薄荷，值是 antd 蓝（`/(primary|accent)/ → #409EFF` 猜色产物），
   *   产物 index.css 直接渲染成 `box-shadow: inset 0 0 16px #409EFF`（蓝色发光）
   *   与 `background: #409EFF`（蓝色块）。
   *
   * 判据（三道全过才改写，任一不满足即不动）：
   *   ① 变量名带色系词（gold/mint/cyan/blue/…）——无色系词的名字无从判对错；
   *   ② 当前值的色系 ≠ 名字色系（含「当前值是中性色」—— 中性即未表达色相）；
   *   ③ 真值收窄后**恰好 1 个**候选，且其色系 === 名字色系。
   *
   * ⚠️ 只改值不改结构：同一变量在所有 mixin 里的出现**一起改**（旧值彼此本就相同，
   *   分主题差异化由 `.theme-dark()` 三核心枚举与双真值对齐负责，不归本刀）。
   * ⚠️ 幂等：值已符合名字色系 ⇒ ②不成立 ⇒ 不动。
   *
   * @param {string} themeVarsPath theme-vars.less 路径
   * @param {{truthPalette: object|null, styleText: string}} truthCtx
   * @returns {{changed: Array<{name:string, from:string, to:string}>}}
   */
  static healFabricatedColorVarValues(themeVarsPath, truthCtx = {}) {
    const { truthPalette = null, styleText = '' } = truthCtx || {}
    let content
    try {
      content = readFileSync(themeVarsPath, 'utf-8')
    } catch {
      return { changed: [] }
    }
    const COLOR_VALUE_RE = /^(#|rgba?\(|hsla?\(|linear-gradient|radial-gradient)/i
    const LINE_VAR_RE = /^([ \t]*)@([a-zA-Z0-9_-]+)\s*:\s*([^;]+);([^\n]*)$/
    const lines = content.split('\n')

    // ① 收集每个变量在全文件（各 mixin）里的所有值 —— 用于「同文件已有同色系真值」优先。
    //    真实来源：双真值/副稿 token 生成本身就会给某些 mixin 落真值（e7a50be7 里
    //    `@color-accent-mint: rgba(0, 222, 59, 1)` 就存在于第三个 mixin，而 light 里是 #409EFF）。
    //    这类同文件同色系值比跨源推断更可靠，且不需要 figma 真值也能矫正。
    const valuesByName = new Map()
    for (const line of lines) {
      const m = line.match(LINE_VAR_RE)
      if (!m) continue
      const v = m[3].trim()
      if (!COLOR_VALUE_RE.test(v)) continue
      if (!valuesByName.has(m[2])) valuesByName.set(m[2], [])
      valuesByName.get(m[2]).push(v)
    }

    const planByIndex = new Map()
    const changedMap = new Map()
    const NOTE = '真值矫正（node 色板/同文件同色系真值）'

    lines.forEach((line, idx) => {
      const m = line.match(LINE_VAR_RE)
      if (!m) return
      const [, indent, name, rawValue, trailing] = m
      const value = rawValue.trim()
      if (!COLOR_VALUE_RE.test(value)) return
      if (PRESET_VAR_NAMES.has(name)) return
      const nameFam = familyFromVarName(name)
      if (!nameFam) return
      // ② 当前值已符名字色系 ⇒ 已是对的（幂等锚点）
      if (colorFamily(value) === nameFam) return

      // ③ 真值来源 A：**node 色板优先**（用户分工口径「node 出颜色」；收窄到唯一且色系吻合）
      let target = null
      if (truthPalette) {
        const prop = findConsumerProperty(styleText, name)
        const bucket = bucketOfProperty(prop || '')
        if (bucket) {
          const narrowed = narrowTruthCandidates(truthPalette, bucket, {
            varName: name,
            property: prop || '',
          })
          if (narrowed.length === 1 && colorFamily(narrowed[0]) === nameFam) {
            target = narrowed[0]
          }
        }
      }
      // ④ 真值来源 B：同文件其它 mixin 的同色系值（双真值/副稿 token 落的真值；
      //    色板不可判定时的兜底，不需要 figma 也能矫正）
      if (!target) {
        target =
          (valuesByName.get(name) || []).find(
            (v) => v !== value && colorFamily(v) === nameFam,
          ) || null
      }
      if (!target || target === value) return

      planByIndex.set(idx, { indent, name, to: target, trailing })
      if (!changedMap.has(name)) changedMap.set(name, { name, from: value, to: target })
    })

    if (planByIndex.size === 0) return { changed: [] }

    const rewritten = lines.map((line, idx) => {
      const plan = planByIndex.get(idx)
      if (!plan) return line
      // 保留原注释锚点（如「自愈：从 .common() 迁出」），但**抹掉**「自动添加（语义推断）」
      // ——那是对旧猜值的标注，留着会让后续审计把真值当猜测（extractAllMixinVars 会跳过它）。
      const kept = String(plan.trailing || '')
        .replace(/⚠️\s*自动添加（[^）]*）/g, '')
        .replace(/自动添加（[^）]*）/g, '')
        .replace(/\/\/\s*$/, '')
        .trim()
      return `${plan.indent}@${plan.name}: ${plan.to}; ${kept ? `${kept} ` : ''}// ${NOTE}`
    })
    writeFileSync(themeVarsPath, rewritten.join('\n'), 'utf-8')
    return { changed: [...changedMap.values()] }
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
   * @param {{truthPalette?: object|null, styleText?: string}} [truthCtx]
   *   #139（N3）：node 真值上下文。**必须传**，否则颜色变量桶恒为 null ⇒ 全部落中性色
   *   （旧行为是按名猜语义色 —— 蓝色块的来路）。
   * @returns {string[]} 无法推断含义、用了兜底值的变量名清单（用于结构化告警）
   */
  static addMissingVariables(
    themeVarsPath,
    missingVariables,
    warnings = [],
    colorFnVariables = new Set(),
    truthCtx = {},
  ) {
    let content
    try {
      content = readFileSync(themeVarsPath, 'utf-8')
    } catch (e) {
      logger.error('读取 theme-vars.less 失败', { themeVarsPath, error: e.message })
      return
    }

    // 提取当前 theme-vars.less 中已有的变量值（包括 light/dark mixin 中的）
    const existingVars = this.extractAllMixinVars(content)
    // 🔴🔴 2026-10-12 治本 B：**按明暗分池**。
    //   原实现只有一个 Map + `if (!vars.has(name))` ⇒取「文件里第一个」的值
    //   ⇒ `.theme-light()` 排在最前，后面所有 mixin（`.theme-dark()` /
    //   `.theme-theme_2()`）都复制到 **light 的值** ⇒ 三套主题永远同色
    //   （真机实锤：产物 c-aiot-dpjh-bsjd-def7310d 三主题切换无变化）。
    const existingByBrightness = {
      light: this.extractAllMixinVars(content, 'light'),
      dark: this.extractAllMixinVars(content, 'dark'),
    }

    const commonPattern = /\.common\s*\(\s*\)\s*\{([^}]*)\}/
    // 🛡️ 2026-09-15 治本：颜色类变量**禁止**补进 .common()。
    //    LESS 的 mixin 变量不覆盖 caller 作用域已有同名变量 —— .common() 一旦抢先定义
    //    @colorX，随后的 .theme-dark() / .theme-light() 会被静默忽略 → 两主题编译结果
    //    完全相同 → 切主题零生效（c-env-monitor-1cffd7ce 实锤）。
    //    故：颜色类 → 补进两个主题 mixin；非颜色类（字号/圆角）→ 才进 .common()。
    const isColourVar = (name) => /color|bg|background|border|fill|stroke/i.test(name)

    const renderVarLine = (v, brightness = 'light') => {
      // 🔴 2026-10-12 治本 B：颜色槽位按**明暗分别推断**（旧实现两主题共用同一个值
      //   ⇒ 切主题零变化。真机实锤见 themeVarLinesByMixin 处注释）。
      const isDark = brightness === 'dark'
      // 优先级 1：从**同明暗**的 mixin 复制真值
      // 🔴 2026-10-12：必须用明暗分池的 existingVars，否则会复制到另一明暗的值
      //   （`.theme-light()` 排最前 → 复制到 light 值 ⇒ 三套同色）。
      const pool = isDark ? existingByBrightness.dark : existingByBrightness.light
      if (pool.has(v)) {
        const value = pool.get(v)
        // 颜色变量必须用真实颜色（#/rgba），否则 lighten()/darken()/fade() 无法求值。
        return `  @${v}: ${value}; // 自动添加（从 theme mixin 复制）`
      }
      // 优先级 2：按变量名语义猜测（**带明暗上下文**，让推断表能反相）
      //   #139（N3）：同时带**真值上下文**（styleText + truthPalette）——
      //   有真值就取真值，无真值落中性色，绝不按名编造语义彩色。
      const usesColorFn = colorFnVariables.has(v)
      const guess = safeLessVarValue(`@${v}`, {
        usedByColorFn: usesColorFn,
        styleText: truthCtx?.styleText || '',
        truthPalette: truthCtx?.truthPalette || null,
        ...(isDark ? { background: 'dark' } : {}),
      })
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

    // 🔴🔴 2026-10-12 治本（真机实锤）：**尺寸类预设**不能写 `@k: var(--k)`。
    //   Less 变量只要是 `var()` 形式就**不能参与算术运算** —— 业务样式写
    //   `@fontSize * 1.5` 时 Less 报 `Operation on an invalid type`（真机
    //   `common.less:312`，session mc-max-1791782604925-13f19781）。
    //   ⚠️ 这里必须区别对待，否则**只会把渲染期已做好的字面量化又写回var()**：
    //     `renderMicrocodeThemeVarsLess` 的 `deVarMathLessVars` 先把 `@fontSize`
    //     降成 `12px`，本 checker 随后又按「预设透传」写回 `var(--fontSize)`
    //     —— 真机实测产物 theme-vars.less:6 确实仍是 `@fontSize: var(--fontSize);`
    //     （日志顺序：`microcode-engineer 文件已写入` → `less-variable-checker 已更新`×2，
    //       后者覆盖前者）。
    //   颜色类预设**保持 `var()` 透传不变**（保住运行期 CSS 变量响应，
    //   且颜色槽位不参与 Less 算术运算，不会有本问题）。
    const isMathOperandVar = (name) => MATH_OPERAND_VARS.has(name)
    const presetVarNamesVar = presetVarNames.filter((v) => !isMathOperandVar(v))
    const presetVarNamesLiteral = presetVarNames.filter(isMathOperandVar)

    const presetLines = presetVarNamesVar
      .map((v) => `  @${v}: var(--${v}); // 自动添加（框架预设透传映射，规范形态）`)
      .join('\n')
    // 尺寸类：写字面量（保证 `@fontSize * N` 可编译），并在注释里说明为何破例
    const presetLinesLiteral = presetVarNamesLiteral
      .map(
        (v) =>
          `  @${v}: ${MATH_OPERAND_VARS.get(v)}; // 自动添加（尺寸类落字面量：var() 形式无法参与 Less 运算）`,
      )
      .join('\n')
    const newVariables = [
      presetLines,
      presetLinesLiteral,
      otherVarNames.map(renderVarLine).join('\n'),
    ]
      .filter(Boolean)
      .join('\n')
    // 🔴🔴 2026-10-12 治本 B（真机实锤：Playground 切 dark 无变化）：
    //   旧实现把**同一份** `themeVarLines` 同时写进 theme-light 与 theme-dark
    //   （见下方写入循环）⇒ 两个主题的语义槽位**必然同值** ⇒ 切主题零变化。
    //
    //   实锤（产物 c-aiot-dpjh-bsjd-def7310d 的 theme-vars.less）：
    //     .theme-light() { @color-bg-card: #ffffff; }  // 自动添加（语义推断）
    //     .theme-dark()  { @color-bg-card: #ffffff; }  // 自动添加（语义推断）← 同色
    //   连带 @color-node-name / @color-text-address / @color-online / @color-offline 等
    //   全部两套同值。
    //
    //   修法：按 mixin 的明暗分别推断，dark 走**深色底推断表**。
    //   ⚠️ 不改的三核心（colorTextBase/colorPrimary/colorPrimaryBg）：
    //   它们是**框架预设名**（走 presetVarNames 的 `var()` 透传分支），
    //   其真实值由 css-vars.js 的 dark 对象提供（后者强制 M4-10 枚举值，A8-2），
    //   本函数不碰 ⇒ 不会破坏门禁。
    //
    // 🔴🔴 2026-10-12 补漏（真机实锤：N 主题三套切出来全同色）：
    //   第一版只写 `theme-light` / `theme-dark` 两套 ⇒ **N 主题的自定义 key
    //   （如 `.theme-theme_2()`）完全没被写入推断槽位**。
    //   实锤（产物 c-aiot-dpjh-bsjd-def7310d）：
    //     .theme-light()   { … @color-bg-card: #ffffff; @color-node-name: #333333; … }  ← 有
    //     .theme-theme_2() { …只有三核心 + Design 变量，无这些推断槽位… }            ← 缺
    //   ⇒ 编译时 `.theme_2` 的规则回落到浅色槽位值 ⇒ **三套主题看起来完全一样**。
    //
    //   正解：从 theme-vars.less 里**扫出全部 `.theme-<key>()`**（含 N 主题自定义 key），
    //   逐个按其明暗补齐槽位。明暗判据：① mixin 名含 dark/深色 ⇒ dark；
    //   ② 否则查同文件 `.common()`/相邻 mixin 线索；③ 兜底按 light。
    const allThemeMixins = this._collectThemeMixins(content)
    const themeVarLinesByMixin = {}
    for (const { name: mixinName, brightness } of allThemeMixins) {
      themeVarLinesByMixin[mixinName] = colourVarNames
        .map((v) => renderVarLine(v, brightness))
        .join('\n')
    }
    //兜底：至少产出 light/dark（theme-vars.less 异常时也不静默失效）
    if (!allThemeMixins.includes('theme-light')) {
      themeVarLinesByMixin['theme-light'] = colourVarNames
        .map((v) => renderVarLine(v, 'light')).join('\n')
    }
    if (!allThemeMixins.includes('theme-dark')) {
      themeVarLinesByMixin['theme-dark'] = colourVarNames
        .map((v) => renderVarLine(v, 'dark')).join('\n')
    }

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

      // ── 颜色变量 → 全部主题 mixin（禁止进 .common()，否则挡住主题覆盖）──
      // 🔴 2026-10-12 治本 B：遍历**全部** `.theme-<key>()`（含 N 主题自定义 key），
      //   按各 mixin 明暗分别写入（第一版只写 light/dark ⇒ N 主题缺槽位 ⇒ 三套同色）。
      const mixinNames = Object.keys(themeVarLinesByMixin).filter(
        (n) => themeVarLinesByMixin[n],
      )
      for (const mixinName of mixinNames) {
        content = this.appendToMixin(content, mixinName, themeVarLinesByMixin[mixinName])
      }

      // 🔴🔴 2026-10-12 治本 B 补最后一块：**重写历史遗留的同值推断**。
      //   真机实锤：旧版 checker 会把同一个值写进 light 与 dark
      //   （产物里 `@color-bg-card: #ffffff; // 自动添加（语义推断）` 两处同值），
      //   而 `addMissingVariables` **只补缺失的** ⇒ 修完也不会变 ⇒ 三套仍同色。
      //   正解：对**带「自动添加」标记（= 推断值，非真值）**的颜色变量，
      //   若其值与该 mixin 明暗应有的推断值不同 ⇒ 改写。
      content = this._rewriteStaleInferredColors(content, themeVarLinesByMixin)

      writeFileSync(themeVarsPath, content, 'utf-8')
      logger.info('已更新 theme-vars.less')

    } catch (error) {
      logger.error('添加变量失败', { themeVarsPath, error: error.message })
      throw error
    }
  }

  /**
   * 🔴 2026-10-12 治本 B：扫出 theme-vars.less 里**全部** `.theme-<key>()` mixin 名**及其明暗**。
   *
   * 为何需要：N 主题（N > 2）时管线会生成 `.theme-theme_2()` 这类**自定义 key**的
   * mixin（key 由 `multi-theme.js#resolveThemeKey` 分配，名字里**不含** light/dark）。
   * 只写 `theme-light`/`theme-dark` ⇒ 这些 mixin 缺颜色槽位 ⇒ **三套主题渲染一样**。
   *
   * 明暗从哪来（关键）：**mixin 上方的注释行已标明** ——
   * `renderMicrocodeThemeVarsLess` 写的是 `// <主题名>（深色|浅色）`
   * （`style-tokens.js:1382-1385`）。所以按「紧邻 mixin 上一行的注释」解析，
   * 解析不到再回退「mixin 名含 dark/深色」。
   *
   * @param {string} content theme-vars.less 全文
   * @returns {Array<{name:string, brightness:'light'|'dark'}>}
   */
  static _collectThemeMixins(content) {
    const out = []
    // 连同注释一起扫描（注释可能独占一行或在同行）
    const re = /(\/\/[^\n]*)?\s*\.([a-zA-Z_][a-zA-Z0-9_-]*)\s*\(\s*\)\s*\{/g
    let m
    while ((m = re.exec(content))) {
      const comment = m[1] || ''
      const name = m[2]
      if (name === 'theme-vars' || !/^theme-/.test(name)) continue
      // ① 注释里显式标了（深色）/（浅色）—— 权威来源
      let brightness = null
      if (/深色|dark/i.test(comment)) brightness = 'dark'
      else if (/浅色|light/i.test(comment)) brightness = 'light'
      // ② 回退：mixin 名自带 light/dark
      if (!brightness) brightness = /dark|深色|夜|night/i.test(name) ? 'dark' : 'light'
      out.push({ name, brightness })
    }
    // 同名去重（保留首次）
    const seen = new Set()
    return out.filter((x) => (seen.has(x.name) ? false : (seen.add(x.name), true)))
  }

  /** 兼容旧调用点：只要名字 */
  static _collectThemeMixinNames(content) {
    return this._collectThemeMixins(content).map((x) => x.name)
  }

  /**
   * 🔴 2026-10-12 治本 B：**重写历史遗留的同值推断色**。
   *
   * 为什么要这一步（真机实锤）：旧版 checker 把**同一个推断值**写进 light 与 dark
   * （`@color-bg-card: #ffffff; // 自动添加（语义推断）` 两处同值）。
   * 而 `addMissingVariables` 的语义是**只补缺失变量** ⇒ 这些已存在的错误值
   * **永远不会被修正** ⇒ 修完明暗分流后三套仍同色。
   *
   * 判据（只改「推断值」，绝不碰真值）：
   *   - 该行注释含「自动添加」⇒ 它是**推断值**（真值来自 Figma，无此标记）
   *   - 且其值 ≠ 该 mixin 明暗对应的推断值 ⇒ 改写
   * 传入 `themeVarLinesByMixin`（mixinName → 已算好的推断行）作为期望值来源。
   */
  static _rewriteStaleInferredColors(content, themeVarLinesByMixin) {
    let out = content
    for (const [mixinName, lines] of Object.entries(themeVarLinesByMixin || {})) {
      if (!lines) continue
      // 期望值：从该 mixin 的推断行里解析 name → value
      const expected = new Map()
      for (const line of String(lines).split('\n')) {
        const m = /@([a-zA-Z0-9_-]+)\s*:\s*([^;]+);/.exec(line)
        if (m) expected.set(m[1], m[2].trim())
      }
      if (!expected.size) continue

      // 定位该 mixin 的块并逐行改写
      const re = new RegExp(`(\\.${mixinName}\\s*\\(\\s*\\)\\s*\\{)([\\s\\S]*?)(\\n\\})`)
      out = out.replace(re, (full, head, body, tail) => {
        let fixed = body
        for (const [name, want] of expected) {
          // 只改「带自动添加标记的推断行」
          const lineRe = new RegExp(`(^[ \\t]*@${name}\\s*:\\s*)([^;]+)(;[^\\n]*//[^\\n]*自动添加[^\\n]*)$`, 'm')
          fixed = fixed.replace(lineRe, (lm, pre, val, comment) => {
            if (val.trim() === want) return lm
            return `${pre}${want}${comment}`
          })
        }
        return `${head}${fixed}${tail}`
      })
    }
    return out
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
  /**
   * 🔴🔴 2026-10-13 确定性自愈（真机 mc-max-1791884047075-49102507 实锤）：
   * 「根作用域缺槽位」——common.less 引用了 `@color-card-bg` 等槽位，但只有
   * `.theme-dark()` 定义了它们（深色稿色板提取出的语义槽位），根默认
   * `.theme-light()` 没有 ⇒ index.less 根作用域（只有 .common()+.theme-light()）
   * 编译 `variable @color-card-bg is undefined` ⇒ **整个生成失败**。
   *
   * 为什么「写盘门禁自动补全」漏了它：isLessVarDeclared 是**文件级**判据
   * （.theme-dark() 里定义过就算已声明），不区分「根作用域可不可见」。
   *
   * 修法：对 common.less 引用的每个 @slot：
   *   - .common() 已定义 ⇒ 跳过（根作用域可见）
   *   - 每个主题 mixin 里缺失 ⇒ safeLessVarValue 按名+明暗猜值补进该 mixin
   *     （light 补浅色系、dark 补深色系；自定义 key 按其首个色值亮度推断明暗）
   *
   * @param {string} themeVarsPath
   * @param {string} commonLessPath
   * @returns {{fixed:boolean, injected:Array<{mixin:string,name:string,value:string}>}}
   */
  static healRootScopeMissingSlots(themeVarsPath, commonLessPath) {
    const EMPTY = { fixed: false, injected: [] }
    let tvContent
    try {
      tvContent = readFileSync(themeVarsPath, 'utf-8')
    } catch (e) {
      return EMPTY
    }
    let commonContent = ''
    try {
      commonContent = readFileSync(commonLessPath, 'utf-8')
    } catch (e) {
      return EMPTY
    }

    // 1. common.less 引用的 @slot 集合
    const referenced = new Set()
    const rr = /@([a-zA-Z0-9_-]+)/g
    let x
    while ((x = rr.exec(commonContent)) !== null) referenced.add(x[1])
    if (referenced.size === 0) return EMPTY

    // 2. 解析 theme-vars：各 mixin 的槽位集合（含 .common()）
    const mixinRe = /\.([a-zA-Z0-9_-]+)\s*\(\s*\)\s*\{([^}]*)\}/g
    const mixins = {} // name -> { body, vars:Set }
    const order = []
    let mm
    while ((mm = mixinRe.exec(tvContent)) !== null) {
      const vars = new Set()
      const vr = /@([a-zA-Z0-9_-]+)\s*:/g
      let vm
      while ((vm = vr.exec(mm[2])) !== null) vars.add(vm[1])
      mixins[mm[1]] = { body: mm[2], vars }
      order.push(mm[1])
    }
    const commonVars = mixins['common']?.vars || new Set()

    // 3. 逐主题补缺（跳过 .common()）
    const injected = []
    let next = tvContent
    let changed = false
    for (const mixinName of order) {
      if (mixinName === 'common') continue
      const vars = mixins[mixinName].vars
      const missing = [...referenced].filter((n) => !vars.has(n) && !commonVars.has(n))
      if (missing.length === 0) continue
      // 明暗推断：theme-light→浅色值；theme-dark→深色值；
      //   自定义 key（theme_N 等）按其 @color-primary 首个色值亮度
      let background = 'light'
      if (/-dark$|^dark$/.test(mixinName)) {
        background = 'dark'
      } else if (mixinName !== 'theme-light') {
        const pm = mixins[mixinName].body.match(/@color-primary\s*:\s*#([0-9a-fA-F]{6})/)
        if (pm) {
          const v = parseInt(pm[1], 16)
          const lum = 0.299 * ((v >> 16) & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)
          background = lum < 128 ? 'dark' : 'light'
        } else {
          background = 'dark'
        }
      }
      const pairs = missing.map((n) => ({
        name: n,
        value: safeLessVarValue(n, { background }),
      }))
      next = this.appendVarsToMixin(next, mixinName, pairs)
      injected.push(...pairs.map((p) => `@${p.name}→.${mixinName}()`))
      changed = true
    }
    if (!changed) return EMPTY
    try {
      writeFileSync(themeVarsPath, next, 'utf-8')
    } catch (e) {
      logger.error('补齐根作用域缺失槽位失败', { themeVarsPath, error: e.message })
      return EMPTY
    }
    return { fixed: true, injected }
  }

  /**
   * 🔴 2026-10-13 确定性自愈：校验 theme-vars.less 的 `.theme-dark()` 三核心
   * 是否为 M4-10 枚举值，不符则**直接改写**为枚举值。
   *
   * 根因（真机 fca166e8）：N 主题下 themeMeta 循环先 emit 的 `.theme-dark()` 用了
   * themeSlots.dark 原始值（被 theme_2 顶掉），生成器已修（style-tokens）；
   * 但**存量产物**不重跑生成就不会好 —— 在写盘自愈链路里补同口径校验，
   * 让存量产物写盘时即收敛。M4-10 主门禁只查 css-vars.js（已知盲区），
   * 此处补齐 theme-vars.less 侧。
   *
   * @param {string} themeVarsPath
   * @returns {{fixed:boolean, changed:Array<{name:string,from:string,to:string}>}}
   */
  static healThemeVarsDarkCore(themeVarsPath) {
    const EMPTY = { fixed: false, changed: [] }
    let content
    try {
      content = readFileSync(themeVarsPath, 'utf-8')
    } catch (e) {
      return EMPTY
    }
    const re = /(\.theme-dark\s*\(\s*\)\s*\{)([^}]*)(\})/
    const m = content.match(re)
    if (!m) return EMPTY
    // 槽位名映射：枚举 camelCase ↔ theme-vars kebab-case
    const coreKebab = {
      colorTextBase: 'color-text-base',
      colorPrimary: 'color-primary',
      colorPrimaryBg: 'color-primary-bg',
    }
    const changed = []
    let body = m[2]
    for (const [enumKey, kebab] of Object.entries(coreKebab)) {
      const enumVal = MC_DARK_THEME_COLOR_ENUM_CORE[enumKey]
      const lineRe = new RegExp(`(@${kebab}\s*:\s*)([^;]+);`)
      const lm = body.match(lineRe)
      if (!lm) continue // 槽位缺失不在此补（归 healCommonColorVars 管辖）
      if (lm[2].trim().toLowerCase() === enumVal.toLowerCase()) continue
      changed.push({ name: `@${kebab}`, from: lm[2].trim(), to: enumVal })
      body = body.replace(lineRe, `$1${enumVal};`)
    }
    if (changed.length === 0) return EMPTY
    const next = content.replace(re, `$1${body}$3`)
    try {
      writeFileSync(themeVarsPath, next, 'utf-8')
    } catch (e) {
      logger.error('校正 theme-vars.less dark 三核心失败', { themeVarsPath, error: e.message })
      return EMPTY
    }
    return { fixed: true, changed }
  }

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
