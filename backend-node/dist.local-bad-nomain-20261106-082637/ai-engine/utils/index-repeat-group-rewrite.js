/**
 * 🧬 刀66-C（2026-11-06 · mc-max-1793913218521-5d1eb324 用户裁决）：
 * **段级循环组在 index.vue 用 v-for 表达**（而不是三个重复标签 / 三个薄包装标签）。
 *
 * ## 为什么需要这一刀
 * 刀66 v1 的交付形态是「代表模板 + 两个确定性薄包装」—— 结构单源了，但 `index.vue` 里
 * **仍是三个并排标签**。用户两次明确要求：「vfor 的是三个厂商段」「依旧重复三个 section」。
 * 因此把「代表模板」直接搬进 index 的循环里：一个标签 + 一份数据数组。
 *
 * ## 判据（全部满足才改写；任一不满足 ⇒ 该组不改写，返回原因，行为逐字不变）
 *  ① 每个成员组件名在 index 中**恰好出现 1 次**（多次出现 = 语义不明，不猜）；
 *  ② 全部匹配**相邻**（两两之间只有空白），即它们是同一父容器的兄弟；
 *  ③ 代表组件名可用作循环目标（与成员同名时取第一个出现位置的组件名）；
 *  ④ 数据常量名在 index 中未占用；
 *  ⑤ **属性可表达**（2026-11-06 评审修正 P0）：除 `style/title/icon/items/key` 外的属性，
 *     必须逐成员**逐字相同**才能用一个循环标签表达；`data-section-id` 逐成员不同但等于
 *     各自段 id 时改绑 `:data-section-id="isoItem.id"`；其余不一致 ⇒ 整组 fail-open。
 *     （旧实现只保留 `style`，会把 `class`/`v-if`/`ref`/`data-section-id` 静默丢掉。）
 *
 * ## 为什么「相邻兄弟」是硬门
 * 只替换一个标签、删掉其余标签时，若它们不在同一父容器（例如分处两个卡片），
 * v-for 会把原本分开的渲染合并到一处 ⇒ 结构塌陷。空白间隔校验是零语义的结构证据。
 *
 * ## 为什么不解析整棵模板树
 * 正则解析结构化文本是本仓明确的反面教材（quality-score 的 `<template>` 截断事故）。
 * 这里只在「自闭合标签 / 成对标签」这一极窄形态上做**位置级**替换，且改写后重新校验
 * 标签数与 v-for 存在性；任何异常一律 fail-open 返回原文。
 */

/** PascalCase / kebab-case 互转（与 renderIsoWrapperSfc 同一口径）。 */
export function toKebabCase(name) {
  return String(name || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

/**
 * 找出某组件名在 index 中的全部标签区间。
 * 支持 `<Foo ... />`（自闭合）与 `<Foo ...>...</Foo>`（成对）两种形态。
 * @returns {Array<{start:number,end:number,style:string,raw:string}>}
 */
export function findComponentTagSpans(content, name) {
  const text = String(content || '');
  const n = String(name || '');
  if (!text || !n) return [];
  const names = [n, toKebabCase(n)].filter((v, i, a) => v && a.indexOf(v) === i);
  const spans = [];
  for (const nm of names) {
    const esc = nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // 自闭合
    const selfRx = new RegExp(`<${esc}(?=[\\s/>])([^>]*?)/>`, 'g');
    let m;
    while ((m = selfRx.exec(text))) {
      const raw = m[0];
      spans.push({
        start: m.index,
        end: m.index + raw.length,
        style: extractAttr(raw, 'style'),
        raw,
      });
    }
    // 成对（非自闭合）
    const pairRx = new RegExp(`<${esc}(?=[\\s>])([^>]*)>([\\s\\S]*?)</${esc}>`, 'g');
    while ((m = pairRx.exec(text))) {
      const raw = m[0];
      // 已被自闭合命中的区间不重复计（自闭合不可能同时成对，但防御重叠）
      if (spans.some((s) => m.index < s.end && s.start < m.index + raw.length)) continue;
      spans.push({
        start: m.index,
        end: m.index + raw.length,
        style: extractAttr(raw, 'style'),
        raw,
      });
    }
  }
  return spans.sort((a, b) => a.start - b.start);
}

/** 从标签原文取某属性值（静态属性；无则 ''）。 */
function extractAttr(rawTag, attr) {
  const rx = new RegExp(`\\s${attr}\\s*=\\s*("([^"]*)"|'([^']*)')`);
  const m = rx.exec(String(rawTag || ''));
  if (!m) return '';
  return m[2] != null ? m[2] : m[3] != null ? m[3] : '';
}

/**
 * 解析标签上的**全部**属性（除标签名与结尾 `/>`）。
 * 🔴 2026-11-06 评审修正（P0）：旧实现只保留 `style`，其余属性（`class` / `data-section-id`
 *   / `v-if` / `ref` / `@click` …）在改写时被**静默丢弃**。`data-section-id` 是资源挂载锚 +
 *   评分选择器（25+ 消费点），丢它比样式错更严重。故改写前必须把属性全量取出来：
 *   - 各成员**逐字相同**的静态属性 ⇒ 原样下发一次；
 *   - `data-section-id` 若逐成员不同且等于成员 id ⇒ 改绑 `:data-section-id="isoItem.id"`；
 *   - 其余**逐成员不同**的 attribute ⇒ 无法用一个循环标签表达 ⇒ 整组 fail-open（不猜）。
 * @returns {Array<{name:string, raw:string, value:string|null, dynamic:boolean}>}
 */
export function parseTagAttrs(rawTag) {
  const raw = String(rawTag || '');
  const head = /^<[A-Za-z][\w.-]*/.exec(raw);
  if (!head) return [];
  let inner = raw.slice(head[0].length);
  inner = inner.replace(/\/?>\s*$/, '');
  const out = [];
  // 属性名：可带 `:`/`@`/`#`/`v-` 前缀与 `[...]`；值：双引号 / 单引号 / 裸值 / 省略（布尔属性）
  const rx = /([:@#]?[A-Za-z_][\w:.\-[\]$]*)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = rx.exec(inner)) !== null) {
    const name = m[1];
    if (!name) continue;
    const quote = m[2];
    const value = m[3] != null ? m[3] : m[4] != null ? m[4] : m[5] != null ? m[5] : null;
    out.push({
      name,
      raw: quote != null ? `${name}=${quote}` : name,
      value,
      dynamic: /^[:@#]/.test(name) || /^v-/.test(name),
    });
  }
  return out;
}

/** 生成不会与 index 现有标识符冲突的常量名。 */
function pickConstName(content, base) {
  let name = base;
  let i = 2;
  while (new RegExp(`\\b${name}\\b`).test(content)) {
    name = `${base}${i}`;
    i += 1;
  }
  return name;
}

function scream(name) {
  return String(name || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, '_');
}

/** 把成员数据序列化为 index 里的常量字面量（2 空格缩进，逐成员一行，便于 diff）。 */
function membersLiteral(constName, members) {
  const rows = members.map((m) => {
    const items = JSON.stringify(Array.isArray(m.items) ? m.items : []);
    return `  { id: ${JSON.stringify(String(m.id))}, title: ${JSON.stringify(String(m.title || ''))}, icon: ${JSON.stringify(String(m.icon || ''))}, items: ${items}, style: ${JSON.stringify(String(m.style || ''))} }`;
  });
  return `const ${constName} = [\n${rows.join(',\n')}\n]`;
}

/**
 * 把一组同构段在三处 index 标签上改写为「一个 v-for 标签 + 数据数组」。
 *
 * @param {string} indexContent index.vue 原文
 * @param {{repName:string, members:Array<{id,title,icon,items,style}>}} plan 一组
 * @returns {{ok:boolean, content:string, reason?:string, removedTags?:number}}
 */
export function rewriteOneRepeatGroup(indexContent, plan) {
  const content = String(indexContent || '');
  const repName = String(plan?.repName || '');
  const members = Array.isArray(plan?.members) ? plan.members : [];
  if (!content || !repName) return { ok: false, content, reason: 'empty-input' };
  if (members.length < 2) return { ok: false, content, reason: 'members<2' };

  // ① 逐个成员找标签（代表用 repName，其余用各自组件名）
  const perMember = [];
  for (const m of members) {
    const name = m.compName || repName;
    const spans = findComponentTagSpans(content, name);
    if (spans.length !== 1) {
      return { ok: false, content, reason: `tag-count:${name}=${spans.length}` };
    }
    perMember.push({ member: m, name, span: spans[0] });
  }
  perMember.sort((a, b) => a.span.start - b.span.start);

  // ② 相邻兄弟：两两之间只允许空白
  for (let i = 1; i < perMember.length; i += 1) {
    const gap = content.slice(perMember[i - 1].span.end, perMember[i].span.start);
    if (!/^\s*$/.test(gap)) {
      return { ok: false, content, reason: `not-adjacent:${perMember[i - 1].name}->${perMember[i].name}` };
    }
  }

  // ③ 数据数组（成员顺序 = 文档顺序；style 逐项沿用原标签，布局比例不丢）
  const constName = pickConstName(content, `ISO_REPEAT_${scream(repName)}`);
  const dataMembers = perMember.map((p) => ({
    id: p.member.id,
    title: p.member.title,
    icon: p.member.icon,
    items: p.member.items,
    style: p.span.style || p.member.style || '',
  }));

  // ③b 属性守恒（P0 评审修正）：逐成员比对残留属性。可表达 ⇒ 下发；不可表达 ⇒ 整组不改写。
  const RESERVED = new Set([
    'v-for', 'key', ':key', 'style', ':style',
    'title', ':title', 'icon', ':icon', 'items', ':items',
    'data-section-id', ':data-section-id',
  ]);
  const attrByMember = perMember.map((p) =>
    parseTagAttrs(p.span.raw).filter((a) => !RESERVED.has(a.name)),
  );
  const staticAttrs = [];
  let dynamicSectionId = false;
  {
    const names = new Set();
    for (const list of attrByMember) for (const a of list) names.add(a.name);
    for (const name of names) {
      const raws = attrByMember.map((list) => list.filter((a) => a.name === name).map((a) => a.raw));
      // 每个成员都必须恰好出现一次，否则无法用同一个循环标签表达
      if (raws.some((r) => r.length !== 1)) {
        return { ok: false, content, reason: `attr-diverges:${name}` };
      }
      const first = raws[0][0];
      if (raws.every((r) => r[0] === first)) {
        staticAttrs.push(first);
      } else {
        return { ok: false, content, reason: `attr-diverges:${name}` };
      }
    }
    // data-section-id：逐成员不同但**等于各自段 id** ⇒ 可改绑数据字段（不改写即丢锚点）
    const dsIds = perMember
      .map((p) => parseTagAttrs(p.span.raw).filter((a) => a.name === 'data-section-id'))
      .map((l) => (l.length === 1 ? l[0].value : null));
    if (dsIds.some((v) => v != null)) {
      const allMatchIds = dsIds.every((v, i) => v != null && v === String(perMember[i].member.id));
      if (!allMatchIds) {
        return { ok: false, content, reason: 'attr-diverges:data-section-id' };
      }
      dynamicSectionId = true;
    }
  }

  // ④ 合成替换片段（`:icon` 只在确有图标时下发 —— 否则会以 fallthrough 属性落到 DOM 上）
  const hasIcon = dataMembers.some((m) => String(m.icon || '').trim());
  const indent = ' '.repeat(8);
  const loopTag = [
    `<${repName}`,
    `${indent}v-for="(isoItem, isoIndex) in ${constName}"`,
    `${indent}:key="isoItem.id"`,
    `${indent}:title="isoItem.title"`,
    ...(hasIcon ? [`${indent}:icon="isoItem.icon"`] : []),
    `${indent}:items="isoItem.items"`,
    `${indent}:style="isoItem.style"`,
    ...(dynamicSectionId ? [`${indent}:data-section-id="isoItem.id"`] : []),
    ...staticAttrs.map((a) => `${indent}${a}`),
    '      />',
  ].join('\n');
  const start = perMember[0].span.start;
  const end = perMember[perMember.length - 1].span.end;
  let next = `${content.slice(0, start)}${loopTag}${content.slice(end)}`;

  // ⑤ 注入数据常量（`</script>` 之前最后一个安全位置）
  const scriptClose = next.lastIndexOf('</script>');
  if (scriptClose < 0) return { ok: false, content, reason: 'no-script-block' };
  const decl = `\n${membersLiteral(constName, dataMembers)}\n`;
  next = `${next.slice(0, scriptClose)}${decl}${next.slice(scriptClose)}`;

  // ⑥ 改写后自校验：代表标签恰好 1 个 + v-for 真的在
  const after = findComponentTagSpans(next, repName);
  if (after.length !== 1 || !next.includes(`in ${constName}`)) {
    return { ok: false, content, reason: 'post-check-failed' };
  }
  return { ok: true, content: next, removedTags: perMember.length - 1 };
}

/**
 * 批量改写（每组独立成败，互不影响）。
 * @returns {{content:string, applied:Array, skipped:Array}}
 */
export function rewriteIndexRepeatGroups(indexContent, plans) {
  let content = String(indexContent || '');
  const applied = [];
  const skipped = [];
  for (const plan of Array.isArray(plans) ? plans : []) {
    const res = rewriteOneRepeatGroup(content, plan);
    if (!res.ok) {
      skipped.push({ repName: plan?.repName || '', reason: res.reason || 'unknown' });
      continue;
    }
    content = res.content;
    applied.push({
      repName: plan.repName,
      members: plan.members.map((m) => String(m.id)),
      removedTags: res.removedTags,
      // 保留 compName 供落盘前「包装文件与 import 原子清理」使用（同一份 plan，不另建表）
      memberPlans: plan.members.map((m) => ({ id: String(m.id), compName: m.compName || plan.repName })),
    });
  }
  return { content, applied, skipped };
}

/**
 * 🧬 刀66-C 收尾（2026-11-06 评审修正 · P1）：**包装文件与 import 原子清理**。
 *
 * ## 为什么必须删
 * index 改写成 `v-for` 之后，兄弟段的薄包装文件与 `import` 仍在产物里 —— 交付层面
 * 依旧是「3 个组件文件 + 3 条 import（其中 2 条模板零引用）」，与用户「不该有三个重复
 * section」的诉求只兑现了一半；后续任何「未使用 import 清理」pass 若只删 import 不删文件
 * （或反之），会让 `section-coverage-guard#assembled()` 与文件集互相矛盾。
 *
 * ## 判据（全部满足才删；任一不满足 ⇒ 保留，仅计数）
 *  ① 该成员在本次改写中**确实被合并**（只处理 `applied` 组）；
 *  ② 该成员不是代表模板（`compName !== repName`）；
 *  ③ 改写后的 index 模板里**已无该组件的任何标签**（复用处不得删）；
 *  ④ 文件存在且其内容确实是本刀产出的薄包装（含 `v-bind="$attrs"` 且 import 代表模板）
 *     —— 防误删「LLM 自己生成、另有引用」的同名组件。
 *
 * ## 与覆盖门禁的关系（重要）
 * 删文件会让 `detectUnmaterializedSections` 看到「段无对应文件」。`section-coverage-guard`
 * 已同步支持「index 的 v-for 数据数组覆盖该段 id ⇒ 视为已物化」，两处必须一起生效，
 * 否则会翻成 `artifactIncomplete=true`。
 *
 * @param {string} indexContent 已改写后的 index.vue
 * @param {Array} applied `rewriteIndexRepeatGroups().applied`
 * @param {Object<string,string>} files 产物文件表（原地删除）
 * @returns {{content:string, removedImports:string[], removedFiles:string[], kept:string[]}}
 */
export function pruneRepeatMemberArtifacts(indexContent, applied, files) {
  let content = String(indexContent || '');
  const report = { content, removedImports: [], removedFiles: [], kept: [] };
  if (!content || !files || !Array.isArray(applied)) return report;
  for (const g of applied) {
    const repName = String(g?.repName || '');
    for (const m of Array.isArray(g?.memberPlans) ? g.memberPlans : []) {
      const name = String(m?.compName || '');
      if (!name || name === repName) continue;
      const path = `package/components/${name}.vue`;
      if (findComponentTagSpans(content, name).length > 0) {
        report.kept.push(`${name}:tag-still-used`);
        continue;
      }
      const fileContent = files[path];
      const isThinWrapper =
        typeof fileContent === 'string' &&
        fileContent.includes('v-bind="$attrs"') &&
        new RegExp(`from\\s+['"]\\./${repName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.vue['"]`).test(fileContent);
      if (!isThinWrapper) {
        report.kept.push(`${name}:not-thin-wrapper`);
        continue;
      }
      // 删 import（该组件的整行）；模板已无标签 ⇒ 不会留悬空引用
      const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const importRx = new RegExp(
        `^[ \\t]*import\\s+[A-Za-z_$][\\w$]*\\s+from\\s+['"]\\./components/${esc}\\.vue['"]\\s*;?[ \\t]*\\r?\\n`,
        'm',
      );
      if (importRx.test(content)) {
        content = content.replace(importRx, '');
        report.removedImports.push(name);
      }
      delete files[path];
      report.removedFiles.push(path);
    }
  }
  report.content = content;
  return report;
}
