/**
 * @file panel-chrome-misplacement.js — 刀 42-B（2026-10-21 · mc-1792580653375-60212fb6 实锤）：
 *   「面板装饰被搬到子元素」⇒ 从子元素移除，让三件套只落在面板容器上。
 *
 * 事故形态（真机产物）：
 *   三段面板容器 `38:3137/3162/3206`（class `.c-60212f-container`）**零背景零圆角零发光**，
 *   而三段**标题行**的 class 各自写着：
 *     `.c-60212f-header-text  { background: @color-bg-vendor-gold;  border-radius: 12px; box-shadow: inset 0px 0px 16px 0px #ffc800; }`
 *     `.c-60212f-header-text2 { background: @color-bg-vendor-mint;  border-radius: 12px; box-shadow: inset 0px 0px 16px 0px rgba(53, 190, 82, 0.82); }`
 *     `.c-60212f-header-text3 { background: @color-bg-page;        border-radius: 12px; box-shadow: inset 0px 0px 16px 0px rgba(25, 181, 186, 0.67); }`
 *   ⇒ 用户看到的「三个 section 样式不统一」= 面板底被画在了标题条上：战略段成一条黄条、
 *   优质段成一块绿砖、普通段只剩半截。刀 42-A 把三件套补回面板容器后，若不摘掉标题行的
 *   同一份装饰，会变成「面板里再套一条同色条」——依旧不统一。
 *
 * 判据（**装饰归属反查**，命名无关、零硬编码色值、fail-open）：
 *   ① 元素 X（`data-section-id=S`）自身**没有**面板底真值（`resolveSectionPanel(S) === null`）；
 *   ② X 的 inline 或其 class 同时声明了 `border-radius: R` 与 `box-shadow: ...`；
 *   ③ 存在**唯一**一个 section A（A ≠ S）其面板底真值满足 `P.radius === R` 且
 *      `P.shadow` 的颜色（RGB，忽略 alpha）与 X 的 box-shadow 首个颜色相同；
 *   ④ ⇒ 判定「A 的面板装饰被搬到了 X」，从 X 的 inline 与**专属 class**里删除
 *      `background` / `border-radius` / `box-shadow` 三条声明。
 *
 * 为什么要求「唯一」：同色 + 同圆角若对应多个 section，说明证据不足（可能只是巧合撞上
 *   同款色板）⇒ 宁可不改（fail-open）。真机三段是金/绿/青三色，各只对应一个面板。
 *
 * 边界（阴性对照）：
 *   · 共享 class 不动 —— 复用刀 38 的 `isClassExclusiveTo`（同一份判据，不另写一套）。
 *   · 卡片自己的小圆角（4/6px）与面板 r12 不等 ⇒ 不触发。
 *   · 无 `box-shadow` 只有背景的元素 ⇒ 不触发（③ 需要圆角+发光双证据）。
 *   · 有自身面板底真值的元素 ⇒ 直接跳过（它是真面板，三件套是它的）。
 *
 * 纯函数、零 import.meta，幂等（删除后②不成立 ⇒ 复跑零变更）。
 */
import { indexFigmaNodes, resolveSectionPanel, collectClassProp, parseLessVars } from './container-background-truth.js';
import {
  collectClassUsages,
  isClassExclusiveTo,
  stripDeclsFromInline,
  hasDeclInInline,
  stripDeclsFromClassRules,
} from './border-without-strokes.js';

/** 目标属性：面板三件套 */
export function isPanelChromeProp(prop) {
  const p = String(prop || '').toLowerCase();
  return p === 'background' || p === 'background-color' || p === 'background-image'
    || p === 'border-radius' || p === 'box-shadow';
}

/** 取 CSS 里的第一个颜色 token → `r,g,b`（忽略 alpha）；取不到返回 null */
export function shadowColorKey(value) {
  const v = String(value || '');
  const hex = /#([0-9a-fA-F]{3,8})\b/.exec(v);
  if (hex) {
    let h = hex[1].toLowerCase();
    if (h.length === 3 || h.length === 4) {
      h = h.slice(0, 3).split('').map((c) => c + c).join('');
    }
    if (h.length >= 6) {
      return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(',');
    }
    return null;
  }
  const rgb = /rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)/i.exec(v);
  if (rgb) return [1, 2, 3].map((i) => Math.round(Number(rgb[i]))).join(',');
  return null;
}

/** 取 `border-radius` 的首个数值（`12px` / `12px 12px` / `@radius` 解析后） */
export function radiusNumber(value) {
  const m = /(-?\d+(?:\.\d+)?)\s*(px|rem|em|%)?/.exec(String(value || ''));
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/** 元素开标签里的 class 列表 */
function classTokens(tagText) {
  const m = /\bclass="([^"]*)"/.exec(tagText || '');
  return m ? m[1].split(/\s+/).filter(Boolean) : [];
}

/** 解析 inline style → { prop: value } */
function inlineProps(styleText) {
  const out = {};
  for (const seg of String(styleText || '').split(';')) {
    const t = seg.trim();
    if (!t) continue;
    const m = /^([a-zA-Z-]+)\s*:\s*([\s\S]*)$/.exec(t);
    if (m) out[m[1].toLowerCase()] = m[2].trim();
  }
  return out;
}

/** SFC 里所有 style 块正文 */
function styleBodies(content) {
  return [...String(content || '').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
}

/**
 * 刀 42-B 主体。
 * @param {Record<string,string>} files 产物文件集
 * @param {object} ctx `{ figmaRoot }`
 * @returns {{ files, changes: Array }}
 */
export function healPanelChromeMisplacement(files, { figmaRoot } = {}) {
  const changes = [];
  if (!files || typeof files !== 'object') return { files, changes };
  if (!figmaRoot) return { files, changes, skipped: [{ reason: 'no-figma-root' }] };

  const figmaIndex = indexFigmaNodes(figmaRoot);
  if (figmaIndex.size === 0) return { files, changes, skipped: [{ reason: 'empty-figma-index' }] };

  // ① 全量面板真值 + 「发光颜色 → section 集合」反查表
  const panelBySection = new Map();
  const ownersByShadowKey = new Map();
  for (const id of figmaIndex.keys()) {
    const panel = resolveSectionPanel(id, figmaIndex);
    if (!panel) continue;
    panelBySection.set(id, panel);
    const key = shadowColorKey(panel.shadow);
    if (!key) continue;
    if (!ownersByShadowKey.has(key)) ownersByShadowKey.set(key, new Set());
    ownersByShadowKey.get(key).add(id);
  }
  if (panelBySection.size === 0) return { files, changes, skipped: [{ reason: 'no-panel-truth' }] };

  const cssSources = [];
  for (const [p, c] of Object.entries(files)) {
    if (typeof c !== 'string') continue;
    if (/\.vue$/.test(p)) cssSources.push(...styleBodies(c));
    else if (/common\.less$/.test(p)) cssSources.push(c);
  }
  const lessVars = (() => {
    const merged = new Map();
    for (const [p, c] of Object.entries(files)) {
      if (typeof c === 'string' && /theme-vars\.less$/.test(p)) {
        for (const [k, v] of parseLessVars(c)) if (!merged.has(k)) merged.set(k, v);
      }
    }
    return merged;
  })();
  const resolveVars = (v) =>
    String(v || '').replace(/@([\w-]+)/g, (all, name) => (lessVars.has(name) ? lessVars.get(name) : all));
  const propMaps = cssSources.map((css) => ({
    'border-radius': collectClassProp(css, 'border-radius'),
    'box-shadow': collectClassProp(css, 'box-shadow'),
  }));
  const declaredProp = (cls, prop) => {
    for (const mp of propMaps) {
      const v = mp[prop].get(cls);
      if (v) return v;
    }
    return null;
  };

  const usages = collectClassUsages(files);
  const classesToStrip = new Map(); // cls → owner sectionId（留痕用）
  const orphanClasses = new Set(); // 仅由「无 data-section-id 元素」使用的 class（走 class 级兜底）

  for (const [path, content] of Object.entries(files)) {
    if (typeof content !== 'string' || !/\.vue$/.test(path)) continue;
    const tagRe = /<([a-zA-Z][\w-]*)\b[^>]*\bdata-section-id="([^"]+)"[^>]*>/g;
    const tags = [];
    let m;
    while ((m = tagRe.exec(content))) tags.push({ tag: m[0], sectionId: m[2], index: m.index });

    let next = content;
    let dirty = false;
    for (const t of tags.reverse()) {
      const sid = String(t.sectionId);
      if (panelBySection.has(sid)) continue; // 它自己就是面板 ⇒ 三件套本就属于它

      const classes = classTokens(t.tag);
      const styleAttr = /\bstyle="([^"]*)"/.exec(t.tag);
      const inline = inlineProps(styleAttr ? styleAttr[1] : '');

      const radiusVal = inline['border-radius'] ?? classes.map((c) => declaredProp(c, 'border-radius')).find(Boolean);
      const shadowVal = inline['box-shadow'] ?? classes.map((c) => declaredProp(c, 'box-shadow')).find(Boolean);
      if (!radiusVal || !shadowVal) continue;

      const r = radiusNumber(resolveVars(radiusVal));
      const key = shadowColorKey(resolveVars(shadowVal));
      if (r == null || !key) continue;

      const candidates = Array.from(ownersByShadowKey.get(key) || []).filter(
        (a) => a !== sid && panelBySection.get(a).radius === r,
      );
      if (candidates.length !== 1) continue; // 无证据或证据不唯一 ⇒ 不改（fail-open）
      const owner = candidates[0];

      // ② inline 删除（元素级，安全）
      if (styleAttr && hasDeclInInline(styleAttr[1], isPanelChromeProp)) {
        const stripped = stripDeclsFromInline(styleAttr[1], isPanelChromeProp);
        let newTag = stripped.trim()
          ? t.tag.replace(styleAttr[0], `style="${stripped}"`)
          : t.tag.replace(/\s*style="[^"]*"/, '');
        next = next.slice(0, t.index) + newTag + next.slice(t.index + t.tag.length);
        dirty = true;
        changes.push({ file: path, sectionId: sid, owner, where: 'inline' });
      }

      // ③ 专属 class 收集（共享 class 一律不动）
      for (const cls of classes) {
        if (isClassExclusiveTo(cls, sid, usages) && !classesToStrip.has(cls)) {
          classesToStrip.set(cls, owner);
        }
      }
    }
    if (dirty) files[path] = next;
  }

  // ②-b class 级兜底（2026-10-22 · mc-1792635089793-2d4305b7 实锤）：
  //   真机 `.c-2d4305-header-text`（战略标题）挂在 HeaderText.vue 的根 div 上，而该 div
  //   **漏了 `data-section-id`**（另两段 HeaderText2/3 都有）⇒ 元素级判据拿不到 `sid`，
  //   `isClassExclusiveTo` 恒 false ⇒ 战略段标题的金色双条没被摘掉（另两段已摘）。
  //   判据：该 class 的声明本身就是「圆角 R + 发光 K」，且 (R,K) 反查到**唯一** owner A；
  //   A 的 section 元素**没在用**这个 class（⇒ 它不是面板自己的 class）；
  //   且没有任何「有自己面板真值」的 section 在用 ⇒ 摘。使用点全部无归属也照摘。
  if (cssSources.length > 0) {
    const radiusMap = new Map();
    const shadowMap = new Map();
    for (const css of cssSources) {
      for (const [cls, v] of collectClassProp(css, 'border-radius')) {
        if (!radiusMap.has(cls)) radiusMap.set(cls, v);
      }
      for (const [cls, v] of collectClassProp(css, 'box-shadow')) {
        if (!shadowMap.has(cls)) shadowMap.set(cls, v);
      }
    }
    for (const [cls, radiusVal] of radiusMap) {
      if (classesToStrip.has(cls)) continue;
      const shadowVal = shadowMap.get(cls);
      if (!shadowVal) continue;
      const usage = usages.get(cls);
      if (!usage) continue; // 声明了但没有任何元素使用 ⇒ 死规则，不动
      // 只认「唯一使用点且该点无 section 归属」：多使用点 = 共享 class，铁律一律不动
      if (usage.orphanTags !== 1 || usage.sids.size !== 0) continue;
      const r = radiusNumber(resolveVars(radiusVal));
      const key = shadowColorKey(resolveVars(shadowVal));
      if (r == null || !key) continue;
      const candidates = Array.from(ownersByShadowKey.get(key) || []).filter(
        (a) => panelBySection.get(a).radius === r,
      );
      if (candidates.length !== 1) continue;
      const owner = candidates[0];
      if (usage.sids.has(owner)) continue; // 就是面板自己的 class
      if (Array.from(usage.sids).some((s) => panelBySection.has(s))) continue; // 别的面板在用
      classesToStrip.set(cls, owner);
      orphanClasses.add(cls); // 只打标，实际变更由 ④ 按文件如实记录
    }
  }

  // ④ 改写 class 规则（common.less + 各 SFC 的 style 块）
  if (classesToStrip.size > 0) {
    const list = Array.from(classesToStrip.keys());
    for (const [path, content] of Object.entries(files)) {
      if (typeof content !== 'string') continue;
      if (/common\.less$/.test(path)) {
        const stripped = stripDeclsFromClassRules(content, list, isPanelChromeProp);
        if (stripped !== content) {
          files[path] = stripped;
          for (const cls of list) {
            if (stripDeclsFromClassRules(content, [cls], isPanelChromeProp) !== content) {
              changes.push({
                file: path,
                sectionId: null,
                owner: classesToStrip.get(cls),
                where: orphanClasses.has(cls) ? 'class-orphan' : 'class',
                cls,
              });
            }
          }
        }
        continue;
      }
      if (!/\.vue$/.test(path)) continue;
      const re = /<style[^>]*>([\s\S]*?)<\/style>/g;
      const ranges = [];
      let mm;
      while ((mm = re.exec(content))) {
        const start = mm.index + mm[0].indexOf(mm[1]);
        ranges.push({ start, end: start + mm[1].length });
      }
      let out = content;
      for (const rg of ranges.reverse()) {
        const css = out.slice(rg.start, rg.end);
        const stripped = stripDeclsFromClassRules(css, list, isPanelChromeProp);
        if (stripped !== css) out = out.slice(0, rg.start) + stripped + out.slice(rg.end);
      }
      if (out !== content) {
        files[path] = out;
        for (const cls of list) {
          if (stripDeclsFromClassRules(content, [cls], isPanelChromeProp) !== content) {
            changes.push({
                file: path,
                sectionId: null,
                owner: classesToStrip.get(cls),
                where: orphanClasses.has(cls) ? 'class-orphan' : 'class',
                cls,
              });
          }
        }
      }
    }
  }

  return { files, changes };
}

/**
 * 🛡️ 刀 57 / 方案 E（2026-10-23 · mc-max-1792718704810-f98f7463 实锤）：面板标题槽位归属。
 *
 * 病灶：`index.vue` 把 Figma 标题组件放进 `<template #header-right>`，而 default-panel
 * 的 chrome **无条件**渲染 `<div class="header-title">{{ componentName }}</div>`（且
 * `declare.json.title` == Figma 标题文本）⇒ **双标题**。
 *
 * 判据（五条同时成立，全部确定性、可证伪）：
 *   ① 主组件（含 `<base-panel`）存在 `<template #header-right>`，其直接内容是**单个**
 *      组件标签（允许空白/HTML 注释，无其它元素与文本）；
 *   ② 该组件文件在产物内且带 `data-section-id="<sid>"`；
 *   ③ plan 段树中 sid 段 `type === 'header'`（面板标题段的结构事实）；
 *   ④ sid 的 Figma 子树**恰含 1 个非空 TEXT**（标题形态）；
 *   ⑤ 同文件尚无 `#title-left` 使用（已有则不猜）。
 * ⇒ heal：`#header-right` → `#title-left`（只改这一处 slot 名，内容不动）。
 *
 * 配套（前端 chrome 让位）：`default-panel/index.vue` 的 `header-title` 在提供
 * `title-left` 槽时隐藏（`v-if="!slot['title-left']"`）。现有产物 0 个使用 title-left ⇒ 零回归。
 *
 * fail-open：任一条不满足 ⇒ 不动。vue3 链路无 base-panel ⇒ 天然不触发。
 *
 * @param {Record<string,string>} files 产物文件集
 * @param {object} ctx `{ plan, figmaRoot }`（plan = {effectiveSections}；缺 ⇒ skip）
 * @returns {{ files, changes: Array, evaluated: number, skippedReason?: string }}
 */
export function healPanelTitleSlot(files, { plan, figmaRoot } = {}) {
  const changes = [];
  if (!files || typeof files !== 'object') return { files, changes, evaluated: 0 };
  const sections = Array.isArray(plan?.effectiveSections) ? plan.effectiveSections : null;
  if (!sections || sections.length === 0) {
    return { files, changes, evaluated: 0, skippedReason: 'no-plan-sections' };
  }
  if (!figmaRoot) return { files, changes, evaluated: 0, skippedReason: 'no-figma-root' };

  const indexPath = Object.keys(files).find(
    (p) => /(?:^|\/)index\.vue$/.test(p) && typeof files[p] === 'string' && /<base-panel\b/.test(files[p]),
  );
  if (!indexPath) return { files, changes, evaluated: 0, skippedReason: 'no-base-panel-index' };
  let content = files[indexPath];
  if (!/#title-left/.test(content)) {
    // ⑤ 同文件已有 title-left 使用 ⇒ 不猜（避免覆盖语义不同的既有挂载）
    // ① 找 header-right slot：直接内容 = 单组件标签
    const slotRe = /<template\s+#header-right\s*>([\s\S]*?)<\/template>/g;
    const candidates = [];
    let m;
    while ((m = slotRe.exec(content)) !== null) {
      const inner = m[1].replace(/<!--[\s\S]*?-->/g, '').trim();
      const tag = /^<([A-Z][\w]*)\b[^>]*\/>$|^<([A-Z][\w]*)\b[^>]*>\s*<\/\3>$/.exec(inner);
      // 只接受 PascalCase 组件标签（排除原生元素与多元素内容）
      const name = tag ? (tag[1] || tag[3]) : null;
      if (name) candidates.push({ name, slotStart: m.index, slotEnd: m.index + m[0].length, slotText: m[0] });
    }
    if (candidates.length === 0) {
      return { files, changes, evaluated: 0, skippedReason: 'no-single-component-header-right' };
    }

    // plan 段树扁平化（含嵌套 children）
    const flat = [];
    const walk = (list) => {
      for (const s of list || []) {
        if (s?.id != null) flat.push(s);
        if (s?.children?.length) walk(s.children);
      }
    };
    walk(sections);

    for (const cand of candidates) {
      const compPath = Object.keys(files).find(
        (p) => p === `package/components/${cand.name}.vue`,
      );
      const compContent = compPath ? files[compPath] : null;
      if (typeof compContent !== 'string') continue; // ② 组件文件不在产物内 ⇒ 不猜
      const sidM = /data-section-id="([^"]+)"/.exec(compContent);
      if (!sidM) continue;
      const sid = String(sidM[1]);
      // ③ plan 段 type === 'header'
      const sec = flat.find((s) => String(s.id) === sid);
      if (!sec || sec.type !== 'header') continue;
      // ④ sid 的 Figma 子树恰含 1 个非空 TEXT
      const node = findNodeById(figmaRoot, sid);
      if (!node) continue;
      let textCount = 0;
      const countTexts = (n) => {
        if (!n || typeof n !== 'object') return;
        if (typeof n.characters === 'string' && n.characters.trim().length > 0) {
          textCount += 1;
          return;
        }
        for (const c of n.children || []) countTexts(c);
      };
      countTexts(node);
      if (textCount !== 1) continue;

      const slotText = cand.slotText;
      const healed = slotText.replace(/#header-right/, '#title-left');
      content = content.slice(0, cand.slotStart) + healed + content.slice(cand.slotEnd);
      changes.push({
        file: indexPath,
        component: cand.name,
        sectionId: sid,
        from: 'header-right',
        to: 'title-left',
      });
      // slot 位移后重扫（防同文件多处）——简单起见只处置第一处命中后 break
      break;
    }
    if (changes.length > 0) {
      files[indexPath] = content;
    }
  }
  return { files, changes, evaluated: 1 };
}

/** 在 figma 树（document 本体或包装）里按 id 找节点。 */
function findNodeById(figmaRoot, id) {
  const root = figmaRoot?.document ?? figmaRoot;
  if (!root || typeof root !== 'object') return null;
  const target = String(id);
  const stack = [root];
  while (stack.length) {
    const n = stack.pop();
    if (!n || typeof n !== 'object') continue;
    if (String(n.id) === target) return n;
    for (const c of n.children || []) stack.push(c);
  }
  return null;
}
