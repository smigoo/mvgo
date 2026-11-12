/**
 * 🧬 B 层 · 段分组守恒（装配同源强制重建）—— 2026-11-12
 *
 * 背景（真机证据 mc-1794428749650-cc633474 / 组件 c-cc6334-cc633474「合作厂商弹窗」）：
 *   视觉分析 layoutStructure 里是三张**并列分组卡**（38:3137 / 38:3162 / 38:3206，
 *   各带自己的标题 / icon / 底框 / `gridColumns`），规划树 `effectiveSections` 被
 *   内容同构折叠器条目级拍平成 **1 段 33 条**。后果是「约束」与「装配」不同源：
 *     - 分块 prompt 的 layoutStructure 仍是三段（各 4 列、各自底色）；
 *     - 装配骨架只有一段 ⇒ index.vue 只装配一个子组件 ⇒ 渲成一整块。
 *
 * 本模块的定位是**同源校验 + 纯附加重建**（不是折叠器的替代，也不是兜底补丁）：
 *   A 层（repeated-section-collapser 并列分组守卫）从源头阻止误折；
 *   B 层在 `resolvePlanSections` 出口复核一次「规划树上的分组数与视觉真值是否一致」，
 *   少 2 组及以上（= 结构性塌陷，不是正常的相邻合并）时，按 layoutStructure 的
 *   标题/几何/列数把缺失分组**追加**回规划树，并留痕 `[SECTION-GROUP-CONSERVATION]`。
 *
 * 契约（不可违反）：
 *   1. **纯附加**：只 append，绝不删除/重排/覆盖既有段，既有字段一个不改；
 *   2. **fail-open**：无 layoutStructure / 标题不足 / 标题不具业务语义 ⇒ 原样返回（零行为变化）；
 *   3. **幂等**：重建段自带标题，二次调用即 matched，不会重复追加；
 *   4. **纯函数**（除日志外）：不 mutate 入参。
 */

import { extractSections } from './figma-format.js';

/** 允许作为「分组标题」的字段顺序（视觉 JSON 与规划树形态不一，逐层探测） */
function ownTitle(sec) {
  if (!sec || typeof sec !== 'object') return '';
  const cands = [sec?.header?.title, sec?.title, sec?.label];
  for (const c of cands) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  // `name` 放最后：视觉层 `name` 常是 Figma 图层名（frame/main/content…），需过滤
  if (typeof sec.name === 'string' && isBusinessTitle(sec.name)) return sec.name.trim();
  return '';
}

/**
 * 图层名 vs 业务标题的判据（保守：宁可判「不是标题」也不误认）。
 * 拒绝：空、纯符号/数字、通用容器名、`frame 12` 之类自动命名、超长说明文本。
 */
const GENERIC_LAYER_RE =
  /^(frame|group|rectangle|rect|ellipse|vector|image|img|mask|container|wrapper|content|contents|main|body|section|panel|box|div|layer|union|slice|auto\s*layout|组件|容器|内容|图层|矩形|编组|画板)([\s_\-.#:]*\d*)?$/i;

export function isBusinessTitle(raw) {
  const t = String(raw ?? '').trim();
  if (!t) return false;
  if (t.length < 2 || t.length > 24) return false;
  if (GENERIC_LAYER_RE.test(t)) return false;
  if (!/[\u4e00-\u9fa5a-zA-Z]/.test(t)) return false;
  // `frame 12` / `Frame 3` / `Group 1024`
  if (/^[a-zA-Z]+\s+\d+$/.test(t)) return false;
  return true;
}

/** 标题归一：用于判「同一分组」，仅去空白与常见分隔符 */
export function normalizeTitle(raw) {
  return String(raw ?? '')
    .replace(/[\s\u3000]+/g, '')
    .replace(/[·—–\-_:：|｜,，.。]/g, '')
    .toLowerCase();
}

/** 该段是否有「分组」的结构证据：标题 + （多列网格 或 多子块/条目） */
function hasGroupStructure(sec) {
  if (!sec || typeof sec !== 'object') return false;
  const cols = Number(sec.gridColumns);
  if (Number.isInteger(cols) && cols >= 2) return true;
  const kids = Array.isArray(sec.children) ? sec.children : [];
  if (kids.length >= 2) return true;
  const items =
    (Array.isArray(sec.body?.items) && sec.body.items.length) ||
    (Array.isArray(sec.items) && sec.items.length) ||
    (Array.isArray(sec.declaredContent?.items) && sec.declaredContent.items.length) ||
    0;
  return items >= 2;
}

/** 段几何（视觉层字段名不统一，逐个探测，只做归一不改写） */
function sectionBox(sec) {
  const b =
    sec?.absoluteBoundingBox ||
    sec?.box ||
    sec?.figmaBox ||
    sec?.bounds ||
    (sec?.x != null && sec?.y != null ? { x: sec.x, y: sec.y, width: sec.width, height: sec.height } : null);
  if (!b || typeof b !== 'object') return null;
  const width = Number(b.width);
  const height = Number(b.height);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  return {
    x: Number.isFinite(Number(b.x)) ? Number(b.x) : 0,
    y: Number.isFinite(Number(b.y)) ? Number(b.y) : 0,
    width,
    height,
  };
}

/**
 * 收集 layoutStructure 的「分组真值」。
 * 只统计「带业务标题且带分组结构证据」的段——避免把纯容器/装饰块当分组。
 */
export function collectLayoutGroups(layoutStructure) {
  const sections = extractSections(layoutStructure);
  if (!Array.isArray(sections) || sections.length === 0) return [];
  const out = [];
  for (const sec of sections) {
    const title = ownTitle(sec);
    if (!title) continue;
    if (!hasGroupStructure(sec)) continue;
    out.push({
      title,
      key: normalizeTitle(title),
      gridColumns: Number(sec.gridColumns) >= 2 ? Number(sec.gridColumns) : null,
      box: sectionBox(sec),
      nodeId: sec.figmaNodeId || sec.nodeId || sec.id || null,
      sourceNodeIds: Array.isArray(sec.sourceNodeIds) ? sec.sourceNodeIds.slice() : null,
      raw: sec,
    });
  }
  return out;
}

/** 规划树侧的分组标题集合（含重建段，故幂等） */
function collectPlanTitles(sections) {
  const set = new Set();
  for (const sec of Array.isArray(sections) ? sections : []) {
    const t = ownTitle(sec);
    if (t) set.add(normalizeTitle(t));
  }
  return set;
}

/**
 * 按标题在规划树里定位段（取第一个标题匹配者）。
 */
function findPlanSectionByTitle(sections, key) {
  for (const sec of Array.isArray(sections) ? sections : []) {
    const t = ownTitle(sec);
    if (t && normalizeTitle(t) === key) return sec;
  }
  return null;
}

/**
 * 该段是否**有内容轨**（任一来源非空）。
 *
 * 🔴 2026-11-12（3d79ee84 实锤）：塌陷残留段标题在、`body.children` 为空 ⇒ 旧判据
 *   （只比标题）认为「该组已存在」而跳过重建 ⇒ prompt 渲成 `— 区块`（无标题无条目）
 *   ⇒ LLM 写通用空壳 `title='内容区块'`、`content=''`，整组空白。
 *   故「存在」必须同时「有内容」，否则按空壳处理。
 */
function hasContentTrack(sec) {
  if (!sec || typeof sec !== 'object') return false;
  const tracks = [
    sec.body?.children,
    sec.body?.items,
    sec.children,
    sec.items,
    sec.declaredContent?.items,
    sec.internalSubcomponents,
  ];
  return tracks.some((arr) => Array.isArray(arr) && arr.length > 0);
}

/** 真值该组的「带业务文字的条目数」——图标/装饰块不算（≥2 才值得补内容） */
function truthItemCount(group) {
  const raw = group?.raw || {};
  const arrs = [raw.body?.children, raw.body?.items, raw.children, raw.items];
  for (const arr of arrs) {
    if (!Array.isArray(arr) || arr.length === 0) continue;
    const n = arr.filter((c) => {
      if (!c || typeof c !== 'object') return typeof c === 'string' && c.trim().length > 0;
      const label = String(c.name || c.text || c.characters || '').trim();
      // 纯图层名 / 纯 id 不算业务条目
      if (!label) return false;
      if (/^\d+:\d+$/.test(label)) return false;
      return !/^(Rectangle|Ellipse|Vector|Union|Group|Frame|Line|Star|Path|椭圆|矩形|路径|线段)\s*\d*$/i.test(label);
    }).length;
    if (n > 0) return n;
  }
  return 0;
}

/**
 * 真值 body 的浅拷贝（children/items 元素也各拷一层）：
 * 下游可能给段加字段，不能让它污染 layoutStructure 这份只读事实源。
 */
function cloneTruthBody(body) {
  if (!body || typeof body !== 'object') return undefined;
  const out = { ...body };
  for (const key of ['children', 'items']) {
    if (Array.isArray(body[key])) {
      out[key] = body[key].map((c) => (c && typeof c === 'object' ? { ...c } : c));
    }
  }
  return out;
}

/**
 * 由视觉真值合成一个「装配态」段（形态与 planner effectiveSections 对齐，纯附加）。
 *
 * 🔴 2026-11-12 修正（mc-1794448347521 前身 3d79ee84 实锤）：旧实现写 `children: []`
 *   并注「body 故意不下发，臆造文案比缺文案更糟」—— 判断与事实相反：
 *   真值（6 条厂商卡名）本来就在 layoutStructure 里，不下发 ⇒ prompt 只渲出
 *   `子元素: (空)` ⇒ LLM 只能写通用空壳（产物 ContentSection.vue 默认
 *   `title='内容区块'` / `content=''`，整组空白）。现在**原样透传真值条目**。
 *
 * 🔴 同轮修正 type/layout：旧实现固定 `type:'content'` ⇒ 带 gridColumns 的重建段
 *   对 D-GRID（`type==='grid' || layout==='grid'`）完全失明，列数错了也不判。
 *   现按真值 type/layout 透传，缺省时按列数推导。
 */
function synthesizeSection(group, index) {
  const id = String(group.nodeId || `layout-group-${index + 1}`);
  const cols = group.gridColumns;
  const raw = group.raw && typeof group.raw === 'object' ? group.raw : {};
  const isGrid = Number.isInteger(cols) && cols >= 2;
  const body = cloneTruthBody(raw.body);
  return {
    id,
    name: group.title,
    type: raw.type || (isGrid ? 'grid' : 'content'),
    ...(raw.layout || isGrid ? { layout: raw.layout || 'grid' } : {}),
    figmaNodeId: group.nodeId || id,
    sourceNodeIds: group.sourceNodeIds || [group.nodeId || id],
    ...(group.box ? { absoluteBoundingBox: group.box } : {}),
    ...(cols ? { gridColumns: cols } : {}),
    header: { title: group.title },
    ...(body ? { body } : {}),
    children: Array.isArray(raw.children) ? raw.children.map((c) => (c && typeof c === 'object' ? { ...c } : c)) : [],
    // 🧬 纯附加标记：下游可据此识别「本段由视觉真值重建」，不影响既有字段语义
    __conservationRebuilt: true,
    __conservationSource: 'layoutStructure',
  };
}

/**
 * 缓存：按 (layoutStructure 对象, 规划树签名) 记忆结果。
 * `resolvePlanSections` 一次生成里会被调用十余次，且每次 `dedupeDuplicateSections`
 * 都返回**新数组**（引用不可作键）⇒ 用「段数 + 标题签名」做键，既命中缓存又天然幂等。
 */
const CACHE = new WeakMap();

function planSignature(sections) {
  // 🔴 必须含「内容轨长度」：同 id + 同标题但一个空壳一个有内容，是**不同输入**。
  //   只看 id~title 会让两次调用串味（2026-11-12 实测：空壳用例拿到有内容用例的缓存结果）。
  // 与 `hasContentTrack` 同一素材清单（含 internalSubcomponents / declaredContent）：
  // 漏一个就会让「走内部拆分的段」与「空壳段」撞 key（2026-11-12 实测）。
  const trackLen = (s) => {
    let n = 0;
    for (const arr of [
      s?.body?.children,
      s?.body?.items,
      s?.children,
      s?.items,
      s?.declaredContent?.items,
      s?.internalSubcomponents,
    ]) {
      if (Array.isArray(arr)) n += arr.length;
    }
    return n;
  };
  return sections
    .map((s) => `${s?.id ?? ''}~${ownTitle(s)}~${trackLen(s)}`)
    .join('|');
}

/**
 * 段分组守恒主入口。
 *
 * @param {Object} p
 * @param {Array}  p.sections        规划树（resolvePlanSections 去重后）
 * @param {Object} p.layoutStructure 视觉分析原始结构（唯一分组真值源）
 * @param {Object} [p.logger]        日志器（缺省静默）
 * @param {number} [p.minLayoutGroups=3] 视觉真值少于该组数不判（两组竖向堆叠属常见正常合并）
 * @param {number} [p.minLost=2]     少几组才判塌陷
 * @returns {Array} 段数组；未触发时**原样返回入参引用**（零行为变化）
 */
export function ensureSectionGroupConservation({
  sections,
  layoutStructure,
  logger,
  minLayoutGroups = 3,
  minLost = 2,
} = {}) {
  try {
    if (!Array.isArray(sections) || sections.length === 0) return sections;
    if (!layoutStructure || typeof layoutStructure !== 'object') return sections;

    const sig = planSignature(sections);
    let bucket = CACHE.get(layoutStructure);
    if (!bucket) {
      bucket = new Map();
      CACHE.set(layoutStructure, bucket);
    }
    if (bucket.has(sig)) return bucket.get(sig);

    const layoutGroups = collectLayoutGroups(layoutStructure);
    const planTitles = collectPlanTitles(sections);

    // 两类缺口（判据都在「标题 + 内容」两个维度，只看标题会漏空壳）：
    //   missing = 标题完全缺席 ⇒ 追加整段
    //   hollow  = 标题在但**内容轨为空**、真值有 ≥2 条业务条目 ⇒ 原地补内容（不新增段）
    const missing = [];
    const hollow = [];
    for (const g of layoutGroups) {
      if (!planTitles.has(g.key)) {
        missing.push(g);
        continue;
      }
      const sec = findPlanSectionByTitle(sections, g.key);
      if (sec && !hasContentTrack(sec) && truthItemCount(g) >= 2) hollow.push({ g, sec });
    }

    // 触发门槛**分两类**（口径不同，不能相加）：
    //   · missing 整组缺席：≥minLost(2) 才判 —— 两组竖向堆叠属常见正常合并，误判代价高；
    //   · hollow 空壳：≥1 即补 —— 判据已足够严（标题匹配 + 全无内容轨 + 真值 ≥2 业务条目），
    //     且空壳是「确定性异常」，不需要累积证据（3d79ee84 只有 1 个空壳，相加口径会漏掉）。
    const triggered =
      layoutGroups.length >= minLayoutGroups &&
      (missing.length >= minLost || hollow.length >= 1);

    let result = sections;
    if (triggered) {
      const rebuilt = missing.map((g, i) => synthesizeSection(g, i));
      // 空壳补内容：**不 mutate 入参**（layoutStructure/sections 是只读事实源），逐个换新对象
      let next = sections;
      if (hollow.length > 0) {
        const patch = new Map();
        for (const { g, sec } of hollow) {
          const body = cloneTruthBody(g.raw?.body);
          const children = Array.isArray(g.raw?.children)
            ? g.raw.children.map((c) => (c && typeof c === 'object' ? { ...c } : c))
            : sec.children;
          // ⚠️ 不覆盖已有 gridColumns：planner 段归一化已用**几何反算**修正过
          //   （`row-metrics#deriveGridColumnsFromNode`，几何 > 视觉分析），
          //   layoutStructure 里的值是视觉模型给的（本单 3，真值 4）—— 补内容不能把它改回去。
          const hasCols = Number(sec.gridColumns) >= 2 || Number(sec.body?.gridColumns) >= 2;
          patch.set(sec, {
            ...sec,
            ...(body ? { body } : {}),
            ...(Array.isArray(children) ? { children } : {}),
            ...(g.gridColumns && !hasCols ? { gridColumns: g.gridColumns } : {}),
            __conservationContentFilled: true,
          });
        }
        next = sections.map((sec) => patch.get(sec) || sec);
      }
      result = [...next, ...rebuilt];
      if (logger && typeof logger.info === 'function') {
        logger.info(
          `[SECTION-GROUP-CONSERVATION] 分组塌陷已重建: planGroups=${layoutGroups.length - missing.length - hollow.length}/${layoutGroups.length} ` +
            `recovered=${rebuilt.length} filled=${hollow.length} ` +
            `titles=[${missing.map((g) => g.title).concat(hollow.map((h) => h.g.title)).join(' | ')}]`,
        );
      }
    }

    bucket.set(sig, result);
    return result;
  } catch (e) {
    // fail-open：同源校验失败绝不影响装配（旧行为即「不校验」）
    if (logger && typeof logger.warn === 'function') {
      logger.warn(`[SECTION-GROUP-CONSERVATION] 校验异常已忽略: ${e?.message || e}`);
    }
    return sections;
  }
}
