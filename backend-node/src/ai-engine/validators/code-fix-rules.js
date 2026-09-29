/**
 * 🛡️ 内置确定性修复规则集（P1-4 收口，2026-08-28）
 *
 * 背景：microcode-engineer 里有 20+ 个确定性修复方法（_fixOrphanJsdocInVue、
 * _autoMountUnusedIcons、_stripInstanceIdPrefix ...），但它们是「散落在 generateCode 各处
 * 的裸调用」——执行顺序靠人工维护、没有统一回滚开关、新增规则要翻遍调用点。
 * 这正是今日三类故障反复出现的土壤。
 *
 * 本模块把这些既有实现「登记造册」，由 CodeFixPipeline 按阶段统一调度。
 * 刻意不改方法实现、也不删除原调用点：所有规则都是幂等的（重复执行结果不变），
 * 因此先叠加统一编排、再逐步收敛原调用点，是零回归风险的迁移路径。
 *
 * 规则分两类：
 *  - fix(content, ctx)        单文件：对某个文件的内容做确定性变换
 *  - fixFiles(files, ctx)     文件集：需要跨文件协同（如资源挂载要先看 mapping 再改模板）
 */

import { FIX_PHASE } from './code-fix-pipeline.js';
import { stripLlmTailGarbage } from '../utils/llm-tail-garbage.js';
import { ensureSectionAssembly } from '../utils/section-coverage-guard.js';
import { detectUnknownText } from '../utils/text-truth-guard.js';
import { pruneDuplicateStyleDecls } from '../utils/style-dedup-guard.js';
import { deconflictSharedClassDecls } from '../utils/shared-class-deconflict.js';
import {
  collapseBackgroundShellDivs,
  injectStateSwitchInteraction,
  extractPerCharTextTruth,
  injectPerCharTextSegments,
  validateDynamicClassStyles,
  validateResourceBindingLevel,
  extractNodeLevelColorTruth,
  injectNodeLevelColorTruth,
} from '../utils/post-process.js';
import { normalizeCssVarNames } from '../utils/css-var-contract.js';
import { extractSfcTemplateRegion } from '../utils/sfc-template-extractor.js';
import {
  ensureGridDisplay,
  ensureGridDisplayInVueSfc,
} from '../utils/css-sanitizer.js';

const VUE = /\.vue$/i;
const STYLE = /\.(less|css)$/i;

/**
 * 🛡️ 从文件内容中提取实例 ID（如 mc-max-1787742124556-3c15fc26）。
 *
 * 根因修复（mc-max-1787973616111-7b5cb9e2 实锤，2026-08-29）：
 * 旧逻辑只靠 componentName / outputPath 经 _getInstanceId 推导实例 ID，
 * 一旦这两个值在规则注册时未携带 mc-max-<ts>-<hex> 形态（生成入口改写 componentName
 * 或 outputPath 末段为复合名），_getInstanceId 返回空 → strip-instance-id-prefix
 * 整段变 no-op → 子组件模板根仍残留完整前缀 c-mc-max-<id>-c-monitor-x，而其 <style>
 * 选择器是短前缀 c-monitor-x，两者不匹配 → 子组件自带的全部 flex/height 规则沦为死代码，
 * 多区块高度比例彻底失效（仅 common.less 无 flex 基础样式生效 + 根容器 overflow-y:auto 滚动）。
 *
 * 该实例 ID 前缀（c-mc-max-<id>-）必然出现在模型生成的类名中，故直接从内容正则提取，
 * 与 componentName/outputPath 解耦，100% 确定性生效。提取不含前导 c-，
 * 与 _getInstanceId 返回值形态一致（供 _stripInstanceIdPrefix / _ensureRootInstanceId 复用）。
 */
function _extractInstanceIdFromContent(content) {
  if (!content || typeof content !== 'string') return '';
  const m = content.match(/mc-max-\d{13}-[a-f0-9]+/i);
  return m ? m[0] : '';
}

/**
 * 计算「从样式文件所在目录 → resources/images/」的相对路径前缀。
 *
 * 例：resources/styles/common.less         → '../images/'
 *     resources/styles/themes/theme-vars.less → '../../images/'
 *     package/index.vue                    → '../resources/images/'
 *     resources/index.less                 → 'images/'
 *
 * @param {string} filePath
 * @returns {string} 以 '/' 结尾
 */
function _imagesRelPrefix(filePath) {
  const dir = String(filePath)
    .replace(/\\/g, '/')
    .split('/')
    .slice(0, -1)
    .filter(Boolean);
  const target = ['resources', 'images'];
  let common = 0;
  while (
    common < target.length &&
    common < dir.length &&
    dir[common] === target[common]
  ) {
    common++;
  }
  const up = '../'.repeat(dir.length - common);
  const down = target.slice(common).join('/');
  return up + down + (down ? '/' : '');
}

/**
 * 把样式里直写的资源 url() 相对路径，重写为「相对当前文件正确」的路径。
 *
 * 判定范围刻意收窄：仅重写 basename 命中 resourceDomMapping 的已知资源，
 * 避免动到第三方 CDN / data: URI / 字体等无关 url。
 * 模板字面量形式 url(`${var}`)、url(' + var + ') 不涉及路径，直接跳过。
 *
 * @param {string} content
 * @param {string} filePath
 * @param {Array<{resourceFile?:string}>|null} resourceDomMapping
 * @returns {string}
 */
export function normalizeStyleResourceUrls(content, filePath, resourceDomMapping) {
  if (!content || typeof content !== 'string' || !filePath) return content;
  const known = new Set(
    (Array.isArray(resourceDomMapping) ? resourceDomMapping : [])
      .map((m) => String(m?.resourceFile || '').split('/').pop())
      .filter(Boolean),
  );
  if (known.size === 0) return content;

  const prefix = _imagesRelPrefix(filePath);
  return content.replace(
    /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi,
    (whole, raw) => {
      const inner = String(raw).trim();
      // 模板/拼接变量形式不改写（无路径可修）
      if (inner.includes('${') || inner.startsWith('+') || inner.endsWith('+')) {
        return whole;
      }
      if (/^(https?:)?\/\/|^data:/i.test(inner)) return whole;
      const base = inner.split('/').pop();
      if (!known.has(base)) return whole;
      const quote = whole.match(/url\(\s*(['"])/)?.[1] || "'";
      const next = `${prefix}${base}`;
      return next === inner ? whole : `url(${quote}${next}${quote})`;
    },
  );
}

/**
 * 🛡️ N4 中性化（2026-08-31）：识别 SFC 根容器 class。
 *
 * 旧实现病灶（mc-max-1788258252381-9168ed08 实锤）：lazy 正则
 * `/<template>\s*<base-panel[^>]*>[\s\S]*?<div[^>]*\bclass="([\w-]+)"/`
 * 会跨进 `<template #title_left>` 具名插槽，把插槽内首个带 class 的元素（8×8px
 * 装饰菱形 c-monitor-header-diamond）误判为根容器 → 被写成 426×807px 撑爆整个面板，
 * 且 L0-B pass=true 同步到了 workspace。c-env-monitor-header-right 等非根容器同理。
 *
 * 识别策略（确定性，无启发式）：
 *  1. 只看 SFC 模板区（首个无属性 <template> 到 <script>/<style>）；
 *  2. 先剥离 HTML 注释与全部具名插槽块（<template #xxx> / <template v-slot:xxx>）；
 *  3. 兼容 base-panel 包裹：跳过 base-panel 标签，取其后第一个带 class 的元素；
 *     否则取根元素自身的首个 class token；
 *  4. 根元素（含 base-panel 直子）自身无 class → 返回 null（宁可 no-op 不可误锚）。
 *
 * @param {string} vueContent
 * @returns {string|null} 根容器 class 名，识别失败返回 null
 */
export function detectRootContainerClass(vueContent) {
  if (!vueContent || typeof vueContent !== 'string') return null;
  const tplStart = vueContent.search(/<template\b[^>]*>/i);
  if (tplStart < 0) return null;
  const rest = vueContent.slice(tplStart);
  const endIdx = rest.search(/<script[\s>]|<style[\s>]/i);
  const tpl = endIdx > 0 ? rest.slice(0, endIdx) : rest;
  // 剥注释 + 剥具名插槽块（diamond 误检根因：装饰元素藏在 <template #title_left> 内）
  const stripped = tpl
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(
      /<template\s+(?:#|v-slot:)[^>]*>[\s\S]*?<\/template\s*>/gi,
      '',
    );
  const mBase = stripped.match(
    /<template\b[^>]*>[\s\S]*?<base-panel[^>]*>[\s\S]*?<([a-zA-Z][\w-]*)[^>]*\bclass=(["'])([\w-]+)\2/i,
  );
  if (mBase) return mBase[3];
  const mRoot = stripped.match(
    /<template\s*>\s*<([a-zA-Z][\w-]*)[^>]*\bclass=(["'])([\w-]+)\2/i,
  );
  return mRoot ? mRoot[3] : null;
}

/**
 * 🛡️ N4 中性化（2026-08-31）：根容器尺寸「中性锚定」+ 面板背景 R7 剥离再注入。
 *
 * 旧 N4（microcode-engineer.js:5084 / vue3-engineer.js:1462 双端内联）三宗罪：
 *  1. 写死 `width: Wpx; height: Hpx` —— 违反自家规范 root-container.md:13
 *     「根容器默认 width:100%; height:100%」与 :27 「aspectRatio 必须从 Figma
 *     真值计算（width/height）」；
 *  2. rootCls 误检（见 detectRootContainerClass 注释，diamond 事故）；
 *  3. 锚定被后续轮次覆盖（mc-max-1788248984779-862c6b29：07:55 落盘 420×186，
 *     16:23 workspace 被改回 width:100%，px 锚定形同虚设）。
 *
 * 中性化语义（治「蜂巢塌缩」的同时不与 LLM 既有输出打架）：
 *  - 已有 width/height 声明：一律不覆盖（LLM 写了就尊重，杜绝 862c6b29 式反复拉锯）；
 *  - 缺 width → 补 `width: 100%`；缺 height → 补 `height: 100%`（规范默认值）；
 *  - width/height 至少缺一 → 注入 `aspect-ratio: <W> / <H>`（Figma 真值比例，
 *    100% 尺寸下由比例锁形态，替代写死 px；两者都全时不注入，aspect-ratio 无效即噪声）；
 *  - panelBg（skipMount 的整块面板背景）：沿用 R7「剥离再注入」——先剥根容器全部
 *    background 声明（含 @var / 渐变 / 纯色），再注入面板 bg url；路径按注入目标
 *    文件目录推导（_imagesRelPrefix，杜绝 R4 相对路径 404）。
 *
 * 幂等：二次执行时 width/height/aspect-ratio 已在、注入的 bg 声明被剥后再原样注回，
 * 内容不变 → pipeline diff 不记账。
 *
 * @param {Object<string,string>} files 路径 → 内容
 * @param {Object} [options]
 * @param {Object|null} [options.figmaNodeData] Figma 根节点（缺省 no-op，兼容
 *        generation-context.js createFixPipeline 第三入口不传 figmaNodeData 的场景）
 * @param {Array|null} [options.resourceDomMapping] 已 resolve 的资源映射（缺省仅锚尺寸不注背景）
 * @param {Object} [options.logger] 可选日志器（info），用于运行时可观测性
 * @returns {Object<string,string>} 新 files map（无改动时原引用返回）
 */
export function anchorRootContainerInFiles(files, options = {}) {
  const { figmaNodeData = null, resourceDomMapping = null, logger = null } =
    options || {};
  if (!files || typeof files !== 'object') return files;
  const rootNode = figmaNodeData?.document || figmaNodeData;
  const bb = rootNode?.absoluteBoundingBox;
  const W = Math.round(bb?.width || 0);
  const H = Math.round(bb?.height || 0);
  if (!(W > 50 && H > 50)) return files;

  const paths = Object.keys(files);
  const idxPath =
    paths.find((p) => /(^|\/)package\/index\.vue$/i.test(p)) ||
    paths.find((p) => /(^|\/)index\.vue$/i.test(p));
  if (!idxPath || typeof files[idxPath] !== 'string') return files;
  const rootCls = detectRootContainerClass(files[idxPath]);
  if (!rootCls) return files;

  const panelBg = (
    Array.isArray(resourceDomMapping) ? resourceDomMapping : []
  ).find(
    (m) =>
      m &&
      m.previewAnalysisRole === 'bg' &&
      m.skipMount &&
      m.resourceFile,
  );
  const bgFileName = panelBg
    ? String(panelBg.resourceFile).split('/').pop()
    : '';
  const styleBlockRe = new RegExp(`(\\.${rootCls}\\s*\\{)([^}]*)`, 'm');

  const patchStyle = (source, targetPath) => {
    if (typeof source !== 'string' || !styleBlockRe.test(source)) return source;
    const prefix = _imagesRelPrefix(targetPath);
    return source.replace(styleBlockRe, (whole, head, body) => {
      let nb = body;
      // R7：先剥离根容器全部背景声明（url/@var/渐变/纯色），消除数据-门禁矛盾
      if (panelBg) {
        nb = nb.replace(
          /(^|[\s;])(?:background(?:-(?:image|color|size|position|repeat|origin|clip|attachment))?\s*:[^;}]+;?)/g,
          '$1',
        );
      }
      const hasWidth = /(^|[\s;{])width\s*:/.test(nb);
      const hasHeight = /(^|[\s;{])height\s*:/.test(nb);
      const injections = [];
      if (!hasWidth) injections.push('  width: 100%;');
      if (!hasHeight) injections.push('  height: 100%;');
      // 🛡️ R4-b（2026-09-15）：删除 aspect-ratio 注入。
      // aspect-ratio 是 boxStyle（预览 iframe 容器比例）的语义，不是 CSS 属性；宿主
      // .pannel-content 有明确高度（calc(100%-38px)），width/height:100% 双全即满足 I4
      // 形态锁，无需 aspect-ratio。对纵向多 section 容器注入 aspect-ratio 会把高度锁死为
      // 「宽×比例」，8 个 section 内容被挤压 →「样式几乎看不到」（traffic-monitor 实锤）。
      if (panelBg) {
        injections.push(`  background-image: url('${prefix}${bgFileName}');`);
        injections.push('  background-size: 100% 100%;');
        injections.push('  background-repeat: no-repeat;');
        injections.push('  background-position: center;');
      }
      if (injections.length === 0) return whole;
      return (
        head +
        nb.replace(/\s+$/, '') +
        '\n' +
        injections.join('\n') +
        '\n'
      );
    });
  };

  let changed = false;
  const out = { ...files };
  // 注入目标一：index.vue <style> 块（始终存在，不依赖 common.less）
  const idxSrc = files[idxPath];
  const nextIdx = idxSrc.replace(
    /<style[^>]*>([\s\S]*?)<\/style>/gi,
    (wholeStyle, styleBody) => {
      const next = patchStyle(styleBody, idxPath);
      return next === styleBody
        ? wholeStyle
        : wholeStyle.replace(styleBody, next);
    },
  );
  if (nextIdx !== idxSrc) {
    out[idxPath] = nextIdx;
    changed = true;
  }
  // 注入目标二：resources/styles/common.less（兼容旧结构，存在才注入）
  const lessPath =
    paths.find((p) => p === 'resources/styles/common.less') ||
    paths.find((p) => /(^|\/)common\.less$/i.test(p));
  if (lessPath && typeof files[lessPath] === 'string') {
    const nextLess = patchStyle(files[lessPath], lessPath);
    if (nextLess !== files[lessPath]) {
      out[lessPath] = nextLess;
      changed = true;
    }
  }
  if (changed && logger && typeof logger.info === 'function') {
    logger.info(
      `🎯 根容器中性锚定: .${rootCls}（Figma ${W}×${H}，width/height 100% 补齐${panelBg ? ' + 面板背景 R7' : ''}）`,
    );
  }
  return changed ? out : files;
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * 🛡️ P1-1（2026-08-30）：剥离静态资源节点的「烘焙装饰」
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 原理：icon / bg / img 在 Figma 导出时是**整块栅格化成 PNG**的，fills / strokes /
 * effects / cornerRadius 全部烘焙进像素。代码层再写 border / border-radius /
 * box-shadow / linear-gradient 就是「二次还原」——轻则多一圈白边，重则圆角把
 * 方形背景裁成圆角、与 Figma 真值不符。
 *
 * 像素实锤（mc-max-1788065970150）：
 *   bg-tab-active-7891 边缘 2px 环近白占比 48.1%，bg-7890 达 85.6%
 *   → 白边来自 Figma strokeWeight 0.6 / CENTER，已烘进 PNG
 *
 * 判定「谁在承载静态资源」的两个确定性信号（不需要猜类名）：
 *   ① 模板：标签的 `:style` 里出现 url(${var}) / 'url(' + var + ')'，或 `:src="var"`
 *      —— var 必须能追溯到 resourceDomMapping（assignedVarName / import 指向已知资源文件）
 *   ② 样式：规则体内出现 url(<已知资源 basename>)
 *      两个信号都取「规则主体类」= 选择器最后一段的 class，覆盖 LESS 嵌套与逗号并列。
 *
 * 刻意不动的：几何属性（width/height/position/top/left/padding/margin/display/flex）
 * 与背景四件套（background-size / -position / -repeat），以及纯色背景
 * —— 用户原则④要求 bg 必须还原 size/repeat/position。
 */

/** 装饰属性白名单：静态资源承载元素上出现即剥离（value 已烘焙进 PNG） */
const BAKED_DECOR_PROPS =
  /^(border(-top|-right|-bottom|-left)?(-(width|style|color))?|border-radius|(border-)?(top|bottom)-(left|right)-radius|box-shadow)$/;

/** 归一化 class：剥离实例 ID 前缀，使模板里的长名与样式里的短名可比 */
function _normCls(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/^c-(?:mc|mv)-max-\d{10,}-[a-z0-9]+-/i, '');
}

/** class 归属判定：全等或「以 - 分隔的后缀」相等，避免 .c-tab-bg 误配 .c-bg */
function _clsMatches(carrierRaw, subjectRaw) {
  const a = _normCls(carrierRaw);
  const b = _normCls(subjectRaw);
  if (!a || !b) return false;
  return a === b || a.endsWith(`-${b}`) || b.endsWith(`-${a}`);
}

/** 判断某条声明是否是「已烘焙的装饰」 */
function _isBakedDecoration(prop, value) {
  const p = String(prop || '').toLowerCase().replace(/^-\w+-/, '');
  if (BAKED_DECOR_PROPS.test(p)) return true;
  // 渐变背景 = Figma fills 的直译，同样已烘焙；纯色背景不判（可能是承载元素自身合法底色）
  if (
    (p === 'background' || p === 'background-image') &&
    /-gradient\s*\(/i.test(value) &&
    !/url\s*\(/i.test(value)
  ) {
    return true;
  }
  return false;
}

/**
 * 遍历文件里所有样式区间的绝对偏移（.vue 取 <style> 体，.less/.css 取整文件）。
 * ⚠️ 非样式文件（.json 等）一律返回空，否则 `{...}` 会被当成 CSS 规则解析出垃圾选择器。
 * @returns {Array<{text:string, start:number, end:number}>} 按出现顺序
 */
function _collectStyleRanges(content, path) {
  const out = [];
  if (typeof content !== 'string' || !content) return out;
  const p = String(path || '');
  if (/\.vue$/i.test(p)) {
    const openRe = /<style[^>]*>/gi;
    let m;
    while ((m = openRe.exec(content)) !== null) {
      const bodyStart = m.index + m[0].length;
      let closeIdx = content.indexOf('</style>', bodyStart);
      if (closeIdx < 0) closeIdx = content.length;
      out.push({
        text: content.slice(bodyStart, closeIdx),
        start: bodyStart,
        end: closeIdx,
      });
      openRe.lastIndex = closeIdx;
    }
    return out;
  }
  if (/\.(less|css)$/i.test(p)) {
    return [{ text: content, start: 0, end: content.length }];
  }
  return out;
}

/**
 * 递归解析 CSS/LESS 块为扁平规则表（支持嵌套与逗号并列）。
 * @returns {Array<{selector:string, bodyStart:number, bodyEnd:number}>}
 */
function _collectRules(text, start, end, parentSelector) {
  const rules = [];
  let i = start;
  let buf = '';
  while (i < end) {
    const ch = text[i];
    if (ch === '{') {
      let depth = 1;
      let j = i + 1;
      while (j < end && depth > 0) {
        if (text[j] === '{') depth++;
        else if (text[j] === '}') depth--;
        if (depth > 0) j++;
      }
      const sel = buf.trim();
      const full = parentSelector ? `${parentSelector} ${sel}`.trim() : sel;
      rules.push({ selector: full, bodyStart: i + 1, bodyEnd: j });
      // at-rule（@media 等）不改变主体选择器，原样透传父选择器
      rules.push(
        ..._collectRules(text, i + 1, j, /^@/.test(sel) ? parentSelector : full),
      );
      buf = '';
      i = j + 1;
      continue;
    }
    if (ch === ';') {
      buf = '';
      i++;
      continue;
    }
    buf += ch;
    i++;
  }
  return rules;
}

/** 取选择器的「主体类」：逗号分隔各段、去掉伪类伪元素后，最后一段的最后一个 class */
function _subjectClasses(selector) {
  const out = [];
  for (const raw of String(selector || '').split(',')) {
    const clean = raw.trim().split(/::?/)[0].trim();
    const cls = [...clean.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
    const last = cls[cls.length - 1];
    if (last) out.push(last);
  }
  return out;
}

/**
 * 收集「承载静态资源」的 class 集合。
 * 见顶部 P1-1 说明的 ① 模板 / ② 样式 两个信号。
 * @returns {{carriers:Set<string>, rootCls:string}}
 */
export function collectResourceCarrierClasses(files, resourceDomMapping) {
  const carriers = new Set();
  const mapping = Array.isArray(resourceDomMapping) ? resourceDomMapping : [];
  const resBasenames = new Set();
  const varNames = new Set();
  for (const m of mapping) {
    if (!m) continue;
    const f = String(m.resourceFile || '').split('/').pop();
    if (f) resBasenames.add(f.toLowerCase());
    if (m.assignedVarName) varNames.add(String(m.assignedVarName));
    if (m.semanticVarName) varNames.add(String(m.semanticVarName));
  }

  let rootCls = '';
  const vuePaths = Object.keys(files || {}).filter(
    (p) => /\.vue$/i.test(p) && typeof files[p] === 'string',
  );

  for (const p of vuePaths) {
    const c = files[p];
    // 补信号：import 指向已知资源文件的变量名也算数（覆盖 assignedVarName 缺失的场景）
    for (const im of c.matchAll(
      /import\s+([A-Za-z_$][\w$]*)\s+from\s*['"]([^'"]+)['"]/g,
    )) {
      const base = String(im[2]).split('/').pop().toLowerCase();
      if (resBasenames.has(base)) varNames.add(im[1]);
    }
  }
  if (varNames.size === 0 && resBasenames.size === 0) return { carriers, rootCls };

  // ① 模板信号
  for (const p of vuePaths) {
    const c = files[p];
    // 🛡️ 共享边界法 + 剥具名插槽（lazy </template> 截断家族缺陷，0ca84358）
    const body = extractSfcTemplateRegion(c, { stripSlots: true }) || c;
    if (!rootCls) {
      const withPanel = body.match(
        /<base-panel[^>]*>[\s\S]*?<[a-zA-Z][^>]*\bclass="([\w-]+)"/,
      );
      const plain = body.match(/<[a-zA-Z][^>]*\bclass="([\w-]+)"/);
      rootCls = (withPanel ? withPanel[1] : plain ? plain[1] : '') || '';
    }
    const tagRe = /<([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>/])*)>/g;
    let m;
    while ((m = tagRe.exec(body)) !== null) {
      const tag = m[0];
      let hit = false;
      for (const v of varNames) {
        const vEsc = v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (
          new RegExp(`url\\(\\s*\\$\\{\\s*${vEsc}\\s*\\}\\s*\\)`).test(tag) ||
          new RegExp(`['"]\\s*\\+\\s*${vEsc}\\s*\\+\\s*['"]`).test(tag) ||
          new RegExp(`:src\\s*=\\s*["']\\s*${vEsc}\\s*["']`).test(tag)
        ) {
          hit = true;
          break;
        }
      }
      if (!hit) continue;
      const cm = tag.match(/\bclass\s*=\s*["']([^"']*)["']/);
      if (!cm) continue;
      for (const tok of cm[1].split(/[\s,]+/)) {
        const t = tok.trim();
        if (_isPlausibleClass(t)) carriers.add(t.toLowerCase());
      }
    }
  }

  // ② 样式信号：规则体内 url() 命中已知资源文件
  //    ⚠️ 两种非渲染形态必须排除，否则会误判承载关系：
  //      a) LESS/CSS 变量声明  @bg-image-7890: url(...);  —— 只是定义，归属由使用处决定
  //      b) LESS mixin 选择器  .theme-dark() { ... }     —— 混入体，不直接作用于 DOM
  for (const [p, c] of Object.entries(files || {})) {
    if (typeof c !== 'string') continue;
    for (const range of _collectStyleRanges(c, p)) {
      for (const rule of _collectRules(range.text, 0, range.text.length, '')) {
        if (/\(\s*\)\s*$/.test(String(rule.selector).trim())) continue; // b) mixin
        const body = range.text.slice(rule.bodyStart, rule.bodyEnd);
        if (!/url\(/i.test(body)) continue;
        const hit = _findRenderedUrlBases(body).some((b) => resBasenames.has(b));
        if (!hit) continue;
        for (const cls of _subjectClasses(rule.selector)) {
          if (_isPlausibleClass(cls)) carriers.add(cls.toLowerCase());
        }
      }
    }
  }
  return { carriers, rootCls };
}

/** class 形态护栏：必须是字母开头、长度 ≥2 的标识符（挡掉解析噪声如 `2` / `theme-` 碎片） */
function _isPlausibleClass(s) {
  return /^[a-zA-Z][\w-]{1,}$/.test(String(s || ''));
}

/**
 * 取规则体内**真正会渲染**的资源 url() basename 列表。
 *
 * 排除 LESS/CSS 变量声明（`@bg-image-7890: url(...)` / `--bg: url(...)`）
 * —— 那只是定义，归属由使用处决定，把定义处当承载会误伤 mixin 宿主（如 `.theme-dark()`）。
 * 判定方式：从 url() 位置向前回溯到上一个 `;` / `{` / `}` / 行首，看语句起点是不是 `@` / `--`。
 */
function _findRenderedUrlBases(body) {
  const out = [];
  const urlRe = /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;
  let m;
  while ((m = urlRe.exec(body)) !== null) {
    let i = m.index;
    while (i > 0 && !/[;{}\n]/.test(body[i - 1])) i--;
    const head = body.slice(i, m.index).trim();
    if (/^(@|--)/.test(head)) continue; // 变量声明，非渲染
    out.push(String(m[1]).split('/').pop().toLowerCase());
  }
  return out;
}

/**
 * 在单个样式文本里，剥离承载类规则中的烘焙装饰声明。
 * @param {string} text 样式源码
 * @param {Set<string>} carriers 承载类集合
 * @param {string} rootCls 根容器类（豁免，见实现内说明）
 * @returns {string}
 */
export function stripBakedDecorationInStyle(text, carriers, rootCls = '') {
  if (!text || typeof text !== 'string' || !carriers || carriers.size === 0) return text;
  const rules = _collectRules(text, 0, text.length, '');
  if (rules.length === 0) return text;
  // 倒序处理，避免前面的删改使后面的偏移失效
  const ordered = rules
    .map((r) => ({
      ...r,
      subject: _subjectClasses(r.selector),
    }))
    .filter((r) => r.subject.length > 0)
    .sort((a, b) => b.bodyStart - a.bodyStart);

  let out = text;
  for (const rule of ordered) {
    const isCarrier =
      rule.subject.some((s) => _clsMatches(s, rootCls)) === false &&
      rule.subject.some((s) =>
        [...carriers].some((c) => _clsMatches(c, s)),
      );
    if (!isCarrier) continue;
    const before = out.slice(rule.bodyStart, rule.bodyEnd);
    const after = _stripDecorationsInBody(before);
    if (after !== before) {
      out = out.slice(0, rule.bodyStart) + after + out.slice(rule.bodyEnd);
    }
  }
  return out;
}

/**
 * 🛡️ 防止子组件 width:100% 覆盖父级 flex 比例（2026-09-21）
 * 
 * 背景：c-device-monitor-70b93a3d tabs 宽度异常
 * 根因：父组件 index.vue 对子组件设置了 flex 比例（如 flex: 0.3 / flex: 0.7），
 *       但子组件根元素设置了 width: 100%，导致 width 覆盖 flex 比例控制。
 * 
 * 修复策略：
 * 1. 扫描所有子组件文件（package/components/*.vue）
 * 2. 对每个子组件，检查其根元素的 <style scoped> 中是否有 width: 100%
 * 3. 如果有，移除这个声明（让父级的 flex 比例生效）
 * 
 * 幂等：移除后再跑一次结果不变。
 * 
 * @param {Object} files - 产物文件表（path → content）
 * @returns {Object} 新文件表（无改动时返回原引用）
 */
export function removeSubComponentWidthOverride(files) {
  if (!files || typeof files !== 'object') return files;
  
  // 只处理子组件文件（package/components/*.vue）
  const subCompPaths = Object.keys(files).filter(
    (p) => /\/components\/[^/]+\.vue$/i.test(p) && typeof files[p] === 'string'
  );
  if (subCompPaths.length === 0) return files;
  
  let changed = false;
  const out = { ...files };
  
  for (const path of subCompPaths) {
    const content = files[path];
    // 匹配 <style scoped> 块
    const styleRe = /(<style[^>]*>)([\s\S]*?)(<\/style>)/gi;
    let styleChanged = false;
    const nextContent = content.replace(styleRe, (whole, open, body, close) => {
      // 移除根元素的 width: 100%（匹配 .c-xxx-root { ... width: 100%; ... }）
      // 策略：找到根类名（通常是第一个 class），移除其 width: 100% 声明
      const rootClassMatch = body.match(/^\.([\w-]+-root)\s*\{/m);
      if (!rootClassMatch) return whole;
      
      const rootClass = rootClassMatch[1];
      const rootClassRe = new RegExp(
        `(\\.${rootClass}\\s*\\{)([^}]*)(\\})`,
        'g'
      );
      
      const nextBody = body.replace(rootClassRe, (match, open, decls, close) => {
        // 移除 width: 100% 声明
        const widthRe = /^\s*width\s*:\s*100%\s*;?\s*$/gm;
        const nextDecls = decls.replace(widthRe, '');
        if (nextDecls !== decls) {
          styleChanged = true;
          return open + nextDecls + close;
        }
        return match;
      });
      
      return nextBody === body ? whole : open + nextBody + close;
    });
    
    if (nextContent !== content) {
      out[path] = nextContent;
      changed = true;
    }
  }
  
  return changed ? out : files;
}

/**
 * 只处理规则体的**直属**声明（嵌套子块整段原样拷贝,子块会作为独立规则单独处理）。
 */
function _stripDecorationsInBody(body) {
  let out = '';
  let i = 0;
  const n = body.length;
  while (i < n) {
    // 注释原样拷贝，避免把注释里的声明当真删掉导致语法破损
    if (body.startsWith('/*', i)) {
      const end = body.indexOf('*/', i + 2);
      const stop = end < 0 ? n : end + 2;
      out += body.slice(i, stop);
      i = stop;
      continue;
    }
    if (body.startsWith('//', i)) {
      let end = body.indexOf('\n', i);
      if (end < 0) end = n;
      out += body.slice(i, end);
      i = end;
      continue;
    }
    if (body[i] === '{') {
      let depth = 1;
      let j = i + 1;
      while (j < n && depth > 0) {
        if (body[j] === '{') depth++;
        else if (body[j] === '}') depth--;
        if (depth > 0) j++;
      }
      out += body.slice(i, Math.min(j + 1, n));
      i = j + 1;
      continue;
    }
    const rest = body.slice(i);
    const dm = rest.match(/^(\s*)([-@a-zA-Z][\w-]*)\s*:\s*([^;{}]*?)\s*(;|$)/);
    if (!dm) {
      out += body[i];
      i++;
      continue;
    }
    const consumed = dm[0].length;
    if (!_isBakedDecoration(dm[2], dm[3])) out += body.slice(i, i + consumed);
    i += consumed;
  }
  return out;
}

/**
 * 🛡️ P1-1 文件集入口：剥离静态资源承载元素上的烘焙装饰。
 * 幂等：剥离后再跑一次结果不变。
 *
 * 根容器刻意豁免 —— 根容器上的 border-radius / box-shadow 多为设计外壳本身，
 * 即使挂了背景图也不应被剥掉（剥掉会让整块面板变方角/丢投影）。
 *
 * @param {Object} files - 产物文件表（path → content）
 * @param {Array} resourceDomMapping - 资源映射
 * @returns {Object} 新文件表（无改动时返回原引用）
 */
export function stripBakedDecorationFromFiles(files, resourceDomMapping) {
  if (!files || typeof files !== 'object') return files;
  const { carriers, rootCls } = collectResourceCarrierClasses(files, resourceDomMapping);
  if (carriers.size === 0) return files;

  let changed = false;
  const out = { ...files };
  for (const [p, c] of Object.entries(out)) {
    if (typeof c !== 'string' || !c) continue;
    const ranges = _collectStyleRanges(c, p);
    if (ranges.length === 0) continue;
    let next = c;
    for (const range of ranges.reverse()) {
      const stripped = stripBakedDecorationInStyle(range.text, carriers, rootCls);
      if (stripped !== range.text) {
        next = next.slice(0, range.start) + stripped + next.slice(range.end);
      }
    }
    if (next !== c) {
      out[p] = next;
      changed = true;
    }
  }
  return changed ? out : files;
}

/**
 * 注册全部内置规则
 *
 * @param {import('./code-fix-pipeline.js').CodeFixPipeline} pipeline
 * @param {Object} engineer  MicrocodeEngineer 实例（规则实现都在其上）
 * @param {Object} context   { componentName, outputPath, resourceDomMapping, input }
 * @returns {import('./code-fix-pipeline.js').CodeFixPipeline}
 */
/**
 * 🛡️ S1（2026-09-28 · (b) 切片一）：把每个 section 的 Figma 节点 id 作为 `data-section-id`
 * 注入其**子组件模板根元素**。
 *
 * 事实源：`input._indexTemplateFacts.sectionRoots`（确定性 index 装配透出，`[{id, component, type}]`）。
 * 仅在根元素**缺少**该属性时注入；无事实 / 解析失败 → 原样返回（fail-open，绝不破坏产物）。
 * 纯函数（不修改入参）；只加属性，**零视觉影响**，幂等（已有锚点则跳过）。
 *
 * @param {Object<string,string>} files path → content
 * @param {Object} input 生成上下文（读 `_indexTemplateFacts.sectionRoots`）
 * @returns {{files: Object<string,string>, injected: string[]}}
 */
export function injectSectionAnchorsIntoSubComponents(files, input = {}) {
  const result = { files, injected: [], evaluated: null };
  if (!files || typeof files !== 'object') return result;
  const roots = input?._indexTemplateFacts?.sectionRoots;
  if (!Array.isArray(roots) || roots.length === 0) {
    result.evaluated = { roots: 0, reason: 'no-sectionRoots' };
    return result;
  }
  // 🛡️ 2026-09-28 名字兜底：**complex 分支的 index 模板由 LLM 写**，其标签名（如 `ContentSection9`）
  //   与确定性 `sectionRoots[i].component`（如 `ContentSection`）**可能不一致** ⇒ 精确路径找不到文件
  //   ⇒ 整条规则静默跳过（实测两任务命中 0）。
  //   兜底顺序（确定性、不猜）：①精确路径 ②**唯一前缀匹配**（`ContentSection9.vue` ← `ContentSection`）
  //   ③**按序配对**（子组件文件数 == roots 数时按出现序对齐）。多义/数量不符 ⇒ 跳过并记录原因（fail-open）。
  const compFiles = Object.keys(files).filter((p) =>
    /^package\/components\/[^/]+\.vue$/.test(p),
  );
  const used = new Set();
  const resolvePath = (comp) => {
    const exact = `package/components/${comp}.vue`;
    if (typeof files[exact] === 'string' && files[exact]) return { path: exact, how: 'exact' };
    const pre = compFiles.filter(
      (p) => !used.has(p) && p.split('/').pop().replace(/\.vue$/, '').startsWith(comp),
    );
    if (pre.length === 1) return { path: pre[0], how: 'prefix-unique' };
    return null;
  };
  const orderFallback =
    compFiles.length === roots.length
      ? compFiles
      : null; /** 数量一致才允许按序兜底 */
  const next = { ...files };
  let matchedExact = 0;
  let matchedPrefix = 0;
  let matchedOrder = 0;
  const unmatched = [];
  for (let ri = 0; ri < roots.length; ri++) {
    const r = roots[ri];
    const comp = String(r?.component || '').trim();
    const id = String(r?.id || '').trim();
    if (!comp || !id) continue;
    let hit = resolvePath(comp);
    if (hit) {
      if (hit.how === 'exact') matchedExact += 1;
      else matchedPrefix += 1;
    } else if (orderFallback && typeof files[orderFallback[ri]] === 'string') {
      hit = { path: orderFallback[ri], how: 'order' };
      matchedOrder += 1;
    }
    if (!hit) {
      unmatched.push(comp);
      continue;
    }
    used.add(hit.path);
    const p = hit.path;
    const src = files[p];
    if (typeof src !== 'string' || !src) continue;
    // 只动 <template> 起始处的根元素（其后 4000 字符足够覆盖开标签）
    const tplIdx = src.indexOf('<template>');
    if (tplIdx < 0) continue;
    const winLen = 4000;
    const head = src.slice(tplIdx, tplIdx + winLen);
    const m = /<template>\s*<([A-Za-z][\w.-]*)((?:"[^"]*"|'[^']*'|[^>])*)>/s.exec(head);
    if (!m) continue;
    const openTag = m[0];
    if (/\bdata-section-id\s*=/.test(m[2] || '')) continue; // 幂等：已有锚点
    const nameEsc = m[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const injectedTag = openTag.replace(
      new RegExp(`^(<template>\\s*<${nameEsc})`),
      `$1 data-section-id="${id}"`,
    );
    if (injectedTag === openTag) continue;
    next[p] =
      src.slice(0, tplIdx) + head.replace(openTag, injectedTag) + src.slice(tplIdx + winLen);
    result.injected.push(`${p} ← ${id}`);
  }
  result.files = next;
  // 🛡️「已评估」统计（2026-09-28）：用于区分「规则没跑」与「跑了但没命中」——
  //   此前只有注入>0 才落日志，导致 0 命中时无法判断（实测两任务命中 0，靠推测）。
  result.evaluated = {
    roots: roots.length,
    compFiles: compFiles.length,
    matchedExact,
    matchedPrefix,
    matchedOrder,
    unmatched: unmatched.slice(0, 6),
    injected: result.injected.length,
  };
  return result;
}

/** S2 兜底块标记（幂等判据；同时便于事后审计这些产物是"被兜底救回的"）。 */
export const DEGENERATE_FALLBACK_CLASS = 'mc-truth-fallback';

/** 解析 declare.json → 已声明的业务键集合（与 PROP-BIND 门禁同口径，单一事实源）。 */
function declaredBusinessKeys(files) {
  const entry = Object.entries(files || {}).find(([p]) =>
    /(^|\/)declare\.json$/.test(String(p)),
  );
  if (!entry) return null; // 无 declare → 无法判定"未声明" → 整条规则 fail-open
  try {
    const dec = typeof entry[1] === 'string' ? JSON.parse(entry[1]) : entry[1];
    return new Set([
      ...Object.keys(dec?.businessConfig || {}),
      ...Object.keys(dec?.businessStatuses || {}),
      ...Object.keys(dec?.businessEvents || {}),
    ]);
  } catch {
    return null;
  }
}

/** 该 section 的 Figma 子树真值文案（视觉序：先 y 后 x；跳过 visible:false；去重）。 */
export function collectSectionTruthTexts(figmaNodeData, sectionId) {
  const root = figmaNodeData?.document || figmaNodeData;
  if (!root || !sectionId) return [];
  let target = null;
  const stack = [root];
  let seen = 0;
  while (stack.length && seen < 6000 && !target) {
    const n = stack.pop();
    seen += 1;
    if (!n || typeof n !== 'object') continue;
    if (String(n.id || '') === String(sectionId)) {
      target = n;
      break;
    }
    if (Array.isArray(n.children)) for (const c of n.children) if (c) stack.push(c);
  }
  if (!target) return [];
  const texts = [];
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (n.type === 'TEXT' && n.visible !== false && typeof n.characters === 'string') {
      const t = n.characters.replace(/\s+/g, ' ').trim();
      if (t) texts.push({ t, y: Number(n.absoluteBoundingBox?.y ?? 0), x: Number(n.absoluteBoundingBox?.x ?? 0) });
    }
    if (Array.isArray(n.children)) for (const c of n.children) walk(c);
  };
  walk(target);
  texts.sort((a, b) => (a.y - b.y) || (a.x - b.x));
  const out = [];
  for (const { t } of texts) if (!out.includes(t)) out.push(t);
  return out;
}

/**
 * 找根元素的闭合位置（返回 `</rootTag>` 的起始下标；-1 = 解析失败）。
 * 用**根标签同名深度计数**扫描（自闭合标签不计深度）；同名嵌套（如 div 套 div）可正确处理。
 */
function findRootCloseIndex(src, templateIdx, rootTag) {
  const seg = src.slice(templateIdx);
  const firstGt = seg.indexOf('>');
  if (firstGt < 0) return -1;
  const tagRe = /<\/?([A-Za-z][\w.-]*)((?:"[^"]*"|'[^']*'|[^>])*)>/g;
  // 从 <template> 的 `>` 之后开始扫 → 根元素的**开标签尚未计入**，故 depth 从 0 起算：
  //   根开标签 → 1，根闭标签 → 0（同名嵌套 div 套 div 亦正确）。
  tagRe.lastIndex = firstGt + 1;
  let depth = 0;
  let t;
  while ((t = tagRe.exec(seg))) {
    const isClose = t[0].startsWith('</');
    const selfClose = /\/\s*$/.test(t[2] || '');
    if (t[1] !== rootTag) continue;
    if (isClose) {
      depth -= 1;
      if (depth === 0) return templateIdx + t.index;
    } else if (!selfClose) {
      depth += 1;
    }
  }
  return -1;
}

/**
 * 🛡️ S2（2026-09-28 · (b) 切片二 · **窄触发**）：退化子组件模板的**确定性兜底**。
 *
 * 触发（必须同时满足，故正常产物**永不触发**）：
 *   ① 该子组件模板绑定了 `declare.json` **未声明**的 `businessProps.<key>`
 *      （＝运行期必然取不到值、该区块渲染为空；与 PROP-BIND 门禁同一确定性证据）；
 *   ② 其根元素带有 `data-section-id`（S1 注入）且该 section 的 Figma 子树**有真值文案**。
 * 动作：在根元素**末尾追加**一个无样式的真值文案块（`<span>` 序列，视觉序），
 *   **不改动 LLM 已写的任何 markup**（只追加），幂等（按 `DEGENERATE_FALLBACK_CLASS` 判据）。
 * 为什么不替换：子组件模板承载业务逻辑，替换 markup 有打坏正常部分的风险；
 *   而"空盒"场景下追加真值文案即可恢复可读内容，且样式沿用 section 继承（**不引入任何硬编码**）。
 * fail-open：无 declare / 无锚点 / 无真值 / 解析失败 → 一律原样返回。
 *
 * @returns {{files: Object<string,string>, healed: string[]}}
 */
export function healDegenerateSubComponentContent(files, figmaNodeData) {
  const out = { files, healed: [], scanned: 0, deadBindingCandidates: 0 };
  if (!files || typeof files !== 'object' || !figmaNodeData) return out;
  const declared = declaredBusinessKeys(files);
  if (!declared) return out;
  const next = { ...files };
  for (const [p, src] of Object.entries(files)) {
    if (!/^package\/components\/[^/]+\.vue$/.test(p) || typeof src !== 'string') continue;
    out.scanned += 1;
    if (src.includes(DEGENERATE_FALLBACK_CLASS)) continue; // 幂等
    let hasDeadBinding = false;
    for (const m of src.matchAll(/businessProps\.([A-Za-z_$][\w$]*)/g)) {
      if (!declared.has(m[1])) {
        hasDeadBinding = true;
        break;
      }
    }
    if (!hasDeadBinding) continue;
    out.deadBindingCandidates += 1;
    const secId = /data-section-id="([^"]+)"/.exec(src)?.[1];
    if (!secId) continue;
    const texts = collectSectionTruthTexts(figmaNodeData, secId);
    if (texts.length === 0) continue;
    const tplIdx = src.indexOf('<template>');
    if (tplIdx < 0) continue;
    const rootTag = /<template>\s*<([A-Za-z][\w.-]*)/.exec(src.slice(tplIdx, tplIdx + 4000))?.[1];
    if (!rootTag) continue;
    const closeIdx = findRootCloseIndex(src, tplIdx, rootTag);
    if (closeIdx < 0) continue;
    const block = `\n      <div class="${DEGENERATE_FALLBACK_CLASS}" data-section-id="${secId}">${texts
      .map((t) => `<span>${t}</span>`)
      .join('')}</div>\n    `;
    next[p] = src.slice(0, closeIdx) + block + src.slice(closeIdx);
    out.healed.push(`${p} ← ${secId}（${texts.length} 条真值）`);
  }
  out.files = next;
  return out;
}

export function registerBuiltinFixRules(pipeline, engineer, context = {}) {
  if (!pipeline || !engineer) return pipeline;
  const {
    componentName = '',
    outputPath = '',
    resourceDomMapping = null,
    figmaNodeData = null,
    input = {},
  } = context;
  // 🛡️ P1（2026-09-28）：统一事实上下文。CodeFixPipeline 传入的 `input` 是
  //   `{ subComponentPlan, generationInput }`（不含 `_indexTemplateFacts`）⇒ 各规则若各读各的
  //   input 就会得到「roots:0」而生成时的 S3 却看到「sectionRoots:N」的**矛盾**。
  //   单一事实源兜底顺序：显式 context → input → generationInput → engineer 实例上存的最后一份。
  const _indexTemplateFacts =
    context?._indexTemplateFacts ||
    input?._indexTemplateFacts ||
    input?.generationInput?._indexTemplateFacts ||
    engineer?._lastIndexTemplateFacts ||
    null;
  // 🛡️ 2026-09-29 哑火自检：S1 实测 roots:0 / factsSource:none，但生成时 S3 看到 sectionRoots:11 ⇒
  //   兜底链全空。这里落一行「哪条链命中 / 各来源是否存在」，把断点从「推测」变「直接读出」。
  if (engineer?.logger?.info) {
    engineer.logger.info('🧩 [facts] S1 事实兜底解析自检', {
      fromContext: !!(context?._indexTemplateFacts && context._indexTemplateFacts.sectionRoots?.length),
      fromInput: !!(input?._indexTemplateFacts?.sectionRoots?.length),
      fromGenerationInput: !!(input?.generationInput?._indexTemplateFacts?.sectionRoots?.length),
      fromEngineerInstance: !!(engineer?._lastIndexTemplateFacts?.sectionRoots?.length),
      resolvedRoots: _indexTemplateFacts?.sectionRoots?.length || 0,
      resolvedSource: _indexTemplateFacts?.source || 'none',
    });
  }
  // 🛡️ COMP-001 前置自愈（ensure-section-assembly）所需的子组件规划。
  // 来源优先级：显式 context.componentPlan > input.subComponentPlan（graph 直传）> generationInput.componentPlan（裁决事实）。
  const componentPlan =
    context.componentPlan ||
    input?.subComponentPlan ||
    input?.generationInput?.componentPlan ||
    null;

  // S1：把 figmaNodeData 并入 pipeline.context，使各规则 fix(content, ctx) 能拿到 ctx.figmaNodeData
  if (figmaNodeData && pipeline && pipeline.context) {
    pipeline.context = { ...pipeline.context, figmaNodeData };
  }
  // S1'：A4→CSS 确定性落点（2026-09-04）：section 根类 → Figma 高度 px 映射，
  // 供 fix-section-heights 规则② 把 height:100%/盲注 flex:1 1 0 改写为 flex: <px> 1 0。
  if (context.sectionHeights && pipeline && pipeline.context) {
    pipeline.context = {
      ...pipeline.context,
      sectionHeights: context.sectionHeights,
    };
  }
  // 🛡️ R1-2（2026-09-11）：布局事实数据流 —— 把 rootLayoutFacts 并入 pipeline.context，
  // 🛡️ 批次 3 loop 3a（2026-09-14）：sectionLayoutFacts 同路并入（display/grid 列数/方向），
  // 供 fix-section-heights 规则⑤ 确定性写出布局 block（取代 healGridContainer/ensureGridDisplay 的猜测修补）。
  // 供 fix-section-heights 规则② 以「事实 rootContainerClass」作豁免依据（退役命名枚举）。
  if (context.rootLayoutFacts && pipeline && pipeline.context) {
    pipeline.context = {
      ...pipeline.context,
      rootLayoutFacts: context.rootLayoutFacts,
    };
  }
  // 🛡️ 批次 3 loop 3a：section 根类 → 布局事实（display/gridColumns/flexDirection/flexGrow）
  if (context.sectionLayoutFacts && pipeline && pipeline.context) {
    pipeline.context = {
      ...pipeline.context,
      sectionLayoutFacts: context.sectionLayoutFacts,
    };
  }

  // ════════ 阶段 1：清洗（CLEAN）——永远最先 ════════
  pipeline.register({
    id: 'strip-trailing-garbage',
    name: '剥离闭合标签之后的说明性文本',
    phase: FIX_PHASE.CLEAN,
    // 🛡️ #2 升级（mc-max-1787920512973 实锤，2026-08-28）：先走统一工具
    // stripLlmTailGarbage（.vue/.less/.css 结构闭合点后确定性截断，覆盖「围栏+说明」
    // 与无围栏纯说明两种尾巴），再交给既有 _stripTrailingGarbageAfterLastBlock 兜底
    // （覆盖 prose 启发式场景）。两者幂等，叠加执行结果一致。
    fix: (content, ctx) => {
      const stripped = stripLlmTailGarbage(ctx.path, content);
      const afterUnified = stripped.stripped ? stripped.content : content;
      return engineer._stripTrailingGarbageAfterLastBlock(afterUnified, ctx.path);
    },
  });
  pipeline.register({
    id: 'strip-inter-block-prose',
    name: '剥离块间说明性文本',
    phase: FIX_PHASE.CLEAN,
    applyTo: VUE,
    fix: (content, ctx) => engineer._stripInterBlockProse(content, ctx.path),
  });

  // ════════ 阶段 2：结构（STRUCTURE）════════
  pipeline.register({
    id: 'orphan-jsdoc',
    name: '孤儿 JSDoc 行修复',
    phase: FIX_PHASE.STRUCTURE,
    applyTo: VUE,
    fix: (content) => engineer._fixOrphanJsdocInVue(content),
  });
  pipeline.register({
    id: 'collapse-double-c-prefix-vue',
    name: '坍缩 .vue 双 c- 前缀',
    phase: FIX_PHASE.STRUCTURE,
    applyTo: VUE,
    fix: (content) => engineer._collapseDoubleCPrefixInVue(content),
  });
  pipeline.register({
    id: 'collapse-double-c-prefix-less',
    name: '坍缩 .less/.css 双 c- 前缀',
    phase: FIX_PHASE.STRUCTURE,
    applyTo: STYLE,
    fix: (content) => engineer._collapseDoubleCPrefixInLess(content),
  });
  pipeline.register({
    id: 'quote-bare-object-keys',
    name: '对象字面量裸键补引号',
    phase: FIX_PHASE.STRUCTURE,
    applyTo: VUE,
    fix: (content) => engineer._quoteBareObjectKeysInVue(content),
  });
  // 🛡️ 治本 E（2026-09-10）：v-if 与 v-for 同元素 → v-if 折叠进 v-for 数据源（filter 改写，DOM 不变）。
  // 治本对象：env 样本 SubT.vue 同元素共存导致 runtime `Cannot read properties of undefined`。
  // 统一编号中心：RUNTIME-STATIC-002（预防 RUNTIME-009/010），见 validators/runtime-static-rules.js。
  pipeline.register({
    id: 'VUE-VIF-VFOR-001',
    name: 'v-if/v-for 同元素拆分（Vue3 铁律）',
    phase: FIX_PHASE.STRUCTURE,
    applyTo: VUE,
    fix: (content) => engineer._stripVIfOnVFor(content),
  });

  // ════════ 阶段 3：命名（NAMING）════════
  // 依赖实例 ID（从 componentName / outputPath 派生，不再依赖已被改写过的 componentName 变量）
  pipeline.register({
    id: 'strip-instance-id-prefix',
    name: '剥离内部 class 的实例 ID 前缀',
    phase: FIX_PHASE.NAMING,
    applyTo: /\.(vue|less|css)$/i,
    fix: (content) => {
      // 🛡️ 内容驱动提取实例 ID（根治 componentName/outputPath 未携带 ID 时整段 no-op 的根因）
      const instanceId =
        _extractInstanceIdFromContent(content) ||
        engineer._getInstanceId(componentName, outputPath);
      return instanceId
        ? engineer._stripInstanceIdPrefix(content, instanceId)
        : content;
    },
  });
  pipeline.register({
    id: 'ensure-root-instance-id',
    name: '根容器注入实例 ID 类',
    phase: FIX_PHASE.NAMING,
    applyTo: /(^|\/)package\/index\.vue$/i,
    fix: (content) => {
      // 🛡️ 内容驱动提取实例 ID（同上根因修复）
      const instanceId =
        _extractInstanceIdFromContent(content) ||
        engineer._getInstanceId(componentName, outputPath);
      return instanceId
        ? engineer._ensureRootInstanceId(content, `c-${instanceId}`)
        : content;
    },
  });

  // ════════ 阶段 4：资源（RESOURCE）——跨文件 ════════
  if (resourceDomMapping && resourceDomMapping.length > 0) {
    // 🛡️ 删减法批次 2（2026-09-14）：计划驱动挂载单规则，替代旧 auto-mount-backgrounds /
    //   auto-mount-icons 双规则（关键词猜测 + 根回退）。owner 由 section 归属 + figma 祖先链
    //   确定，同图单变量；fail-closed 诊断。与 engineer 门禁前调用同一 helper，幂等。
    pipeline.register({
      id: 'planned-resource-mount',
      name: '计划驱动资源挂载',
      phase: FIX_PHASE.RESOURCE,
      enabled: () => process.env.RESOURCE_PLANNED_MOUNT !== 'false',
      fixFiles: (files) => {
        const sections =
          componentPlan?.effectiveSections ||
          input?.generationInput?.componentPlan?.effectiveSections ||
          [];
        const r = engineer._mountPlannedResources(files, sections, resourceDomMapping, {
          ...input,
          figmaNodeData: figmaNodeData || input?.figmaNodeData || null,
        });
        // 🛡️ 2026-09-28 契约修复：原为 `return r.mounted` —— 返回的是「挂载记录数组」，
        //   而 CodeFixPipeline 的 fixFiles 契约要求返回 `Object<string,string>` 文件集
        //   （code-fix-pipeline.js:162 契约守卫）⇒ **本规则的全部修复被静默丢弃**：
        //   实测日志 `[CodeFixPipeline] 文件集规则返回了数组，契约要求 Object<string,string>（本次修复被丢弃）: planned-resource-mount`
        //   ⇒ 计划驱动的资源挂载（背景/图标）从未真正生效 —— 这是「背景/资源丢失」一族的重要成因。
        //   helper 返回 `{ files, mounted, ... }`，故应取 `.files`；异常兜底返回原文件集（不破坏产物）。
        return r && r.files ? r.files : files;
      },
    });
    pipeline.register({
      id: 'normalize-style-less-vars',
      name: '样式 Less 变量归一化',
      phase: FIX_PHASE.RESOURCE,
      // 🛡️ 2026-09-28 契约修复（同 planned-resource-mount）：helper 返回 `{ files, changes, ... }`，
      //   直接 return 整个对象 ⇒ 契约守卫判非文件集 ⇒ 修复被静默丢弃
      //   （实测日志：`文件集规则返回了数组，契约要求 Object<string,string>（本次修复被丢弃）: normalize-style-less-vars`
      //    —— 该 helper 内部在无变更时可能返回数组，故这里统一取 `.files` 并兜底回原文件集）。
      fixFiles: (files) => {
        const r = engineer._normalizeStyleLessVars(files, resourceDomMapping);
        if (r && r.files && typeof r.files === 'object') return r.files;
        return files;
      },
    });
    pipeline.register({
      id: 'strip-baked-decoration',
      name: '静态资源承载元素剥离烘焙装饰',
      phase: FIX_PHASE.RESOURCE,
      // 🛡️ P1-1（2026-08-30，mc-max-1788065970150 像素实锤）：icon/bg/img 导出 PNG 时
      //    fills/strokes/effects/cornerRadius 已烘焙进像素，代码层再写 border/border-radius/
      //    box-shadow/linear-gradient 就是二次还原（tab-active-bg 白边 + 4px 臆造圆角）。
      //    刻意排在 dedupe-bg-multi-refs **之前**：此时错误挂载还在，能一并剥掉其装饰；
      //    等去重把 url() 删了就再也识别不出承载关系了。
      enabled: () => process.env.STRIP_BAKED_DECORATION !== 'false',
      fixFiles: (files) =>
        stripBakedDecorationFromFiles(files, resourceDomMapping),
    });
    pipeline.register({
      id: 'dedupe-bg-multi-refs',
      name: 'bg 整块背景多引用去重',
      phase: FIX_PHASE.RESOURCE,
      // 🛡️ P2-3 阶段一（2026-08-30）：同一整块背景挂多个容器 → 保留 mountTarget 匹配度最高处，
      // 其余剔除；去重后仍 >1 由 CODE-017 硬 BLOCK 兜底（阶段二）。
      fixFiles: (files) =>
        engineer._dedupeBgMultiRefs(files, resourceDomMapping),
    });
  }

  // ════════ 阶段 5：样式（STYLE）════════
  pipeline.register({
    id: 'normalize-style-resource-urls',
    name: '样式内资源 url 相对路径规范化',
    phase: FIX_PHASE.STYLE,
    applyTo: /\.(vue|less|css)$/i,
    // 🛡️ R4（2026-08-30，mc-max-1788065970150 实锤）：模型与我们自己的整块背景兜底
    //    都把资源写成 `url(../resources/images/xxx.png)`——这个路径只有在 package/index.vue
    //    里才对。落到 resources/styles/common.less 就变成 resources/resources/images/…（404），
    //    落到 resources/styles/themes/*.less 更是错两级。背景「写了却完全不显示」。
    //    相对路径是 100% 可推导的机械事实，不该交给模型猜，写盘前确定性重写。
    fix: (content, ctx) => normalizeStyleResourceUrls(content, ctx?.path || '', context.resourceDomMapping),
  });
  // 🗑️ 'fix-background-image-size' 规则 —— 已删除（2026-09-29 删减法）。
  //   它无条件把 `backgroundSize/background-size: 'Xpx Ypx'` 改成 `cover`，与
  //   `inferBackgroundStyle` 给局部背景层输出的「px 尺寸 + 相对 parentBox 偏移」真值方向相反；
  //   全语料审计 2768 个 .vue|.less 中命中 14 处，**14/14 全是几何真值**（B 类 0 例）。
  //   详见 ai-engine/utils/post-process.js 顶部墓碑注释。
  pipeline.register({
    id: 'clamp-oversize-min-height',
    name: 'min-height 超根容器高截断',
    phase: FIX_PHASE.STYLE,
    // 🛡️ 尺寸联动（mc-max-1787923972602 实锤）：min-height 300 > 根高 186 → 撑爆布局。
    fixFiles: (files) => engineer._clampOversizeMinHeight(files),
  });
  pipeline.register({
    id: 'unwrap-theme-scoped-common-less',
    name: '剥离 common.less 主题外壳',
    phase: FIX_PHASE.STYLE,
    applyTo: /common\.less$/i,
    // 🛡️ #3（mc-max-1787927914106 第 1 轮 STYLE-001 实锤，2026-08-29）：
    // 模型把业务 class 整体包进 .dark { ... } / .light { ... }，编译成 .dark .c-xxx
    // 在宿主真实 DOM（不注入主题类）上 0 命中。写盘前确定性剥壳，杜绝 STYLE-001 BLOCK。
    fix: (content) => {
      const r = engineer._unwrapThemeScopedCommonLess(content);
      return r.changed ? r.source : content;
    },
  });
  pipeline.register({
    id: 'ensure-index-vue-style-import',
    name: '主组件样式 import 保障',
    phase: FIX_PHASE.STYLE,
    applyTo: /(^|\/)package\/index\.vue$/i,
    fix: (content) => engineer._ensureIndexVueStyleImport(content),
  });
  pipeline.register({
    id: 'ensure-sub-component-style-import',
    name: '子组件样式 import 保障',
    phase: FIX_PHASE.STYLE,
    applyTo: /package\/components\/.*\.vue$/i,
    fix: (content) => {
      let out = engineer._ensureSubComponentStyleAttrs(content);
      out = engineer._ensureSubComponentStyleImport(out);
      return out;
    },
  });
  // 🛡️ N4 中性化（2026-08-31，原 microcode-engineer:5084 / vue3-engineer:1462 双端内联）：
  //    根容器尺寸中性锚定迁入 STYLE 规则。旧实现写死 px（违反 root-container.md 规范）、
  //    lazy 正则跨具名插槽误检（9168ed08 diamond 事故）、px 锚定被后续轮次覆盖拉锯
  //    （862c6b29）。中性化：不覆盖已有尺寸，缺则补 100%，注入 aspect-ratio 真值比例，
  //    panelBg 沿用 R7 剥离再注入。纯函数实现，不依赖 engineer 实例（vue3 端可直接注册，
  //    防 vue3-engineer:796 悬挂引用前车之鉴）。缺 figmaNodeData 时 no-op
  //    （generation-context.js createFixPipeline 第三入口安全）。
  if (figmaNodeData) {
    pipeline.register({
      id: 'anchor-root-container',
      name: '根容器尺寸中性锚定（aspect-ratio 语义）',
      phase: FIX_PHASE.STYLE,
      fixFiles: (files) =>
        anchorRootContainerInFiles(files, {
          figmaNodeData,
          resourceDomMapping,
          logger: pipeline.logger,
        }),
    });
  }

  // ════════ 阶段 6：精修（POLISH）════════
  pipeline.register({
    id: 'ensure-header-slots',
    name: '头部插槽结构保障',
    phase: FIX_PHASE.POLISH,
    applyTo: VUE,
    fix: (content, ctx) =>
      input && Object.keys(input).length > 0
        ? engineer._ensureHeaderSlots(content, input, ctx?.files)
        : content,
  });
  pipeline.register({
    id: 'strip-base-panel-shell-leak',
    name: '剥离 base-panel 外壳泄漏',
    phase: FIX_PHASE.POLISH,
    applyTo: VUE,
    fix: (content) => engineer._stripBasePanelShellLeak(content),
  });
  pipeline.register({
    id: 'ensure-sub-component-import',
    name: '子组件 import 接线',
    phase: FIX_PHASE.POLISH,
    applyTo: /(^|\/)package\/index\.vue$/i,
    fix: (content) => engineer._ensureSubComponentImport(content),
  });
  // 放在最后：需等文件集完全确定后，才能判定哪些 import 指向不存在的文件
  pipeline.register({
    id: 'prune-dangling-sub-component-imports',
    name: '剥离指向不存在文件的子组件 import',
    phase: FIX_PHASE.POLISH,
    fixFiles: (files) =>
      engineer._pruneDanglingSubComponentImports(files),
  });
  // 🛡️ COMP-001 前置自愈（2026-09-02）：确定性组装缺失的 section 子组件。
  // 事故 mc-max-1788306635802（流量监测）：LLM 生成 5 子组件但 index.vue 只组装 1 个，
  // 门禁+重试 3 轮不收敛。此处确定性注入 import + <Comp/>，保证所有规划模块至少被渲染，
  // COMP-001 门禁做兜底（自愈后仍缺失才 BLOCK）。须在 prune 之后（注入的都是存在文件的组件，不被误删）。
  if (componentPlan && componentPlan.isForced) {
    pipeline.register({
      id: 'ensure-section-assembly',
      name: '强制组装缺失的 section 子组件',
      phase: FIX_PHASE.POLISH,
      fixFiles: (files) =>
        ensureSectionAssembly(files, componentPlan, pipeline.logger),
    });
  }

  // 竖排文字兜底：拿 Figma 真值判定竖向排版，缺 writing-mode 则补
  // 依赖 engineer._verticalTextDetector（由调用方注入检测器函数）
  if (figmaNodeData) {
    pipeline.register({
      id: 'ensure-vertical-text-writing-mode',
      name: '竖排文字补 writing-mode',
      phase: FIX_PHASE.POLISH,
      fixFiles: (files) =>
        engineer._ensureVerticalTextWritingMode(files, figmaNodeData),
    });
    // 🛡️ TEXT-TRUTH 确定性自愈（2026-09-03，mc-max-1788413658506 实锤）：
    // Figma TEXT 节点 2:8816（t-南北接线 设备）同时具备 rotation=π/2、两行文本
    // （"南北接线\n设备"）、艺术字体 YouSheBiaoTiHei → 预览图上是竖排旋转艺术字 →
    // vision OCR 稳定误读「接」字（拦/拓/…每次不同）。错误文字进 visual.json 后 LLM 照抄，
    // 门禁正确 BLOCK，但重试仍基于同一份错误 vision 结果 → 必然重复失败 → 重试耗尽。
    // 已知 from→to 映射（findClosestTruth）后，字符串替换是确定性的、零幻觉的，
    // 不需要让 LLM 再盲猜一次。放在 fix-text-sibling-order 之前：先修正文字再重排顺序。
    pipeline.register({
      id: 'fix-text-truth',
      name: 'OCR 误读文字按 Figma 真值确定性替换',
      phase: FIX_PHASE.POLISH,
      applyTo: VUE,
      fix: (content, ctx) => {
        try {
          const unknown = detectUnknownText([{ path: ctx.path, content }], figmaNodeData);
          const replacable = unknown.filter((u) => u.suggest);
          if (replacable.length === 0) return content;
          let out = content;
          const applied = [];
          for (const { text, suggest } of replacable) {
            // 真值可能含换行（Figma 两行文本）。模板内联文本里塞真实换行会破坏标签结构，
            // 归一为空格；isCoveredByTruth 有空白归一化，空格形态同样能通过门禁。
            const to = String(suggest).replace(/\s*\n\s*/g, ' ').trim();
            if (!to || to === text) continue;
            const before = out;
            out = out.split(text).join(to);
            if (out !== before) applied.push(`${text}→${to}`);
          }
          if (applied.length && pipeline.logger) {
            pipeline.logger.info(`🎯 [mc] 文字真值自愈: ${applied.join('；')}`);
          }
          return out;
        } catch (e) {
          // 自愈失败不阻断（保留给 L0-B 门禁按重试路径处理）
          pipeline.logger?.warn?.('文字真值自愈失败（非阻断）', { error: e?.message });
          return content;
        }
      },
    });
    // 🔴 共享表「同名类语义冲突」去冗余（2026-09-29，mc-max-1790655877133-02ab668d 实锤）：
    //   必须排在 prune-duplicate-style-decls **之前**。
    //   prune-duplicate-style-decls 的哲学是「共享表 = 唯一真值，剥掉子组件的重复声明」，
    //   但当**共享表本身是错的一方**时它只会把错值锁死：实测 `.c-traffic-monitor-chart`
    //   在 4 个子组件里语义不同（CardGrid/CardGrid13/ContentSection6 是 52×52 环形图容器，
    //   ChartChart 是占满宽度的柱状图容器 width:100%），共享表取了 52px；prune 先跑会把
    //   ChartChart 的 width:100% 剥掉，剩 `min-width:0;min-height:127px` → width 恒为 52px
    //   （柱状图只占 52px：真机 puppeteer 实测 52×150，对照图 411×150）。
    //   本规则先跑：把共享表里「所有使用方都自带、且互相冲突」的属性删掉，让各子组件
    //   以自己的 scoped 声明为准（各归各位）；此后 prune 的共享表已无该属性 → 不再误剥。
    //   实测（全语料 505 个组件）：命中 59 个、共 137 条删除，其余逐条打印「已评估·未处理」。
    //   细节见 utils/shared-class-deconflict.js。
    pipeline.register({
      id: 'deconflict-shared-class-decls',
      name: '共享样式表同名类语义冲突去冗余',
      phase: FIX_PHASE.POLISH,
      fixFiles: (files) => {
        try {
          const r = deconflictSharedClassDecls(files);
          if (r.changes.length && pipeline.logger) {
            pipeline.logger.info(
              `🎯 [mc] 共享表同名类冲突去冗余: ${r.changes.length} 处 → ${r.changes.join('；')}`,
            );
          }
          return r.files;
        } catch (e) {
          pipeline.logger?.warn?.('共享表同名类冲突去冗余失败（非阻断）', { error: e?.message });
          return files;
        }
      },
    });
    // 🛡️ 样式重复声明剥离（2026-09-03，mc-1788415227440 实锤）：
    // 子组件 <style scoped> 把共享样式表（common.less）里已有的 class 又写一遍，
    // 属性优先级 (0,2,0) 恒胜 common.less (0,1,0) → 共享表的定宽/高度真值变成死样式。
    // 实锤：common.less 正确写 width:160px，子组件又写 width:100% 覆盖 → 侧边栏撑满，
    // 且触发 FLEX-003 BLOCK。只归一 flex 不够（width 才是元凶），故按「同名 class +
    // 同名布局属性」通用剥离，保留子组件独有属性（如 min-height）。细节见 style-dedup-guard.js。
    // 🔴 刀 13-C（2026-09-13）：本规则的 fixFiles 收到的是**对象 map**（Object<string,string>，
    //    见 code-fix-pipeline.js 的 apply 契约）。此前 pruneDuplicateStyleDecls 只认数组形态，
    //    导致本规则静默失效（FLEX-003 真机 0 命中）。现已由 utils/file-collection.js 归一并
    //    **形态跟随**（对象 map 进 → 对象 map 出），本处按契约原样返回 r.files 即可。
    pipeline.register({
      id: 'prune-duplicate-style-decls',
      name: '剥离子组件与共享样式表重复的布局声明',
      phase: FIX_PHASE.POLISH,
      fixFiles: (files) => {
        try {
          const r = pruneDuplicateStyleDecls(files);
          if (r.changes.length && pipeline.logger) {
            pipeline.logger.info(
              `🎯 [mc] 样式重复声明剥离: ${r.changes.length} 处 → ${r.changes.join('；')}`,
            );
          }
          return r.files;
        } catch (e) {
          pipeline.logger?.warn?.('样式重复声明剥离失败（非阻断）', { error: e?.message });
          return files;
        }
      },
    });
    // 🛡️ P-01/P-07/P-10 背景空壳治理 + P-09 状态切换装配（2026-09-17 · 2bfeaac7 实锤）：
    //   engineer 主路径（execute 后处理段）只覆盖「首轮生成」；L0-B 重试轮走
    //   CodeFixPipeline 路径时这些治理从未执行 → tab 背景消失/切换交互缺失在
    //   重试轮复发。统一注册进 POLISH 阶段（幂等，与主路径重复执行结果一致）。
    pipeline.register({
      id: 'collapse-background-shell-divs',
      name: '背景空壳/wrapper 治理（P-01/P-07/P-10）',
      phase: FIX_PHASE.POLISH,
      fix: (content, ctx) => {
        if (!ctx || !/\.vue$/i.test(ctx.path || '')) return content;
        try {
          return collapseBackgroundShellDivs(content);
        } catch (e) {
          pipeline.logger?.warn?.('背景空壳治理失败（非阻断）', { error: e?.message, file: ctx.path });
          return content;
        }
      },
    });
    pipeline.register({
      id: 'inject-state-switch-interaction',
      name: '双状态卡切换交互装配（P-09）',
      phase: FIX_PHASE.POLISH,
      fixFiles: (files) => {
        try {
          const r = injectStateSwitchInteraction(files, resourceDomMapping);
          if (r.applied && pipeline.logger) {
            pipeline.logger.info(
              `🎯 [mc] 双状态卡切换交互已装配（P-09，pipeline 路径）：active=${r.details.active} default=${r.details.default}`,
            );
          }
          return { ...files }; // 原地更新 + 新对象返回（契约）
        } catch (e) {
          pipeline.logger?.warn?.('P-09 装配失败（非阻断）', { error: e?.message });
          return files;
        }
      },
    });
    // 🛡️ P-11 per-character 分段着色（双路径覆盖：L0-B 重试走 CodeFixPipeline，
    //    engineer 主路径的治理在此**不会**执行，必须同步注册，否则重试轮颜色又丢）。
    //    真值源 = figmaNodeData（prune 后已保留 characterStyleOverrides/styleOverrideTable）。
    pipeline.register({
      id: 'inject-per-char-text-segments',
      name: 'per-character 分段着色装配（P-11）',
      phase: FIX_PHASE.POLISH,
      fixFiles: (files) => {
        try {
          const truth = extractPerCharTextTruth(figmaNodeData);
          if (truth.length === 0) return files;
          const r = injectPerCharTextSegments(files, truth);
          if (r.applied && pipeline.logger) {
            pipeline.logger.info(
              `🎯 [mc] per-character 分段着色已装配（P-11，pipeline 路径）：` +
                `${(r.details.files || []).join(', ')} | abnormal=${r.details.abnormalColor}`,
            );
          }
          return { ...files };
        } catch (e) {
          pipeline.logger?.warn?.('P-11 装配失败（非阻断）', { error: e?.message });
          return files;
        }
      },
    });
    // 🛡️ TEXT-001（2026-09-01）：文本兄弟顺序按 Figma 视觉坐标重排。
    // 事故 mc-max-1788251680480-98c9140b：tabs 数组按 children 序而非视觉 x 序，
    // 文案全对只有顺序错，全部存在性门禁放行（盲区）。事实源 utils/text-order-guard.js，
    // 无法安全重排的漂移保留给 code-structure-validator TEXT-001 BLOCK 门禁。
    pipeline.register({
      id: 'fix-text-sibling-order',
      name: '文本兄弟顺序按视觉坐标重排',
      phase: FIX_PHASE.POLISH,
      fixFiles: (files) => engineer._fixTextSiblingOrder(files, figmaNodeData),
    });
    // 🛡️ S1（2026-09-28 · (b) 切片一）：子组件模板根节点注入 `data-section-id`。
    // 背景：子组件模板由 LLM 整文件即兴写（无任何确定性装配），**根节点普遍没有 section 锚点** ——
    //   全语料审计 1084/1200（90%）缺失。缺锚点导致两件事都做不了：
    //     ① 逐 section 的真值/事实校验（如 TEXT-COVERAGE 的 section 级档、以及后续任何 section 级下发）；
    //     ② `resource-mounter` 按 `[data-section-id="…"]` 精确命中 DOM —— 叶子资源的挂载会落空
    //        （该理由与当初给「容器 div」补 data-section-id 完全一致）。
    // 事实源：确定性 index 装配透出的 `sectionRoots = [{id, component, type}]`（唯一事实源，来自 effectiveSections）。
    // 安全性：只在**缺失**时补；解析/事实不可得一律跳过（fail-open）；纯属性注入，**零视觉影响**。
    pipeline.register({
      id: 'inject-section-anchors',
      name: '子组件模板注入 data-section-id 锚点（S1）',
      phase: FIX_PHASE.POLISH,
      // ⚠️ 契约（code-fix-pipeline.js:162）：fixFiles **必须返回 Object<string,string> 文件集**，
      //    故这里取 `.files`；注入明细在本闭包里落日志（返回非 map 会被契约守卫判为无效规则）。
      fixFiles: (files) => {
        const r = injectSectionAnchorsIntoSubComponents(files, { ...input, _indexTemplateFacts });
        // 🛡️「已评估」日志（2026-09-28）：无论注入多少都落一行，明确区分
        //   「规则没跑 / 跑了但没命中 / 命中了多少」，避免再靠推测排查。
        if (r.evaluated && engineer?.logger?.info) {
          engineer.logger.info('🛡️ S1 锚点注入·已评估', {
            ...r.evaluated,
            factsSource: _indexTemplateFacts?.source || 'none',
          });
        }
        return r.files;
      },
    });
    // 🛡️ S2（2026-09-28 · (b) 切片二 · **窄触发**）：退化子组件模板的确定性兜底。
    // 与 PROP-BIND 门禁同一确定性证据（绑定未声明的 businessProps ⇒ 必然空渲染），
    // 把「BLOCK + 让 LLM 重试」降级为「确定性自愈一次」；**正常产物永不触发**。
    // ⚠️ 顺序必须在 S1 之后（依赖其注入的 data-section-id 定位 section 真值）。
    pipeline.register({
      id: 'heal-degenerate-subcomponent-content',
      name: '退化子组件模板真值文案兜底（S2 窄触发）',
      phase: FIX_PHASE.POLISH,
      fixFiles: (files) => {
        const r = healDegenerateSubComponentContent(files, figmaNodeData);
        if (engineer?.logger?.info) {
          engineer.logger.info('🛡️ S2 退化子组件兜底·已评估', {
            scanned: r.scanned,
            deadBindingCandidates: r.deadBindingCandidates,
            healed: r.healed.length,
            samples: r.healed.slice(0, 3),
          });
        }
        return r.files;
      },
    });
    // 🛡️ P-12 防御性治理规则（2026-09-18）
    // 背景：c-env-monitor-a27a33f7 TabSwitcher 布局错乱 + c-device-monitor-7de62721 颜色错误
    // 根因：LLM 产出结构性错误（动态 class 无样式、容器缺 flex、资源绑定层级错误、颜色真值提取失败）
    // 规则：
    //   P-12a validate-dynamic-class-styles：扫描模板中所有 class 名，与 style 选择器交叉比对，缺失的补空规则
    //   P-12c validate-resource-binding-level：检测 backgroundImage 绑定位置，与 Figma 节点树对比，层级不匹配时警告
    //   ⚠️ P-12b `ensure-flex-layout-for-siblings` 已于 2026-09-28 删除（§七 B16/C4）：
    //      与 `css-sanitizer#ensureFlexDisplay`（Fix1，零硬编码）+ `resource-mounter` 规则⑤
    //      （按 Figma `selectorChildCounts`）职责重复；其判据是「相邻标签即父子」错误启发式，
    //      且注入硬编码 `align-items:center` + `gap:4px`（污染真实间距）→ 按删减法收敛。
    //   P-12d extract-node-level-color-truth：提取每个 TEXT 节点的颜色真值（默认 fill + per-char 覆盖色）
    pipeline.register({
      id: 'validate-dynamic-class-styles',
      name: '动态 class 样式校验（P-12a）',
      phase: FIX_PHASE.POLISH,
      fix: (content, ctx) => {
        if (!ctx || !/\.vue$/i.test(ctx.path || '')) return content;
        try {
          return validateDynamicClassStyles(content);
        } catch (e) {
          pipeline.logger?.warn?.('P-12a 动态 class 样式校验失败（非阻断）', { error: e?.message, file: ctx.path });
          return content;
        }
      },
    });
    // 🛡️ 缺口 2（2026-09-21 · c-device-monitor-4bc13256/c22ff970 实锤）：
    //   曾有规则会往「已有 grid-template-* 的规则」灌 display:flex → grid 属性被浏览器忽略，
    //   12 卡挤成一行。冲突时以 grid 为准。P-12b 已于 2026-09-28 删除（§七 B16），本规则
    //   保留为**兜底守卫**（防 Fix1 `ensureFlexDisplay` 在极少数「grid + flex 子属性」并存时灌 flex）。
    pipeline.register({
      id: 'ensure-grid-display-prefer-grid',
      name: '冲突 CSS 以 grid 为准（缺口 2）',
      phase: FIX_PHASE.POLISH,
      fix: (content, ctx) => {
        if (!ctx) return content;
        const path = ctx.path || '';
        try {
          if (/\.vue$/i.test(path)) return ensureGridDisplayInVueSfc(content, pipeline.logger);
          if (STYLE.test(path)) return ensureGridDisplay(content, pipeline.logger);
          return content;
        } catch (e) {
          pipeline.logger?.warn?.('缺口 2 ensureGridDisplay 失败（非阻断）', { error: e?.message, file: path });
          return content;
        }
      },
    });
    pipeline.register({
      id: 'validate-resource-binding-level',
      name: '资源绑定层级校验（P-12c）',
      phase: FIX_PHASE.POLISH,
      fix: (content, ctx) => {
        if (!ctx || !/\.vue$/i.test(ctx.path || '')) return content;
        try {
          return validateResourceBindingLevel(content, resourceDomMapping);
        } catch (e) {
          pipeline.logger?.warn?.('P-12c 资源绑定层级校验失败（非阻断）', { error: e?.message, file: ctx.path });
          return content;
        }
      },
    });
    pipeline.register({
      id: 'extract-node-level-color-truth',
      name: '节点级颜色真值提取（P-12d）',
      phase: FIX_PHASE.POLISH,
      fixFiles: (files) => {
        try {
          const colorTruth = extractNodeLevelColorTruth(figmaNodeData);
          if (colorTruth.length === 0) return files;
          const r = injectNodeLevelColorTruth(files, colorTruth);
          if (r.applied && pipeline.logger) {
            pipeline.logger.info(
              `🎯 [mc] 节点级颜色真值已注入（P-12d，pipeline 路径）：` +
                `${(r.details.files || []).join(', ')} | nodes=${r.details.nodeCount}`,
            );
          }
          return { ...files };
        } catch (e) {
          pipeline.logger?.warn?.('P-12d 节点级颜色真值注入失败（非阻断）', { error: e?.message });
          return files;
        }
      },
    });
    // 🛡️ A②-1 CSS 变量名契约归一（2026-09-29 · c-traffic-monitor-209472ff 实锤）
    //   契约唯一出处 = frontend/src/core/microcode/utils.js#getCssVarsConfig：
    //     注入名 = '--' + css-vars 键名【原样拼接，不做 kebab 转换】
    //   ⇒ `var(--colorPrimary)` 命中；`var(--color-primary)` **永不命中**、静默回落
    //   LLM 自己写的 fallback ⇒ 表现为「颜色/字重不对，且不随主题切换」。
    //   全语料 467 产物离线审计（367 目录 / 29,497 条 `var()` 引用）：
    //     名合法 25,679（87.1%）· kebab 可确定归一 464（1.6%）· 归一后仍无定义 3,354（11.4%）
    //   kebab TOP 全是框架预设键的 kebab 写法（--color-primary / --color-text-base /
    //   --color-success / --color-danger / --font-weight-strong）。
    //   本任务 `var(--color-primary, #00cccc)` 即此形态：激活 tab 真值 #ffffff、
    //   链接真值 #1990ff，实际全渲染为 fallback #00cccc（青）。
    //   fail-closed（仅当归一后名字确实存在于该产物 css-vars 键集合时才替换）；
    //   排在 POLISH 末位，使前面各规则新产生的样式也一并归一。幂等。
    pipeline.register({
      id: 'normalize-css-var-names',
      name: 'CSS 变量名契约归一（kebab→camel）',
      phase: FIX_PHASE.POLISH,
      fixFiles: (files) => {
        try {
          const r = normalizeCssVarNames(files);
          if (r.applied) {
            pipeline.logger?.info?.(
              `🎯 [mc] CSS 变量名契约已归一（kebab→camel）：${(r.details.files || []).join(', ')} ` +
                `| ${(r.details.renamed || []).map((x) => `${x.from}→${x.to}×${x.count}`).join('；')}`,
            );
          }
          return r.applied ? { ...files } : files;
        } catch (e) {
          pipeline.logger?.warn?.('CSS 变量名契约归一失败（非阻断）', { error: e?.message });
          return files;
        }
      },
    });

    // 🛡️ 防止子组件 width:100% 覆盖父级 flex 比例（2026-09-21）
    // 背景：c-device-monitor-70b93a3d tabs 宽度异常，父组件用 flex: 0.3/0.7 控制宽度，
    // 但子组件根元素设置 width: 100% 覆盖了 flex 比例。
    // 修复：移除子组件根元素的 width: 100%，让父级 flex 比例生效。
    pipeline.register({
      id: 'remove-subcomponent-width-override',
      name: '移除子组件 width:100% 覆盖（防 flex 比例失效）',
      phase: FIX_PHASE.STYLE,
      fixFiles: (files) => {
        try {
          return removeSubComponentWidthOverride(files);
        } catch (e) {
          pipeline.logger?.warn?.('子组件 width:100% 移除失败（非阻断）', { error: e?.message });
          return files;
        }
      },
    });
  }

  // ════════ S1（P1/P2 还原率提升，2026-08-29）════════
  // 主修复在 prompt 侧（chart-standards.md 轴标签红线 / ai-generation-constraints.md 7.6 禁止臆造控件），
  // 以下为确定性兜底安全网：单条失败由 CodeFixPipeline 捕获跳过，不影响主流程。
  pipeline.register({
    id: 'inject-echarts-axis-ticks',
    name: 'echarts 坐标轴刻度标签保活',
    phase: FIX_PHASE.STYLE,
    applyTo: VUE,
    fix: (content) => engineer._injectEchartsAxisTicks(content),
  });
  pipeline.register({
    id: 'strip-orphan-controls',
    name: '剥离臆造交互控件',
    phase: FIX_PHASE.POLISH,
    applyTo: VUE,
    fix: (content, ctx) => engineer._stripOrphanControls(content, ctx),
  });

  // 🛡️ 治本 F1（2026-09-10）：`calc(var(--x, var(--x)) * n)` 默认值自引用双写无意义
  // （ConsSection.vue:127 实测 `var(--fontSize, var(--fontSize))`）。改写为保留首个回退值：
  // `calc(var(--x, DEF) * n)`，把第二个 `var(--x)` 还原为合理默认值（缺失时用 14px）。
  // 纯正则，离线可验证；单条失败由 CodeFixPipeline 捕获跳过。
  // 统一编号中心：RUNTIME-STATIC-003（预防 RUNTIME-005 尺寸塌陷），见 validators/runtime-static-rules.js。
  pipeline.register({
    id: 'CSS-CALC-SELFREF-001',
    name: 'calc 默认值自引用去掉双写',
    phase: FIX_PHASE.STYLE,
    applyTo: /\.(vue|less|css)$/i,
    fix: (content) => {
      if (typeof content !== 'string') return content;
      // 匹配 `calc(var(--x, var(--x)) * n)`：首个 var 双写自身默认值
      const re = /calc\(\s*var\(\s*(--[\w-]+)\s*,\s*var\(\s*\1\s*\)\s*\)(\s*\*[^(]+\))/g;
      let changed = false;
      const out = content.replace(re, (_m, name, tail) => {
        changed = true;
        // 改写为保留首个回退值（缺失时给 14px），乘数部分原样保留
        return `calc(var(${name}, 14px)${tail}`;
      });
      return changed ? out : content;
    },
  });

  // ════════ S1-P3（多区块高度按比例分配，治本，2026-08-29）════════
  // 确定性兜底：section 根节点误用 height:100% 导致多区块叠加溢出、仅显示首块。
  // 主修复在 prompt（layoutMetadata 注入 px 高度 + 约束红线），此为离线安全网，
  // 把 section 根 `height:100%` → `flex: <px> 1 0; min-height: 0`（无 px 数据时等比例 flex:1 1 0）。
  pipeline.register({
    id: 'fix-section-heights',
    name: '多区块高度按比例分配（防溢出裁剪）',
    phase: FIX_PHASE.STYLE,
    // 🛡️ 覆盖 .vue + .less/.css：flex-grow 臆造值/height:100% section 根 两处都可能出现
    // （mc-max-1788003319188-c32142f3 实锤：子组件 <style scoped> 与 common.less 都有 flex:180）。
    applyTo: /\.(vue|less|css)$/i,
    fix: (content, ctx) => engineer._fixSectionHeights(content, ctx),
  });

  return pipeline;
}

/** 已纳入统一编排的规则 id 清单（便于核对迁移进度与回滚） */
export const BUILTIN_RULE_IDS = [
  'strip-trailing-garbage',
  'strip-inter-block-prose',
  'orphan-jsdoc',
  'collapse-double-c-prefix-vue',
  'collapse-double-c-prefix-less',
  'quote-bare-object-keys',
  'strip-instance-id-prefix',
  'ensure-root-instance-id',
  'auto-mount-backgrounds',
  'auto-mount-icons',
  'normalize-style-less-vars',
  'ensure-index-vue-style-import',
  'ensure-sub-component-style-import',
  'ensure-header-slots',
  'strip-base-panel-shell-leak',
  'ensure-sub-component-import',
  'prune-dangling-sub-component-imports',
  'ensure-vertical-text-writing-mode',
  'fix-text-truth',
  'prune-duplicate-style-decls',
  'fix-text-sibling-order',
  'inject-echarts-axis-ticks',
  'strip-orphan-controls',
  'fix-section-heights',
  'anchor-root-container',
  'collapse-background-shell-divs',
  'inject-state-switch-interaction',
  'validate-dynamic-class-styles',
  'validate-resource-binding-level',
  'extract-node-level-color-truth',
  'remove-subcomponent-width-override',
];

export default { registerBuiltinFixRules, BUILTIN_RULE_IDS };
