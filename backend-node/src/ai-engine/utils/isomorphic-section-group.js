/**
 * 🧬 刀 66（2026-11-06 · mc-max-1793899537377-9a3c56bb / mc-max-1793900176467-269cb2cf）：
 * 同构段收敛 —— 「单模板参数化 + 兄弟薄包装」的检测与数据提取（纯函数，可 spec）。
 *
 * ## 病灶
 * 同一页 N 个语义同构的「标题行 + grid 标签卡」段（如三厂商段：战略合作/优质/普通，
 * 仅厂商数 6/12/15 不同），管线按段切块、每段独立一次 LLM 调用 ⇒ 三副面孔
 * （结构/类名/头部组织/着色规则各不同）。补充提示词（269cb2cf 取证：9/9 chunk 均收到
 * 「使用循环、保持一致」）只能约束段内 v-for，管不到跨 chunk 结构复用——
 * LLM 是概率生成器，跨段一致性必须由代码保证。
 *
 * ## 方案 A（用户裁决 2026-11-06）
 * 代表段由 LLM 生成**参数化模板**（props: title/icon/items）一次；兄弟段由本模块
 * 确定性渲染**薄包装**（转发 props，数据取自各段 effectiveSections 真值）；
 * index.vue 零改动（文件名契约不变）。检测只做「找组 + 提数据」，渲染契约与
 * 包装写入见 prompt-builder.js#buildIsoTemplateContract 与 microcode-engineer.js 集成点。
 *
 * ## fail-open 纪律
 * 任何资格判据事实缺失 ⇒ 该段不入组、整组放弃，走既有独立 LLM chunk 路径（零回归）。
 * 与刀 53 的关系：刀 53 先评估先接管；已被刀 53 接管的段由调用方剔除后再进本检测
 * （互斥，见 microcode-engineer 集成点）。
 */

/** 同构组最小成员数（≥2 才有收敛价值） */
export const ISO_GROUP_MIN_MEMBERS = 2;

/**
 * 段内条目轨的字段名（vision 对同一形态有多种落点）。
 * 🛡️ 2026-11-06（mc-max-1793913218521-5d1eb324 实锤）：旧实现**只认 `body.children`**，
 *   而本任务三厂商段真实落点是 `body.items`（6/12/15 条，role=stat-card）⇒ 判据第 64 行
 *   直接 `no-children` 返回 ⇒ 同构组恒 0 ⇒ 三段各自独立 LLM 生成（三副面孔复发）。
 *   vision 的条目轨字段名属**形态自由文本**，判据必须按「哪条轨有内容」取，而不是押一个名字。
 */
export const ISO_ENTRY_KEYS = ['children', 'items', 'elements'];

/**
 * 🧬 刀 66-P0（2026-11-12 · mc-max-1794420265256-036db2a1 实锤）：段内容容器的**单一访问器**。
 *
 * 病灶：`generation-context-assembler` 把 planner 的 `body` 归一化成 `declaredContent`
 * （实测 context-shadow：`effectiveSections[i].body === undefined`、`declaredContent` 才是内容，
 * 归一化日志 `bodySections:5 bodyNodes:45` 说的是归一化**前**的 body）。而
 * `resolvePlanSections()` 优先返回归一化后的 `componentPlan` ⇒ 判据读 `sec.body` 恒空
 * ⇒ `ISO-CONVERGE groupsRaw=0`（真机：evaluated=5 / groups=0 连续两单）。
 *
 * 纪律：两种形态只是**同一事实的两种建模**，判据必须自适应，不能只押一个字段名
 * （同 `ISO_ENTRY_KEYS` / `ISO_ENTRY_ROLE_DENY_RX` 的教训：押措辞=穷举，必然翻车）。
 */
export function isoSectionContent(sec) {
  const c = sec?.body ?? sec?.declaredContent;
  return c && typeof c === 'object' ? c : null;
}

/** 条目列表容器？——自有条目轨、自身**不带**叶子文案/媒体/图表（否则它自己就是条目）。 */
function isoIsEntryListContainer(node) {
  if (!node || typeof node !== 'object') return false;
  const kids = ISO_ENTRY_KEYS.map((k) => node[k]).find(
    (v) => Array.isArray(v) && v.length > 0,
  );
  if (!kids) return false;
  if (isoEntryText(node)) return false;
  if (node.icon || node.image || node.chart || node.charts) return false;
  return true;
}

/**
 * 🧬 刀 66-P0：条目轨解析 —— 识别「列表容器」并**只下钻一层**。
 *
 * 真机形态（mc-max-1794420265256-036db2a1 三厂商段，planner 原形与归一化口一致）：
 *   `body = { layout:'vertical', children:[ {type:'icon',figmaNode:'38:3160'},
 *                                          {type:'list',layout:'grid',gridColumns:4,items:[6个tag]} ] }`
 * 旧判据把 `children` 当条目轨 ⇒ entries=[icon, list]（2 条）且布局取外层 `vertical`
 * ⇒ `layout-column` 全拒。**条目在 list 容器里，布局事实也在 list 上**，必须取 list。
 *
 * 下钻条件（保守，任一不满足即保持原样）：
 *  ① 恰好一个成员是「条目列表容器」；
 *  ② 其余成员**都没有叶子文案**（图标/装饰允许）—— 有条目文本说明这是扁平条目轨。
 * @returns {{content: object, container: object, entries: Array}|null}
 */
export function isoSectionTrack(sec, options = {}) {
  const content = isoSectionContent(sec);
  if (!content) return null;
  const arr = ISO_ENTRY_KEYS.map((k) => content[k]).find(
    (v) => Array.isArray(v) && v.length > 0,
  );
  if (!arr) return { content, container: content, entries: [] };
  const lists = arr.filter(isoIsEntryListContainer);
  let container = content;
  let entries = arr;
  if (lists.length === 1) {
    const list = lists[0];
    const others = arr.filter((x) => x !== list);
    if (others.every((x) => !isoEntryText(x))) {
      const inner = ISO_ENTRY_KEYS.map((k) => list[k]).find(
        (v) => Array.isArray(v) && v.length > 0,
      );
      if (inner && inner.length > 0) {
        container = list;
        entries = inner;
      }
    }
  }
  return {
    content,
    container,
    entries: options.flattenOneLevel === true ? flattenPureGroupEntries(entries) : entries,
  };
}

/**
 * 段条目轨的归一布局事实（方向 + 列数）。
 * 内层容器（list）的布局优先：外层 `vertical` 只说明「标题行 + 列表」竖排，
 * 真正的条目排布在外层容器上（4 列网格）。
 */
export function isoSectionLayout(sec, options = {}) {
  const t = isoSectionTrack(sec, options);
  if (!t) return normalizeSectionLayout(null);
  const inner = normalizeSectionLayout(t.container);
  if (t.container === t.content) return inner;
  const outer = normalizeSectionLayout(t.content);
  const columns = inner.columns ?? outer.columns ?? null;
  const direction =
    inner.direction === 'row' || outer.direction === 'row'
      ? 'row'
      : inner.direction || outer.direction || '';
  return { direction, columns, raw: inner.raw || outer.raw };
}

/**
 * 条目角色**黑名单**（结构禁忌，而非白名单）。
 *
 * 🛡️ 2026-11-06（mc-max-1793918427218-245878e6 第三次形态实锤）：旧实现用**白名单**
 *   （`label|tag|stat-card|statcard|item|card|text|value`）判条目资格，vision 第三次给了
 *   `vendor-item` ⇒ `entry-role:vendor-item` 拒绝 ⇒ 三段继续各自 LLM 生成（三副面孔复发）。
 *   白名单的本质是「穷举 vision 措辞」—— 措辞是自由文本，永远穷举不完（已连续三次翻车：
 *   `label` / `stat-card` / `vendor-item`）。
 *   改为**黑名单**：只否决结构上不可能是「可参数化叶子条目」的角色（容器/图形/图表/媒体），
 *   其余一律放行。不放宽危害面：媒体字段否决、容器字段否决、条目必须自带文本 三条仍在。
 */
const ISO_ENTRY_ROLE_DENY_RX = /^(chart|charts|table|thead|tbody|image|img|icon|media|video|canvas|svg|container|wrapper|frame|group|layout|bg|background|decoration)$/i;

/**
 * 🧬 刀 66-P0（2026-11-12 · mc-max-1794412722103-adbd1b3d 实锤）：
 * 把「纯分组容器」**只读展平一层**。本次三厂商段的 body.children 是
 * 「厂商卡片组1/2/3」容器（自带 name、无文本/数值/媒体），其 children 才是
 * stat-card 叶子 ⇒ 旧判据 `entry-nested` 全拒、groups=0、三副面孔复发。
 *
 * 展平条件（全部同时成立，任一不满足即保持原样 ⇒ 仍由 `entry-nested` 否决）：
 *  ① 容器有非空 children；
 *  ② 容器自身不含叶子文本/数值字段（text/label/value/count/num；`name` 只是图层名，不算叶子文本）；
 *  ③ 容器自身不含媒体/图表字段（icon/image/chart/charts）；
 *  ④ 所有 children 都是「自带文本的叶子」（无下级 children、无媒体、有 name/text/label/value）。
 * ⇒ 带图表/图标的容器、二层嵌套、混合角色、空组一律不展平，门禁不放宽。
 * 这是**只读派生**：不改 sec、不写回视觉产物，仅判据内部使用。
 */
export function flattenPureGroupEntries(entries) {
  const src = Array.isArray(entries) ? entries : [];
  const out = [];
  for (const ch of src) {
    if (!ch || typeof ch !== 'object') { out.push(ch); continue; }
    const kids = Array.isArray(ch.children) ? ch.children : null;
    const hasLeafText = ['text', 'label', 'value', 'count', 'num'].some(
      (k) => ch[k] != null && String(ch[k]).trim() !== '',
    );
    const hasMedia = !!(ch.icon || ch.image || ch.chart || ch.charts);
    const kidsAreLeaves = !!kids && kids.length > 0 && kids.every((k) => {
      if (!k || typeof k !== 'object') return false;
      if (Array.isArray(k.children) && k.children.length > 0) return false;
      if (k.icon || k.image || k.chart || k.charts) return false;
      const t = k.name ?? k.text ?? k.label ?? k.value;
      return typeof t === 'string' && t.trim() !== '';
    });
    if (kids && !hasLeafText && !hasMedia && kidsAreLeaves) out.push(...kids);
    else out.push(ch);
  }
  return out;
}

/** 取段内容目轨（children 优先，退化 items/elements）。返回 [] 表示无条目。
 *  options.flattenOneLevel=true 时只读展平一层纯分组容器（默认 false ⇒ 零行为变更）。
 *  🧬 刀 66-P0：容器访问与下钻统一走 `isoSectionTrack`（兼容 `body`/`declaredContent`
 *  两种建模 + 「list 容器包条目」形态），不再直接押 `sec.body.children`。
 */
export function isoBodyEntries(sec, options = {}) {
  const track = isoSectionTrack(sec, options);
  return track ? track.entries : [];
}

/**
 * 段主体布局归一：**不押 vision 措辞**，只抽结构事实 `{direction, columns}`。
 *
 * 🛡️ 2026-11-06（245878e6 实锤）：三次真机给了三种写法 ——
 *   `grid` + `gridColumns:4`（269cb2cf）/ `grid`（5d1eb324）/ `horizontal-4-columns` 且
 *   **无 gridColumns**（本次）。旧判据押 `layout === 'grid'` 且 `gridColumns` 必填 ⇒
 *   本次两道闸门同时拒绝 ⇒ `groups=0`。
 *   本函数把「方向 + 列数」从任意写法里抽出来：方向按行/列语义词，列数先取显式字段、
 *   再退回 layout 词里的 `-N-columns` / `N列` 后缀（确定性解析，不是猜）。
 * @returns {{direction: 'row'|'column'|'', columns: number|null, raw: string}}
 */
export function normalizeSectionLayout(body) {
  const raw = String(body?.layout || '').toLowerCase().trim();
  let columns = null;
  const gc = Number(body?.gridColumns);
  if (Number.isInteger(gc) && gc > 0) columns = gc;
  if (columns == null) {
    const m = /(\d+)\s*(?:-?\s*(?:columns?|col)\b|列)/.exec(raw);
    if (m) columns = Number(m[1]);
  }
  // 🔴 方向判定顺序有讲究：`horizontal-4-columns` 里的 `column` 是**列数**不是 flex 方向
  //   （先判 column 会让它被误判成纵排 —— 本函数初版就踩了这个，三段全被 layout-column 拒）。
  //   故：显式横排词 / `N-columns`(N≥2) ⇒ row；`vertical|纵向|竖向|1-column` ⇒ column。
  const horizontalish = /row|horizontal|grid|横向|横/.test(raw) || (columns != null && columns >= 2);
  const verticalish = /vertical|纵向|竖向|竖/.test(raw);
  const direction = horizontalish ? 'row' : verticalish ? 'column' : '';
  return { direction, columns, raw };
}

/**
 * 段资格判据（全部满足才可入同构组）。
 * v3 只认**结构**：`header.title` + 条目轨（children/items/elements）+ 横向多列布局
 * （方向/列数走 `normalizeSectionLayout`，不再押 `grid` 字面量与 `gridColumns` 必填）+
 * 条目是「自带文本的叶子」（媒体/图表/容器字段否决，角色只走**黑名单**）。
 * 特化类型（stats/chart/table）与插槽候选一票否决，避免误收敛。
 * @returns {{eligible: boolean, reason: string}}
 */
export function assessIsoEligibility(sec, options = {}) {
  if (!sec || typeof sec !== 'object') return { eligible: false, reason: 'not-object' };
  if (sec.slotCandidate) return { eligible: false, reason: 'slot-candidate' };
  const type = sec.type == null ? '' : String(sec.type);
  if (type && !/^(content|list|card|grid|section|body)$/i.test(type)) {
    return { eligible: false, reason: `type:${type || 'empty'}` };
  }
  const header = sec.header;
  if (!header || typeof header !== 'object') return { eligible: false, reason: 'no-header' };
  if (typeof header.title !== 'string' || !header.title.trim()) {
    return { eligible: false, reason: 'no-header-title' };
  }
  // 🔴 `header.styles` 只在**存在时**参与签名：缺省不等于不合法（真机常态）。
  if (header.styles != null && typeof header.styles !== 'object') {
    return { eligible: false, reason: 'header-styles-invalid' };
  }
  const controls = Array.isArray(header.controls) ? header.controls : [];
  for (const c of controls) {
    if (c && String(c.type || '') !== 'icon') {
      return { eligible: false, reason: `header-control:${c.type || 'unknown'}` };
    }
  }
  const body = isoSectionContent(sec);
  if (!body || typeof body !== 'object') return { eligible: false, reason: 'no-body' };
  const lay = isoSectionLayout(sec, options);
  // 只收「横向多列」条目段；纵向列（= 列表，归刀53 list 域）与无法判定方向的一律不碰。
  if (lay.direction === 'column') return { eligible: false, reason: 'layout-column' };
  if (lay.direction !== 'row' && !(lay.columns >= 2)) {
    return { eligible: false, reason: `layout:${lay.raw || 'empty'}` };
  }
  const entries = isoBodyEntries(sec, options);
  if (entries.length === 0) return { eligible: false, reason: 'no-entries' };
  for (const ch of entries) {
    if (!ch || typeof ch !== 'object') return { eligible: false, reason: 'entry-not-object' };
    // 角色只做**黑名单**否决（容器/图形/图表/媒体），不穷举条目措辞（三次翻车教训）
    const role = String(ch.role || '');
    if (ISO_ENTRY_ROLE_DENY_RX.test(role)) {
      return { eligible: false, reason: `entry-role-denied:${role}` };
    }
    // 媒体/图表字段一票否决（只收敛纯文本/数值条目卡）
    if (ch.icon || ch.image || ch.chart || ch.charts) {
      return { eligible: false, reason: 'entry-media' };
    }
    // 嵌套容器（子条目数组）不是「可参数化叶子」⇒ 不收敛（交由既有接管/LLM 路径）
    if (Array.isArray(ch.children) && ch.children.length > 0) {
      return { eligible: false, reason: 'entry-nested' };
    }
    if (!isoEntryText(ch)) {
      return { eligible: false, reason: 'entry-no-text' };
    }
  }
  return { eligible: true, reason: 'ok' };
}

/** 条目主文案提取（name 优先，退化 text/label/value） */
function isoEntryText(ch) {
  const t = ch.name ?? ch.text ?? ch.label ?? ch.value;
  return typeof t === 'string' && t.trim() ? t : '';
}

/** 条目副文案（数值/台数等；无则 ''） */
function isoEntryValue(ch) {
  const v = ch.value ?? ch.count ?? ch.num;
  return typeof v === 'string' || typeof v === 'number' ? String(v) : '';
}

/**
 * 🧬 P1-2（2026-11-12 · 8b15a757 实锤）：条目「名称 / 数值」确定性拆分。
 *
 * ## 病灶
 * 真值条目形如 `{type:'partner-card', name:'华为技术', text:'华为技术 8台'}`——
 * `isoEntryText` 取 `name`、`isoEntryValue` 只认 `value/count/num`（全 undefined ⇒ ''）
 * ⇒ 尾段「8台」整段丢失，产物 `{"name":"华为技术","value":""}`，C1b 12 条真值标签缺席。
 *
 * ## 判据（与 splitTitleValueByStyle 同一纪律：样式/文本真值驱动、命名无关、不臆造）
 * ① `text` 存在且**以 name 为前缀**（`华为技术 8台`.startsWith(`华为技术`)）；
 * ② 尾段匹配 `数字+单位`（单位为空也允许，如「8」；负号/小数允许）；
 * ③ 已有显式 value/count/num 时**不覆盖**（真值优先级：显式字段 > text 尾段拆分）；
 * ④ 不满足 ①② ⇒ 原样返回（fail-open，绝不臆造数值）。
 */
const ISO_TRAIL_NUM_RE = /^(-?\d+(?:\.\d+)?)\s*(.*)$/;

/** 单条 name/value 拆分（纯函数）。@returns {{name:string,value:string}} */
export function splitIsoEntryNameValue(ch) {
  const name = isoEntryText(ch);
  let value = isoEntryValue(ch);
  const text = typeof ch?.text === 'string' ? ch.text.trim() : '';
  // 显式 value 已有 ⇒ 不覆盖；text 与 name 同源（前缀关系）才可信
  if (!value && name && text && text.startsWith(name)) {
    const trail = text.slice(name.length).trim();
    const m = ISO_TRAIL_NUM_RE.exec(trail);
    if (m) {
      const unit = (m[2] || '').trim();
      value = unit ? `${m[1]}${unit}` : m[1];
    }
  }
  return { name, value };
}

/**
 * 🧬 P1-2 伴生：条目轨「伪条目」过滤（icon 等媒体装饰不进 items 数据）。
 * 8b15a757 实锤：三组末尾各混入一条 `{"type":"icon","name":"战略合作厂商图标",...}`
 * ⇒ 落盘 items 出现 `{"name":"","value":""}` 空条目（icon 的 name 是图层名，
 * isoEntryText 退化取了它但语义上是装饰）。判据：type/role 在媒体黑名单或带
 * 资源字段（resourceFile/figmaNode+icon 类）⇒ 不进条目数据。
 * 注意：这是**数据提取层**过滤，不改变 assessIsoEligibility 的资格裁决（黑名单
 * 已在那里兜底；此处处理「flatten 后混入且未带 role」的形态）。
 */
export function filterIsoPseudoEntries(entries) {
  const src = Array.isArray(entries) ? entries : [];
  return src.filter((ch) => {
    if (!ch || typeof ch !== 'object') return true; // 非对象原样保留（由资格判据否决）
    const t = String(ch.type || ch.role || '');
    if (ISO_ENTRY_ROLE_DENY_RX.test(t)) return false;
    if (ch.icon || ch.image || ch.chart || ch.charts) return false;
    if (typeof ch.resourceFile === 'string' && ch.resourceFile) return false;
    // 带资源变量名的图标（resourceVarName / recommendedUsage=imgSrc 形态）
    if (ch.resourceVarName || ch.figmaNode && /icon|图标/i.test(String(ch.name || ''))) return false;
    return true;
  });
}

function stableStringify(value) {
  if (value === null || value === undefined) return String(value);
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

/**
 * 同构签名：只取**结构性**字段，忽略 title 文本与 children 内容（那是参数化差异）。
 * 返回 null 表示不可签名（未过资格判据）。
 */
export function sectionRoleSignature(sec, options = {}) {
  const a = assessIsoEligibility(sec, options);
  if (!a.eligible) return null;
  const header = sec.header;
  const controls = Array.isArray(header.controls) ? header.controls : [];
  // 🛡️ 指纹只取**首个条目**的形态：条目数是参数化差异（items.length），
  //   不能进签名——否则 6/12/15 条的三厂商段永远不同构（首版实测踩坑）。
  //   条目字段也按 ISO_ENTRY_KEYS 取（children / items 同一种语义两种落点）。
  const firstEntry = isoBodyEntries(sec, options)[0] || {};
  const entryShape = {
    // 🔴 role **故意不进签名**：它是 vision 自由文本（label/tag/stat-card/vendor-item 多种
    //   写法同指一类条目卡），进签名只会把同构段按措辞拆散 —— 这正是三次 0 命中的形态成因。
    //   角色由资格判据的**黑名单**校验，签名只管结构性差异。
    fill: firstEntry.repeatedFill ?? firstEntry.fill ?? '',
    styles: firstEntry.styles || {},
  };
  // 🔴 布局进签名只用**归一后的方向 + 列数**：`grid` / `horizontal-4-columns` 是同一种
  //   结构事实的两种写法，押原字符串会把同构段按措辞拆散（245878e6 实锤）。
  const lay = isoSectionLayout(sec, options);
  return stableStringify({
    type: sec.type ?? '',
    direction: lay.direction,
    columns: lay.columns,
    // 缺省 styles 统一记 `{}`，不因「有的段有、有的段没有」把同构段拆开
    headerStyles: header.styles || {},
    iconControl: controls.length > 0,
    entryShape,
  });
}

/**
 * 视觉声明的交叉验证（判据单一来源）：声明**只能校验候选，不能豁免资格**。
 * 只有「声明的全部 sectionId 都过本地资格、且落在同一个本地签名组」才算 verified。
 * 声明单独存在而本地判据不通过 ⇒ rejected，绝不因声明而创建组（防模型误合并）。
 */
export function verifyIsoCandidate(declaredGroup, sigById, localGroups) {
  const ids = Array.isArray(declaredGroup?.sectionIds)
    ? declaredGroup.sectionIds.map(String).filter(Boolean)
    : [];
  if (ids.length === 0) return { ok: false, reason: 'declared-empty' };
  const sigs = new Set();
  for (const id of ids) {
    const sig = sigById.get(id);
    if (!sig) return { ok: false, reason: `declared-not-eligible:${id}` };
    sigs.add(sig);
  }
  if (sigs.size !== 1) return { ok: false, reason: 'declared-mixed-signature' };
  const hit = localGroups.some((g) => ids.every((id) => g.sectionIds.includes(id)));
  return hit
    ? { ok: true, reason: 'ok', sectionIds: ids }
    : { ok: false, reason: 'declared-no-local-group' };
}

/**
 * 收集同构组（顶层段；v1 不下钻嵌套——保守起点）。
 * options:
 *   - flattenOneLevel: 只读展平一层纯分组容器（默认 false ⇒ 与旧版逐字一致，零行为变更）
 *   - truth: L0 注入的 Figma 真值 `{sections:[{id, columns, theme}]}`；存在时只做
 *            「Figma 可解析性 + 列数」交叉校验并附带 theme，**不替代本地签名分组**
 *   - declaredGroups: 视觉声明的候选组，仅校验与留痕，不触发收敛
 * @returns {{evaluated: number, groups: Array, stats: {declared, verified, rejected, withTruth, reasons}}}
 */
export function collectIsomorphicSectionGroups(treeSections, options = {}) {
  const minMembers = Number.isInteger(options.minMembers)
    ? options.minMembers
    : ISO_GROUP_MIN_MEMBERS;
  const list = Array.isArray(treeSections) ? treeSections : [];
  const truthSections = Array.isArray(options.truth?.sections) ? options.truth.sections : [];
  const truthById = new Map(truthSections.map((t) => [String(t?.id || ''), t]));
  const bySig = new Map();
  const sigById = new Map();
  const rejectReasons = [];
  let evaluated = 0;
  let withTruth = 0;
  for (const sec of list) {
    evaluated += 1;
    const sig = sectionRoleSignature(sec, options);
    if (!sig) {
      // 🔴 归因必需（2026-11-12）：此前资格否决**不留因**，导致计数行
      //   `rejected=0 reasons=[]` 与「真的没有段被拒」不可区分（假绿）。
      //   资格判据仍是唯一来源（assessIsoEligibility），此处只记录不裁决。
      const why = assessIsoEligibility(sec, options).reason;
      rejectReasons.push(
        why === 'ok' ? `signature-empty:${String(sec?.id)}` : `ineligible:${why}:${String(sec?.id)}`,
      );
      continue;
    }
    const id = String(sec.id);
    // 🔴 真值**整体缺失**（缓存 / 断点续跑 / 无 Figma）⇒ 跳过校验，零回归；
    //    真值存在但某段在 Figma 树不可解析 ⇒ 该段不入组（防幻觉段混入）。
    if (truthById.size > 0) {
      const t = truthById.get(id);
      if (!t) { rejectReasons.push(`truth-missing:${id}`); continue; }
      const localColumns = isoSectionLayout(sec, options).columns;
      if (Number.isInteger(t.columns) && Number.isInteger(localColumns) && t.columns !== localColumns) {
        rejectReasons.push(`truth-columns:${id}`);
        continue;
      }
      withTruth += 1;
    }
    sigById.set(id, sig);
    if (!bySig.has(sig)) bySig.set(sig, []);
    bySig.get(sig).push(sec);
  }
  const groups = [];
  for (const [signature, secs] of bySig) {
    if (secs.length < minMembers) continue;
    // 归一布局事实随组下发（代表模板需要列数，见 prompt-builder#buildIsoTemplateContract）
    const lay = isoSectionLayout(secs[0], options);
    groups.push({
      signature,
      sectionIds: secs.map((s) => String(s.id)),
      representativeId: String(secs[0].id),
      direction: lay.direction,
      columns: lay.columns,
      members: secs.map((s) => {
        const iconHit = pickIconOwnerHit(s, options);
        return {
          id: String(s.id),
          title: String(s.header.title),
          icon: extractIconResource(s, options),
          // 系统分配的变量名（仅资源映射归属口有）；index 改写优先用它做 import 名
          ...(iconHit && iconHit.varName ? { iconVar: iconHit.varName } : {}),
          // 🛡️ 条目形状统一为 `{ name, value }`（value 可为 ''）：单模板参数化后，模板只需
          //   认一种形状；厂商段的「台数」、标签段的「无值」都由同一字段承载。
          // 🔴 theme 只在真值存在时**纯附加**（无真值时 member 结构与旧版逐字节一致）。
          ...(truthById.get(String(s.id))?.theme &&
            typeof truthById.get(String(s.id)).theme === 'object'
            ? { theme: truthById.get(String(s.id)).theme }
            : {}),
          // 🧬 P1-2（8b15a757 实锤）：items 三处根治——
          //   ① filterIsoPseudoEntries：icon 等媒体伪条目不进数据（末尾 {"name":"","value":""} 消除）；
          //   ② splitIsoEntryNameValue：text 尾段「数字+单位」确定性拆分（显式 value 优先）；
          //   ③ 拆不出 value 时保持 ''（fail-open，不臆造）。
          items: filterIsoPseudoEntries(isoBodyEntries(s, options)).map((ch) =>
            splitIsoEntryNameValue(ch),
          ),
        };
      }),
    });
  }
  const declared = Array.isArray(options.declaredGroups) ? options.declaredGroups : [];
  let verified = 0;
  let rejected = 0;
  for (const d of declared) {
    const v = verifyIsoCandidate(d, sigById, groups);
    if (v.ok) verified += 1;
    else { rejected += 1; rejectReasons.push(v.reason); }
  }
  return {
    evaluated,
    groups,
    // 纯附加统计：旧消费者只读 evaluated / groups，零漂移
    stats: { declared: declared.length, verified, rejected, withTruth, reasons: rejectReasons },
  };
}

/** 从资源映射（resource-dom-mapping）建 `figmaNodeId → resourceFile` 表。
 *  同构成员图标必须按节点取（planner 会给多段塞同一个 resourceFile，见
 *  `extractIconResource` 头注释）。非数组/空项安全跳过。 */
export function buildIsoResourceByNode(mapping) {
  const out = new Map();
  for (const e of Array.isArray(mapping) ? mapping : []) {
    if (!e || typeof e !== 'object') continue;
    const node = e.figmaNodeId || e.figmaNode || e.nodeId;
    const rf = e.resourceFile;
    if (!node || typeof rf !== 'string' || !rf) continue;
    const key = String(node);
    if (!out.has(key)) out.set(key, rf);
  }
  return out;
}

/** 从资源映射（resource-dom-mapping）建 `ownerSectionId → 段头 icon` 表。
 *
 *  ## 为什么需要这一层（真机实锤 mc-max-1794426617609-e35971ca）
 *  同构组三段的段头 icon（38:3160 / 38:3164 / 38:3208）在分析阶段**没有**进
 *  `header.controls`（三段实测 `controls: []`），也不在内容轨 entries 里 —— planner
 *  把它们当「段内装饰资源」留在了资源映射里，只带 `ownerSectionId`。
 *  于是 `extractIconResource` 从 header / 内容轨取恒为空 ⇒ 产物 `icon: ""` ⇒
 *  三张真值图标零消费 ⇒ E2-v3 拒交付（连续两单）。
 *
 *  ## 判据（零语义，只读资源映射既有字段）
 *  ① `previewAnalysisRole === 'icon'`（或 `usage` 含 `<img`）—— 只取图标类资源；
 *  ② `resourceFile` 非空字符串；
 *  ③ `skipMount !== true` 且 `isTinyDecoration !== true`——跳过整体背景/装饰碎图；
 *  ④ 同一 ownerSectionId 多条时取**首条**（映射顺序 = Figma 文档顺序，段头 icon 在前）。
 *
 *  @param {Array} mapping resource-dom-mapping 列表
 *  @returns {Map<string, {resource:string, figmaNode:string, placeholder:string}>}
 */
export function buildIsoSectionIconMap(mapping) {
  const out = new Map();
  for (const e of Array.isArray(mapping) ? mapping : []) {
    if (!e || typeof e !== 'object') continue;
    const owner = e.ownerSectionId;
    const rf = e.resourceFile;
    if (!owner || typeof rf !== 'string' || !rf) continue;
    if (e.skipMount === true || e.isTinyDecoration === true) continue;
    const role = String(e.previewAnalysisRole || '');
    const usage = String(e.usage || '');
    const isIcon = role === 'icon' || /<img\b/i.test(usage);
    if (!isIcon) continue;
    const key = String(owner);
    if (out.has(key)) continue;
    out.set(key, {
      resource: rf,
      figmaNode: String(e.figmaNodeId || e.figmaNode || ''),
      placeholder: String(e.placeholder || e.name || ''),
      // 系统分配的变量名（buildVarToMapping 同一事实源）：index 改写直接用它 import，
      // 避免自造 `isoIconN` 与 prompt 下发的资源清单命名分叉。
      varName: String(e.assignedVarName || ''),
    });
  }
  return out;
}

/** 取「资源映射归属口」命中的段头 icon 记录（{resource, figmaNode, placeholder, varName}）。 */
export function pickIconOwnerHit(sec, options = {}) {
  const m = options.sectionIconByOwner;
  if (!m || !sec || sec.id == null) return null;
  const hit = m instanceof Map ? m.get(String(sec.id)) : null;
  return hit && typeof hit.resource === 'string' && hit.resource ? hit : null;
}

/** 提取段头 icon 资源路径。
 *  ① `header.controls[icon].resourceFile`（planner 声明口）；
 *  ①b `options.sectionIconByOwner.get(sec.id)`（资源映射归属口，见 buildIsoSectionIconMap）；
 *  ② 内容轨里的图标项（归一化口常见落点）：**优先按 Figma 节点查资源映射**
 *     `options.resourceByNode`，再退回条目自带的 `resourceFile`。
 *  🔴 真机实锤（mc-max-1794420265256-036db2a1）：planner 给三段塞了**同一个**
 *     `icon-战略厂商-3160.png`，只有 `figmaNode` 各不相同（38:3160/3164/3208）；
 *     节点映射才是真值（icon-优质厂商-3164.png / icon-普通厂商-3208.png）。
 *     因此节点映射优先于条目自带的 resourceFile。
 *  无 icon 返回 ''。
 */
export function extractIconResource(sec, options = {}) {
  const byNode = options.resourceByNode;
  const pickByNode = (nodeId) => {
    if (!nodeId) return '';
    const key = String(nodeId);
    const rf =
      byNode instanceof Map ? byNode.get(key) : byNode && typeof byNode === 'object' ? byNode[key] : '';
    return typeof rf === 'string' ? rf : '';
  };
  const controls = sec?.header?.controls;
  if (Array.isArray(controls) && controls.length > 0) {
    const icon = controls.find((c) => c && String(c.type || '') === 'icon');
    const byHeaderNode = icon ? pickByNode(icon.figmaNode || icon.figmaNodeId) : '';
    if (byHeaderNode) return byHeaderNode;
    const rf = icon && icon.resourceFile;
    if (typeof rf === 'string' && rf) return rf;
  }
  // ①b 资源映射归属口：段头 icon 未进 header.controls 时，按 ownerSectionId 取
  const byOwner = pickIconOwnerHit(sec, options);
  if (byOwner) return byOwner.resource;
  const track = isoSectionTrack(sec);
  const children = track
    ? ISO_ENTRY_KEYS.map((k) => track.content[k]).find((v) => Array.isArray(v) && v.length > 0) || []
    : [];
  for (const c of children) {
    if (!c || typeof c !== 'object') continue;
    const rf = typeof c.resourceFile === 'string' ? c.resourceFile : '';
    const isIcon = String(c.type || '') === 'icon' || /icon|avatar|logo/i.test(rf);
    if (!isIcon) continue;
    const byChildNode = pickByNode(c.figmaNode || c.figmaNodeId);
    if (byChildNode) return byChildNode;
    if (rf) return rf;
  }
  return '';
}

/**
 * 代表模板 props 契约校验（池后、包装写入前调用）。
 * 判据（与 prompt 契约一一对应，弱正则不假绿）：
 *  ① props 声明含 title 与 items（defineProps 对象或 script setup 形态）；
 *  ② template 出现 items 的 v-for 消费（`in` + items 标识符）；
 *  ③ 根元素带 `v-bind="$attrs"`（兄弟包装的 data-section-id 走 fallthrough 注入的通道）。
 * @returns {{ok: boolean, reasons: string[]}}
 */
export function validateIsoTemplateProps(content, options = {}) {
  const reasons = [];
  const text = typeof content === 'string' ? content : '';
  if (!text.trim()) return { ok: false, reasons: ['empty-content'] };
  const scriptM = /<script[^>]*>([\s\S]*?)<\/script>/i.exec(text);
  const script = scriptM ? scriptM[1] : '';
  if (!/props\s*[:=]/.test(script) && !/defineProps\s*\(/.test(script)) {
    reasons.push('no-props-decl');
  }
  // 🧬 刀 66-P1：仅当本组确有 Figma 配色真值（options.requireTheme）才强制 theme，
  //   无真值的历史形态保持旧三条判据 ⇒ 零回归。
  const required = options.requireTheme === true ? ['title', 'items', 'theme'] : ['title', 'items'];
  for (const key of required) {
    if (!new RegExp(`\\b${key}\\b`).test(script)) reasons.push(`props-missing:${key}`);
  }
  const templateM = /<template[^>]*>([\s\S]*?)<\/template>/i.exec(text);
  const template = templateM ? templateM[1] : '';
  if (!/v-for=["'`][^"'`]*\bin\b[^"'`]*items/.test(template)) {
    reasons.push('no-items-vfor');
  }
  // 🛡️ 2026-11-06：items 是**对象数组** `{name, value}`（v2 统一形状）。模板若把条目当
  //   字符串渲染（`{{ it }}`），对象会渲成 `[object Object]` —— 必须真的读字段。
  //   判据取「v-for 变量后出现 `.字段` 访问」，不押具体变量名（`it.x` / `item.x` / `n.x` 均可）。
  if (!/v-for=["'`][^"'`]*\bin\b[^"'`]*items[\s\S]{0,400}?\.\s*(name|title|label)\b/.test(template)) {
    reasons.push('items-field-unconsumed');
  }
  // 🛡️ 2026-11-06（245878e6 实锤「华为技术8台」连排）：名称与数值**不得**拼成同一个
  //   文本节点。判据零语义：模板里出现 `}}{{`（两段插值紧邻）且左段含 `.name`、右段含
  //   `.value` ⇒ 违约（渲染出来就是名字直接粘着数值，无分区、无间距）。
  if (/\}\}\s*\{\{/.test(template)) {
    const adj = template.match(/\{\{[^{}]*\}\}\s*\{\{[^{}]*\}\}/g) || [];
    const concat = adj.some((s) => /\.\s*(name|title|label)\b/.test(s) && /\.\s*value\b/.test(s));
    if (concat) reasons.push('name-value-concat');
  }
  if (!template.includes('v-bind="$attrs"')) {
    reasons.push('no-attrs-fallthrough');
  }
  return { ok: reasons.length === 0, reasons };
}

/**
 * 确定性渲染兄弟薄包装（单模板参数化的 B 面）。
 * wrapper 只做 props 转发：结构与样式 100% 来自代表模板 ⇒ 同构一致性由代码保证。
 * 注意 items 用单引号属性包 JSON（JSON 内是双引号，双引号定界会碎 HTML）。
 * @param {object} p
 * @param {string} p.wrapperName   兄弟组件名（如 ContentSection3）
 * @param {string} p.templateName  代表组件名（如 ContentSection）
 * @param {{id: string, title: string, icon: string, items: string[], theme?: object}} p.member 该段真值
 * @returns {string} 完整 SFC 文本
 */
export function renderIsoWrapperSfc(p = {}) {
  const wrapperName = String(p.wrapperName || '');
  const templateName = String(p.templateName || '');
  const member = p.member || {};
  if (!wrapperName || !templateName || !member.id) return '';
  const itemsLiteral = JSON.stringify(Array.isArray(member.items) ? member.items : []);
  // 🧬 刀 66-P1：配色真值随包装转发（单引号属性包 JSON，避免双引号碎 HTML）。
  //   仅当 L0 真值确有 theme 时附加 ⇒ 无真值任务产物逐字节不变（零回归）。
  const themeLiteral =
    member.theme && typeof member.theme === 'object'
      ? `\n    :theme='${JSON.stringify(member.theme)}'`
      : '';
  const kebab = wrapperName
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
  const iconVar = p.iconVarName || 'isoIcon';
  const iconLine = member.icon
    ? `import ${iconVar} from '${member.icon.replace(/^\.\.\//, '../../')}'`
    : '';
  const iconAttr = member.icon ? ` :icon="${iconVar}"` : ` :icon="''"`;
  const rootClass = `c-${kebab}-root`;
  return `<template>
  <${templateName}
    :title='${JSON.stringify(member.title)}'
${iconAttr}
    :items='${itemsLiteral}'${themeLiteral}
    data-section-id="${member.id}"
    v-bind="$attrs"
    class="${rootClass}"
    style="padding:0"
  />
</template>

<script setup>
${iconLine}${iconLine ? '\n\n' : ''}import ${templateName} from './${templateName}.vue'
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';
</style>
`;
}
