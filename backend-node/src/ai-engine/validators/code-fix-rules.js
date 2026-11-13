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
import {
  rebindInternalChildDeadProps,
} from './cross-component-contract-heal.js';
// 🛡️ S4：tab 段识别用内联判定（禁止 import component-acceptance——会造成循环依赖：
//   component-acceptance 反向 import 本文件的 DEGENERATE_FALLBACK_CLASS）。
import { ensureSectionAssembly } from '../utils/section-coverage-guard.js';
import { detectUnknownText } from '../utils/text-truth-guard.js';
import { pruneDuplicateStyleDecls } from '../utils/style-dedup-guard.js';
import { deconflictSharedClassDecls } from '../utils/shared-class-deconflict.js';
import {
  collapseBackgroundShellDivs,
  injectStateSwitchInteraction,
  extractPerCharTextTruth,
  injectPerCharTextSegments,
  validateResourceBindingLevel,
  extractNodeLevelColorTruth,
  injectNodeLevelColorTruth,
} from '../utils/post-process.js';
import { normalizeCssVarNames } from '../utils/css-var-contract.js';
import { collectCardGroups, collectCardBgByOwner } from '../utils/card-background-truth.js';
import { sizeFromScaleMode } from '../utils/background-size-inference.js';
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
  // 🛡️ R3-legacy（2026-11-06）：面板背景的 size/repeat 不再写死 `100% 100% / no-repeat`。
  // `sizeFromScaleMode` 有 Figma 真值就按真值（FILL→cover / FIT→contain /
  // STRETCH→100% 100% / TILE→auto+repeat），缺失则回落旧的中性默认（逐字零回归）。
  // 此前无条件铺满会把「保形填充」的设计意图拉成变形，与合并精修的 F3 产出不一致。
  const panelBgStyle = panelBg ? sizeFromScaleMode(panelBg) : null;
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
        const bgSize = panelBgStyle?.size || '100% 100%';
        const bgRepeat = panelBgStyle?.repeat || 'no-repeat';
        injections.push(`  background-image: url('${prefix}${bgFileName}');`);
        injections.push(`  background-size: ${bgSize};`);
        injections.push(`  background-repeat: ${bgRepeat};`);
        // cover/contain 天然居中；repeat 平铺以左上为原点（Figma TILE 语义）⇒ 两者都不写 position。
        if (bgSize !== 'cover' && bgSize !== 'contain' && bgRepeat !== 'repeat') {
          injections.push('  background-position: center;');
        }
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
      `🎯 根容器中性锚定: .${rootCls}（Figma ${W}×${H}，width/height 100% 补齐${
        panelBg
          ? ` + 面板背景 R7${
              panelBgStyle ? `（scaleMode=${panelBg.imageScaleMode}→${panelBgStyle.size}）` : '（无 scaleMode 真值→100% 100%）'
            }`
          : ''
      }）`,
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
 * 🛡️ 2026-11-05 装饰层祖先承载（docs/2026-11-05-四任务样式各异根因修复方案.md §3.4）
 *
 * 背景：`723d52c3` 的资源在 `<img :src="icon2" class="…-action-icon">`，而
 * `common.less` 的 border/background/border-radius 写在父 `<div class="…-action-btn">`。
 * 旧实现只收资源标签自身 class，`_clsMatches` 只认全等 / `-` 后缀 ⇒ 父容器恒不命中，
 * `stripBakedDecorationFromFiles` 形同空转。
 *
 * 修法：把「直接子元素是资源位图 `<img>`、且其间无文本」的**直接父容器** class
 * 并入 carriers。判据只认 DOM 结构（标签语义 / 父子 / 兄弟数 / 文本），
 * **不认类名前缀、不认组件名、不认任务 id**；多兄弟父容器不入 carriers。
 * 🔴 收紧（定向回归实锤）：带 `:style` 背景图的 `<div>` 是 CSS 背景承载、由既有 ①
 * 模板信号自己收，**不触发父容器推定**；否则 tab-item 的 border-radius 会被误剥。
 * 用配平标签栈而非正则解析（门禁反面教材：正则在第一个内层闭合处截断）。
 */
const VOID_TAGS = new Set([
  'img', 'br', 'hr', 'input', 'meta', 'link', 'source', 'area',
  'base', 'col', 'embed', 'param', 'track', 'wbr',
]);

function _scanTemplateTags(body) {
  const events = [];
  const s = String(body || '');
  let i = 0;
  let lastEnd = 0;
  while (i < s.length) {
    if (s[i] !== '<') { i += 1; continue; }
    const textChunk = s.slice(lastEnd, i);
    if (textChunk.trim()) events.push({ type: 'text', text: textChunk });
    let j = i + 1;
    let quote = '';
    while (j < s.length) {
      const ch = s[j];
      if (quote) { if (ch === quote) quote = ''; }
      else if (ch === '"' || ch === "'" || ch === '`') quote = ch;
      else if (ch === '>') break;
      j += 1;
    }
    if (j >= s.length) break;
    const raw = s.slice(i, j + 1);
    i = j + 1;
    lastEnd = i;
    if (/^<!--/.test(raw) || /^<[!?]/.test(raw)) continue;
    const closeM = /^<\/\s*([\w-]+)\s*>/i.exec(raw);
    if (closeM) {
      events.push({ type: 'close', tag: closeM[1].toLowerCase() });
      continue;
    }
    const openM = /^<\s*([\w-]+)/.exec(raw);
    if (!openM) continue;
    const tag = openM[1].toLowerCase();
    events.push({
      type: 'open',
      tag,
      raw,
      self: /\/\s*>$/.test(raw) || VOID_TAGS.has(tag),
    });
  }
  if (lastEnd < s.length && s.slice(lastEnd).trim()) {
    events.push({ type: 'text', text: s.slice(lastEnd) });
  }
  return events;
}

export function collectAncestorCarrierClasses(body, varNames) {
  const out = new Set();
  const hostRe = [];
  for (const v of varNames || []) {
    const esc = String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    hostRe.push(new RegExp(`url\\(\\s*\\$\\{\\s*${esc}\\s*\\}\\s*\\)`));
    hostRe.push(new RegExp(`['"]\\s*\\+\\s*${esc}\\s*\\+\\s*['"]`));
    hostRe.push(new RegExp(`:src\\s*=\\s*["']\\s*${esc}\\s*["']`));
  }
  if (hostRe.length === 0) return out;
  const isResourceTag = (raw) => hostRe.some((re) => re.test(raw));
  const stack = [];

  for (const ev of _scanTemplateTags(body)) {
    if (ev.type === 'text') {
      if (stack.length) stack[stack.length - 1].textLen += ev.text.trim().length;
      continue;
    }
    if (ev.type === 'close') {
      let idx = -1;
      for (let k = stack.length - 1; k >= 0; k -= 1) {
        if (stack[k].tag === ev.tag) { idx = k; break; }
      }
      if (idx < 0) continue;
      const closed = stack.splice(idx);
      for (let k = closed.length - 1; k >= 0; k -= 1) {
        const item = closed[k];
        // 🔴 判据收紧（定向回归实锤）：只认「直接子元素就是资源位图宿主」的父容器，
        //   不认「子树里含资源」。否则 `<div class="tab-item"><div :style="url(bg3)">`
        //   会被误判承载，把既有 spec 要求保留的 border-radius 剥掉。
        if (item.childTags === 1 && item.textLen === 0 && item.directChildIsHost && item.cls) {
          for (const tok of item.cls.split(/[\s,]+/)) {
            const t = tok.trim();
            if (_isPlausibleClass(t)) out.add(t.toLowerCase());
          }
        }
      }
      continue;
    }
    if (stack.length) stack[stack.length - 1].childTags += 1;
    const cm = /\bclass\s*=\s*["']([^"']*)["']/.exec(ev.raw);
    const item = {
      tag: ev.tag,
      cls: cm ? cm[1].trim().toLowerCase() : '',
      childTags: 0,
      textLen: 0,
      // 「资源位图宿主」按 HTML 语义限定为 <img>：带 :style 背景图的 div 是 CSS
      // 背景承载，由既有 ① 模板信号自己收，不触发父容器承载推定。
      isHost: ev.tag === 'img' && isResourceTag(ev.raw),
      directChildIsHost: false,
    };
    if (ev.self) {
      const parent = stack[stack.length - 1];
      if (parent && item.isHost) parent.directChildIsHost = true;
    } else {
      stack.push(item);
    }
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
    const tagRe = /<([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>/'"])*)>/g;
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
    // 🛡️ 2026-11-05 §3.4：补「唯一子元素是资源宿主」的直接父容器（纯结构判据，
    //   不认类名前缀）。与上方 ① 同用 stripSlots 后的 body，避免具名插槽截断。
    for (const cls of collectAncestorCarrierClasses(body, varNames)) carriers.add(cls);
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
    const m = /<template>\s*<([A-Za-z][\w.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/s.exec(head);
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
  const tagRe = /<\/?([A-Za-z][\w.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
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

/**
 * 🛡️ S3（2026-11-11 · docs/2026-11-11-S3S4判据驱动确定性兜底方案.md）：E3-v4 背景归属
 * **确定性补挂**。90e4e5e7 实锤：硬约束配方进了 chunk prompt（:4970 逐字含 id+尺寸），
 * LLM 仍选择性执行——建了区块但没写 data-section-id 属性、bg 仍挂祖先 ⇒ 复检拦截 failed。
 * 指令类修复已到天花板 ⇒ 把 hardConstraints 的挂载配方由管线直接落地：
 *   ① 归属容器不存在 ⇒ 注入带真值尺寸+backgroundImage 的 div（插到该资源变量已消费的
 *      容器内部，保持视觉层级）；
 *   ② 归属容器存在但未消费该 bg ⇒ 在其开标签补 backgroundImage 绑定（幂等合并）；
 *   ③ bg 挂在非归属段 ⇒ 从错挂处移除（挪回归属，防双挂/拉伸）。
 * 数据源：resourceDomMapping（targetDomSelector/figmaBox/ownerSectionId 真值）——与
 * acceptance E3-v4 判据**独立实现**（改验分离：判据不改，补挂后复检自然 PASS）。
 * 幂等：容器 bg 已含该资源名 ⇒ 跳过。计数行恒打（0 也打）。
 *
 * @param {Object<string,string>} files
 * @param {Array|null} resourceDomMapping
 * @returns {{files: Object<string,string>, stats: Object}}
 */
export function backstopMountBgOwnership(files, resourceDomMapping) {
  const stats = {
    scanned: 0,
    missingContainerInjected: 0,
    containerTagged: 0,
    movedFromAncestor: 0,
    skippedAlreadyMounted: 0,
    noVarConsumer: 0,
    // 2026-11-12 新增（真机计数行可观测性：S3 默认启用后必须能看出「为什么没动」）
    importInjected: 0,
    skippedDataDriven: 0,
    skippedNonObjectStyle: 0,
  };
  const out = { ...files };
  if (!files || typeof files !== 'object' || !Array.isArray(resourceDomMapping)) {
    return { files: out, stats };
  }
  const entries = Object.entries(files).filter(
    ([p, c]) => /\.vue$/i.test(p) && typeof c === 'string',
  );
  // varName → { file, importLine }（该资源 import 的落点；改验分离：判据侧同逻辑独立实现）
  const varByFile = new Map();
  for (const [p, code] of entries) {
    for (const m of code.matchAll(
      /import\s+(\w+)\s+from\s+['"][^'"]*\/images\/([\w.\u4e00-\u9fa5-]+\.png)['"]/g,
    )) {
      if (!varByFile.has(m[2])) varByFile.set(m[2], { file: p, varName: m[1] });
    }
  }
  // 🛡️ 改验分离·自实现 E3-v4 v4「数据驱动消费」等价判定（与判据侧同语义、独立实现；
  //   语义：varName 在 <script> 中被某个 `const 容器 = …` 引用，且**容器名**在 <template> 可达）。
  //   用途：判据把该形态列为**独立合规形态**并放行（component-acceptance/index.js:646）⇒
  //   修侧必须同样跳过，否则补挂出第二份背景块（S3 由「默认关闭」恢复启用后的首要风险）。
  const isDataDrivenConsumedLocal = (code, varName) => {
    const tplM = String(code).match(/<template>([\s\S]*?)<\/template>/i);
    const srcM = String(code).match(/<script[^>]*>([\s\S]*?)<\/script>/i);
    if (!tplM || !srcM) return false;
    const tpl = tplM[1];
    const src = srcM[1];
    const escape = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const decls = [];
    for (const m of src.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=/g)) {
      decls.push({ name: m[1], idx: m.index ?? 0 });
    }
    if (decls.length === 0) return false;
    const tokRe = new RegExp(`\\b${escape(varName)}\\b`, 'g');
    for (const hit of src.matchAll(tokRe)) {
      const at = hit.index ?? 0;
      let owner = null;
      for (const d of decls) if (d.idx < at) owner = d;
      if (!owner) continue;
      if (new RegExp(`\\b${escape(owner.name)}\\b`).test(tpl)) return true;
    }
    return false;
  };
  for (const r of resourceDomMapping) {
    if (r?.previewAnalysisRole !== 'bg' || r?.downloadStatus !== 'success') continue;
    stats.scanned += 1;
    const fname = String(r.resourceFile || '').split('/').pop();
    if (!fname) continue;
    const wantId = String(r.ownerSectionId || '');
    if (!wantId) continue;
    let varInfo = varByFile.get(fname);
    if (!varInfo) {
      // 🛡️ S3-b（2026-11-11 · de2d9836 实锤 noVarConsumer=18/20）：无 import ⇒ **自动补
      //   import + 注入容器**（原 fail-open 跳过会让 E2-v3/E3-v4 病根无解）。落点选择
      //   （确定性）：①mapping.targetDomSelector 的 id 已存在于某文件 ⇒ 落该文件；
      //   ②ownerSectionId 同上；③都无 ⇒ index.vue 兜底（根容器必有）。变量名唯一化。
      const anchorId = String(
        (r.targetDomSelector || '').match(/data-section-id="([^"]+)"/)?.[1] ||
          wantId,
      );
      let targetFile = null;
      for (const [p, c] of entries) {
        if (typeof c === 'string' && c.includes(`data-section-id="${anchorId}"`)) {
          targetFile = p;
          break;
        }
      }
      if (!targetFile) {
        for (const [p, c] of entries) {
          if (typeof c === 'string' && c.includes(`data-section-id="${wantId}"`)) {
            targetFile = p;
            break;
          }
        }
      }
      if (!targetFile) {
        targetFile =
          Object.keys(out).find((p) => /(^|\/)index\.vue$/.test(p)) || null;
      }
      if (!targetFile || typeof out[targetFile] !== 'string') {
        stats.noVarConsumer += 1;
        continue;
      }
      // 唯一变量名（防与既有 import 冲突）
      const baseName =
        'bg' +
        (fname.replace(/\.png$/i, '').replace(/[^\w]/g, '').slice(-8) || 'X');
      let newVar = baseName;
      let suffix = 1;
      while (new RegExp(`\\b${newVar}\\b`).test(out[targetFile])) {
        newVar = `${baseName}${suffix++}`;
      }
      const importLine = `import ${newVar} from '../../resources/images/${fname}'`;
      const hostCode = out[targetFile];
      const insM = /(<script[^>]*>\n?)/.exec(hostCode);
      if (!insM) {
        stats.noVarConsumer += 1;
        continue;
      }
      out[targetFile] = hostCode.replace(insM[1], `${insM[1]}${importLine}\n`);
      varByFile.set(fname, { file: targetFile, varName: newVar });
      stats.importInjected = (stats.importInjected || 0) + 1;
      // 🛡️ S3-b：重新读取补 import 后的落点（下方主循环统一用 varInfo）
      varInfo = varByFile.get(fname);
      // 落到既有主循环（容器判定/注入）——不 continue
    }
    const hostSrc = out[varInfo?.file];
    if (typeof hostSrc !== 'string') continue;

    // 🛡️ 统一前置闸（2026-11-12 · S3 恢复默认启用后的首要风险闸）：已处**数据驱动消费态**
    //   ⇒ 跳过注入/补绑（防造第二份背景块）。
    if (isDataDrivenConsumedLocal(hostSrc, varInfo.varName)) {
      stats.skippedDataDriven += 1;
      continue;
    }

    // ① 归属容器存在性：精确匹配 `data-section-id="wantId"` 的开标签
    const tagRe = new RegExp(
      `<([A-Za-z][\\w.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?data-section-id="${wantId.replace(
        /[.*+?^${}()|[\\]\\\\]/g,
        '\\$&',
      )}"(?:"[^"]*"|'[^']*'|[^>"'])*?)>`,
    );
    const ownerTag = tagRe.exec(hostSrc);

    if (ownerTag) {
      const whole = ownerTag[0];
      // 幂等：该容器已消费该资源（变量名出现在标签内）
      if (whole.includes(varInfo.varName)) {
        stats.skippedAlreadyMounted += 1;
        continue;
      }
      // ② 存在但未消费 → 挂 **Vue 动态绑定** `:style="{ backgroundImage: 'url(' + var + ')' }"`。
      //   🔴 2026-11-12 治本（5afb401f 缺陷①）：静态 style 是纯字符串，**变量名不解析**
      //   ⇒ 原写法 `background-image:url('bg1')` 是字面量路径，浏览器 404 ⇒ 背景恒不显示。
      //   （幂等态样本 `:style="{ backgroundImage: 'url(' + bg1 + ')' }"` 即既定正确形态。）
      if (/background(-image)?\s*[=:]/.test(whole)) {
        stats.skippedAlreadyMounted += 1;
        continue;
      }
      const dynDecl = `backgroundImage: 'url(' + ${varInfo.varName} + ')', backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat'`;
      let finalTag;
      if (/(\s:style="\{)/.test(whole)) {
        // 已有动态对象绑定：并入对象首部（同属性后者胜 ⇒ 前插使 LLM 自身声明优先）
        finalTag = whole.replace(/(\s:style="\{\s*)/, `$1${dynDecl}, `);
      } else if (/(\s:style=")/.test(whole)) {
        // 已有动态**非对象**绑定（如 :style="styleObj"）：形态不确定，不硬改（防破坏既有样式）
        stats.skippedNonObjectStyle += 1;
        continue;
      } else {
        // 无 :style（含仅有静态 style）⇒ 在标签名后新建动态绑定（与静态 style 可共存）
        finalTag = whole.replace(
          /<([A-Za-z][\w.-]*)/,
          `$1 :style="{ ${dynDecl} }"`,
        );
      }
      out[varInfo.file] = hostSrc.replace(whole, finalTag);
      stats.containerTagged += 1;
      continue;
    }

    // ①' 归属容器不存在 → 注入承载 div（尺寸走静态 style，背景走动态绑定）
    //   🔴 2026-11-12 治本（5afb401f 缺陷①② ＋ 本轮新发现缺陷③）：
    //   ① 背景必须 `:style` 动态绑定——静态 style 里变量名是字面量、不解析 ⇒ 恒 404 不显示；
    //   ② 插入点必须是「varName 消费元素的**开标签之内**」（注入 div 成为其子元素）——原
    //      「引用所在行行尾」常落在父级/兄弟位置 ⇒ 注入 div 变错位方块破坏布局（5afb401f 实锤）；
    //   ③ 原 `hostSrc.slice(0, tplIdx + insertAt)` 与 insertAt 的**绝对坐标重复叠加 tplIdx**
    //      （仅当 `<template>` 位于文件首、tplIdx===0 时才凑巧正确）⇒ 现统一用绝对坐标。
    const dynDecl = `backgroundImage: 'url(' + ${varInfo.varName} + ')', backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat'`;
    const injectDiv = `<div data-section-id="${wantId}" style="width:${Math.round(
      r.figmaBox?.width || 0,
    )}px;height:${Math.round(r.figmaBox?.height || 0)}px;" :style="{ ${dynDecl} }"></div>`;
    const tplIdx = hostSrc.indexOf('<template>');
    if (tplIdx < 0) continue;
    const closeIdx = hostSrc.lastIndexOf('</template>');
    if (closeIdx < 0) continue;
    // ⚠️ tplBody 只取 **template 内容**（不含 `<template>` 自身标签）：原写法
    //   `slice(tplIdx, closeIdx)` 把开标签也括进来 ⇒ 兜底的 `indexOf('<')` 命中 `<template>`
    //   的尖括号 ⇒ 插入点落在 `<template>` 之后 = **根容器之外**，又是一个错位方块（本节实测）。
    const gt0 = hostSrc.indexOf('>', tplIdx);
    const bodyStart = gt0 >= 0 ? gt0 + 1 : tplIdx;
    const tplBody = hostSrc.slice(bodyStart, closeIdx);
    // 插入点（绝对坐标）：varName 消费元素的开标签之后 ⇒ 注入 div 落在其内部（层级归属由此确定）
    const useIdx = tplBody.lastIndexOf(varInfo.varName);
    let atAbs = -1;
    if (useIdx >= 0) {
      const gt = tplBody.indexOf('>', useIdx);
      if (gt >= 0) atAbs = bodyStart + gt + 1;
    }
    if (atAbs < 0) {
      // 兜底：根内容容器开标签之后（无消费点可依时的近似解）
      const lt = tplBody.indexOf('<');
      const gt = lt >= 0 ? tplBody.indexOf('>', lt) : -1;
      atAbs = gt >= 0 ? bodyStart + gt + 1 : closeIdx;
    }
    out[varInfo.file] =
      hostSrc.slice(0, atAbs) + '\n' + injectDiv + hostSrc.slice(atAbs);
    stats.missingContainerInjected += 1;
  }
  // ③ 错挂清理：归属容器已补挂后，其它段开标签上同资源的 bg 声明移除（防双挂/拉伸）。
  //   只处理「补挂/补绑定成功」的条目；无 var 消费的条目没有归属事实，不动。
  //   ⚠️ 2026-11-12 修（缺陷⑦）：同一 fname 可被**多个归属段共用**（真机：bg-3475.png 被
  //   2:3474 / 2:3524 两条 mapping 共用，同变量 bgbg3475）。原实现只豁免「当前 wantId」，
  //   ⇒ 兄弟归属段的注入 div 会被当「祖先错挂」互相剥离 ⇒ 两侧 backgroundImage 全丢。
  //   改为按变量名收集**全部**合法归属段 id，在负向前瞻中一并豁免。
  const legitIdsByVar = new Map(); // varName -> Set<sectionId>
  for (const r of resourceDomMapping) {
    if (r?.previewAnalysisRole !== 'bg' || r?.downloadStatus !== 'success') continue;
    const f = String(r.resourceFile || '').split('/').pop();
    const v = varByFile.get(f);
    const sid = String(r.ownerSectionId || '');
    if (!v || !sid) continue;
    if (!legitIdsByVar.has(v.varName)) legitIdsByVar.set(v.varName, new Set());
    legitIdsByVar.get(v.varName).add(sid);
  }
  for (const r of resourceDomMapping) {
    if (r?.previewAnalysisRole !== 'bg' || r?.downloadStatus !== 'success') continue;
    const fname = String(r.resourceFile || '').split('/').pop();
    const wantId = String(r.ownerSectionId || '');
    const varInfo = varByFile.get(fname);
    if (!varInfo || !wantId) continue;
    const hostSrc = out[varInfo.file];
    if (typeof hostSrc !== 'string') continue;
    for (const [p, code] of entries) {
      if (typeof out[p] !== 'string') continue;
      const cur = out[p];
      // 找含 varName 且 data-section-id ≠ wantId 的开标签 → 剥其 backgroundImage 声明
      //   ⚠️ 2026-11-12 修：原尾部 `[^>]*?)` 是**惰性**且其后无锚点 ⇒ 正则最短匹配，只取到
      //   `data-section-id="` 就收尾，`open.includes(varName)` 恒为假 ⇒ ③错挂清理**从未生效过**
      //   （潜伏死码）。改贪心 `[^>]*`（`[^>]` 不跨 `>`，仍精确停在开标签末尾）。
      const exclIds = [...(legitIdsByVar.get(varInfo.varName) || new Set([wantId]))].map((s) =>
        s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      );
      const offenderRe = new RegExp(
        `(<[A-Za-z][\\w.-]*(?:"[^"]*"|'[^']*'|[^>"'])*?data-section-id="(?!${exclIds.join(
          '|',
        )}")[^>]*)`,
        'g',
      );
      // ⚠️ 2026-11-12 修（缺陷⑥）：原用 `open.includes(varName)` 纯子串匹配 ⇒ 短变量名会命中
      //   长变量名内部（`bg3` ⊂ `bgbg3475`，真机实测）⇒ 误剥无关元素的背景。改词边界。
      const varWordRe = new RegExp(
        `\\b${varInfo.varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
      );
      let changed = false;
      const nextCode = cur.replace(offenderRe, (open) => {
        if (!varWordRe.test(open)) return open;
        const escRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const escFname = escRe(fname);
        const escVar = escRe(varInfo.varName);
        let stripped = open;
        // 形态 A：静态 CSS 写法 `background-image: url('../../resources/images/x.png')`
        stripped = stripped.replace(
          new RegExp(
            `(\\s(?::?)style="[^"]*?)background(?:-image)?\\s*:\\s*url\\([^)]*${escFname}[^)]*\\);?`,
          ),
          '$1',
        );
        // 形态 B（2026-11-12 新增）：Vue 对象绑定 `backgroundImage: 'url(' + var + ')'` /
        //   ``backgroundImage: `url(${var})` ``。旧正则只认带连字符的 `background-image`
        //   ⇒ 动态形态的**祖先错挂永远清不掉**（双挂残留 ⇒ 视觉仍被拉伸铺满）。
        stripped = stripped.replace(
          new RegExp(
            `(\\s(?::?)style="[^"]*?)backgroundImage\\s*:\\s*(?:'url\\('\\s*\\+\\s*${escVar}\\s*\\+\\s*'\\)'|\`url\\(\\$\\{${escVar}\\}\\)\`)\\s*,?`,
            'g',
          ),
          '$1',
        );
        if (stripped !== open) {
          // 剥空后的属性残留清理（` :style="{ }"` 之类空壳属性）
          stripped = stripped
            .replace(/\s:style="\{\s*,?\s*\}"/g, '')
            .replace(/\sstyle="\{\s*,?\s*\}"/g, '');
          changed = true;
          stats.movedFromAncestor += 1;
        }
        return stripped;
      });
      if (changed) out[p] = nextCode;
    }
  }
  return { files: out, stats };
}

/**
 * 🛡️ S4（2026-11-11 · docs/2026-11-11-S3S4判据驱动确定性兜底方案.md）：G1-v2 tab 交互
 * **确定性注入**。真值 tab 段承载文件无 @click ⇒ LLM 又没照做（90e4e5e7/1d7ac90d 双实锤）
 * ⇒ 注入 Mc 前缀标准三件套（activeMcTab / handleMcTabSwitch / tab 项 class 绑定）。
 * LLM 已有 tab 状态（/tabs|activeTab|tabIndex/）时只补容器 @click 接线到既有函数（不重复造状态）。
 * 幂等：容器已有 @click ⇒ 跳过。计数行恒打。
 *
 * @param {Object<string,string>} files
 * @param {object} figmaNodeData
 * @param {Function} identifyTabSections (node) => [{id}]  真值 tab 段识别（与 G1-v2 同源判定）
 * @returns {{files: Object<string,string>, stats: Object}}
 */
export function injectTabInteractivity(files, figmaNodeData, identifyTabSections) {
  const stats = {
    scanned: 0,
    injected: 0,
    wiredExisting: 0,
    skippedHasClick: 0,
    noCarrier: 0,
    blockInjected: 0,
    // 🛡️ S4-d：整块注入降级为最后手段的两个计数（既有 tab 状态被复用 / 因已有状态而跳过）
    anchoredExisting: 0,
    skippedExistingState: 0,
    // 🛡️ S4-e（2026-11-11 · c-vehicle-monitor-4cf5135f 实锤）：tab 状态在**其他文件**（如
    //   header 插槽里的 ContentSection.vue 完整 pill tab）⇒ 目标文件零状态被误判「零承载」，
    //   整块注入成第二套无样式 tab（截图两行裸文字）。跨文件查到即跳过。
    skippedTabStateElsewhere: 0,
  };
  const out = { ...files };
  if (!files || typeof files !== 'object' || !figmaNodeData || typeof identifyTabSections !== 'function') {
    return { files: out, stats };
  }
  const entries = Object.entries(files).filter(
    ([p, c]) => /\.vue$/i.test(p) && typeof c === 'string',
  );

  // 🛡️ S4-b（2026-11-11 · d3877740 实锤）：tab 块整体缺失（产物零承载）时，按真值
  //   **确定性注入完整 tab 块**（容器 + tab 列表 + 各项真值文本 + @click/active 状态）。
  //   原逻辑 noCarrier 直接跳过 ⇒ 真缺失永远修不好（LLM 两轮都没生成 tab 列）。
  //   数据源：figmaNodeData（容器 id、tab 列表子节点、各项 TEXT 真值）+ 兄弟段 id 定位落点。
  const root = figmaNodeData.document || figmaNodeData;
  const nodeById = new Map();
  const parentOf = new Map();
  {
    const walk = (node, parent) => {
      if (!node || typeof node !== 'object') return;
      if (node.id != null) {
        nodeById.set(String(node.id), node);
        parentOf.set(String(node.id), parent ? String(parent.id) : null);
      }
      for (const c of Array.isArray(node.children) ? node.children : []) walk(c, node);
    };
    walk(root, null);
  }
  // 内联 tab 业务角色判定（对齐 identifyNodeRole 的装饰豁免：bg/icon/image/背景）
  const isTabRole = (node) => {
    const nm = String(node?.name || '').toLowerCase();
    if (!/\btab/.test(nm)) return false;
    if (/^bg|^icon|^image|^img/.test(nm) || nm.includes('背景') || nm.includes('图标')) return false;
    return true;
  };
  const hasTabAncestor = (id) => {
    let cur = parentOf.get(String(id));
    while (cur) {
      const anc = nodeById.get(cur);
      if (anc && isTabRole(anc)) return true;
      cur = parentOf.get(cur);
    }
    return false;
  };

  for (const secId of identifyTabSections(figmaNodeData)) {
    stats.scanned += 1;
    const carrier = entries.find(([, c]) => c.includes(`data-section-id="${secId}"`));
    if (!carrier) {
      // S4-b：仅对**最外层 tab 容器**做整块注入（item 级交给最外层统一处理）
      const node = nodeById.get(String(secId));
      if (!node || hasTabAncestor(secId)) {
        stats.noCarrier += 1;
        continue;
      }
      // tab 项结构判据（2026-11-11 · ce3e3b27 实锤：`2:3566 @antd/tab` 的子节点名为
      //   `btn-active`/`btn`，**不含 tabs** ⇒ 原「子节点 name 含 tabs 且 ≥2 子节点」判据认不出，
      //   块注入永不触发）。改为纯结构、与命名无关：
      //   ① 优先取「子节点里含 TEXT 后代数量 ≥2」的那个子容器（89:37 → 89:39 六项）；
      //   ② 否则退化为「node 自己的直接子节点中带 TEXT 的项 ≥2」（2:3566 → btn-active/btn）。
      const firstTextOf = (n) => {
        let hit = '';
        const pick = (nn) => {
          if (hit || !nn || typeof nn !== 'object') return;
          if (nn.type === 'TEXT' && typeof nn.characters === 'string' && nn.characters.trim()) {
            hit = nn.characters.trim();
            return;
          }
          for (const c of Array.isArray(nn.children) ? nn.children : []) pick(c);
        };
        pick(n);
        return hit;
      };
      const countTextChildren = (n) =>
        (Array.isArray(n?.children) ? n.children : []).filter((c) => firstTextOf(c)).length;
      let tabList = null;
      let tabItems = [];
      const kids = Array.isArray(node.children) ? node.children : [];
      let best = null;
      for (const c of kids) {
        const n = countTextChildren(c);
        if (!best || n > best.n) best = { c, n };
      }
      if (best && best.n >= 2) {
        tabList = best.c;
        tabItems = best.c.children.map((it) => firstTextOf(it)).filter(Boolean);
      } else {
        tabItems = kids.map((c) => firstTextOf(c)).filter(Boolean);
      }
      if (tabItems.length < 2) {
        stats.noCarrier += 1;
        continue;
      }
      // 落点：①含兄弟段 id 的文件（内容区 2:8437 等）②index.vue
      const siblingIds = (node.children || [])
        .filter((c) => c !== tabList)
        .map((c) => String(c.id))
        .concat([String(parentOf.get(String(secId)) || '')]);
      // 🛡️ S4-f（2026-11-13 · 0669e091 实锤）：tab 常嵌在「标题行」section（如 2:3565
      //   6sub-header：tab + 「流量预测」标题 + 「节假日预测>」链接）内。落点优先取
      //   **父 section 的兄弟**（同区块的图表宿主，产物锚为 `chart-<id>` 变体），
      //   让整块落在图表组件之前（标题行在图表正上方，从属关系正确）。
      const tabParentId = String(parentOf.get(String(secId)) || '');
      const tabGrandId = String(parentOf.get(tabParentId) || '');
      const tabParentSibs =
        tabGrandId && nodeById.get(tabGrandId)
          ? (nodeById.get(tabGrandId).children || []).map((c) => String(c.id))
          : [];
      const hasSectionAnchor = (content, sid) =>
        content.includes(`data-section-id="${sid}"`) ||
        content.includes(`data-section-id="chart-${sid}"`);
      // 🔴 targetFile 判定**只用纯 sid**（兄弟/父）：若认 `chart-<id>` 变体会把整块注入
      //   图表子组件文件（如 ChartChart3.vue）⇒ SFC 多根 + mcActiveTab 未定义 ⇒ 运行时报错。
      //   chart- 变体只用于下面的**插入点**定位（且仅当目标文件里确实存在该锚）。
      let targetFile = null;
      for (const [p, c] of entries) {
        if ([...siblingIds].some((sid) => sid && c.includes(`data-section-id="${sid}"`))) {
          targetFile = p;
          break;
        }
      }
      if (!targetFile) {
        targetFile = Object.keys(out).find((p) => /(^|\/)index\.vue$/.test(p)) || null;
      }
      if (!targetFile || typeof out[targetFile] !== 'string') {
        stats.noCarrier += 1;
        continue;
      }
      const src = out[targetFile];
      // 🛡️ S4-d（2026-11-11 · a5df24e9 实锤）：整块注入**降级为最后手段**。
      //   该任务产物 index.vue 里 LLM 已写好 `const tabs = ref([...])` + `activeTab` + 按 tab 分组的
      //   数据映射，只是模板里没有 `data-section-id` 锚点 ⇒ 旧逻辑判「零承载」就整块注入，于是在
      //   `</base-panel>` **之外**多出一份无样式的 tab 块（截图右侧两行游离竖排文字）。
      //   规则：① 已有 tab 状态 ⇒ 只把真值锚点补到**既有 tab 列表元素**（v-for over tabs）上，
      //   不造第二个 tab 列表；② 找不到列表元素 ⇒ 跳过（注入重复无样式块比不注入更糟）；
      //   ③ 只有完全无 tab 状态时才注入，且块内带最小可用样式、只插在根容器内部。
      const hasTabState = /\bconst\s+tabs\s*=|\bconst\s+tabList\s*=|\bactiveTab\s*=/.test(src);
      // 🛡️ S4-e：目标文件零 tab 状态 ≠ 产物零 tab——先跨文件查（如 header 插槽
      //   ContentSection.vue 已有完整 pill tab + activeTab 状态），查到即跳过整块注入。
      if (!hasTabState) {
        const elsewhere = entries.find(
          ([p, c]) => p !== targetFile && /\bconst\s+tabs\s*=|\bconst\s+tabList\s*=|\bactiveTab\s*=/.test(c),
        );
        if (elsewhere) {
          stats.skippedTabStateElsewhere += 1;
          continue;
        }
      }
      if (hasTabState) {
        let anchored = false;
        for (const tm of src.matchAll(/<([A-Za-z][\w.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)>/g)) {
          const tag = tm[0];
          if (!/v-for\s*=\s*"[^"]*\bin\s+(tabs|tabList|tabItems|tabOptions)\b/.test(tag)) continue;
          if (!/data-section-id=/.test(tag)) {
            const itemVar = (tag.match(/v-for\s*=\s*"\s*\(?\s*([A-Za-z_$][\w$]*)/) || [])[1] || null;
            const activeVar =
              (src.match(/const\s+(\w*[Aa]ctive\w*)\s*=\s*ref/) || [])[1] || null;
            let anchoredTag = tag.replace(/<([A-Za-z][\w.-]*)/, `<$1 data-section-id="${secId}"`);
            // 全文件没有任何 @click 时补一条，接到**既有** active 状态上（不新建状态、不覆盖 LLM 语义）
            if (!/@click/.test(src) && itemVar && activeVar) {
              anchoredTag = anchoredTag.replace(
                /<([A-Za-z][\w.-]*)/,
                `<$1 @click="${activeVar} = ${itemVar}.value ?? ${itemVar}"`,
              );
            }
            out[targetFile] = src.replace(tag, anchoredTag);
            stats.anchoredExisting += 1;
            anchored = true;
          }
          break;
        }
        if (!anchored) {
          // 无 v-for 列表时，退化为「承载首个 tab 文本的元素」（只用于**补锚点/接线**，不参与判定）：
          // 接线表达式基于文件里**既有**的 tabs 取值与 active 状态，不新建状态、不造假交互；
          // 解析不出取值对 ⇒ 不加 @click（宁可让 G1-v2 如实报，也不塞一个假 toggle）。
          const firstText = tabItems[0];
          const at = firstText ? src.indexOf(firstText) : -1;
          if (at > 0) {
            const lastTag = [...src.slice(0, at).matchAll(/<([A-Za-z][\w.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)>/g)].pop();
            if (lastTag && !/data-section-id=/.test(lastTag[0])) {
              const activeVar =
                (src.match(/const\s+(\w*[Aa]ctive\w*)\s*=\s*ref/) || [])[1] || null;
              const tabsLit = (src.match(/const\s+tabs\s*=\s*ref\(\s*\[([\s\S]*?)\]\s*\)/) || [])[1] || '';
              const vals = [...tabsLit.matchAll(/value\s*:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
              let anchoredTag = lastTag[0].replace(/<([A-Za-z][\w.-]*)/, `<$1 data-section-id="${secId}"`);
              if (!/@click/.test(src) && activeVar && vals.length >= 2) {
                const [a, b] = vals;
                anchoredTag = anchoredTag.replace(
                  /<([A-Za-z][\w.-]*)/,
                  `<$1 @click="${activeVar} = ${activeVar} === '${a}' ? '${b}' : '${a}'"`,
                );
              }
              out[targetFile] = src.replace(lastTag[0], anchoredTag);
              stats.anchoredExisting += 1;
              anchored = true;
            }
          }
        }
        if (!anchored) stats.skippedExistingState += 1;
        continue;
      }
      const listId = tabList?.id ? String(tabList.id) : `${secId}-list`;
      // 🛡️ S4-f（2026-11-13 · 0669e091 实锤）：整块注入此前只重建 tab 条，把 tab 所在
      //   「标题行」section 的其余文本（「流量预测」标题、「节假日预测>」链接）留置
      //   **无人认领** ⇒ 整行副标题消失（vision 有、产物丢）。修法：按 Figma 父 section
      //   子树重建完整标题行——标题在左（粗体 16px）、tab 条居中、其余文本（链接等）靠右。
      const tabParentNode = tabParentId ? nodeById.get(tabParentId) : null;
      const rowTexts = [];
      if (tabParentNode && Array.isArray(tabParentNode.children)) {
        for (const sib of tabParentNode.children) {
          if (!sib || typeof sib !== 'object') continue;
          if (String(sib.id) === String(secId)) continue; // tab 容器本身
          if (tabList && String(sib.id) === String(tabList.id)) continue;
          const txt = firstTextOf(sib);
          if (txt) rowTexts.push({ id: String(sib.id), name: String(sib.name || ''), text: txt });
        }
      }
      const titleItem = rowTexts.find((r) => /tit|标题/i.test(r.name)) || null;
      const linkItems = rowTexts.filter((r) => r !== titleItem);
      if (titleItem || linkItems.length > 0) stats.headerTextsRecovered = (stats.headerTextsRecovered || 0) + (titleItem ? 1 : 0) + linkItems.length;
      // 🛡️ S4-d：注入块必须自带**最小可用样式**——此前是一串无样式的 div，落进 flex 容器后
      //   被挤成竖排裸文字（a5df24e9 截图右侧那两行）。
      const TAB_ITEM_STYLE = 'font-size:14px;line-height:1;white-space:nowrap;cursor:pointer;';
      const TAB_ITEM_ACTIVE_STYLE = 'color:#3b82f6;font-weight:600;';
      // 🛡️ S4-f：标题/链接行内样式（内联 style 是浏览器直接消费区；px 形态由写盘三态归一接手）
      const ROW_TITLE_STYLE = 'font-size:16px;font-weight:600;line-height:1.2;white-space:nowrap;';
      const ROW_LINK_STYLE = 'font-size:14px;line-height:1;white-space:nowrap;color:#3b82f6;cursor:pointer;';
      const itemsHtml = tabItems
        .map(
          (t, i) =>
            `        <div class="mc-s4-tab${i === 0 ? ' mc-s4-tab--active' : ''}" style="${TAB_ITEM_STYLE}${
              i === 0 ? TAB_ITEM_ACTIVE_STYLE : ''
            }" :class="{ 'mc-s4-tab--active': mcActiveTab === ${i} }" :data-mc-tab-key="${i}" @click="mcActiveTab = ${i}">${t}</div>`,
        )
        .join('\n');
      const titleHtml = titleItem
        ? `      <span class="mc-s4-row-title" data-section-id="${titleItem.id}" style="${ROW_TITLE_STYLE}">${titleItem.text}</span>\n`
        : '';
      const linksHtml = linkItems
        .map(
          (r) =>
            `      <span class="mc-s4-row-link" data-section-id="${r.id}" style="${ROW_LINK_STYLE}">${r.text}</span>`,
        )
        .join('\n');
      const block = `\n    <div class="mc-s4-tabblock" data-section-id="${secId}" style="display:flex;flex-direction:row;align-items:center;gap:16px;padding:4px 0;">\n${titleHtml}      <div class="mc-s4-tablist" data-section-id="${listId}" style="display:flex;flex-direction:row;align-items:center;gap:16px;">\n${itemsHtml}\n      </div>\n${linksHtml ? linksHtml + '\n' : ''}    </div>`;
      // 插入点：①兄弟段（内容区）开标签之前 ②父 section 的兄弟（图表宿主，chart- 锚变体）③根容器闭合前
      let next = null;
      for (const sid of [...siblingIds, ...tabParentSibs]) {
        if (!sid) continue;
        // S4-f：图表宿主组件锚是 `chart-<id>` 变体（R1 派工 data-chart-section 派生），两种形态都认
        const m = new RegExp(
          `(\\n[ \\t]*<[A-Za-z][\\w.-]*(?:"[^"]*"|'[^']*'|[^>"'])*?data-section-id="(?:chart-)?${sid}")`,
        ).exec(src);
        if (m) {
          next = src.slice(0, m.index) + block + src.slice(m.index);
          break;
        }
      }
      if (!next) {
        // 🛡️ S4-d：插入点必须在**根内容容器内部**。旧逻辑直接插到 `</template>` 前，
        //   当模板被 `<base-panel>` 之类的 wrapper 包着时，块会落到 wrapper **之外**
        //   （a5df24e9：面板外多出一整块游离 tab）。优先插进管线约定的内容根容器，其次插在
        //   最后一个闭合标签之前（即 wrapper 内部），两者都拿不到才退回 `</template>` 前。
        const slotM = /<([A-Za-z][\w.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?class="[^"]*-slot-con[^"]*"(?:"[^"]*"|'[^']*'|[^>"'])*?)>/.exec(
          src,
        );
        if (slotM) {
          const at = (slotM.index ?? 0) + slotM[0].length;
          next = `${src.slice(0, at)}${block}${src.slice(at)}`;
        }
      }
      if (!next) {
        const tplClose = src.lastIndexOf('</template>');
        if (tplClose < 0) {
          stats.noCarrier += 1;
          continue;
        }
        const closing = [...src.slice(0, tplClose).matchAll(/<\/([A-Za-z][\w.:-]*)>/g)].pop();
        if (closing) {
          const at = closing.index ?? tplClose;
          next = `${src.slice(0, at)}${block}\n    ${src.slice(at)}`;
        } else {
          next = `${src.slice(0, tplClose)}${block}\n${src.slice(tplClose)}`;
        }
      }
      // script 状态：mcTabs 数组 + mcActiveTab（复用 S4 的 ref 注入）
      const arrLit = `[${tabItems.map((t) => `'${t.replace(/'/g, "\\'")}'`).join(', ')}]`;
      const stateCode = `\n// 🛡️ S4-b tab 块确定性注入（真值缺失兜底）：\nconst mcTabs = ${arrLit}\nconst mcActiveTab = ref(0)\n`;
      const insM = /(<script[^>]*>\n?)/.exec(next);
      if (insM) {
        const importM = /import\s*\{([^}]*)\}\s*from\s*['"]vue['"]/.exec(next);
        if (importM && !/\bref\b/.test(importM[1])) {
          next = next.replace(importM[0], importM[0].replace('{', '{ ref,'));
        } else if (!importM) {
          next = next.replace(insM[1], `${insM[1]}import { ref } from 'vue'\n`);
        }
        const ins2 = /(<script[^>]*>\n?)/.exec(next);
        if (ins2) next = next.replace(ins2[1], `${ins2[1]}${stateCode}`);
      }
      out[targetFile] = next;
      stats.blockInjected += 1;
      continue;
    }
    const [p, src] = carrier;
    // 定位该 tab 段容器开标签
    const tagRe = new RegExp(
      `<([A-Za-z][\\w.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?data-section-id="${String(
        secId,
      ).replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}"(?:"[^"]*"|'[^']*'|[^>"'])*?)>`,
    );
    const m = tagRe.exec(src);
    if (!m) continue;
    const open = m[0];
    if (/@click/.test(open)) {
      stats.skippedHasClick += 1;
      continue;
    }
    if (/tabs\s*=|activeTab|tabIndex/.test(src)) {
      // LLM 已有 tab 状态：只补容器 @click 接线（调既有 handleTab*/switch* 函数；没有函数则挂 toggle）
      const existingFn =
        /handleTabChange|handleTabClick|switchTab|onTabClick/.exec(src)?.[0] || null;
      let wired;
      if (existingFn) {
        wired = open.replace(/<([A-Za-z][\w.-]*)/, `<$1 @click="${existingFn}($event)"`);
      } else {
        // 有状态无函数：注入基于既有 activeTab ref 的切换函数
        wired = open.replace(/<([A-Za-z][\w.-]*)/, `<$1 @click="handleMcTabSwitch"`);
        const scriptIdx = src.indexOf('<script');
        if (scriptIdx >= 0) {
          const setupEnd = src.indexOf('onMounted', scriptIdx);
          const fnCode = `\nfunction handleMcTabSwitch(e) {\n  const el = e?.currentTarget?.closest('[data-mc-tab-key]')\n  if (!el) return\n  // A7-S4: 接线到既有 activeTab 状态\n}\n`;
          const insertAt = setupEnd >= 0 ? setupEnd : src.length;
          out[p] = src.slice(0, insertAt) + fnCode + src.slice(insertAt);
        }
      }
      out[p] = (out[p] === src ? src : out[p]).replace(open, wired);
      stats.wiredExisting += 1;
      continue;
    }
    // LLM 完全没写 tab 状态：注入完整三件套
    const wiredOpen = open
      .replace(
        /<([A-Za-z][\w.-]*)/,
        `<$1 @click="handleMcTabSwitch" :data-mc-tab-root="activeMcTab"`,
      );
    let next = src.replace(open, wiredOpen);
    const scriptIdx = next.indexOf('<script');
    if (scriptIdx < 0) continue;
    const importM = /import\s*\{([^}]*)\}\s*from\s*['"]vue['"]/.exec(next);
    if (importM && !/\bref\b/.test(importM[1])) {
      next = next.replace(importM[0], importM[0].replace('{', '{ ref,'));
    } else if (!importM) {
      next = next.replace(
        /(<script setup>\n?)/,
        `$1import { ref } from 'vue'\n`,
      );
    }
    const setupAnchor = /(<script setup>\s*(?:\n|$))/.exec(next);
    if (setupAnchor) {
      const stateCode = `\n// 🛡️ S4 tab 交互注入（G1-v2 确定性兜底）：\nconst activeMcTab = ref('')\nfunction handleMcTabSwitch(e) {\n  const root = e?.currentTarget\n  const item = e?.target?.closest('[data-mc-tab-key]') || (root?.getAttribute('data-mc-tab-key') ? root : null)\n  if (item) activeMcTab.value = item.getAttribute('data-mc-tab-key') || ''\n}\n`;
      next = next.replace(setupAnchor[0], setupAnchor[0] + stateCode);
    }
    out[p] = next;
    stats.injected += 1;
  }
  return { files: out, stats };
}


/**
 * 🛡️ S3-c（2026-11-11 · a5df24e9 实锤）：卡底背景**就地纠正**——只改既有元素，不新建任何 DOM。
 *
 * 背景：产物把三张卡的真值背景全塞进第一张卡的子树里（card 挂 bg-125、card-icon 挂 bg-124、
 * img 挂 bg-126），第三张卡的 bg-126 还被挂到区块根容器（`background-size:100% 100%` ⇒ 整块拉伸铺满）。
 * E3-v4 判得对，但旧 S3 走「注入独立 div」的老路已实锤会破坏布局（5afb401f 错位方块）。
 *
 * 判据（全部来自既有单一事实源，零硬编码）：
 *   · 卡组与 owner 序 = `collectCardGroups(figmaNodeData)`（几何：≥2 等高子项，按 x 排序）；
 *   · owner→bg = `collectCardBgByOwner(resourceDomMapping)`（mapping `figmaPath` 以 `/bg` 结尾或文件名 `bg-*`）；
 *   · 卡元素 = 该 section 承载文件里**出现次数恰等于 owner 数**的重复 class（DOM 序即 x 序）。
 * 动作（幂等，失败即跳过不猜）：给第 i 个卡元素补 `data-section-id=<owner[i]>`，把对应资源的**import 变量**
 *   以 `:style` 绑定挂到该卡上（先剥掉该卡上错挂的静态 background-image，避免 E3-v2 双声明），
 *   并把同一资源在其它元素上的错挂声明清掉。
 */
export function correctCardBgOwnership(files, figmaNodeData, resourceDomMapping) {
  const stats = { scanned: 0, groups: 0, anchored: 0, remounted: 0, cleared: 0, skipped: 0 };
  const out = { ...files };
  if (!files || typeof files !== 'object' || !figmaNodeData) return { files: out, stats };
  const groups = collectCardGroups(figmaNodeData);
  const bgByOwner = collectCardBgByOwner(Array.isArray(resourceDomMapping) ? resourceDomMapping : []);
  if (groups.size === 0 || bgByOwner.size === 0) return { files: out, stats };
  const esc = (v) => String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  for (const [sectionId, owners] of groups) {
    stats.scanned += 1;
    const wanted = (owners || []).map((o) => ({
      owner: String(o),
      file: bgByOwner.get(String(o)) || null,
    }));
    if (wanted.filter((w) => w.file).length < 2) {
      stats.skipped += 1;
      continue;
    }
    // 承载文件：① 含卡组自身锚点；② 否则按「某 class 重复次数恰等于 owner 数」反查
    //   （图卡组常以几何分组 id 为 key，如 2:8023，而产物只给外层 section 锚点 136:121）
    const vueEntries = Object.entries(out).filter(
      ([p2, c]) => /\.vue$/i.test(p2) && typeof c === 'string',
    );
    let carrier = vueEntries.find(([, c]) => c.includes(`data-section-id="${sectionId}"`));
    if (!carrier) {
      for (const entry of vueEntries) {
        const tplProbe = entry[1].slice(0, entry[1].indexOf('</template>'));
        if (!tplProbe.includes('data-section-id=')) continue;
        const probe = new Map();
        for (const m of tplProbe.matchAll(/class="([^"]+)"/g)) {
          for (const cls of m[1].split(/\s+/)) {
            if (!cls || cls.length < 3) continue;
            probe.set(cls, (probe.get(cls) || 0) + 1);
          }
        }
        if ([...probe.values()].some((n2) => n2 === wanted.length)) {
          carrier = entry;
          break;
        }
      }
    }
    if (!carrier) {
      stats.skipped += 1;
      continue;
    }
    const [file, src] = carrier;
    const tplEnd = src.indexOf('</template>');
    if (tplEnd < 0) {
      stats.skipped += 1;
      continue;
    }
    const tpl = src.slice(0, tplEnd);

    // 候选卡 class：出现次数恰等于 owner 数（≥2），按首次出现序取第一个
    const counts = new Map();
    for (const m of tpl.matchAll(/class="([^"]+)"/g)) {
      const at = m.index ?? 0;
      for (const cls of m[1].split(/\s+/)) {
        if (!cls || cls.length < 3) continue;
        const cur = counts.get(cls);
        if (cur) cur.count += 1;
        else counts.set(cls, { count: 1, first: at });
      }
    }
    const cand = [...counts.entries()]
      .filter(([, v]) => v.count === wanted.length)
      .sort((a, b) => a[1].first - b[1].first)[0];
    if (!cand) {
      stats.skipped += 1;
      continue;
    }
    const tagRe = new RegExp(
      // 类名必须**整 token 匹配**：`(?![-\\w])` 排除 `…-card` 命中 `…-card-icon` 这类超集
      `<([A-Za-z][\\w.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?class="[^"]*${esc(cand[0])}(?![-\\w])[^"]*"(?:"[^"]*"|'[^']*'|[^>"'])*?)>`,
      'g',
    );
    const tags = [...tpl.matchAll(tagRe)].map((m) => m[0]);
    if (tags.length !== wanted.length) {
      stats.skipped += 1;
      continue;
    }
    stats.groups += 1;

    let next = src;
    for (let i = 0; i < tags.length; i += 1) {
      const want = wanted[i];
      if (!want || !want.file) continue;
      const fname = want.file.split('/').pop();
      const im = new RegExp(`import\\s+(\\w+)\\s+from\\s+['"][^'"]*${esc(fname)}['"]`).exec(next);
      if (!im) {
        stats.skipped += 1;
        continue;
      }
      const varName = im[1];
      const tag = tags[i];
      let newTag = tag;
      if (!new RegExp(`\\b${esc(varName)}\\b`).test(tag)) {
        // 先剥该卡上错挂的静态背景（避免 E3-v2 双声明），再挂动态绑定
        newTag = newTag.replace(/\sstyle="([^"]*)"(?=[^>]*>)/, (whole, body) => {
          const cleaned = body.replace(/background-image:url\([^)]*\);?/g, '');
          return cleaned.trim() ? ` style="${cleaned}"` : '';
        });
        if (/:style="/.test(newTag)) {
          stats.skipped += 1;
          continue;
        }
        newTag = newTag.replace(
          /<([A-Za-z][\w.-]*)/,
          `<$1 :style="{ backgroundImage: 'url(' + ${varName} + ')', backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' }"`,
        );
        stats.remounted += 1;
      }
      if (!new RegExp(`data-section-id="${esc(want.owner)}"`).test(newTag)) {
        newTag = newTag.replace(/<([A-Za-z][\w.-]*)/, `<$1 data-section-id="${want.owner}"`);
        stats.anchored += 1;
      }
      if (newTag !== tag) next = next.replace(tag, newTag);
    }

    // 清理：这些资源在其它元素上的错挂（只清非归属锚点的标签）
    for (const want of wanted) {
      if (!want || !want.file) continue;
      const fname = esc(want.file.split('/').pop());
      const im = new RegExp(`import\\s+(\\w+)\\s+from\\s+['"][^'"]*${fname}['"]`).exec(next);
      if (!im) continue;
      const varName = im[1];
      next = next.replace(/<[A-Za-z][^>]*>/g, (t) => {
        if (new RegExp(`data-section-id="${esc(want.owner)}"`).test(t)) return t;
        let t2 = t;
        if (/backgroundImage/.test(t) && new RegExp(`\\b${esc(varName)}\\b`).test(t)) {
          t2 = t2.replace(/backgroundImage:\s*'url\('\s*\+\s*\w+\s*\+\s*'\)'\s*,\s*/g, '');
          t2 = t2.replace(/,\s*backgroundImage:\s*'url\('\s*\+\s*\w+\s*\+\s*'\)'/g, '');
        }
        t2 = t2.replace(new RegExp(`background-image:url\\([^)]*${fname}[^)]*\\);?`, 'g'), '');
        if (t2 !== t) stats.cleared += 1;
        return t2;
      });
    }
    out[file] = next;
  }
  return { files: out, stats };
}

/**
 * 🔴 P0-1（2026-11-11 交接文档 L4）：段根 flex 真值双向注入。
 *
 * 判据（单一来源 = Figma `layoutMode` 结构化字段，零命名/子节点数启发式）：
 *   - 段锚点真值 layoutMode=HORIZONTAL/VERTICAL ⇒ 段根类块缺 display ⇒ 补
 *     `display:flex;flex-direction:row|column`（418c3310 TabsSection 两枚 tab 胶囊
 *     竖排盖面板实锤：`.c-vehicle-monitor-tab{gap:10px;flex-shrink:0}` 缺 display:flex）；
 *   - 真值 layoutMode=NONE 且子树无容器子（全 TEXT 或无子）⇒ 段根类块的
 *     `display:flex/flex-direction` 移除（a2fcdff7 vendor-name 文字重叠同族：flex
 *     误注到文本承载元素）。
 *
 * 作用面刻意收窄：只动「带 data-section-id 的段根元素在其**同文件** <style> 的类块」
 * （S1 锚点注入之后才可见），不碰嵌套元素——嵌套 span 的元素级映射通道目前不存在，
 * 属已知边界（登记于交接文档 P1）。
 *
 * @returns {{files: Object<string,string>, stats: object}} stats 各键恒打（计数行铁律）
 */
/**
 * 🛡️ R5（2026-11-11 · c-vehicle-monitor-4cf5135f 实锤）：资源导入绑定字符串字面量剥离。
 *   `iconSrc: 'icon5'`（icon5 为本文件 import 的 resources/images 绑定）⇒ 运行时 404。
 *   只剥「值为图片导入绑定名」的字面量：images 命名空间干净，误剥风险≈0。
 *   仅处理对象字面量值位（`:` 后），不动模板/注释外的普通赋值。
 */
export function healResourceBindingStringLiterals(files) {
  const stats = { scanned: 0, filesHealed: 0, stripped: 0, samples: [] };
  const out = { ...files };
  if (!files || typeof files !== 'object') return { files: out, stats };
  for (const [p, content] of Object.entries(out)) {
    if (!/\.vue$/i.test(p) || typeof content !== 'string') continue;
    stats.scanned += 1;
    // 本文件 import 的图片绑定名（仅 resources/images 来源）
    const imgBindings = new Set();
    for (const m of content.matchAll(
      /import\s+([A-Za-z_$][\w$]*)\s+from\s+['"][^'"]*resources\/images\/[^'"]*['"]/g,
    )) {
      imgBindings.add(m[1]);
    }
    if (imgBindings.size === 0) continue;
    let fileStripped = 0;
    const next = content.replace(
      /(:\s*)(['"])([A-Za-z_$][\w$]*)\2(?=[,\s}\]])/g,
      (whole, pre, q, name) => {
        if (!imgBindings.has(name)) return whole;
        fileStripped += 1;
        stats.samples.push(`${p}: ${q}${name}${q} → ${name}`);
        return `${pre}${name}`;
      },
    );
    if (fileStripped > 0) {
      out[p] = next;
      stats.filesHealed += 1;
      stats.stripped += fileStripped;
    }
  }
  return { files: out, stats };
}

export function applySectionRootFlexTruth(files, sections, figmaNodeData) {
  const stats = {
    evaluated: Array.isArray(sections) ? sections.length : 0, truthResolved: 0, noTruth: 0, noDomAnchor: 0,
    flexInjected: 0, flexRemoved: 0, alreadyConform: 0,
  };
  const out = { ...files };
  if (!figmaNodeData || !Array.isArray(sections) || sections.length === 0) {
    return { files: out, stats };
  }
  const nodeById = new Map();
  const walkTruth = (n) => {
    if (!n || typeof n !== 'object') return;
    if (n.id != null) nodeById.set(String(n.id), n);
    for (const c of Array.isArray(n.children) ? n.children : []) walkTruth(c);
  };
  walkTruth(figmaNodeData?.document || figmaNodeData);

  for (const sec of sections) {
    if (!sec) continue;
    const ids = [
      sec.id,
      ...(Array.isArray(sec.sourceNodeIds) ? sec.sourceNodeIds : []),
      sec.figmaNodeId,
      sec.figmaNode,
    ].filter((x) => x != null && x !== '');
    let node = null;
    for (const id of ids) {
      node = nodeById.get(String(id)) || null;
      if (node) break;
    }
    const mode = String(node?.layoutMode || '').toUpperCase();
    if (!node || (mode !== 'HORIZONTAL' && mode !== 'VERTICAL' && mode !== 'NONE')) {
      stats.noTruth += 1;
      continue;
    }
    stats.truthResolved += 1;
    const sid = String(sec.id ?? ids[0] ?? '');
    if (!sid) continue;

    // 移除分支的结构前提：真值非自动布局且子树无容器子（全 TEXT 或无子）
    const truthKids = Array.isArray(node.children) ? node.children : [];
    const textOnlyTruth =
      mode === 'NONE' &&
      (truthKids.length === 0 || truthKids.every((c) => String(c?.type || '').toUpperCase() === 'TEXT'));

    let acted = false;
    for (const p of Object.keys(out)) {
      if (!/\.vue$/i.test(p) || typeof out[p] !== 'string') continue;
      let content = out[p];
      // ① 定位段根元素标签（data-section-id=sec.id），取首个 class
      const anchorIdx = content.indexOf(`data-section-id="${sid}"`);
      const anchorIdx2 = anchorIdx < 0 ? content.indexOf(`data-section-id='${sid}'`) : anchorIdx;
      if (anchorIdx < 0 && anchorIdx2 < 0) continue;
      const aIdx = anchorIdx >= 0 ? anchorIdx : anchorIdx2;
      const tagStart = content.lastIndexOf('<', aIdx);
      const tagEnd = content.indexOf('>', aIdx);
      if (tagStart < 0 || tagEnd < 0) continue;
      const tag = content.slice(tagStart, tagEnd + 1);
      const clsMatch = tag.match(/\sclass=["']([^"']+)["']/);
      if (!clsMatch) { stats.noDomAnchor += 1; continue; }
      const rootCls = clsMatch[1].trim().split(/\s+/)[0];
      if (!rootCls) { stats.noDomAnchor += 1; continue; }

      // ② 同文件 <style> 里找 `.{rootCls}` 一级规则块
      const styleMatch = content.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
      if (!styleMatch) continue;
      const styleStart = styleMatch.index + styleMatch[0].indexOf(styleMatch[1]);
      const body0 = styleMatch[1];
      const ruleRe = new RegExp(`([^{}]*\\.${rootCls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^{}]*)\\{`, 'g');
      const m = ruleRe.exec(body0);
      if (!m) continue;
      const bodyStart = styleStart + m.index + m[0].length;
      let depth = 1;
      let i = bodyStart;
      while (i < content.length && depth > 0) {
        if (content[i] === '{') depth += 1;
        else if (content[i] === '}') depth -= 1;
        i += 1;
      }
      const bodyEnd = i - 1;
      const body = content.slice(bodyStart, bodyEnd);

      let newBody = body;
      if ((mode === 'HORIZONTAL' || mode === 'VERTICAL') && !/display\s*:/i.test(body)) {
        // 补缺失（方向 = 真值；不覆盖已有 flex-direction —— 若有方向但无 display，只补 display）
        const dir = mode === 'VERTICAL' ? 'column' : 'row';
        newBody = /flex-direction\s*:/.test(body)
          ? `\n  display: flex;${body}`
          : `\n  display: flex;\n  flex-direction: ${dir};${body}`;
        stats.flexInjected += 1;
        acted = true;
      } else if (textOnlyTruth && /display\s*:\s*flex/i.test(body)) {
        // 移除误注（真值 NONE + 文本承载）
        newBody = body
          .replace(/[ \t]*flex-direction\s*:[^;]*;\s*/g, '')
          .replace(/[ \t]*display\s*:\s*flex\s*;\s*/g, '');
        stats.flexRemoved += 1;
        acted = true;
      } else {
        stats.alreadyConform += 1;
      }
      if (acted && newBody !== body) {
        content = content.slice(0, bodyStart) + newBody + content.slice(bodyEnd);
        out[p] = content;
      }
    }
    if (!acted) {
      // 有真值但产物里找不到段锚 DOM（子组件拆分形态等）——显式计数，不静默
      if (!Object.values(out).some(
        (c) => typeof c === 'string' && c.includes(`data-section-id="${sid}"`),
      )) {
        stats.noDomAnchor += 1;
      }
    }
  }
  return { files: out, stats };
}

export function registerBuiltinFixRules(pipeline, engineer, context = {}) {
  if (!pipeline || !engineer) return pipeline;
  const {
    componentName = '',
    outputPath = '',
    resourceDomMapping = null,
    figmaNodeData = null,
    input = {},
    businessTextRules = null,
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
      // 🧱 2026-11-08（mc-1794130136557-0596cb3c 实锤）：本轮 `<template>` 的来源。
      //   `deterministic-template` ⇒ 装配层已按**同层归一**（h/Σh）写好内联 flex，
      //   规则⑥ 不得再用 `sectionHeights`（avg=1 量纲）覆盖 —— 两套量纲混用必错：
      //   实锤产物 `flex: 0.218 / 0.473 / 0.769`（前两段被 avg=1 值覆盖、第三段保留
      //   装配值 317/411.9=0.769）⇒ 归一后 15%/32%/52%，真值应 7%/16%/77%
      //   ⇒ 统计条被拉到 121px、卡片区只剩 205px（4 行放不下）。
      indexTemplateSource: _indexTemplateFacts?.source || null,
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

  // ════════ S3（2026-11-11）：E3-v4 背景归属确定性补挂（docs/2026-11-11-S3S4判据驱动确定性兜底方案.md）════════
  // 90e4e5e7 实锤：硬约束进 prompt 后 LLM 仍选择性执行（建区块不写锚属性）⇒ 管线按 mapping
  // 真值直接补挂；acceptance E3-v4 判据不改（改验分离），补挂成功复检自然 PASS。
  // ════════ S3-c（2026-11-11）：卡底背景**就地纠正**（不新建 DOM）════
  // a5df24e9 实锤：三张卡的真值背景被 LLM 全塞进第一张卡子树（card/icon/img 各挂一张），
  // 第三张的 bg 甚至挂到区块根容器（100% 100% ⇒ 整块拉伸）。E3-v4 判得对，但**判而不修**：
  // 旧 S3 的「注入独立 div」路线已实锤破坏布局（5afb401f 错位方块）⇒ 本刀改为只改既有元素。
  pipeline.register({
    id: 'S3c-card-bg-ownership-correct',
    name: 'E3-v4 卡底背景就地纠正（补锚点 + 归位 + 清错挂）',
    phase: FIX_PHASE.RESOURCE,
    enabled: () => process.env.S3C_CARD_BG !== 'false',
    fixFiles: (files) => {
      const r = correctCardBgOwnership(files, figmaNodeData, resourceDomMapping || []);
      engineer.logger?.info?.(
        `🛡️ S3-c 卡底背景就地纠正·已评估 ${JSON.stringify(r.stats)}`,
      );
      return r.files;
    },
  });

  pipeline.register({
    id: 'S3-bg-ownership-backstop',
    name: 'E3-v4 背景归属确定性补挂',
    phase: FIX_PHASE.RESOURCE,
    // 🛡️ 2026-11-12 治本：5afb401f 两缺陷已一并修好，**恢复默认启用**——
    //   ① 背景改 `:style` 动态绑定 ⇒ 变量真解析（原静态 style 里 url('bg1') 是字面量 ⇒ 恒 404）；
    //   ② 插入点改「varName 消费元素开标签之内」⇒ 注入 div 成为其子元素（原插「引用所在行行尾」
    //      落在父级/兄弟位置 ⇒ 错位方块破坏布局）；另修 ③ 插入坐标重复叠加 tplIdx。
    //   定位依据：E3-v4「归属容器 X 未建且该背景无任何消费形态（含数据驱动）」形态在产物侧
    //   **无任何其它确定性兜底**——S3-c（correctCardBgOwnership）只改既有元素、不新建 DOM，
    //   且要求同构卡组 ≥2（单个 bg 直接 skip）⇒ 不启用本规则时该形态只能靠 LLM 单轮照抄
    //   hardConstraints，实测 effective=false ⇒ E3-v4 反复 FAIL 且复检不过（拒绝交付坏结构）。
    //   风险闸：已处「数据驱动消费态」（判据 E3-v4 v4 放行形态）时本规则主动跳过，防造重复背景块。
    //   回滚开关：S3_BG_BACKSTOP=false。
    enabled: () => process.env.S3_BG_BACKSTOP !== 'false',
    fixFiles: (files) => {
      const r = backstopMountBgOwnership(files, resourceDomMapping);
      engineer.logger?.info?.(
        `🛡️ S3 bg 归属补挂·已评估 ${JSON.stringify(r.stats)}`,
      );
      return r.files;
    },
  });

  // ════════ S4（2026-11-11）：G1-v2 tab 交互确定性注入（同方案文档）════════
  // 真值 tab 段承载无 @click ⇒ 注入 Mc 前缀标准三件套；LLM 已有状态则只接线。
  pipeline.register({
    id: 'S4-tab-interactivity-inject',
    name: 'G1-v2 tab 交互确定性注入',
    // 🛡️ 2026-11-11（ce3e3b27 实锤）：必须用 INTERACTION 而非 POLISH——S1
    //   `inject-section-anchors` 同在 POLISH 且注册在后，阶段内按注册顺序执行 ⇒ 用 POLISH 时
    //   S4 看不到 data-section-id 锚点（noCarrier=1、块注入永不触发），而 acceptance 在管线之后
    //   看到锚点 ⇒ 永久报「承载于 X.vue 但无切换绑定」。
    phase: FIX_PHASE.INTERACTION,
    enabled: () => process.env.S4_TAB_INJECT !== 'false',
    fixFiles: (files) => {
      const tabIds = [];
      if (figmaNodeData && typeof figmaNodeData === 'object') {
        const stack = [figmaNodeData.document || figmaNodeData];
        while (stack.length) {
          const n = stack.pop();
          if (!n || typeof n !== 'object') continue;
          {
            const nm = String(n.name || '').toLowerCase();
            // 内联判定（同 isTabRole，禁 import component-acceptance 防循环依赖）
            const deco = /^bg|^icon|^image|^img/.test(nm) || nm.includes('背景') || nm.includes('图标');
            if (/\btab/.test(nm) && !deco) tabIds.push(String(n.id));
          }
          if (Array.isArray(n.children)) stack.push(...n.children);
        }
      }
      const r = injectTabInteractivity(files, figmaNodeData, () => tabIds);
      engineer.logger?.info?.(
        `🛡️ S4 tab 交互注入·已评估 ${JSON.stringify(r.stats)}`,
      );
      return r.files;
    },
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
          // 🛡️ 2026-10-19：不传业务术语规则 ⇒ 本规则会把「小汽车」判为未知、并按最近真值
          //   改回「客车」——**与业务口径直接对抗**（改一次门禁再改回去，重试空转）。
          const unknown = detectUnknownText(
            [{ path: ctx.path, content }],
            figmaNodeData,
            businessTextRules,
          );
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
    // 🛡️ L4（P0-1 · 2026-11-11 交接文档）：段根 flex 真值双向注入——必须在 S1 之后
    //   （依赖其注入的 data-section-id 定位段根）。判据单一来源 = Figma layoutMode，
    //   双向：真值 H/V 补缺失（真值方向），真值 NONE+文本承载移除误注。
    pipeline.register({
      id: 'L4-section-root-flex-truth',
      name: '段根 flex 真值双向注入（L4）',
      phase: FIX_PHASE.POLISH,
      fixFiles: (files) => {
        const sections =
          componentPlan?.effectiveSections ||
          input?.generationInput?.componentPlan?.effectiveSections ||
          [];
        const r = applySectionRootFlexTruth(files, sections, figmaNodeData);
        // 计数行铁律：恒打，区分「没跑/跑了没命中/命中多少」
        engineer.logger?.info?.(
          `🛡️ L4 段根 flex 真值·已评估 ${JSON.stringify(r.stats)}`,
        );
        return r.files;
      },
    });
    // 🛡️ R5（2026-11-11 · c-vehicle-monitor-4cf5135f 实锤）：资源导入绑定被写成**字符串字面量**。
    //   LLM 在 script 数据对象里写 `iconSrc: 'icon5'`（icon5 是本文件 import 的图片绑定）
    //   ⇒ 运行时 img src=字面量"icon5" 资源 404。治本：值为图片导入绑定名的字符串字面量
    //   ⇒ 剥引号还原为变量引用（资源变量绝不拼静态 style/JSON 规约的 script 侧延伸）。
    pipeline.register({
      id: 'R5-resource-binding-string-literal-heal',
      name: '资源导入绑定字符串字面量剥离（R5）',
      phase: FIX_PHASE.POLISH,
      fixFiles: (files) => {
        const r = healResourceBindingStringLiterals(files);
        // 计数行铁律：恒打，区分「没跑/跑了没命中/命中多少」
        engineer.logger?.info?.(
          `🛡️ R5 资源字面量剥离·已评估 ${JSON.stringify({
            ...r.stats,
            samples: r.stats.samples.slice(0, 3),
          })}`,
        );
        return r.files;
      },
    });
    // 🛡️ P-12 防御性治理规则（2026-09-18）
    // 背景：c-env-monitor-a27a33f7 TabSwitcher 布局错乱 + c-device-monitor-7de62721 颜色错误
    // 根因：LLM 产出结构性错误（动态 class 无样式、容器缺 flex、资源绑定层级错误、颜色真值提取失败）
    // 规则：
    //   ⚠️ P-12a `validate-dynamic-class-styles` 已于 2026-09-30 删除（§七 Bug1 / 评审 §8.2 削源）：
    //      它是 `/* TODO: 补充样式 */` 占位的**唯一生产者**（全语料制造 1464 条永久债）；空规则零声明、
    //      其填充端读 `nodeLayoutFacts` 与 2.11 LAYOUT-FACTS-INJECT 同源重叠 ⇒ 布局注入统一归 2.11。
    //   P-12c validate-resource-binding-level：检测 backgroundImage 绑定位置，与 Figma 节点树对比，层级不匹配时警告
    //   ⚠️ P-12b `ensure-flex-layout-for-siblings` 已于 2026-09-28 删除（§七 B16/C4）：
    //      与 `css-sanitizer#ensureFlexDisplay`（Fix1，零硬编码）+ `resource-mounter` 规则⑤
    //      （按 Figma `selectorChildCounts`）职责重复；其判据是「相邻标签即父子」错误启发式，
    //      且注入硬编码 `align-items:center` + `gap:4px`（污染真实间距）→ 按删减法收敛。
    //   P-12d extract-node-level-color-truth：提取每个 TEXT 节点的颜色真值（默认 fill + per-char 覆盖色）
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

  // 🛡️ 根治⑯（2026-11-13 · mc-1794535248015-2ca2eb59 实锤）：跨组件 props 契约确定性修复。
  //   内部子组件消费 businessProps.<key>（declare 未声明 ⇒ 运行期必然空渲染 + PROP-BIND
  //   BLOCK 三轮不收敛——LLM 每轮照样编，回灌指导实证无效）。分级：死键 ∈ 父传同名 prop
  //   ⇒ 确定性改绑（defineProps + props.k）；无父传 ⇒ 跳过（保持 BLOCK，不臆造数据）。
  //   修复后当轮 L0-B 复检自然 PASS（改验分离：判据在 code-structure-validator 不动）。
  pipeline.register({
    id: 'cross-component-prop-rebind',
    name: '内部子组件 businessProps 死键同名改绑（根治⑯）',
    phase: FIX_PHASE.STRUCTURE,
    fixFiles: (files) => {
      const r = rebindInternalChildDeadProps(files);
      if ((r?.healed?.length || 0) + (r?.skipped?.length || 0) > 0 && engineer?.logger) {
        engineer.logger.warn(
          `🛡️ 根治⑯ 跨组件 props 契约扫描：改绑 ${r.healed.length} 处 / 跳过 ${r.skipped.length} 处`,
          { healed: r.healed.slice(0, 6), skipped: r.skipped.slice(0, 4) },
        );
      }
      return r?.files && typeof r.files === 'object' ? r.files : files;
    },
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
  'validate-resource-binding-level',
  'extract-node-level-color-truth',
  'remove-subcomponent-width-override',
];

export default { registerBuiltinFixRules, BUILTIN_RULE_IDS };
