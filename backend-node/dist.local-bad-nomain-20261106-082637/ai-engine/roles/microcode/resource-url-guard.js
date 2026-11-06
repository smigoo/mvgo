/**
 * 🛡️ 刀B · B1（2026-11-05 · `c-env-monitor-c324a730` 实锤）：资源 URL 白名单对账。
 *
 * 病灶：LLM 在 sub-state 落点失配时，把 prompt 里高频出现的「预览图分析输入」
 *   `mc-preview.png`（/workspace/ 静态挂载点，运行时真能加载）当成可用资源写进
 *   `.is-active { background-image: url('/workspace/mc-preview.png') }`。
 *   四层叠加根因（详见 docs/2026-11-05-c-env-monitor三缺陷根治方案-*.md §1-P2）：
 *   ① mc-preview 是 prompt 高频 token 但非资源清单成员；
 *   ② bg2 落点指引自相矛盾（容器 2:7889 ≠ 激活态单 item 2:7890，B′ 域）；
 *   ③ /workspace/ 前缀运行时真能加载 ⇒ 幻觉「可见」而非 404 静默；
 *   ④ code-structure-validator `:1996` 对非白名单资源 `continue` ⇒ 零拦截。
 *
 * 本 pass（chunk 修复层 C10）：在 `_mountPlannedResources` 入口、锚点补标之前，
 *   扫全部产物 .vue/.less 的样式 url()，按「已下载资源白名单」分类：
 *     - 变量引用 / data:URI / http(s) 外链 / 白名单内 → 放行（后续由 CODE-016/R6 管宿主）
 *     - 未声明本地路径（mc-preview 类幻觉）→ **B1 自动替换**：按选择器词集 ∩
 *       mapping 的 mountTarget/hint/figmaPath 词形归一词集（tokenizeWords 单一来源）
 *       找唯一最大交集的 bg 真值资源，原位换 URL；匹配不到 ⇒ **整条声明剥除**
 *       （宁留白不出错图，与 C8② 同哲学）—— 保证 mc-preview 永不落盘，不烧重试轮次。
 *
 * 🔴 纪律：改者与验者不得用同一正则 —— 本模块的声明扫描正则与
 *   code-structure-validator `_scanStyleResourceUrls` 独立实现，断言（spec）用
 *   字符串 includes/计数，不复用任何一方正则。
 * 🔴 只动样式 url() 与静态 src 计数；模板/脚本绑定（:src/:style）不碰（JS 表达式域）。
 *
 * 纯函数式编辑（收集 edits 后按 start 降序一次性应用），无 IO。
 */

import { tokenizeWords } from '../../utils/template-element-tree.js';

/** 声明级扫描（改者正则，与校验器 _scanStyleResourceUrls 独立）：
 *  属性名 + 值内含 url(...)。捕获 prop / 整条声明 / 引号 / URL。 */
const DECL_URL_RE =
  /([-\w]+)\s*:\s*([^;{}]*?url\s*\(\s*(['"]?)([^'")]+)\3\s*\)[^;{}]*)/g;

/** 变量引用形态：url(${bg2}) / url(@var) / url($var) / url(--var) / url("@{var}") LESS 插值 */
const VAR_REF_RE = /^\s*(?:\$\{[^}]*\}|[@$]\{[\w-]+\}|[@$][\w-]+|--[\w-]+)\s*$/;
const DATA_URI_RE = /^\s*data:/i;
const EXTERNAL_RE = /^\s*(?:https?:)?\/\//i;

/** 静态模板 src（非 :src 绑定）——只计数告警，不改 */
const STATIC_SRC_RE = /(?<![:\w-])src\s*=\s*["']([^"']+)["']/g;

const basenameOf = (u) =>
  String(u || '').split(/[?#]/)[0].split('/').pop() || '';

/** 在 region 内取 declStart 的最内层选择器：最后一个 '{' 之前、再上一个 '}' 之后的文本 */
function enclosingSelectorOf(region, declStart) {
  const open = region.lastIndexOf('{', declStart - 1);
  if (open < 0) return null;
  const close = region.lastIndexOf('}', open - 1);
  const sel = region.slice(close + 1, open).trim();
  return sel || null;
}

/**
 * 扫描一个样式 region，产出编辑项。
 * @returns {{edits:Array, stats:object}}
 */
function scanStyleRegion(content, start, end, whitelist, candidates) {
  const region = content.slice(start, end);
  const edits = [];
  const stats = {
    scanned: 0, variableRefs: 0, dataUris: 0, external: 0,
    legal: 0, undeclared: 0, replaced: 0, stripped: 0,
  };
  const items = [];
  DECL_URL_RE.lastIndex = 0;
  let m;
  while ((m = DECL_URL_RE.exec(region)) !== null) {
    stats.scanned++;
    const prop = (m[1] || '').toLowerCase();
    const url = m[4];
    const declStart = start + m.index;
    const declEnd = declStart + m[0].length;
    if (VAR_REF_RE.test(url)) { stats.variableRefs++; continue; }
    if (DATA_URI_RE.test(url)) { stats.dataUris++; continue; }
    if (EXTERNAL_RE.test(url)) { stats.external++; continue; }
    if (whitelist.has(basenameOf(url))) { stats.legal++; continue; }

    stats.undeclared++;
    // B1 自动替换：选择器词集 ∩ 候选资源词集，唯一最大交集才换
    const selector = enclosingSelectorOf(region, declStart);
    const selTokens = new Set(tokenizeWords(selector));
    let best = null;
    let bestScore = 0;
    let tie = false;
    for (const c of candidates) {
      const targetTokens = tokenizeWords(
        [c.mountTarget, c.hint, c.figmaPath, c.resourceFile].join(' '),
      );
      let score = 0;
      for (const t of targetTokens) if (selTokens.has(t)) score++;
      if (score > bestScore) { best = c; bestScore = score; tie = false; }
      else if (score === bestScore && score > 0) tie = true;
    }

    if (best && bestScore > 0 && !tie) {
      const newUrl = `../resources/images/${basenameOf(best.resourceFile)}`;
      const healed = m[0].replace(
        /url\s*\(\s*(['"]?)[^'")]+\1\s*\)/,
        `url(${m[3]}${newUrl}${m[3]})`,
      );
      edits.push({ start: declStart, end: declEnd, text: healed });
      stats.replaced++;
      items.push({
        file: '', url, action: 'replaced', to: newUrl,
        selector: selector || null, score: bestScore, prop,
      });
    } else {
      // 剥整条声明（含紧随的分号）；宁留白不出错图。
      // 🛡️ LESS 变量定义形态 `@foo: url(幻觉)`：声明正则从 `foo` 起匹配，剥除前
      //   必须把紧贴的 @/$ 前缀一并带上，否则残留 `@;` 会炸 LESS 编译。
      let stripStart = declStart;
      const prevCh = start > 0 && declStart - start - 1 >= 0
        ? region[declStart - start - 1]
        : '';
      if (prevCh === '@' || prevCh === '$') stripStart = declStart - 1;
      let end2 = declEnd;
      let k = declEnd;
      while (k < region.length && /\s/.test(region[k])) k++;
      if (region[k] === ';') end2 = k + 1;
      edits.push({ start: stripStart, end: end2, text: '' });
      stats.stripped++;
      items.push({
        file: '', url, action: 'stripped',
        selector: selector || null,
        reason: tie ? 'ambiguous' : 'no-word-match', prop,
      });
    }
  }
  return { edits, stats, items };
}

/**
 * 资源 URL 白名单对账（C10 / 刀B·B1）。原地修改 allFiles。
 * @param {Record<string,string>} allFiles 路径 → 内容
 * @param {Array} resourceDomMapping 资源映射（downloadStatus==='success' 的 resourceFile 构成白名单）
 * @returns {object} 统计（items 带 file 字段回填，供日志）
 */
export function healUndeclaredResourceUrls(allFiles, resourceDomMapping) {
  const mapping = Array.isArray(resourceDomMapping) ? resourceDomMapping : [];
  if (mapping.length === 0) {
    return { skipped: 'no-mapping', items: [] };
  }
  const whitelist = new Set();
  const candidates = [];
  for (const m of mapping) {
    if (m?.downloadStatus !== 'success' || !m.resourceFile) continue;
    whitelist.add(basenameOf(m.resourceFile));
    // 替换候选仅 bg（图标走 <img>，不该被换进 background）
    if (m.previewAnalysisRole === 'bg') candidates.push(m);
  }
  const out = {
    scannedFiles: 0, scanned: 0, variableRefs: 0, dataUris: 0, external: 0,
    legal: 0, undeclared: 0, replaced: 0, stripped: 0,
    templateWarns: 0, items: [],
  };
  for (const [path, content] of Object.entries(allFiles || {})) {
    if (typeof content !== 'string') continue;
    const isVue = path.endsWith('.vue');
    const isStyle = path.endsWith('.less') || path.endsWith('.css');
    if (!isVue && !isStyle) continue;
    out.scannedFiles++;

    // 收集样式 region（绝对偏移）
    const regions = [];
    if (isStyle) {
      regions.push([0, content.length]);
    } else {
      const openRe = /<style[^>]*>/gi;
      let om;
      while ((om = openRe.exec(content)) !== null) {
        const close = content.indexOf('</style>', om.index);
        regions.push([om.index + om[0].length, close < 0 ? content.length : close]);
        if (close < 0) break;
        openRe.lastIndex = close;
      }
    }

    const allEdits = [];
    for (const [s, e] of regions) {
      const r = scanStyleRegion(content, s, e, whitelist, candidates);
      allEdits.push(...r.edits);
      for (const k of ['scanned', 'variableRefs', 'dataUris', 'external', 'legal', 'undeclared', 'replaced', 'stripped']) {
        out[k] += r.stats[k];
      }
      for (const it of r.items) { it.file = path; out.items.push(it); }
    }

    // 静态 src 计数（只报不改）
    if (isVue) {
      STATIC_SRC_RE.lastIndex = 0;
      let sm;
      while ((sm = STATIC_SRC_RE.exec(content)) !== null) {
        const u = sm[1];
        if (VAR_REF_RE.test(u) || DATA_URI_RE.test(u) || EXTERNAL_RE.test(u)) continue;
        if (whitelist.has(basenameOf(u))) continue;
        out.templateWarns++;
        out.items.push({ file: path, url: u, action: 'warn-only', kind: 'static-src' });
      }
    }

    if (allEdits.length === 0) continue;
    allEdits.sort((a, b) => b.start - a.start);
    let next = content;
    for (const ed of allEdits) {
      next = next.slice(0, ed.start) + ed.text + next.slice(ed.end);
    }
    allFiles[path] = next;
  }
  return out;
}
