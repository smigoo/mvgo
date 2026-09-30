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
import { detectRootContainerClass } from '../../validators/code-fix-rules.js';
import { THEME_WRAPPER_TEMPLATES } from '../../utils/mc-skeleton.js';

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
        // 🛡️ 2026-09-16 治本（M1.1，e6b2864d / b75436da 实锤）：绑定表达式绝不走空格切分。
        // 旧实现在 `:class="['c-x-tab-item', { active: activeTab === index }]"`
        // 上按空格切出 `activeTab` / `index` 这些**表达式标识符**冒充类名（假阳性 →
        // 被当成缺失类生成垃圾 stub，再触发 NULL 类名噪声），同时把真正的裸键 `active:`
        // 因含冒号过滤掉（假阴性 → 模板从未挂载 `active`，样式 `.c-x-tab-item--active`
        // 也无从配对，激活态静默失效）。
        // 绑定表达式统一交由下方「:class 绑定专用提取」处理：只取字符串字面量与对象键。
        if (/[\[\]{}()'"`?:=!&|+<>]/.test(classValue)) continue;
        // 纯静态 class 值，空格分隔
        const tokens = classValue.split(/\s+/);
        for (const cn of tokens) {
          // 🛡️ v3.7-fix: 过滤非有效 class 名（避免 [ ] ( ? = 等表达式碎片污染）
          if (!cn || !/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(cn)) continue;
          if (frameworkPrefixes.some((p) => cn.startsWith(p))) continue;
          fullClassNames.add(cn);
        }
      }

      // 🛡️ 2026-09-16（M1.1）：:class 绑定表达式专用提取。
      // 只取两类，绝不取裸标识符（防变量名冒充类名）：
      //   ① 字符串字面量（数组元素 / 三元分支 / 单类名字符串）→ 'c-x-tab-item'
      //   ② {...} 段内的对象键，含**裸键**（active / is-open）与引号键 → { active: cond }
      {
        const bindRx = /:class\s*=\s*(["'`])([\s\S]*?)\1/g;
        let bMatch;
        while ((bMatch = bindRx.exec(vueContent)) !== null) {
          const expr = bMatch[2] || '';
          // ① 字符串字面量
          const litRx = /'([^'\n]+)'|"([^"\n]+)"/g;
          let lMatch;
          while ((lMatch = litRx.exec(expr)) !== null) {
            const cn = (lMatch[1] ?? lMatch[2] ?? '').trim();
            if (!cn || !/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(cn)) continue;
            if (frameworkPrefixes.some((p) => cn.startsWith(p))) continue;
            fullClassNames.add(cn);
          }
          // ② {...} 段内的对象键（含裸键；限定在 {} 内，避免误抓三元 `x : y`）
          const objSegRx = /\{([^{}]*)\}/g;
          let oMatch;
          while ((oMatch = objSegRx.exec(expr)) !== null) {
            const keyRx = /(?:'([^'\n]+)'|"([^"\n]+)"|([A-Za-z_][\w-]*))\s*:/g;
            let kMatch;
            while ((kMatch = keyRx.exec(oMatch[1])) !== null) {
              const cn = (kMatch[1] ?? kMatch[2] ?? kMatch[3] ?? '').trim();
              if (!cn || !/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(cn)) continue;
              if (frameworkPrefixes.some((p) => cn.startsWith(p))) continue;
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
    // 🎯 M1.4（2026-09-16 治本，e6b2864d / b75436da 实锤）：**取消「未匹配返回第一个元素」兜底**。
    // 旧实现 unmatched → 拿 elementStyleMap 第一个元素的样式回填，等于给缺失类写入**假真值**：
    // 实测 c-device-monitor-switch-item--active（Figma 无此激活态元素）被回填成首个元素的
    // `display: flex; flex-direction: row;`，既不是激活态真值、又让「未匹配」完全不可见
    // （日志显示「已生成 N 条 fallback」像是修好了）。这属于「用错误真值掩盖缺陷」，比留空更危险。
    // 现改为返回 null：调用方落 TODO 空块 + 可观测告警，让缺陷暴露给重试/人工，而非静默写错。
    return null;
  }

/**
 * 🎯 A1 收回（2026-09-16）：生成 class 空块骨架。
 * 把模板已确定的 class 名列表转为 `.c-xxx {}` 空块，注入 style chunk prompt，
 * 让 LLM 只填 value、不再自由命名 class（结构强制，根治类名漂移）。
 * @param {string[]} classNamesList 程序化提取的模板 class 名列表
 * @returns {string} 空块骨架（每个 class 一块，块内仅 value 占位）
 */
export function generateEmptyClassSkeleton(classNamesList) {
    if (!Array.isArray(classNamesList) || classNamesList.length === 0) return '';
    return classNamesList
      .map((c) => `.${c} {\n  /* ↓ 只填 value，勿改选择器 */\n}`)
      .join('\n\n');
  }

export function generateFallbackCssRule(className, styles) {
    if (!styles || Object.keys(styles).length === 0) {
      return `.${className} {\n  /* TODO: 请根据设计稿补充样式 */\n}`;
    }
    const props = [];
    for (const [key, value] of Object.entries(styles)) {
      if (value === undefined || value === null || value === '') continue;
      // 🎯 A1 收回（2026-09-16）：display 已由空块骨架确定性写入（style chunk 前注入），
      // fallback stub 不再补 display——否则会与骨架方向冲突或重复。此处过滤掉 display。
      const cssProp = key.includes('-')
        ? key
        : key.replace(/([A-Z])/g, '-$1').toLowerCase();
      if (cssProp === 'display') continue;
      const v = typeof value === 'number' ? String(value) : value;
      props.push(`  ${cssProp}: ${v}`);
    }
    if (props.length === 0) {
      return `.${className} {\n  /* TODO: 请根据设计稿补充样式 */\n}`;
    }
    return `.${className} {\n${props.join(';\n')};\n}`;
  }

/**
 * 🛡️ 2026-09-30 复审 P0-2：清扫「**零声明** TODO 占位规则」（削源彻底化的后置闸门）。
 *
 * 背景（复审实锤）：
 *   `generateFallbackCssRule` 在「模板 class 未在 common.less 定义」时会写出
 *   `.cls` 的「仅含 `TODO: 请根据设计稿补充样式` 注释」的空规则，追加进 `resources/styles/common.less`
 *   （`microcode-engineer` fallback 段）。这个空壳**不是终态**，而是两道后置注入的事实锚点：
 *     ① `fixSectionHeightsForResource`（resource-mounter:2540）规则②/⑤ —— **只 `replace` 已存在的块，
 *        不新建规则** ⇒ 空壳正是它补 `display / flex-direction / flexGrow / grid` 的落点。
 *   ⇒ 因此**不能在生产端直接删**（删了会丢布局注入锚点）；正解是**注入之后再清残留**。
 *
 * 语料证实两半都存在（frontend+backend workspace，文案口径「请根据设计稿补充样式」共 2560 条）：
 *   - 1472 条**已被填上真实声明** ⇒ 必须保留规则本体，仅去掉 TODO 注释；
 *   - 1088 条**仍为零声明**    ⇒ 证明该 class 始终无事实可填，整条删除信息无损（可观测性由
 *     `mismatches` 的 `CLASS-MUST-EXIST` 门禁 + logger 承担，不靠产物里的注释）。
 *
 * 口径（与「只面向 `.vue <style>` 的旧实现」的区别 —— 后者 2026-09-30 已删，由 `stripEmptyTodoRulesInSfc` 接管）：
 *   本函数面向**任意 CSS/LESS 文本**（含 `common.less`），按**花括号平衡**取「最内层块」，
 *   因此：① 多选择器 `.a, .b { }` / `::v-deep .a { }` 会**整条规则**一起删（不会留悬挂逗号）；
 *   ② 中文类名不再漏清（不依赖类名字符集）；③ 误伤面收窄（**不依赖**注释正文）。
 *
 * 判据保守化（复审 P1-3 建议）：只认两种已知占位文案（`补充样式` / `请根据设计稿补充样式`），
 * 业务性 TODO 注释（如「待产品确认」）不会被当作占位，更不会被删除。
 *
 * @param {string} cssText CSS / LESS 文本
 * @returns {{code: string, removedRules: number, strippedComments: number}} 幂等；无命中时原样返回
 */
export function stripEmptyTodoRules(cssText) {
    const NOOP = { code: cssText, removedRules: 0, strippedComments: 0 };
    if (typeof cssText !== 'string' || cssText.indexOf('TODO:') === -1) return NOOP;

    const PLACEHOLDER_RE =
      /\/\*\s*TODO:\s*(?:补充样式|请根据设计稿补充样式)\s*\*\//g;
    const COMMENT_RE = /\/\*[\s\S]*?\*\//g;

    let text = cssText;
    let removedRules = 0;

    // ── 阶段 1：删除「零声明」空壳规则（逐轮取最内层块，从右向左替换避免下标漂移）──
    for (let round = 0; round < 8; round++) {
      const dels = [];
      const stack = [];
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === '{') {
          stack.push(i);
        } else if (ch === '}') {
          const openIdx = stack.pop();
          if (openIdx === undefined) continue;
          const body = text.slice(openIdx + 1, i);
          if (body.indexOf('{') !== -1) continue; // 非最内层（含子块）→ 本阶段不动，留给注释阶段
          if (!PLACEHOLDER_RE.test(body)) {
            PLACEHOLDER_RE.lastIndex = 0;
            continue;
          }
          PLACEHOLDER_RE.lastIndex = 0;
          if (body.replace(COMMENT_RE, '').trim() !== '') continue; // 有真实声明 → 保留规则本体
          // 零声明空壳 → 连同**完整选择器段**一起删：head 从上一个 `}`/`;`/`{` 之后起算，
          // 因此多选择器 `.a, .b {}` / `::v-deep .a {}` 都整条删除，不会留下悬挂逗号/组合符。
          let hs = openIdx;
          while (hs > 0 && !'{};'.includes(text[hs - 1])) hs--;
          while (hs < openIdx && /\s/.test(text[hs])) hs++;
          dels.push({ start: hs, end: i + 1 });
        }
      }
      if (dels.length === 0) break;
      for (let k = dels.length - 1; k >= 0; k--) {
        text = text.slice(0, dels[k].start) + text.slice(dels[k].end);
        removedRules++;
      }
    }

    // ── 阶段 2：删除后仍残留的占位注释（属于「有声明」或「含子块」的规则）──
    //    放在删除收敛之后做全局替换，彻底规避嵌套区间互相重叠导致的下标错乱。
    let strippedComments = 0;
    text = text.replace(PLACEHOLDER_RE, () => {
      strippedComments++;
      return '';
    });
    text = text.replace(/\n[ \t]*\n[ \t]*\n+/g, '\n\n');

    if (removedRules === 0 && strippedComments === 0) return NOOP;
    return { code: text, removedRules, strippedComments };
  }

/**
 * 🛡️ 2026-09-30 P1-1：`stripEmptyTodoRules` 的 SFC 适配器（取代旧实现，后者已于同日删除）。
 *
 * 旧实现的四个缺陷（复审 §3 P1-1/P1-3，已在本适配器口径下消除）：
 *   ① 只取**第一个** `<style>` 块（`content.match(/(<style…>)([\s\S]*?)(<\/style>)/)` 非全局）
 *      ⇒ 第二块（如 `scoped` + `lang="less"` 分块）里的占位永远清不掉；本适配器**遍历全部** `<style>` 块
 *      （与 2.11 `processAllStyleFiles` 的 `match(...gi)` 口径一致）。
 *   ② 只认 `.class{}` 单形态 ⇒ 多选择器 `.a, .b{}` / `::v-deep .a{}` 会被删出**悬挂逗号/组合符**（语义污染），
 *      元素选择器 `div{}`、嵌套块后的外层占位、**中文类名**一律漏清。
 *   ③ `[^*]*` 遇含 `*` 的注释正文 ⇒ 不删但 `kept++` ⇒ **非幂等 + 计数虚增**。
 *   ④ 无文案护栏 ⇒ 任何 `/* TODO: …` 都被当成占位（业务 TODO 的注释会被误删）。
 * 以上四点均由 `stripEmptyTodoRules`（花括号平衡 + 最内层块 + 文案护栏 + 两阶段）接管。
 *
 * @param {string} content .vue 全文
 * @returns {{code: string, removedRules: number, strippedComments: number}} 无 `<style>` / 无命中时原样返回
 */
export function stripEmptyTodoRulesInSfc(content) {
    const NOOP = { code: content, removedRules: 0, strippedComments: 0 };
    if (typeof content !== 'string' || content.indexOf('TODO:') === -1) return NOOP;

    const STYLE_BLOCK_RE = /<style\b[^>]*>[\s\S]*?<\/style>/gi;
    let out = '';
    let last = 0;
    let removedRules = 0;
    let strippedComments = 0;
    let match;
    while ((match = STYLE_BLOCK_RE.exec(content)) !== null) {
      const block = match[0];
      const openEnd = block.indexOf('>') + 1;
      const closeIdx = block.toLowerCase().lastIndexOf('</style>');
      if (openEnd <= 0 || closeIdx < openEnd) continue;
      const body = block.slice(openEnd, closeIdx);
      const r = stripEmptyTodoRules(body);
      // 模板 / script / `<style>` 标签本身**逐字保留**，只替换样式体
      out +=
        content.slice(last, match.index) +
        block.slice(0, openEnd) +
        r.code +
        block.slice(closeIdx);
      last = match.index + block.length;
      removedRules += r.removedRules;
      strippedComments += r.strippedComments;
    }
    if (last === 0) return NOOP;
    out += content.slice(last);

    if (removedRules === 0 && strippedComments === 0) return NOOP;
    return { code: out, removedRules, strippedComments };
  }

/**
 * 🎯 M1.2（2026-09-16）：状态 / 修饰符类的「选择器级配对」门禁。
 *
 * 背景（实锤）：`validateClassNames` 只做**集合级**存在性检查（模板类名 ⊆ 样式类名），
 * 无法发现「形态不匹配」这一整类缺陷：
 *   - 模板 `:class="{ active: cond }"` 挂的是**裸类名** `active`；
 *   - 样式写的是 `.c-x-tab-item--active`（LESS 里是 `&--active`）。
 *   两者零交集，但集合检查只会说「`active` 未定义」（若已提取）或干脆漏检，
 *   最终表现为**激活态静默失效**（tab 不变蓝、卡片不高亮），且不报任何错。
 *
 * 判据（确定性、低误伤）：
 *   1. 模板 token 精确命中样式选择器（含各自 `.vue` 自有 `<style>`）→ 通过；
 *   2. token 是「带基类的修饰符类」（`<base>--<state>` / `<base>.is-<state>`）：
 *      样式里存在同名选择器，或存在 `--<state>` / `.is-<state>` 形态 → 通过；
 *   3. token 是**裸状态词**（`active` / `is-open` / `selected` …）且样式里**没有** `.active`
 *      这个精确选择器 → BLOCK `CLASS-PAIR-001`：裸类名不会命中 `--state` 形态，
 *      必须改写为 `<基类>--<state>`（或补一条 `.active` 规则）。
 *
 * 只判「状态词形」token，不判普通类名——普通类名缺失已由 CLASS-MUST-EXIST 正向门禁覆盖，
 * 本门禁刻意收窄命中面以避免与既有门禁重复计分。
 *
 * @param {Object<string,string>} allFiles - { path: content }
 * @param {string[]} [classNamesList] - 模板类名清单（缺省时自行提取）
 * @param {Object} [options] - { componentName, logger }
 * @returns {{ mismatches: Array }}
 */
export function validateClassSelectorPairs(
  allFiles,
  classNamesList = null,
  options = {},
) {
  const mismatches = [];
  const files = allFiles && typeof allFiles === 'object' ? allFiles : {};

  // 1. 收集样式侧「已定义类名」+ 原始样式文本（用于识别 &--state 等嵌套形态）
  const defined = new Set();
  const cssChunks = [];
  for (const [p, c] of Object.entries(files)) {
    if (typeof c !== 'string') continue;
    if (/\.less$/i.test(p)) {
      cssChunks.push(c);
    } else if (/\.vue$/i.test(p)) {
      for (const sm of c.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
        cssChunks.push(sm[1]);
      }
    }
  }
  const cssAll = cssChunks.join('\n');
  for (const m of cssAll.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) {
    defined.add(m[1]);
  }

  // 2. 取模板类名清单
  const list =
    Array.isArray(classNamesList) && classNamesList.length > 0
      ? classNamesList
      : (() => {
          try {
            return extractTemplateClassNames(
              files,
              options.componentName || '',
              {},
            ).fullList;
          } catch {
            return [];
          }
        })();

  // 3. 逐 token 判「形态配对」
  const seen = new Set();
  for (const raw of list) {
    const cls = String(raw || '').trim();
    if (!cls || seen.has(cls)) continue;
    seen.add(cls);
    if (defined.has(cls)) continue; // ① 精确命中

    const parsed = parseModifierClassName(cls);
    if (!parsed) continue; // 非状态词形：交给 CLASS-MUST-EXIST 正向门禁

    const { base, state } = parsed;
    // ② 带基类的修饰符类：`--state` / `.is-state` 任一形态存在即通过
    if (base && (cssAll.includes(`--${state}`) || cssAll.includes(`.is-${state}`) || cssAll.includes(`.has-${state}`))) {
      continue;
    }
    // ③ 裸状态词：样式里必须有 `.active` 这个精确选择器，否则一定不命中
    if (!base && (cssAll.includes(`--${state}`) || cssAll.includes(`.is-${state}`))) {
      mismatches.push({
        file: 'resources/styles/common.less',
        className: cls,
        gate: 'CLASS-PAIR-001',
        message:
          `模板在 :class 中挂了**裸类名** .${cls}，但样式侧只有 .*--${state} / .is-${state} 形态 —— ` +
          `裸类名不会命中 BEM 修饰符选择器，该状态（激活/悬停等）将静默失效。` +
          `请改写为 \`<元素基类>--${state}\`（如 'c-x-tab-item--${state}'），或补一条 .${cls} 规则。`,
      });
      continue;
    }
  }

  // 🎯 M1.3（2026-09-16）：状态类「视觉属性下限」门禁（CLASS-STATE-VISUAL-001）。
  // 状态类（--active / is-*）存在的唯一理由是与默认态产生**视觉差异**。
  // 实测 c-device-monitor-switch-item--active 的规则体只有 `display/flex-direction` ——
  // 纯结构属性、零视觉属性 → 激活态视觉静默丢失（Figma 里激活态必有 fill/stroke 差异）；
  // 而既有门禁（含上方的 CLASS-PAIR-001）只管「选择器形态是否存在」，不管「块内有没有视觉」。
  // 阈值纪律：只对「解析为状态词形 且 能取到规则体」的 class 判；规则体为空/TODO 单列提示。
  const stateSeen = new Set();
  for (const raw of list) {
    const cls = String(raw || '').trim();
    if (!cls || stateSeen.has(cls)) continue;
    stateSeen.add(cls);
    if (!parseModifierClassName(cls)) continue; // 非状态词形 → 不在本门禁范围
    const bodies = extractRuleBodies(cssAll, cls);
    if (bodies.length === 0) continue; // 取不到规则体 → 已由 CLASS-PAIR-001 / 正向门禁覆盖
    const stripped = bodies.map((b) =>
      b.replace(/\/\*[\s\S]*?\*\//g, '').trim(),
    );
    if (stripped.every((b) => b.length === 0)) {
      mismatches.push({
        file: 'resources/styles/common.less',
        className: cls,
        gate: 'CLASS-STATE-VISUAL-001',
        message:
          `状态类 .${cls} 的规则体是**空块**（只有骨架未填值），状态样式不会生效。` +
          `请按设计稿补齐该状态的视觉声明。`,
      });
      continue;
    }
    if (!bodies.some((b) => VISUAL_PROP_RX.test(b))) {
      mismatches.push({
        file: 'resources/styles/common.less',
        className: cls,
        gate: 'CLASS-STATE-VISUAL-001',
        message:
          `状态类 .${cls} 只有结构属性（display / flex-direction / gap 等），**没有任何视觉属性** —— ` +
          `状态与默认态视觉上无差异，等价于该状态失效。请补 ≥1 条视觉声明：` +
          `background* / color / border(-color) / box-shadow / opacity。`,
      });
    }
  }

  if (mismatches.length > 0) {
    options.logger?.warn?.('⚠️ CLASS-PAIR-001 状态类选择器配对失败', {
      count: mismatches.length,
      sample: mismatches.slice(0, 5).map((m) => m.className),
    });
  }
  return { mismatches };
}

/** 状态 / 修饰符词表（用于判定 token 是否为「状态词形」） */
const MODIFIER_STATE_WORDS = new Set([
  'active',
  'hover',
  'selected',
  'checked',
  'disabled',
  'enabled',
  'open',
  'closed',
  'collapsed',
  'expanded',
  'current',
  'focus',
  'error',
  'success',
  'warning',
  'danger',
  'loading',
  'empty',
  'on',
  'off',
  'show',
  'hidden',
  'visible',
]);

/**
 * 解析 token 的「基类 + 状态」：
 *   `c-x-tab-item--active` → { base: 'c-x-tab-item', state: 'active' }
 *   `is-open` / `has-error` → { base: '', state: 'open' / 'error' }
 *   `active`（裸状态词）     → { base: '', state: 'active' }
 *   普通类名                 → null（非状态词形，本门禁不管）
 * 注意：跳过 `c-mc-<ts>-<hash>` 这类实例 ID 形态，避免把 ID 段误判成状态。
 */
function parseModifierClassName(cls) {
  const bem = cls.match(/^(.*?)--([A-Za-z][\w-]*)$/);
  if (bem) return { base: bem[1], state: bem[2] };
  const semantic = cls.match(/^(is|has)-([A-Za-z][\w-]*)$/);
  if (semantic) return { base: '', state: semantic[2] };
  if (MODIFIER_STATE_WORDS.has(cls)) return { base: '', state: cls };
  return null;
}

/**
 * 🎯 M1.3 判据：CSS 声明「是否属于视觉属性」——只认填充 / 描边色 / 文字色 / 阴影 / 透明 / 滤镜。
 * 刻意排除纯结构属性（display / flex-direction / gap / padding / **border-radius** / border-width 等）：
 * 结构属性不产生状态间的**视觉差异**，不能作为状态类成立的证据。
 * 注：`border-radius` / `border-width` / `border-style` **不会**被本正则命中
 * （`border` 后只允许可选方位段 + 可选 `-color`，随后必须紧跟 `:`）。
 */
const VISUAL_PROP_RX =
  /(?:^|[\s;{])(?:background(?:-color|-image)?|color|border(?:-(?:top|right|bottom|left))?(?:-color)?|box-shadow|opacity|fill|filter|outline(?:-color)?|text-shadow|backdrop-filter)\s*:/;

/** 从 openIdx 处的 `{` 起做花括号配平，返回 `{}` 内文本；不配平返回 null */
function braceBodyAt(css, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < css.length; i++) {
    const ch = css[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return css.slice(openIdx + 1, i);
    }
  }
  return null;
}

/**
 * 取某个 class 的样式规则体（顶层 `{}` 内文本，含其嵌套块）。
 *
 * 优先级：① 字面选择器 `.cls` 命中则**只用它**；
 *         ② 字面取不到时才退回 LESS 嵌套形态 `&--<state>` / `.is-<state>`
 *            （嵌套形态无法定位父选择器，故放第二位，避免拿别的元素的 `&--state` 充数）。
 *
 * 纯文本扫描 + 花括号配平，不依赖 LESS 编译（嵌套展开后完整类名不会出现在样式文本里）。
 *
 * @param {string} css 全部样式文本（各 .less 全文 + 各 .vue 的 <style> 合并）
 * @param {string} cls 完整类名
 * @returns {string[]} 命中的规则体列表（同 class 可命中多处）
 */
function extractRuleBodies(css, cls) {
  const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const collect = (rx) => {
    const out = [];
    let from = 0;
    for (;;) {
      rx.lastIndex = from;
      const m = rx.exec(css);
      if (!m) break;
      const open = css.indexOf('{', m.index + m[0].length);
      const between = open < 0 ? '' : css.slice(m.index + m[0].length, open);
      // 选择器与 `{` 之间不得跨过 `}` / `;`（否则是别的规则）
      if (open >= 0 && !/[};]/.test(between)) {
        const body = braceBodyAt(css, open);
        if (body !== null) out.push(body);
        from = open + 1;
      } else {
        from = m.index + m[0].length;
      }
    }
    return out;
  };
  const literal = collect(new RegExp(`\\.${esc(cls)}(?![\\w-])`, 'g'));
  if (literal.length > 0) return literal;
  const parsed = parseModifierClassName(cls);
  if (!parsed) return [];
  const se = esc(parsed.state);
  return [
    ...collect(new RegExp(`&--${se}(?![\\w-])`, 'g')),
    ...collect(new RegExp(`\\.is-${se}(?![\\w-])`, 'g')),
  ];
}

/* ─────────────────────────── M2.2 色值槽位用途一致性 ─────────────────────────── */

/** 槽位 token 归一：`@color-bg-card` / `--colorBgCard` → kebab 词根 `bg-card` */
function normalizeColorSlotToken(raw) {
  const s = String(raw || '').trim();
  if (s.startsWith('@color-')) return s.slice('@color-'.length).toLowerCase();
  const m = s.match(/^--color([A-Za-z0-9-]*)$/);
  if (!m) return null;
  return m[1]
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .replace(/^-+/, '')
    .toLowerCase();
}

/**
 * 槽位用途族：
 *   'bg'      → 背景槽位（`bg` / `bg-card` / `bg-base` / `bg-nav`）
 *   'text'    → 文字槽位（`text-base` / `text-secondary` / `tab-active-text` …）
 *   'neutral' → 通用槽位（`primary` / `info` / `error` / `gradient-*`）——不判，避免误杀
 */
function colorSlotPurpose(token) {
  const segs = String(token || '').split('-').filter(Boolean);
  if (segs.includes('bg')) return 'bg';
  if (segs.includes('text')) return 'text';
  return 'neutral';
}

/**
 * CSS 属性用途族：
 *   'bg'      → 背景类属性（`background` / `background-color` / `background-image`）
 *   'text'    → 前景/文字类属性（`color` / `-webkit-text-fill-color` / `caret-color`）
 *   'neutral' → 其余（含 `border-color`：边框用背景系或语义色都合理，不判）
 */
function colorPropPurpose(prop) {
  const p = String(prop || '').toLowerCase();
  if (p.startsWith('background')) return 'bg';
  if (
    p === 'color' ||
    p === '-webkit-text-fill-color' ||
    p === 'caret-color'
  ) {
    return 'text';
  }
  return 'neutral';
}

const COLOR_VAR_RX = /@color-[a-z0-9-]+|var\(\s*--color[A-Za-z0-9-]+/g;

/**
 * 扫描产物里所有「颜色槽位引用」及其所在声明的属性名（带绝对下标，供精确改写）。
 * @returns {Array<{file,prop,slot,purpose,propPurpose,absIndex,isWholeFile}>}
 */
function scanColorSlotDecls(allFiles) {
  const out = [];
  const files = allFiles && typeof allFiles === 'object' ? allFiles : {};
  for (const [p, c] of Object.entries(files)) {
    if (typeof c !== 'string') continue;
    const isWholeFile = /\.(less|css)$/i.test(p);
    const isVue = /\.vue$/i.test(p);
    if (!isWholeFile && !isVue) continue;
    // 仅 .less/.css 的 styleText === 文件全文，绝对下标可直接用于改写；
    // .vue 的 <style> 是拼接串，下标不映射文件 → 只报不改（见 fixColorSlotPurpose）。
    const styleText = isVue
      ? [...c.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)]
          .map((m) => m[1])
          .join('\n')
      : c;
    if (!styleText) continue;
    COLOR_VAR_RX.lastIndex = 0;
    let v;
    while ((v = COLOR_VAR_RX.exec(styleText)) !== null) {
      const at = v.index;
      // 向前回退到本声明的边界（最近的 ; { }），取其到槽位之间的文本判属性名
      const boundary = Math.max(
        styleText.lastIndexOf(';', at - 1),
        styleText.lastIndexOf('{', at - 1),
        styleText.lastIndexOf('}', at - 1),
      );
      const seg = styleText.slice(boundary + 1, at);
      const propMatch = seg.match(/([-a-zA-Z][-a-zA-Z0-9]*)\s*:[^:;{}]*$/);
      if (!propMatch) continue;
      const prop = propMatch[1];
      const propPurpose = colorPropPurpose(prop);
      if (propPurpose === 'neutral') continue;
      const rawSlot = v[0].replace(/^var\(\s*/, '');
      const token = normalizeColorSlotToken(rawSlot);
      if (!token) continue;
      const purpose = colorSlotPurpose(token);
      if (purpose === 'neutral' || purpose === propPurpose) continue;
      out.push({
        file: p,
        prop,
        slot: rawSlot,
        purpose,
        propPurpose,
        // ⚠️ 必须指向**槽位名本身**的起始下标，而非 `var(` 的起始 —— 否则自愈会从
        // `v` 开始按槽位长度截断，改出 `--colorBgCardxt, #ffffff)` 这类残串。
        absIndex: at + (v[0].length - rawSlot.length),
        isWholeFile,
      });
    }
  }
  return out;
}

/**
 * 🎯 M2.2（2026-09-16）：色值槽位「用途一致性」门禁（COLOR-SLOT-001）。
 *
 * 问题：槽位（`@color-*` / `var(--color*)`）是**编译期常量**，不是任意颜色 —— 每个槽位
 * 被赋予固定语义（背景系 / 文字系 / 语义色）。跨用途引用会让属性拿到与设计意图无关的值，
 * 且**不报错、不崩溃**，只表现为视觉错。实测 `c-vehicle-monitor-e6b2864e`：
 *   L123 `color:      var(--colorTabActiveText, #ffffff);`  ← 正确（文字槽位 → 文字属性）
 *   L156 `background: var(--colorTabActiveText, #ffffff);`  ← 违规（文字槽位 → 背景属性）
 *   后果：卡片背景拿到白色 → 「卡片发白」。此前无任何门禁覆盖此类。
 *
 * @returns {{mismatches: Array}} 不修改入参
 */
export function detectColorSlotPurpose(allFiles, options = {}) {
  const mismatches = [];
  for (const hit of scanColorSlotDecls(allFiles)) {
    mismatches.push({
      file: hit.file,
      className: '-',
      gate: 'COLOR-SLOT-001',
      prop: hit.prop,
      slot: hit.slot,
      message:
        `${hit.prop}: 使用了${hit.purpose === 'text' ? '文字' : '背景'}槽位 ${hit.slot}，` +
        `与属性用途（${hit.propPurpose === 'bg' ? '背景' : '文字'}）不符 —— ` +
        `槽位是语义常量，跨用途引用会让该属性拿到与设计意图无关的值（静默视觉错）。` +
        `请改用${hit.propPurpose === 'bg' ? '背景' : '文字'}槽位` +
        `（LESS: @color-bg-card / CSS: var(--colorBgCard)）。`,
    });
  }
  if (mismatches.length > 0) {
    options.logger?.warn?.('⚠️ COLOR-SLOT-001 槽位用途不符', {
      count: mismatches.length,
      sample: mismatches.slice(0, 5).map((m) => `${m.prop}:${m.slot}`),
    });
  }
  return { mismatches };
}

/**
 * M2.2 确定性自愈：把「**文字槽位用在背景属性**」精确改写为背景槽位。
 *
 * 设计边界（刻意收窄，避免写入猜测值）：
 *   - 只处理 `propPurpose === 'bg' && purpose === 'text'` 一个方向 —— 该方向语义唯一
 *     （背景属性必须拿背景槽位）；反向（背景槽位用于文字）可能是有意的强调色 → 只报不改。
 *   - 只改 **.less/.css**（绝对下标可映射文件）；.vue 的 <style> 是拼接串 → 只报不改。
 *   - 只替换**槽位名**，原 fallback 字面量原样保留（如 `var(--colorTabActiveText, #ffffff)`
 *     → `var(--colorBgCard, #ffffff)`），不引入任何设计稿色值猜测。
 *   - 按文件内下标**从后往前**替换，避免位移错改。
 *
 * @returns {{files:Record<string,string>, fixes:Array<{file,prop,from,to}>}} 不修改入参
 */
export function fixColorSlotPurpose(allFiles, options = {}) {
  const files = { ...(allFiles || {}) };
  const fixes = [];
  const TARGET = { less: '@color-bg-card', css: '--colorBgCard' };
  const hits = scanColorSlotDecls(allFiles)
    .filter(
      (h) =>
        h.isWholeFile && h.propPurpose === 'bg' && h.purpose === 'text',
    )
    .sort((a, b) =>
      a.file === b.file
        ? b.absIndex - a.absIndex
        : a.file.localeCompare(b.file),
    );
  for (const h of hits) {
    const cur = files[h.file];
    if (typeof cur !== 'string') continue;
    const to = h.slot.startsWith('@color-') ? TARGET.less : TARGET.css;
    const next =
      cur.slice(0, h.absIndex) + to + cur.slice(h.absIndex + h.slot.length);
    if (next === cur) continue;
    files[h.file] = next;
    fixes.push({ file: h.file, prop: h.prop, from: h.slot, to });
  }
  if (fixes.length > 0) {
    options.logger?.warn?.(
      '🛡️ COLOR-SLOT-001 确定性自愈：文字槽位用于背景属性 → 改写为背景槽位',
      { count: fixes.length, fixes: fixes.slice(0, 5) },
    );
  }
  return { files, fixes };
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

    // 🎯 A1 收回（2026-09-16）：先收集 less 中已定义的 class 集合（供漂移对照 + 反向校验共用），
    // 避免「正向 A 口径、反向 B 口径」漂移。
    const definedClasses = new Set();
    if (prefixId) {
      const definedRx = new RegExp(
        `\\.(${escapeRegExp(prefixId)}-[a-z0-9-]+)`,
        'g',
      );
      let dm;
      while ((dm = definedRx.exec(lessContent)) !== null) {
        definedClasses.add(dm[1]);
      }
    }

    // 🎯 A1 收回（2026-09-16）：forward mismatch（模板用了但 less 未定义）→ 先落「可观测告警」，
    // 含漂移类名对照（模板期望名 vs less 实际名），而非静默 fallback。
    // 漂移判定：less 中已定义 class 与缺失 class 共享前缀段数 >= 2（说明 LLM 把它改写成别的名字）。
    const driftSegments = (name) => String(name || '').split('-');
    if (missingClasses.length > 0) {
      for (const cn of missingClasses) {
        const cnSegs = driftSegments(cn);
        // 找漂移候选：less 已定义、且与缺失 class 共享至少 2 段前缀的类名
        const driftCandidates = [...definedClasses].filter((dc) => {
          if (dc === cn) return false;
          const dcSegs = driftSegments(dc);
          let shared = 0;
          const max = Math.min(cnSegs.length, dcSegs.length);
          for (let i = 0; i < max; i++) {
            if (cnSegs[i] !== dcSegs[i]) break;
            shared++;
          }
          return shared >= 2;
        });
        mismatches.push({
          file: 'resources/styles/common.less',
          className: cn,
          message:
            driftCandidates.length > 0
              ? `模板中使用了 .${cn}，但 common.less 中未定义（疑似被重命名为 ${driftCandidates.map((d) => `.${d}`).join(' / ')}）`
              : `模板中使用了 .${cn}，但 common.less 中未定义`,
          // 🎯 门禁：清单内 class 必须存在（forward）
          gate: 'CLASS-MUST-EXIST',
          drift: driftCandidates,
        });
      }
    }

    // 反向校验（P0-①，2026-09-01）：common.less 定义了但模板未引用的 class → WARN。
    // 🎯 A1 收回（2026-09-16）：升级为门禁「新增/重命名 class 封锁」——less 出现清单外 class
    // 即为 LLM 新增或重命名，可观测告警（含对照：实际 class vs 最接近的清单 class）。
    if (prefixId) {
      const templateSet = new Set(classesToCheck);
      for (const dc of definedClasses) {
        if (!templateSet.has(dc)) {
          const dcSegs = driftSegments(dc);
          // 找最接近的清单 class（共享前缀段最多者），作漂移对照
          let best = null;
          let bestShared = 0;
          for (const tc of classesToCheck) {
            const tcSegs = driftSegments(tc);
            let shared = 0;
            const max = Math.min(dcSegs.length, tcSegs.length);
            for (let i = 0; i < max; i++) {
              if (dcSegs[i] !== tcSegs[i]) break;
              shared++;
            }
            if (shared > bestShared) {
              bestShared = shared;
              best = tc;
            }
          }
          mismatches.push({
            file: 'resources/styles/common.less',
            className: dc,
            message:
              best && bestShared >= 2
                ? `common.less 中定义了 .${dc}，但模板未引用（疑似由清单 .${best} 重命名而来）`
                : `common.less 中定义了 .${dc}，但模板未引用（冗余样式或模板漏挂载）`,
            reverse: true,
            // 🎯 门禁：新增/重命名 class 封锁（reverse）
            gate: 'NO-NEW-RENAME-CLASS',
            drift: best && bestShared >= 2 ? [best] : [],
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
      const unmatched = [];
      for (const cn of missingClasses) {
        const mapping = reverseMapClassToElement(cn, elementStyleMap);
        if (mapping) {
          fallbackRules.push(
            `/* [自动修复] 模板 class .${cn} → 匹配元素 ${mapping.elemId} */`,
          );
          fallbackRules.push(generateFallbackCssRule(cn, mapping.styles));
        } else {
          // 🎯 M1.4：不再写「猜测真值」（见 reverseMapClassToElement 注释）。
          // 未匹配的类只落 TODO 空块，并单独计数上报，保证缺陷可观测而非静默写错样式。
          unmatched.push(cn);
          fallbackRules.push(
            `/* [自动修复] 模板 class .${cn} → 未匹配到 Figma 元素（不写入猜测样式） */`,
          );
          fallbackRules.push(`.${cn} {\n  /* TODO: 请根据设计稿补充样式 */\n}`);
        }
      }
      fallbackCss = fallbackRules.join('\n\n');

      options.logger?.info?.('自动生成 fallback CSS 规则', {
        missingCount: missingClasses.length,
        generatedCount:
          fallbackRules.filter((r) => !r.includes('TODO')).length / 2,
        unmatchedCount: unmatched.length,
        cssLength: fallbackCss.length,
      });
      if (unmatched.length > 0) {
        options.logger?.warn?.(
          '⚠️ fallback 有模板类未匹配到 Figma 元素（已改写为 TODO 空块，不再写入猜测样式）',
          { count: unmatched.length, sample: unmatched.slice(0, 8) },
        );
      }
    }

    // 🎯 M1.2（2026-09-16）：状态类的「选择器级配对」门禁（CLASS-PAIR-001）。
    // 集合级校验（上方 missingClasses / definedClasses）只能发现「类名不存在」，
    // 发现不了「形态不匹配」——模板挂裸类名 `active`、样式写 `&--active` 时两边零交集，
    // 集合口径会说「active 未定义」（甚至因裸键未被提取而完全不报），
    // 真实后果是激活态静默失效且不报错。此处补一层形态配对判定。
    // 非阻断包裹：本门禁异常不得影响既有类名校验主链。
    try {
      const pairResult = validateClassSelectorPairs(allFiles, classesToCheck, {
        componentName,
        logger: options.logger,
      });
      if (pairResult.mismatches.length > 0) {
        mismatches.push(...pairResult.mismatches);
      }
    } catch (e) {
      options.logger?.warn?.('CLASS-PAIR 校验异常（非阻断）', {
        error: e?.message || String(e),
      });
    }

    // 🎯 M2.2（2026-09-16）：色值槽位「用途一致性」门禁（COLOR-SLOT-001）。
    // 与类名同层：槽位引用是 LESS/CSS 文本级事实，不需要额外的 Figma 真值输入。
    // 确定性自愈（fixColorSlotPurpose）由调用方在**校验之前**执行，
    // 故此处报出的都是自愈无法覆盖的残留（如 .vue <style> 内、或反向跨用途）。
    try {
      const slotResult = detectColorSlotPurpose(allFiles, {
        logger: options.logger,
      });
      if (slotResult.mismatches.length > 0) {
        mismatches.push(...slotResult.mismatches);
      }
    } catch (e) {
      options.logger?.warn?.('COLOR-SLOT 校验异常（非阻断）', {
        error: e?.message || String(e),
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
  nodeLayoutFacts = null,
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
          // 🛡️ 2026-09-16 加固：displayName 可能仍带 cp-/mc-/mv-/page- 前缀（历史链路/其他 graph）。
          // 先剥离语义前缀再判断可用性——否则「仅因带前缀」就退化到 extractHeaderTitle 兜底，
          // 而该兜底是「深度优先取第一个中文 TEXT」，会误抓 tabs 标签当组件名
          // （实锤：抓到「江阴靖江长江隧道」，而真正的组件名「重点车辆监测」在 header 小标题里，位置更靠后）。
          const _rawDisplay = String(displayName || '').trim();
          const _strippedDisplay = _rawDisplay
            .replace(/^(cp|mc|mv|page)-/, '')
            .trim();
          // 剥离后仍是 ID 形态（含 13 位时间戳 / 纯 hex 长串）→ 视为不可用，才走节点树兜底
          const _displayIsIdLike =
            !_strippedDisplay ||
            /\d{13}/.test(_strippedDisplay) ||
            /^[a-f0-9]{8,}$/i.test(_strippedDisplay);
          let fixName = _displayIsIdLike ? null : _strippedDisplay;
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
    // 🛡️ 2026-09-30：模板来源兜底。正常由 `microcode-engineer` 经
    //   `helpers.themeWrapperTemplates` 透传（值即单一事实源，见 utils/mc-skeleton.js）；
    //   但原先直接 `options.themeWrapperTemplates.dark` 解引用 ⇒ 未来任何新调用方忘记传参
    //   都会 TypeError。此处兜底到同一单一事实源（当前唯一调用点恒传参，兜底不触发）。
    const themeWrapperTemplates =
      options.themeWrapperTemplates || THEME_WRAPPER_TEMPLATES;
    const themeFiles = {
      'resources/styles/themes/dark.less': themeWrapperTemplates.dark,
      'resources/styles/themes/light.less': themeWrapperTemplates.light,
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
            // 🛡️ 2026-09-14 治本（mc-max-1789352370414-e4c8afa0 实锤）：
            // 替换模板必须补回闭合 `}`，否则 `.c-env-monitor-root { ... font-size: var(--fontSize, 14px);`
            // 缺 `}` → LESS 编译到样式块末尾报 Unrecognised input → 首次预览失败。
            return `${sel}{${stripped ? stripped + '\n  ' : ''}font-size: var(--fontSize, 14px);\n}`;
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

      // 提取模板真正的根 class（使用 detectRootContainerClass，避免误检装饰元素）
      const rootClassName = detectRootContainerClass(fileContent);
      if (!rootClassName) continue;
      
      const styleMatch = fileContent.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
      if (!styleMatch) continue;
      const styleContent = styleMatch[1];

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

    // 2.6.1 子组件禁止 $mcComponentBuilder 调用（2026-09-21 · c-device-monitor 实锤）
    // 子组件错误复制了 index.vue 的代码模式，调用了 $mcComponentBuilder，
    // 导致运行时重复初始化或错误。只有 index.vue 应该调用 $mcComponentBuilder。
    for (const [filePath, fileContent] of Object.entries(mergedFiles)) {
      if (!filePath.startsWith('package/components/') || !filePath.endsWith('.vue'))
        continue;
      if (!fileContent || typeof fileContent !== 'string') continue;
      if (!fileContent.includes('$mcComponentBuilder')) continue;

      let fixedContent = fileContent;
      let removedCount = 0;

      // 移除 $mcComponentBuilder 调用行（单行解构或多行声明）
      // 匹配模式：const { ... } = $mcComponentBuilder() 或 const xxx = $mcComponentBuilder()
      const builderCallRegex = /^\s*(?:const|let|var)\s+(?:\{[^}]*\}|[\w$]+)\s*=\s*\$mcComponentBuilder\(\)\s*;?\s*$/gm;
      if (builderCallRegex.test(fixedContent)) {
        fixedContent = fixedContent.replace(builderCallRegex, '');
        removedCount++;
      }

      // 移除 runtimeBuilder/componentProps/businessProps/componentApi 的解构声明
      // 这些变量通常来自 $mcComponentBuilder 的解构
      const destructuringRegex = /^\s*(?:const|let|var)\s+\{\s*(?:runtimeBuilder|componentProps|businessProps|componentApi)[^}]*\}\s*=\s*\$mcComponentBuilder\(\)\s*;?\s*$/gm;
      if (destructuringRegex.test(fixedContent)) {
        fixedContent = fixedContent.replace(destructuringRegex, '');
        removedCount++;
      }

      // 移除 runtimeBuilder.publishEvent 调用块（onMounted 中的事件发布）
      // 匹配：onMounted(() => { ... runtimeBuilder.publishEvent ... })
      const onMountedRegex = /\s*onMounted\s*\(\s*\(\s*\)\s*=>\s*\{[^}]*runtimeBuilder\.publishEvent[^}]*\}\s*\)\s*;?/g;
      if (onMountedRegex.test(fixedContent)) {
        fixedContent = fixedContent.replace(onMountedRegex, '');
        removedCount++;
      }

      // 移除 runtimeBuilder/componentProps/businessProps/componentApi 的单独声明
      // 如：let runtimeBuilder = null
      const varDeclarationRegex = /^\s*(?:const|let|var)\s+(?:runtimeBuilder|componentProps|businessProps|componentApi)\s*=\s*[^;]*;?\s*$/gm;
      if (varDeclarationRegex.test(fixedContent)) {
        fixedContent = fixedContent.replace(varDeclarationRegex, '');
        removedCount++;
      }

      if (fixedContent !== fileContent) {
        fixedFiles[filePath] = fixedContent;
        fixes.push(
          `子组件 ${filePath} 已移除 ${removedCount} 处 $mcComponentBuilder 相关调用（只有 index.vue 应该调用）`,
        );
      }
    }

    // 2.6.2 子组件样式 TODO 占位**清扫**（2026-09-21 引入填充 → 2026-09-30 收缩为「只清占位」）
    // 背景：`/* TODO: 补充样式 */` 占位的唯一生产者是 P-12a（`post-process#validateDynamicClassStyles`），
    //       已于 2026-09-30 按删减法删除（削源）。此处把旧职责「从 nodeLayoutFacts 填充样式」收缩为
    //       **只清扫残留占位**：填充读的 nodeLayoutFacts（A 类布局事实）与 2.11 LAYOUT-FACTS-INJECT
    //       **同一事实源、同一输出** ⇒ 布局注入统一归 2.11，此处不再重复注入。
    // 清扫口径（幂等，命名无关）：
    //   ① `{ display:flex; flex-direction:column; /* TODO: 补充样式 */ }` → 去注释、**保留**已有声明；
    //   ② `{ /* TODO: 补充样式 */ }`（纯空壳）→ **整条规则删除**。
    // 2026-09-30 P1-1：旧实现 `stripStyleTodoPlaceholders` 已删除，统一改用
    //   `stripEmptyTodoRulesInSfc`（遍历**全部** `<style>` 块；花括号平衡取最内层块 ⇒ 多选择器 /
    //   `::v-deep` / 中文类名 / 元素选择器都不再漏清，且不再产出悬挂逗号；文案护栏收窄为两种占位文案，
    //   业务性 TODO 注释不误伤；计数口径 kept/dropped → removedRules/strippedComments）。
    // 范围：`package/**.vue`（原实现只覆盖 `package/components/`，**窄于**生产者「所有 .vue」的覆盖
    //       ⇒ 顺带修掉「`package/index.vue` 的残留占位永不被清」的口径缺口）。
    {
      for (const [filePath, fileContent] of Object.entries(mergedFiles)) {
        if (!filePath.startsWith('package/') || !filePath.endsWith('.vue')) continue;
        // 🛡️ 2026-09-22 覆盖修复：读取基底改为 fixedFiles 优先（防前置 pass 成果被回滚）。
        const latestContent0 = fixedFiles[filePath] ?? fileContent;
        if (!latestContent0 || typeof latestContent0 !== 'string') continue;

        const swept = stripEmptyTodoRulesInSfc(latestContent0);
        if (swept.removedRules + swept.strippedComments === 0) continue;
        fixedFiles[filePath] = swept.code;
        fixes.push(
          `子组件 ${filePath} 已清扫 ${swept.removedRules + swept.strippedComments} 处样式 TODO 占位（删空壳 ${swept.removedRules} / 去注释 ${swept.strippedComments}）`,
        );
      }
    }

    // 2.6.3 视觉序确定性装配（2026-09-22 · c-device-monitor-be31dcf3 实锤）
    // LLM 生成的 v-for 数据数组照抄 Figma 文档序（grid 布局常为列优先），而渲染按行
    // 优先消费 → 12 卡中 11 张错位；tabs 数组文档序 ≠ y 序 → tab 顺序错。
    // 治本：从 Figma 真值读子节点 (y,x) 序，按文本签名匹配并重排 script 数据数组。
    // 保守条件：元素带 data-section-id（grid）/ Figma 树恰有 1 个 name='tabs'（tabs）、
    // 数组长度 === Figma 卡数、签名集合 100% 相等、顺序确实不同（幂等）。
    if (nodeData) {
      const { reorderArraysByFigmaVisualOrder } =
        await import('../../utils/visual-order-assembler.js');
      for (const [filePath, fileContent] of Object.entries(mergedFiles)) {
        if (!filePath.startsWith('package/components/') || !filePath.endsWith('.vue'))
          continue;
        // 🛡️ 2026-09-22 覆盖修复（mc-1790046506688 实锤）：2.6.2 等前置 pass 可能已把
        //   修复写入 fixedFiles，此处必须取「最新版」内容做重排基底，否则重排结果
        //   会把前置 pass 的修复整体回滚（fixedFiles 同 key 后写覆盖先写）。
        const latestContent = fixedFiles[filePath] ?? fileContent;
        if (!latestContent || typeof latestContent !== 'string') continue;
        const fileName = filePath.split('/').pop() || '';
        try {
          const result = reorderArraysByFigmaVisualOrder(latestContent, nodeData, { fileName });
          if (result && result.content !== latestContent) {
            fixedFiles[filePath] = result.content;
            fixes.push(
              `视觉序重排: ${filePath} ${result.mode} 模式已按 Figma (y,x) 序重排 [${result.reordered.join(', ')}]（${result.labels.join(' → ')}）`,
            );
          }
        } catch (e) {
          options.logger?.warn?.('视觉序重排失败（fail-open 跳过）', {
            filePath,
            error: String(e?.message || e),
          });
        }
      }
    }

    // 2.7 CODE-003 自动修复：common.less class 前缀
    // 检测 common.less 中无前缀的 class，自动加上 .c-{componentId}-
    if (mergedFiles[commonLessPath]) {
      const { autoFixPrefixViolations, resolveClassPrefixId, findNonAsciiClassNames } =
        await import('../../validators/code-structure-validator.js');
      // 🛡️ 事实优先级表 §六 #3（2026-09-28）：**非 ASCII 类名**独立判据（不 BLOCK）。
      //   必须独立于前缀判据 —— 批3 的 `^\.c-[a-z0-9]{2,}-` 豁免会把 `.c-x-文字` 判为「已带前缀」。
      //   2026-09-30（f8116aa6「class 出现了中文」用户质询）：从「仅告警」升级为
      //   **确定性净化出口** —— 中文段 → 语义英文映射（component-naming 词表），
      //   模板 class/:class + style 选择器 + common.less 全内容一致重命名；余量才告警。
      {
        const { autoFixNonAsciiClassNames } =
          await import('../../utils/component-naming.js');
        const relevantPaths = Object.keys(mergedFiles).filter(
          (p) => p.endsWith('.vue') || p === commonLessPath,
        );
        const filesSubset = {};
        for (const p of relevantPaths) {
          const c = fixedFiles[p] ?? mergedFiles[p];
          if (typeof c === 'string') filesSubset[p] = c;
        }
        const ncFix = autoFixNonAsciiClassNames(filesSubset, { logger: options.logger });
        if (ncFix.renamed.length > 0) {
          for (const [p, c] of Object.entries(ncFix.files)) {
            fixedFiles[p] = c;
          }
          const uniq = new Map();
          for (const r of ncFix.renamed) uniq.set(r.from, r.to);
          const samples = [...uniq.entries()]
            .slice(0, 5)
            .map(([f, t]) => `${f}→${t}`)
            .join(', ');
          fixes.push(
            `§六 #3 类名净化: ${uniq.size} 个非 ASCII 类名已重命名为语义英文（${samples}${uniq.size > 5 ? ' …' : ''}）`,
          );
        }
        const bad = [
          ...findNonAsciiClassNames(fixedFiles[commonLessPath] ?? mergedFiles[commonLessPath] ?? ''),
          ...Object.entries(mergedFiles)
            .filter(([p]) => p.endsWith('.vue'))
            .flatMap(([p]) =>
              findNonAsciiClassNames(fixedFiles[p] ?? mergedFiles[p] ?? ''),
            ),
        ];
        if (bad.length) {
          options.logger?.warn?.(
            `🛡️ §六 #3 非 ASCII 类名（净化后仍有余量，违反命名契约 c-<semantic>-<kebab-en>）：${[...new Set(bad)].slice(0, 5).join(', ')}${new Set(bad).size > 5 ? ' …' : ''}`,
          );
        }
      }
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

    // 🗑️ 2.8 FLEX-002 自动修复（移除冗余 flex column）——已于 2026-09-29 整体删除。
    //   删除理由（两条独立证据）：
    //   ① **代码内自相矛盾**：FLEX-002 的 issue 自身声明 `autoFix: false`、severity=WARN
    //      （code-structure-validator.js#checkFlexUsage），而 is 函数只挑 `!i.autoFix` 的项去改
    //      ⇒ 检测器说「不可自动修复」，另一个函数却“专门修它”。
    //   ② **违反「门禁只报不删」**：WARN 级判定不得静默改写布局属性。FLEX-002 的判据是
    //      「column 容器无 align/justify/gap/flex:1」，但 `display:flex` 可能来自 **A 类布局事实**
    //      （layout-facts-injector 2.11 依 Figma 几何注入）⇒ 此处删除 = 用启发式覆盖确定性事实，
    //      且与 2.11 形成「一边注入、一边删除」的振荡对；产物上表现为「属性忽隐忽现」。
    //   保留：FLEX-002 判定本身（WARN，仍计入 issues 供 prompt 反馈与取证），只删「自动删除器」。
    //   注：2026-09-01「R0-7」曾把修复归口到此处（phase2 侧删除重复器）；本次进一步确认
    //       WARN 不该有任何修复器，故连此处一并移除 —— FLEX-002 现为**纯报告项**。

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
      // 🛡️ 2026-09-22 覆盖修复：读取基底改为 fixedFiles 优先（2.6.2/2.6.3 等前置 pass
      //   可能已写 fixedFiles），否则本段把 <style> 修复写回旧基底会整体回滚前置成果。
      for (const [filePath, fileContent] of Object.entries(mergedFiles)) {
        if (!filePath.endsWith('.vue')) continue;
        const baseContent2 = fixedFiles[filePath] ?? fileContent;
        const styleMatches2 =
          baseContent2.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) || [];
        let modifiedContent2 = baseContent2;
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
        if (modifiedContent2 !== baseContent2) {
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

    // 2.11 LAYOUT-FACTS-INJECT 布局事实直接注入（2026-09-19 治本）
    // 根据 nodeLayoutFacts 直接注入 display/flex-direction，覆盖 LLM 生成的值
    // 解决：LLM 生成错误的布局方向、遗漏 display/flex-direction 等问题
    if (nodeLayoutFacts && Object.keys(nodeLayoutFacts).length > 0) {
      const { processAllStyleFiles, buildLayoutMapping, buildLayoutMappingFromSectionIds } = await import('../../utils/layout-facts-injector.js');

      // 🛡️ 2026-09-22 根因修复（c-device-monitor-be31dcf3 / 60d567d3 实锤）：
      //   buildLayoutMapping 的 class 推断用 componentName——此处收到的 componentName 是
      //   **实例 ID 全名**（如 mc-1790041042490-60d567d3）→ 产出 .c-mc-...-tabs，
      //   而产物实际 class 是语义名 .c-device-monitor-tabs（declare.json componentId 派生）
      //   → 映射 key 与产物 class 完全不搭 → LAYOUT-FACTS-INJECT 恒空转
      //   → tabs 容器永远拿不到 flex-direction:column（6 个 tab 横排挤一行的根因之一）。
      //   治本：优先用 resolveClassPrefixId（与 L0-B / CODE-003 同源的单一解析器，
      //   declare.json componentId 优先）得到语义前缀（c-device-monitor），
      //   再剥掉 c- 前缀传给 buildLayoutMapping（其 inferClassName 自拼 .c- 前缀，
      //   不剥会产生 .c-c-device-monitor-tabs 双前缀）。
      //   同时保留原 componentName 映射作兜底（两份映射都注入，命中哪个算哪个）。
      const resolvedPrefix = resolveClassPrefixId(mergedFiles, null, { fallbackToDerive: true });
      const semanticPrefix = resolvedPrefix
        ? resolvedPrefix.replace(/^(c|cp|mv|page)-/, '')
        : null;
      const inferredMapping =
        semanticPrefix && semanticPrefix !== componentName
          ? {
              ...buildLayoutMapping(nodeLayoutFacts, nodeData, componentName),
              ...buildLayoutMapping(nodeLayoutFacts, nodeData, semanticPrefix),
            }
          : buildLayoutMapping(nodeLayoutFacts, nodeData, componentName);

      // 🛡️ #719-C（2026-09-26）：产物**自带**的 `data-section-id` 是「真实 class ↔ 节点」的
      //   确定性桥（确定性模板在每个容器 div 上同时写了派生 class 与 data-section-id）。
      //   优先级高于 inferredMapping —— 后者按 figma 节点名猜（`c-<语义>-<kebab(节点名)>`），
      //   与模板派生的 `c-<语义>-<containerClassFor(sec)>-con` 不同源，只能靠
      //   `LAYOUT_SUFFIX_VARIANTS` 事后猜后缀兜住（运气成分）。
      //   inferredMapping **保留作兜底**：子组件内部元素的类名约定确实是
      //   `c-<语义>-<kebab(节点名)>`（LLM 按 prompt 约定命名），无 data-section-id 可依。
      const fromSectionIds = buildLayoutMappingFromSectionIds(
        { ...mergedFiles, ...fixedFiles },
        nodeLayoutFacts,
      );
      const layoutMapping = { ...inferredMapping, ...fromSectionIds };

      if (Object.keys(layoutMapping).length > 0) {
        // 🛡️ 2026-09-22 覆盖修复：输入基底改为 fixedFiles 优先合并（防 2.6.x/2.8/2.9
        //   前置 pass 成果被旧基底整体回滚）。
        const latestFiles = { ...mergedFiles, ...fixedFiles };
        const { fixedFiles: layoutFixedFiles, fixes: layoutFixes } = processAllStyleFiles(
          latestFiles,
          layoutMapping,
          { logger: options.logger }
        );

        // 合并修复结果
        for (const [filePath, content] of Object.entries(layoutFixedFiles)) {
          fixedFiles[filePath] = content;
        }

        // 记录修复日志
        for (const fix of layoutFixes) {
          fixes.push(
            `LAYOUT-FACTS-INJECT: ${fix.filePath} [${fix.className}] ${fix.detail}`
          );
        }
      }
    }

    // 2.12 ITEM-FACTS-INJECT item 级几何分组事实注入（2026-09-22 · H DOM contract 第 1b 步）
    // 病灶：collapsed 卡内 LLM 自包文本容器方向自由发挥（Figma 纵排列写成 row）、
    //   icon 无实测尺寸。nodeLayoutFacts 只覆盖「有 children 的容器」，TEXT 兄弟无事实。
    // 治本：buildItemLevelFacts 几何分组（x 对齐 y 递增→纵排列 / x 递增 y 对齐→横排行），
    //   双通道锚定（静态文本 / script 数组签名双射）注入容器方向 + icon 实测尺寸。
    // 读取基底 fixedFiles 优先（吸取覆盖链教训）。
    if (nodeData) {
      try {
        const { buildItemLevelFacts } =
          await import('../../utils/figma-item-facts.js');
        const { injectItemLevelFacts } =
          await import('../../utils/item-facts-injector.js');
        const itemFacts = buildItemLevelFacts(nodeData);
        if (Object.keys(itemFacts).length > 0) {
          for (const [filePath, fileContent] of Object.entries(mergedFiles)) {
            if (!filePath.startsWith('package/components/') || !filePath.endsWith('.vue'))
              continue;
            const latestContent = fixedFiles[filePath] ?? fileContent;
            if (!latestContent || typeof latestContent !== 'string') continue;
            const result = injectItemLevelFacts(latestContent, itemFacts);
            if (result && result.content !== latestContent) {
              fixedFiles[filePath] = result.content;
              for (const f of result.fixes) {
                fixes.push(`ITEM-FACTS-INJECT: ${filePath} ${f}`);
              }
            }
          }
        }
      } catch (e) {
        options.logger?.warn?.('ITEM-FACTS-INJECT 失败（fail-open 跳过）', {
          error: String(e?.message || e),
        });
      }
    }

    return { fixedFiles, fixes };
  }
