/**
 * @file structural-truth-healers.js — 🛡️ 刀 32/33/34（2026-10-20 · 477e185d 实锤）：结构真值三刀。
 *
 * 事故形态（同一任务三处产物缺陷，互相独立）：
 *   ① 头部两统计卡（38:3260/38:3282，Figma 同 y 横向并列，⑦ rowPeers 已互挂）被 E1 提成
 *      两个平级 section，LLM 生成 index.vue 时按父 column 平铺 ⇒ 上下堆叠。⑦ 的「横向并列」
 *      真值行是建议式文本，LLM 未遵从 ⇒ 需要确定性结构保证。
 *   ② 同名 class 双源：LLM 在 SFC scoped 与 common.less 两处都写了同名类且布局属性冲突
 *      （SFC row vs common.less column+center），运行时全局版生效 ⇒ 小标题居中。
 *      改一漏一是必然事故（「同判据多份副本」纪律的样式版）⇒ 以 SFC 为唯一语义源统一。
 *   ③ LLM 把面板小标题组件错挂进 `<template #header-right>` 插槽，主体又渲染一份 ⇒ 重复渲染。
 *
 * 纪律：全部纯结构/几何判据，**零任务 ID / 零节点名 / 零组件名硬编码**；
 *       真值源只有 ctx.effectiveSections（rowPeerIds）与 ctx.figmaRoot（bbox 间距）。
 *       无真值 fail-open 不判；幂等（包裹层带 data-rowpeers-wrap 标记）。
 */

/** 刀 32/33/34 统一布局属性集（只统一这三类「方向/对齐」属性，字号色值不碰） */
const LAYOUT_PROPS = ['flex-direction', 'justify-content', 'align-items'];

// ─────────────────────────────── 工具 ───────────────────────────────

/** 逐层展平 section 树（children 一等公民） */
function* walkSections(secs) {
  for (const s of secs || []) {
    if (!s) continue;
    yield s;
    if (Array.isArray(s.children)) yield* walkSections(s.children);
  }
}

/**
 * 定位 index.vue 模板中 `data-section-id="<id>"` 所在 div 的完整块 [start, end)。
 * anchor 必须落在该 div 的**开标签内**（属性位置）；tag 配对用 `<div` / `</div>` 深度计数。
 */
export function findSectionDivBlock(content, sectionId) {
  if (!content || !sectionId) return null;
  const needle = `data-section-id="${sectionId}"`;
  let anchor = content.indexOf(needle);
  while (anchor >= 0) {
    // 向前找最近的 `<div`，且其开标签 '>' 在 anchor 之后（anchor 确实在开标签内）
    let start = -1;
    let from = anchor;
    for (;;) {
      const cand = content.lastIndexOf('<div', from);
      if (cand < 0) break;
      const tagEnd = content.indexOf('>', cand);
      if (tagEnd >= anchor) { start = cand; break; }
      from = cand - 1; // anchor 不在这个开标签内，继续向前
      if (from < 0) break;
    }
    if (start < 0) return null;
    // 深度配对闭合
    const re = /<div\b|<\/div\s*>/g;
    re.lastIndex = start;
    let depth = 0;
    let m;
    while ((m = re.exec(content))) {
      depth += m[0].startsWith('</') ? -1 : 1;
      if (depth === 0) return { start, end: re.lastIndex };
    }
    return null;
  }
  return null;
}

/** 找 pos 之前最近且未闭合的 div 开标签（即 pos 所在层的直接父） */
function findParentOpenDiv(content, pos) {
  const stack = [];
  const re = /<div\b[^>]*?>|<\/div\s*>/g;
  let m;
  while ((m = re.exec(content)) && m.index < pos) {
    if (m[0].startsWith('</')) stack.pop();
    else stack.push(m[0]);
  }
  return stack.length > 0 ? stack[stack.length - 1] : null;
}

/** 从 style 串抽 flex 值（形如 flex:0.096 / flex:1 1 0 取第一个数字；flex:none 不迁移） */
function extractFlexNumber(styleStr) {
  const m = /(?:^|["';\s])flex:\s*([\d.]+)/.exec(styleStr || '');
  return m ? Number(m[1]) : null;
}

// ─────────────────────────────── 刀 32 ───────────────────────────────

/**
 * 刀 32：rowPeers 横向并列确定性包裹。
 *
 * 判据（纯几何/结构）：
 *   - 真值：section A.rowPeerIds ∋ B（E1 互挂：y 重叠 >50% + x 分离）；
 *   - 产物：data-section-id=A 与 B 的 div 是**同父相邻**兄弟，且父开标签为
 *     `flex-direction:column` ⇒ 互挂真值被父容器方向否定。
 * 修复：A+B 包进 `<div data-rowpeers-wrap style="flex:SUM;...row;gap:GAPpx">`；
 *   gap = Figma bbox 真值间距（B.x − (A.x+A.width)，四舍五入）；A/B 原 flex 值相加迁移到
 *   包裹层，自身改 flex:1（等分——真值宽度近等时正确；不等时由 min-width:0 保底不溢出）。
 * 幂等：包裹层带 data-rowpeers-wrap，重跑跳过。
 */
export function healRowPeersWrap(files, { effectiveSections, figmaRoot } = {}) {
  const changes = [];
  if (!Array.isArray(effectiveSections) || effectiveSections.length === 0) {
    return { files, changes, skipped: [{ reason: 'no-effective-sections' }] };
  }
  const indexVuePath = Object.keys(files).find(
    (p) => /(^|\/)index\.vue$/.test(p) && typeof files[p] === 'string',
  );
  if (!indexVuePath) return { files, changes, skipped: [{ reason: 'no-index-vue' }] };
  let content = files[indexVuePath];

  // 互挂对（去重：id 序小者在前）
  const pairs = [];
  for (const s of walkSections(effectiveSections)) {
    const sid = String(s?.id ?? '');
    if (!sid || !Array.isArray(s.rowPeerIds)) continue;
    for (const pid of s.rowPeerIds) {
      const a = sid < String(pid) ? sid : String(pid);
      const b = sid < String(pid) ? String(pid) : sid;
      if (a !== b && !pairs.some((p) => p[0] === a && p[1] === b)) pairs.push([a, b]);
    }
  }
  if (pairs.length === 0) return { files, changes, skipped: [{ reason: 'no-rowpeers-truth' }] };

  // figma bbox 索引（gap 真值源；兼容 {document} 包装）
  const figIndex = new Map();
  const root = figmaRoot?.document ?? figmaRoot;
  (function walkFigma(n) {
    if (!n || typeof n !== 'object') return;
    if (n.id != null && !figIndex.has(String(n.id))) {
      figIndex.set(String(n.id), n.absoluteBoundingBox || null);
    }
    for (const c of n.children || []) walkFigma(c);
  })(root);

  for (const [aId, bId] of pairs) {
    // 幂等/守卫：已包裹过则跳过
    if (content.includes('data-rowpeers-wrap')) break;
    const aBlk = findSectionDivBlock(content, aId);
    const bBlk = findSectionDivBlock(content, bId);
    if (!aBlk || !bBlk) { changes.push({ pair: [aId, bId], skipped: 'section-div-not-found' }); continue; }
    // 同父相邻：a 结束到 b 开始之间只有空白
    const between = content.slice(aBlk.end, bBlk.start);
    if (bBlk.start < aBlk.end || !/^\s*$/.test(between)) {
      changes.push({ pair: [aId, bId], skipped: 'not-adjacent-siblings' });
      continue;
    }
    // 父 column 判定（父不是 column ⇒ 无需治，阳性守卫）
    const parentTag = findParentOpenDiv(content, aBlk.start);
    if (!parentTag || !/flex-direction\s*:\s*column/.test(parentTag)) {
      changes.push({ pair: [aId, bId], skipped: 'parent-not-column' });
      continue;
    }
    // gap 真值
    const bb = figIndex.get(bId);
    const ba = figIndex.get(aId);
    const gap = bb && ba ? Math.round((bb.x || 0) - ((ba.x || 0) + (ba.width || 0))) : null;

    // flex 迁移：A/B 原 flex 相加 → 包裹层；子块改 flex:1
    const aText = content.slice(aBlk.start, aBlk.end);
    const bText = content.slice(bBlk.start, bBlk.end);
    const fa = extractFlexNumber(aText);
    const fb = extractFlexNumber(bText);
    const sum = fa != null && fb != null ? fa + fb : null;
    // 子块改写：开标签 style 内 flex:<num> → flex:1，并补 min-width:0（防等分溢出）
    const one = (blockText) => {
      const gt = blockText.indexOf('>');
      if (gt < 0) return blockText;
      const openTag = blockText.slice(0, gt + 1);
      let newOpen = openTag.replace(/(style="[^"]*?)flex:\s*[\d.]+/i, '$1flex:1');
      if (/style="/.test(newOpen) && !/min-width/.test(newOpen)) {
        newOpen = newOpen.replace(/style="/, 'style="min-width:0;');
      }
      return newOpen + blockText.slice(gt + 1);
    };
    const indentMatch = /^[ \t]*/.exec(aText);
    const indent = indentMatch ? indentMatch[0] : '        ';
    const wrapStyle =
      `${sum != null ? `flex:${sum};` : ''}min-height:0;display:flex;flex-direction:row;` +
      `${gap != null && gap > 0 ? `gap:${gap}px;` : ''}`;
    const replacement =
      `${indent}<div data-rowpeers-wrap style="${wrapStyle}">\n` +
      `${one(aText)}\n` +
      `${one(bText)}\n` +
      `${indent}</div>`;
    content = content.slice(0, aBlk.start) + replacement + content.slice(bBlk.end);
    changes.push({ pair: [aId, bId], gap, flexSum: sum });
  }

  if (changes.some((c) => !c.skipped)) {
    return { files: { ...files, [indexVuePath]: content }, changes };
  }
  return { files, changes };
}

// ─────────────────────────────── 刀 33 ───────────────────────────────

/**
 * 顶层类规则扫描（brace 配对，只取**第一层**属性，嵌套/& 伪类不进判定域）。
 * 返回 Map<class, { props: Map<prop, value>, blockStart, blockEnd, bodyStart }>
 */
function scanTopLevelClassRules(css) {
  const out = new Map();
  const re = /\.([A-Za-z_][\w-]*)\s*\{/g;
  let m;
  while ((m = re.exec(css))) {
    const cls = m[1];
    const bodyStart = m.index + m[0].length;
    let depth = 1;
    let i = bodyStart;
    while (i < css.length && depth > 0) {
      const ch = css[i];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      i++;
    }
    if (depth !== 0) break; // 括号失衡交由编译门禁，不做半截解析
    const body = css.slice(bodyStart, i - 1);
    if (!out.has(cls)) {
      const props = new Map();
      for (const prop of LAYOUT_PROPS) {
        const pm = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'm').exec(body);
        if (pm) props.set(prop, pm[1].trim());
      }
      out.set(cls, { props, blockStart: m.index, blockEnd: i, bodyStart });
    }
  }
  return out;
}

/** 提取 SFC <style> 块内容（lang=less 与否均可） */
function extractSfcStyle(content) {
  const m = /<style[^>]*>([\s\S]*?)<\/style>/.exec(content || '');
  return m ? m[1] : '';
}

/**
 * 刀 33：SFC × common.less 同名类布局属性冲突统一（以 SFC 为唯一语义源）。
 *
 * 判据：class C 在某 .vue `<style>` 有定义 ⇒ common.less 顶层同名类的 LAYOUT_PROPS 以
 *   SFC 为准归一：
 *   - SFC 声明了属性且 common 值不同 ⇒ 覆写为 SFC 值；
 *   - SFC **未**声明该属性 ⇒ 删除 common 中该行（SFC 缺省语义才是真值——flex 容器缺省
 *     justify-content:flex-start，残留 center 在 row 方向下照样居中，477e185d 实锤）。
 * SFC 无同名类 ⇒ common 不动。
 */
export function healDupClassDirectionConflicts(files) {
  const changes = [];
  const commonPath = Object.keys(files).find(
    (p) => /common\.less$/.test(p) && typeof files[p] === 'string',
  );
  if (!commonPath) return { files, changes };
  let commonCss = files[commonPath];

  // SFC 侧类布局真值。
  // 🛡️ 存量 37 快照重放实锤（2026-10-20）：同名 class 跨 SFC **多份定义/服务不同宿主**
  //   是常态（首版取「任意 SFC 首个定义」当语义源 ⇒ 75 处误伤 DEL）。收窄：只有 class 在
  //   全部 SFC 中**恰好一份定义**（无二义）才允许归一 common.less；多份定义 ⇒ 双源语义
  //   本身有歧义，交人工/门禁，不自动改。
  const sfcLayout = new Map(); // cls → Map<prop, value>（唯一定义时）
  const sfcDefCount = new Map(); // cls → 定义次数
  const sfcClasses = new Set();
  for (const [p, c] of Object.entries(files)) {
    if (!/\.vue$/.test(p) || typeof c !== 'string') continue;
    const style = extractSfcStyle(c);
    if (!style) continue;
    for (const [cls, { props }] of scanTopLevelClassRules(style)) {
      sfcClasses.add(cls);
      sfcDefCount.set(cls, (sfcDefCount.get(cls) || 0) + 1);
      if (props.size > 0 && !sfcLayout.has(cls)) sfcLayout.set(cls, props);
    }
  }
  if (sfcClasses.size === 0) return { files, changes };
  for (const [cls, n] of sfcDefCount) {
    if (n > 1) sfcLayout.delete(cls);
  }

  // common.less 顶层同名类归一（倒序逐块重写防位移）
  const commonRules = scanTopLevelClassRules(commonCss);
  const edits = [];
  for (const [cls, { props, blockStart, blockEnd }] of commonRules) {
    // 收窄：只处理「全部 SFC 中恰好一份定义」的类（无二义才可归一）
    if (!sfcLayout.has(cls)) continue;
    const sfc = sfcLayout.get(cls);
    // 🛡️ 终版收窄（存量 37 快照重放二次实锤）：common 独有属性（SFC 未声明）可能是**有效
    //   布局**（SFC/common 互补拆分），无条件删除 = 误伤（DEL 36 处）。只有存在**直接冲突**
    //   （同名属性两侧值不同）时，common 版才被判定为「过时副本」，整类对齐 SFC（冲突覆写
    //   + SFC 未声明属性一并删除——既然主轴方向都是旧的，其余布局属性不可信）。
    //   无直接冲突 ⇒ 完全不动。
    const hasDirectConflict = LAYOUT_PROPS.some((p) => {
      const cv = props.get(p);
      const sv = sfc.get(p);
      return cv != null && sv != null && cv !== sv;
    });
    if (!hasDirectConflict) continue;
    for (const prop of LAYOUT_PROPS) {
      const commonVal = props.get(prop);
      const sfcVal = sfc.get(prop);
      if (commonVal == null) continue; // common 未写该属性 → 无可归一
      if (sfcVal != null) {
        if (sfcVal !== commonVal) edits.push({ cls, prop, from: commonVal, to: sfcVal, absStart: blockStart, absEnd: blockEnd });
      } else {
        edits.push({ cls, prop, from: commonVal, to: null, absStart: blockStart, absEnd: blockEnd });
      }
    }
  }
  edits.sort((a, b) => b.absStart - a.absStart);
  let lastBlockStart = -1;
  for (const e of edits) {
    // 同一块的多条编辑在同轮从后往前逐块重写会因块内位移互相踩：按块分组一次性重写
    if (e.absStart === lastBlockStart) continue;
    lastBlockStart = e.absStart;
    const block = commonCss.slice(e.absStart, e.absEnd);
    const blockEdits = edits.filter((x) => x.absStart === e.absStart);
    let newBlock = block;
    for (const be of blockEdits) {
      if (be.to != null) {
        newBlock = newBlock.replace(new RegExp(`(${be.prop}\\s*:\\s*)[^;]+`, 'm'), `$1${be.to}`);
      } else {
        newBlock = newBlock.replace(new RegExp(`(?:^|;)\\s*${be.prop}\\s*:\\s*[^;]+;?`, 'm'), (mm) => (mm.trim().endsWith(';') ? ';' : ''));
      }
    }
    commonCss = commonCss.slice(0, e.absStart) + newBlock + commonCss.slice(e.absEnd);
    for (const be of blockEdits) changes.push({ cls: be.cls, prop: be.prop, from: be.from, to: be.to });
  }

  if (changes.length > 0) {
    return { files: { ...files, [commonPath]: commonCss }, changes };
  }
  return { files, changes };
}

// ─────────────────────────────── 刀 34 ───────────────────────────────

/**
 * 刀 34：插槽 × 主体重复渲染移除。
 *
 * 判据：index.vue 中 `<template #slot-name>` 插槽内引用的组件（PascalCase 标签），在主体
 *   模板（**剥掉全部插槽块后**的模板区）中也被使用 ⇒ 同一组件双处渲染，确定性删除插槽块。
 *   （477e185d：HeaderText 被塞进 #header-right，主体金面板内也渲染一份 ⇒ 右上角多出一枚。）
 * 无重复 ⇒ 不动（合法的插槽用法零影响）。
 */
export function healSlotDuplicateRender(files) {
  const changes = [];
  const indexVuePath = Object.keys(files).find(
    (p) => /(^|\/)index\.vue$/.test(p) && typeof files[p] === 'string',
  );
  if (!indexVuePath) return { files, changes };
  let content = files[indexVuePath];

  const slotRe = /[ \t]*<template\s+#([\w-]+)>[\s\S]*?<\/template>[ \t]*\n?/g;
  const slots = [];
  let m;
  while ((m = slotRe.exec(content))) {
    slots.push({ name: m[1], start: m.index, end: m.index + m[0].length, text: m[0] });
  }
  if (slots.length === 0) return { files, changes };

  // 主体 = 模板区剥掉所有插槽块
  let main = content;
  for (const s of slots.slice().reverse()) {
    main = main.slice(0, s.start) + main.slice(s.end);
  }
  const removed = [];
  for (const s of slots) {
    const comps = [...s.text.matchAll(/<([A-Z][A-Za-z0-9]*)[\s/>]/g)].map((x) => x[1]);
    const dup = comps.filter((name) => new RegExp(`<${name}[\\s/>]`).test(main));
    if (dup.length > 0) {
      removed.push({ slot: `#${s.name}`, comps: dup });
      main = main; // 占位：统一在下方从 content 删
    }
  }
  if (removed.length === 0) return { files, changes };
  // 从 content 删除重复插槽块（倒序防位移）
  const removedSlots = new Set(removed.map((r) => r.slot));
  for (const s of slots.slice().reverse()) {
    if (removedSlots.has(`#${s.name}`)) {
      content = content.slice(0, s.start) + content.slice(s.end);
      changes.push({ slot: `#${s.name}`, comps: removed.find((r) => r.slot === `#${s.name}`).comps });
    }
  }
  return { files: { ...files, [indexVuePath]: content }, changes };
}

// ─────────────────────────────── 刀 35 ───────────────────────────────

/** 顶层类规则 → 全属性 Map（刀 35 专用，比 scanTopLevelClassRules 多解析 width 等） */
function parseClassProps(css) {
  const out = new Map();
  const re = /\.([A-Za-z_][\w-]*)\s*\{/g;
  let m;
  while ((m = re.exec(css))) {
    const bodyStart = m.index + m[0].length;
    let depth = 1;
    let i = bodyStart;
    while (i < css.length && depth > 0) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') depth--;
      i++;
    }
    if (depth !== 0) break;
    const body = css.slice(bodyStart, i - 1);
    if (!out.has(m[1])) {
      const props = new Map();
      for (const decl of body.split(';')) {
        const pm = /^\s*([a-z-]+)\s*:\s*(.+)$/i.exec(decl);
        if (pm) props.set(pm[1].toLowerCase(), pm[2].trim());
      }
      out.set(m[1], props);
    }
  }
  return out;
}

/** 在 css 中把 cls 顶层规则块内的 prop: oldValue 翻转为 newValue（仅首个匹配块） */
function flipClassProp(css, cls, prop, newValue) {
  const re = new RegExp(`\\.(${cls})\\s*\\{`);
  const m = re.exec(css);
  if (!m) return { css, changed: false };
  const bodyStart = m.index + m[0].length;
  let depth = 1;
  let i = bodyStart;
  while (i < css.length && depth > 0) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') depth--;
    i++;
  }
  if (depth !== 0) return { css, changed: false };
  const body = css.slice(bodyStart, i - 1);
  const reProp = new RegExp(`(${prop}\\s*:\\s*)[^;]+`);
  if (!reProp.test(body)) return { css, changed: false };
  const newBody = body.replace(reProp, `$1${newValue}`);
  return { css: css.slice(0, bodyStart) + newBody + css.slice(i - 1), changed: true };
}

/**
 * 刀 35：v-for 溢出 row 翻转（**真值缺位兜底**，2026-10-20 ae911370 实锤）。
 *
 * 同族事故第三次（47647fae / ee06ee24 / ae911370）：Figma 选区只框单卡 ⇒ 列表结构不在
 * 真值里 ⇒ 刀 30（段角色 fail-open）/刀 31（重复实例几何）/LAYOUT-001 全部失明。LLM 从
 * 视觉补出 v-for 数据（6 条全对）却把列表挂进单卡横排容器（row 语义）⇒ 6×width:100%
 * 数学上必然溢出：首卡占满、其余挤出、stretch 拉爆。
 *
 * 判据（**纯产物内数学矛盾，零 figma 依赖**）：
 *   容器 class C 样式 flex-direction:row ∧ 模板中 C 的直接子级是 v-for 元素
 *   ∧ 该元素 class I 样式 width:100% ⇒ 方向必错 ⇒ 确定性翻转 C 为 column
 *   （SFC 与 common.less 双源同翻——三源改一漏二教训）。
 * 不判（阳性守卫）：子级非 v-for（单元素 100% 合法）；item 非 100% 宽（合法横向流）。
 * 幂等：翻转后父为 column ⇒ 判据不再命中。
 */
export function healVForOverflowRow(files) {
  const changes = [];
  // ① 模板收集 (容器class, v-for子元素class) 对
  const pairSet = new Set();
  for (const [p, c] of Object.entries(files)) {
    if (typeof c !== 'string' || !/\.vue$/.test(p)) continue;
    const tplM = /<template>([\s\S]*)<\/template>/.exec(c);
    const tpl = tplM ? tplM[1] : '';
    // 容器开标签（带 class）→ 紧随子元素开标签（带 v-for）
    const re = /<\w+\b[^>]*?\bclass="([^"]+)"[^>]*?>(?=\s*<\w+\b)/g;
    let m;
    while ((m = re.exec(tpl))) {
      const rest = tpl.slice(re.lastIndex);
      const childM = /^\s*(<\w+\b[^>]*>)/.exec(rest);
      if (!childM) continue;
      if (!/\sv-for=/.test(childM[1])) continue;
      const cCls = m[1].trim().split(/\s+/)[0];
      const iClsM = /\bclass="([^"]+)"/.exec(childM[1]);
      if (!iClsM) continue;
      const iCls = iClsM[1].trim().split(/\s+/)[0];
      if (cCls && iCls) pairSet.add(`${cCls}|${iCls}`);
    }
  }
  if (pairSet.size === 0) return { files, changes };

  // ② 样式源：SFC style 块 + common.less（index.css 是编译产物，less 源翻后由编译链刷新）
  const styleSources = [];
  for (const [p, c] of Object.entries(files)) {
    if (typeof c !== 'string') continue;
    if (/\.vue$/.test(p)) {
      const sm = /<style[^>]*>([\s\S]*?)<\/style>/.exec(c);
      if (sm) styleSources.push({ path: p, css: sm[1], kind: 'sfc', vuePath: p });
    } else if (/common\.less$/.test(p)) {
      styleSources.push({ path: p, css: c, kind: 'common' });
    }
  }

  // ③ 判定 + 双源翻转
  let result = { ...files };
  for (const key of pairSet) {
    const [cCls, iCls] = key.split('|');
    let containerRow = false;
    let itemFull = false;
    for (const s of styleSources) {
      const rules = parseClassProps(s.css);
      const cr = rules.get(cCls);
      const ir = rules.get(iCls);
      if (cr && cr.get('flex-direction') === 'row') containerRow = true;
      if (ir && /^100%$/.test(ir.get('width') || '')) itemFull = true;
    }
    if (!containerRow || !itemFull) continue; // 阳性守卫：不满足数学矛盾不动
    for (const s of styleSources) {
      const rules = parseClassProps(s.css);
      if (!rules.get(cCls) || rules.get(cCls).get('flex-direction') !== 'row') continue;
      if (s.kind === 'sfc') {
        const vm = /(<style[^>]*>)([\s\S]*?)(<\/style>)/.exec(result[s.vuePath]);
        const flipped = flipClassProp(vm[2], cCls, 'flex-direction', 'column');
        if (flipped.changed) {
          result[s.vuePath] = result[s.vuePath].replace(vm[0], vm[1] + flipped.css + vm[3]);
          changes.push({ container: cCls, item: iCls, file: s.path, rowToColumn: true });
        }
      } else {
        const flipped = flipClassProp(result[s.path], cCls, 'flex-direction', 'column');
        if (flipped.changed) {
          result[s.path] = flipped.css;
          changes.push({ container: cCls, item: iCls, file: s.path, rowToColumn: true });
        }
      }
    }
  }
  if (changes.length > 0) return { files: result, changes };
  return { files, changes };
}

// ─────────────────────────────── 刀 36 ───────────────────────────────

/** 取 SFC 模板正文（含注释；多模板取第一段） */
function templateOf(content) {
  const m = /<template[^>]*>([\s\S]*)<\/template>/.exec(content || '');
  return m ? m[1] : null;
}

/**
 * 文件「可见内容」签名：模板静态文本 ∪ defineProps 默认字符串。
 * 只看**人能看见的东西**（静态文本、props 默认值渲染出的文本、是否有 img），
 * 不解析表达式、不推断数据 —— 判据要窄，宁可漏判不可错删。
 */
export function collectRenderedSurface(fileContent) {
  const tpl = templateOf(fileContent);
  const texts = new Set();
  if (!tpl) return { texts, hasImg: false };
  const noComment = tpl.replace(/<!--[\s\S]*?-->/g, '');
  const hasImg = /<img\b/.test(noComment);
  // 标签之间的文本片段；`{{ }}` 绑定位置留空（其值由 props 默认值补）
  for (const part of noComment.split(/<[^>]*>/)) {
    const cleaned = part
      .replace(/\{\{[\s\S]*?\}\}/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned) texts.add(cleaned);
  }
  // defineProps 默认值（`default: 'xx'`）—— 绑定的文本在无数据时就是它
  const dp = /\bdefineProps\s*\(/.exec(fileContent || '');
  if (dp) {
    let depth = 1;
    let i = dp.index + dp[0].length;
    const start = i;
    while (i < fileContent.length && depth > 0) {
      if (fileContent[i] === '(') depth++;
      else if (fileContent[i] === ')') depth--;
      i++;
    }
    const body = fileContent.slice(start, i - 1);
    for (const m of body.matchAll(/default\s*:\s*(['"`])([^'"`]*)\1/g)) {
      const v = m[2].replace(/\s+/g, ' ').trim();
      if (v) texts.add(v);
    }
  }
  return { texts, hasImg };
}

/** 组件文件根元素的 data-section-id（模板里第一个声明；组件契约：根即其 section） */
function resolveComponentRootSection(files, tag) {
  const path = Object.keys(files).find(
    (p) => new RegExp(`(^|/)${tag}\\.vue$`).test(p) && typeof files[p] === 'string',
  );
  if (!path) return null;
  const tpl = templateOf(files[path]);
  if (!tpl) return null;
  const m = /data-section-id="([^"]+)"/.exec(tpl);
  return m ? { path, sectionId: m[1] } : null;
}

/** J 的可见内容是否已被 I 覆盖（文本全包含；J 无文本时退化为「I 有 img」判据） */
function surfaceCovers(inner, outer) {
  if (!outer) return false;
  if (inner.texts.size === 0) {
    // 纯图形叶子（icon 等）：I 也必须是图形，否则删了就丢图
    return inner.hasImg ? outer.hasImg : false;
  }
  for (const t of inner.texts) {
    if (![...outer.texts].some((o) => o.includes(t))) return false;
  }
  return true;
}

/** 删除模板块内某实例所在的整行（含缩进）；自闭合与成对标签都支持 */
function removeInstanceAt(tpl, index, tag) {
  const lineStart = tpl.lastIndexOf('\n', index) + 1;
  const indent = tpl.slice(lineStart, index);
  if (!/^[ \t]*$/.test(indent)) return null; // 不独占一行 ⇒ 不动（保守）
  let end;
  const openEnd = tpl.indexOf('>', index);
  if (openEnd < 0) return null;
  if (tpl[openEnd - 1] === '/') {
    end = openEnd + 1;
  } else {
    const close = tpl.indexOf(`</${tag}>`, openEnd);
    if (close < 0) return null;
    end = close + `</${tag}>`.length;
  }
  const lineEnd = tpl.indexOf('\n', end);
  const stop = lineEnd < 0 ? tpl.length : lineEnd + 1;
  return { start: lineStart, end: stop };
}

/**
 * 刀 36：父容器「自嵌套」双重渲染折叠（2026-10-21 · 07ae49a2 实锤）。
 *
 * 事故形态：卡容器 38:3260 既被拆成子组件（根 data-section-id="38:3260" 的整卡组件），
 *   又和它的三个子节点一起被拆成同级组件 ⇒ index.vue 里
 *   `<div data-section-id="38:3260">` 内又渲染了一个根也是 38:3260 的组件实例，
 *   同一张卡渲染两遍（「合作厂商」「优质厂商」各出现两次）。
 *
 * 判据（纯产物内结构矛盾，零 figma / 零命名）：
 *   元素 W 声明 data-section-id=S ∧ W 内存在组件实例 I，其**文件根** data-section-id 也是 S
 *   ⇒ I 已整体渲染 S，W 内部其余实例与 I 内容重叠。
 *   对每个同级实例 J（根 ≠ S）：仅当 `collectRenderedSurface(I) ⊇ collectRenderedSurface(J)`
 *   才删 J —— **内容覆盖是删除的前提**，覆盖不了就保留（宁可重复，不可丢内容）。
 *
 * 修复：删被覆盖的同级实例；把 I 的 flex 提为 1（W 是布局容器，独占时按比例会缩到 0.19 卡宽）。
 * 不判（阳性守卫）：无自嵌套实例 / 实例根 id 与 W 不同（正常的父子组件嵌套）。
 * 幂等：折叠后 W 内只剩 I 与未被覆盖的实例，复跑无新增变更。
 */
export function healSelfNestedCardCollapse(files) {
  const changes = [];
  if (!files || typeof files !== 'object') return { files, changes };

  for (const [path, content] of Object.entries(files)) {
    if (typeof content !== 'string' || !/\.vue$/.test(path)) continue;
    const origTpl = templateOf(content);
    if (!origTpl) continue;
    const tplAt = content.indexOf(origTpl);
    if (tplAt < 0) continue;
    let tpl = origTpl;
    let dirty = false;

    // 逐个 section 容器处理（自外向内无冲突：每个 W 独立重算下标，靠 while 重取模板）
    for (let guard = 0; guard < 8; guard++) {
      const found = findSelfNestedContainer(files, tpl);
      if (!found) break;
      const { sectionId, selfTag, removeTags, flexTo } = found;
      if (removeTags.length === 0 && flexTo == null) break; // 无动作 ⇒ 已是终态（幂等）
      let next = tpl;
      // ① 从后往前删被覆盖的同级实例（防下标位移）
      for (const r of removeTags.slice().sort((a, b) => b.index - a.index)) {
        const span = removeInstanceAt(next, r.index, r.tag);
        if (!span) continue;
        next = next.slice(0, span.start) + next.slice(span.end);
        changes.push({ file: path, action: 'drop-duplicate-instance', sectionId, tag: r.tag });
      }
      // ② 自身实例 flex → 1（仅当它当前带比例 flex 且独占容器）
      if (flexTo != null) {
        const selfRe = new RegExp(`<${selfTag}\\b[^>]*>`);
        const sm = selfRe.exec(next);
        if (sm) {
          const tagText = sm[0];
          const patched = tagText.replace(
            /style="([^"]*)"/,
            (_all, css) =>
              `style="${css.replace(/(^|;)\s*flex\s*:\s*[\d.]+/, '$1flex:1')}"`,
          );
          if (patched !== tagText) {
            next = next.replace(tagText, patched);
            changes.push({ file: path, action: 'promote-self-instance', sectionId, tag: selfTag, flex: flexTo });
          }
        }
      }
      tpl = next;
      dirty = true;
    }

    if (!dirty) continue;

    // ③ 回填模板区（script/style 区不动），再清理失效 import（标签在模板中已不存在）
    let out = content.slice(0, tplAt) + tpl + content.slice(tplAt + origTpl.length);
    const body = templateOf(out) || '';
    out = out
      .split('\n')
      .filter((line) => {
        const im = /^\s*import\s+([A-Z][A-Za-z0-9]*)\s+from\s+['"][^'"]+['"];?\s*$/.exec(line);
        if (!im) return true;
        const stillUsed = new RegExp(`<${im[1]}\\b`).test(body);
        if (!stillUsed) changes.push({ file: path, action: 'drop-unused-import', tag: im[1] });
        return stillUsed;
      })
      .join('\n');
    files[path] = out;
  }

  return { files, changes };
}

/**
 * 找一个「自嵌套」容器并算好修复动作（刀 36 内部）。
 * 返回 { sectionId, selfTag, removeTags:[{index,tag}], flexTo } | null
 */
function findSelfNestedContainer(files, tpl) {
  // 模板内所有带 data-section-id 的元素起点
  const starts = [];
  const re = /<([a-zA-Z][\w-]*)\b[^>]*\bdata-section-id="([^"]+)"[^>]*>/g;
  let m;
  while ((m = re.exec(tpl))) starts.push({ rank: m.index, tag: m[1], sectionId: m[2] });

  for (const w of starts) {
    const sid = w.sectionId;
    // 容器块范围：div 用配对深度；其它标签退化为「到下一个同级声明之前」
    let blockStart = w.rank;
    let blockEnd = tpl.length;
    if (w.tag === 'div') {
      const block = findSectionDivBlock(tpl, sid);
      if (!block) continue;
      blockStart = block.start;
      blockEnd = block.end;
    } else {
      const close = tpl.indexOf(`</${w.tag}>`, w.rank);
      if (close < 0) continue;
      blockEnd = close + `</${w.tag}>`.length;
    }
    const body = tpl.slice(blockStart, blockEnd);

    // 块内组件实例（PascalCase 开标签；相对下标 + 块起点 = 绝对下标）
    const instances = [];
    for (const im of body.matchAll(/<([A-Z][A-Za-z0-9]*)\b[^>]*?(\/?)>/g)) {
      const root = resolveComponentRootSection(files, im[1]);
      if (!root) continue;
      instances.push({
        tag: im[1],
        rootSection: root.sectionId,
        index: blockStart + im.index,
        path: root.path,
      });
    }
    const self = instances.find((i) => i.rootSection === sid);
    if (!self) continue; // 无自嵌套 ⇒ 不判

    // 同级实例（排除自身；W 内更深层的实例也一并纳入 —— 它们同样与自嵌套内容重叠）
    const others = instances.filter((i) => i !== self);
    const outer = collectRenderedSurface(files[self.path] || '');
    const removeTags = [];
    for (const o of others) {
      const inner = collectRenderedSurface(files[o.path] || '');
      if (surfaceCovers(inner, outer)) removeTags.push({ index: o.index, tag: o.tag });
    }
    // flex 提升：仅当自身实例当前是比例 flex 且删除后独占容器
    const selfTagText = /<([A-Z][A-Za-z0-9]*)\b[^>]*>/.exec(tpl.slice(self.index))?.[0] || '';
    const flexM = /style="[^"]*\bflex\s*:\s*([\d.]+)/.exec(selfTagText);
    const flexTo = flexM && Number(flexM[1]) !== 1 && others.length > 0 ? 1 : null;
    if (removeTags.length === 0 && flexTo == null) continue; // 该容器已终态 ⇒ 继续看下一个
    return { sectionId: sid, selfTag: self.tag, removeTags, flexTo };
  }
  return null;
}

// ─────────────────────────────── 统一入口 ───────────────────────────────

/**
 * 统一入口（pre-write-self-healing ⑭ 接线）。
 * 返回 { files, summary: { rowpeersWrap, dupClassDirection, slotDupRender, vforOverflowRow, selfNestedCollapse, details } }
 * 顺序：刀 34（删插槽重复）→ 刀 32（包裹并列）→ 刀 33（样式归一）→ 刀 35（v-for 溢出翻转）
 *      → 刀 36（自嵌套折叠，**最后**：它改 DOM 层级，须读最终形态）。
 */
export function healStructuralTruth(files, ctx = {}, deps = {}) {
  const { logger } = deps;
  let result = files;
  const summary = {
    rowpeersWrap: 0,
    dupClassDirection: 0,
    slotDupRender: 0,
    vforOverflowRow: 0,
    selfNestedCollapse: 0,
    details: [],
  };

  try {
    const r34 = healSlotDuplicateRender(result);
    result = r34.files;
    if (r34.changes.length > 0) {
      summary.slotDupRender = r34.changes.length;
      summary.details.push(...r34.changes.map((c) => ({ knife: 34, ...c })));
      logger?.warn?.('🛡️ 刀 34 修复：插槽 × 主体重复渲染，已删插槽侧', { changes: r34.changes });
    }
  } catch (err) {
    logger?.warn?.('🛡️ 刀 34 异常（fail-open）', { error: err?.message || String(err) });
  }

  try {
    const r32 = healRowPeersWrap(result, ctx);
    result = r32.files;
    const applied = r32.changes.filter((c) => !c.skipped);
    if (applied.length > 0) {
      summary.rowpeersWrap = applied.length;
      summary.details.push(...applied.map((c) => ({ knife: 32, ...c })));
      logger?.warn?.('🛡️ 刀 32 修复：rowPeers 互挂兄弟被父 column 堆叠，已包 row 容器（gap=figma 真值）', {
        changes: applied,
      });
    }
  } catch (err) {
    logger?.warn?.('🛡️ 刀 32 异常（fail-open）', { error: err?.message || String(err) });
  }

  try {
    const r33 = healDupClassDirectionConflicts(result);
    result = r33.files;
    if (r33.changes.length > 0) {
      summary.dupClassDirection = r33.changes.length;
      summary.details.push(...r33.changes.map((c) => ({ knife: 33, ...c })));
      logger?.warn?.('🛡️ 刀 33 修复：SFC × common.less 同名类布局冲突，已按 SFC 统一', { changes: r33.changes });
    }
  } catch (err) {
    logger?.warn?.('🛡️ 刀 33 异常（fail-open）', { error: err?.message || String(err) });
  }

  try {
    const r35 = healVForOverflowRow(result);
    result = r35.files;
    if (r35.changes.length > 0) {
      summary.vforOverflowRow = r35.changes.length;
      summary.details.push(...r35.changes.map((c) => ({ knife: 35, ...c })));
      logger?.warn?.('🛡️ 刀 35 修复：row 容器 × v-for × item width:100% 数学矛盾，已翻转 column（真值缺位兜底）', {
        changes: r35.changes,
      });
    }
  } catch (err) {
    logger?.warn?.('🛡️ 刀 35 异常（fail-open）', { error: err?.message || String(err) });
  }

  try {
    const r36 = healSelfNestedCardCollapse(result);
    result = r36.files;
    if (r36.changes.length > 0) {
      summary.selfNestedCollapse = r36.changes.length;
      summary.details.push(...r36.changes.map((c) => ({ knife: 36, ...c })));
      logger?.warn?.('🛡️ 刀 36 修复：父容器自嵌套双重渲染，已按内容覆盖折叠同级实例', {
        changes: r36.changes,
      });
    }
  } catch (err) {
    logger?.warn?.('🛡️ 刀 36 异常（fail-open）', { error: err?.message || String(err) });
  }

  return { files: result, summary };
}
