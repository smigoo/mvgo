/**
 * 🛡️ layout-truth-guard.js —— 通用「布局真值一致性」确定性守卫（A 批 · 层 4 + 层 5）
 *
 * ── 立项（mc-max-1792985029695-58de7d47「设备详情」报障 · 全链路取证）──
 *
 * 真机产物 `c-device-58de7d47` 的两处**结构性自相矛盾**（真值可查、渲染图实锤）：
 *
 *   ① `resources/styles/common.less:149-162` 与 `package/components/ListSection.vue`
 *      `<style scoped>` 的 `.c-device-list-section` 同一规则块内共存：
 *        `display: grid; grid-template-columns: repeat(2, 1fr);`
 *        `flex-direction: column; flex-wrap: wrap;`
 *      后两条在 grid 容器下**永久 inert**（CSS 规范：flex-* 只对 flex 容器生效）
 *      ⇒ 实际生效 = 2 列网格。同一块还能同时看到 `flex: 1 1 0`（flex 语汇）
 *      ⇒ 任何跨文件索引/审计/布局契约判据看到的都是「两种布局语汇并存」的歧义。
 *
 *   ② `package/components/ContentMask.vue` 与 common.less 的 `.c-device-mask-group`：
 *        shared（真值来源，对应 Figma `36:1726` GROUP bbox **98×98**）：`min-height: 98px`
 *        SFC scoped（优先级 (0,2,0) **恒胜**）：`min-height: 0`
 *      ⇒ scoped 抹掉了与真值**逐位一致**的 98px。既有 `style-dedup-guard` 的
 *        `LAYOUT_PROPS` 白名单**刻意排除** `min-width/min-height`（R5 注释：「冗余声明无害，
 *        CSS 取较大值，不冲突」）——该假设**被本事故证伪**：跨文件冲突由**优先级**裁决，
 *        不是「取较大值」⇒ 真值尺寸被小值静默吃掉。
 *
 * ── 三判据（全部命名无关、零产物结构假设、可辩驳）──
 *
 *   J1 互斥布局指令共存（inert 残留）—— **无需真值**
 *      同一顶层单 class 规则块内，按「后写者胜」取 `display` 的最终值：
 *        · `grid`/`inline-grid` ⇒ 删 `flex-direction|flex-wrap|flex-flow`（永久 inert）
 *        · `flex`/`inline-flex` ⇒ 删 `grid-template-*|grid-auto-*|grid-column*|grid-row*|grid-area`
 *      🔴 零视觉风险：被删声明在该 display 下**本就不生效**；删后歧义消失，唯一值浮出。
 *      🔴 保守边界：`display` 值含 `var(`/`env(`/全局关键字（inherit/unset/revert/initial）
 *         ⇒ 最终 display 不可知 ⇒ **跳过**（宁漏不误）。`gap`/`align-items`/`justify-content`/
 *        `align-content` 在两种容器下**都有效** ⇒ 永不删。
 *
 *   J2 绝对几何超真值轴尺寸 —— **需 Figma 真值 bbox**
 *      宿主元素（`data-section-id` 命中真值节点）的真值 bbox 给出该元素**实际轴尺寸**。
 *      若其 CSS 中某个**跨轴**绝对 px 超过该轴尺寸 ⇒ 数学上必然溢出（间距不可能大于容器自身）
 *      ⇒ 该值是「Figma 绝对坐标残留」（如 `gap: 6px 93px` 的 93 = 设计稿两列 X 差值）。
 *      处置：删除跨轴值（`gap: A B` → `gap: A`）。
 *      🔴 **两侧恒安全**：若确实多列 ⇒ 修掉必然溢出；若单列/单行 ⇒ 该跨轴 gap 本就被忽略
 *        ⇒ 删除无任何视觉变化。`min-width/min-height` 超对应轴尺寸同理收敛为轴尺寸。
 *
 *   J3 真值尺寸被 SFC scoped 抹掉 —— **需 Figma 真值 bbox + class→sectionId**
 *      shared 表（common.less/index.less）中同名 class 的 `min-width/min-height` 与真值 bbox
 *      **一致**（±2px，即 shared 那一份确系真值），而 SFC scoped 同名 class 声明了**更小**的值
 *      ⇒ 该 scoped 声明抹掉真值 ⇒ 删 scoped 那条（shared 的真值随之生效）。
 *      🔴 只在「shared 与真值一致」时动手（真值锚定），shared 自身偏离真值时不判。
 *
 * ── 契约 ──
 *   形态：数组进数组出 / 对象 map 进对象 map 出（经 file-collection 归一）；
 *   无改动返回**输入原引用**（供调用方判定 applied）。
 *   fail-open：无 figmaRoot / 无真值 bbox / class 未映射到 section ⇒ 不判不改，
 *   但**必须打计数行**（evaluated/hits/skipped/skippedReason）——
 *   否则「零命中」与「零问题」不可区分（本项目铁律）。
 *   环境开关 `MVGO_LAYOUT_TRUTH_GUARD=0` 可整体关闭。
 */

import { extractStyleBlocks } from './flex-sibling-guard.js';
import { formatDeclarationList } from './style-dedup-guard.js';
import { toFileArray, mergeFileArray } from './file-collection.js';

// ─────────────────────────── 常量（判据口径单一来源） ───────────────────────────

/** 顶层单 class 选择器（与 style-dedup-guard#CLASS_SELECTOR_RX 同口径） */
const CLASS_SELECTOR_RX = /^\.([\w-]+)$/;

/** grid 容器下永久 inert 的 flex 专有属性 */
const FLEX_ONLY_PROPS = new Set(['flex-direction', 'flex-wrap', 'flex-flow']);

/** flex 容器下永久 inert 的 grid 专有属性 */
const GRID_ONLY_PROPS = new Set([
  'grid-template-columns', 'grid-template-rows', 'grid-template-areas',
  'grid-auto-flow', 'grid-auto-columns', 'grid-auto-rows',
  'grid-column', 'grid-column-start', 'grid-column-end',
  'grid-row', 'grid-row-start', 'grid-row-end', 'grid-area',
]);

const GRID_DISPLAY_VALUES = new Set(['grid', 'inline-grid']);
const FLEX_DISPLAY_VALUES = new Set(['flex', 'inline-flex']);

/** display 取不到「确定值」的信号（任一命中 ⇒ J1 跳过） */
const DISPLAY_UNKNOWN_RX = /var\(|env\(|\b(?:inherit|initial|unset|revert|revert-layer|contents|none)\b/i;

/** 绝对 px 判定：单值 `\d+(\.\d+)?px`（无 %/var/calc/em/rem 等） */
const ABS_PX_RX = /^-?\d+(?:\.\d+)?px$/i;

/** 无单位零（CSS 长度合法简写，真机 `min-height: 0` 即此形态） */
const UNITLESS_ZERO_RX = /^[+-]?0+(?:\.0+)?$/;

/**
 * 绝对长度 → px 数值。接受 `<n>px` 与无单位 `0`；其它（%/var/calc/em/rem/auto…）返回 null。
 * ⚠️ 不接受无单位 `0` 是本守卫的第一版真机 bug：`ContentMask.vue` 的 `min-height: 0`
 * （无 px）会静默逃过 J3，而 `common.less` 的真值锚恰是 `98px` ⇒ 零命中假绿。
 */
function parseAbsLenPx(value) {
  const s = String(value ?? '').trim();
  if (UNITLESS_ZERO_RX.test(s)) return 0;
  if (!ABS_PX_RX.test(s)) return null;
  return parseFloat(s);
}

/** 真值 bbox 与声明值的一致性容差（Figma 浮点 → 代码整数舍入） */
const TRUTH_TOLERANCE_PX = 2;

// ─────────────────────────── 一、解析工具 ───────────────────────────

/**
 * 把声明体拆成 [{ prop, value, raw }]。
 * raw 保留原片段（含缩进），供「原样回写未被改动的声明」——
 * 避免把注释/`!important`/多行值等意外规范化。
 */
export function parseDecls(body) {
  const out = [];
  for (const raw of String(body || '').split(';')) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const m = trimmed.match(/(?:^|\n)\s*([a-zA-Z][\w-]*)\s*:\s*([\s\S]*)$/);
    if (!m) continue;
    out.push({
      prop: m[1].toLowerCase(),
      value: m[2].trim(),
      raw: trimmed.replace(/\s+/g, ' '),
    });
  }
  return out;
}

/** 按「后写者胜」取某属性的最终值（同块多次声明时） */
function lastValue(decls, prop) {
  let v = null;
  for (const d of decls) if (d.prop === prop) v = d.value;
  return v;
}

/** 该块是否「顶层单 class、无嵌套、无伪类」——与 collectSharedClassBodies 同口径 */
function isSimpleClassBlock(block) {
  const sel = String(block?.selector || '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .trim();
  const body = String(block?.body || '');
  if (body.includes('{') || body.includes('&')) return null;
  const m = sel.match(CLASS_SELECTOR_RX);
  return m ? m[1] : null;
}

/**
 * 对一段样式文本跑「块级改写器」：fn(className, block) → { body?: string, note?: string } | null
 * 返回 { text, changes }。changes 是命中记录（供计数与日志）。
 */
function rewriteStyleBlocks(styleText, fn) {
  const changes = [];
  let text = String(styleText || '');
  if (!text) return { text, changes };

  for (const block of extractStyleBlocks(text)) {
    const cls = isSimpleClassBlock(block);
    if (!cls) continue;
    const r = fn(cls, block);
    if (!r || typeof r.body !== 'string') continue;
    const nextBody = r.body;
    // 安全网：改写后若含未闭合花括号/嵌套信号，放弃（宁漏不误）
    if (nextBody.includes('{') || nextBody.includes('}')) continue;
    // 精确替换「该 selector 的这一个块体」
    const blockRx = new RegExp(
      `(\\.${cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(\\s*)\\{([^{}]*)\\}`,
    );
    const mm = text.match(blockRx);
    if (!mm) continue;
    const origBody = mm[3];
    if (origBody === nextBody) continue;
    text = text.replace(blockRx, (_f, sel, sp) => `${sel}${sp}{${nextBody}}`);
    changes.push({ cls, note: r.note || '' });
  }
  return { text, changes };
}

// ─────────────────────────── 二、真值索引 ───────────────────────────

/**
 * 从 Figma 真值树构建 id → { width, height, parentId, type, name } 索引。
 * 🔴 真值树顶层是 `{ document: {...} }`（离线重放铁律：遍历走 `.document`），
 *   但为兼容直接传 document 节点/裸 children 的调用方，逐级回退。
 */
export function buildTruthBoxIndex(figmaRoot) {
  const out = new Map();
  if (!figmaRoot || typeof figmaRoot !== 'object') return out;
  const root = figmaRoot.document || figmaRoot;
  if (!root || !Array.isArray(root.children)) return out;

  const walk = (nodes, parentId) => {
    for (const n of nodes) {
      if (!n || typeof n !== 'object') continue;
      const id = n.id;
      const bbox = n.absoluteBoundingBox || n.bbox || null;
      if (
        id &&
        bbox &&
        Number.isFinite(Number(bbox.width)) &&
        Number.isFinite(Number(bbox.height))
      ) {
        out.set(String(id), {
          id: String(id),
          type: n.type || null,
          name: n.name || null,
          width: Number(bbox.width),
          height: Number(bbox.height),
          parentId: parentId ? String(parentId) : null,
        });
      }
      if (Array.isArray(n.children)) walk(n.children, id || parentId);
    }
  };
  walk(root.children, null);
  return out;
}

/**
 * 从产物 .vue 模板构建 class → sectionId 映射（同一标签上同时出现 `data-section-id` 与 `class`）。
 * 只取「元素自身锚定」的形态（宿主元素），不做祖先下钻——避免把后代的 class 归到别的 section。
 */
export function buildClassSectionIndex(files) {
  const out = new Map();
  for (const f of toFileArray(files)) {
    if (!f || typeof f.content !== 'string' || !/\.vue$/i.test(f.path || '')) continue;
    const tmpl = (f.content.match(/<template[^>]*>([\s\S]*)<\/template>/i) || [])[1] || '';
    for (const tag of tmpl.match(/<[a-zA-Z][\w-]*\b[^>]*>/g) || []) {
      const sid = (tag.match(/data-section-id="([^"]+)"/) || [])[1];
      if (!sid) continue;
      const cls = (tag.match(/\bclass="([^"]*)"/) || [])[1];
      if (!cls) continue;
      for (const c of cls.split(/\s+/)) {
        if (c && !out.has(c)) out.set(c, sid);
      }
    }
  }
  return out;
}

// ─────────────────────────── 三、J1 互斥布局指令共存 ───────────────────────────

/**
 * 单个块：按最终 display 删掉「永久 inert」的专有属性。
 * @returns {{ body: string, removed: string[] } | null} null = 不改
 */
export function stripInertLayoutDecls(block) {
  const decls = parseDecls(block?.body);
  if (decls.length === 0) return null;

  const display = lastValue(decls, 'display');
  if (!display) return null;
  const dv = String(display).trim().toLowerCase();
  if (DISPLAY_UNKNOWN_RX.test(dv)) return null;

  let kill = null;
  if (GRID_DISPLAY_VALUES.has(dv)) kill = FLEX_ONLY_PROPS;
  else if (FLEX_DISPLAY_VALUES.has(dv)) kill = GRID_ONLY_PROPS;
  if (!kill) return null;

  const kept = [];
  const removed = [];
  for (const d of decls) {
    if (kill.has(d.prop)) {
      removed.push(d.prop);
      continue;
    }
    kept.push(d.raw);
  }
  if (removed.length === 0) return null;
  return { body: `\n${formatDeclarationList(kept)}\n`, removed };
}

// ─────────────────────────── 四、J2 绝对几何超真值轴尺寸 ───────────────────────────

/**
 * 单个块 + 真值 bbox：把「超过真值轴尺寸」的绝对 px 收敛。
 *   · `gap: A B`：B（column-gap，跨轴）为绝对 px 且 > box.width ⇒ 删 B
 *   · `gap: A`：单值同施两轴，若 > box.width 且 > box.height ⇒ 删整条（两轴都溢出）
 *   · `column-gap` / `row-gap` 长写：同上语义
 *   · `min-width` > box.width / `min-height` > box.height ⇒ 收敛为真值轴尺寸
 * @returns {{ body: string, notes: string[] } | null} null = 不改
 */
export function clampAbsoluteGeometry(block, box) {
  if (!box || !Number.isFinite(box.width) || !Number.isFinite(box.height)) return null;
  const decls = parseDecls(block?.body);
  if (decls.length === 0) return null;

  const notes = [];
  const out = [];
  for (const d of decls) {
    const v = d.value;

    if (d.prop === 'gap') {
      const parts = v.split(/\s+/);
      if (parts.length === 2 && ABS_PX_RX.test(parts[1])) {
        const col = parseFloat(parts[1]);
        if (col > box.width + TRUTH_TOLERANCE_PX) {
          notes.push(`gap 跨轴 ${parts[1]} > 真值宽 ${Math.round(box.width)}px ⇒ 删跨轴`);
          out.push(`gap: ${parts[0]}`);
          continue;
        }
      } else if (parts.length === 1 && ABS_PX_RX.test(parts[0])) {
        const g = parseFloat(parts[0]);
        if (g > box.width + TRUTH_TOLERANCE_PX && g > box.height + TRUTH_TOLERANCE_PX) {
          notes.push(`gap ${parts[0]} > 真值宽高 ${Math.round(box.width)}×${Math.round(box.height)}px ⇒ 删`);
          continue;
        }
      }
    } else if (d.prop === 'column-gap' || d.prop === 'row-gap') {
      const axis = d.prop === 'column-gap' ? box.width : box.height;
      const g = parseAbsLenPx(v);
      if (g !== null && g > axis + TRUTH_TOLERANCE_PX) {
        notes.push(`${d.prop} ${v} > 真值轴 ${Math.round(axis)}px ⇒ 删`);
        continue;
      }
    } else if (d.prop === 'min-width' || d.prop === 'min-height') {
      const axis = d.prop === 'min-width' ? box.width : box.height;
      const min = parseAbsLenPx(v);
      if (min !== null && min > axis + TRUTH_TOLERANCE_PX) {
        notes.push(`${d.prop} ${v} > 真值轴 ${Math.round(axis)}px ⇒ 收敛为真值`);
        out.push(`${d.prop}: ${Math.round(axis)}px`);
        continue;
      }
    }
    out.push(d.raw);
  }

  if (notes.length === 0) return null;
  return { body: `\n${formatDeclarationList(out)}\n`, notes };
}

// ─────────────────────────── 五、J3 真值尺寸被 SFC scoped 抹掉 ───────────────────────────

/**
 * 判断 shared 表的 min-* 是否与真值一致（即 shared 那份是真值来源）。
 * @returns {number|null} 与真值一致的轴尺寸；不一致/缺失返回 null
 */
function truthMatchedMinSize(sharedBody, box) {
  const decls = parseDecls(sharedBody);
  const mw = parseAbsLenPx(decls.find((d) => d.prop === 'min-width')?.value);
  const mh = parseAbsLenPx(decls.find((d) => d.prop === 'min-height')?.value);
  const wOk = mw !== null && Math.abs(mw - box.width) <= TRUTH_TOLERANCE_PX;
  const hOk = mh !== null && Math.abs(mh - box.height) <= TRUTH_TOLERANCE_PX;
  return { wOk, hOk };
}

/**
 * 单个 SFC scoped 块：删除「抹掉真值尺寸」的 min-width/min-height。
 * @returns {{ body: string, removed: string[] } | null}
 */
export function stripScopedTruthOverride(blockBody, sharedBody, box) {
  const match = truthMatchedMinSize(sharedBody, box);
  if (!match.wOk && !match.hOk) return null;

  const decls = parseDecls(blockBody);
  const removed = [];
  const out = [];
  for (const d of decls) {
    if (d.prop === 'min-width' && match.wOk) {
      const v = parseAbsLenPx(d.value);
      if (v !== null && v < box.width - TRUTH_TOLERANCE_PX) {
        removed.push(`min-width:${d.value}`);
        continue;
      }
    }
    if (d.prop === 'min-height' && match.hOk) {
      const v = parseAbsLenPx(d.value);
      if (v !== null && v < box.height - TRUTH_TOLERANCE_PX) {
        removed.push(`min-height:${d.value}`);
        continue;
      }
    }
    out.push(d.raw);
  }
  if (removed.length === 0) return null;
  return { body: `\n${formatDeclarationList(out)}\n`, removed };
}

// ─────────────────────────── 六、文件级：样式段枚举 ───────────────────────────

/**
 * 枚举产物文件里的「样式段」：.less/.css 全文；.vue 的每个 <style> 块。
 * 返回 [{ path, kind, get, set }]，set(nextText) 回写该段。
 */
function enumerateStyleSegments(list) {
  const segs = [];
  for (const f of list) {
    if (!f || typeof f.content !== 'string') continue;
    const p = String(f.path || '');
    if (/\.(less|css)$/i.test(p)) {
      segs.push({
        path: p,
        kind: 'file',
        apply(fn) {
          const r = fn(f.content);
          if (r.text !== f.content) f.content = r.text;
          return r.changes;
        },
      });
    } else if (/\.vue$/i.test(p)) {
      segs.push({
        path: p,
        kind: 'vue-style',
        apply(fn) {
          const styleRx = /(<style[^>]*>)([\s\S]*?)(<\/style>)/gi;
          const all = [];
          let m;
          while ((m = styleRx.exec(f.content)) !== null) all.push({ m });
          if (all.length === 0) return all;
          // 逆序替换，避免偏移漂移
          for (let i = all.length - 1; i >= 0; i -= 1) {
            const { m } = all[i];
            const r = fn(m[2]);
            all[i].changes = r.changes;
            if (r.text !== m[2]) {
              f.content =
                f.content.slice(0, m.index) +
                m[1] +
                r.text +
                m[3] +
                f.content.slice(m.index + m[0].length);
            }
          }
          return all.flatMap((x) => x.changes || []);
        },
      });
    }
  }
  return segs;
}

// ─────────────────────────── 七、主入口 ───────────────────────────

/** shared 表识别：common.less / index.less（与 style-dedup-guard 同口径） */
const SHARED_PATH_RX = /(?:^|\/)(?:common|index)\.less$/i;

/**
 * 主入口：对全量产物跑 J1/J2/J3。
 *
 * @param {Array<{path:string,content:string}>|Object<string,string>} files 全量产物
 * @param {object} ctx
 * @param {object} [ctx.figmaRoot] Figma 真值树（含 document.children + absoluteBoundingBox）
 * @param {object} [ctx.logger]
 * @returns {{ files: Array|Object, summary: object }}
 */
export function runLayoutTruthGuard(files, ctx = {}) {
  const { figmaRoot, logger } = ctx;
  const summary = {
    enabled: true,
    evaluated: 0,
    j1InertRemoved: 0,
    j2GeometryClamped: 0,
    j3TruthOverrideStripped: 0,
    hits: 0,
    skipped: 0,
    skippedReason: null,
  };

  if (process.env.MVGO_LAYOUT_TRUTH_GUARD === '0') {
    summary.enabled = false;
    summary.skippedReason = 'disabled-by-env';
    logger?.info?.('🛡️ 布局真值守卫·已评估（开关关闭）', { enabled: false });
    return { files, summary };
  }

  const list = toFileArray(files).map((f) => ({ path: f.path, content: f.content }));
  if (list.length === 0) {
    summary.skippedReason = 'empty-files';
    logger?.info?.('🛡️ 布局真值守卫·已评估', { ...summary });
    return { files, summary };
  }

  const truthIndex = buildTruthBoxIndex(figmaRoot);
  const classSection = buildClassSectionIndex(list);
  const hasTruth = truthIndex.size > 0;
  if (!hasTruth) summary.skippedReason = 'no-truth-bbox';

  // shared 表 class → body（供 J3 判定「shared 那份是否真值」）
  const sharedBodies = new Map();
  for (const f of list) {
    if (!SHARED_PATH_RX.test(String(f.path || ''))) continue;
    for (const b of extractStyleBlocks(f.content)) {
      const cls = isSimpleClassBlock(b);
      if (cls && !sharedBodies.has(cls)) sharedBodies.set(cls, b.body);
    }
  }

  const segs = enumerateStyleSegments(list);

  // ── J1：互斥布局指令共存（无需真值，全部样式段） ──
  for (const seg of segs) {
    const changes = seg.apply((text) =>
      rewriteStyleBlocks(text, (cls, block) => {
        summary.evaluated += 1;
        const r = stripInertLayoutDecls(block);
        if (!r) return null;
        summary.j1InertRemoved += r.removed.length;
        summary.hits += 1;
        return { body: r.body, note: `inert=${r.removed.join(',')}` };
      }),
    );
    for (const c of changes) {
      logger?.warn?.('🛡️ J1 互斥布局指令消歧：删除永久 inert 声明', {
        file: seg.path,
        class: c.cls,
        note: c.note,
      });
    }
  }

  // ── J2 / J3：需真值 ──
  if (hasTruth) {
    // J2：绝对几何超真值轴尺寸
    for (const seg of segs) {
      const changes = seg.apply((text) =>
        rewriteStyleBlocks(text, (cls, block) => {
          const sid = classSection.get(cls);
          if (!sid) return null;
          const box = truthIndex.get(sid);
          if (!box) return null;
          summary.evaluated += 1;
          const r = clampAbsoluteGeometry(block, box);
          if (!r) return null;
          summary.j2GeometryClamped += r.notes.length;
          summary.hits += 1;
          return { body: r.body, note: r.notes.join(' | ') };
        }),
      );
      for (const c of changes) {
        logger?.warn?.('🛡️ J2 绝对几何超真值轴尺寸：已收敛', {
          file: seg.path,
          class: c.cls,
          note: c.note,
        });
      }
    }

    // J3：真值尺寸被 SFC scoped 抹掉（只处理 .vue 的 scoped 段）
    for (const seg of segs) {
      if (seg.kind !== 'vue-style') continue;
      const changes = seg.apply((text) =>
        rewriteStyleBlocks(text, (cls, block) => {
          const sid = classSection.get(cls);
          if (!sid) return null;
          const box = truthIndex.get(sid);
          if (!box) return null;
          const sharedBody = sharedBodies.get(cls);
          if (!sharedBody) return null;
          summary.evaluated += 1;
          const r = stripScopedTruthOverride(block.body, sharedBody, box);
          if (!r) return null;
          summary.j3TruthOverrideStripped += r.removed.length;
          summary.hits += 1;
          return { body: r.body, note: `stripped=${r.removed.join(',')}` };
        }),
      );
      for (const c of changes) {
        logger?.warn?.('🛡️ J3 真值尺寸被 scoped 抹掉：已剥除 scoped 声明（shared 真值生效）', {
          file: seg.path,
          class: c.cls,
          note: c.note,
        });
      }
    }
  }

  // 🔴 计数行铁律：无论命中与否都留痕
  logger?.info?.('🛡️ 布局真值守卫·已评估', {
    evaluated: summary.evaluated,
    hits: summary.hits,
    j1InertRemoved: summary.j1InertRemoved,
    j2GeometryClamped: summary.j2GeometryClamped,
    j3TruthOverrideStripped: summary.j3TruthOverrideStripped,
    truthBoxes: truthIndex.size,
    classSectionMapped: classSection.size,
    skippedReason: summary.skippedReason,
  });

  return { files: mergeFileArray(files, list), summary };
}

export default { runLayoutTruthGuard, buildTruthBoxIndex, buildClassSectionIndex };
