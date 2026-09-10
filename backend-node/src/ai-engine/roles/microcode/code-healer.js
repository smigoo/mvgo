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
import { healMissingLessBraces } from '../../validators/less-compile-gate.js';
import { fixTextOrderDrift } from '../../utils/text-order-guard.js';
import { parse as parseJavaScript } from '@babel/parser';
import { inferChartMinHeight } from '../../utils/post-process.js';

function isIndexVuePath(path) {
  return /(^|\/)package\/index\.vue$/i.test(String(path || ''));
}

/**
 * 🛡️ 悬空子组件 import 剥离（2026-08-30）
 *
 * 背景：planner 规划了 N 个 section，但子组件生成可能只兑现部分。模型基于「应该有」的预期，
 * 在产物里脑补 `import NavTabs from './NavTabs.vue'`——这些文件从未存在。
 *
 * 本规则显式化：任何 `from './X.vue'` 的相对 import，若目标文件不在文件集中，一律剥离，
 * 并**同步剥离模板中对应的组件标签**——只删 import 不删标签会留下未声明变量，
 * 反而触发「模板引用未声明变量」的语义校验失败。
 *
 * @param {Object<string,string>} allFiles 路径 → 内容
 * @param {Object} [options]
 * @param {Object} [options.logger] 日志器
 * @returns {Object<string,string>} 修复后的文件集（未改动时返回原对象引用）
 */
export function pruneDanglingSubComponentImports(allFiles, options = {}) {
  const logger = safeLogger(options.logger);
  if (!allFiles || typeof allFiles !== 'object') return allFiles;

  const fileSet = new Set(Object.keys(allFiles).filter(Boolean));

  /** 解析相对 import 说明符为文件集内的绝对路径 */
  const resolveRelative = (fromFile, spec) => {
    const clean = String(spec || '')
      .replace(/['"]/g, '')
      .trim();
    if (!/\.vue$/i.test(clean)) return null;
    if (!clean.startsWith('.')) return null; // 只处理相对路径
    const stack = fromFile.split('/').slice(0, -1);
    for (const part of clean.split('/')) {
      if (part === '.' || part === '') continue;
      if (part === '..') stack.pop();
      else stack.push(part);
    }
    return stack.join('/');
  };

  const out = { ...allFiles };
  let changed = false;
  const removed = [];

  // 匹配 import 语句（含结尾分号可选），捕获本地变量名与说明符
  const importRe =
    /^[ \t]*import\s+([A-Za-z_$][\w$]*)\s+from\s+(['"])(\.[^'"]*\.vue)\2\s*;?[ \t]*$/gm;

  for (const [path, content] of Object.entries(out)) {
    if (!/\.vue$/i.test(path) || typeof content !== 'string') continue;

    const matches = [...content.matchAll(importRe)];
    const dangling = [];
    for (const m of matches) {
      const varName = m[1];
      const target = resolveRelative(path, m[3]);
      if (!target || fileSet.has(target)) continue;
      dangling.push({ varName, target, stmt: m[0] });
    }
    if (dangling.length === 0) continue;

    let next = content;
    for (const d of dangling) {
      // 1) 删除 import 语句整行
      next = next.replace(d.stmt, '');
      // 2) 删除模板中的组件标签
      const selfCloseRe = new RegExp(
        `^[ \\t]*<${d.varName}\\b[^>]*\\/>[ \\t]*\\r?\\n?`,
        'gm',
      );
      const pairRe = new RegExp(
        `^[ \\t]*<${d.varName}\\b[^>]*>[\\s\\S]*?<\\/${d.varName}>[ \\t]*\\r?\\n?`,
        'gm',
      );
      next = next.replace(pairRe, '').replace(selfCloseRe, '');
      removed.push({ file: path, var: d.varName, missing: d.target });
    }

    // 清理可能因删除产生的连续空行（最多压成 1 个）
    next = next.replace(/\n{3,}/g, '\n\n');
    if (next !== content) {
      out[path] = next;
      changed = true;
    }
  }

  if (changed && removed.length > 0 && logger) {
    logger.warn(`🛡️ 已剥离 ${removed.length} 处指向不存在文件的子组件 import`, {
      removed,
    });
  }

  return changed ? out : allFiles;
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
  const tplMatch = vueContent.match(/<template>([\s\S]*?)<\/template>/);
  if (!tplMatch) return vueContent;
  const body = tplMatch[1];
  const fixedBody = body.replace(
    /([{,])\s*(['"])?([A-Za-z_$][A-Za-z0-9_$]*(?:-[A-Za-z0-9_$]+)+)(['"])?(\s*:)/g,
    (_m, open, q1, key, q2, post) =>
      `${open}${q1 || "'"}${key}${q2 || "'"}${post}`,
  );
  if (fixedBody === body) return vueContent;
  const start = tplMatch.index + '<template>'.length;
  return (
    vueContent.slice(0, start) +
    fixedBody +
    vueContent.slice(start + body.length)
  );
}

/**
 * 🛡️ 确保 package/index.vue 根元素携带实例 ID 类 c-mc-max-{id}。
 * 仅对模板内首个元素注入；若已存在则跳过。
 *
 * @param {string} vueContent
 * @param {string} rootClass 形如 c-mc-max-1787742124556-3c15fc26
 * @returns {string}
 */
export function ensureRootInstanceId(vueContent, rootClass) {
  if (!vueContent || typeof vueContent !== 'string' || !rootClass)
    return vueContent;
  const tpl = vueContent.match(/<template>([\s\S]*?)<\/template>/);
  if (!tpl) return vueContent;
  const body = tpl[1];
  const tagMatch = body.match(/<([a-zA-Z][\w-]*)((?:\s+[^>]*?)?)(\/?)>/);
  if (!tagMatch) return vueContent;
  const tagName = tagMatch[1];
  let attrs = tagMatch[2];
  const selfClose = tagMatch[3];
  if (/\bclass\s*=/.test(attrs)) {
    attrs = attrs.replace(
      /(class\s*=\s*)(["'])([\s\S]*?)\2/,
      (m, p1, q, val) => {
        const toks = val.split(/\s+/).filter(Boolean);
        if (toks.includes(rootClass)) return m;
        return `${p1}${q}${val} ${rootClass}${q}`;
      },
    );
  } else {
    attrs = ` class="${rootClass}"` + (attrs || '');
  }
  const newTag = `<${tagName}${attrs}${selfClose}>`;
  return vueContent.replace(tagMatch[0], newTag);
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

  const templateMatch = content.match(/<template>([\s\S]*?)<\/template>/);
  const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/);

  let fixed = content;

  // --- Template 区域 ---
  if (templateMatch) {
    let template = templateMatch[1];
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
    fixed = fixed.replace(templateMatch[1], template);
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
export function buildIndexLessTemplate(backgroundBrightness = 'dark', emitThemeOverrides = false) {
  const defaultTheme = backgroundBrightness === 'light' ? 'light' : 'dark';
  const overrides = emitThemeOverrides
    ? `
// 主题覆盖层（宿主注入 .dark/.light 类时生效）
@import './themes/dark.less';
@import './themes/light.less';
`
    : `
// 说明：宿主当前不给组件根注入 .dark/.light 类，故不引入 themes/dark.less、themes/light.less
//（引入只会产出 .dark .c-xxx 这类永不命中的死规则）。宿主支持主题切换后，
//   设置环境变量 MC_EMIT_THEME_OVERRIDES=1 即可自动恢复覆盖层导入。
`;
  return `// 样式入口（系统自动生成，勿手改）
@import './themes/theme-vars.less';

// 默认主题：必须在**根作用域**生效，否则组件在无 .dark/.light 祖先的真实 DOM 上样式全部失效
.common();
.theme-${defaultTheme}();
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

  const tpl = content.match(/<template[^>]*>([\s\S]*?)<\/template>/);
  const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/);
  if (!tpl || !scriptMatch) return content;
  const tplBody = tpl[1];
  const scriptBody = scriptMatch[1];

  // ① 探测 tabs 数组变量（必须后接 [ .. ]，排除 activeTab 等字符串 ref）
  const tabsVar = options.tabsVar || detectTabsVar(scriptBody);
  if (!tabsVar) return content;

  // ② 校验确实是「指标 tab 数组」：提取数组体、字段名、value 集合
  const arrInfo = detectTabArrayInfo(scriptBody, tabsVar);
  if (!arrInfo || arrInfo.values.length < 2) return content;

  // ③ 模板是否已渲染该 tabs？已渲染则跳过（不重复注入）
  if (templateRendersTabs(tplBody, tabsVar)) return content;

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
  return content.replace(tpl[1], newBody);
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
    `          :class="{ 'is-active': ${activeVar} === tab.${valueKey} }"\n` +
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
  // 回退：注入到模板最前（作为根元素首个子节点）
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
export function healVueEmbeddedStyleBraces(content) {
  if (typeof content !== 'string' || !content.includes('<style')) return content;
  let changed = false;
  const out = content.replace(
    /<style\b[^>]*>([\s\S]*?)<\/style>/gi,
    (full, css) => {
      const healed = healMissingLessBraces(css);
      if (healed.changed) {
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
        // 值位置引用：@name 后非冒号（排除声明）、非 { （排除 @{} 插值）
        const re = new RegExp(`@${name}\\b(?!\\s*:)(?!\\{)`, 'g');
        if (re.test(outLine)) {
          outLine = outLine.replace(re, `var(--${name}, ${def})`);
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
 * @param {string} lessContent 业务样式源（common.less 等，不含 themes/）
 * @param {string} themeVarsContent theme-vars.less 内容
 * @returns {string} 注入后的内容（无缺失时原样返回）
 */
export function injectThemeVarDeclsForLess(lessContent, themeVarsContent) {
  const source = String(lessContent || '');
  const decls = extractThemeVarDecls(themeVarsContent);
  if (!decls.size) return source;

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
    missing.push(name);
  }
  if (!missing.length) return source;

  const decl = missing.map((n) => `@${n}: ${decls.get(n)};`).join('\n');
  return `${decl}\n${source}`;
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
  const chartSeries = String(options.chartSeries || '趋势图');

  const scriptM = content.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i);
  if (!scriptM) return content;
  const script = scriptM[1];
  const tplM = content.match(/<template>([\s\S]*?)<\/template>/i);
  const tplBody = tplM ? tplM[1] : '';

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
    `  grid: { left: 40, right: 20, top: 20, bottom: 30, containLabel: true },`,
    `  xAxis: { type: 'category', data: ['2','4','6','8','10','12','14','16','18','20','22','24'] },`,
    `  yAxis: { type: 'value' },`,
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
      v.includes('//') || v.includes('/*') || v.includes('*/') // 含注释 → 保守跳过
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
  if (typeof content !== 'string' || !content.includes('#')) return content;
  if (typeof themeVarsContent !== 'string' || !themeVarsContent.includes('#')) {
    return content;
  }
  // 1) hex → cssVar 唯一映射（同 hex 多变量 → 不收录）
  const hexVarCount = new Map(); // hexLower -> Set<cssVar>
  for (const m of themeVarsContent.matchAll(
    /@([a-z][a-z0-9-]*)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g,
  )) {
    const cssVar =
      '--' + m[1].replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
    const hex = m[2].toLowerCase();
    if (!hexVarCount.has(hex)) hexVarCount.set(hex, new Set());
    hexVarCount.get(hex).add(cssVar);
  }
  const hexToVar = new Map();
  for (const [hex, vars] of hexVarCount) {
    // 🛡️ 2026-09-10：同 hex 多变量时兜底收录第一个（如 #333333 同时是
    // @color-axis-label / @color-axis-unit 两个槽值）。旧逻辑仅收录唯一映射 → healer
    // 跳过多变量 hex → 门禁 THEME-SLOT-COLOR 对残留字面量硬 BLOCK
    //（env 01407ff1 实锤 6 处漏治）。兜底收录后门禁检测 var(...) 即跳过。
    hexToVar.set(hex, [...vars][0]);
  }
  if (hexToVar.size === 0) return content;

  // 2) 颜色属性 = 纯槽 hex 字面量 → var(--x, #hex)
  let changed = false;
  const out = content.replace(
    /(^|[\s;{])(color|background(?:-color)?|border-(?:top|right|bottom|left)-color|outline(?:-color)?|caret-color|accent-color)\s*:\s*(#[0-9a-fA-F]{3,8})(\s*!important)?\s*;/gm,
    (full, pre, prop, hex, imp) => {
      const varName = hexToVar.get(hex.toLowerCase());
      if (!varName) return full;
      changed = true;
      return `${pre}${prop}: var(${varName}, ${hex})${imp || ''};`;
    },
  );
  return changed ? out : content;
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
