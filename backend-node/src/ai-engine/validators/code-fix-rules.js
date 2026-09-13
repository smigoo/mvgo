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
import { extractSfcTemplateRegion } from '../utils/sfc-template-extractor.js';

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
      if (!/(^|[\s;{])aspect-ratio\s*:/.test(nb) && (!hasWidth || !hasHeight)) {
        injections.push(`  aspect-ratio: ${W} / ${H};`);
      }
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
      `🎯 根容器中性锚定: .${rootCls}（Figma ${W}×${H}，aspect-ratio 注入${panelBg ? ' + 面板背景 R7' : ''}）`,
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
 * 只处理规则体的**直属**声明（嵌套子块整段原样拷贝，子块会作为独立规则单独处理）。
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
export function registerBuiltinFixRules(pipeline, engineer, context = {}) {
  if (!pipeline || !engineer) return pipeline;
  const {
    componentName = '',
    outputPath = '',
    resourceDomMapping = null,
    figmaNodeData = null,
    input = {},
  } = context;
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
  // 供 fix-section-heights 规则② 以「事实 rootContainerClass」作豁免依据（退役命名枚举）。
  if (context.rootLayoutFacts && pipeline && pipeline.context) {
    pipeline.context = {
      ...pipeline.context,
      rootLayoutFacts: context.rootLayoutFacts,
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
    pipeline.register({
      id: 'auto-mount-backgrounds',
      name: '未使用背景自动挂载',
      phase: FIX_PHASE.RESOURCE,
      enabled: () => process.env.BG_AUTO_MOUNT !== 'false',
      fixFiles: (files) =>
        engineer._autoMountUnusedBackgrounds(files, resourceDomMapping),
    });
    pipeline.register({
      id: 'auto-mount-icons',
      name: '未使用图标自动挂载',
      phase: FIX_PHASE.RESOURCE,
      enabled: () => process.env.ICON_AUTO_MOUNT !== 'false',
      fixFiles: (files) =>
        engineer._autoMountUnusedIcons(files, resourceDomMapping),
    });
    pipeline.register({
      id: 'normalize-style-less-vars',
      name: '样式 Less 变量归一化',
      phase: FIX_PHASE.RESOURCE,
      fixFiles: (files) =>
        engineer._normalizeStyleLessVars(files, resourceDomMapping),
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
  pipeline.register({
    id: 'fix-background-image-size',
    name: '背景图尺寸修正',
    phase: FIX_PHASE.STYLE,
    applyTo: /\.(vue|less|css)$/i,
    fix: (content) => engineer._fixBackgroundImageSize(content),
  });
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
  'fix-background-image-size',
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
];

export default { registerBuiltinFixRules, BUILTIN_RULE_IDS };
