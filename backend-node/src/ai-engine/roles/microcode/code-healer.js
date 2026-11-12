/**
 * 代码自愈/后处理模块（方案 A 拆分）
 *
 * 职责：LLM 产物写盘前的确定性修复与防御性清洗
 * - 悬空 import 剥离（子组件文件不存在）
 * - 坏文件隔离降级（P1-4）
 * - ECharts 坐标轴刻度兜底
 * - 臆造交互控件剥离
 * - Section 高度修复
 * - 竖排文本 writing-mode 兜底
 * - 孤儿 JSDoc 行修复
 * - 双 c- 前缀坍缩
 * - 实例 ID 前缀剥离
 * - 裸对象 key 引号补齐
 * - 根元素实例 ID 注入
 * - 虚假换行修复
 * - index.less 模板构建
 * - common.less 主题包裹剥离
 *
 * 设计原则：
 * - 纯函数导出，不依赖 this
 * - logger 通过参数注入
 * - 检测器（如 verticalTextDetector）通过参数注入
 */

import { planBadFileIsolation } from '../../utils/bad-file-isolation.js';
import { validateVueSfc } from '../../utils/sfc-syntax-validation.js';
import { safeLogger } from '../../logger/safe-logger.js';
import { healMissingLessBraces, healMissingSemicolons } from '../../validators/less-compile-gate.js';
import { fixTextOrderDrift } from '../../utils/text-order-guard.js';
import { parse as parseJavaScript } from '@babel/parser';
import { inferChartMinHeight } from '../../utils/post-process.js';
import { CARTESIAN_SERIES_TYPES } from '../../utils/chart-type-guard.js';
import { extractSfcTemplate } from '../../utils/sfc-template-extractor.js';
import { stripDanglingComponentRefs } from '../../utils/section-coverage-guard.js';
import {
  isUsedByLessColorFn,
  isColorEvaluable,
  NEUTRAL_LESS_COLOR,
  collectColorFnVars,
} from '../../utils/less-color-funcs.js';

function isIndexVuePath(path) {
  return /(^|\/)package\/index\.vue$/i.test(String(path || ''));
}

/**
 * 🛡️ 悬空子组件 import 剥离（2026-08-30；2026-09-14 收口为「单一事实源」委派）
 *
 * 背景：planner 规划了 N 个 section，但子组件生成可能只兑现部分。模型基于「应该有」的预期，
 * 在产物里脑补 `import NavTabs from './NavTabs.vue'`——这些文件从未存在。
 *
 * 本规则显式化：任何指向文件集内不存在 `.vue` 的相对 import，一律剥离，并**同步剥离模板中
 * 对应的组件标签**——只删 import 不删标签会留下未声明变量，反而触发「模板引用未声明变量」
 * 的语义校验失败。
 *
 * ⚠️ **单一事实源**：真正的剥离逻辑已统一到 `stripDanglingComponentRefs`
 * （`utils/section-coverage-guard.js`），本函数仅做「非变异包装 + 日志」。历史教训：
 * 2026-08-30 的旧实现只认静态 `import X from './X.vue'`，漏掉
 * `defineAsyncComponent(() => import('./X.vue'))` 动态形态——那正是
 * mc-max-1789376057659-2290591b 的真实崩溃点（子组件层越权 import 7 个不存在的兄弟
 * section → 浏览器 404 + render-error）。收口后本函数（含 P1-4 降级链路）自动获得动态
 * import 覆盖，不再有「自检通过、运行崩」的盲区。
 *
 * 契约保持：**非变异**（返回新对象，不改动入参 allFiles）、未改动时返回原对象引用。
 *
 * @param {Object<string,string>} allFiles 路径 → 内容
 * @param {Object} [options]
 * @param {Object} [options.logger] 日志器
 * @returns {Object<string,string>} 修复后的文件集（未改动时返回原对象引用）
 */
export function pruneDanglingSubComponentImports(allFiles, options = {}) {
  const logger = safeLogger(options.logger);
  if (!allFiles || typeof allFiles !== 'object') return allFiles;

  // 非变异委派：mutate=false → stripDanglingComponentRefs 在浅拷贝上工作，不触碰入参。
  const { files: out, stripped } = stripDanglingComponentRefs(allFiles, undefined, false);
  if (stripped.length === 0 || out === allFiles) return allFiles;

  if (logger) {
    logger.warn(`🛡️ 已剥离 ${stripped.length} 个文件中的悬空子组件 import`, {
      removed: stripped.map((s) => ({ file: s.file, missing: s.refs })),
    });
  }
  return out;
}

/**
 * 🔎 SFC 错误原因分类器（2026-08-31，方案 5：降级路径原因分析 + 修复建议）
 *
 * 解析契约（与 utils/sfc-syntax-validation.js 对齐）：
 * 错误统一为扁平字符串 `${filePath}:${line}:${column} ${kind}: ${message}`，
 * 其中 kind ∈ `script` | `template` | `style` | `SFC`（SFC 来自 parseSfc 顶层解析失败）。
 *
 * 分类维度：
 *  1. kind 字面标记（` script: ` / ` template: ` / ` style: ` / ` SFC: `）—— 首要依据
 *  2. 消息启发式 —— 在 kind 基础上细分根因（未声明标识符 / 资源变量 / 标签未闭合 / Less 语法等）
 *
 * @param {string} error 单条 SFC 错误字符串
 * @returns {{kind:string, category:string, label:string, suggestion:string, raw:string}}
 *   - kind      错误块种类（script|template|style|SFC|unknown）
 *   - category  机器可读分类码（SCRIPT_SYNTAX|SCRIPT_UNDECLARED|TEMPLATE_UNDECLARED|
 *               TEMPLATE_SYNTAX|STYLE_SYNTAX|SFC_PARSE|UNKNOWN）
 *   - label     人类可读原因摘要
 *   - suggestion 针对性修复建议（指向产物应如何自愈/重生成）
 */
export function classifySfcError(error) {
  const raw = String(error || '');
  // 提取 kind 标记与消息体
  const m = raw.match(/^\S+?(?::\d+:\d+)?\s+(script|template|style|SFC):\s*([\s\S]*)$/i);
  const kind = m ? m[1] : 'unknown';
  const msg = m ? m[2] : raw;
  const lower = msg.toLowerCase();

  // —— 消息启发式：未声明标识符 / 资源依赖缺失（方案 3/4 的同源症状，运行时静默丢背景/图标）——
  const undeclared =
    /is not defined|未定义|未声明|cannot find name|is not declared|did you mean/i.test(msg) ||
    /referenceerror/i.test(msg);
  const resourceVar = /\b(bg\d*|bg-[\w-]+|icon\d*|icon-[\w-]+)\b/i.test(msg);

  if (kind === 'script') {
    if (undeclared && resourceVar) {
      return {
        kind, category: 'SCRIPT_UNDECLARED', raw,
        label: 'script 引用了未声明的资源变量',
        suggestion: '补齐资源 import（injectResourceImports 白名单注入）或在 <script setup> 中 const 声明该变量；重新生成该子组件即可恢复。',
      };
    }
    if (undeclared) {
      return {
        kind, category: 'SCRIPT_UNDECLARED', raw,
        label: 'script 引用了未声明的标识符',
        suggestion: '补齐 import/const 声明，或删除模板中对该标识符的引用后重新生成该子组件。',
      };
    }
    return {
      kind, category: 'SCRIPT_SYNTAX', raw,
      label: 'script 语法/编译错误',
      suggestion: '检查 <script setup> 括号配对、import 语句完整性与 TS 类型标注；重新生成该子组件。',
    };
  }

  if (kind === 'template') {
    if (undeclared && resourceVar) {
      return {
        kind, category: 'TEMPLATE_UNDECLARED', raw,
        label: '模板使用了未声明的资源变量',
        suggestion: '在 <script setup> 中 import/const 声明该资源变量（映射文件 resourceDomMapping），或从模板移除该引用后重新生成。',
      };
    }
    if (undeclared) {
      return {
        kind, category: 'TEMPLATE_UNDECLARED', raw,
        label: '模板引用了未声明的变量/组件',
        suggestion: '补齐 script 声明或组件 import，并同步模板标签；重新生成该子组件。',
      };
    }
    if (/end tag|closing tag|未闭合|unclosed|unexpected eof|invalid end/i.test(lower)) {
      return {
        kind, category: 'TEMPLATE_SYNTAX', raw,
        label: '模板标签未闭合/结构不完整',
        suggestion: '检查模板标签配对与 v-if/v-for 指令写法；重新生成该子组件。',
      };
    }
    return {
      kind, category: 'TEMPLATE_SYNTAX', raw,
      label: '模板编译错误',
      suggestion: '检查模板指令与表达式语法；重新生成该子组件。',
    };
  }

  if (kind === 'style') {
    return {
      kind, category: 'STYLE_SYNTAX', raw,
      label: '样式（Less/CSS）编译错误',
      suggestion: '检查 style 块括号配对与 Less 语法（常见：根选择器漏写右大括号）；重新生成该子组件。',
    };
  }

  if (kind === 'SFC') {
    return {
      kind, category: 'SFC_PARSE', raw,
      label: 'SFC 顶层解析失败（块结构损坏）',
      suggestion: '检查 <template>/<script>/<style> 块完整性与配对；重新生成该子组件。',
    };
  }

  return {
    kind: 'unknown', category: 'UNKNOWN', raw,
    label: '未分类的 SFC 错误',
    suggestion: '查看原始错误信息定位；重新生成该子组件。',
  };
}

/**
 * 汇总单个坏文件的分类结果（多错误时给出主导原因 + 全部明细）。
 *
 * @param {{path:string, errors:string[]}} badFile
 * @returns {{path:string, count:number, primary:ReturnType<typeof classifySfcError>,
 *            details:Array<ReturnType<typeof classifySfcError>>, summary:string, suggestion:string}}
 */
export function classifyBadVueFile(badFile) {
  const path = String(badFile?.path || '');
  const errors = Array.isArray(badFile?.errors) ? badFile.errors : [];
  const details = errors.map((e) => classifySfcError(e));
  const primary =
    details.find((d) => d.category.endsWith('_UNDECLARED')) || details[0] || classifySfcError('');
  const summary =
    details.length > 1
      ? `${primary.label}（另含 ${details.length - 1} 项其它错误）`
      : primary.label;
  return {
    path,
    count: details.length,
    primary,
    details,
    summary,
    suggestion: primary.suggestion,
  };
}

/**
 * 🛡️ P1-4：坏文件隔离降级（2026-08-30）
 *
 * 根因：5 个子组件全部生成成功，仅 1 个失败 → 主入口 + 4 个健康子组件**全部丢弃**。
 * SFC 语义门禁本意是「防坏文件写盘」，却被当成「一个坏 → 全盘否决」。
 *
 * 分级策略：
 *   - `package/index.vue` 坏 → **不可降级**（主入口不可用）→ 交回 throw 走重试/失败流程
 *   - `package/components/*.vue` 坏 → **可降级**：剔除 + 摘掉 index.vue 中的 import 与模板引用
 *   - 其它 .vue 坏 → 不可降级（位置未知，保守 fail-closed）
 *
 * @param {Object<string,string>} allFiles 路径 → 内容
 * @param {Array<{path:string, errors:string[]}>} badVueFiles 编译失败的文件
 * @param {Object} input 生成输入（降级清单写入 input._degradedFiles）
 * @param {Object} [options]
 * @param {Object} [options.logger] 日志器
 * @returns {{ok:boolean, reason?:string, files?:Object, removed?:string[], fixes?:string[]}}
 */
export function isolateBadVueFiles(allFiles, badVueFiles, input, options = {}) {
  const logger = safeLogger(options.logger);

  // ① 决策层：谁能降级、降级哪些
  const plan = planBadFileIsolation(
    allFiles,
    badVueFiles.map((b) => b.path),
  );
  if (!plan.ok) return plan;

  const removed = plan.removed;
  // ② 摘引用：先删除坏文件，再复用悬空 import 剥离
  const files = plan.files;
  const pruned = pruneDanglingSubComponentImports(files, { logger }) || files;

  // ③ 复检：摘引用后主入口是否仍可编译
  const idxPath = Object.keys(pruned).find((p) => isIndexVuePath(p));
  if (idxPath) {
    const recheck = validateVueSfc(pruned[idxPath], idxPath);
    if (recheck.errors && recheck.errors.length > 0) {
      return {
        ok: false,
        reason: `剔除坏子组件后 ${idxPath} 仍编译失败：${recheck.errors[0]}`,
      };
    }
  }

  const classifiedList = badVueFiles.map((b) => classifyBadVueFile(b));
  const fixes = classifiedList.map(
    (c) =>
      `P1-4 ISOLATE: 已剔除编译失败的子组件 ${c.path}（${c.count} 项 SFC 错误：${c.summary}）- 建议：${c.suggestion}`,
  );

  // 留痕：随结果回传 → tasks.service 落库 → 前端展示
  if (input && !Array.isArray(input._degradedFiles)) input._degradedFiles = [];
  for (const p of removed) {
    if (input && !input._degradedFiles.includes(p))
      input._degradedFiles.push(p);
  }

  if (logger) {
    // rawErrors 必须入日志：分类摘要（如 "[STYLE_SYNTAX] 样式编译错误"）不含具体报错，
    // mc-max-1788258252381-9168ed08 取证时只能靠快照复现才知道是 `variable @fontSize
    // is undefined`（假阳性误杀 4/5 子组件）。原始错误一行都不该丢。
    const rawByPath = new Map(
      (badVueFiles || []).map((b) => [b.path, (b.errors || []).slice(0, 3)]),
    );
    logger.warn('🩹 P1-4 坏文件隔离降级', {
      removed,
      reason: classifiedList.map((c) => `${c.path}: [${c.primary.category}] ${c.summary}`),
      rawErrors: classifiedList.map((c) => ({
        path: c.path,
        errors: rawByPath.get(c.path) || [],
      })),
      diagnostics: classifiedList.map((c) => ({
        path: c.path,
        count: c.count,
        category: c.primary.category,
        summary: c.summary,
        suggestion: c.suggestion,
      })),
    });
  }

  return { ok: true, files: pruned, removed, fixes };
}

/**
 * S1-P1（确定性兜底）：确保 echarts 坐标轴显示刻度标签。
 * 仅翻转模型显式写出的 `axisLabel/axisTick: { show: false }` → `show: true`；
 * 不臆造 data/min/max（数值刻度须由模型按 Figma 真值填充）。
 *
 * @param {string} content 单文件内容（.vue）
 * @returns {string}
 */
export function injectEchartsAxisTicks(content) {
  if (typeof content !== 'string') return content;
  try {
    let changed = false;
    const out = content.replace(
      /(axisLabel|axisTick)\s*:\s*\{\s*show\s*:\s*false/gi,
      (m) => {
        changed = true;
        return m.replace(/false/i, 'true');
      },
    );
    return changed ? out : content;
  } catch {
    return content;
  }
}

/**
 * S1-P2（确定性兜底）：剥离 Figma 节点树中不存在的臆造交互控件。
 * 主修复在 ai-generation-constraints.md 7.6（prompt 红线），此为安全网：
 * 1) 移除含占位默认项的 <select>/<input>/UI 库下拉；
 * 2) 若 Figma 节点树全无交互控件语义，移除全部生成的 select/input。
 *
 * @param {string} content 单文件内容（.vue）
 * @param {Object} [ctx] 规则上下文（含 figmaNodeData）
 * @returns {string}
 */
export function stripOrphanControls(content, ctx = {}) {
  if (typeof content !== 'string') return content;
  try {
    const placeholderRe = /(使用默认|监测类型|请选择|未选择|全部类型|全部状态|请筛选)/;
    const stripBlock = (html) => {
      // <select>...</select>
      html = html.replace(/<select\b[\s\S]*?<\/select>/gi, (b) =>
        placeholderRe.test(b) ? '' : b,
      );
      // UI 库下拉
      html = html.replace(
        /<(a-select|el-select|n-select|ivu-select)\b[^>]*>[\s\S]*?<\/\1>/gi,
        (b) => (placeholderRe.test(b) ? '' : b),
      );
      // 自闭合 <input ...>
      html = html.replace(/<input\b[^>]*>/gi, (b) =>
        placeholderRe.test(b) ? '' : b,
      );
      return html;
    };
    let out = stripBlock(content);

    const figma = ctx && ctx.figmaNodeData;
    if (figma) {
      let hasControl = false;
      const scan = (n) => {
        if (hasControl || !n || typeof n !== 'object') return;
        const name = `${n.name || ''} ${n.type || ''}`;
        if (/select|下拉|搜索|input|switch|筛选|filter|tab/i.test(name)) {
          hasControl = true;
          return;
        }
        if (Array.isArray(n.children)) n.children.forEach(scan);
      };
      scan(figma.document || figma);
      if (!hasControl) {
        out = out
          .replace(/<select\b[\s\S]*?<\/select>/gi, '')
          .replace(/<(a-select|el-select|n-select|ivu-select)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
          .replace(/<input\b[^>]*>/gi, '');
      }
    }
    return out === content ? content : out;
  } catch {
    return content;
  }
}

/**
 * S1-P3（确定性兜底）：多区块垂直布局时，section 根节点误用 `height:100%`
 * 导致每个区块都撑满父容器高度、相互叠加溢出被裁。
 * 改为 `flex: <px> 1 0; min-height: 0` 让各区块按比例共享父容器高度。
 *
 * @param {string} content 单文件内容（.vue / .less / .css）
 * @param {Object} [ctx] 规则上下文（含可选 sectionHeights）
 * @returns {string}
 */
export function fixSectionHeights(content, ctx = {}) {
  if (typeof content !== 'string') return content;
  try {
    const rootClass = extractRootTemplateClass(content);
    if (!rootClass) return content;
    const candidates = rootClassCandidates(rootClass);
    for (const cand of candidates) {
      const openRe = new RegExp(`(\\.${reEscape(cand)})\\s*\\{`);
      const open = openRe.exec(content);
      if (!open) continue;
      const openIdx = open.index + open[0].length - 1;
      let depth = 0;
      let end = -1;
      for (let i = openIdx; i < content.length; i++) {
        if (content[i] === '{') depth++;
        else if (content[i] === '}') {
          depth--;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
      if (end < 0) continue;
      const body = content.slice(openIdx + 1, end);
      if (
        !/display\s*:\s*flex/.test(body) ||
        !/height\s*:\s*100%/.test(body)
      ) {
        continue;
      }
      const px = (ctx && ctx.sectionHeights && ctx.sectionHeights[cand]) || 1;
      let newBody = body.replace(/height\s*:\s*100%/g, `flex: ${px} 1 0`);
      if (!/min-height\s*:\s*0/.test(newBody)) {
        newBody = newBody.replace(/(flex:\s*[^;]+;)/, `$1\n  min-height: 0;`);
      }
      const replaced =
        content.slice(0, openIdx + 1) + newBody + content.slice(end);
      return replaced;
    }
    return content;
  } catch {
    return content;
  }
}

/** 取 <template> 根元素 class（微码组件根，带前缀 c-{componentId}-） */
function extractRootTemplateClass(content) {
  const tpl = content.match(/<template[^>]*>([\s\S]*?)<\/template>/);
  if (!tpl) return null;
  const m = tpl[1].match(/class\s*=\s*["']([^"']+)["']/);
  if (!m) return null;
  return m[1].trim().split(/\s+/)[0] || null;
}

/** 由根 class 推导候选「本地类名」集合 */
function rootClassCandidates(rootClass) {
  const set = new Set();
  set.add(rootClass);
  for (let i = 0; i < rootClass.length - 1; i++) {
    if (rootClass[i] === 'c' && rootClass[i + 1] === '-') {
      set.add(rootClass.slice(i));
    }
  }
  return set;
}

/** 正则转义（类名用） */
function reEscape(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 🛡️ 竖排文字兜底：为竖向排版的文本元素补 `writing-mode`（2026-08-28）
 *
 * 背景：Figma 的竖向排版文字在数据里没有显式标记——characters 是连续字符串，
 * 竖排靠「文本框宽度受限 + 自动换行」实现。模型看不出来，就会平铺成横排。
 *
 * 本规则是第三层兜底（第1层检测 + 第2层 prompt 告知已在 figma-format.js 完成）：
 * 拿 Figma 真值判定哪些文本是竖排，若产物里对应元素既没有 inline writing-mode、
 * 其 class 也没有在样式中定义 writing-mode，则补 inline style 保证正确渲染。
 *
 * @param {Object<string,string>} allFiles 路径 → 内容
 * @param {Object} figmaNodeData Figma 原始数据
 * @param {Object} [options]
 * @param {Function} [options.verticalTextDetector] 竖排文本检测器
 * @param {Object} [options.logger] 日志器
 * @returns {Object<string,string>}
 */
export function ensureVerticalTextWritingMode(allFiles, figmaNodeData, options = {}) {
  const { verticalTextDetector } = options;
  const logger = safeLogger(options.logger);
  if (!allFiles || typeof allFiles !== 'object' || !figmaNodeData) {
    return allFiles;
  }
  if (typeof verticalTextDetector !== 'function') return allFiles;

  // ① 收集所有竖排文本
  const verticalTexts = new Set();
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'TEXT' && node.characters) {
      try {
        if (verticalTextDetector(node).vertical) {
          const t = String(node.characters).trim();
          if (t) verticalTexts.add(t);
        }
      } catch {
        /* 单节点检测失败跳过 */
      }
    }
    const children = node.children || [];
    for (const child of children) walk(child);
  };
  walk(figmaNodeData.document || figmaNodeData);
  if (verticalTexts.size === 0) return allFiles;

  const escapeRegExp = (s) =>
    String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // ② 预扫描：样式中已声明 writing-mode 的 class 名
  const styledClasses = new Set();
  for (const [p, c] of Object.entries(allFiles)) {
    if (typeof c !== 'string' || !/\.(vue|less|css)$/i.test(p)) continue;
    for (const m of c.matchAll(
      /([^{}]*)\{[^}]*writing-mode\s*:[^};]*[;}]/gi,
    )) {
      for (const cls of String(m[1]).matchAll(/\.([a-zA-Z_][\w-]*)/g)) {
        styledClasses.add(cls[1]);
      }
    }
  }

  const out = { ...allFiles };
  let changed = false;
  const patched = [];

  for (const [path, content] of Object.entries(out)) {
    if (!/\.vue$/i.test(path) || typeof content !== 'string') continue;

    let next = content;
    for (const text of verticalTexts) {
      if (!next.includes(text)) continue;
      const elemRe = new RegExp(
        `<([a-zA-Z][\\w-]*)((?:\\s+[^>]*?)?)>\\s*${escapeRegExp(
          text,
        )}\\s*<\\/\\1>`,
        'g',
      );
      next = next.replace(elemRe, (match, tagName, attrs) => {
        if (/writing-mode/i.test(attrs)) return match;
        const clsMatch = attrs.match(/class\s*=\s*["']([^"']*)["']/);
        if (clsMatch) {
          const classes = clsMatch[1].split(/\s+/).filter(Boolean);
          if (classes.some((c) => styledClasses.has(c))) return match;
        }
        patched.push({ file: path, text });
        if (/\bstyle\s*=\s*["']/.test(attrs)) {
          return match.replace(
            /style\s*=\s*(["'])([\s\S]*?)\1/i,
            (_m, q, val) =>
              `style=${q}${val.replace(/;?\s*$/, '')}; writing-mode: vertical-rl;${q}`,
          );
        }
        return `<${tagName}${attrs} style="writing-mode: vertical-rl;">${text}</${tagName}>`;
      });
    }

    if (next !== content) {
      out[path] = next;
      changed = true;
    }
  }

  if (changed && patched.length > 0 && logger) {
    logger.info('🛡️ 已为竖排文本补充 writing-mode', { patched });
  }

  return changed ? out : allFiles;
}

/**
 * 🛡️ 文本兄弟顺序自愈（TEXT-001，2026-09-01）
 *
 * 事故实证 mc-max-1788251680480-98c9140b：Figma tabs-list 的 4 个 TEXT 子节点
 * 视觉 x 序 ≠ children 数组序，产物 v-for 数组按 children 序 → 「能见度」从视觉
 * 第 2 位掉到末位。文案全对、只有顺序错 → DO-NOT-INVENT-TEXT / ELEMENT 覆盖率
 * 全部放行（存在性检查的盲区）。
 *
 * 本 wrapper 只做转发与日志；检测/修复的事实源实现统一在
 * utils/text-order-guard.js（单一真相源，供 code-fix-rules 自愈 +
 * code-structure-validator TEXT-001 门禁 + spec 三处消费）。
 *
 * 无法安全重排的漂移保留给 TEXT-001 门禁 fail-closed（自愈层 fail-open，
 * 检测器异常不阻断生成——错误产物由门禁拦截）。
 *
 * @param {Object<string,string>} allFiles 路径 → 内容
 * @param {Object} figmaNodeData Figma 节点树真值
 * @param {Object} [options] { logger }
 * @returns {Object<string,string>}
 */
export function fixTextSiblingOrder(allFiles, figmaNodeData, options = {}) {
  const logger = safeLogger(options.logger);
  if (!allFiles || typeof allFiles !== 'object' || !figmaNodeData) {
    return allFiles;
  }
  try {
    const result = fixTextOrderDrift(allFiles, figmaNodeData);
    if (result.fixed.length > 0) {
      logger.info(
        `🛡️ TEXT-001 自愈：已按 Figma 视觉坐标重排 ${result.fixed.length} 处文本兄弟顺序`,
        {
          fixed: result.fixed.map((d) => ({
            file: d.file,
            parent: d.parentName,
            kind: d.kind,
            from: d.actual.join(' → '),
            to: d.expected.join(' → '),
          })),
        },
      );
    }
    if ((result.skippedCrossParent || []).length > 0) {
      logger.info('🛡️ TEXT-001 同父契约·跨父文本集合已弃权', {
        total: result.skippedCrossParent.length,
        hits: result.skippedCrossParent.slice(0, 10).map((d) => ({
          file: d.file,
          parent: d.parentName,
        })),
      });
    }
    if (result.remaining.length > 0) {
      logger.warn(
        `🛡️ TEXT-001 自愈：${result.remaining.length} 处文本顺序漂移无法安全重排（结构不可判定），保留给 L0-B 门禁`,
        {
          remaining: result.remaining.map((d) => ({
            file: d.file,
            parent: d.parentName,
            kind: d.kind,
            expected: d.expected.join(' → '),
            actual: d.actual.join(' → '),
          })),
        },
      );
    }
    return result.files;
  } catch (err) {
    // 自愈层 fail-open：检测器异常不阻断生成，交由 TEXT-001 门禁与后续校验兜底
    logger.error('TEXT-001 自愈执行失败（非阻断）', {
      error: err?.message || String(err),
    });
    return allFiles;
  }
}

/**
 * 🛡️ 孤儿 JSDoc 行修复（script 级）：修复丢失块注释起始符后残留的 `* xxx` 行与孤立的注释结束符行。
 * 成因：分块拼装 / 重试替换可能吃掉 JSDoc 起始行，剩余 JSDoc 延续行在 JS 里是语法错误。
 * 策略（带模板字符串守卫，避免误改模板字面量内以 * 开头的正文行）：
 *   - 块注释外的 `* xxx` 行 → 转为 `// xxx` 行注释
 *   - 块注释外的孤立注释结束符行 → 整行丢弃
 */
export function fixOrphanJsdocLines(script) {
  const fixedLines = [];
  let inBlock = false;
  let inTemplate = false;
  for (const rawLine of script.split('\n')) {
    const t = rawLine.trim();
    // 模板字符串守卫
    if (inTemplate) {
      fixedLines.push(rawLine);
      if ((rawLine.match(/(?<!\\)`/g) || []).length % 2 === 1)
        inTemplate = false;
      continue;
    }
    if ((rawLine.match(/(?<!\\)`/g) || []).length % 2 === 1) {
      inTemplate = true;
      fixedLines.push(rawLine);
      continue;
    }
    if (inBlock) {
      fixedLines.push(rawLine);
      if (t.includes('*/')) inBlock = false;
      continue;
    }
    if (t.startsWith('/*')) {
      fixedLines.push(rawLine);
      if (!t.includes('*/')) inBlock = true;
      continue;
    }
    if (/^\*\/$/.test(t)) continue; // 孤立 `*/`：丢弃
    if (t.startsWith('*')) {
      // 孤儿 JSDoc 延续行 → 行注释化
      const rest = t
        .replace(/^\*+\s*/, '')
        .replace(/\*\/\s*$/, '')
        .trimEnd();
      fixedLines.push(rawLine.replace(t, rest ? `// ${rest}` : '//'));
      continue;
    }
    fixedLines.push(rawLine);
  }
  return fixedLines.join('\n');
}

/** 🛡️ 对 .vue 文件内所有 <script> 块应用孤儿 JSDoc 行修复（template/style 区不动） */
export function fixOrphanJsdocInVue(content) {
  try {
    return content.replace(
      /(<script[^>]*>)([\s\S]*?)(<\/script>)/g,
      (m, open, body, close) => open + fixOrphanJsdocLines(body) + close,
    );
  } catch {
    return content;
  }
}

/**
 * 🛡️ 双 c- 前缀坍缩（.vue）：模型把 declare.componentId（如 c-monitor，已含 c-）当作语义名
 * 再套「.c- 前缀」规则，产出 class="c-c-monitor/root" 双前缀。
 * 只坍缩 class/:class 属性值内行首位置的双前缀。
 */
export function collapseDoubleCPrefixInVue(content) {
  return content
    .replace(/((?:class|:class)\s*=\s*"[^"]*?)\bc-c-/g, '$1c-')
    .replace(/((?:class|:class)\s*=\s*'[^']*?)\bc-c-/g, '$1c-');
}

/** 🛡️ 双 c- 前缀坍缩（.less/.css）：.c-c-monitor-xxx 选择器 → .c-monitor-xxx */
export function collapseDoubleCPrefixInLess(content) {
  return content.replace(/\.c-c-/g, '.c-');
}

/**
 * 提取组件「实例 ID」（如 mc-max-1787742124556-3c15fc26）。
 * 仅当入参匹配实例 ID 模式时才返回，避免把短语义前缀误判为实例 ID。
 * @returns {string} 形如 mc-max-1787742124556-3c15fc26，或空串
 */
export function getInstanceId(componentName, outputPath) {
  const candidates = [componentName, outputPath].filter(Boolean).map(String);
  for (const c of candidates) {
    const m = c.match(/((?:c-)?mc-max-\d{13}-[a-f0-9]+)/i);
    if (m) return m[1];
  }
  return '';
}

/**
 * 🛡️ Class 命名规范：剥离「内部 class」上的超长实例 ID 前缀。
 *
 * 设计：
 *  - 实例 ID 仅允许出现在「根容器」class 上，形式为 c-mc-max-{id}；
 *  - 任何「带尾横杠」的实例 ID 前缀一律视为过度前缀并剥离，保留其后的语义部分。
 *  - 根容器 c-mc-max-{id}（无尾横杠）不会被误伤。
 *
 * @param {string} content
 * @param {string} instanceId 形如 mc-max-1787742124556-3c15fc26
 * @returns {string}
 */
export function stripInstanceIdPrefix(content, instanceId) {
  if (!content || typeof content !== 'string' || !instanceId) return content;
  const pA = `c-${instanceId}-`;
  const pB = `${instanceId}-`;
  return content.split(pA).join('').split(pB).join('');
}

/**
 * 🛡️ 引号裸对象 key：Vue 模板 :class / :style 绑定里的对象字面量，key 含连字符
 * 是非法 JS 表达式，compiler-sfc 报 "Unexpected token"。
 * 此类 key 必须加引号：{ 'c-monitor-active': x }。
 *
 * 仅对 <template> 区域生效（<style> 的声明会被误命中，必须排除）。
 *
 * @param {string} vueContent
 * @returns {string}
 */
export function quoteBareObjectKeysInVue(vueContent) {
  if (!vueContent || typeof vueContent !== 'string') return vueContent;
  const body = extractSfcTemplate(vueContent);
  if (!body) return vueContent;
  const fixedBody = body.replace(
    /([{,])\s*(['"])?([A-Za-z_$][A-Za-z0-9_$]*(?:-[A-Za-z0-9_$]+)+)(['"])?(\s*:)/g,
    (_m, open, q1, key, q2, post) =>
      `${open}${q1 || "'"}${key}${q2 || "'"}${post}`,
  );
  if (fixedBody === body) return vueContent;
  // 🛡️ 回填定位：body 是 extractSfcTemplate 从 vueContent 切出的真实子串（含 <template> 标签），
  // indexOf(body) 即其起始偏移。此前此处引用 tplMatch.index —— 改用 extractSfcTemplate 后
  // 该变量已不存在（重构残留），ReferenceError 直接炸穿生成（mc-max-1789091377500-624c3a24 实锤）。
  const start = vueContent.indexOf(body);
  if (start < 0) return vueContent;
  return (
    vueContent.slice(0, start) +
    fixedBody +
    vueContent.slice(start + body.length)
  );
}

/**
 * 🛡️ 确保 package/index.vue **设计根容器**携带实例 ID 类 c-mc-max-{id}。
 *
 * 🛡️ 2026-09-26 治本（`<template class="c-mc-max-<任务号>">` 污染实锤）：
 *  `extractSfcTemplate()` 返回的 body **以 `<template ...>` 包裹标签开头**，而旧实现直接
 *  在 body 里 match「第一个标签」→ 命中的是 `<template>` 本身 → 实例 ID 被打到
 *  `<template class="…">` 上。后果：
 *   ① Vue 编译期忽略根 `<template>` 的属性 → 该 class **完全无效**（纯粹污染产物）；
 *   ② `code-structure-validator.findRootStyleBlock()` 的正则要求**裸 `<template>`**
 *      （`/<template>[\s\S]*?class="…"/`）→ 失配 → **根规则提取恒为空**。
 *  另：前端/embed-panel/templates/references 全仓 **无任何 `c-mc-max-` 消费点**（无消费者）。
 *
 *  现改为：**跳过 `<template>` 包裹标签**，命中「模板内第一个**已带 class** 的宿主元素」
 *  （即设计根容器，跳过 `<base-panel>` 这类无 class 的框架包裹），把实例 ID **追加**到其
 *  class 列表**末尾**（保证语义根 class 仍居首位 → findRootStyleBlock 恢复可用）；
 *  同时**清除 `<template>` 包裹标签上的历史残留属性**（自愈存量污染）。幂等。
 *
 * @param {string} vueContent
 * @param {string} rootClass 形如 c-mc-max-1787742124556-3c15fc26
 * @returns {string}
 */
export function ensureRootInstanceId(vueContent, rootClass) {
  if (!vueContent || typeof vueContent !== 'string' || !rootClass)
    return vueContent;
  const tpl = extractSfcTemplate(vueContent);
  if (!tpl) return vueContent;

  let out = vueContent;
  const openMatch = tpl.match(/^\s*<template\b([^>]*)>/i);
  let inner = tpl;
  if (openMatch) {
    inner = tpl.slice(openMatch[0].length);
    // ① 清除 `<template ...>` 包裹标签上的残留属性（历史污染：class="c-mc-max-…"）
    if ((openMatch[1] || '').trim()) {
      out = out.replace(openMatch[0], openMatch[0].replace(openMatch[1], ''));
    }
  }

  // ② 命中模板内「第一个已带 class 的宿主元素」（跳过具名插槽块，避免命中插槽内元素）
  const noSlots = inner.replace(
    /<template\s+(?:#|v-slot:)[\s\S]*?<\/template\s*>/gi,
    '',
  );
  const elRe = /<([a-zA-Z][\w-]*)((?:\s+[^>]*?)?)(\/?)>/g;
  let m;
  while ((m = elRe.exec(noSlots)) !== null) {
    const tagName = m[1];
    const attrs = m[2] || '';
    if (!/\bclass\s*=/.test(attrs)) continue; // 无 class 的包裹标签（如 <base-panel>）跳过
    const cm = attrs.match(/(class\s*=\s*)(["'])([\s\S]*?)\2/);
    if (!cm) continue;
    const toks = cm[3].split(/\s+/).filter(Boolean);
    if (toks.includes(rootClass)) return out; // 幂等：已注入
    const newAttrs = attrs.replace(
      cm[0],
      `${cm[1]}${cm[2]}${cm[3]} ${rootClass}${cm[2]}`,
    );
    return out.replace(
      `<${tagName}${attrs}${m[3]}>`,
      `<${tagName}${newAttrs}${m[3]}>`,
    );
  }
  return out;
}

/**
 * 修复 LLM 输出中的虚假换行
 * LLM 在分块生成模式下可能每 ~15-20 字符硬换行，导致标识符/属性/字符串被拆碎
 * 策略：template 区域 direct join + 后处理属性间距；script 区域 direct join + 关键词间距
 */
export function fixSpuriousLineBreaks(content, options = {}) {
  const logger = safeLogger(options.logger);

  // 检测：双重条件——平均行长 < 25 且最大行长 < 80 才触发修复
  const lines = content.split('\n');
  const nonEmptyLines = lines.filter((l) => l.trim());
  if (nonEmptyLines.length === 0) return content;
  const avgLen =
    nonEmptyLines.reduce((s, l) => s + l.trim().length, 0) /
    nonEmptyLines.length;
  const maxLen = Math.max(...nonEmptyLines.map((l) => l.trim().length));
  if (avgLen > 25 || maxLen > 80) return content;

  if (logger) {
    logger.warn(
      '检测到 Vue 文件可能存在虚假换行（平均行长 ' +
        avgLen.toFixed(0) +
        '，最大 ' +
        maxLen +
        '），开始修复',
    );
  }

  // 🛡️ 共享边界法（lazy </template> 截断家族缺陷，0ca84358）
  const templateMatch = extractSfcTemplate(content);
  const templateBody = templateMatch;
  const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/);

  let fixed = content;

  // --- Template 区域 ---
  if (templateMatch) {
    let template = templateBody;
    const tLines = template.split('\n');
    const tMerged = [];
    for (let i = 0; i < tLines.length; i++) {
      const line = tLines[i];
      const trimmed = line.trim();
      if (!trimmed) {
        tMerged.push(line);
        continue;
      }
      if (tMerged.length > 0 && !trimmed.startsWith('<')) {
        const prev = tMerged[tMerged.length - 1].trimEnd();
        if (!prev.endsWith('>') && !prev.endsWith('/>')) {
          tMerged[tMerged.length - 1] = prev + ' ' + trimmed;
          continue;
        }
      }
      if (
        !trimmed.endsWith('>') &&
        !trimmed.endsWith('/>') &&
        i + 1 < tLines.length
      ) {
        const nextTrimmed = tLines[i + 1].trim();
        if (nextTrimmed && !nextTrimmed.startsWith('<')) {
          tMerged.push(trimmed + ' ' + nextTrimmed);
          i++;
          continue;
        }
      }
      tMerged.push(line);
    }
    template = tMerged.join('\n');
    template = template.replace(/"([a-zA-Z:@v-][\w-]*=)/g, '" $1');
    template = template.replace(
      /<(div|span|img|base-panel|base|a|p|ul|li|button|input|label|form|h[1-6])(class|style|src|alt|id|ref|:|@|v-|panelKey|key)/g,
      '<$1 $2',
    );
    fixed = fixed.replace(templateBody, template);
  }

  // --- Script 区域 ---
  if (scriptMatch) {
    let script = scriptMatch[1];
    const sLines = script.split('\n');
    const sMerged = [];
    for (let i = 0; i < sLines.length; i++) {
      const line = sLines[i];
      const trimmed = line.trim();
      if (!trimmed) {
        sMerged.push(line);
        continue;
      }
      if (sMerged.length > 0) {
        const prevTrimmed = sMerged[sMerged.length - 1].trim();
        const isIncompleteImport =
          prevTrimmed.startsWith('import ') &&
          !prevTrimmed.includes('from') &&
          !prevTrimmed.endsWith(';');
        const isIncompleteDecl =
          (prevTrimmed.startsWith('const ') ||
            prevTrimmed.startsWith('let ')) &&
          !prevTrimmed.endsWith(';') &&
          !prevTrimmed.endsWith('}') &&
          !prevTrimmed.endsWith(']') &&
          // 排除「已完整赋值」的声明：const { a, b } = chartRef.value 以标识符 / ) / 引号 / 反引号结尾，
          // 是完整语句（依赖 ASI 自动补分号），并非被虚假换行打断的未完成声明。
          !/[)\]'"`\w]$/.test(prevTrimmed);
        if (isIncompleteImport || isIncompleteDecl) {
          if (
            trimmed &&
            !trimmed.startsWith('import') &&
            !trimmed.startsWith('const') &&
            !trimmed.startsWith('let') &&
            !trimmed.startsWith('export')
          ) {
            sMerged[sMerged.length - 1] = prevTrimmed + ' ' + trimmed;
            continue;
          }
        }
      }
      sMerged.push(line);
    }
    script = sMerged.join('\n');
    // 轻量后处理：确保 import 语句独占一行
    script = script.replace(/([;}])\s*(import\s)/g, '$1\n$2');
    // 关键词后加空格（保守，只处理关键词与后续非标识符字符粘连的情况）
    // 前瞻必须用 (?=[^\w\s]) 而非 (?=[a-zA-Z$_])：后者会把 forecast/forEach/constant
    // 等「以关键词为前缀的标识符」误拆（forecast → for ecast），导致 SFC 编译失败。
    const kwAfter = [
      'import',
      'export',
      'const',
      'let',
      'var',
      'from',
      'return',
      'function',
      'async',
      'if',
      'for',
    ];
    for (const kw of kwAfter) {
      script = script.replace(
        new RegExp('\\b' + kw + '(?=[^\\w\\s])', 'g'),
        kw + ' ',
      );
    }
    fixed = fixed.replace(scriptMatch[1], '\n' + script.trim() + '\n');
  }

  // 🛡️ AST 验证 + 回滚（2026-09-07）
  // 修复后验证 script 区域是否仍为合法 JavaScript
  // 如果 AST 解析失败，回滚到原始内容（避免误伤正常代码）
  if (scriptMatch) {
    const fixedScriptMatch = fixed.match(/<script[^>]*>([\s\S]*?)<\/script>/);
    if (fixedScriptMatch) {
      const fixedScript = fixedScriptMatch[1];
      try {
        parseJavaScript(fixedScript, {
          sourceType: 'module',
          errorRecovery: false,
          plugins: ['jsx', 'topLevelAwait', 'importMeta'],
        });
      } catch (err) {
        if (logger) {
          logger.warn(
            'fixSpuriousLineBreaks 修复后 AST 解析失败，回滚到原始内容：' +
              (err?.message || String(err)),
          );
        }
        return content; // 回滚
      }
    }
  }

  return fixed;
}

/**
 * 🎨 构建 resources/styles/index.less 入口模板（治本：根作用域默认主题）
 *
 * @param {string} backgroundBrightness 面板明暗（'light' | 'dark'），决定默认主题 mixin
 * @param {boolean} [emitThemeOverrides=false] 是否引入主题覆盖层
 * @returns {string} index.less 内容
 *
 * 生成结构：
 *   1. @import theme-vars.less        —— 只含 mixin 定义，不产出 CSS
 *   2. 根作用域调用 .common() + .theme-{default}() —— 变量落到根作用域
 *   3. @import (multiple) './common.less' —— 业务 class 输出到**根作用域**（真实 DOM 可命中）
 *   4. （可选）dark.less / light.less 覆盖层，仅在 MC_EMIT_THEME_OVERRIDES=1 时引入
 */
export function buildIndexLessTemplate(
  backgroundBrightness = 'dark',
  emitThemeOverrides = false,
  themeKeys = null,
) {
  const defaultTheme = backgroundBrightness === 'light' ? 'light' : 'dark';
  // 🔴 2026-10-12 契约对齐（M2-4 / M4-5）：覆盖层 import 必须**覆盖全部
  //   `themeConfig.list[].key`**，N 主题要有 N 行。旧实现硬编码 light/dark 两行
  //   ⇒ 第 3 个及以后的主题生成了 `<key>.less` 却没被 import，等于死文件。
  //   `themeKeys` 为空/非数组时回退 light+dark（**单稿路径逐字节不变**）。
  const keys =
    Array.isArray(themeKeys) && themeKeys.length
      ? [...new Set(themeKeys.filter(Boolean))]
      : ['light', 'dark'];
  const overrides = emitThemeOverrides
    ? `
${keys.map((k) => `@import './themes/${k}.less';`).join('\n')}
`
    : `
// 说明：宿主当前不给组件根注入主题类，故不引入 themes/*.less
//（引入只会产出 .dark .c-xxx 这类永不命中的死规则）。宿主支持主题切换后，
//   设置环境变量 MC_EMIT_THEME_OVERRIDES=1 即可自动恢复覆盖层导入。
`;
  // 🔴🔴 2026-10-12 修真机编译阻断（session mc-max-1791797620173-72f86d28）：
  //   `common.less` 在**根作用域**引用 `@color-text-secondary` 等**只定义在主题 mixin 内**的变量
  //   ⇒「variable @color-text-secondary is undefined」⇒ LESS 编译门禁阻断。
  //
  //   机制：Less 的 mixin **不泄漏变量到调用者作用域** —— `.theme-light()` 在根作用域
  //   被调用时，其内部 `@color-xxx` 只在该次调用内可见；`@import (multiple) './common.less'`
  //   紧随其后，拿到的**只有 `.common()` 定义的变量**。
  //   ⇒ 只在根调`.theme-<default>()` 是不够的：**其余主题 mixin 里的变量也得在根可见**。
  //
  //   正解：根作用域依次调用**全部**主题 mixin，使它们的变量对 common.less 可见。
  //
  // 🔴🔴 R21（2026-10-21 · c-a6c6fb-a6c6fbd3 实锤，**实测推翻了一个错误直觉**）：
  //   **LESS 里「mixin 注入的变量」是「先调用者胜出」，不是后者覆盖前者。**
  //   实测（less 4.x 真编译）：
  //     · 普通重复赋值 `@c:#000; @c:#fff;`          ⇒ 后者胜出 (#fff)
  //     · mixin 调用  `.m1(); .m2();`（两者都定义 @c）⇒ **先调用者胜出**（.m1 的值）
  //   两者语义**相反**，极易混淆 —— 曾据此误判「dark 放最后会盖掉默认主题」，
  //   实测证明恰恰相反：把 dark 放最后，根作用域仍是**第一个**被调用主题的值。
  //
  //   ⇒ 不变式：**默认主题必须最先调用**（紧随 `.common()`），其余主题随后补齐
  //     （只为让其变量在根可见，不覆盖已定义的）。顺序若被"改成默认收尾"，
  //     root 会变成**其它主题**的值（浅色稿渲染成深色）。
  //   回归护栏：`style-tokens.root-theme-order.spec.ts`（含真编译阴性/阳性对照）。
  const _otherThemeCalls = [
    ...keys.filter((k) => k !== defaultTheme && k !== 'dark').map((k) => `.theme-${k}();`),
    ...(keys.includes('dark') ? ['.theme-dark();'] : []),
  ]
  const _rootScopeFallbacks = _otherThemeCalls.length
    ? `\n// 其余主题：仅为让其变量在根作用域可见（Less mixin 不泄漏变量），供 common.less 引用。\n// ⚠️ 它们**不会**覆盖上面已注入的变量（mixin 注入 = 先调用者胜出）\n${_otherThemeCalls.join('\n')}\n`
    : ''

  return `// 样式入口（系统自动生成，勿手改）
@import './themes/theme-vars.less';

// 默认主题：必须在**根作用域**生效，否则组件在无主题类祖先的真实 DOM 上样式全部失效
// 🔴 必须是**第一个**被调用的主题（mixin 注入 = 先调用者胜出，后调的不会覆盖它）
.common();
.theme-${defaultTheme}();
${_rootScopeFallbacks}
@import (multiple) './common.less';
${overrides}`;
}

/**
 * 🎨 剥离 common.less 的外层主题包裹（LESS-SCOPE-003）
 *
 * 模型偶尔把全部业务 class 包进 `.dark { ... }` / `&.light { ... }`，
 * 编译后变成 `.dark .c-xxx` —— 宿主不注入主题类 → 真实 DOM 0 命中 → 样式全部失效。
 * 这里做确定性剥壳：仅当**整个文件只有一个顶层块**、且该块选择器是主题选择器时才剥。
 *
 * @param {string} source common.less 原文
 * @returns {{ changed: boolean, source: string, wrapper: string|null }}
 */
export function unwrapThemeScopedCommonLess(source) {
  const noResult = { changed: false, source, wrapper: null };
  if (typeof source !== 'string' || !source.trim()) return noResult;

  // 去掉注释后判定结构（保留原文用于最终输出）
  const stripped = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  // 顶层块必须唯一：第一个 `{` 之前只有选择器，且其匹配的 `}` 之后没有其他非空内容
  const openIdx = stripped.indexOf('{');
  if (openIdx === -1) return noResult;
  const selector = stripped.slice(0, openIdx).trim();
  // 只处理主题选择器（.dark / .light / &.dark / &.light，可带 html/:root 前缀）
  if (!/^(html\s*)?&?\.(dark|light)$/i.test(selector)) return noResult;

  // 找到与之配对的 `}`
  let depth = 0;
  let closeIdx = -1;
  for (let i = openIdx; i < stripped.length; i++) {
    const ch = stripped[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        closeIdx = i;
        break;
      }
    }
  }
  if (closeIdx === -1) return noResult;
  // 块后不允许还有实质内容（保证「整份被包裹」）
  if (stripped.slice(closeIdx + 1).trim()) return noResult;

  // 在原文中定位同样的边界
  const rawOpen = source.indexOf('{');
  const rawClose = source.lastIndexOf('}');
  if (rawOpen === -1 || rawClose <= rawOpen) return noResult;

  let inner = source.slice(rawOpen + 1, rawClose);
  // 去掉统一的一层缩进
  const lines = inner.split('\n');
  const indents = lines
    .filter((l) => l.trim())
    .map((l) => (l.match(/^[ \t]*/) || [''])[0].length);
  const minIndent = indents.length ? Math.min(...indents) : 0;
  if (minIndent > 0) {
    inner = lines.map((l) => (l.trim() ? l.slice(minIndent) : l)).join('\n');
  }
  // 保留主题 mixin 调用会污染根作用域默认主题，剥壳时一并去掉
  inner = inner.replace(
    /^\s*\.(common|theme-dark|theme-light)\s*\(\s*\)\s*;\s*$/gm,
    '',
  );

  const header =
    `// ⚠️ 原内容被 \`${selector}\` 整体包裹，已由生成器剥离外壳\n` +
    `// 理由：宿主不给组件根注入 .dark/.light 类，包裹后编译成 "${selector} .c-xxx"，真实 DOM 0 命中\n`;
  return {
    changed: true,
    source: header + inner.replace(/^\n+/, '').replace(/\n{3,}/g, '\n\n'),
    wrapper: selector,
  };
}

/**
 * 🛡️ Tab UI 骨架自愈（2026-08-31，写盘后确定性兜底）
 *
 * 背景（mc-max-1788171201725-c1914947 实锤）：LLM 在 <script> 定义了 `tabs` 数组
 * （含 label/value 的指标清单）与 `activeTab` 激活态、甚至 `handleTabChange` 切换函数，
 * 却在模板只留 `<!-- 指标切换 Tab -->` 注释 + 子组件，**完全漏掉 tab 栏渲染** ——
 * 结果是「设计了可切换的指标，但界面没有任何可点击的 tab」。
 *
 * 门禁拦截重试（L0-B）有空转风险（模型多次也不一定能补出 tab UI），此处采用与
 * healRootFixedSize 同源的「写盘后确定性自愈」思路，不依赖模型重试：
 *   - 检测 script 有 tabs 数组（≥2 项含 label/value）+ 模板无对应 tab 渲染
 *   - 注入 tab 栏骨架，复用已有的 `tabs` / `activeTab` / `handleTabChange`（若存在）
 *   - 幂等：模板已含 `c-xxx-tabs` 类则跳过
 *
 * @param {string} content 单文件 .vue 内容
 * @param {Object} [options]
 * @param {string} [options.tabsVar] 显式指定 tabs 变量名（默认自动探测）
 * @param {string} [options.activeVar] 显式指定激活态变量名（默认自动探测）
 * @returns {string}
 */
export function injectMissingTabUi(content, options = {}) {
  if (typeof content !== 'string') return content;
  // 幂等：已注入过（含 .c-xxx-tabs 类）则跳过，避免重复注入
  if (/\bc-[\w-]+-tabs\b/.test(content)) return content;

  // 🛡️ 2026-11-10（7cac7ab3 实锤，游离根第四次复发·制造者是本函数）：
  //   旧实现 lazy 正则 `/<template[^>]*>([\s\S]*?)<\/template>/` 被**命名插槽**
  //   `<template #header-right>` 的第一个 `</template>` 截断（总纲 §已知反模式），
  //   后续 `content.replace(tpl[1], …)` 把 tab 栏写进 base-panel 之外 ⇒ 游离根落盘
  //   （R11-A/B 都在写盘前，写盘出口注入后无人归位 ⇒ 预览左侧文字竖排）。
  //   治本 A：主 `<template>` 块按 **配平扫描** 提取（depth 计数 template 开/闭），
  //   与 stray-template-root-relocator 同一反截断纪律。
  const tplBody = extractMainTemplateBody(content);
  const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/);
  if (tplBody === null || !scriptMatch) return content;
  const scriptBody = scriptMatch[1];

  // ① 探测 tabs 数组变量（必须后接 [ .. ]，排除 activeTab 等字符串 ref）
  const tabsVar = options.tabsVar || detectTabsVar(scriptBody);
  if (!tabsVar) return content;

  // ② 校验确实是「指标 tab 数组」：提取数组体、字段名、value 集合
  const arrInfo = detectTabArrayInfo(scriptBody, tabsVar);
  if (!arrInfo || arrInfo.values.length < 2) return content;

  // ③ 模板是否已渲染该 tabs？已渲染则跳过（不重复注入）
  if (templateRendersTabs(tplBody, tabsVar)) return content;

  // ③-b 🛡️ header 通道已承载闸（2026-11-10 · 7b4ae1d8 双份 tabs 实锤）：header-right 等
  //   header 专属插槽非空 ⇒ label/tab 契约已由 header 通道消费，内容区再注入 tab 骨架必双份
  //   （旧判据只认 v-for，HeaderSection 等子组件承载识别不到）。
  if (headerChannelOccupied(tplBody)) {
    return content;
  }

  // ④ 探测激活态变量（找不到则放弃：避免注入未声明绑定导致语义门禁失败）
  const activeVar = options.activeVar || detectActiveVar(scriptBody, tplBody, arrInfo.values);
  if (!activeVar) return content;

  // ⑤ 派生 tab 类前缀（c-xxx）
  const prefix = deriveTabClassPrefix(tplBody);
  if (!prefix) return content;

  // ⑥ 探测切换处理函数（可选）
  const changeHandler = detectTabChangeHandler(scriptBody, activeVar);

  // ⑦ 注入 tab 栏骨架
  const bar = buildTabBarSkeleton(
    prefix,
    tabsVar,
    activeVar,
    arrInfo.labelKey,
    arrInfo.valueKey,
    changeHandler,
  );
  const newBody = injectTabBarIntoTemplate(tplBody, bar);
  if (!newBody || newBody === tplBody) return content;
  // 🛡️ 治本 A 配套：tplBody 现在是完整模板体（含首尾 `<template>` 标签），整块替换主模板。
  return content.replace(tplBody, newBody);
}

/**
 * 🛡️ 主 `<template>` 块配平提取（2026-11-10 · 游离根第四次复发治本 A）。
 * depth 计数 `<template…>` 开 / `</template>` 闭，跳过 SFC 其他顶层块（script/style，
 * 其中不会出现 template 标签配对干扰）；返回**含首尾标签的完整块**，未命中返回 null。
 * 取代旧 lazy 正则——后者被命名插槽 `<template #x>` 的第一个 `</template>` 截断。
 */
function extractMainTemplateBody(content) {
  const open = content.match(/<template[^>]*>/);
  if (!open) return null;
  const start = open.index;
  const tokenRe = /<\/?template\b[^>]*>/gi;
  tokenRe.lastIndex = start;
  let depth = 0;
  let m;
  while ((m = tokenRe.exec(content)) !== null) {
    if (/^<\/template/i.test(m[0])) {
      depth -= 1;
      if (depth === 0) return content.slice(start, m.index + m[0].length);
    } else if (!/\/\s*>$/.test(m[0])) {
      depth += 1;
    }
  }
  return null;
}

/** 正则转义（变量名用） */
function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 探测 tabs 数组变量名（tabs / monitorTabs / tabList / tabData 等，且必须是数组字面量） */
function detectTabsVar(script) {
  const m = script.match(
    /\b(\w*[Tt]abs?\w*)\s*=\s*(?:ref|reactive|shallowRef|computed)?\s*\(?\s*\[([\s\S]*?)\]/,
  );
  return m ? m[1] : null;
}

/**
 * 提取 tab 数组信息：label/value 字段名 + 全部 value 字符串。
 * @returns {{labelKey:string, valueKey:string, values:string[]}|null}
 */
function detectTabArrayInfo(script, tabsVar) {
  const re = new RegExp(
    '\\b' +
      escapeRe(tabsVar) +
      '\\s*=\\s*(?:ref|reactive|shallowRef|computed)?\\s*\\(?\\s*(\\[[\\s\\S]*?\\])',
  );
  const m = script.match(re);
  if (!m) return null;
  const arrText = m[1];
  // 第一个对象块：判定 label/value 字段名（不唯一时给默认 label/value）
  const firstObj = arrText.match(/\{([\s\S]*?)\}/);
  if (!firstObj) return null;
  const objBody = firstObj[1];
  const labelKey = (objBody.match(/\b(label|name|title|text)\s*:/i) || [])[1] || 'label';
  const valueKey = (objBody.match(/\b(value|key|id)\s*:/i) || [])[1] || 'value';
  const values = [];
  const vRe = new RegExp(
    '\\b' + escapeRe(valueKey) + "\\s*:\\s*['\"]([^'\"]+)['\"]",
    'g',
  );
  let vm;
  while ((vm = vRe.exec(arrText)) !== null) values.push(vm[1]);
  return { labelKey, valueKey, values };
}

/** 模板是否已渲染该 tabs（v-for 引用或 class 含 tab 字样） */
function templateRendersTabs(tplBody, tabsVar) {
  if (
    new RegExp(
      'v-for\\s*=\\s*["\'][^"\']*\\b(?:in|of)\\s+' + escapeRe(tabsVar) + '\\b',
      'i',
    ).test(tplBody)
  ) {
    return true;
  }
  if (/\bclass\s*=\s*["'][^"']*\btab\b/i.test(tplBody)) return true;
  if (/:\s*class\s*=\s*["'][^"']*\btab\b/i.test(tplBody)) return true;
  return false;
}

/**
 * 🛡️ header 通道已承载检查（2026-11-10 · 重点车辆 7b4ae1d8 双份 tabs 实锤）：
 *   模板存在**非空**的 header 专属具名插槽（#header-right/#title-left/#title-right，
 *   内含真实元素而非纯注释/空白）⇒ headerSlots 契约（label/tab 类）已由 header 通道
 *   消费（T09 注入或 LLM 生成 HeaderSection 等）。此时 script 里的 tabs 数组即使没有
 *   v-for 渲染，也**不得**再注入内容区 tab 骨架——否则 header 胶囊 + 内容区 tabs 双份
 *   （templateRendersTabs 只认 v-for 绑定，子组件/插槽承载识别不到，故需本前置闸）。
 *   纯结构判据（插槽名 + 非空内容），零硬编码。
 */
function headerChannelOccupied(tplBody) {
  const slotRe = /<template\s+[^>]*(?:#|v-slot:)(?:header-right|title-left|title-right)\b[^>]*>/i;
  const m = slotRe.exec(tplBody);
  if (!m) return false;
  const openEnd = m.index + m[0].length;
  const close = tplBody.indexOf('</template>', openEnd);
  if (close === -1) return false;
  const inner = tplBody.slice(openEnd, close).trim();
  // 剔除纯注释后仍需有真实元素（含子组件标签——子组件承载也算 header 通道已占用）
  const withoutComments = inner.replace(/<!--[\s\S]*?-->/g, '').trim();
  return withoutComments.length > 0 && /<[a-zA-Z]/.test(withoutComments);
}

/**
 * 探测当前激活 tab 变量（优先级：模板 :active-tab 绑定 > v-model > 变量名模式 > ref 初始值命中 tab value）。
 * 任一命中即返回变量名；都未命中返回 null（调用方放弃注入，避免注入未声明绑定）。
 */
function detectActiveVar(script, tpl, values) {
  // 1) 模板 :active-tab / :activeTab 绑定（且脚本中确实声明了该变量）
  const bindRe = /:\s*(?:active-?tab|activeTab)\s*=\s*["']\s*(\w+)\s*["']/i;
  const bm = tpl.match(bindRe);
  if (bm && new RegExp('\\b' + escapeRe(bm[1]) + '\\b').test(script)) return bm[1];
  // 2) v-model 指向变量且脚本声明
  const vm = tpl.match(/v-model\s*=\s*["']\s*(\w+)\s*["']/i);
  if (vm && new RegExp('\\b' + escapeRe(vm[1]) + '\\b').test(script)) return vm[1];
  // 3) 变量名模式（activeTab / currentTab / selectedTabKey 等）
  const nameRe = /\b((?:active|current|selected|cur)\w*(?:tab|TabKey|TabValue|Tab)\w*)\b/;
  const nm = script.match(nameRe);
  if (nm) return nm[1];
  // 4) ref 初始值命中某个 tab value（如 const activeTab = ref('co')）
  const alt = values.map(escapeRe).join('|');
  if (alt) {
    const vr = new RegExp(
      '\\b(?:const|let|var)\\s+(\\w+)\\s*=\\s*(?:ref|reactive|shallowRef|computed)?\\s*\\(\\s*[\'"](' +
        alt +
        ')[\'"]\\s*\\)',
    );
    const vrm = script.match(vr);
    if (vrm) return vrm[1];
  }
  return null;
}

/** 由模板根 class 推导 tab 类前缀（c-xxx）：优先 -root 语义根，回退任意 c- 前缀类 */
function deriveTabClassPrefix(tplBody) {
  const rootM = tplBody.match(/\bclass\s*=\s*["']([^"']*\bc-[\w-]*-root\b[^"']*)["']/);
  let rootClass = rootM
    ? rootM[1].split(/\s+/).find((c) => /-root$/.test(c))
    : null;
  if (!rootClass) {
    const anyM = tplBody.match(/\bclass\s*=\s*["']([^"']*\bc-[\w-]+\b[^"']*)["']/);
    rootClass = anyM ? anyM[1].split(/\s+/).find((c) => c.startsWith('c-')) : null;
  }
  if (!rootClass) return null;
  let prefix = rootClass.replace(/-root$/, '');
  // 去掉尾随的实例 ID 长串（c-mc-max-xxx-yyy）
  prefix = prefix.replace(/-mc-max-\d+-[a-f0-9]+$/, '');
  return prefix || null;
}

/** 探测切换处理函数（handleTabChange / onTabChange / switchTab 等），存在则点击调用它，否则直接赋值 activeVar */
function detectTabChangeHandler(script, activeVar) {
  const m = script.match(/\b((?:handle|on|change|switch)\w*[Tt]ab\w*)\s*(?:=\s*)?\(/);
  if (m) return m[1];
  return null;
}

/** 构建 tab 栏骨架（inline style 避免引入新样式块导致 LESS 编译风险） */
function buildTabBarSkeleton(prefix, tabsVar, activeVar, labelKey, valueKey, changeHandler) {
  const tabsClass = `${prefix}-tabs`;
  const itemClass = `${prefix}-tab-item`;
  const clickExpr = changeHandler
    ? `${changeHandler}(tab.${valueKey})`
    : `${activeVar} = tab.${valueKey}`;
  const styleExpr = `${activeVar} === tab.${valueKey} ? 'background:var(--mc-primary,#2f6bff);color:#fff;' : 'background:rgba(255,255,255,0.08);color:#fff;'`;
  return (
    `      <div class="${tabsClass}" style="display:flex;gap:8px;margin-bottom:12px;">\n` +
    `        <div\n` +
    `          v-for="tab in ${tabsVar}"\n` +
    `          :key="tab.${valueKey}"\n` +
    `          class="${itemClass}"\n` +
    `          :class="{ '${itemClass}--active': ${activeVar} === tab.${valueKey} }"\n` +
    `          :style="${styleExpr}"\n` +
    `          @click="${clickExpr}"\n` +
    `          style="padding:4px 12px;border-radius:4px;cursor:pointer;font-size:14px;line-height:20px;"\n` +
    `        >{{ tab.${labelKey} }}</div>\n` +
    `      </div>`
  );
}

/** 把 tab 栏注入模板：优先作为 -root 语义根 div 的第一个子节点，否则放在模板最前 */
function injectTabBarIntoTemplate(tplBody, bar) {
  const rootOpenRe = /(<div\b[^>]*\bclass\s*=\s*["'][^"']*-root\b[^"']*["'][^>]*>)/;
  const m = tplBody.match(rootOpenRe);
  if (m) {
    const idx = m.index + m[0].length;
    return tplBody.slice(0, idx) + '\n' + bar + tplBody.slice(idx);
  }
  // 🛡️ 治本 B（2026-11-10 · 7cac7ab3 实锤）：回退分支**禁止把 tab 栏插到 base-panel 之外**。
  //   旧实现 `return bar + '\n' + tplBody` 在含 base-panel 的模板上制造游离根（tab 栏落在
  //   base-panel 开标签之前 ⇒ 宿主 flex 上下文把它压成竖窄条）。现在：有 base-panel ⇒
  //   插到其开标签之后（默认插槽首部，与 LLM 本意「tab 行在面板内容顶部」语义等价）；
  //   确无 base-panel（非微码宿主形态）才允许插到模板最前。
  const panelOpen = tplBody.match(/<base-panel\b[^>]*>/);
  if (panelOpen) {
    const idx = panelOpen.index + panelOpen[0].length;
    return tplBody.slice(0, idx) + '\n' + bar + tplBody.slice(idx);
  }
  return bar + '\n' + tplBody;
}

/**
 * 🧩 SFC 内嵌 style 块括号平衡自愈（2026-08-31，C 步治本）：
 * LLM 常漏写 style 块的右大括号（如 `.c-xxx-root { ... font-size:14px;` 后直接 `</style>`）。
 * 独立 .less 文件已有 healCriticalStandaloneLess / healMissingLessBraces 覆盖，
 * 但 .vue 内嵌 style 块此前无任何自愈 → LESS 编译报 Unrecognised input → SFC 门禁失败。
 *
 * R0-5（2026-09-01）：废弃本地「剥注释纯计数」实现，统一委托 less-compile-gate 的
 * 栈帧级 healMissingLessBraces（单一事实源）。纯计数会把字符串/嵌套场景算错，
 * 且只能在 </style> 前补差额；栈帧算法可在「新顶层规则前精确闭合当前块」，
 * 避免把后续规则错误嵌套进上一个容器。作用域不变：仍按 style 块逐块处理。
 */
/**
 * 🛡️ G6（2026-11-04 · mc-max-1793775515654-bf0f0342 实锤）：script 区段内 CSS 声明行清除。
 *
 * 病灶：bf0f0342 产物 index.vue 的 `handleLegendToggle` 函数体内被插进一行
 *   `  display: flex;`——上游样式回写链（layout-refiner claim 回写嫌疑）定位锚点
 *   错配到 script。`display: flex;` 在 JS 里是**合法标签语句**（label + 表达式），
 *   语法/语义门禁全部放行 ⇒ 坏产物带病落盘。
 *
 * 治本（出口确定性拦截，一次防住全部注入者）：逐行扫描 `<script...>...</script>`
 *   区段，删除「CSS 声明形态行」：缩进 + CSS 属性白名单冒号 + 分号结尾、
 *   且行内无 JS 语法字符（括号/逗号/运算符）。合法 JS 撞形态需要「对象字面量
 *   无逗号换行 + 分号结尾 + 属性名恰在白名单」，真机语料 0 例（对象属性以 `,`
 *   或 `}` 收尾，不合形态）——零误伤可辩驳。
 *
 * @param {string} content SFC 全文
 * @returns {{ source: string, changed: boolean, removed: number, samples: string[] }}
 */
const CSS_DECL_PROP_RE =
  /^\s+(display|flex-direction|flex-wrap|justify-content|align-items|align-content|align-self|gap|row-gap|column-gap|width|height|min-width|min-height|max-width|max-height|margin|margin-top|margin-right|margin-bottom|margin-left|padding|padding-top|padding-right|padding-bottom|padding-left|background|background-color|background-size|background-position|background-repeat|background-image|border|border-radius|border-color|border-width|color|font-size|font-weight|font-family|line-height|letter-spacing|text-align|text-overflow|white-space|vertical-align|overflow|overflow-x|overflow-y|position|top|right|bottom|left|z-index|opacity|box-sizing|box-shadow|object-fit|cursor|pointer-events|transition|transform)\s*:\s*[^;{}()"',=+\-*/]+;\s*$/;

export function healCssDeclarationsInScript(content) {
  if (typeof content !== 'string' || !/<script[\s>]/i.test(content)) {
    return { source: content, changed: false, removed: 0, samples: [] };
  }
  let removed = 0;
  const samples = [];
  const source = content.replace(
    /(<script\b[^>]*>)([\s\S]*?)(<\/script\s*>)/gi,
    (full, openTag, body, closeTag) => {
      const lines = body.split('\n');
      const kept = [];
      for (const line of lines) {
        if (CSS_DECL_PROP_RE.test(line) && removed + samples.length < 50) {
          removed += 1;
          if (samples.length < 5) samples.push(line.trim());
          continue;
        }
        kept.push(line);
      }
      return `${openTag}${kept.join('\n')}${closeTag}`;
    },
  );
  return { source, changed: removed > 0, removed, samples };
}

export function healVueEmbeddedStyleBraces(content) {
  if (typeof content !== 'string' || !content.includes('<style')) return content;
  let changed = false;
  const out = content.replace(
    /<style\b[^>]*>([\s\S]*?)<\/style>/gi,
    (full, css) => {
      // 🛡️ 治本（2026-09-17 回归修复）：此前只补缺失右大括号（healMissingLessBraces），
      // 漏写分号（如 `box-sizing: border-box` 后无 `;` 直接接下一声明）会被放行，
      // 写盘后预览 less 编译报 Unrecognised input（实锤 mc-max-1789646354631-241fa856 ContentSection4.vue）。
      // 先补括号再补分号，二者同属「确定性后处理」，与 .less 文件写盘路径（healLessSource）口径一致。
      // 注意：传入的是 style 块正文（无 <style> 标签），须用 sourceType:'style'，否则 vue 守卫会整块跳过。
      const healedBraces = healMissingLessBraces(css);
      const healed = healMissingSemicolons(healedBraces.source, { sourceType: 'style' });
      if (healed.changed || healedBraces.changed) {
        changed = true;
        return full.replace(css, healed.source);
      }
      return full;
    },
  );
  return changed ? out : content;
}

/**
 * 🧩 theme-vars mixin 内变量引用改写（2026-08-31 晚间，E 步治本）：
 * theme-vars.less 的 @fontSize 等令牌定义在 `.common()` / `.theme-dark()` mixin 闭包内，
 * 顶层作用域不可见。LLM 常在 common.less 顶层（非主题选择器内）直接写
 * `font-size: @fontSize;` / `calc(@fontSize * 0.857)` → less 编译报 variable undefined
 * → LESS-COMPILE-001 → 候选文件标红「1 个文件存在问题」。
 * （实锤 mc-max-1788176720155-9560d082：同一文件 root 已用 var(--fontSize,14px) 正确，
 *  子选择器却用 @fontSize 错——LLM 对 mixin 作用域认知不稳定，需确定性自愈兜底。）
 *
 * 策略：把顶层引用改写为 CSS 变量形式 var(--<name>, <mixin 内默认值>)（与已有正确写法一致，
 * CSS calc 支持 var()）。只处理「值位置」引用：变量声明行（@name:）、@{} 插值、注释行不动。
 * 本地已声明的变量不替换。
 *
 * @param {string} content - 待修复的 .less 内容（如 common.less）
 * @param {string} themeVarsContent - theme-vars.less 内容（提取 mixin 内变量表）
 * @returns {string} 修复后内容（无需修复时返回原串）
 */
/**
 * 🔴🔴 2026-10-23 治本（mc-max-1792739994368-e2c61f62 实锤）：mixin 变量改写的
 * **CSS var() 浏览器兜底字面量表（设计基准值）**。
 *
 * 事故链：theme-vars.less 经 M5-6 归一后，mixin 内 `@fontSize` 的 def 是
 * `var(--fontSize)` 透传形态；healThemeMixinVarRefs 原样塞进 fallback 产出
 * `var(--fontSize, var(--fontSize))` **自引用双写** → 喂给
 * healBusinessStyleVarsInCss 的 VAR_RE 被懒匹配拆半 ⇒ 丢括号残骸
 * `calc(@fontSize) * 1.7143);` ⇒ LESS 门禁 `Operation on an invalid type`
 * ⇒ 整任务失败（common.less:201，本轮真机日志逐字实证）。
 *
 * ⚠️ 与 style-tokens.js#MC_SIZE_LITERAL_DEFAULTS **语义不同**，勿合并：
 *   那张表是「Less 变量值落字面量」（fontSize=12px）；本表是「CSS var() 缺失时
 *   浏览器兜底」，fontSize 必须是设计基准 **14px**（FONT_BASE_PX /
 *   font-size-normalizer 基准 / theme-vars 头注「默认 14px」同口径）。
 */
const MIXIN_VAR_CSS_FALLBACKS = {
  fontSize: '14px',
  fontWeightStrong: '600',
  lineHeight: '1.5',
  borderRadius: '4px',
  borderRadiusBase: '8px',
  borderRadiusSmall: '4px',
  spacing: '4px',
  spacingXs: '4px',
  spacingSm: '8px',
  spacingMd: '12px',
  spacingLg: '16px',
  spacingXl: '24px',
};

/**
 * mixin 变量改写的安全 fallback 取值（三级，取不到 ⇒ null = fail-open 跳过替换）：
 *   ① def 非 var() 形态（字面量/表达式）⇒ 照旧用（既有行为不变）；
 *   ② def 是 `var(--x, <字面量>)` ⇒ 剥内层字面量；
 *   ③ def 是 `var(--x)` 无内层 fallback ⇒ 查设计基准表；
 *   ④ 都没有 ⇒ null —— 宁可不改，绝不产出 `var(--x, var(--x))` 自引用双写。
 */
function safeMixinVarFallback(name, def) {
  const d = String(def || '').trim();
  if (!d) return null;
  if (!/^var\(/i.test(d)) return d;
  const inner = /^var\(\s*--[\w-]+\s*,\s*([^()]+?)\s*\)\s*;?\s*$/i.exec(d);
  if (inner && inner[1].trim()) return inner[1].trim();
  if (Object.prototype.hasOwnProperty.call(MIXIN_VAR_CSS_FALLBACKS, name)) {
    return MIXIN_VAR_CSS_FALLBACKS[name];
  }
  return null;
}

/**
 * 🛡️ 2026-11-03 治本 · 裸 Less 变量算术 → calc() 包裹（mc-max-1793679140403-eaa64a71 实锤）。
 *
 * 病灶：M5-6 归一后 `@fontSize` 等令牌的值是 `var(--fontSize)` **透传形态**（运行期值），
 *   Less 无法在编译期对其做算术求值：
 *   - `font-size: calc(@fontSize * 1.14);` ✅ 可编译（calc 内保留 var() 链原样输出，
 *     实测 `calc(var(--fontSize) * 1.14)`）——全库 2185 处 calc 形态因此不炸；
 *   - `font-size: @fontSize * 2;` 🔴 `Operation on an invalid type` ⇒ SFC 写盘门禁
 *     判死整个文件 ⇒ 组件文件缺失 ⇒ CODE-023 悬空子组件标签 ⇒ L0-B 重试耗尽任务失败。
 *   （eaa64a71：StatsSection.vue 因 `@fontSize * 2` 被跳过，chunk-meta 标 completed 但产物无文件。）
 *
 * 治本：值位置的裸 `@x * N`（x 为 var() 透传定义）确定性改写为 `calc(@x * N)`——
 *   包 calc 后与既有合法形态完全一致，编译通过且语义等价（浏览器端求值）。
 *
 * 边界（极保守，可辩驳）：
 *   - 只处理 `*`（真机唯一形态；`/` 在 strictMath 下语义不同、`+/-` 需空格规范，不碰）；
 *   - 只处理文件内声明为 `var(` 开头的变量（字面量定义的算术是合法求值，包 calc 反而
 *     阻止编译期折叠——`@w: 14px; @w * 2` → 28px 优于 calc(14px * 2)）；
 *   - 已在 `calc(` 内的不重复包裹（前驱非 `calc(` 结尾才动手）；
 *   - 变量声明行本身不动（`@x: ...` 行首形态排除）。
 *
 * 纯函数、无 IO、幂等（包裹后前驱变为 `calc(`，二次调用零改动）。
 *
 * @param {string} content 业务样式源（.less 内容或 SFC 内嵌 style 块）
 * @returns {string} 修复后内容（无匹配时原样返回）
 */
export function healBareVarArithmeticToCalc(content) {
  if (typeof content !== 'string' || !content.includes('@')) return content;
  // 收集 var() 透传定义的变量名（顶层 `@x: var(...)`，含缩进形态）
  const passthrough = new Set();
  for (const m of content.matchAll(/^\s*@([\w-]+)\s*:\s*var\(/gm)) {
    passthrough.add(m[1]);
  }
  if (passthrough.size === 0) return content;

  let changed = false;
  const out = content.split('\n').map((line) => {
    const t = line.trim();
    // 跳过注释行与变量声明行（与 healThemeMixinVarRefs 同口径）
    if (
      t.startsWith('//') ||
      t.startsWith('/*') ||
      t.startsWith('*') ||
      /^@[\w-]+\s*:/.test(t)
    ) {
      return line;
    }
    let outLine = line;
    for (const name of passthrough) {
      // 值位置 `@x * N`：前驱为行首/`:`/`(`/空白，后跟 * 与数字
      const re = new RegExp(
        `(^|[:(]|\\s)@${name}(?![\\w-])\\s*\\*\\s*(\\d+(?:\\.\\d+)?(?:px|em|rem|%)?)`,
        'g',
      );
      if (re.test(outLine)) {
        outLine = outLine.replace(re, (mm, pre, num, offset) => {
          // 已在 calc( 内的不重复包裹（幂等：包裹后前驱文本以 calc( 结尾）
          // 注意 pre 是匹配的一部分（`(` 等），检查须含 pre：slice(0, offset + pre.length)
          if (outLine.slice(0, offset + pre.length).endsWith('calc(')) return mm;
          return `${pre}calc(@${name} * ${num})`;
        });
        changed = true;
      }
    }
    return outLine;
  }).join('\n');
  return changed ? out : content;
}

export function healThemeMixinVarRefs(content, themeVarsContent) {
  if (typeof content !== 'string' || !content.includes('@')) return content;
  if (typeof themeVarsContent !== 'string' || !themeVarsContent.includes('@')) {
    return content;
  }
  const mixinVars = extractMixinScopedVars(themeVarsContent);
  if (mixinVars.size === 0) return content;

  // 本地已顶层声明的变量不替换（自身可见）
  const localDeclared = new Set();
  for (const m of content.matchAll(/^\s*@([\w-]+)\s*:/gm)) localDeclared.add(m[1]);

  // 🛡️ A-②（2026-09-29 治本）：被 LESS **颜色函数**当实参引用的槽位一律不改写。
  //
  // 根因：颜色函数（lighten/darken/fade…）必须在**编译期**求值，而 `var()` 是运行期值 →
  // 改写后报 `Error evaluating function \`lighten\`: Argument cannot be evaluated to a color`
  // → 整个 `<style>` 块编译失败 → P1-4 隔离降级 → 子组件整块消失（刀 15/16b 同源事故）。
  //
  // 历史：此前的防护是「injectThemeVarDeclsForLess 先注入同名声明 → localDeclared 命中 →
  // 本函数跳过改写」。但那条路会在业务样式顶层产 `@color-*: <light 字面量>`
  // → 同时命中门禁 THEME-SLOT-LOCAL-OVERRIDE（BLOCK）且与「mixin 变量首定义者胜出」抢定义。
  // 现在改为**直接豁免**：不改写 → 保留 `@color-primary` → 由主题作用域在编译期提供真值
  // （比原先注入中立灰 `#333333` 更准 —— 颜色函数也能吃主题真色）。
  //
  // 单一事实源：复用 `collectColorFnVars`（与 `healPresetLiteralDecls` 的豁免同源）。
  const colorFnVars = collectColorFnVars(content);

  let changed = false;
  const out = content
    .split('\n')
    .map((line) => {
      const t = line.trim();
      // 跳过注释行与变量声明行
      if (
        t.startsWith('//') ||
        t.startsWith('/*') ||
        t.startsWith('*') ||
        /^@[\w-]+\s*:/.test(t)
      ) {
        return line;
      }
      let outLine = line;
      for (const [name, def] of mixinVars) {
        if (localDeclared.has(name)) continue;
        if (colorFnVars.has(name)) continue; // 🛡️ A-②：颜色函数实参 → 保留 Less 槽位引用
        // 值位置引用：@name 后非冒号（排除声明）、非 { （排除 @{} 插值）
        // 🛡️ 治本（2026-09-16 · c-vehicle-monitor-71dd6494 实锤）：原 `@${name}\b` 的 \b 把
        // `-` 当词边界 → `@color-bg` 误匹配 `@color-bg-card` 的前缀 → 产出
        // `var(--color-bg, ...)-card`（非法 CSS，背景/边框声明被浏览器忽略）。改为
        // `(?![-\w])` 负向前瞻：后面若是 `-` 或词字符（即同名前缀槽位如 -card/-hover/-base）
        // 一律不匹配，杜绝「短槽位名吞长槽位名前缀」。
        const re = new RegExp(`@${name}(?![\\w-])(?!\\s*:)(?!\\{)`, 'g');
        if (re.test(outLine)) {
          // 🔴🔴 2026-10-23 治本（e2c61f62 实锤）：def 为 var() 透传形态时原样塞 fallback
          //   会产 `var(--x, var(--x))` 自引用双写 ⇒ 下游 VAR_RE 拆半丢括号 ⇒ LESS 门禁炸。
          //   fallback 三级取值（内层字面量 → 设计基准表 → fail-open 跳过）。
          const fb = safeMixinVarFallback(name, def);
          if (fb === null) continue;
          outLine = outLine.replace(re, `var(--${name}, ${fb})`);
          changed = true;
        }
      }
      return outLine;
    })
    .join('\n');
  return changed ? out : content;
}

/**
 * 🛡️ M5-6 治本（2026-09-10）：业务 .less 顶层注入 theme-vars 变量声明。
 *
 * 背景：theme-vars.less 的变量定义在 .common() 等 mixin 闭包内，顶层作用域不可见，
 * 于是 healThemeMixinVarRefs 会把业务样式的 `@fontSize` 改写成 `var(--fontSize, <def>)`。
 * 但 file-writer 已把 theme-vars 归一为 `@fontSize: var(--fontSize)`，def 也随之变成
 * `var(--fontSize)` → 产出 **`var(--fontSize, var(--fontSize))`**（fallback 指向自己），
 * 既绕过 LESS 变量层，又被 mc-check v1.0.20 的 M5-6 判「声明了但未使用 @fontSize」→
 * 实测 106 个合法命名组件里 68 个因此不允许上线。
 *
 * 解法：**不替换引用，改为在业务 .less 顶层注入同名声明**（值原样取自 theme-vars）。
 * 注入后 healThemeMixinVarRefs 的 `localDeclared` 命中 → 自动跳过替换 → 保留 `@fontSize`
 * （合规）；同时 LESS 编译不再报 variable undefined（原自愈的初衷照旧满足）。
 * 编译产物 CSS 与替换方案**完全等价**，不改变运行时行为（已用三样例 + less 4.9.0 验证）。
 *
 * ⚠️ 边界（A-① 2026-09-29）：**只注入 .common() 里的跨主题共享令牌**（字号/字重/圆角/间距）。
 * 凡声明在 `.theme-light()` / `.theme-dark()` 内的槽位（值随主题变化）一律不注入 —— 见
 * 下方 A-① 注释，作用域由 import 链提供。
 *
 * @param {string} lessContent 业务样式源（common.less 等，不含 themes/）
 * @param {string} themeVarsContent theme-vars.less 内容
 * @returns {string} 注入后的内容（无缺失时原样返回）
 */
export function injectThemeVarDeclsForLess(lessContent, themeVarsContent) {
  const source = String(lessContent || '');
  const decls = extractThemeVarDecls(themeVarsContent);
  if (!decls.size) return source;
  // 🛡️ A-①：主题作用域槽位（值随主题变化者）不注入 —— 见下方循环内注释。
  const themeScoped = extractThemeScopedNames(themeVarsContent);

  // 业务文件顶层已声明的变量不再注入（避免重复声明）
  const local = new Set();
  for (const m of source.matchAll(/^\s*@([\w-]+)\s*:/gm)) local.add(m[1]);

  // 业务文件引用到的变量（排除 at-rule 关键字）
  const refs = new Set();
  for (const m of source.matchAll(/@([\w-]+)/g)) {
    if (LESS_AT_RULES.has(m[1])) continue;
    refs.add(m[1]);
  }

  const missing = [];
  for (const name of refs) {
    if (local.has(name) || !decls.has(name)) continue;
    // 🛡️ A-①（2026-09-29 削源）：**主题作用域槽位**（在 .theme-light()/.theme-dark() 内
    // 声明的，即值随主题变化者）一律不在业务文件顶层重声明。
    //   两宗罪：① 命中门禁 THEME-SLOT-LOCAL-OVERRIDE（BLOCK，重试耗尽风险）；
    //           ② 与「mixin 变量首定义者胜出」叠加时与主题 mixin 抢定义。
    //   作用域由 import 链天然提供（index.less 先 `.common(); .theme-light();` 再
    //   `@import common.less`；themes/dark.less 在 `&.dark { .theme-dark(); … }` 内 import）。
    //   全语料取证（491 份真产物）：业务样式文件 **0 例**缺主题作用域
    //   （唯一 5 例是 theme-vars.less 自身，已被门禁排除）→ 不会引入 variable undefined。
    if (themeScoped.has(name)) continue;
    missing.push(name);
  }
  if (!missing.length) return source;

  // 🗑️ 刀 16b 已删除（2026-09-29 删减法）。原逻辑："被 LESS 颜色函数当实参引用 + 主题值不可
  // 求值 → 注入中立真颜色 #333333"，防 `Argument cannot be evaluated to a color`。
  // 该 fallback 现由 `healThemeMixinVarRefs` 的 **A-② 豁免**接管（颜色函数实参一律不改写 →
  // 保留 `@color-primary` → 由主题作用域编译期提供真值）。既然实参不再被改写成 var()，
  // 就不需要「注入可求值假色」这条兜底；而它注入的真颜色恰恰是 THEME-SLOT-LOCAL-OVERRIDE
  // 的 BLOCK 源之一。=> 事实已被接管，对应 fallback 删除（门禁总量只降不升）。
  const decl = missing.map((n) => `@${n}: ${decls.get(n)};`).join('\n');
  return `${decl}\n${source}`;
}

/**
 * 提取 theme-vars.less 中声明在 `.theme-light()` / `.theme-dark()` 闭包内的槽位名。
 * 这些槽位的值**随主题变化** ⇒ 禁止在业务文件顶层重声明（见 A-①）。
 * 只扫 theme 两个 mixin：`.common()` 里的是跨主题共享令牌（字号/圆角/间距），可安全注入。
 *
 * @param {string} themeVarsContent theme-vars.less 内容
 * @returns {Set<string>} 不含 @ 的槽位名
 */
function extractThemeScopedNames(themeVarsContent) {
  const names = new Set();
  let inTheme = false;
  let depth = 0;
  for (const raw of String(themeVarsContent || '').split('\n')) {
    const t = raw.trim();
    if (!inTheme) {
      if (/^\.(theme-dark|theme-light)\s*\(\s*\)\s*\{/.test(t)) {
        inTheme = true;
        depth = 1;
      }
      continue;
    }
    depth += (t.match(/\{/g) || []).length - (t.match(/\}/g) || []).length;
    // 剥行尾 // 注释再取值（与 extractThemeVarDecls 同口径，避免注释污染）
    const m = t.replace(/\/\/.*$/, '').trim().match(/^@([\w-]+)\s*:/);
    if (m) names.add(m[1]);
    if (depth <= 0) inTheme = false;
  }
  return names;
}

/** LESS at-rule 关键字：出现在 `@xxx` 位置但不是变量引用，注入时必须排除 */
const LESS_AT_RULES = new Set([
  'import', 'import-once', 'media', 'supports', 'keyframes', 'font-face',
  'charset', 'namespace', 'page', 'document', 'extend', 'mixin', 'include',
  'if', 'else', 'for', 'each', 'while', 'function', 'return', 'ruleset',
  'plugin', 'content', 'arguments', 'rest', 'screen', 'print',
]);

/**
 * 提取 theme-vars.less 全部变量声明（mixin 闭包内 + 顶层），name → 声明值（原样，先到先得）。
 * 注意：注入值必须原样取自 theme-vars（如 `@colorText: var(--colorTextBase)`），
 * 不能一律写成 `var(--name)`，否则非 fontSize 变量会被注入错误映射。
 */
function extractThemeVarDecls(themeVarsContent) {
  const map = new Map();
  for (const raw of String(themeVarsContent || '').split('\n')) {
    // 剥行尾 // 注释（2026-09-08 实锤：不剥会把注释吞进变量值 → LESS 解析失败）
    const line = raw.replace(/\/\/.*$/, '').trim();
    const m = line.match(/^@([\w-]+)\s*:\s*(.+?)\s*;?\s*$/);
    if (m && !map.has(m[1])) map.set(m[1], m[2]);
  }
  return map;
}

/** 提取 theme-vars.less 中各 mixin（.common()/.theme-dark()/.theme-light()）闭包内的变量声明表（先到先得） */
function extractMixinScopedVars(themeVars) {
  const map = new Map();
  let inMixin = false;
  let depth = 0;
  for (const line of themeVars.split('\n')) {
    const t = line.trim();
    if (!inMixin) {
      if (/^\.[\w-]+\s*\(\s*\)\s*\{/.test(t)) {
        inMixin = true;
        depth = 1;
      }
      continue;
    }
    depth += (t.match(/\{/g) || []).length - (t.match(/\}/g) || []).length;
    // 🛡️ 2026-09-08 实锤 mc-max-1788834678303-3fedc968：theme-vars 常见写法
    // `@fontSize: 14px; // 根容器通过 CSS 变量 --fontSize 驱动` —— 旧逻辑把行尾 `//` 注释
    // 一并捕获为变量值（`14px; // 根容器…`），自愈替换后生成
    // `calc(var(--fontSize, 14px; // 根容器…) * 0.857)`：行尾注释把右括号 `)` 吃掉 →
    // LESS「Could not parse call arguments or missing ')'」→ 两个子组件 SFC 写盘门禁失败
    // 被跳过 → COMP-001「模块组装缺失」BLOCK → 重试耗尽、任务 failed。
    // 治本：取值前先剥行尾 // 注释，再剥末尾分号。
    const declLine = t.replace(/\/\/.*$/, '').trim();
    const m = declLine.match(/^@([\w-]+)\s*:\s*(.+?)\s*;?\s*$/);
    if (m && !map.has(m[1])) map.set(m[1], m[2].replace(/;\s*$/, '').trim());
    if (depth <= 0) inMixin = false;
  }
  return map;
}

/**
 * 🎯 N2 图表兜底注入·治本版（2026-08-31，A+B 步）：
 * vision 识别到 charts 但产物无 echarts 时注入最小占位图表。
 *
 * 与旧内联版（microcode-engineer.js，已删）的三点差异（事故 mc-max-1788174922721-1034fb6d：
 * 旧版盲目注入 `import { ref, ... } from 'vue'` 与 LLM 已有 import 重复声明 →
 * validateVueSfc 失败 → 写盘门禁跳过 index.vue → L0-B EMPTY_ARTIFACT ×3 轮重试耗尽）：
 * 1. vue import 差集：只导入产物 script 缺失的标识符（script 已出现同名单词则复用），杜绝重复声明；
 * 2. 注入符号（chartRef/chart/getOption）冲突检测 + mc 前缀私有名，不与 LLM 已声明变量撞名；
 * 3. 模板注入：非法 CSS `margin:flex:1` → `flex:1`；位置从 `</template>` 前（base-panel 宿主外壳外）
 *    改为语义根容器内（优先填充空 root div）；class 前缀按根 class 派生，不再硬编码 env-monitor。
 *
 * 本函数保持纯字符串变换；注入器自检（validateVueSfc + 失败回滚）由调用方 microcode-engineer 持有。
 */
export function injectEchartsFallback(content, options = {}) {
  if (typeof content !== 'string' || !content.trim()) return content;
  if (content.includes('echarts.init(')) return content; // 已有 echarts，无需注入
  const chartType = String(options.chartType || 'line').toLowerCase();
  // 🎯 D 系列第一刀：优先使用视觉真值 legendItems，回退 chartSeries
  const legendItems = Array.isArray(options.legendItems) ? options.legendItems : [];
  const chartSeries = legendItems.length > 0
    ? legendItems.join(', ')
    : String(options.chartSeries || '趋势图');
  const isCartesian = CARTESIAN_SERIES_TYPES.has(chartType);

  const scriptM = content.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i);
  if (!scriptM) return content;
  const script = scriptM[1];
  const tplM = extractSfcTemplate(content);
  const tplBody = tplM || '';

  // ---- 符号冲突检测与私有名派生 ----
  const usedInScript = (name) => new RegExp(`\\b${escapeRe(name)}\\b`).test(script);
  const chartRefVar = usedInScript('chartRef') ? 'mcChartRef' : 'chartRef';
  const chartVar = usedInScript('chart') ? 'mcChartInstance' : 'chart';
  const optionVar = usedInScript('getOption') ? 'mcGetChartOption' : 'getOption';
  // 私有名仍冲突（几乎不可能）→ 放弃注入，宁可不注入也不破坏产物
  if (usedInScript(chartRefVar) || usedInScript(chartVar) || usedInScript(optionVar)) {
    return content;
  }

  // ---- import 差集：script 已出现该标识符单词则复用，缺的才导入 ----
  const importLines = [];
  if (!usedInScript('echarts')) {
    importLines.push(`import * as echarts from 'echarts'`);
  }
  const neededVue = ['ref', 'onMounted', 'onUnmounted', 'nextTick'].filter(
    (n) => !usedInScript(n),
  );
  if (neededVue.length > 0) {
    importLines.push(`import { ${neededVue.join(', ')} } from 'vue'`);
  }

  // ---- 模板注入：canvas div 注入到语义根容器内 ----
  const prefix = deriveTabClassPrefix(tplBody) || 'c-mc-chart';
  const canvasClass = `${prefix}-chart-canvas`;
  const minHeight = inferChartMinHeight(canvasClass, '', {
    chartType,
    chartRole: options.chartRole,
  });
  const canvasDiv = `<div ref="${chartRefVar}" class="${canvasClass}" style="width:100%;height:100%;flex:1;min-height:${minHeight}px;"></div>`;
  let patched = content;
  // 优先：空的语义根 div（LLM 只画了容器没画内容）→ 直接填充
  const emptyRootRe = /(<div\b[^>]*\bclass\s*=\s*["'][^"']*-root\b[^"']*["'][^>]*>)\s*(<\/div>)/;
  if (emptyRootRe.test(patched)) {
    patched = patched.replace(emptyRootRe, `$1\n      ${canvasDiv}\n    $2`);
  } else {
    // 次选：root 开标签后第一个子节点位置（与 tab 栏注入对称）
    const rootOpenRe = /(<div\b[^>]*\bclass\s*=\s*["'][^"']*-root\b[^"']*["'][^>]*>)/;
    if (rootOpenRe.test(patched)) {
      patched = patched.replace(rootOpenRe, `$1\n      ${canvasDiv}`);
    } else {
      // 回退：template 结束前（保持旧兜底位置）
      patched = patched.replace(/(<\/template>)/, `${canvasDiv}\n$1`);
    }
  }

  // ---- script 注入：`</script>` 前追加（条件 import + 冲突安全的符号名） ----
  // 🛡️ P0 修复（2026-09-02，mv-max-1788361436694-e145a6d3）：注入代码必须自带 resize 监听。
  // 旧模板只写 `echarts.init` + `setOption`，无 ResizeObserver / window.resize →
  // 违反自家 CODE-012（BLOCK：「echarts 实例创建后必须挂 resize 监听」）。后果是死循环：
  // N2 注入 → CODE-012 BLOCK → 回退 P1 部分修订 → N2 检测不到 echarts 又注入 → 重试耗尽 failed。
  // LLM 无法通过重试修掉「系统注入器自己违规」的问题，必须由注入器产出合规代码。
  const observerVar = usedInScript('chartObserver') ? 'mcChartObserver' : 'chartObserver';
  const resizeVar = usedInScript('handleMcChartResize')
    ? 'mcHandleChartResize'
    : 'handleMcChartResize';
  // 极端撞名（几乎不可能）→ 放弃注入，宁可不注入不破坏产物
  if (usedInScript(observerVar) || usedInScript(resizeVar)) return content;
  const scriptInject = [
    ...importLines,
    `const ${chartRefVar} = ref(null); let ${chartVar} = null; let ${observerVar} = null`,
    `const ${optionVar} = () => ({`,
    // 🎯 D 系列第一刀：非笛卡尔图（pie/donut/gauge/radar）跳过 xAxis/yAxis/grid
    ...(isCartesian ? [
      `  grid: { left: 40, right: 20, top: 20, bottom: 30, containLabel: true },`,
      `  xAxis: { type: 'category', data: ['2','4','6','8','10','12','14','16','18','20','22','24'] },`,
      `  yAxis: { type: 'value' },`,
    ] : []),
    `  series: [{ name: ${JSON.stringify(chartSeries)}, type: '${chartType}', data: [] }]`,
    `})`,
    `const ${resizeVar} = () => { ${chartVar}?.resize() }`,
    `onMounted(() => { nextTick(() => { if (!${chartRefVar}.value) return; ${chartVar} = echarts.init(${chartRefVar}.value); ${chartVar}.setOption(${optionVar}()); ` +
      `if (typeof ResizeObserver !== 'undefined') { ${observerVar} = new ResizeObserver(() => ${resizeVar}()); ${observerVar}.observe(${chartRefVar}.value) } ` +
      `window.addEventListener('resize', ${resizeVar}) }) })`,
    `onUnmounted(() => { window.removeEventListener('resize', ${resizeVar}); ${observerVar}?.disconnect(); ${chartVar}?.dispose(); ${chartVar} = null })`,
  ].join('\n');
  // 🛡️ P0 修复（2026-09-02，mv-max-1788359428498-ee0cbe69）：旧写法 `/(\n<\/script>)/` + 替换串首
  // 无 `\n` 前缀 → 当 script 块末尾是 `// #endregion`（无尾随空行）时，正则匹配吞掉了
  // `#endregion` 与 `</script>` 之间唯一的换行，注入的 `import * as echarts` 直接拼在注释行尾
  // → 整行变注释 → 运行时 `echarts is not defined`（RUNTIME-009）。SFC 语法自检不拦（注释合法）。
  // 修法：改匹配 `</script>` 本身，替换串前后都显式带 `\n`，任何情况下 import 都独占新行。
  patched = patched.replace(/(<\/script>)/, `\n${scriptInject}\n$1`);

  // ---- style min-height 兜底（inline style 已含，此 replace 命中概率低、无害保留） ----
  patched = patched.replace(
    new RegExp(`(\\.${escapeRe(canvasClass)}\\s*\\{)`),
    `$1\n  min-height: ${minHeight}px;\n  /* 🎯 N2 兜底：vision 识别图表但 LLM 未生成 echarts 时系统注入（主图160/紧凑图100） */`,
  );
  return patched;
}
/**
 * 🧩 SFC 内嵌 style 的 theme 变量引用自愈（E 步扩展，2026-08-31 晚间）：
 * healThemeMixinVarRefs 原本只接入独立 .less 分支；SFC 内嵌 style 同样会引用
 * mixin 闭包变量（实锤 HeaderTabs.vue:100 @fontSize / EnvironmentTabs.vue 同款
 * → SFC style 编译失败 → P1-4 隔离 → 「刷新后 tabs 消失只剩 chart」）。
 * 对每个 <style> 块内容跑 healThemeMixinVarRefs，块外内容不动。
 */
export function healThemeMixinVarRefsInVue(content, themeVarsContent) {
  if (typeof content !== 'string' || !content.includes('<style')) return content;
  if (typeof themeVarsContent !== 'string' || !themeVarsContent.includes('@')) {
    return content;
  }
  let changed = false;
  const out = content.replace(
    /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi,
    (full, open, css, close) => {
      const healed = healThemeMixinVarRefs(css, themeVarsContent);
      if (healed !== css) changed = true;
      return open + healed + close;
    },
  );
  return changed ? out : content;
}

/**
 * 🧩 less 插值引用资源变量自愈（2026-08-31 晚间）：
 * LLM 在 less 里写 `background-image: url('@{bg1}')`——@{bg1} 是 less 插值语法，
 * 但 bg1 是 JS 模块变量（import bg1 from '../resources/images/bg-7890.png'），
 * less 编译报 variable @bg1 is undefined → SFC style 编译失败 → P1-4 隔离。
 * （实锤 mc-max-1788176720155-9560d082 StatisticsRow.vue:35）
 *
 * 修法：从同任务产物全部 .vue/.js 文件的 `import X from '...png'` 提取
 * 变量→目标路径映射，把当前文件 style/less 里的 `@{X}` 改写为
 * 相对当前文件位置的静态资源路径（背景图因此真实可见）。
 *
 * @param {string} content - 当前文件内容（.vue 全文件或 .less）
 * @param {string} filePath - 当前文件相对组件根的路径（如 package/components/X.vue）
 * @param {Object} allFiles - 同任务产物文件 map（{ path: content }），提取 import 映射用
 * @returns {string} 修复后内容（无插值引用或无映射时返回原串）
 */
export function healLessResourceVarInterpolation(content, filePath, allFiles) {
  if (typeof content !== 'string' || !content.includes('@{')) return content;
  // 1) 提取 变量→组件内绝对路径 映射（从所有产物的 import 语句）
  const varToAbs = new Map();
  for (const [p, c] of Object.entries(allFiles || {})) {
    if (typeof c !== 'string' || !/\.(vue|js|ts)$/.test(p)) continue;
    for (const m of c.matchAll(
      /import\s+(\w+)\s+from\s+['"]([^'"]+\.(?:png|jpg|jpeg|svg|webp|gif))['"]/g,
    )) {
      if (!varToAbs.has(m[1])) {
        varToAbs.set(m[1], resolveComponentPath(dirnameOf(p), m[2]));
      }
    }
  }
  // 1b) 回退启发：产物没有任何 import 映射时（实锤 mc-max-1788176720155-9560d082：
  // bg1 未注入 import，但 resources/images/bg-7890.png 存在），按命名约定
  // bg1/bg2/...→ 按文件名排序的 bg-* 序列、icon1/icon2→icon-* 序列映射。
  if (varToAbs.size === 0) {
    const byPrefix = new Map(); // prefix -> sorted [absPath]
    for (const p of Object.keys(allFiles || {})) {
      const m = String(p).match(
        /resources\/images\/(bg|icon|img|image|pic|illustration)-[^/]+\.(?:png|jpg|jpeg|svg|webp|gif)$/i,
      );
      if (m) {
        const prefix = m[1].toLowerCase();
        if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
        byPrefix.get(prefix).push(p);
      }
    }
    for (const [prefix, list] of byPrefix) {
      list.sort();
      list.forEach((abs, i) => varToAbs.set(`${prefix}${i + 1}`, abs));
    }
  }
  if (varToAbs.size === 0) return content;

  // 2) 替换 @{var} 为相对当前文件的静态路径
  const fromDir = dirnameOf(filePath);
  let changed = false;
  const out = content.replace(/@\{(\w+)\}/g, (full, varName) => {
    const abs = varToAbs.get(varName);
    if (!abs) return full;
    changed = true;
    return relativePathOf(fromDir, abs);
  });
  return changed ? out : content;
}

/** 组件内路径工具：目录名 / 解析相对 import 为组件内绝对路径 / 计算相对路径 */
function dirnameOf(p) {
  const idx = String(p || '').lastIndexOf('/');
  return idx === -1 ? '' : p.slice(0, idx);
}
function resolveComponentPath(fromDir, rel) {
  const parts = [...fromDir.split('/').filter(Boolean), ...rel.split('/')];
  const out = [];
  for (const seg of parts) {
    if (seg === '.' || seg === '') continue;
    if (seg === '..') out.pop();
    else out.push(seg);
  }
  return out.join('/');
}
function relativePathOf(fromDir, absPath) {
  const from = fromDir.split('/').filter(Boolean);
  const to = absPath.split('/').filter(Boolean);
  let common = 0;
  while (common < from.length && common < to.length && from[common] === to[common]) {
    common++;
  }
  const ups = from.slice(common).map(() => '..');
  const downs = to.slice(common);
  const rel = [...ups, ...downs].join('/');
  return rel.startsWith('.') ? rel : './' + rel;
}

/** 框架主题预设名（与 theme-color-guard FRAMEWORK_PRESET_NAMES 同源，勿漂移） */
const THEME_PRESET_NAMES = [
  'fontSize',
  'fontWeightStrong',
  'colorTextBase',
  'colorPrimary',
  'colorPrimaryHover',
  'colorPrimaryActive',
  'colorPrimaryBg',
  'colorPrimaryBgHover',
];

/**
 * Less **编译期颜色函数**判定 —— 已抽到 `utils/less-color-funcs.js`（单一事实源，刀 15/16b）。
 * 本文件只保留消费方：`healPresetLiteralDecls` 用它豁免「被颜色函数引用的变量」的 var 化。
 * 为什么必须共用：`file-writer#safeLessVarValue` / `less-variable-checker` 是同一判据的
 * 另两个消费方；各自造一套名单必然在扩名单（如补 `spin`/`tint`）时产生分歧。
 */

/**
 * 🛡️ 预设字面量声明 → var 透传（2026-09-04，A2 治本）：
 * LLM 在 style/less 顶层写 `@colorPrimary: #409EFF;` / `@fontSize: 14px;`（本地字面量覆盖
 * 主题预设）→ 触发 THEME-PRESET-OVERRIDE BLOCK，且 3 轮重试难消（mc-max-1788505197306 实锤）。
 * 确定性改写为 var 透传：`@colorPrimary: var(--colorPrimary, #409EFF);` —— 原值降级为
 * fallback、主题变量优先，覆盖语义消除；theme-color-guard 对 var() 透传形态豁免，
 * 与 file-writer「补全缺失 less 变量」的 `@fontSize: var(--fontSize)` 产物同形态 →
 * 不再自愈→门禁死循环。
 * 保守：仅处理非 themes/ 目录的纯样式文本（.less 全文 / .vue 的 <style> 块）；
 * 值已是 var()、含 var(/注释/嵌套分号 → 不干预（避免破坏 mixin 闭包或复杂表达式）。
 *
 * 🛡️ 2026-09-13（与颜色 var() 透传回退同一治本线）：**被 Less 颜色函数引用的变量豁免**。
 * 根因（`mc-1789311919345-edeb2177` 实锤）：本函数把 `@colorPrimary: #409EFF;` 改写成
 * `var(--colorPrimary, #409EFF)` 后，同文件 `lighten(@colorPrimary, 30%)` 在编译期无法求值 →
 * `Argument cannot be evaluated to a color` → 整个 <style> 编译失败 → P1-4 隔离 → 子组件消失。
 * 注意它与 file-writer#safeLessVarValue / less-variable-checker 是**三条独立**的 var 注入路径：
 * 只回退前两处时，本函数会「接手」把 hex 再变回 var（值已是 var 才跳过 → 回退后反而开始改写）。
 *
 * @param {string} content 样式文本（less 全文或 style 块）
 * @param {string} [filePath] 文件相对路径（themes/ 目录豁免）
 * @returns {string}
 */
export function healPresetLiteralDecls(content, filePath = '') {
  if (typeof content !== 'string' || !content.includes('@')) return content;
  if (/\/themes\//.test(filePath)) return content; // 槽位文件唯一允许字面量处，不干预
  const re = new RegExp(
    `(@(?:${THEME_PRESET_NAMES.join('|')}))\\s*:\\s*([^;}]+?)\\s*;`,
    'g',
  );
  let changed = false;
  const out = content.replace(re, (full, decl, rawValue) => {
    const v = String(rawValue || '').trim();
    if (
      !v ||
      /^var\(/i.test(v) ||          // 已透传形态（file-writer 自愈产物）→ 保持
      /var\(/i.test(v) ||           // 值内嵌 var → 复杂表达式不干预
      v.includes('//') || v.includes('/*') || v.includes('*/') || // 含注释 → 保守跳过
      isUsedByLessColorFn(content, decl.slice(1)) // 🛡️ 被 lighten()/darken()/fade() 等引用 → var() 编译期不可求值，保留真颜色
    ) {
      return full;
    }
    const name = decl.slice(1); // 去 @ 前缀
    changed = true;
    return `${decl}: var(--${name}, ${v});`;
  });
  return changed ? out : content;
}

/**
 * 🛡️ 槽位 hex 字面量 → var 引用（2026-09-04，B 治本）：
 * THEME-SLOT-COLOR：颜色属性值直接写死 theme-vars.less 槽位 hex（如 `color: #ffffff`，
 * #ffffff 是 @color-tab-active-text 槽值）→ 该元素不响应主题/调色。确定性改写为
 * `var(--<cssVar>, #hex)`（原 hex 保留作 fallback）。
 * 映射：theme-vars.less 的 `@kebab-name: #hex;` → cssVar `--camelName`
 * （@color-text-base → --colorTextBase，与 declare/cssVars 契约一致）。
 * 保守规则：① 仅「颜色属性值 = 单 hex [+!important]」的纯字面量（gradient/rgba/url 内不碰）；
 * ② hex 必须唯一对应一个槽变量（同 hex 多变量 → 歧义跳过，残留交给 guard 阈值降级兜底）；
 * ③ 已是 var() 或值非纯 hex 不动。
 *
 * @param {string} content 样式文本（less 全文或 style 块）
 * @param {string} themeVarsContent theme-vars.less 原文（提取 hex→cssVar 映射）
 * @returns {string}
 */
export function healSlotHexToVarRefs(content, themeVarsContent) {
  // ⚠️ 函数名为历史名。🛡️ 2026-09-26 治本 0.2：输出由 `var(--cssVar, <原值>)` 改为
  //   **LESS 槽位引用 `@<slot>`**（模式 B：编译期差异化）。原 var() 形态有三宗罪：
  //   ① 与 THEME-VAR-NAME-MISMATCH（业务样式禁 var() 直引）直接冲突；
  //   ② 平台并不注入这些名字 → var() 的 fallback（多为写死字面量）恒生效、**切主题零响应**；
  //   ③ var() 是运行期值，`lighten()/darken()/fade()` 编译期不可求值。
  //   `@slot` 三点全解（编译期可求值 + 深浅由 theme mixin 决定）。
  //   安全前提已核：theme-vars 的 `.theme-light()` 与 `.theme-dark()` 键集对称（实测 3 个产物均对称）。
  if (typeof content !== 'string') return content;
  if (typeof themeVarsContent !== 'string') return content;
  // （治本 D 2026-09-13 能力保留：hex 与 rgb/rgba 双支持，统一归一化键。）
  const hasColor = /#|rgba?\(/.test(content);
  const tvHasColor = /#|rgba?\(/.test(themeVarsContent);
  if (!hasColor || !tvHasColor) return content;

  // 1) 颜色字面量 → LESS 槽位名（同值多槽位 → 兜底取第一个）
  const colorToSlot = new Map(); // 归一化颜色值 -> @slot
  for (const m of themeVarsContent.matchAll(
    /@([a-z][a-z0-9-]*)\s*:\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))\s*;/gi,
  )) {
    const slot = '@' + m[1];
    const color = normalizeColorToken(m[2]);
    if (!colorToSlot.has(color)) colorToSlot.set(color, slot);
  }
  if (colorToSlot.size === 0) return content;

  // 2) 颜色属性 = 纯颜色字面量（hex 或 rgb/rgba）→ @slot
  //    仅匹配「颜色呈现属性」的直接字面量值，不碰 linear-gradient/text-shadow 等函数。
  let changed = false;
  const out = content.replace(
    /(^|[\s;{])(color|background(?:-color)?|border-(?:top|right|bottom|left)-color|outline(?:-color)?|caret-color|accent-color)\s*:\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))(\s*!important)?\s*;/gm,
    (full, pre, prop, colorVal, imp) => {
      const slot = colorToSlot.get(normalizeColorToken(colorVal));
      if (!slot) return full;
      changed = true;
      return `${pre}${prop}: ${slot}${imp || ''};`;
    },
  );
  return changed ? out : content;
}

/** 归一化颜色字面量：去空白 + 小写（hex 与 rgba 统一键，避免空格差异导致映射 miss） */
function normalizeColorToken(v) {
  return String(v).replace(/\s+/g, '').toLowerCase();
}

/**
 * 🛡️ 治本 F（2026-09-13）：CSS 变量名 kebab→camel 归一。
 * 根因：LLM 常写 \`var(--color-text-base)\` / \`var(--color-primary)\` 等 kebab-case 变量名，
 * 但宿主通过 css-vars.js + Vue :style 注入的是 **camelCase**（\`--colorTextBase\`/\`--colorPrimary\`）。
 * CSS 变量名大小写敏感 → kebab 引用永不生效（fallback 兜底、主题不响应，c-vehicle-monitor 5 处实锤）。
 * 仅归一 \`--color-*\` 系列（css-vars.js 的 key 均为 camelCase）；camelCase 形态（无连字符）原样保留。
 * @param {string} content 样式文本
 * @returns {string}
 */
export function healVarNameCase(content) {
  if (typeof content !== 'string' || !content.includes('var(--')) return content;
  let changed = false;
  const out = content.replace(
    // 🛡️ 2026-09-29 正则修正（mc-max-1790663205915 系列 / c-traffic-monitor-58ac1084 实锤）：
    //   原 `/var\((--color-[a-z0-9]*-[a-z0-9-]*)/g` 要求 `--color-` 之后**至少两个**连字符段，
    //   于是**单段名全部漏过**——恰是最高频的 `--color-primary` / `--color-success` /
    //   `--color-error` / `--color-warning` / `--color-border`；只有 `--color-text-base`
    //   这类多段名被归一。真机实测：产物里 `color: var(--color-primary, #1990ff)` 原样留下，
    //   而 css-vars.js 注入的是 `--colorPrimary` ⇒ 变量永不命中、恒定回落字面量、主题切换失效
    //   （用户报「header-tab 颜色样式错误」的直接成因之一）。
    //   改为 `[a-z0-9-]+` 单段通吃；`-([a-z0-9])` → 大写 的转换逻辑本身已能正确处理单段
    //   （`color-primary` → `colorPrimary`），无需改动。
    //   误伤面评估：契约规定业务样式**不得**自定义 `--color-*`（css-vars.js 的 key 全为
    //   camelCase，全仓 `--fontSize` 静态定义为 0 处），故 kebab 引用按定义即错误写法，
    //   归一方向唯一正确；本地定义 `--color-x:` 不受影响（本函数只改 `var(...)` 引用侧）。
    /var\((--color-[a-z0-9-]+)/g,
    (full, varName) => {
      // varName 形如 --color-text-base；去掉前导 --，kebab→camel，再补回 --
      const camel =
        '--' +
        varName.slice(2).replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
      if (camel === varName) return full;
      changed = true;
      return `var(${camel}`;
    },
  );
  return changed ? out : content;
}

/**
 * 🛡️ 刀 18（2026-09-14）：Vue **绑定表达式里对象字面量的键**必须可解析 —— 含连字符的裸键要加引号。
 *
 * 事故（mc-1789317647118-7ba35f11）：刀 12「类名对齐」把模板里的
 * `:class="{ active: activeTab === 'tunnel' }"` 的**对象键** `active` 也当类名改写为
 * `c-device-monitor-switch-item--active`：
 *   `:class="{ c-device-monitor-switch-item--active: ... }"`
 * `c-device-monitor-switch-item--active` 带连字符、又没加引号 → **不是合法 JS 标识符** →
 * Babel 报 `Error parsing JavaScript expression: Unexpected token, expected ","` →
 * SFC 顶层解析失败 → **P1-4 把整个 SwitchSection 剔除** → 那一块 UI 凭空消失。
 *
 * 与刀 13/15 同源的「管线自伤」：**改写器不区分「类名字符串」与「JS 对象键」两种语境**。
 * 与其让每个改写器各自记住「这里要加引号」，不如在**写盘/校验前收口**：
 * 任何出现在绑定表达式对象字面量里、且不是合法标识符的裸键，一律补引号
 * （补引号对「本就非法的裸键」永远正确，不会误改合法代码）。
 * 顺带也兜住 LLM 直接写 `:class="{ is-active: x }"` 的情况。
 *
 * 保守边界：
 *   - 只处理 `<template>` 段（script 里的对象字面量本就由 Babel 校验，不越界）；
 *   - 只处理**单层**对象字面量（`[^{}]*`），不碰嵌套（嵌套里若真有非法裸键，
 *     说明外层已被 Babel 拦下，交给既有门禁处理，不在此越界改写）；
 *   - 只给「含 `-`」的裸键加引号（合法标识符一律不动，已带引号的更不会重复加）；
 *   - 属性值用 `[^"]*` 整体取出后**在值内部**找对象字面量 —— 因此也覆盖数组形式
 *     `:class="['c-x-item', { active: x }]"`、以及 `@click="fn({ a-b: 1 })"` 这类写法。
 *
 * @param {string} vueContent 完整 Vue SFC 内容
 * @returns {string}
 */
export function healUnquotedObjectKeysInVue(vueContent) {
  if (typeof vueContent !== 'string' || !vueContent.includes('<template')) {
    return vueContent;
  }
  let changed = false;
  const out = vueContent.replace(
    /(<template\b[^>]*>)([\s\S]*?)(<\/template>)/gi,
    (full, open, tpl, close) => {
      const healed = tpl.replace(
        // 绑定/事件属性（:class / :style / v-bind:xxx / @click / v-on:xxx）+ 双引号表达式
        /((?::|v-bind:|@|v-on:)[a-zA-Z][\w:.-]*\s*=\s*")([^"]*)(")/g,
        (attrFull, attrHead, expr, quote) => {
          // ⚠️ 不能要求「属性值整体就是一个 {…}」——LLM 常见
          // `:class="['c-x-item', { active: x }]"`（数组里嵌对象），那样会整个漏掉。
          const newExpr = expr.replace(/\{([^{}]*)\}/g, (objFull, body) => {
            // ⚠️ `body` 是**花括号之间**的内容（不含外层 `{`/`}`），所以第一个键前面
            // 既没有 `{` 也没有 `,` —— 必须用 `(^|[{,])` 才能命中首键（写第一版时漏了 `^`）。
            const newBody = body.replace(
              /(^|[{,])(\s*)([A-Za-z_$][\w$-]*)(\s*):/g,
              (kvFull, lead, ws1, key, ws2) =>
                // 只补「含连字符、且未加引号」的裸键（其余原样返回）
                key.includes('-') ? `${lead}${ws1}'${key}'${ws2}:` : kvFull,
            );
            return newBody === body ? objFull : `{${newBody}}`;
          });
          if (newExpr === expr) return attrFull;
          changed = true;
          return `${attrHead}${newExpr}${quote}`;
        },
      );
      return `${open}${healed}${close}`;
    },
  );
  return changed ? out : vueContent;
}

/**
 * 🛡️ 刀 19（2026-09-14）：**数据对象键**被写成类名 → 模板取值恒为 undefined → 文字/数字凭空消失。
 *
 * 事故（mc-1789318926146-56c7b341 / mc-1789317647118-7ba35f11）：LLM 在重试轮把
 *   `const switchItems = ref([{ value: 'tunnel', total: '56302', error: '5' }])`
 * 写成
 *   `const switchItems = ref([{ value: 'tunnel', total: '56302', 'c-device-monitor-error': '5' }])`
 * 而模板是 `{{ item.error }}` → **取到 undefined → 「异常数」永远空白**。
 * 上一轮同样形态：`{ 'c-device-monitor-label': '实时监控' }` 配 `{{ tab.label }}` → Tab 文字全空。
 *
 * ⚠️ 为什么所有门禁都放过它：
 *   - 语法**完全合法**（带引号的键）—— 不像刀 18 那样会触发 Babel 报错；
 *   - 类名**真实存在**（`.c-device-monitor-error` 就在 common.less 里）—— 契约层也不会报；
 *   - DOM 存在、CSS 命中 —— 只有**渲染出来的值是空的**，纯代码门禁结构上无从判断。
 *
 * 已排除的嫌疑：离线重放 `normalizeClassNameDialect`（刀 12）**复现不出**（changes=[]，
 * 它只处理 template/style 段，不动 script）→ 污染源是 **LLM 自身输出**，非管线改写器。
 * 因此这里做**确定性后处理**：拿「模板真正访问过的 `.prop`」当事实源，
 * 把类名化的数据键还原成模板要的那个名字。
 *
 * 保守边界（宁可不改，不可错改）：
 *   - 只改 `<script>` 段（template 里的类名是另一个语境，由刀 18 管引号）；
 *   - 只改**带引号的对象键**、且键以 `c-` 开头（组件类名前缀）；
 *   - 只在其某个「后缀」（按 `-` 切分的最短优先）命中模板访问过的 prop 时才改；
 *   - 该裸 prop 若**已经作为键存在**，则跳过（避免产出重复键）；
 *   - 幂等（改完的键不再以 `c-` 开头）。
 *
 * @param {string} vueContent 完整 Vue SFC 内容
 * @returns {string}
 */
export function healClassPrefixedDataKeys(vueContent) {
  if (typeof vueContent !== 'string' || !vueContent.includes('<template')) {
    return vueContent;
  }
  // 事实源：模板里真正被访问过的属性名（`item.error` / `tab.label` / `card.title` …）
  const usedProps = new Set();
  const tplMatch = vueContent.match(/<template\b[^>]*>([\s\S]*?)<\/template>/i);
  if (!tplMatch) return vueContent;
  for (const m of tplMatch[1].matchAll(/\.([A-Za-z_$][\w$]*)/g)) usedProps.add(m[1]);
  if (usedProps.size === 0) return vueContent;

  let changed = false;
  const out = vueContent.replace(
    /<script[^>]*>([\s\S]*?)<\/script>/gi,
    (whole, body) => {
      const newBody = body.replace(
        /(['"])(c-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)+)\1(\s*):/g,
        (full, quote, key, ws) => {
          const parts = key.split('-');
          // 最短后缀优先：`c-device-monitor-error` → 先试 `error`，再 `monitor-error`…
          for (let i = parts.length - 1; i >= 1; i -= 1) {
            const cand = parts.slice(i).join('-');
            if (!usedProps.has(cand)) continue;
            // 已存在同名裸键 → 不改（否则对象里出现两个键，语义更乱）
            const hasBare = new RegExp(`(?:^|[{,])\\s*${cand}\\s*:`, 'm').test(body);
            if (hasBare) return full;
            changed = true;
            return `${quote}${cand}${quote}${ws}:`;
          }
          return full;
        },
      );
      if (newBody === body) return whole;
      const at = whole.indexOf(body);
      if (at < 0) return whole;
      return whole.slice(0, at) + newBody + whole.slice(at + body.length);
    },
  );
  return changed ? out : vueContent;
}

/**
 * 🛡️ 对 .vue 全部 <style> 块应用纯样式 heal（2026-09-04）：
 * template/script 段不参与（防 script 内 echarts 系列色 / template class 误替换）。
 * @param {string} vueContent .vue 全文件
 * @param {(css:string)=>string} healFn 纯样式文本变换
 * @returns {string}
 */
export function applyHealToVueStyleBlocks(vueContent, healFn) {
  if (typeof vueContent !== 'string' || !vueContent.includes('<style')) return vueContent;
  if (typeof healFn !== 'function') return vueContent;
  let changed = false;
  const out = vueContent.replace(
    /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi,
    (full, open, css, close) => {
      const healed = healFn(css);
      if (healed !== css) changed = true;
      return open + healed + close;
    },
  );
  return changed ? out : vueContent;
}

/**
 * 🛡️ 治本 E（2026-09-10）：v-if 与 v-for 同元素 fail-closed 自愈。
 *
 * Vue3 铁律：v-if 与 v-for 不得写在同一元素上（v-if 优先级更高，求值阶段访问不到
 * 循环变量 → 运行时 `Cannot read properties of undefined (reading 'xxx')`）。
 * env 样本 `SubT.vue:8` 即 `<div v-if="activeTab===tab.value" v-for="tab in tabList">` 命中。
 *
 * 本函数把「同元素共存」改写为 Vue3 合法结构：
 *   - v-for 在外层 `<template v-for="x in list" :key>` ，v-if 在内层元素；
 *     （template 上 v-if 不被 Vue3 支持，故 v-if 必须落在内层真实元素）
 *   - 或当无 v-if 仅 v-for 时原样保留。
 * 仅处理 template 段，不影响 script/style。fail-closed：解析异常或无法安全改写时返回原内容。
 *
 * @param {string} vueContent .vue 全文件
 * @returns {string}
 */
export function stripVIfOnVFor(vueContent) {
  if (typeof vueContent !== 'string') return vueContent;
  const tplMatch = vueContent.match(/<template[^>]*>([\s\S]*?)<\/template>/);
  if (!tplMatch) return vueContent;
  const tplBody = tplMatch[1];

  // 仅改写「开标签本身」的属性，不触碰 DOM 结构与子节点：
  // 把 `v-if="cond"` 折叠进 `v-for="x in list"` 的数据源 → `v-for="x in list.filter(...)"`。
  // 这是最小侵入、绝不破坏 DOM 树的改写（Vue3 官方推荐做法之一）。
  const tagRe = /<([a-zA-Z][\w-]*)\b([^>]*?)\/?>/g;
  let changed = false;
  const newBody = tplBody.replace(tagRe, (full, tag, attrs) => {
    const hasVIf = /\bv-if\s*=/.test(attrs);
    const hasVFor = /\bv-for\s*=/.test(attrs);
    if (!hasVIf || !hasVFor) return full;
    if (tag === 'template') return full; // template 上不共存，极少；交门禁拦

    const vForM = attrs.match(/\bv-for\s*=\s*(?:"([^"]*)"|'([^']*)')/);
    const vIfM = attrs.match(/\bv-if\s*=\s*(?:"([^"]*)"|'([^']*)')/);
    if (!vForM || !vIfM) return full;
    const vForExpr = (vForM[1] ?? vForM[2] ?? '').trim();
    const vIfExpr = (vIfM[1] ?? vIfM[2] ?? '').trim();

    // 拆出「循环变量」与「数据源表达式」： "x in list" / "(x, i) in list"
    const inIdx = vForExpr.search(/\bin\b/);
    if (inIdx < 0) return full;
    const left = vForExpr.slice(0, inIdx).trim();
    const source = vForExpr.slice(inIdx + 2).trim();
    const loopVarM = left.match(/[([]?\s*([\w$]+)/);
    const loopVar = loopVarM ? loopVarM[1] : null;
    if (!loopVar || !source) return full;

    // 把 v-if 条件里的循环变量替换为过滤参数（保持语义等价）
    const param = loopVar;
    const filterSource = `${source}.filter((${param}) => ${vIfExpr})`;
    const newVFor = `${left} in ${filterSource}`;

    // 用新 v-for 替换原 v-for，并移除 v-if（同元素不再共存）
    let newAttrs = attrs
      .replace(/\bv-for\s*=\s*(?:"[^"]*"|'[^']*')/, `v-for="${newVFor}"`)
      .replace(/\s*\bv-if\s*=\s*(?:"[^"]*"|'[^']*')/, '');
    changed = true;
    return `<${tag}${newAttrs}>`;
  });

  if (!changed) return vueContent;
  return vueContent.replace(tplBody, newBody);
}

/**
 * 🛡️ LESS 颜色函数参数含 `var()` → 编译期必失败（2026-09-26 普查实锤）
 *
 * 普查（全日志 67 条「写盘门禁失败（已跳过）」）：**37 条（55%）** 是这一形态，
 * 集中在 HeaderSection(20) / TabsSection(17) / ContentActive(7)。典型真机样本
 * （`c-vehicle-monitor-9fa51529/.../HeaderSection.vue`，已用 less@4.9 真编译复现）：
 *   `border-color: fade(var(--colorTextSecondary, #A3B5C9), 80%);`
 *   → `Error evaluating function 'fade': Argument cannot be evaluated to a color`
 *
 * 根因：`fade/lighten/darken/tint/shade…` 是 **LESS 编译期函数**，参数必须编译期可求值颜色；
 *   而 `var(--x, …)` 是**运行期** CSS 变量 → LESS 无法求值 → 硬报错 → 写盘门禁 retry 仍失败
 *   → **跳过该文件**（比坏文件隔离更隐蔽：不留 `degradedFiles` 痕迹，磁盘保留旧版/不落盘）。
 *   本质是「模式 A（运行期 var）与模式 B（编译期 @槽位）双轨混用」，而业务 LESS 只应写
 *   `@slot`（见 `prompts/engineer/shared/style-theme-rules.md` §3）。
 *
 * 治本（确定性改写为**编译期可求值**的等价形式）：
 *   ① slot 名 camel→kebab 后形如核心槽位（`color-`/`font-`/`radius-`/`spacing-` 前缀）
 *      → 换成 `@kebab`（保留主题适配，与 §3 同向）；
 *   ② 否则若有 fallback 字面量 → 直接用 fallback（保住编译，牺牲该处运行期主题）；
 *   ③ 都没有 → 原样保留（fail-open，交给门禁/重生成）。
 *
 * 纯函数、幂等；只在**颜色函数内部**动 `var()`，不碰其它 `var()` 用法。
 *
 * @param {string} source LESS 源（或 Vue 全文——只会在 `<style>` 内命中颜色函数的写法上生效）
 * @returns {{source: string, changes: Array<{from:string,to:string}>}}
 */
export function healLessColorFnVarArgs(source = '') {
  const src = typeof source === 'string' ? source : '';
  if (!src) return { source: src, changes: [] };
  const FN = 'fade|fadein|fadeout|lighten|darken|saturate|desaturate|tint|shade|spin|greyscale|contrast|mix';
  const re = new RegExp(
    `\\b(${FN})\\(\\s*var\\(\\s*--([A-Za-z0-9_-]+)\\s*(?:,\\s*([^()]*?)\\s*)?\\)`,
    'g',
  );
  const toKebab = (s) => String(s).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  const changes = [];
  const out = src.replace(re, (m, fn, name, fallback) => {
    const kebab = toKebab(name);
    if (/^(color|font|radius|spacing)-/.test(kebab)) {
      changes.push({ from: m, to: `${fn}(@${kebab}` });
      return `${fn}(@${kebab}`;
    }
    const fb = typeof fallback === 'string' ? fallback.trim() : '';
    if (fb) {
      changes.push({ from: m, to: `${fn}(${fb}` });
      return `${fn}(${fb}`;
    }
    return m; // fail-open：无可替换值 → 不动
  });
  if (changes.length === 0) return { source: src, changes: [] };
  return { source: out, changes };
}

/**
 * 🛡️ G11a（2026-11-04 · a41a470f/a87c2ba5 实锤）：下载失败 bg 的 **CSS fallback 确定性消费**。
 *
 * ## 病灶
 * `resource-dom-mapping` 对 Figma 渐变/纯色 fill 节点判定 `downloadStatus:'missing'`
 * （本就不是位图），并把真值写在 `visualMeta.fillsSummary`（如
 * `linear-gradient(180deg,#d4e3ffe5 0%,…)` / `#123259f2`）与 fallbackHint
 * 「请使用 CSS 替代」——但该链**只写到 mapping 文件即终止**：LLM 不执行规范、
 * 刀53 接管不读 mapping ⇒ 产物整卡背景透明，bgVar/bgSize 四件套连锁 null。
 *
 * ## 判据（确定性，零语义猜测）
 *   ① `downloadStatus === 'missing'`（**仅**此态；success 的图必须用图，不冲突）；
 *   ② `visualMeta.fillsSummary` 非空（Figma 真值，CSS 形态可直用）；
 *   ③ `targetDomSelector` 恰为 `[data-section-id="X"]` 形态（class 选择器是虚构挂载点，跳过）；
 *   ④ 产物中该标签**尚无** background/background-color/background-image 声明（已有真值不覆盖）。
 *
 * ## 注入形态
 * 向该 section 容器标签的 `style` 头部追加 `background:<fillsSummary>;`。
 * 渐变/纯色天然铺满容器 ⇒ **不写 background-size/position**（写死 px 违反自适应量纲）。
 *
 * @param {string} content 单个 .vue 文件内容
 * @param {Array} resourceMapping resource-dom-mapping 条目数组
 * @param {object} [options] 预留
 * @returns {{content: string, changed: boolean, injected: number, skipped: number}}
 */
export function injectMissingBgFallback(content, resourceMapping, options = {}) {
  if (typeof content !== 'string' || content.length === 0 || !Array.isArray(resourceMapping)) {
    return { content, changed: false, injected: 0, skipped: 0 };
  }
  let out = content;
  let injected = 0;
  let skipped = 0;
  for (const m of resourceMapping) {
    if (!m || m.downloadStatus !== 'missing') continue;
    const fills = String(m?.visualMeta?.fillsSummary || '').trim();
    if (!fills || /[;{}]/.test(fills) || fills.length > 300) { skipped += 1; continue; }
    const sel = String(m?.targetDomSelector || '');
    const idMatch = sel.match(/^\[data-section-id="([^"]+)"\]$/);
    if (!idMatch) { skipped += 1; continue; }
    const esc = idMatch[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const tagRe = new RegExp(`<([a-zA-Z][^<>]*data-section-id="${esc}"[^<>]*)>`);
    const hit = out.match(tagRe);
    if (!hit) { skipped += 1; continue; }
    const tag = hit[0];
    if (/(?:^|\s)(?:background|background-color|background-image)\s*:/.test(tag)) { skipped += 1; continue; }
    let newTag;
    if (/style="/.test(tag)) {
      newTag = tag.replace(/style="/, `style="background:${fills};`);
    } else {
      newTag = tag.replace(/>$/, ` style="background:${fills};">`);
    }
    if (newTag !== tag && out.includes(tag)) {
      out = out.replace(tag, newTag);
      injected += 1;
    } else {
      skipped += 1;
    }
  }
  return { content: out, changed: injected > 0, injected, skipped };
}

/**
 * 🛡️ G12a（2026-11-04 · mc-max-1793783001034-74672f68 实锤）：**父级死代码图表实现确定性剥离**。
 *
 * ## 病灶
 * 分块生成时 index chunk 先于子组件 chunk，LLM 拿到图表信号（vision charts[]）但无法预判
 * 「图表将由子组件承载」⇒ 在父级 index.vue 写了完整图表实现（import echarts / chartRef /
 * initChart / updateChart / watch(chartRef) / resize 监听），而 template 无 ref 挂载点
 * （图表实际由子组件承载）⇒ `echarts.init(chartRef.value)` 恒 null 崩溃，被
 * DO-NOT-INVENT-CHART-MOUNT-MISSING 拦停，任务失败且无 heal。
 *
 * ## 判据（与门禁 detectEchartsMountPointMissing 同源，确定性、零语义猜测）
 *   ① script 有 `echarts.init(X)`（X=简单标识符）；
 *   ② template 无静态 `ref="X"`；
 *   ③ template 无动态 `:ref=` / `v-bind:ref`（动态绑定不可静态判定 ⇒ fail-open 不动）；
 *   ④ template 提取失败 ⇒ fail-open。
 *
 * ## 剥离范围（行级+块级，平衡大括号扫描）
 *   - `import * as echarts ...` 行
 *   - `const <X> = ref(null)` 声明行
 *   - `let chart = null` / `let chartObserver = null` 声明行（死图表变量）
 *   - 顶层声明块（`const NAME = ... => {` / `function NAME(...) {`）**体内引用死信号**
 *     （echarts.init( / chartObserver / chart.setOption( / chart.resize(）⇒ 整块删
 *   - `watch(<X>, ...)` 块 ⇒ 整块删
 *   - 被删函数的无参调用行（`initChart()` 等）+ `window.addEventListener/removeEventListener('resize', <deletedFn>)` 行
 *
 * 不动活代码：不含死信号的块/行逐字保留（tab 切换等业务逻辑零接触）。
 *
 * @param {string} content 单个 .vue 文件内容
 * @param {object} [options] 预留
 * @returns {{content: string, changed: boolean, removed: string[]}}
 */
export function stripDeadChartImpl(content, options = {}) {
  if (typeof content !== 'string' || !/echarts\.init\(/.test(content)) {
    return { content, changed: false, removed: [] };
  }
  const tplMatch = content.match(/<template>([\s\S]*?)<\/template>/);
  const template = tplMatch ? tplMatch[1] : '';
  if (!template) return { content, changed: false, removed: [] };
  // ③ 动态 ref ⇒ fail-open（图可能经动态挂载渲染，删除会误伤）
  if (/[:@]ref\s*=|v-bind:ref/.test(template)) {
    return { content, changed: false, removed: [], skipped: 'dynamicRef' };
  }
  // 提取 init ref 名（与门禁同正则口径）
  const refNames = new Set();
  const initRe = /echarts\.init\(\s*([A-Za-z_$][\w$]*)(?:\.value)?\s*\)/g;
  let m;
  while ((m = initRe.exec(content)) !== null) refNames.add(m[1]);
  if (refNames.size === 0) return { content, changed: false, removed: [] };
  const deadRefs = [...refNames].filter(
    (r) => !new RegExp(`ref\\s*=\\s*["']${r}["']`).test(template),
  );
  if (deadRefs.length === 0) return { content, changed: false, removed: [] };

  const DEAD_SIGNAL = /echarts\.init\(|chartObserver|chart\.setOption\(|chart\.resize\(/;
  const lines = content.split('\n');
  const removed = [];
  const out = [];
  const deletedFnNames = new Set();
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    // ── 行删：import echarts ──
    if (/^import\s+\*\s+as\s+echarts\s+from\s+['"]echarts/.test(t)) {
      removed.push(`import:${t.slice(0, 40)}`);
      i += 1;
      continue;
    }
    // ── 行删：死 ref 声明 ──
    if (
      deadRefs.some((r) =>
        new RegExp(`^(?:const|let)\\s+${r}\\s*=\\s*ref\\s*\\(`).test(t),
      )
    ) {
      removed.push(`decl:${t.slice(0, 40)}`);
      i += 1;
      continue;
    }
    // ── 行删：死图表变量声明 ──
    if (/^(?:let|const)\s+chart\s*(?:=\s*null)?\s*;?\s*$/.test(t) ||
        /^let\s+chartObserver\s*(?:=\s*null)?\s*;?\s*$/.test(t)) {
      removed.push(`decl:${t.slice(0, 40)}`);
      i += 1;
      continue;
    }
    // ── 块删：watch(<deadRef>, ...) ──
    const watchHit = deadRefs.find((r) =>
      new RegExp(`^watch\\s*\\(\\s*${r}\\b`).test(t),
    );
    if (watchHit && /\{\s*$/.test(t)) {
      const end = scanBlockEnd(lines, i);
      removed.push(`watch(${watchHit}) @${i + 1}`);
      i = end;
      continue;
    }
    // ── 块删：顶层声明块且体内含死信号 ──
    const fnDecl = t.match(
      /^(?:const|let|function)\s+([A-Za-z_$][\w$]*)\s*(?:=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{|=\s*(?:async\s*)?[A-Za-z_$][\w$]*\s*=>\s*\{|\([^)]*\)\s*\{)/,
    );
    if (fnDecl && /\{\s*$/.test(t)) {
      const end = scanBlockEnd(lines, i);
      const body = lines.slice(i, end).join('\n');
      if (DEAD_SIGNAL.test(body)) {
        deletedFnNames.add(fnDecl[1]);
        removed.push(`fn:${fnDecl[1]} @${i + 1}(${end - i}行)`);
        i = end;
        continue;
      }
    }
    out.push(line);
    i += 1;
  }
  // ── Pass 2：被删函数的调用点/监听行/死变量残留语句 ──
  if (deletedFnNames.size > 0) {
    const names = [...deletedFnNames].map((n) => n.replace(/\$/g, '\\$&'));
    const callRe = new RegExp(`^(?:${names.join('|')})\\s*\\(\\s*\\)\\s*;?\\s*$`);
    const lstRe = new RegExp(
      `window\\.(?:add|remove)EventListener\\(\\s*['"]resize['"]\\s*,\\s*(?:${names.join('|')})\\s*\\)`,
    );
    // 死变量残留语句（onUnmounted 清理块 / watch 回调内）：
    // `chart?.dispose()` / `chart = null` / `chartObserver?.disconnect()` / `if (chart) updateChart()` 等
    // 判据：行引用死变量（chart/chartObserver——其声明已被行删）或死函数名，且该行不是声明/定义形态。
    const deadVarRef = new RegExp(
      `\\b(?:chart|chartObserver|${names.join('|')})\\b`,
    );
    const final = [];
    for (const line of out) {
      const t2 = line.trim();
      const tDecl = /^(?:const|let|function|import|export)\b|=>\s*\{/.test(t2);
      const dead =
        callRe.test(t2) ||
        lstRe.test(t2) ||
        (deadVarRef.test(t2) && !tDecl && !/watch\s*\(/.test(t2));
      if (dead) {
        removed.push(`call:${t2.slice(0, 40)}`);
        continue;
      }
      final.push(line);
    }
    return { content: final.join('\n'), changed: true, removed };
  }
  return removed.length > 0
    ? { content: out.join('\n'), changed: true, removed }
    : { content, changed: false, removed: [] };
}

/** 大括号平衡扫描：返回块结束行的**下一行**下标（起点行含开括号）。 */
function scanBlockEnd(lines, start) {
  let depth = 0;
  let started = false;
  for (let j = start; j < lines.length; j++) {
    for (const ch of lines[j]) {
      if (ch === '{') { depth += 1; started = true; }
      else if (ch === '}') depth -= 1;
      else if (ch === '"' || ch === "'" || ch === '`') {
        // 粗略跳过字符串字面量内的大括号（本仓生成代码 option 字符串极少跨行模板串，
        // 保守策略：不跳过——门禁侧 2.5/3.5 同为正则级判据，此处平衡扫描已够用）
      }
    }
    if (started && depth <= 0) return j + 1;
  }
  return lines.length;
}

/** [G13] 图表容器重建自愈注入的幂等标记。 */
const CHART_REBUILD_GUARD_MARK = 'G13-chart-rebuild-guard';

/** 正则元字符转义（本地副本，避免依赖其它模块导出）。 */
function escRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 逐字符大括号深度表（跳过行注释/块注释/字符串/模板串）。
 * 返回 Int32Array，`dep[i]` = 处理第 i 个字符**之前**的深度 ⇒ 顶层声明处 dep === 0。
 */
function buildDepthMap(src) {
  const n = src.length;
  const dep = new Int32Array(n + 1);
  let d = 0;
  let i = 0;
  while (i < n) {
    const c = src[i];
    // 行注释
    if (c === '/' && src[i + 1] === '/') {
      const nl = src.indexOf('\n', i);
      const stop = nl === -1 ? n : nl;
      for (let k = i; k < stop; k++) dep[k] = d;
      i = stop;
      continue;
    }
    // 块注释
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? n : end + 2;
      for (let k = i; k < stop; k++) dep[k] = d;
      i = stop;
      continue;
    }
    // 字符串 / 模板串
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < n) {
        if (src[j] === '\\') {
          j += 2;
          continue;
        }
        if (src[j] === c) {
          j += 1;
          break;
        }
        j += 1;
      }
      for (let k = i; k < j; k++) dep[k] = d;
      i = j;
      continue;
    }
    dep[i] = d;
    if (c === '{') d += 1;
    else if (c === '}') d = Math.max(0, d - 1);
    i += 1;
  }
  dep[n] = d;
  return dep;
}

/** 由开括号下标求配对闭括号下标（依赖 buildDepthMap）。找不到返回 -1。 */
function matchCloseBrace(src, dep, openIdx) {
  const d0 = dep[openIdx];
  for (let i = openIdx + 1; i < src.length; i++) {
    if (src[i] === '}' && dep[i] === d0 + 1) return i;
  }
  return -1;
}

/**
 * 为 vue 命名 import 补齐缺失符号（如 watch / nextTick）。
 * 只追加、不重排、不改既有符号顺序；找不到 `from 'vue'` 具名 import 时返回 null（fail-open）。
 */
function ensureVueNamedImports(content, names) {
  const re = /import\s*\{([^}]*)\}\s*from\s*(['"])vue\2/;
  const m = content.match(re);
  if (!m) return null;
  const have = new Set(
    m[1]
      .split(',')
      .map((s) => s.trim().split(/\s+as\s+/)[0].trim())
      .filter(Boolean),
  );
  const missing = names.filter((n) => !have.has(n));
  if (missing.length === 0) return content;
  const inner = m[1].trim().replace(/,$/, '');
  const merged = `${inner}, ${missing.join(', ')}`;
  return content.replace(re, `import { ${merged} } from 'vue'`);
}

/**
 * 🛡️ G13（2026-11-12 · mc-lite-1794462096859-e6a099a0 真机实锤）：
 * 图表容器重建自愈注入 —— 宿主重建容器时图表不再永久空白。
 *
 * **病灶（真机实证）**：产物把图表挂在自身根模板里、并用 `<base-panel>` 作外壳；
 * `<base-panel>` 内部是 `<component :is="panelComponent" :key="currentPanel">`，
 * 面板类型一变（如深色主题自动联动 default-panel → aio-panel）⇒ 面板组件 unmount+mount
 * ⇒ **slot 子树 DOM 整体销毁重建**，而产物根组件实例由宿主直接渲染、**不会被 unmount**。
 * 于是：`let chart` 仍指向挂在已脱离文档的旧 div 上的实例（`onUnmounted` 不触发、不 dispose），
 * 模板 ref 走到新 div，而产物 init 的首行守卫 `if (!ref.value || chart) return` 与
 * `watch(ref, (el) => { if (el && !chart) ... })` 双双命中 `chart` 真值 ⇒ 直接早退，
 * 新容器**永不初始化**（实测：新元素 `_echarts_instance_=null`、无 canvas）。
 *
 * **本注入（纯附加，不改产物既有任何语句）**：在 `<script setup>` 顶层追加一个
 * `watch(<ref>, ...)`：
 *   ① 当 ref 变更且现存实例仍挂在**旧元素**上 ⇒ 判定实例已失效，dispose 并置空；
 *   ② 新元素出现 ⇒ 按序回调产物自身的 init 函数（其原有守卫此刻因实例已置空而放行）。
 * 两条合起来才是完整治本：只做 ① 则无入口进入 init，只做 ② 则 init 仍被 `|| chart` 挡死。
 *
 * **判据（全部满足才注入，任一不满足即 fail-open 跳过）**：
 * - `<script setup>`；存在 `<template>`；模板无动态 `:ref` / `v-bind:ref`
 * - 存在 `X = echarts.init(<arg>)`（含 `X.value = ...` 形态）
 * - init 实参经解析后指向一个**静态模板 ref**：`const R = ref(null)` + 模板 `ref="R"`
 *   （实参为局部别名 `const el = R.value` 时同样解析回 R）
 * - 实例持有者：`X` 为顶层 `let`（可重新赋值）或 `X.value` 的 `X` 为 `ref(...)`
 * - 能唯一定位「内含该次 init 的顶层具名函数」作为初始化入口
 * - `watch` / `nextTick` 可从既有 `from 'vue'` 具名 import 补齐
 *
 * @param {string} content .vue 源码
 * @param {object} [options] 预留（保留调用形态一致）
 * @returns {{content:string, changed:boolean, injected:string[], skipped?:string}}
 */
export function injectChartRebuildGuard(content, options = {}) {
  void options;
  const noop = (reason) => ({ content, changed: false, injected: [], skipped: reason });
  if (typeof content !== 'string' || !content.includes('echarts.init(')) {
    return noop('noEcharts');
  }
  if (content.includes(CHART_REBUILD_GUARD_MARK)) return noop('alreadyInjected');
  const scriptMatch = content.match(/<script([^>]*)>([\s\S]*?)<\/script>/);
  if (!scriptMatch) return noop('noScript');
  if (!/(^|\s)setup(\s|$)/.test(scriptMatch[1] || '')) return noop('notScriptSetup');
  const script = scriptMatch[2];
  const template = (content.match(/<template[^>]*>([\s\S]*?)<\/template>/) || [])[1] || '';
  if (!template) return noop('noTemplate');
  if (/[:@]ref\s*=|v-bind:ref/.test(template)) return noop('dynamicRef');

  const dep = buildDepthMap(script);

  /** 顶层 `<kind> name` 声明是否存在（depth === 0）。 */
  const hasTopLevelDecl = (kind, name) => {
    const re = new RegExp(`\\b(?:${kind})\\s+${escRe(name)}\\b`, 'g');
    let m;
    while ((m = re.exec(script)) !== null) {
      if (dep[m.index] === 0) return true;
    }
    return false;
  };
  /** 任意位置声明形态（用于 `.value` 持有者，可位于顶层 const）。 */
  const hasDecl = (name, initHint) =>
    new RegExp(
      `\\b(?:const|let|var)\\s+${escRe(name)}\\s*(?::[^=;]+)?=\\s*${initHint}`,
    ).test(script);

  // ① 收集 `X = echarts.init(arg)` 赋值对
  const pairRe =
    /((?:[A-Za-z_$][\w$]*)(?:\s*\.\s*value)?)\s*=\s*echarts\.init\(\s*([A-Za-z_$][\w$]*)(\s*\.\s*value)?\s*\)/g;
  const rawPairs = [];
  let pm;
  while ((pm = pairRe.exec(script)) !== null) {
    rawPairs.push({
      instanceExpr: pm[1].replace(/\s+/g, ''),
      argBase: pm[2],
      argExpr: pm[2] + (pm[3] ? '.value' : ''),
    });
  }
  if (rawPairs.length === 0) return noop('noPair');

  // ② 逐个解析 ref 归属，组装注入项
  const injected = [];
  const seen = new Set();
  const skipReasons = [];
  for (const p of rawPairs) {
    let refName = p.argBase;
    let refExpr = p.argExpr;
    // 实参本身不是模板 ref ⇒ 尝试解析局部别名 `const <argBase> = <R>.value`
    const aliasHit = new RegExp(
      `\\b(?:const|let)\\s+${escRe(p.argBase)}\\s*=\\s*([A-Za-z_$][\\w$]*)\\s*(?:\\.value)?\\s*(?:\\|\\||;|\\n)`,
    ).exec(script);
    if (aliasHit) {
      refName = aliasHit[1];
      refExpr = p.argExpr;
    }
    if (!hasDecl(refName, 'ref\\s*\\(') && !hasTopLevelDecl('const|let', refName)) {
      skipReasons.push(`noRefDecl:${refName}`);
      continue;
    }
    if (!hasDecl(refName, 'ref\\s*\\(')) {
      skipReasons.push(`notRefCall:${refName}`);
      continue;
    }
    if (!new RegExp(`ref\\s*=\\s*["']${escRe(refName)}["']`).test(template)) {
      skipReasons.push(`noStaticRefInTemplate:${refName}`);
      continue;
    }
    // 实例持有者可重新赋值？
    const instBase = p.instanceExpr.replace(/\.value$/, '');
    const isValueHolder = /\.value$/.test(p.instanceExpr);
    if (isValueHolder) {
      if (!hasDecl(instBase, '(?:ref|shallowRef|reactive)\\s*\\(')) {
        skipReasons.push(`holderNotRef:${instBase}`);
        continue;
      }
    } else if (!hasTopLevelDecl('let', instBase)) {
      skipReasons.push(`holderNotTopLevelLet:${instBase}`);
      continue;
    }
    // ③ 唯一定位初始化入口函数
    const fnRe =
      /(?:const|let|function)\s+([A-Za-z_$][\w$]*)\s*(?:=\s*)?(?:async\s*)?\([^)]*\)\s*(?:=>)?\s*\{/g;
    const fnCandidates = [];
    let fm;
    while ((fm = fnRe.exec(script)) !== null) {
      if (dep[fm.index] !== 0) continue;
      const open = fm.index + fm[0].length - 1;
      const close = matchCloseBrace(script, dep, open);
      if (close === -1) continue;
      const body = script.slice(open, close + 1);
      const initHit = new RegExp(
        `echarts\\.init\\(\\s*${escRe(p.argExpr)}\\s*\\)`,
      ).test(body);
      if (initHit) fnCandidates.push(fm[1]);
    }
    if (fnCandidates.length !== 1) {
      skipReasons.push(
        fnCandidates.length === 0 ? `noInitFn:${p.argExpr}` : `ambiguousInitFn:${p.argExpr}`,
      );
      continue;
    }
    const key = `${refName}|${p.instanceExpr}|${fnCandidates[0]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    injected.push({
      refName,
      refExpr,
      instanceExpr: p.instanceExpr,
      initFn: fnCandidates[0],
    });
  }
  if (injected.length === 0) {
    return { content, changed: false, injected: [], skipped: skipReasons.join(';') || 'noTarget' };
  }

  // ④ 补齐 import
  const scriptWithImports = ensureVueNamedImports(script, ['watch', 'nextTick']);
  if (scriptWithImports === null) return noop('noVueNamedImport');

  // ⑤ 追加自愈 watch（纯附加，不改任何既有语句）
  let block =
    `\n\n/* ${CHART_REBUILD_GUARD_MARK}：宿主重建图表容器自愈。\n` +
    `   宿主（base-panel 的 <component :is :key>）切换面板类型时，slot 子树 DOM 被销毁重建，\n` +
    `   而本组件实例存活 ⇒ 实例变量仍指向已脱离文档的旧实例，原 init 的「已有实例即早退」\n` +
    `   守卫恒命中，新容器永不初始化（图表永久空白）。此处补：旧实例销毁 + 新容器重初始化。 */`;
  for (const it of injected) {
    block +=
      `\nwatch(\n` +
      `  ${it.refName},\n` +
      `  (el, oldEl) => {\n` +
      `    if (\n` +
      `      oldEl &&\n` +
      `      oldEl !== el &&\n` +
      `      ${it.instanceExpr} &&\n` +
      `      typeof ${it.instanceExpr}.getDom === 'function' &&\n` +
      `      ${it.instanceExpr}.getDom() === oldEl\n` +
      `    ) {\n` +
      `      try {\n` +
      `        ${it.instanceExpr}.dispose()\n` +
      `      } catch (e) {}\n` +
      `      ${it.instanceExpr} = null\n` +
      `    }\n` +
      `    if (el) nextTick(() => ${it.initFn}())\n` +
      `  },\n` +
      `  { flush: 'post' }\n` +
      `)`;
  }

  const newScript = `${scriptWithImports}${block}\n`;
  const newContent = content.replace(
    scriptMatch[0],
    `<script${scriptMatch[1]}>${newScript}</script>`,
  );
  return {
    content: newContent,
    changed: true,
    injected: injected.map((it) => `${it.refName}→${it.initFn}(${it.instanceExpr})`),
    skipped: skipReasons.length ? skipReasons.join(';') : undefined,
  };
}
