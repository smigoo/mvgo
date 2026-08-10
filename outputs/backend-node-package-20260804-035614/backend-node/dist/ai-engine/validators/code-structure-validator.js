/**
 * CodeStructureValidator - L0-B 自验器
 *
 * 在 microcode-engineer / vue3-engineer 输出 generatedFiles 后立即执行，
 * 校验生成的 Vue 文件是否符合 scoped-less 标准。
 *
 * 检查项适用范围：
 *   两者通用：CODE-001 / CODE-002 / CODE-004 / CODE-005 / CODE-006 / CODE-008
 *   仅微码：  CODE-003 / CODE-009
 *   仅 Vue3： CODE-007
 */

const HOST_STYLE_LEAK_PATTERNS = [
  { id: 'CODE-004', regex: /@apply\b|@tailwind\b|@layer\b/, message: '检测到 Tailwind 指令，生成组件禁止依赖宿主 Tailwind 样式链' },
  { id: 'CODE-005', regex: /from\s*["']@inspira-ui\/plugins["']|from\s*["']tailwindcss["']|from\s*["']tw-animate-css["']|import\s*["']@inspira-ui\/plugins["']|import\s*["']tailwindcss["']|import\s*["']tw-animate-css["']/, message: '检测到宿主 UI / Tailwind 依赖导入，生成组件必须保持自包含' },
  { id: 'CODE-006', regex: /\bclass\s*=\s*["'][^"']*\b(?:flex|grid|inline-flex|items-center|justify-center|justify-between|gap-\d+|p[xytrbl]?-[\w.\/[\]-]+|m[xytrbl]?-[\w.\/[\]-]+|text-(?:xs|sm|base|lg|xl|\d+xl)|font-(?:bold|semibold|medium|light)|bg-[\w/\-[\]]+|rounded(?:-[\w/\-[\]]+)?|border(?:-[\w/\-[\]]+)?|shadow(?:-[\w/\-[\]]+)?|w-(?:full|\d+)|h-(?:full|\d+))\b[^"']*["']/i, message: '检测到疑似 Tailwind utility class，生成组件禁止依赖宿主原子类' },
]

function normalizeCssLiteral(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase()
}

function extractRootBackgroundExpectation(options = {}) {
  const layoutBg = options?.layoutStructure?.styles?.background || options?.layoutStructure?.background || ''
  const visualBg = options?.visualElements?.background || ''
  const bgResource = (options?.resourceDomMapping || []).find(item =>
    item?.previewAnalysisRole === 'bg' && item?.recommendedUsage === 'backgroundStyle'
  )
  const candidates = [layoutBg, visualBg, bgResource?.cssValue].filter(Boolean)
  const normalized = candidates.map(normalizeCssLiteral).filter(Boolean)
  return {
    hasRootBackground: normalized.length > 0,
    expectedValues: [...new Set(normalized)],
  }
}

function findRootStyleBlock(content = '') {
  const rootClassMatch = content.match(/<template>[\s\S]*?class=["'][^"']*\b([a-z][\w-]*)\b[^"']*["']/i)
  const rootClass = rootClassMatch?.[1]
  if (!rootClass) return { rootClass: '', styleBody: '' }

  const styleMatch = content.match(/<style[^>]*>([\s\S]*?)<\/style>/i)
  const styleBody = styleMatch?.[1] || ''
  return { rootClass, styleBody }
}

function extractRootRuleBody(styleBody = '', rootClass = '') {
  if (!styleBody || !rootClass) return ''
  const escaped = rootClass.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = styleBody.match(new RegExp(`\\.${escaped}\\s*\\{([\\s\\S]*?)\\}`, 'i'))
  return match?.[1] || ''
}

export class CodeStructureValidator {
  /**
   * 执行校验
   * @param {Array} generatedFiles - [{ path, content }] 文件数组
   * @param {string} componentId - 组件ID（用于前缀检查）
   * @param {Object} options - { target, layoutStructure, visualElements, resourceDomMapping, previewAnalysis }
   * @returns {{ pass: boolean, blockCount: number, issues: Array }}
   */
  static validate(generatedFiles, componentId, options = {}) {
    const isVue3 = options?.target === 'vue3'
    const issues = []
    const rootBgExpectation = isVue3 ? extractRootBackgroundExpectation(options) : { hasRootBackground: false, expectedValues: [] }

    // ========== 逐 .vue 文件检查（两者通用 + Vue3 专属）==========
    for (const file of generatedFiles) {
      const filePath = file.path || ''
      const content = file.content || ''
      if (!filePath.endsWith('.vue')) continue

      // ---- 两者通用 ----

      // CODE-001: 必须有 <style lang="less" scoped> 块
      const hasScopedLess = /<style[^>]*lang=["']less["'][^>]*scoped/.test(content)
      if (!hasScopedLess) {
        const hasAnyStyle = /<style[\s\S]*?<\/style>/g.test(content)
        if (hasAnyStyle) {
          const hasScopedOnly = /<style[^>]*scoped/.test(content)
          issues.push({
            id: 'CODE-001',
            severity: 'BLOCK',
            file: filePath,
            message: hasScopedOnly
              ? 'style 块缺少 lang="less" 属性，必须为 <style lang="less" scoped>'
              : '缺少 <style lang="less" scoped> 块'
          })
        } else {
          issues.push({
            id: 'CODE-001',
            severity: 'BLOCK',
            file: filePath,
            message: '.vue 文件没有任何 style 块'
          })
        }
      }

      // CODE-002: 必须引入 index.less
      if (!content.includes('@import') || !content.includes('index.less')) {
        issues.push({
          id: 'CODE-002',
          severity: 'BLOCK',
          file: filePath,
          message: "未引入 resources/styles/index.less，必须 @import '../resources/styles/index.less'（或对应层级路径）"
        })
      }

      // CODE-004/005/006: 禁止宿主 Tailwind / Inspira / 原子类泄漏
      for (const rule of HOST_STYLE_LEAK_PATTERNS) {
        if (rule.regex.test(content)) {
          issues.push({
            id: rule.id,
            severity: 'BLOCK',
            file: filePath,
            message: rule.message
          })
        }
      }

      // ---- 仅 Vue3 ----

      // CODE-007: Vue3 根面板有背景时，根选择器必须直接落地背景字面量
      if (isVue3 && filePath.endsWith('index.vue') && rootBgExpectation.hasRootBackground) {
        const { rootClass, styleBody } = findRootStyleBlock(content)
        const rootRuleBody = extractRootRuleBody(styleBody, rootClass)
        const normalizedRule = normalizeCssLiteral(rootRuleBody)
        const reliesOnThemeVar = /background(?:-color)?\s*:\s*var\(--color(?:-bg|bg)\)/i.test(rootRuleBody)
        const usesTransparentFallback = /background(?:-color)?\s*:\s*(transparent|inherit)\b/i.test(rootRuleBody)
        const hasDirectBackgroundLiteral = rootBgExpectation.expectedValues.some(value => normalizedRule.includes(value))
        const hasBackgroundProperty = /background(?:-image|-color)?\s*:/i.test(rootRuleBody)

        if (!rootRuleBody || !hasBackgroundProperty || !hasDirectBackgroundLiteral || reliesOnThemeVar || usesTransparentFallback) {
          issues.push({
            id: 'CODE-007',
            severity: 'BLOCK',
            file: filePath,
            message: `Vue3 根面板存在背景，但根选择器未直接落地背景字面量；期望包含: ${rootBgExpectation.expectedValues.slice(0, 3).join(' / ')}`
          })
        }
      }
    }

    // ========== 非 .vue 文件的 Tailwind 泄漏检查（两者通用）==========
    for (const file of generatedFiles) {
      const filePath = file.path || ''
      const content = file.content || ''
      if (!filePath.endsWith('.less') && !filePath.endsWith('.css') && !filePath.endsWith('.js')) continue

      for (const rule of HOST_STYLE_LEAK_PATTERNS) {
        if (rule.regex.test(content)) {
          issues.push({
            id: rule.id,
            severity: 'BLOCK',
            file: filePath,
            message: rule.message
          })
        }
      }
    }

    // ========== CODE-008: ESM import 变量名一致性（两者通用）==========
    // 禁止 LLM 自行 import 本地图片资源，应交由 injectResourceImports 后处理注入
    const resourceMapping = options?.resourceDomMapping || []
    const validResourceFiles = new Set(
      resourceMapping
        .filter(m => m.resourceFile)
        .map(m => m.resourceFile.replace(/^\.\.\//, '').replace(/^\.\.\/\.\.\//, ''))
    )

    for (const file of generatedFiles) {
      const filePath = file.path || ''
      const content = file.content || ''
      if (!filePath.endsWith('.vue')) continue

      const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/i)
      if (!scriptMatch) continue
      const scriptContent = scriptMatch[1]

      const importRegex = /import\s+(\w+)\s+from\s+['"]([^'"]*resources\/images\/[^'"]+)['"]/g
      let match
      while ((match = importRegex.exec(scriptContent)) !== null) {
        const importPath = match[2]
        const normalizedPath = importPath.replace(/^\.\.\//, '').replace(/^\.\.\/\.\.\//, '')
        const isValid = validResourceFiles.has(normalizedPath) ||
          resourceMapping.some(m => m.resourceFile && importPath.endsWith(m.resourceFile.replace(/^.*images\//, '')))

        if (!isValid) {
          issues.push({
            id: 'CODE-008',
            severity: 'BLOCK',
            file: filePath,
            message: `检测到未经后处理注入的 ESM 图片 import: ${match[1]} from '${importPath}'，应交由 injectResourceImports 自动注入，禁止 LLM 手写`
          })
        }
      }
    }

    // ========== CODE-009: componentName vs 预览图标题（仅微码）==========
    // Vue3 不生成 declare.json，跳过此检查
    if (!isVue3) {
      const previewTitle = options?.previewAnalysis?.componentTitle || options?.previewAnalysis?.title || ''
      if (previewTitle) {
        const declareFile = generatedFiles.find(f =>
          f.path && (f.path.endsWith('declare.json') || f.path.includes('declare.json'))
        )
        if (declareFile) {
          try {
            const declare = JSON.parse(declareFile.content)
            if (declare.componentName && declare.componentName !== previewTitle) {
              issues.push({
                id: 'CODE-009',
                severity: 'BLOCK',
                file: declareFile.path,
                message: `declare.json componentName='${declare.componentName}' 与预览图识别标题='${previewTitle}' 不一致，必须使用预览图识别的标题`
              })
            }
          } catch (e) {
            // JSON 解析失败，跳过
          }
        }
      }
    }

    // ========== CODE-003: common.less 前缀检查（仅微码）==========
    if (!isVue3) {
      const commonLessFile = generatedFiles.find(f =>
        f.path && (f.path.endsWith('common.less') || f.path.includes('common.less'))
      )
      if (commonLessFile) {
        const classes = commonLessFile.content.match(/\.[a-zA-Z][\w-]+(?=\s*\{)/g) || []
        const violations = classes.filter(c => {
          if (/^&|^:root|^@keyframes/.test(c)) return false
          if (componentId && (c.startsWith(`.c-${componentId}-`) || c.startsWith(`.c-${componentId}`))) return false
          return true
        })

        if (violations.length > 0) {
          issues.push({
            id: 'CODE-003',
            severity: 'WARN',
            file: commonLessFile.path,
            message: `common.less 中 ${violations.length} 个 class 缺少 ${componentId || '组件'} 前缀: ${violations.slice(0, 5).join(', ')}${violations.length > 5 ? '...' : ''}`
          })
        }
      }
    }

    return {
      pass: !issues.some(i => i.severity === 'BLOCK'),
      blockCount: issues.filter(i => i.severity === 'BLOCK').length,
      issues
    }
  }

  /**
   * 生成修订指导
   */
  static generateFixGuidance(issues) {
    const blocks = issues.filter(i => i.severity === 'BLOCK')
    const warns = issues.filter(i => i.severity === 'WARN')

    let g = '# ⚠️ 代码结构校验未通过\n\n'
    if (blocks.length) g += '## 🔴 必须修复\n' + blocks.map(i => `- [${i.id}] ${i.file}: ${i.message}`).join('\n') + '\n\n'
    if (warns.length) g += '## 🟡 建议修复\n' + warns.map(i => `- [${i.id}] ${i.file}: ${i.message}`).join('\n') + '\n\n'

    return g
  }
}
