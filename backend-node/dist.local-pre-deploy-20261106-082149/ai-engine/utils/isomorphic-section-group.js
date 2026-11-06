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

/** 取段内容目轨（children 优先，退化 items/elements）。返回 [] 表示无条目。 */
export function isoBodyEntries(sec) {
  const body = sec?.body;
  if (!body || typeof body !== 'object') return [];
  for (const key of ISO_ENTRY_KEYS) {
    const v = body[key];
    if (Array.isArray(v) && v.length > 0) return v;
  }
  return [];
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
export function assessIsoEligibility(sec) {
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
  const body = sec.body;
  if (!body || typeof body !== 'object') return { eligible: false, reason: 'no-body' };
  const lay = normalizeSectionLayout(body);
  // 只收「横向多列」条目段；纵向列（= 列表，归刀53 list 域）与无法判定方向的一律不碰。
  if (lay.direction === 'column') return { eligible: false, reason: 'layout-column' };
  if (lay.direction !== 'row' && !(lay.columns >= 2)) {
    return { eligible: false, reason: `layout:${lay.raw || 'empty'}` };
  }
  const entries = isoBodyEntries(sec);
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
export function sectionRoleSignature(sec) {
  const a = assessIsoEligibility(sec);
  if (!a.eligible) return null;
  const body = sec.body;
  const header = sec.header;
  const controls = Array.isArray(header.controls) ? header.controls : [];
  // 🛡️ 指纹只取**首个条目**的形态：条目数是参数化差异（items.length），
  //   不能进签名——否则 6/12/15 条的三厂商段永远不同构（首版实测踩坑）。
  //   条目字段也按 ISO_ENTRY_KEYS 取（children / items 同一种语义两种落点）。
  const firstEntry = isoBodyEntries(sec)[0] || {};
  const entryShape = {
    // 🔴 role **故意不进签名**：它是 vision 自由文本（label/tag/stat-card/vendor-item 多种
    //   写法同指一类条目卡），进签名只会把同构段按措辞拆散 —— 这正是三次 0 命中的形态成因。
    //   角色由资格判据的**黑名单**校验，签名只管结构性差异。
    fill: firstEntry.repeatedFill ?? firstEntry.fill ?? '',
    styles: firstEntry.styles || {},
  };
  // 🔴 布局进签名只用**归一后的方向 + 列数**：`grid` / `horizontal-4-columns` 是同一种
  //   结构事实的两种写法，押原字符串会把同构段按措辞拆散（245878e6 实锤）。
  const lay = normalizeSectionLayout(body);
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
 * 收集同构组（顶层段；v1 不下钻嵌套——保守起点）。
 * @param {Array} treeSections 顶层段数组（resolvePlanSections 口径）
 * @returns {{evaluated: number, groups: Array<{signature: string, sectionIds: string[],
 *   representativeId: string, members: Array<{id, title, icon, items}>}>}}
 */
export function collectIsomorphicSectionGroups(treeSections, options = {}) {
  const minMembers = Number.isInteger(options.minMembers)
    ? options.minMembers
    : ISO_GROUP_MIN_MEMBERS;
  const list = Array.isArray(treeSections) ? treeSections : [];
  const bySig = new Map();
  let evaluated = 0;
  for (const sec of list) {
    evaluated += 1;
    const sig = sectionRoleSignature(sec);
    if (!sig) continue;
    if (!bySig.has(sig)) bySig.set(sig, []);
    bySig.get(sig).push(sec);
  }
  const groups = [];
  for (const [signature, secs] of bySig) {
    if (secs.length < minMembers) continue;
    // 归一布局事实随组下发（代表模板需要列数，见 prompt-builder#buildIsoTemplateContract）
    const lay = normalizeSectionLayout(secs[0]?.body);
    groups.push({
      signature,
      sectionIds: secs.map((s) => String(s.id)),
      representativeId: String(secs[0].id),
      direction: lay.direction,
      columns: lay.columns,
      members: secs.map((s) => ({
        id: String(s.id),
        title: String(s.header.title),
        icon: extractIconResource(s),
        // 🛡️ 条目形状统一为 `{ name, value }`（value 可为 ''）：单模板参数化后，模板只需
        //   认一种形状；厂商段的「台数」、标签段的「无值」都由同一字段承载。
        items: isoBodyEntries(s).map((ch) => ({
          name: isoEntryText(ch),
          value: isoEntryValue(ch),
        })),
      })),
    });
  }
  return { evaluated, groups };
}

/** 提取段头 icon 资源路径（controls[0].resourceFile；无 icon 返回 ''） */
export function extractIconResource(sec) {
  const controls = sec?.header?.controls;
  if (!Array.isArray(controls) || controls.length === 0) return '';
  const icon = controls.find((c) => c && String(c.type || '') === 'icon');
  const rf = icon && icon.resourceFile;
  return typeof rf === 'string' ? rf : '';
}

/**
 * 代表模板 props 契约校验（池后、包装写入前调用）。
 * 判据（与 prompt 契约一一对应，弱正则不假绿）：
 *  ① props 声明含 title 与 items（defineProps 对象或 script setup 形态）；
 *  ② template 出现 items 的 v-for 消费（`in` + items 标识符）；
 *  ③ 根元素带 `v-bind="$attrs"`（兄弟包装的 data-section-id 走 fallthrough 注入的通道）。
 * @returns {{ok: boolean, reasons: string[]}}
 */
export function validateIsoTemplateProps(content) {
  const reasons = [];
  const text = typeof content === 'string' ? content : '';
  if (!text.trim()) return { ok: false, reasons: ['empty-content'] };
  const scriptM = /<script[^>]*>([\s\S]*?)<\/script>/i.exec(text);
  const script = scriptM ? scriptM[1] : '';
  if (!/props\s*[:=]/.test(script) && !/defineProps\s*\(/.test(script)) {
    reasons.push('no-props-decl');
  }
  for (const key of ['title', 'items']) {
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
 * @param {{id: string, title: string, icon: string, items: string[]}} p.member 该段真值
 * @returns {string} 完整 SFC 文本
 */
export function renderIsoWrapperSfc(p = {}) {
  const wrapperName = String(p.wrapperName || '');
  const templateName = String(p.templateName || '');
  const member = p.member || {};
  if (!wrapperName || !templateName || !member.id) return '';
  const itemsLiteral = JSON.stringify(Array.isArray(member.items) ? member.items : []);
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
    :items='${itemsLiteral}'
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
