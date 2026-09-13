/**
 * 代码校验模块（Code Validator）
 *
 * 职责：生成产物的完整性、跨文件一致性、class 覆盖与轻量后处理校验。
 *
 * 从 microcode-engineer.js 拆分出的纯函数模块；logger 通过 options 注入。
 */

import {
  validateContainerSize as _validateContainerSizePure,
  validateResourceUsage as _validateResourceUsagePure,
} from '../../utils/post-process.js';
import { resolveClassPrefixId } from '../../validators/code-structure-validator.js';

export function detectFileTruncation(files) {
    const issues = [];

    for (const [filePath, content] of Object.entries(files)) {
      if (!content || typeof content !== 'string') continue;

      // .vue 文件：检查 </script> 和 </style> 闭合标签
      if (filePath.endsWith('.vue')) {
        if (content.includes('<script') && !content.includes('</script>')) {
          issues.push(`${filePath}: <script> 标签未闭合（输出被截断）`);
        }
        if (content.includes('<style') && !content.includes('</style>')) {
          issues.push(`${filePath}: <style> 标签未闭合（输出被截断）`);
        }
        if (
          content.includes('<template>') &&
          !content.includes('</template>')
        ) {
          issues.push(`${filePath}: <template> 标签未闭合（输出被截断）`);
        }
      }

      // .json 文件：检查是否为合法 JSON
      if (filePath.endsWith('.json')) {
        try {
          JSON.parse(content);
        } catch (e) {
          issues.push(
            `${filePath}: JSON 解析失败（可能被截断）- ${e.message.substring(0, 80)}`,
          );
        }
      }

      // .less 文件：检查是否在规则中间截断（括号 + 注释块平衡）
      if (filePath.endsWith('.less')) {
        // R0-5（2026-09-01）：计数前剥除注释与字符串字面量——
        // 注释/字符串里的 { }（如 content: "}"、/* { 示例 */）此前会被计入，
        // 造成「括号不匹配」误报并 throw 触发无谓重试。
        const stripped = content
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/(^|\s)\/\/[^\n]*$/gm, '$1')
          .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""');
        const openBraces = (stripped.match(/{/g) || []).length;
        const closeBraces = (stripped.match(/}/g) || []).length;
        if (openBraces !== closeBraces) {
          issues.push(
            `${filePath}: 大括号不匹配（{=${openBraces} }=${closeBraces}），可能被截断`,
          );
        }
        const openComment = (content.match(/\/\*/g) || []).length;
        const closeComment = (content.match(/\*\//g) || []).length;
        if (openComment !== closeComment) {
          issues.push(
            `${filePath}: 注释块不匹配（/*=${openComment} */=${closeComment}），可能被截断`,
          );
        }
      }
    }

    return issues;
  }

export function validateFilesIntegrity(parsed, options = {}) {
    if (!parsed || !parsed.files) return;

    const truncationIssues = detectFileTruncation(parsed.files);
    if (truncationIssues.length === 0) return;

    // 日志告警
    options.logger?.warn?.('⚠️ 检测到文件完整性问题，将拒绝写盘触发重试', {
      issues: truncationIssues,
    });

    // 抛出异常，让上游 retry 机制捕获
    throw new Error(
      `文件输出不完整（被截断）：\n${truncationIssues.map((i) => `- ${i}`).join('\n')}\n\n将自动重试，请稍候。`,
    );
  }

export function collectVueContextFiles(allFiles) {
    const ctx = [];
    // index.vue 始终排第一（最重要）
    if (allFiles['package/index.vue']) {
      ctx.push({
        path: 'package/index.vue',
        content: allFiles['package/index.vue'],
      });
    }
    // 其他所有 Vue 文件（子组件等）
    for (const [path, content] of Object.entries(allFiles)) {
      if (
        path.endsWith('.vue') &&
        path !== 'package/index.vue' &&
        typeof content === 'string'
      ) {
        ctx.push({ path, content });
      }
    }
    return ctx;
  }

export function extractTemplateClassNames(allFiles, componentName, options = {}) {
    const fullClassNames = new Set();
    const classPrefix = `c-${componentName}-`;

    // 匹配模式：
    // 1. class="xxx yyy" 中的单独 class 名
    // 2. :class="'xxx'" 中的字符串字面量
    // 3. :class="['xxx', condition && 'yyy']" 中的字符串字面量
    // 4. :class="{ 'xxx': condition }" 中的对象键
    const staticClassRx = /class\s*=\s*["'`]([^"'`]*)["'`]/g;
    const stringLiteralRx = /'([^']+)'/g;

    // 框架 class 白名单（不需要在 common.less 中定义）
    const frameworkPrefixes = [
      'ant-',
      'el-',
      'base-',
      'c-base-',
      'fa-',
      'fas-',
      'far-',
      'icon-',
    ];

    const vueFiles = Object.entries(allFiles).filter(
      ([p]) => p.endsWith('.vue') && typeof allFiles[p] === 'string',
    );

    for (const [, vueContent] of vueFiles) {
      // 提取所有 class="..." 属性值
      let match;
      while ((match = staticClassRx.exec(vueContent)) !== null) {
        const classValue = match[1];
        // 跳过 Vue 绑定表达式（如 class="{ active: isActive }"）
        if (classValue.startsWith('{') && classValue.endsWith('}')) {
          // 提取对象键中的字符串字面量
          let strMatch;
          while ((strMatch = stringLiteralRx.exec(classValue)) !== null) {
            const cn = strMatch[1].trim();
            if (cn && !frameworkPrefixes.some((p) => cn.startsWith(p))) {
              fullClassNames.add(cn);
            }
          }
        } else {
          // 普通 class 值，空格分隔
          const tokens = classValue.split(/\s+/);
          for (const cn of tokens) {
            // 🛡️ v3.7-fix: 过滤非有效 class 名（避免 [ ] ( ? = 等表达式碎片污染）
            if (!cn || !/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(cn)) continue;
            if (cn && !frameworkPrefixes.some((p) => cn.startsWith(p))) {
              fullClassNames.add(cn);
            }
          }
        }
      }

      // 提取 :class="[...]" 数组中的字符串字面量
      const dynamicArrayRx = /:class\s*=\s*["'`]\[([^\]]*)\]["'`]/g;
      while ((match = dynamicArrayRx.exec(vueContent)) !== null) {
        let strMatch;
        while ((strMatch = stringLiteralRx.exec(match[1])) !== null) {
          const cn = strMatch[1].trim();
          if (cn && !frameworkPrefixes.some((p) => cn.startsWith(p))) {
            fullClassNames.add(cn);
          }
        }
      }

      // 提取 :class="'xxx'" 单引号字符串
      const singleQuoteRx = /:class\s*=\s*["'`]'([^']+)'["'`]/g;
      while ((match = singleQuoteRx.exec(vueContent)) !== null) {
        const cn = match[1].trim();
        if (cn && !frameworkPrefixes.some((p) => cn.startsWith(p))) {
          fullClassNames.add(cn);
        }
      }
    }

    const fullList = [...fullClassNames].sort();

    options.logger?.info?.('🔍 程序化提取模板 class 名完成', {
      totalCount: fullList.length,
      prefix: classPrefix,
      sample: fullList.slice(0, 10),
    });

    return { fullList, prefix: classPrefix };
  }

export function extractTemplateBindings(allFiles, options = {}) {
    const refs = new Set();
    const events = new Set();
    const dataSources = new Set();
    const interpolations = new Set();

    const vueFiles = Object.entries(allFiles).filter(
      ([p]) => p.endsWith('.vue') && typeof allFiles[p] === 'string',
    );

    for (const [, vueContent] of vueFiles) {
      // 1. 提取 ref="xxx" 或 :ref="xxx"
      const refRx = /(?::?ref)\s*=\s*["'`]([^"'`{}]+)["'`]/g;
      let match;
      while ((match = refRx.exec(vueContent)) !== null) {
        const refVal = match[1].trim();
        if (refVal && !refVal.includes(' ') && refVal.length > 1)
          refs.add(refVal);
      }

      // 2. 提取 @event="handler" 或 v-on:event="handler"
      const eventRx = /(?:@|v-on:)\w+\s*=\s*["'`]([^"'`()]+)/g;
      while ((match = eventRx.exec(vueContent)) !== null) {
        const handler = match[1].trim().split('(')[0].trim();
        // 🛡️ v3.7-fix: 只保留纯函数名（标识符），过滤内联表达式（含 = . 运算符等）
        if (
          handler &&
          !handler.startsWith('$') &&
          handler.length > 1 &&
          /^[a-zA-Z_$][\w$]*$/.test(handler)
        )
          events.add(handler);
      }

      // 3. 提取 v-for="item in dataSource"
      const vForRx = /v-for\s*=\s*["'`][^"'`]*\s+in\s+(\w+)/g;
      while ((match = vForRx.exec(vueContent)) !== null) {
        dataSources.add(match[1]);
      }

      // 4. 提取 {{ variableName }} 插值
      const interpRx = /\{\{\s*([\w.]+)/g;
      while ((match = interpRx.exec(vueContent)) !== null) {
        const varName = match[1].split('.')[0];
        if (varName && varName.length > 1 && !varName.startsWith('$'))
          interpolations.add(varName);
      }
    }

    const result = {
      refs: [...refs].sort(),
      events: [...events].sort(),
      dataSources: [...dataSources].sort(),
      interpolations: [...interpolations].sort(),
    };

    options.logger?.info?.('🔍 程序化提取模板绑定变量完成', {
      refs: result.refs.length,
      events: result.events.length,
      dataSources: result.dataSources.length,
      interpolations: result.interpolations.length,
    });

    return result;
  }

export function validateCrossFileConsistency(allFiles, bindings, options = {}) {
    const mismatches = [];
    const warnings = [];

    const scriptContents = Object.entries(allFiles)
      .filter(([p]) => p.endsWith('.vue') && typeof allFiles[p] === 'string')
      .map(([p, c]) => {
        const scriptMatch = c.match(/<script[^>]*>([\s\S]*?)<\/script>/);
        return { path: p, content: scriptMatch ? scriptMatch[1] : '' };
      });

    const allScriptContent = scriptContents.map((s) => s.content).join('\n');

    // 提取 script 中声明的函数/变量名
    const funcRx = /(?:function|const|let|var)\s+(\w+)/g;
    const declaredNames = new Set();
    let m;
    while ((m = funcRx.exec(allScriptContent)) !== null)
      declaredNames.add(m[1]);

    // 1. ref 一致性
    for (const refName of bindings.refs) {
      if (
        !allScriptContent.includes(`ref(${refName}`) &&
        !declaredNames.has(refName)
      ) {
        mismatches.push({
          type: 'ref_missing',
          variable: refName,
          message: `模板 ref="${refName}" 在 script 中未找到 ref()/const/let 声明`,
        });
      }
    }

    // 2. 事件处理器一致性
    for (const eventName of bindings.events) {
      if (!declaredNames.has(eventName)) {
        mismatches.push({
          type: 'event_handler_missing',
          variable: eventName,
          message: `模板 @event="${eventName}" 在 script 中未找到函数声明`,
        });
      }
    }

    // 3. 数据源一致性
    for (const ds of bindings.dataSources) {
      if (!allScriptContent.includes(ds) && !declaredNames.has(ds)) {
        mismatches.push({
          type: 'data_source_missing',
          variable: ds,
          message: `模板 v-for="... in ${ds}" 的数据源在 script 中未找到声明`,
        });
      }
    }

    // 4. 插值变量（warn 级别）
    for (const iv of bindings.interpolations) {
      if (
        !declaredNames.has(iv) &&
        !allScriptContent.includes(`.${iv}`) &&
        !allScriptContent.includes(` ${iv}:`)
      ) {
        warnings.push({
          type: 'interpolation_unverified',
          variable: iv,
          message: `模板 {{ ${iv} }} 在 script 中未明确找到声明`,
        });
      }
    }

    if (mismatches.length > 0 || warnings.length > 0) {
      options.logger?.warn?.('🔍 跨文件一致性校验发现问题', {
        mismatches: mismatches.length,
        warnings: warnings.length,
      });
    } else {
      options.logger?.info?.('✅ 跨文件一致性校验通过');
    }

    return { mismatches, warnings };
  }

export function reverseMapClassToElement(className, elementStyleMap) {
    if (!elementStyleMap || Object.keys(elementStyleMap).length === 0)
      return null;
    // 从 class 名中提取可能的语义部分（最后一个连字符段或最后几段）
    // 例如 c-mc-xxx-vehicle-card → 尝试匹配 elementId 包含 vehicle-card 的元素
    const parts = className.split('-');
    // 取最后 2-3 段作为搜索关键词
    for (let segCount = 3; segCount >= 1; segCount--) {
      const suffix = parts.slice(-segCount).join('-');
      for (const [elemId, styles] of Object.entries(elementStyleMap)) {
        if (elemId.endsWith(suffix) || elemId.includes(suffix)) {
          return { elemId, styles };
        }
      }
    }
    // 如果没有语义匹配，返回第一个元素作为兜底
    const firstKey = Object.keys(elementStyleMap)[0];
    return firstKey
      ? { elemId: firstKey, styles: elementStyleMap[firstKey] }
      : null;
  }

export function generateFallbackCssRule(className, styles) {
    if (!styles || Object.keys(styles).length === 0) {
      return `.${className} {\n  /* TODO: 请根据设计稿补充样式 */\n}`;
    }
    const props = [];
    for (const [key, value] of Object.entries(styles)) {
      if (value === undefined || value === null || value === '') continue;
      // 已是 CSS 属性名（含 -）则原样使用；否则把 camelCase 转为 kebab-case
      const cssProp = key.includes('-')
        ? key
        : key.replace(/([A-Z])/g, '-$1').toLowerCase();
      const v = typeof value === 'number' ? String(value) : value;
      props.push(`  ${cssProp}: ${v}`);
    }
    if (props.length === 0) {
      return `.${className} {\n  /* TODO: 请根据设计稿补充样式 */\n}`;
    }
    return `.${className} {\n${props.join(';\n')};\n}`;
  }

export function validateClassNames(
  allFiles,
  componentName,
  classNamesList = null,
  elementStyleMap = null,
  options = {},
) {
    const mismatches = [];
    const lessContent = allFiles['resources/styles/common.less'] || '';

    if (!lessContent) {
      mismatches.push({
        file: 'resources/styles/common.less',
        className: '-',
        message: 'common.less 为空，所有模板 class 将无样式',
      });
      return { mismatches, fixed: false, fallbackCss: null };
    }

    // R0-4/P0-①（2026-09-01）：前缀统一走 resolveClassPrefixId 单一解析器
    // （declare.json componentId 优先，c- 归一化），替换只认实例 ID 形态
    // （c-mc-<ts>-<hash>-）的失效回退正则——R0-4 统一后语义前缀形如 c-env-monitor-*，旧正则恒提取为空。
    const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const fallbackPrefix = componentName
      ? componentName.startsWith('c-')
        ? componentName
        : `c-${componentName}`
      : '';
    const prefixId = resolveClassPrefixId(allFiles, fallbackPrefix);
    // 现行语义前缀 + 历史实例 ID 形态双兼容（老产物仍可被校验）
    const classTokenRx = prefixId
      ? new RegExp(
          `(?:${escapeRegExp(prefixId)}|c-mc-\\d+-[a-f0-9]+)-[a-z0-9-]+`,
          'g',
        )
      : /c-mc-\d+-[a-f0-9]+-[a-z0-9-]+/g;

    //  如果传入了 classNamesList，用它来检查（更快更准）
    // 否则回退到模板扫描：截取 <template> 段，扫描全部字符串字面量中的前缀 class
    // （同时覆盖静态 class="..." 与 :class="{...}"/[...] 绑定；旧实现只认实例 ID 形态已失效）
    const classesToCheck =
      classNamesList && classNamesList.length > 0
        ? classNamesList
        : (() => {
            const result = new Set();
            const vueFiles = Object.entries(allFiles).filter(
              ([p]) => p.endsWith('.vue') && typeof allFiles[p] === 'string',
            );
            for (const [, vueContent] of vueFiles) {
              const tplMatch = vueContent.match(
                /<template[\s\S]*?>([\s\S]*)<\/template>/i,
              );
              const tpl = tplMatch ? tplMatch[1] : vueContent;
              // 引号必须成对（三分支分别匹配），否则 :class="['a','b']" 会被错位
              // 拆成 "[" / ", { " 等碎片，绑定内的 class 全部漏提取（已实锤）
              const strRx = /"([^"]*)"|'([^']*)'|`([^`]*)`/g;
              let match;
              while ((match = strRx.exec(tpl)) !== null) {
                const literal = match[1] ?? match[2] ?? match[3] ?? '';
                const tokens = literal.match(classTokenRx);
                if (tokens) tokens.forEach((c) => result.add(c));
              }
            }
            return [...result];
          })();

    // 检查每个 class 是否在 common.less 中有定义
    const missingClasses = [];
    for (const cn of classesToCheck) {
      if (
        !lessContent.includes('.' + cn + ' ') &&
        !lessContent.includes('.' + cn + '{') &&
        !lessContent.includes('.' + cn + ',') &&
        !lessContent.includes('.' + cn + ':') &&
        !lessContent.includes('.' + cn + '\n') &&
        !lessContent.includes('.' + cn + '\r')
      ) {
        missingClasses.push(cn);
      }
    }

    if (missingClasses.length > 0) {
      for (const cn of missingClasses) {
        mismatches.push({
          file: 'resources/styles/common.less',
          className: cn,
          message: `模板中使用了 .${cn}，但 common.less 中未定义`,
        });
      }
    }

    // 反向校验（P0-①，2026-09-01）：common.less 定义了但模板未引用的 class → WARN。
    // 与正向共用同一 prefixId 同源解析，杜绝「正向 A 口径、反向 B 口径」漂移；
    // 仅 WARN 不阻断（可能是冗余样式或模板漏挂载，需人工/模型确认）。
    if (prefixId) {
      const definedRx = new RegExp(
        `\\.(${escapeRegExp(prefixId)}-[a-z0-9-]+)`,
        'g',
      );
      const definedClasses = new Set();
      let dm;
      while ((dm = definedRx.exec(lessContent)) !== null) {
        definedClasses.add(dm[1]);
      }
      const templateSet = new Set(classesToCheck);
      for (const dc of definedClasses) {
        if (!templateSet.has(dc)) {
          mismatches.push({
            file: 'resources/styles/common.less',
            className: dc,
            message: `common.less 中定义了 .${dc}，但模板未引用（冗余样式或模板漏挂载）`,
            reverse: true,
          });
        }
      }
    }

    //  自动修复 — 为缺失的 class 生成 fallback CSS 规则
    let fallbackCss = null;
    if (
      missingClasses.length > 0 &&
      elementStyleMap &&
      Object.keys(elementStyleMap).length > 0
    ) {
      const fallbackRules = [];
      for (const cn of missingClasses) {
        const mapping = reverseMapClassToElement(cn, elementStyleMap);
        if (mapping) {
          fallbackRules.push(
            `/* [自动修复] 模板 class .${cn} → 匹配元素 ${mapping.elemId} */`,
          );
          fallbackRules.push(generateFallbackCssRule(cn, mapping.styles));
        } else {
          fallbackRules.push(
            `/* [自动修复] 模板 class .${cn} → 未匹配到元素，请手动补充样式 */`,
          );
          fallbackRules.push(`.${cn} {\n  /* TODO: 请根据设计稿补充样式 */\n}`);
        }
      }
      fallbackCss = fallbackRules.join('\n\n');

      options.logger?.info?.('自动生成 fallback CSS 规则', {
        missingCount: missingClasses.length,
        generatedCount:
          fallbackRules.filter((r) => !r.includes('TODO')).length / 2,
        cssLength: fallbackCss.length,
      });
    }

    return { mismatches, fixed: fallbackCss !== null, fallbackCss };
  }

export function validateContainerSize(code, rootWidth, rootHeight, options = {}) {
    const {
      code: fixedCode,
      warnings,
      fixed,
    } = _validateContainerSizePure(code, rootWidth, rootHeight);
    if (fixed > 0) {
      options.logger?.info?.(
        `🔧 Phase 2 T06: 已自动修正 ${fixed} 处 BBox fallback（子容器尺寸 → auto）`,
      );
    }
    if (warnings && warnings.length > 0) {
      options.logger?.warn?.('🔧 Phase 2 T06: 容器尺寸校验发现异常', {
        warnings,
        fixed,
      });
    }
    return { code: fixedCode, warnings, fixed };
  }

export function validateResourceUsage(code, options = {}) {
    const { warnings } = _validateResourceUsagePure(code);
    if (warnings && warnings.length > 0) {
      options.logger?.warn?.('🔧 Phase 2 T07: 资源引用校验发现异常', { warnings });
    }
    return { code, warnings };
  }

// ══════════════════════════════════════════════════════════════
// L0-B 生成后大后处理（原 validateAndFixGeneratedFiles，2026-08-30 迁移）
// 依赖经 options 注入（主类方法引用 + 模块常量）
// ══════════════════════════════════════════════════════════════

export async function validateAndFixGeneratedFiles(
  files,
  componentName,
  outputPath,
  backgroundBrightness = 'dark',
  displayName = null,
  nodeData = null,
  options = {},
) {
    const fixedFiles = {};

    // 🛡️ Class 命名规范（#75）：剥离「内部 class」上的超长实例 ID 前缀，并确保根容器携带 c-mc-max-{id}
    // 必须在 _fixId / CODE-003 autoFix 之前执行：先去掉过度前缀，再让后续修复基于正确的短语义 class 工作。
    const _instanceId = options.getInstanceId(componentName, outputPath);
    if (_instanceId) {
      const _rootClass = `c-${_instanceId}`;
      for (const [fp, fc] of Object.entries(files)) {
        if (typeof fc !== 'string') continue;
        const isVue = fp.endsWith('.vue');
        const isStyle = /\.(less|css)$/.test(fp);
        if (!isVue && !isStyle) continue;
        let stripped = options.stripInstanceIdPrefix(fc, _instanceId);
        if (fp === 'package/index.vue' || fp.endsWith('/package/index.vue')) {
          stripped = options.ensureRootInstanceId(stripped, _rootClass);
        }
        // 🛡️ 引号裸 key（剥离实例 ID 前缀后，:class 里的 key 仍可能含连字符，如 c-monitor-active，
        // 必须加引号否则 compiler-sfc 报 Unexpected token → Vite 500 → 预览 Failed to fetch）
        if (isVue) {
          stripped = options.quoteBareObjectKeysInVue(stripped);
        }
        if (stripped !== fc) fixedFiles[fp] = stripped;
      }
    }

    // ⚠️ fixes 必须在此声明：下方 CONTEXT-LEAK 门禁与 declare.json 后校验等
    //    十余处都会往里 push。此前清理重复声明时误删了唯一的声明，导致
    //    "fixes is not defined" 使整轮生成失败（mc-max-1787912301033 实锤）。
    const fixes = [];

    // 🛡️ LLM 上下文泄漏检测与剥离（2026-08-28 mc-1787904543641-38cfa308 实锤）
    //   LLM 有时会在 </template> 与 <script> 之间输出「关键说明/资源使用/布局结构」等提示词文本，
    //   导致：① LESS 编译器遇到非法输入报 Unrecognised input → 预览失败；② 代码中混入无意义中文。
    //   检测规则：最后一个 </template> 之后、<script 或 <style> 之前，若出现含中文说明性标记的文本
    //   （关键说明/资源使用/base-panel 插槽/布局结构/class 命名/交互占位），且非代码行占比 >70%，判定为泄漏并自动剔除。
    for (const [fp, fc] of Object.entries(files)) {
      if (!fp.endsWith('.vue') || typeof fc !== 'string') continue;
      const lastTplEnd = fc.lastIndexOf('</template>');
      if (lastTplEnd < 0) continue;
      const nextBlockMatch = fc.slice(lastTplEnd).match(/<(?:script|style)\s/i);
      if (!nextBlockMatch) continue;
      const nextBlockStart = lastTplEnd + nextBlockMatch.index;
      const leak = fc.slice(lastTplEnd + '</template>'.length, nextBlockStart);
      const hasLeakMarker =
        /关键说明|资源使用|base-panel\s*插槽|布局结构|class\s*命名|交互占位|^\s*\d+\.\s*\*\*/.test(
          leak,
        );
      const codeLines = leak
        .split('\n')
        .filter((l) =>
          /^\s*(import|export|const|let|var|function|class|<|\/|{|}|\/\/|\/\*)/.test(
            l,
          ),
        );
      if (hasLeakMarker && codeLines.length < leak.split('\n').length * 0.3) {
        const cleaned =
          fc.slice(0, lastTplEnd + '</template>'.length) +
          '\n' +
          fc.slice(nextBlockStart);
        fixedFiles[fp] = cleaned;
        fixes.push(
          `CONTEXT-LEAK: 已剥离 </template> 后的 LLM 上下文泄漏（${leak.split('\n').length} 行）`,
        );
        options.logger.warn('🛡️ 检测到 LLM 上下文泄漏并已自动剥离', {
          file: fp,
          leakLines: leak.split('\n').length,
        });
      }
    }

    // ==================== v3.6: declare.json 后校验 ====================
    const declarePath = 'declare.json';
    const isMcId = (name) => /^mc-\d{13}-[a-f0-9]+$/i.test(name);

    if (files[declarePath]) {
      try {
        let declareModified = false;
        const parsed = JSON.parse(files[declarePath]);

        // 顶层 schema 默认值归一化（补齐 LLM 漏写的字段，保留已有内容）
        const { declare, changed: normalized } = options.normalizeDeclareJson(
          parsed,
          {
            componentId: parsed.componentId,
            componentName,
            displayName,
            nodeData,
            styleTokens: options.styleTokens || null,
          },
        );
        if (normalized) {
          declareModified = true;
          fixes.push('declare.json 顶层字段缺失，已按默认值归一化补齐');
          options.logger.info('declare.json 顶层 schema 已归一化补齐', {
            componentName,
          });
        }

        // 🛡️ 事件名同源对齐（M5-4/M5-5，2026-09-03 实锤 mc-max-1788413641452）：
        // LLM 代码 publishEvent('monitor-onload') vs declare 声明 'c-monitor-onload'
        // → 运行时要发的事件名以代码为准（declare 声明错名 = 事件断裂 + M5-4 挂）。
        // 对齐规则：① 代码事件名已声明 → 不动；② 与 declare 已有事件呈 'c-'+X 前缀关系
        //   → declare 改名为代码用名（避免双 onload）；③ 完全无关 → 回填声明。
        try {
          const publishEvents = new Set();
          const listenEvents = new Set();
          for (const [fp, fc] of Object.entries(files)) {
            if (!fp.endsWith('.vue') || typeof fc !== 'string') continue;
            for (const m of fc.matchAll(
              /publishEvent\(\s*['"]([\w-]+)['"]/g,
            ))
              publishEvents.add(m[1]);
            for (const m of fc.matchAll(
              /listenEvent\(\s*['"]([\w-]+)['"]/g,
            ))
              listenEvents.add(m[1]);
          }
          const alignEvents = (container, idField, nameField, schemaField, defaultSchema) => {
            if (!container || typeof container !== 'object') return false;
            let mod = false;
            for (const evtName of container === declare.businessEvents ? publishEvents : listenEvents) {
              if (container[evtName]) continue; // ① 已声明
              // ② 'c-'+X 前缀关系（declare 的 c-monitor-onload ↔ 代码 monitor-onload）→ 以代码为准改名
              const prefixKey = Object.keys(container).find(
                (k) => k === `c-${evtName}`,
              );
              if (prefixKey) {
                const evt = container[prefixKey];
                delete container[prefixKey];
                if (evt && typeof evt === 'object') {
                  evt[idField] = evtName;
                  container[evtName] = evt;
                }
                mod = true;
                fixes.push(
                  `declare.json 事件名与代码对齐：${prefixKey} → ${evtName}（以代码 publishEvent/listenEvent 为准）`,
                );
                continue;
              }
              // ③ 无关事件 → 回填声明
              container[evtName] = {
                [idField]: evtName,
                [nameField]: evtName,
                [schemaField]: defaultSchema,
              };
              mod = true;
              fixes.push(
                `declare.json 回填代码事件声明：${evtName}（M5-4/M5-5 一致性）`,
              );
            }
            return mod;
          };
          const beMod = alignEvents(
            declare.businessEvents,
            'eventId',
            'eventName',
            'eventDataSchema',
            {
              componentId: {
                key: 'componentId',
                name: '组件ID',
                type: 'string',
                required: true,
              },
              timestamp: {
                key: 'timestamp',
                name: '时间戳',
                type: 'number',
                required: true,
              },
            },
          );
          const bsMod = alignEvents(
            declare.businessStatuses,
            'statusId',
            'statusName',
            'parameters',
            {},
          );
          if (beMod || bsMod) {
            declareModified = true;
            options.logger.info('declare.json 事件名已与代码对齐', {
              publishEvents: [...publishEvents],
              listenEvents: [...listenEvents],
            });
          }
        } catch (evtErr) {
          options.logger.warn('事件名同源对齐执行失败（非阻断）', {
            error: evtErr?.message || String(evtErr),
          });
        }

        // 1. 检查 componentName 是否是组件ID而非中文显示名
        const hasIdPrefix = (name) => /^(mc-|cp-|mv-|page-)/i.test(name); //  扩展前缀检测
        if (
          hasIdPrefix(declare.componentName) ||
          isMcId(declare.componentName)
        ) {
          // 优先使用传入的 displayName，其次从 visualElements 提取，最后从 Figma header 提取
          let fixName = displayName;
          if (!fixName || hasIdPrefix(fixName) || isMcId(fixName)) {
            // 🔥 尝试从 Figma 节点树中提取 panel-header 标题
            fixName = nodeData ? options.extractHeaderTitle(nodeData) : null;
          }
          if (!fixName || hasIdPrefix(fixName) || isMcId(fixName)) {
            fixName = declare.componentId || componentName;
          }
          // 如果 fixName 仍是组件ID前缀格式，回退用短标识
          if (hasIdPrefix(fixName) || isMcId(fixName)) {
            fixName = componentName
              .replace(/^(mc|cp|mv)-\d{13}-/, '')
              .substring(0, 8);
            fixes.push(
              `⚠️ declare.json componentName 缺少中文显示名，使用后缀 "${fixName}" 作为临时名称`,
            );
          }

          declare.componentName = fixName;
          declareModified = true;
          fixes.push(
            `declare.json componentName 含前缀 "${declarePath.match(/^(mc|cp|mv)-/)?.[0] || 'unknown'}-"，已自动替换为显示名称: "${fixName}"`,
          );
          options.logger.info('declare.json componentName 已自动修复', {
            original: componentName,
            to: fixName,
          });
        }

        //  修复空的 eventDataSchema（注入默认 componentId + timestamp）
        // 注：normalizeDeclareJson 已确保 businessEvents 为 object 结构（array 已转换）
        // 此处仅处理 eventDataSchema 为空对象的情况
        if (
          declare.businessEvents &&
          typeof declare.businessEvents === 'object' &&
          !Array.isArray(declare.businessEvents)
        ) {
          for (const [eventId, evt] of Object.entries(declare.businessEvents)) {
            if (
              evt &&
              evt.eventDataSchema &&
              typeof evt.eventDataSchema === 'object' &&
              Object.keys(evt.eventDataSchema).length === 0
            ) {
              evt.eventDataSchema = {
                componentId: declare.componentId || componentName,
                timestamp: '${new Date().toISOString()}',
              };
              declareModified = true;
              fixes.push(
                `declare.json businessEvents[${eventId}].eventDataSchema 为空，已自动注入 componentId + timestamp`,
              );
              options.logger.info('declare.json eventDataSchema 已自动修复', {
                eventId,
              });
            }
          }
        }

        if (declareModified) {
          fixedFiles[declarePath] = JSON.stringify(declare, null, 2);
        }
      } catch (e) {
        options.logger.warn('无法解析 declare.json 进行后校验', {
          error: e.message,
        });
      }
    }
    // ==================== End v3.6 ====================
    // 1. 检查并修复主题文件
    const themeFiles = {
      'resources/styles/themes/dark.less': options.themeWrapperTemplates.dark,
      'resources/styles/themes/light.less': options.themeWrapperTemplates.light,
      'resources/styles/themes/theme-vars.less': `// 主题变量和 mixins（自动生成兜底）
.common() {
  // 跨主题共享变量
  @fontSize: 14px; // 字体缩放基准令牌（M5-6：业务样式 font-size 必须引用 @fontSize；与根容器 var(--fontSize, 14px) 对齐）
}
.theme-dark() {
  // 深色主题变量
}
.theme-light() {
  // 浅色主题变量
}
// 默认主题在 index.less 的根作用域调用（.common() + .theme-dark()/.theme-light()）。
`,
    };

    for (const [path, defaultContent] of Object.entries(themeFiles)) {
      if (!files[path]) {
        fixedFiles[path] = defaultContent;
        fixes.push(`缺少文件: ${path}，已自动创建`);
      }
    }

    // 1.45 🏢 透明底确定性兜底（M6-3a/3b，一体化平台要求；2026-08-30）
    // 组件内容是透明底：<base-panel> 及其首子元素**禁止**任何内联背景样式
    // （背景由平台统一管理，重复生成会导致双层背景/底色不透明）。
    // 确定性实现（不依赖 LLM 遵守 prompt）：正则剥离内联 background 相关样式。
    {
      const idxPath = 'package/index.vue';
      const idxContent = fixedFiles[idxPath] ?? files[idxPath];
      if (typeof idxContent === 'string' && idxContent.includes('<base-panel')) {
        const stripInlineBg = (tag) => {
          if (!tag) return tag;
          // 移除 style 属性内的 background / background-color / background-image
          let out = tag.replace(
            /style\s*=\s*(["'])([\s\S]*?)\1/gi,
            (m, q, body) => {
              const cleaned = body
                .split(';')
                .map((p) => p.trim())
                .filter((p) => p && !/^background(-color|-image|-size|-repeat|-position)?\s*:/i.test(p))
                .join('; ');
              const trimmed = cleaned.replace(/;\s*$/, '').trim();
              if (!trimmed) return ''; // style 属性清空则整体移除
              return `style=${q}${trimmed}${q}`;
            },
          );
          // 兜底：style 属性残留空引号时移除
          out = out.replace(/\s+style\s*=\s*["']\s*["']/g, '');
          return out;
        };
        const before = idxContent;
        // ① base-panel 开标签
        let content = idxContent.replace(/<base-panel\b[^>]*>/gi, (tag) => stripInlineBg(tag));
        // ② base-panel 首子元素（首个非空白子标签）
        const firstChildMatch = content.match(/<base-panel\b[^>]*>\s*<([a-zA-Z][\w-]*)\b[^>]*>/i);
        if (firstChildMatch) {
          const childOpenTag = firstChildMatch[0].slice(firstChildMatch[0].lastIndexOf('<'));
          const strippedChild = stripInlineBg(childOpenTag);
          if (strippedChild !== childOpenTag) {
            content = content.replace(childOpenTag, strippedChild);
          }
        }
        if (content !== before) {
          fixedFiles[idxPath] = content;
          fixes.push(
            '🏢 M6-3a/3b: 已剥离 <base-panel> 及首子元素的内联背景样式（组件内容透明底，背景由平台统一管理）',
          );
          options.logger?.info?.('🏢 透明底兜底：剥离 base-panel 内联背景', {
            file: idxPath,
          });
        }
      }
    }

    // 1.5 强制矫正 index.less（治本，2026-08-26）
    //     🐛 旧架构：index.less 只 @import dark.less/light.less，两者把 common.less 包进 `.dark`/`.light`
    //        作用域；但宿主 base-panel / 前端预览从不给组件根注入 .dark/.light 类，
    //        编译产物 `.dark .c-xxx` 在真实 DOM 上 0 命中 → 组件样式 100% 失效（布局在但全裸）。
    //     ✅ 新架构：根作用域先调用默认主题 mixin，再导入 common.less，规则落到根作用域必然命中。
    //     判定「已合规」= 同时出现根级主题 mixin 调用 与 根级 common.less 导入；否则整份重写。
    {
      const indexLessPath = 'resources/styles/index.less';
      const indexLessContent = files[indexLessPath];
      const expectedIndexLess =
        options.buildIndexLessTemplate(backgroundBrightness);
      if (typeof indexLessContent !== 'string' || !indexLessContent.trim()) {
        fixedFiles[indexLessPath] = expectedIndexLess;
        fixes.push('index.less 缺失或为空，已按根作用域默认主题模板生成');
      } else {
        // 根级（行首无缩进）主题 mixin 调用 + 根级 common.less 导入
        const hasRootThemeCall = /^\.theme-(dark|light)\s*\(\s*\)\s*;/m.test(
          indexLessContent,
        );
        const hasRootCommonImport =
          /^@import\s+(\(multiple\)\s+)?['"]\.\/common\.less['"]\s*;/m.test(
            indexLessContent,
          );
        if (!hasRootThemeCall || !hasRootCommonImport) {
          fixedFiles[indexLessPath] = expectedIndexLess;
          fixes.push(
            `index.less 样式未落到根作用域（rootThemeCall=${hasRootThemeCall} rootCommonImport=${hasRootCommonImport}），` +
              '已重写为根作用域默认主题模板，避免 .dark/.light 嵌套导致全部样式失效',
          );
          options.logger.warn(
            '🎨 index.less 已强制矫正为根作用域默认主题（LESS-SCOPE-002）',
            {
              componentName,
              backgroundBrightness,
              hasRootThemeCall,
              hasRootCommonImport,
            },
          );
        }
      }
    }

    // 1.52 字体 @fontSize 化（微码组件专用，支撑微前端整组件等比缩放；Vue3 走空占位+自定义 @xxx 约定，跳过）
    //   ① 根容器 `.c-xxx-root` 的 font-size 统一为 var(--fontSize, 14px)（平台已向组件根注入 --fontSize，14px 为设计稿基准兜底）
    //   ② 业务样式（common.less 与 .vue <style>）中 font-size: Npx → calc(@fontSize * 系数)（相对根基准 14px，直接引用 @fontSize 变量，
    //      符合一体化规范 M5-6「必须使用 @fontSize 变量（或 calc(@fontSize * N)）」字面写法，非 em）
    //   默认视图像素级等于原 px 设计稿（1@fontSize=14px）；宿主覆写该组件根 --fontSize 即整体缩放。
    //   注：@fontSize 在 theme-vars.less .common() 内定义（=14px），中间容器不应自带 font-size（用 inherit），避免复利叠加。
    if (options.componentType !== 'vue3') {
      const BASE = 14;
      const pxToFontSize = (content) =>
        typeof content === 'string'
          ? content.replace(
              /font-size\s*:\s*(\d+(?:\.\d+)?)px/g,
              (m, n) => {
                const ratio = (parseFloat(n) / BASE).toFixed(4);
                // 恰好等于基准 → 直接用 @fontSize；否则 calc(@fontSize * 系数)
                return ratio === '1.0000'
                  ? 'font-size: @fontSize'
                  : `font-size: calc(@fontSize * ${ratio})`;
              },
            )
          : content;
      for (const fp of Object.keys(files)) {
        if (!fp.endsWith('.less') && !fp.endsWith('.vue')) continue;
        const c0 = fixedFiles[fp] ?? files[fp];
        if (typeof c0 !== 'string') continue;
        let c = c0;
        // ① 根容器：font-size 统一为 var(--fontSize, 14px)（先清掉已有 px/字面量再注入，确保由变量驱动）
        c = c.replace(
          /(\.c-[\w-]*root\s*)\{([^}]*)\}/g,
          (full, sel, body) => {
            const stripped = body.replace(/font-size\s*:[^;]+;/g, '').trim();
            return `${sel}{${stripped ? stripped + '\n  ' : ''}font-size: var(--fontSize, 14px);`;
          },
        );
        // ② 其余 font-size: Npx → @fontSize / calc(@fontSize * 系数)（相对根基准 14px）
        c = pxToFontSize(c);
        if (c !== c0) {
          fixedFiles[fp] = c;
          if (!fixes.some((f) => f.startsWith('字体 @fontSize 化')))
            fixes.push(
              '字体 @fontSize 化：内部 font-size 转 @fontSize / calc(@fontSize * 系数)（基准 14px），根由 --fontSize 驱动，支撑微前端整体缩放',
            );
        }
      }
    }

    // 1.55 展开 common.less 的外层包裹（LESS-SCOPE-003，治本配套）
    //      模型偶尔把全部业务 class 包进 `.dark {}` / `.light {}` / 组件根 class 里，
    //      编译后变成 `.dark .c-xxx`（真实 DOM 0 命中）或多一层无谓后代选择器。
    //      判定：整个文件只有一个顶层块，且块选择器是 .dark/.light/&.dark/&.light → 直接剥掉外壳。
    {
      const commonLessPath = 'resources/styles/common.less';
      const commonLessContent =
        fixedFiles[commonLessPath] ?? files[commonLessPath];
      if (typeof commonLessContent === 'string' && commonLessContent.trim()) {
        const unwrapped = options.unwrapThemeScopedCommonLess(commonLessContent);
        if (unwrapped.changed) {
          fixedFiles[commonLessPath] = unwrapped.source;
          fixes.push(
            `common.less 的业务样式被 \`${unwrapped.wrapper}\` 整体包裹，已剥离外壳使规则落到根作用域`,
          );
          options.logger.warn(
            '🎨 common.less 外层主题包裹已剥离（LESS-SCOPE-003）',
            {
              componentName,
              wrapper: unwrapped.wrapper,
            },
          );
        }
      }
    }

    // 1.6 强制子组件根 class 有 width: 100%（防止布局坍缩）
    //     遍历 package/components/*.vue，检查 <style> 里的根 class 是否有 width 声明
    //     没有就注入 width: 100%
    for (const [filePath, fileContent] of Object.entries(files)) {
      if (
        !filePath.startsWith('package/components/') ||
        !filePath.endsWith('.vue')
      )
        continue;
      if (!fileContent || typeof fileContent !== 'string') continue;

      // 提取根 class 名（第一个 .class-name { ）
      const styleMatch = fileContent.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
      if (!styleMatch) continue;
      const styleContent = styleMatch[1];
      const rootClassMatch = styleContent.match(/^\s*\.([\w-]+)\s*\{/m);
      if (!rootClassMatch) continue;
      const rootClassName = rootClassMatch[1];

      // 检查该 class 是否已有 width 声明
      const rootClassBlockRegex = new RegExp(
        `\\.${rootClassName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\s*\\{([^}]*)\\}`,
        'm',
      );
      const blockMatch = styleContent.match(rootClassBlockRegex);
      if (!blockMatch) continue;
      const blockContent = blockMatch[1];

      // 如果缺少 width 声明，注入 width: 100%
      if (!/width\s*:/.test(blockContent)) {
        const fixedContent = styleContent.replace(
          rootClassBlockRegex,
          (match, p1) => match.replace(p1, `  width: 100%;\n${p1}`),
        );
        const fixedFile = fileContent.replace(
          /(<style[^>]*>)([\s\S]*?)(<\/style>)/i,
          (m, open, content, close) => `${open}${fixedContent}${close}`,
        );
        fixedFiles[filePath] = fixedFile;
        fixes.push(
          `子组件 ${filePath} 根 class .${rootClassName} 缺少 width，已注入 width: 100%`,
        );
      }
    }

    // 2. 检查并修复 package/index.vue
    const indexVuePath = 'package/index.vue';
    if (files[indexVuePath] || fixedFiles[indexVuePath]) {
      let content = fixedFiles[indexVuePath] ?? files[indexVuePath];
      let modified = false;

      // 🛡️ vue3 任务跳过微码专属自动修复与告警：$mcComponentBuilder/runtimeBuilder/componentProps
      // 是微码运行时 API，vue3 预览环境未注入这些全局变量，引用会报 "Cannot read properties
      // of undefined (reading 'title')"（mv-max 1787566005737 实测）。Vue3Engineer 继承 buildCodePrompt
      // 而未重写，导致模型被指示用微码 API；此处统一在 post-fix 兜底跳过微码专属项，
      // 并对存在 $mcComponentBuilder 引用的 vue3 产物做安全替换（避免渲染崩溃）。
      const isVue3 = options.componentType === 'vue3';
      if (isVue3 && content.includes('$mcComponentBuilder')) {
        content = content.replace(
          /\$mcComponentBuilder\(\)/g,
          '({ componentProps: {}, businessProps: {}, runtimeBuilder: null, componentApi: null })',
        );
        content = content.replace(
          /runtimeBuilder\?\.\s*publishEvent/g,
          '/* vue3 no-op */ null && null',
        );
        modified = true;
        fixes.push(
          'vue3 后处理：已替换 $mcComponentBuilder/runtimeBuilder 为安全兜底，避免运行时 undefined.title',
        );
      }

      // 2.0 检查script标签是否完整闭合（最高优先级）
      const hasScriptOpen = content.includes('<script');
      const hasScriptClose = content.includes('</script>');

      if (hasScriptOpen && !hasScriptClose) {
        fixes.push(
          '🚨 CRITICAL: package/index.vue 的 <script> 标签未闭合，文件生成被截断',
        );
        // 尝试基本修复：添加闭合标签和最小必需内容
        // 🛡️ vue3 分支：只补闭合标签，禁止注入 $mcComponentBuilder 微码样板（vue3 环境未注入该全局）
        if (isVue3) {
          content += '\n</script>';
          modified = true;
          fixes.push('vue3：已自动添加 </script> 闭合标签（不注入微码样板）');
        } else if (!content.includes('$mcComponentBuilder')) {
          content += `\n\n// 组件配置\nconst componentProps = {}\n\nlet runtimeBuilder = null\ntry {\n  runtimeBuilder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder().runtimeBuilder : null\n} catch (e) {\n  runtimeBuilder = null\n}\n\nonMounted(() => {\n  runtimeBuilder?.publishEvent?.('\${componentName}-onload', {\n    componentId: '\${componentName}',\n    timestamp: Date.now()\n  })\n})\n</script>`;
          modified = true;
          fixes.push('已自动补全 script 内容和闭合标签');
        } else {
          content += '\n</script>';
          modified = true;
          fixes.push('已自动添加 </script> 闭合标签');
        }
      }

      // 2.1 L0-B 自动修复：CODE-001（style 标签属性）+ CODE-002（@import index.less）
      if (content.includes('<style')) {
        const { autoFixStyleTag } =
          await import('../../validators/code-structure-validator.js');
        const styleFixResult = autoFixStyleTag(content, indexVuePath);
        if (styleFixResult.fixes.length > 0) {
          content = styleFixResult.content;
          modified = true;
          fixes.push(
            ...styleFixResult.fixes.map((f) => `package/index.vue: ${f}`),
          );
        }
      } else {
        // 完全没有 style 块 → 追加完整块
        const styleBlock = `\n<style lang="less" scoped>\n@import '../resources/styles/index.less';\n</style>`;
        content = content + styleBlock;
        modified = true;
        fixes.push(
          'package/index.vue 缺少 <style lang="less" scoped> 块，已自动添加',
        );
      }

      // 兜底：autoFixStyleTag 未覆盖的路径（如引号风格不同）
      if (
        !content.includes("@import '../resources/styles/index.less';") &&
        !content.includes('@import "../resources/styles/index.less";')
      ) {
        const nextContent = options.ensureIndexVueStyleImport(content);
        if (nextContent !== content) {
          content = nextContent;
          modified = true;
          fixes.push(
            "package/index.vue 缺少 @import '../resources/styles/index.less';，已自动补齐",
          );
        }
      }

      // 2.2 验证 $mcComponentBuilder 调用方式（vue3 跳过：微码专属 API）
      if (!isVue3 && content.includes('$mcComponentBuilder')) {
        // 检查是否正确解构
        if (
          !content.includes('const { runtimeBuilder }') &&
          !content.includes('const {runtimeBuilder}')
        ) {
          fixes.push(
            '⚠️ $mcComponentBuilder 调用方式不规范：未正确解构 { runtimeBuilder }',
          );
        }
        // 检查是否在 onMounted 中触发 onload 事件
        if (
          !content.includes('runtimeBuilder.publishEvent') ||
          !content.includes('onload')
        ) {
          fixes.push(
            '⚠️ 未在 onMounted 中正确触发 onload 事件（应使用 runtimeBuilder.publishEvent）',
          );
        }
      } else {
        fixes.push('⚠️ package/index.vue 缺少 $mcComponentBuilder 调用');
      }

      // 2.3 验证 RESOURCE_UTILIZATION（检查是否使用了资源变量）
      // 检查是否有 CSS gradient 但没有使用背景资源
      if (
        content.includes('linear-gradient') ||
        content.includes('radial-gradient')
      ) {
        if (!content.includes('import bg') && !content.includes(':src="bg')) {
          fixes.push(
            '⚠️ RESOURCE_UTILIZATION 违规：使用了 CSS gradient 但可能应该使用已下载的背景资源（bg1, bg2等）',
          );
        }
      }

      const buttonFixResult = options.rewriteClickableIconDivsToButtons(content);
      if (buttonFixResult.changed) {
        content = buttonFixResult.content;
        modified = true;
        fixes.push(
          `package/index.vue 已将 ${buttonFixResult.count} 个明显可点击图标容器 div 自动改为 button`,
        );
      }

      const basePanelFixResult = options.stripBasePanelShellLeak(content);
      if (basePanelFixResult.changed) {
        content = basePanelFixResult.content;
        modified = true;
        fixes.push(
          `package/index.vue 已移除 ${basePanelFixResult.removedCount} 处 base-panel 外壳泄漏结构`,
        );
      }

      if (modified) {
        fixedFiles[indexVuePath] = content;
      }
    }

    // 3. 检查 resources/styles/common.less（如果为空或过小，添加基础内容）
    // ⚠️ 注意：此处必须用真实模板插值 \${componentName}（非字面量），确保兜底 class 名包含真实组件 ID
    const commonLessPath = 'resources/styles/common.less';
    if (!files[commonLessPath] || files[commonLessPath].trim().length < 10) {
      const safeName =
        options.deriveClassPrefix({
          displayName,
          figmaNodeData: nodeData,
          componentId: componentName,
        }) || 'unknown';
      fixedFiles[commonLessPath] =
        `// 通用样式（common.less 兜底模板 - 模型输出为空时自动补齐）
// ⚠️ 此为最小兜底内容，建议模型根据设计稿补充具体 class 规则
.c-${safeName}-root {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  position: relative;
}

.c-${safeName}-content {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}
`;
      fixes.push(
        `resources/styles/common.less 为空或过小，已添加兜底内容（含 .c-${safeName}-root / .c-${safeName}-content）`,
      );
    }

    // 4. 检查并修复 LLM 截断 componentId 的 class name（常见：长数字 ID 被少抄）
    const _fixId = (content, path) => {
      if (!content || typeof content !== 'string') return content;
      // 匹配 .c-mc-NNNNNNNNNNNN-XXXXXXXX 格式的 class name
      const idRx = /\.c-(mc-\d+-\w+)(?=-)/g;
      let result = content;
      let match;
      let replaced = false;
      while ((match = idRx.exec(content)) !== null) {
        const found = match[1];
        if (found !== componentName) {
          // LLM 截断了 componentId，全局替换
          const esc = found.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          result = result.replace(new RegExp(esc, 'g'), componentName);
          replaced = true;
          fixes.push(
            `class name 中 componentId 被 LLM 截断: "${found}" → "${componentName}"（${path}），已自动修复`,
          );
        }
      }
      return replaced ? result : null;
    };

    const ALL_STYLE_EXTS = new Set(['vue', 'less', 'css']);
    const mergedFiles = { ...files, ...fixedFiles }; // fixedFiles 优先
    for (const [path, content] of Object.entries(mergedFiles)) {
      const ext = path.split('.').pop();
      if (!ALL_STYLE_EXTS.has(ext)) continue;
      const fixed = _fixId(content, path);
      if (fixed !== null) {
        fixedFiles[path] = fixed;
      }
    }

    // 2.6 子组件 CODE-001/CODE-002 自动修复（与主组件对齐）
    // 遍历所有 .vue 文件，对子组件调用 autoFixStyleTag
    for (const [filePath, fileContent] of Object.entries(mergedFiles)) {
      if (!filePath.endsWith('.vue') || filePath === 'package/index.vue')
        continue;
      if (
        !filePath.includes('/components/') &&
        !filePath.startsWith('components/')
      )
        continue;

      const { autoFixStyleTag } =
        await import('../../validators/code-structure-validator.js');
      const styleFixResult = autoFixStyleTag(fileContent, filePath);
      if (styleFixResult.fixes.length > 0) {
        fixedFiles[filePath] = styleFixResult.content;
        fixes.push(...styleFixResult.fixes.map((f) => `${filePath}: ${f}`));
      }
    }

    // 2.7 CODE-003 自动修复：common.less class 前缀
    // 检测 common.less 中无前缀的 class，自动加上 .c-{componentId}-
    if (mergedFiles[commonLessPath]) {
      const { autoFixPrefixViolations, resolveClassPrefixId } =
        await import('../../validators/code-structure-validator.js');
      const vueFilesForFix = Object.entries(mergedFiles)
        .filter(([p]) => p.endsWith('.vue'))
        .map(([p, c]) => ({ path: p, content: c }));

      // 🛡️ prefixId 必须与 L0-B 检查器（checkCodeStructure）同源——以 declare.json 的
      // componentId 为准（如 c-monitor），而非 sessionId/实例 ID 派生的长名（如 c-mc-max-...-c72885db）。
      // 旧实现用 componentName（= 实例 ID mc-max-...）做前缀，会把正确类 .c-monitor-root 二次加前缀成
      // .c-mc-max-...-c-monitor-root，导致 .vue/.less 错配、预览 RUNTIME-004 render-error，
      // 也是「class 名过长」这一用户反馈的根因。
      // R0-4（2026-09-01）：统一走 resolveClassPrefixId 单一解析器（declare.json componentId 优先，
      // 与 L0-B 完全同源）；declare.json 缺失时回退 deriveClassPrefix 的派生语义名
      // （其内部已剥离 mc- 前缀/中文映射，不会产出实例 ID 长名，不再需要 'component' 硬兜底）。
      const prefixId = resolveClassPrefixId(
        mergedFiles,
        options.deriveClassPrefix({
          displayName,
          figmaNodeData: nodeData,
          componentId: componentName,
        }),
      );

      const prefixFixResult = autoFixPrefixViolations(
        mergedFiles[commonLessPath],
        prefixId,
        vueFilesForFix,
      );

      if (prefixFixResult.fixedClasses.length > 0 || prefixFixResult.collapsed > 0) {
        fixedFiles[commonLessPath] = prefixFixResult.commonLess;
        if (prefixFixResult.fixedClasses.length > 0) {
          fixes.push(
            `CODE-003: common.less 中 ${prefixFixResult.fixedClasses.length} 个 class 已补齐前缀 .${componentName}-: ${prefixFixResult.fixedClasses.slice(0, 3).join(', ')}${prefixFixResult.fixedClasses.length > 3 ? '...' : ''}`,
          );
        }
        // 🛡️ 刀 8c（2026-09-13）：历史「组件前缀重复叠加」病灶就地折叠（幂等自愈）
        if (prefixFixResult.collapsed > 0) {
          fixes.push(
            `CODE-003-FOLD: 已折叠 ${prefixFixResult.collapsed} 处重复组件前缀（<stem>-<slug>-<stem>-x → <stem>-x）`,
          );
        }

        // 联动修复的 .vue 文件
        for (const vueFile of prefixFixResult.vueFiles) {
          const originalContent = mergedFiles[vueFile.path];
          if (originalContent !== vueFile.content) {
            fixedFiles[vueFile.path] = vueFile.content;
          }
        }
      }
    }

    // 2.8 FLEX-002 自动修复：移除冗余的 flex column
    // 检测 style 块中无子属性的 flex column，自动移除
    for (const [filePath, fileContent] of Object.entries(mergedFiles)) {
      if (!filePath.endsWith('.vue') && !filePath.endsWith('.less')) continue;

      const styleMatches =
        fileContent.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) || [];
      let modifiedContent = fileContent;

      for (const styleTag of styleMatches) {
        const bodyMatch = styleTag.match(/>([\s\S]*?)<\/style>/i);
        if (!bodyMatch) continue;
        const styleBody = bodyMatch[1];

        const { autoFixRedundantFlex } =
          await import('../../validators/code-structure-validator.js');
        const flexFixResult = autoFixRedundantFlex(styleBody);

        if (flexFixResult.fixed > 0) {
          modifiedContent = modifiedContent.replace(
            styleTag,
            styleTag.replace(styleBody, flexFixResult.content),
          );
          fixes.push(
            `FLEX-002: ${filePath} 移除 ${flexFixResult.fixed} 处冗余 flex column（无子属性）`,
          );
        }
      }

      if (modifiedContent !== fileContent) {
        fixedFiles[filePath] = modifiedContent;
      }
    }

    // 2.9 VERT-001/002/003 竖排布局反截断 autoFix（治本 2026-09-04）
    // 竖排侧栏按钮「只显示单字 / 断列 / 长标签只显示首行」兜底：
    //   VERT-001 writing-mode 竖排缺 nowrap → 补（防 供配电→电供/配 断列）
    //   VERT-002 导航语义文本截断三件套（ellipsis/overflow:hidden/min-width:0）→ 移除
    //   VERT-003 导航块固定 height 无 min-height → 降级 min-height（防 交通诱导只显示「交通」）
    // 目标文件：common.less 全文 + 各 .vue <style> 体（scoped 也覆盖，与 2.8 同遍历面）
    {
      const { autoFixVerticalLayout } =
        await import('../../utils/vertical-layout-guard.js');

      // ① common.less 全文
      const commonLessPath2 = 'resources/styles/common.less';
      const commonLessContent2 =
        fixedFiles[commonLessPath2] ?? mergedFiles[commonLessPath2];
      if (typeof commonLessContent2 === 'string' && commonLessContent2.trim()) {
        const vFix = autoFixVerticalLayout(commonLessContent2, {
          filePath: commonLessPath2,
        });
        if (vFix.fixes.length > 0) {
          fixedFiles[commonLessPath2] = vFix.content;
          for (const f of vFix.fixes) {
            fixes.push(
              `${f.code}: ${commonLessPath2} [${f.selector}] ${f.detail}`,
            );
          }
        }
      }

      // ② 各 .vue <style> 体
      for (const [filePath, fileContent] of Object.entries(mergedFiles)) {
        if (!filePath.endsWith('.vue')) continue;
        const styleMatches2 =
          fileContent.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) || [];
        let modifiedContent2 = fileContent;
        for (const styleTag of styleMatches2) {
          const bodyMatch2 = styleTag.match(/>([\s\S]*?)<\/style>/i);
          if (!bodyMatch2) continue;
          const styleBody2 = bodyMatch2[1];
          const vFix = autoFixVerticalLayout(styleBody2, { filePath });
          if (vFix.fixes.length > 0) {
            modifiedContent2 = modifiedContent2.replace(
              styleTag,
              styleTag.replace(styleBody2, vFix.content),
            );
            for (const f of vFix.fixes) {
              fixes.push(`${f.code}: ${filePath} [${f.selector}] ${f.detail}`);
            }
          }
        }
        if (modifiedContent2 !== fileContent) {
          fixedFiles[filePath] = modifiedContent2;
        }
      }
    }

    // 2.10 L10 定宽/定高区块归一（Phase 3，2026-09-07）
    // 显式 width/height 的区块强制 flex: 0 0 auto，防止 flex-grow 撑破尺寸
    {
      const { normalizeFixedSizeFlex } = await import('../../utils/fixed-size-normalizer.js');
      const commonLessPath3 = 'resources/styles/common.less';
      const commonLessContent3 = fixedFiles[commonLessPath3] ?? mergedFiles[commonLessPath3];
      
      if (typeof commonLessContent3 === 'string' && commonLessContent3.trim()) {
        // 推断组件前缀（用于豁免根容器）
        const prefixId = resolveClassPrefixId(mergedFiles, null, { fallbackToDerive: true });
        const { content: normalizedContent, normalized } = normalizeFixedSizeFlex(commonLessContent3, prefixId);
        
        if (normalized.length > 0) {
          fixedFiles[commonLessPath3] = normalizedContent;
          fixes.push(
            `L10: ${commonLessPath3} 归一化 ${normalized.length} 处定宽/定高区块 flex 属性（${normalized.slice(0, 3).join(', ')}${normalized.length > 3 ? '...' : ''}）`
          );
        }
      }
    }

    return { fixedFiles, fixes };
  }
