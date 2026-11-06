/**
 * Vue3 代码修复模块（从 vue3-engineer.js 拆分，2026-08-30）
 *
 * 职责：Vue3 组件产物的确定性后处理修复
 * - wrapBareConstWithRef：数据型裸 const → ref()（API 绑定前置）
 * - sanitizeVue3FileContent：.vue 文件 <style> CSS 专项清洗
 * - fixLlmTokenizationErrors：LLM 分词错误修复（formatter → for matter）
 * - normalizeVue3StyleImportPath：共享 less 路径按 SFC 深度归一化
 * - extractVue3SfcBlock：按块类型抽取唯一 SFC 块（容忍段间泄漏）
 * - dedupImportsByLocalName：去重同名 import
 * - fixImportSyntax：修复 import 末尾多余 as 别名
 *
 * 纯函数导出 + options 依赖注入模式（this → options）：
 *   sanitizeVue3FileContent(content, filePath, { baseSanitize, logger })
 */

import { sanitizeVueStyleBlock } from '../../utils/css-sanitizer.js';
import { safeLogger } from '../../logger/safe-logger.js';

/**
 * L2 后处理：自动将数据型裸 const 转为 ref()
 *
 * 扫描 <script setup> 中的 const 声明，把数组/对象字面量改成 ref() 包裹。
 * 跳过：函数、计算属性、已包裹的 ref/reactive、import 语句等。
 * @param {string} vueContent - Vue SFC 源码
 * @param {object} logger - 日志实例
 */
export function wrapBareConstWithRef(vueContent, logger) {
    // 🔒 logger 是无默认值的位参，漏传即为 undefined（见 logger.js safeLogger）
    logger = safeLogger(logger);
    if (!vueContent || typeof vueContent !== 'string') return vueContent;

    // 提取 <script setup> 块
    const scriptMatch = vueContent.match(
      /<script\s+setup[^>]*>([\s\S]*?)<\/script>/,
    );
    if (!scriptMatch) return vueContent;

    const scriptBlock = scriptMatch[1];
    const lines = scriptBlock.split('\n');
    let modified = false;

    // 匹配 const name = value（非 ref/reactive/函数/箭头函数）
    const bareConstRegex = /^(\s*)const\s+([a-zA-Z_$][\w$]*)\s*=\s*(\[|\{)/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 跳过注释
      if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;

      const match = line.match(bareConstRegex);
      if (!match) continue;

      const [fullMatch, indent, varName, startChar] = match;
      const isArray = startChar === '[';
      const wrapper = isArray ? 'ref' : 'reactive';

      // 跳过已包裹的情况（检查同一行或后续行是否有 ref( 或 reactive(）
      const lineAfterAssign = line.substring(line.indexOf('=') + 1).trim();
      if (
        lineAfterAssign.startsWith('ref(') ||
        lineAfterAssign.startsWith('reactive(')
      ) {
        continue;
      }

      // 跳过 import 语句
      if (line.trim().startsWith('import ')) continue;

      // 跳过函数声明（箭头函数或 function）
      if (line.includes('=>') || line.includes('function ')) continue;

      // 检查是否是字面量（数组或对象）
      const assignIndex = line.indexOf('=');
      if (assignIndex === -1) continue;

      const afterAssign = line.substring(assignIndex + 1).trim();
      if (!afterAssign.startsWith('[') && !afterAssign.startsWith('{'))
        continue;

      // 检查是否跨行（查找匹配的 ] 或 }）
      const openChar = isArray ? '[' : '{';
      const closeChar = isArray ? ']' : '}';
      let depth = 0;
      let foundClose = false;

      for (let j = i; j < lines.length; j++) {
        for (const ch of lines[j]) {
          if (ch === openChar) depth++;
          else if (ch === closeChar) {
            depth--;
            if (depth === 0) {
              foundClose = true;
              break;
            }
          }
        }
        if (foundClose) break;
      }

      if (!foundClose) continue; // 括号不匹配，跳过

      // 执行替换：在赋值右侧插入 wrapper(，在匹配的 ] 或 } 后插入 )
      const beforeAssign = line.substring(0, assignIndex + 1);
      const afterAssignRest = line.substring(assignIndex + 1);

      // 找到字面量的结束位置
      depth = 0;
      let endPos = -1;
      for (let k = 0; k < afterAssignRest.length; k++) {
        const ch = afterAssignRest[k];
        if (ch === openChar) depth++;
        else if (ch === closeChar) {
          depth--;
          if (depth === 0) {
            endPos = k;
            break;
          }
        }
      }

      if (endPos === -1) continue;

      // 构造新行
      const beforeLiteral = afterAssignRest.substring(0, endPos + 1);
      const afterLiteral = afterAssignRest.substring(endPos + 1);
      lines[i] =
        `${beforeAssign} ${wrapper}(${beforeLiteral.trim()})${afterLiteral}`;
      modified = true;

      logger.info(`[L2] 自动包裹: ${varName} = ${wrapper}(...)`);
    }

    if (!modified) return vueContent;

    // 替换回 <script setup> 块
    const newScriptBlock = lines.join('\n');
    return vueContent.replace(
      scriptMatch[0],
      `<script setup>\n${newScriptBlock}\n</script>`,
    );
}

/**
 * 在父类清洗基础上，对 .vue 文件的 <style> 块执行 CSS 专项清洗
 *
 * 父类 _sanitizeFileContent 处理：markdown 围栏、<thinking>、闭合标签后文本、虚假换行
 * 本方法额外处理：<style> 内的分隔符碎片、非法 LLM 评论文本、跨行 @import、大括号闭合
 * @param {string} content - 文件内容
 * @param {string} filePath - 文件相对路径
 * @param {object} options - { baseSanitize, logger }
 */
export function sanitizeVue3FileContent(content, filePath = '', options = {}) {
    const logger = safeLogger(options.logger);
    let base = options.baseSanitize(content, filePath);
    if (filePath.endsWith('.vue') && base) {
      // 🛡️ LLM 分词错误后处理：修复高频 token 拆分错误（formatter → for matter 等）
      base = fixLlmTokenizationErrors(base, logger);
      const sanitized = sanitizeVueStyleBlock(base, logger);
      return normalizeVue3StyleImportPath(sanitized, filePath);
    }
    return base;
}

/**
 * LLM 分词错误修复：修复 AI 生成代码时常见的 token 拆分错误
 *
 * 典型案例：`formatter` 被拆成 `for matter`，导致 vue/compiler-sfc 报
 * "Unexpected keyword 'for'"。
 * @param {string} code - 源码
 * @param {object} logger - 日志实例
 */
export function fixLlmTokenizationErrors(code, logger) {
    // 🔒 logger 是无默认值的位参，漏传即为 undefined（见 logger.js safeLogger）
    logger = safeLogger(logger);
    if (!code || typeof code !== 'string') return code;

    // 已知 LLM 分词错误映射：错误模式 → 正确写法
    // 注意：使用 \b 确保只匹配完整单词边界，避免误修
    const FIXES = [
      { pattern: /\bfor\s+matter\b/g, replacement: 'formatter' },
      // 可继续添加其他已知的 LLM 分词错误
      // { pattern: /\bdef\s+ault\b/g, replacement: 'default' },
      // { pattern: /\bfunc\s+tion\b/g, replacement: 'function' },
    ];

    let fixed = code;
    for (const fix of FIXES) {
      if (fix.pattern.test(fixed)) {
        fixed = fixed.replace(fix.pattern, fix.replacement);
        logger.warn(
          `🛡️ 已修复 LLM 分词错误: ${fix.pattern} → ${fix.replacement}`,
        );
      }
    }

    return fixed;
  }

/**
 * Vue3 workspace 保持 package/ 与根 resources/ 目录：
 * package/index.vue 到 resources/ 退一级，package/components/*.vue 退两级。
 * 写盘前按 SFC 所在深度归一化共享样式路径。
 */
export function normalizeVue3StyleImportPath(content, filePath = '') {
    if (!content || !filePath.endsWith('.vue')) return content;

    const isSubComponent = /^package\/components\//.test(filePath);
    const expectedPath = isSubComponent
      ? '../../resources/styles/index.less'
      : '../resources/styles/index.less';

    return content.replace(
      /@import\s+(?:\([^)]*\)\s*)?['"](?:\.\.\/)+resources\/styles\/index\.less['"]\s*;?|@import\s+(?:\([^)]*\)\s*)?['"]\.\/resources\/styles\/index\.less['"]\s*;?/g,
      `@import '${expectedPath}';`,
    );
  }

/**
 * 从某段内容中按块类型抽取唯一 SFC 块。
 * 容忍段间泄漏：三段降级路径里 script/style 段的 contextFiles 携带了完整 template，
 * LLM 可能在 script/style 段顺手生成整文件（含第二个 <template>）。
 * 对嵌套 <template>（如 <template v-for>）做平衡匹配，避免截断根模板。
 */
export function extractVue3SfcBlock(content, tag) {
    if (!content) return '';
    const firstOpen = new RegExp(`<${tag}(\\s[^>]*)?>`, 'i').exec(content);
    if (!firstOpen) return '';
    const openTag = firstOpen[0];
    const start = firstOpen.index + openTag.length;
    let depth = 1;
    let searchFrom = start;
    const openRe = new RegExp(`<${tag}(\\s[^>]*)?>`, 'i');
    const closeRe = new RegExp(`</${tag}>`, 'i');
    while (depth > 0) {
      const nextOpen = openRe.exec(content.slice(searchFrom));
      const nextClose = closeRe.exec(content.slice(searchFrom));
      if (!nextClose) {
        // 无闭合标签：取到末尾（容错截断尾块）
        return openTag + content.slice(start);
      }
      if (nextOpen && nextOpen.index < nextClose.index) {
        depth++;
        searchFrom += nextOpen.index + nextOpen[0].length;
      } else {
        depth--;
        const closeAbs = searchFrom + nextClose.index;
        if (depth === 0) {
          return openTag + content.slice(start, closeAbs) + `</${tag}>`;
        }
        searchFrom += nextClose.index + nextClose[0].length;
      }
    }
    return openTag + content.slice(start);
  }

/**
 * 去重 <script> 块内同名 import（默认导入），并修复命名空间导入末尾多余的 `as alias`。
 * @returns {{ code: string, modified: boolean }}
 */
export function dedupImportsByLocalName(code) {
    // 匹配每个 <script ...> ... </script> 块（含 <script setup> 与普通 <script>）
    const scriptBlockRe = /<script\b[^>]*>([\s\S]*?)<\/script>/g;
    const blocks = [];
    let m;
    while ((m = scriptBlockRe.exec(code)) !== null) {
      blocks.push({
        index: m.index,
        full: m[0],
        open: m[0].slice(0, m[0].indexOf('>') + 1),
        body: m[1],
        close: '</script>',
      });
    }
    if (blocks.length === 0) return { code, modified: false };

    // 默认导入：`import Name from '...'`
    const importRe =
      /^[ \t]*import[ \t]+([A-Za-z_$][\w$]*)[ \t]+from[ \t]*['"]([^'"]*)['"][ \t]*;?[ \t]*$/gm;

    let modified = false;
    let result = '';
    let cursor = 0;
    for (const b of blocks) {
      importRe.lastIndex = 0;
      const seen = new Set();
      const toRemove = [];
      let im;
      while ((im = importRe.exec(b.body)) !== null) {
        const name = im[1];
        if (seen.has(name)) toRemove.push(im[0]);
        else seen.add(name);
      }

      //修复命名空间导入末尾多余的 `as alias`（如 `import * as echarts from 'echarts' as echarts`）
      const namespaceImportFixRe =
        /^([ \t]*import\s+\*\s+as\s+[A-Za-z_$][\w$]*\s+from\s+['"][^'"]+['"])(\s+as\s+[A-Za-z_$][\w$]*)[ \t]*;?[ \t]*$/gm;
      const linesToFix = [];
      let nm;
      while ((nm = namespaceImportFixRe.exec(b.body)) !== null) {
        linesToFix.push({ original: nm[0], corrected: nm[1] });
      }

      let newBody = b.body;
      if (toRemove.length > 0) {
        for (const line of toRemove) {
          newBody = newBody.split(line).join('');
        }
        newBody = newBody.replace(/\n{3,}/g, '\n\n');
        modified = true;
      }

      //应用命名空间导入修复
      if (linesToFix.length > 0) {
        for (const fix of linesToFix) {
          newBody = newBody.split(fix.original).join(fix.corrected);
        }
        modified = true;
      }

      result += code.slice(cursor, b.index) + b.open + newBody + b.close;
      cursor = b.index + b.full.length;
    }
    result += code.slice(cursor);
    return { code: result, modified };
  }

/**
 * Import 语法修复保险：检测并修复 LLM 生成的常见 import 语法错误。
 *
 * 修复场景：
 * 1. `import * as X from '...' as X` → `import * as X from '...'`
 * 2. `import X from '...' as X` → `import X from '...'`
 * 3. `import { X } from '...' as Y` → `import { X } from '...'`
 * @returns {{ code: string, modified: boolean }}
 */
export function fixImportSyntax(code) {
    // 匹配每个 <script ...> ... </script> 块
    const scriptBlockRe = /<script\b[^>]*>([\s\S]*?)<\/script>/g;
    const blocks = [];
    let m;
    while ((m = scriptBlockRe.exec(code)) !== null) {
      blocks.push({
        index: m.index,
        full: m[0],
        open: m[0].slice(0, m[0].indexOf('>') + 1),
        body: m[1],
        close: '</script>',
      });
    }
    if (blocks.length === 0) return { code, modified: false };

    let modified = false;
    let result = '';
    let cursor = 0;

    for (const b of blocks) {
      let newBody = b.body;

      // 修复 1: `import * as X from '...' as X` → `import * as X from '...'`
      const namespaceImportRe =
        /^[ \t]*import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+)['"]\s+as\s+\1\s*;?[ \t]*$/gm;
      if (namespaceImportRe.test(newBody)) {
        newBody = newBody.replace(
          namespaceImportRe,
          (match, alias, modulePath) => {
            return `import * as ${alias} from '${modulePath}'`;
          },
        );
        modified = true;
      }

      // 修复 2: `import X from '...' as X` → `import X from '...'`
      const defaultImportRe =
        /^[ \t]*import\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+)['"]\s+as\s+\1\s*;?[ \t]*$/gm;
      if (defaultImportRe.test(newBody)) {
        newBody = newBody.replace(
          defaultImportRe,
          (match, name, modulePath) => {
            return `import ${name} from '${modulePath}'`;
          },
        );
        modified = true;
      }

      // 修复 3: `import { X } from '...' as Y` → `import { X } from '...'`
      const namedImportRe =
        /^[ \t]*import\s+\{[^}]+\}\s+from\s+['"]([^'"]+)['"]\s+as\s+[A-Za-z_$][\w$]*\s*;?[ \t]*$/gm;
      if (namedImportRe.test(newBody)) {
        newBody = newBody.replace(namedImportRe, (match, modulePath) => {
          const originalImport = match.replace(
            /\s+as\s+[A-Za-z_$][\w$]*\s*;?/,
            '',
          );
          return originalImport.trim();
        });
        modified = true;
      }

      result += code.slice(cursor, b.index) + b.open + newBody + b.close;
      cursor = b.index + b.full.length;
    }
    result += code.slice(cursor);
    return { code: result, modified };
}
