/**
 * 🛡️ vision-facts —— vision 显式发言的单一事实源（Phase B-1，2026-10-31 治理方案）。
 *
 * 治理方案（docs/2026-10-31-vision形态漂移治理方案.md §Phase B）定案：
 *   任何兜底 / 几何推断 / 自愈机制，执行前必须先检查 vision 是否已就**同一问题**
 *   显式发言；发言 ⇒ 只能填沉默，禁止翻案（「显式事实协议」）。
 *
 * 本模块承担两件事：
 *
 * ① 词表收拢（🔴 评审强制）：既有角色词表曾有 **3 份分散定义**——
 *    - folded-grid-section-takeover.js 的 roleOf + ROLE_ICON/CONTENT/STAT/VALUE/LABEL_SET
 *    - header-geometry-fallback.js 的 businessTypes / businessRoles
 *    - section-type-derive.js 的 TYPE_KEYWORDS + INLINE_HEADING_RE
 *   现全部吸收收拢到此，原处改为引用（或薄壳 re-export）。
 *   **禁止在任何其他文件并列新增第 4 份词表**（split-brain 风险）；
 *   vision-facts.spec.ts 源码扫描判据会拒绝内联定义回潮。
 *
 * ② 显式发言读取口径（declared*）：统一「vision 发言」的读取方式——
 *   读哪些字段、如何归一、缺省返回什么。所有兜底闸门只经此读，不得自行 String()。
 *
 * 适用边界（治理方案 §Phase B 两条硬边界）：
 *   - 只约束「结构语义判定类」兜底（header 定性 / section 类型 / footer 高度 /
 *     角色插槽归属）；产物清洗类自愈（刀53h、刀7）不接线、不减速。
 *   - 只在 vision 骨架路径生效；E1 逃生门（骨架=Figma 树）路径不适用。
 *
 * 纯函数、零副作用依赖（不 import logger），单测直测。
 */

// ─────────────────────────────────────────────────────────────────────────────
// ①-1 角色 token 读取（原 folded-grid-section-takeover.js#roleOf 原样收拢）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 刀 28a：子树角色提取（role 是 vision 给的事实，零语义猜测）。
 * role 优先、type 回退、小写归一。
 */
export function roleOf(node) {
  return String(node?.role || node?.type || '').toLowerCase();
}

// 🛡️ 刀31c（2026-10-29，mc-max-1793258602028-6eafb2f7 实锤）：vision 角色词表
//   跨 run 不稳定（54ae6ee3 用 icon/content/stat-value；6eafb2f7 用 图标/label/stat +
//   value/label）。这里是**归一映射**（词表对齐，非语义猜测）：未命中词表的 role
//   保持原样走旧判据，不认识的结构一律落空回退拍平轨（缺事实不猜）。
export const ROLE_ICON_SET = new Set(['icon', '图标', 'icon-wrap', 'avatar']);
export const ROLE_CONTENT_SET = new Set(['content', 'label', 'texts', 'text-block', '文本', '内容', '信息']);
export const ROLE_STAT_SET = new Set(['stat', 'stat-value', 'stats', '统计', '数值', '数据']);
export const ROLE_VALUE_SET = new Set(['value', '数值', '值']);
export const ROLE_LABEL_SET = new Set(['label', '标签']);

export const isIconRole = (r) => ROLE_ICON_SET.has(r);
export const isContentRole = (r) => ROLE_CONTENT_SET.has(r);
export const isStatRole = (r) => ROLE_STAT_SET.has(r);

// ─────────────────────────────────────────────────────────────────────────────
// ①-2 业务内容词表（原 header-geometry-fallback.js#businessTypes/businessRoles
//     原样收拢，含「header 不是业务类型」的既有语义）
// ─────────────────────────────────────────────────────────────────────────────

export const BUSINESS_TYPE_SET = new Set(['stats', 'list', 'table', 'chart', 'grid', 'footer']);
export const BUSINESS_ROLE_SET = new Set(['stat-card', 'list-item', 'table-header', 'chart']);

// ─────────────────────────────────────────────────────────────────────────────
// ①-3 section 类型关键词表（原 section-type-derive.js#TYPE_KEYWORDS /
//     INLINE_HEADING_RE 原样收拢；deriveSectionType 的优先级链仍在该模块，
//     Phase A 迁入 section-semantics.js 时再动链，本 Phase 只收词表）
// ─────────────────────────────────────────────────────────────────────────────

// 从 section.id / name 推断 type 的关键词表（英文 id 片段 + 中文 name 片段）
// 注意：顺序敏感！复合词（如 header-stats）要排在单一词（如 header）之前，
// 否则 "header-stats" 会先命中 "header" 导致类型误判（2026-09-04 实锤）。
export const TYPE_KEYWORDS = [
  ['stats', ['header-stats', 'stat', 'metric', 'summary', 'overview', '统计', '概览', '指标']],
  ['header', ['header', 'titlebar', '标题栏', '页头']],
  ['footer', ['footer', 'bottom', '底部', '页脚']],
  ['tabs', ['tab', '标签', '切换']],
  ['chart', ['chart', 'graph', 'trend', '图表', '趋势', '曲线', '环形图', '饼图', '柱状图', '柱形图', '折线图', '雷达图', '散点图', '面积图', '漏斗图', '仪表盘', '仪表图', 'eachrts', 'echarts']],
  ['grid', ['grid', '网格']],
  ['list', ['list', '列表', '清单']],
  ['card', ['card', '卡片']],
  ['sidebar', ['sidebar', 'aside', '侧边']],
  [
    'nav',
    [
      'nav',
      'navigation',
      '导航',
      '菜单',
      '侧边',
      '菜单栏',
      '纵向导航',
      '竖向导航',
    ],
  ],
  ['toolbar', ['toolbar', 'action', '工具栏', '操作栏']],
  ['body', ['body', 'content', 'main', '主体', '内容']],
];

// 内容区「小标题」负向表（刀 5a）：这些是业务区块内标题行，不是 base-panel 标题栏，
// 命中即不作为 header（回落 content/stats，或继续匹配其他业务类型）。
export const INLINE_HEADING_RE =
  /(sub[-_ ]?header|小标题|副标题|子标题|分组标题|section[-_ ]?title)/;

// ─────────────────────────────────────────────────────────────────────────────
// ② 显式发言读取口径（declared*）
//    归一口径：只 String().toLowerCase()，不 trim（与 4851eedd 闸门原实现逐字同口径，
//    避免收拢引入行为漂移）；缺省返回 null（= vision 沉默），空串视为沉默。
// ─────────────────────────────────────────────────────────────────────────────

/** vision 对本段 header 关系的显式发言：'no-header' | 'title-itself' | 'title-same-row' | ... */
export function declaredHeaderRelation(sec) {
  const v = String(sec?.headerRelation || '').toLowerCase();
  return v || null;
}

/** vision 对本段类型的显式发言：sec.type > sec.header.type（与 deriveSectionType 同口径）。 */
export function declaredSectionType(sec) {
  const v = String(sec?.type || sec?.header?.type || '').toLowerCase().trim();
  return v || null;
}

/** vision 对本段角色的显式发言：只读 role 字段（type 是另一条发言通道，不回退）。 */
export function declaredRole(sec) {
  const v = String(sec?.role || '').toLowerCase().trim();
  return v || null;
}

/** vision 对本段控件的显式发言。 */
export function declaredControl(sec) {
  const v = String(sec?.control || '').toLowerCase().trim();
  return v || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// ②-1 value 元素识别（4851eedd 第二闸门口径收进单一来源）
// ─────────────────────────────────────────────────────────────────────────────

/** 统计 value 元素类型（面板头部控件条只有 icon-button/label，不会有这些）。 */
export const STAT_VALUE_ELEMENT_TYPES = new Set(['value', 'stat-value', 'metric']);

/**
 * 4851eedd 同单：统计卡的第二种合法形态——卡内是 content.elements 的 value+label
 * 结构（无 role:'stat-card' 标签）。value 角色是业务统计语义，命中即业务内容。
 * 兼容 body.items[0].content.elements / items[0].content.elements / content.elements
 * 三种容器形态。
 */
export function hasStatValueElement(sec) {
  const els = Array.isArray(sec?.body?.items?.[0]?.content?.elements)
    ? sec.body.items[0].content.elements
    : Array.isArray(sec?.items?.[0]?.content?.elements)
      ? sec.items[0].content.elements
      : Array.isArray(sec?.content?.elements)
        ? sec.content.elements
        : [];
  return els.some((e) => STAT_VALUE_ELEMENT_TYPES.has(String(e?.type || '').toLowerCase()));
}

// ─────────────────────────────────────────────────────────────────────────────
// ②-2 几何恢复协议闸门（Phase B-2 接线用，纯谓词便于直测）
//     语义：vision 显式发言与推导类型冲突时，几何恢复只填沉默、不翻案。
// ─────────────────────────────────────────────────────────────────────────────

/**
 * footer 文本锚几何恢复（resolveFooterTextRowBox）是否允许。
 * vision 显式发言与 footer 冲突时禁止恢复（只填沉默、不翻案）：
 *  - type：显式 type ≠ footer（此时 deriveSectionType 本就走不到 footer 路径，闸门为双保险）；
 *  - role：**只拦业务语义冲突**（BUSINESS_TYPE_SET ∪ BUSINESS_ROLE_SET 内且 ≠ footer）。
 *    🔴 零漂移扫描实证（2026-10-31，全量 checkpoint 44 段）：vision 惯用
 *    `role:'常驻'`（chrome 语义）标注 footer 段，与 footer 属性不冲突，不得拦截；
 *    `role:'stats'`/`'list'` 等业务发言才是真冲突（显式发言 > id 前缀推导）。
 * 沉默 / 同向发言 / 中性发言（常驻、container 等） ⇒ 允许（a100e890 既有行为零漂移）。
 */
export function footerGeometryRecoveryAllowed(sec) {
  const declaredType = declaredSectionType(sec);
  if (declaredType && declaredType !== 'footer') return false;
  const role = declaredRole(sec);
  if (
    role &&
    role !== 'footer' &&
    (BUSINESS_TYPE_SET.has(role) || BUSINESS_ROLE_SET.has(role))
  ) {
    return false;
  }
  return true;
}

/**
 * 🛡️ 形态⑤：单个 `table-header` 容器声明（e7da39ca 实锤，2026-11-02）。
 *
 * vision 把**整行表头**收成一个 `body.children` 项：
 *   `{ id:'table-header', role:'table-header', layout:'horizontal',
 *      children:[{type:'label',text:'设备名称'}, …] }`
 * 同行另有 `{ role:'table-body', items:[{role:'table-row', …}] }` 承载数据行；
 * 全表**既无 headers 数组、也无 table-column 逐列声明** ⇒ 旧四形态全落空
 * ⇒ `declaredTableHeaders` 返 null ⇒ `resolveDeclaredTableLca` 失效
 * ⇒ 真机退化 `table:notTableColumn`（43:4791 逐字复现，离线回放已实证）。
 *
 * 严格判据（宁漏不误）：`body.children` 内**恰一个** table-header 容器，
 * 其 children 文本 ≥2 且逐项非空；多容器 / 文本不足 / 有空项 ⇒ null（不猜）。
 * role/type 混用已实证（同容器 `role:'table-header'` + 子项 `type:'label'`），
 * 故经 `roleOf`（role 优先、type 回退）读取——与全模块同口径，不自写 String()。
 */
export function declaredTableHeaderContainerTexts(sec) {
  const children = Array.isArray(sec?.body?.children) ? sec.body.children : [];
  const containers = children.filter((c) => roleOf(c) === 'table-header');
  if (containers.length !== 1) return null;
  const kids = Array.isArray(containers[0]?.children) ? containers[0].children : [];
  const texts = kids.map((k) => String(k?.text ?? '').trim());
  if (texts.length < 2 || !texts.every(Boolean)) return null;
  return texts;
}

/**
 * 形态⑤ 的形态校验真值：`table-header` 容器的表头数 与 `table-body` 首行
 * **非图标单元格**数。供 `detectTableLeaf` 的 fail-closed 闸门
 * （契约与行列结构不自洽 ⇒ 契约不可信 ⇒ 回退几何路径，不用于 LCA 回查）。
 *
 * 无 `table-body` / 行结构 ⇒ null（= 不校验），故对既有四形态**零影响**。
 * 列数按**首行顶层单元格数**计：首列常为「图标 + 文本」复合单元格
 * （43:4791 实锤：`{type:'row',children:[icon,label]}`）仍算一列；
 * 仅当单元格本身是图标、或其唯一子项是图标时才剔除。
 */
export function declaredTableRowArity(sec) {
  const children = Array.isArray(sec?.body?.children) ? sec.body.children : [];
  const body = children.find((c) => ['table-body', 'table-rows', 'table'].includes(roleOf(c)));
  const rows = Array.isArray(body?.items)
    ? body.items
    : Array.isArray(body?.children)
      ? body.children
      : [];
  const row = rows.find((r) => roleOf(r) === 'table-row') || rows[0];
  const cells = Array.isArray(row?.children) ? row.children : [];
  if (cells.length === 0) return null;
  const isIconCell = (c) => {
    if (isIconRole(roleOf(c))) return true;
    const kids = Array.isArray(c?.children) ? c.children : [];
    return kids.length === 1 && isIconRole(roleOf(kids[0]));
  };
  return cells.filter((c) => !isIconCell(c)).length;
}

/**
 * vision 已声明的表头契约（结构语义单一来源，自 section-type-derive.js 吸收迁入）。
 * 兼容顶层 headers、body.headers、body.children[].headers 及对应 tableStyle 形态；
 * 只负责读取，不用表头文本猜几何，也不补造缺失表头。
 */
export function declaredTableHeaders(sec) {
  const candidates = [sec, sec?.body, ...(Array.isArray(sec?.body?.children) ? sec.body.children : [])];
  for (const candidate of candidates) {
    const headers = candidate?.tableStyle?.headers || candidate?.headers;
    if (!Array.isArray(headers) || headers.length < 2) continue;
    const normalized = headers.map((h) => String(h ?? '').trim());
    if (normalized.every(Boolean)) return normalized;
  }
  // 🛡️ 40b65d9f（mc-max-1793429330206 实锤）：第三种合法形态——按列声明。
  //   vision 把每列写成 body.children[].{role:'table-column', header:'设备名称'}，
  //   全表没有 headers 数组；旧实现只认数组形态 ⇒ 表头契约丢失 ⇒ 接管器拿不到
  //   declaredTableHeaders，LCA 回查失效，真机退化 table:notTableColumn。
  //   严格判据：**每列**都必须带非空 header（缺任一即整组不成立，宁漏不误）。
  const columns = Array.isArray(sec?.body?.children) ? sec.body.children : [];
  if (columns.length >= 2) {
    const perColumn = columns.map((c) => String(c?.header ?? '').trim());
    const allColumns = columns.every(
      (c) => String(c?.role || '').toLowerCase() === 'table-column',
    );
    if (allColumns && perColumn.every(Boolean)) return perColumn;
  }
  // 🛡️ 第五种合法形态——单个 `table-header` 容器声明（e7da39ca 实锤，2026-11-02）。
  //   判据与读取口径在 `declaredTableHeaderContainerTexts`（同文件，单一来源）。
  //   置末位 ⇒ 前四形态优先级**逐字不变**，仅在四形态全落空时兜底。
  const containerHeaders = declaredTableHeaderContainerTexts(sec);
  if (containerHeaders) return containerHeaders;
  return null;
}

/**
 * 表格整盒几何恢复（resolveVisionSectionBox 的 whole-table 路径）是否允许。
 * 🔴 零漂移扫描实证（2026-10-31，全量 checkpoint）：表头契约本身就是 vision 对
 * 「这是表格」的最强显式发言，且契约 > type 字段的优先级已裁决（刀5c：e99a736f 的
 * `type:'tabs'` 是下游旧规划残留，deriveSectionType 契约优先是既有正确行为），
 * 有契约 ⇒ 必须允许（闸门翻案 = 4 段真实回归）。无契约时显式 type ≠ table ⇒ 禁止。
 */
export function tableGeometryRecoveryAllowed(sec) {
  if (declaredTableHeaders(sec)) return true;
  const declaredType = declaredSectionType(sec);
  if (declaredType && declaredType !== 'table') return false;
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// ②-3 本段文案发言（Phase I-3，2026-11-02）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 🛡️ Phase I-3（2026-11-02，3b0689c9 真机铁证）：vision 对**本段有哪些文案**的显式发言（body 侧）。
 *
 * 背景：planner 会把某些段规整成**合成 section**（真机铁证 `id:'footer-summary'`、
 * `sourceNodeIds:[]`——占位、无真实 Figma 节点），而该段的全部文案 vision 早已写进 `body`
 * （`items[].content.elements[].text` = `共 6 个节点` / `接入设备 ` / `10810`）。
 * 既有真值收集只经 `sourceNodeIds` 走 Figma 子树 ⇒ 合成段恒空
 * ⇒ `checkSectionTruthCoverage` 在 `truthTexts.length===0` 处 `continue` 失明
 * ⇒ 「骨架挂 A 段、内容整段装 B 段」这种最刺眼的缺陷无人拦（同一份真值 COMP-002 本该管）。
 *
 * 判据（宁漏不误，只读 vision 已声明的事实，零语义猜测）：
 *   · 递归遍历 `sec.body`（仅对象/数组节点，深度上限 12 防意外嵌套）；
 *   · 收集对象上的**非空 `text` 字段**（string / number，`String().trim()`）；
 *   · 另收 `*.headers` 数组里的非空字符串（vision 的「表头列文案」声明形态）；
 *   · 未声明 / body 缺失 ⇒ `[]`（= vision 沉默，调用方不得据此推断）。
 *
 * 用途与边界：仅供 `section-content-guard#buildSectionEvidenceCtx` 在
 * **Figma 子树文案为空**时兜底补真值（置末位 ⇒ 有子树的段逐字不变，零漂移）。
 * 本函数不判归属、不判类型、不猜几何 —— 归属仍由 `section-content-guard` 的
 * 「唯一归属 + 子树不交叠」两道约束把关。
 */
export function collectSectionBodyTexts(sec) {
  const body = sec?.body;
  if (!body || typeof body !== 'object') return [];
  const out = new Set();
  const seen = new Set();
  const walk = (node, depth) => {
    if (!node || typeof node !== 'object' || depth > 12) return;
    if (Array.isArray(node)) {
      for (const it of node) walk(it, depth + 1);
      return;
    }
    if (seen.has(node)) return;
    seen.add(node);
    const t = node.text;
    if (typeof t === 'string' || typeof t === 'number') {
      const s = String(t).trim();
      if (s) out.add(s);
    }
    if (Array.isArray(node.headers)) {
      for (const h of node.headers) {
        const s = String(h ?? '').trim();
        if (s) out.add(s);
      }
    }
    for (const v of Object.values(node)) {
      if (v && typeof v === 'object') walk(v, depth + 1);
    }
  };
  walk(body, 0);
  return [...out];
}

/**
 * 🎯 Phase I-1/2（2026-11-02）：任意节点（Figma 原始节点 / vision 节点）的文案抽取。
 *
 * 与 `collectSectionBodyTexts` 同构（有界递归 + visited 防环），但**不绑 body**：
 *   · 支持 `text`（vision 归一后的字段）与 `characters`（Figma TEXT 原生字段）；
 *   · 支持 `headers[]`（vision 表头声明形态）。
 *
 * 用途：段身份契约要下发「本段允许渲染的全部业务文案」，其真值必须同时覆盖
 * vision 侧（plan section）与 Figma 侧（节点子树）两个来源——单看一边必漏。
 */
export function collectNodeTexts(node, maxDepth = 12) {
  const out = new Set();
  const seen = new Set();
  const walk = (n, depth) => {
    if (!n || typeof n !== 'object' || depth > maxDepth) return;
    if (Array.isArray(n)) {
      for (const it of n) walk(it, depth + 1);
      return;
    }
    if (seen.has(n)) return;
    seen.add(n);
    for (const k of ['text', 'characters']) {
      const v = n[k];
      if (typeof v === 'string' || typeof v === 'number') {
        const s = String(v).trim();
        if (s) out.add(s);
      }
    }
    if (Array.isArray(n.headers)) {
      for (const h of n.headers) {
        const s = String(h ?? '').trim();
        if (s) out.add(s);
      }
    }
    for (const v of Object.values(n)) {
      if (v && typeof v === 'object') walk(v, depth + 1);
    }
  };
  walk(node, 0);
  return [...out];
}

/**
 * 🎯 Phase I-1/2（2026-11-02）：section 的「真值文本全集」（段身份契约唯一来源）。
 *
 * 与 I-3 完全同源（`collectSectionBodyTexts` 置首），再补两类 vision 已声明的实例事实：
 *   ① `items[].name` —— 折叠重复段（`collapsed` + `items[]`）把 N 个重复实例合并成 1 个
 *      section，`body` 里只有**一份模板**；只有 items 才带「江苏联网节点」这类实例名。
 *   ② `items[]` 子树的 `text` / `characters`（经 `collectNodeTexts`，同口径）。
 *
 * 边界（宁漏不造）：
 *   · **不收** `sec.title` / `sec.responsibility` —— 那是 planner 的元信息，
 *     真机上 `footer-summary` 的标题「底部汇总」在 Figma 里根本不存在，
 *     收进来就等于允许 LLM 渲染一条臆造标题（撞 N1 数字/文案臆造铁律）。
 *   · 未声明 / 无 body 无 items ⇒ `[]`（= vision 沉默，调用方不得据此推断）。
 */
export function collectSectionTruthTexts(sec) {
  const out = new Set();
  if (!sec || typeof sec !== 'object') return [];
  for (const t of collectSectionBodyTexts(sec)) out.add(t);
  for (const it of Array.isArray(sec.items) ? sec.items : []) {
    if (!it || typeof it !== 'object') continue;
    if (typeof it.name === 'string' && it.name.trim()) out.add(it.name.trim());
    for (const t of collectNodeTexts(it)) out.add(t);
  }
  return [...out];
}
