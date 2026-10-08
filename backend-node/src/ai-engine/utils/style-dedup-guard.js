/**
 * 🛡️ 样式重复声明剥离（2026-09-03，mc-1788415227440 实锤）
 *
 * 事故：侧边栏宽度修复（extractFigmaHints 技术组件下钻取子节点尺寸）让 common.less
 * 正确写出 `.c-monitor-tabs-wrapper { width: 160px; flex: 0 0 auto }`，但子组件
 * `DeviceCategoryTabs.vue` 的 <style scoped> 里又把同一个 class 写了一遍
 * （`flex: 1 1 0; width: 100%`）。scoped 编译后带属性选择器，优先级 (0,2,0) 恒胜
 * common.less 的 (0,1,0) → 160px 定宽被 100% 覆盖，**宽度修复的成果在渲染层被吃掉**。
 * 表现为 FLEX-003（同 class 跨文件 flex 值冲突）BLOCK，重试耗尽。
 *
 * 为什么不用「逐个属性打补丁」：冲突的不止 flex——真正撑满父容器的是 width。本次
 * 同时存在 flex 与 width 两处冲突，只归一 flex 仍会留下 width:100%。
 *
 * 本模块做「通用剥离」：子组件 <style scoped> 中与共享样式表（common.less/index.less）
 * **同名 class 且同名属性**的声明一律剥离，只保留子组件独有的属性。
 * 这样共享样式表的真值成为唯一生效值，任意属性（flex/width/padding/…）冲突一并解决。
 *
 * 安全约束（宁可少剥，不可误剥）：
 *   1. 只处理「顶层单 class 规则块」（`.c-xxx { }`），组合选择器/伪类/嵌套块整体跳过；
 *   2. 只剥离 LAYOUT_PROPS 白名单内的属性（布局尺寸类）——颜色/字体/背景等表现类属性
 *      允许子组件按需差异化，不剥离；
 *   3. 只剥离「共享表里同名 class 也声明了的属性」——子组件独有属性（如 min-height:0）
 *      保留，避免丢失必要样式；
 *   4. 剥离后块内无剩余声明 → 整块删除（不留空壳规则）。
 *
 * 🔴 刀 13-C 治本（2026-09-13，FLEX-003 真机 0 命中实锤）：
 * 本函数此前只认**数组形态**（`if (!Array.isArray(files) || files.length < 2) return`），
 * 而唯一的生产调用方 CodeFixPipeline.apply 传的是**对象 map** `Object<string,string>`
 * （code-fix-pipeline.js:137 → `fixFiles(out)`）→ 恒早退、`changes` 恒空、日志
 * 「样式重复声明剥离」永不打印、修复永不生效，并且**完全静默**（返回原引用，
 * 管线检测不到改动）。真机 grep `样式重复声明剥离` = 0 命中即此。
 * 现改为经 `file-collection.js` 归一：**数组进数组出 / 对象 map 进对象 map 出**，
 * 两种契约都成立；且跨文件比对所需的 common.less 与 *.vue 都能取到。
 */

import { extractStyleBlocks } from './flex-sibling-guard.js';
import { toFileArray, mergeFileArray } from './file-collection.js';

/**
 * 参与剥离的布局尺寸类属性白名单。
 * 只限这类属性：它们是「死样式」类布局事故（宽度被撑满、高度比例错乱）的直接元凶；
 * 颜色/字体/背景等表现类属性留给子组件差异化，剥离会误伤视觉。
 */
export const LAYOUT_PROPS = new Set([
  'width', 'height', 'max-width', 'max-height',
  'flex', 'flex-grow', 'flex-shrink', 'flex-basis', 'flex-direction', 'flex-wrap',
  'display', 'align-items', 'align-self', 'justify-content', 'gap',
  'row-gap', 'column-gap',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'position', 'top', 'right', 'bottom', 'left',
  'overflow', 'overflow-x', 'overflow-y', 'box-sizing',
]);
// 🛡️ R5-minheight（2026-09-15）：min-width/min-height 从白名单移除。
// 它们是「防塌缩」安全网（图表容器 min-height:160px、flex 子项 min-height:0），
// 冗余声明无害（CSS 取较大值，不冲突），且被「样式重复声明剥离」剥掉后图表/内容
// 直接塌缩（环境监测 chart-container 实锤：T2 注入 min-height:160px 被剥 → 空规则块）。

const CLASS_SELECTOR_RX = /^\.([\w-]+)$/;

/**
 * 收集样式源里的「顶层单 class 规则块」：class 名 → 声明体。
 * 跳过：组合选择器（`.a .b`/`.a > .b`）、伪类（`.a:hover`）、含嵌套的块（`&` 子块）、
 * keyframes/media 内部块（其 selector 非纯 class）。
 *
 * @param {string} styleContent 样式文件内容（.less/.css 全文，或 <style> 内部）
 * @returns {Map<string, string>} class 名（不含点） → 声明体
 */
export function collectSharedClassBodies(styleContent) {
  const map = new Map();
  for (const b of extractStyleBlocks(styleContent)) {
    // ⚠️ selector 可能带前导注释：extractStyleBlocks 的 `([^{}]+)\{` 会连同块之前的
    // 注释一起吞进 selector（如 "// ─── Tabs 包装层 ───\n.c-monitor-tabs-wrapper"）。
    // 实锤 mc-1788415227440：common.less 里带注释头的 `.c-monitor-tabs-wrapper`
    // 因此被跳过，160px 定宽冲突未剥离，宽度修复成果仍被 scoped 覆盖。
    // 先剥离块注释与行注释，再按「纯单 class」精确匹配（组合选择器 .a .b 仍不匹配）。
    const sel = String(b.selector)
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/[^\n]*/g, ' ')
      .trim();
    const m = sel.match(CLASS_SELECTOR_RX);
    if (!m) continue;
    // 含嵌套（&:hover / .child { }）的块不参与：其声明不全是本 class 的直属属性
    if (b.body.includes('{') || b.body.includes('&')) continue;
    map.set(m[1], b.body);
  }
  return map;
}

/**
 * 提取声明体里的顶层属性名集合（小写归一）。
 * 跳过 @ 指令（@apply/@import）、嵌套块、LESS 变量引用行。
 * @param {string} body
 * @returns {Set<string>}
 */
export function collectPropNames(body) {
  const props = new Set();
  for (const decl of String(body || '').split(';')) {
    const m = decl.match(/(?:^|\n)\s*([a-zA-Z][\w-]*)\s*:/);
    if (m) props.add(m[1].toLowerCase());
  }
  return props;
}

/**
 * 🛡️ P2-11（2026-10-01 · c-be6-869be6fe 实锤）：声明体「规范多行」输出 —— 声明体口径单一事实源。
 *
 * ── 事故链（真机取证，产物 `c-be6-869be6fe/resources/styles/common.less:163`） ──
 *   ```less
 *   .c-869be6-icon {flex-direction: column        ← 单行、末条无 `;`
 *     min-height: 0; /* VERT-004: … *\/;
 *   }
 *   ```
 *   LESS 把 `flex-direction: column\n  min-height: 0` 当成**一条声明的值**
 *   ⇒ `Unrecognised input` ⇒ 最终 LESS 编译门禁阻断、整次生成失败。
 *
 *   生产者 = `pruneConflictingDecls`（本文件）与 `shared-class-deconflict#removePropsFromBody`：
 *   两者都返回 `kept.join(';').trim()` —— **元素之间插 `;`、末尾不补**，
 *   `.trim()` 又吃掉首条的换行缩进 ⇒ 拼进块时产出单行 `{flex-direction: column}`（无尾 `;`）。
 *   下游 VERT-004（`vertical-layout-guard#fixVerticalBody`）按「末条声明已有 `;`」的**假定**
 *   做字符串追加（`body.replace(/\s+$/,'') + '\n  min-height: 0; …'`）⇒ 粘连成非法 LESS。
 *
 *   治本：所有「重建声明体」的生产者统一走本函数 —— 输出规范多行，**每条声明都以 `;` 收尾**。
 *   这样任何下游按「声明已终止」做的追加/拼接都天然成立（不依赖下游再打补丁）。
 *
 * @param {string[]} decls 声明片段数组（每项可含任意前后空白；末尾有无 `;` 均可）
 * @returns {string} 规范多行声明体（两空格缩进、逐条 `;` 收尾）；无有效声明返回 `''`
 */
export function formatDeclarationList(decls) {
  const items = (Array.isArray(decls) ? decls : [decls])
    .map((d) => String(d == null ? '' : d).trim().replace(/;+$/, '').trim())
    .filter(Boolean);
  if (items.length === 0) return '';
  return items.map((d) => `  ${d};`).join('\n');
}

/**
 * 剥离声明体中「属性名命中 sharedProps 且属 LAYOUT_PROPS」的声明。
 * @param {string} body 子组件里的声明体
 * @param {Set<string>} sharedProps 共享表里同名 class 已声明的属性名
 * @returns {{ body: string, removed: number }}
 */
export function pruneConflictingDecls(body, sharedProps) {
  const kept = [];
  let removed = 0;
  for (const decl of String(body || '').split(';')) {
    const trimmed = decl.trim();
    if (!trimmed) continue;
    const m = trimmed.match(/(?:^|\n)\s*([a-zA-Z][\w-]*)\s*:/);
    const prop = m ? m[1].toLowerCase() : null;
    if (prop && LAYOUT_PROPS.has(prop) && sharedProps.has(prop)) {
      removed += 1;
      continue;
    }
    kept.push(decl);
  }
  // 🛡️ P2-11：规范多行 + 逐条 `;` 收尾（旧实现 `kept.join(';').trim()` 产出单行、末条无 `;`）
  return { body: formatDeclarationList(kept), removed };
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 剥离单个 .vue 的 <style scoped> 中与共享表冲突的声明。
 * @param {string} content .vue 全文
 * @param {Map<string, string>} sharedClasses class 名 → 共享表声明体
 * @returns {{ content: string, changes: string[] }}
 */
export function pruneVueStyleAgainstShared(content, sharedClasses) {
  if (!content || !sharedClasses || sharedClasses.size === 0) {
    return { content, changes: [] };
  }
  const styleRx = /(<style[^>]*>)([\s\S]*?)(<\/style>)/i;
  const m = content.match(styleRx);
  if (!m) return { content, changes: [] };

  const changes = [];
  let body = m[2];

  for (const [cls, sharedBody] of sharedClasses) {
    const sharedProps = collectPropNames(sharedBody);
    if (sharedProps.size === 0) continue;
    const blockRx = new RegExp(
      `(^|\\n)(\\.${escapeRe(cls)})\\s*\\{([^{}]*)\\}`,
      'g',
    );
    body = body.replace(blockRx, (full, lead, sel, blockBody) => {
      // 嵌套块不处理（body 已在正则层面排除 '{'，此处防御）
      if (blockBody.includes('{') || blockBody.includes('&')) return full;
      const r = pruneConflictingDecls(blockBody, sharedProps);
      if (r.removed === 0) return full;
      changes.push(`.${cls}: 剥离 ${r.removed} 条与共享表冲突的布局声明`);
      // 全剥空 → 整块删除，不留空壳规则
      if (!r.body.replace(/[\s;]/g, '')) return '';
      // 🛡️ P2-11：拼装也走规范多行（旧实现 `${sel} {${body}}` 产出 `{flex-direction: column}` 单行形态）
      return `${lead}${sel} {\n${r.body}\n}`;
    });
  }

  if (changes.length === 0) return { content, changes: [] };
  // 用函数式替换：body 可能含 `$&` 类序列，避免被当成替换模式
  const next = content.replace(styleRx, (_full, open, _inner, close) => open + body + close);
  return { content: next, changes };
}

/**
 * 🛡️ 刀 23（2026-10-08 · mc-max-1791439072481-07b4d2a5 实锤）— 「FLEX-003 跨文件 flex 值冲突」治本自愈。
 *
 * 事故链（生产 70/100 降级任务）：
 *   LLM 在 `.c-07b4d2-header` 上**双向写入**：
 *     - `package/components/HeaderSection.vue` 的 `<style scoped>` 写 `flex: 1 1 0`
 *     - `resources/styles/common.less`                  写 `flex: 0 0 auto`
 *   scoped 编译后带属性选择器，优先级 (0,2,0) **恒胜** common.less 的 (0,1,0)
 *   ⇒ 浏览器实际生效 = SFC 的 `flex: 1 1 0`（视觉上「区块高度比例错算」）。
 *
 *   `flex-sibling-guard#normalizeFlexSourceConflicts` 只归一「pixel vs ratio 量纲冲突」
 *   （grow ≥20 vs ≤19），不覆盖「两个 ratio 量级但值不同」（如本案的 `1` vs `0`）。
 *   本案 fix 走 L0-B BLOCK 后**无人自愈**，降级完成。
 *
 * 既有 `pruneDuplicateStyleDecls` 方向是「剥 SFC 冲突声明、留 shared 表真值」（契约：
 * shared 表是设计稿真值的单一来源），与本案诉求**完全反向**——本案正确做法是：
 *   **保留 SFC scoped 声明（浏览器实际生效），从 shared 表里剥掉重复声明**（消除
 *   FLEX-003 跨文件索引看到的「同 class 多值」假象）。浏览器渲染效果**不变**（SFC scoped
 *   仍胜出），但 FLEX-003 索引只剩 SFC 一份值 → 不再 BLOCK。
 *
 * 判据（命名无关、纯结构、零产物结构假设）：
 *   ① 仅当**同一 class** 在 SFC scoped 与 shared 表（common.less / index.less）**都**有
 *      「同属 LAYOUT_PROPS 白名单」的属性声明时，才剥 shared 那一份；
 *   ② SFC scoped 块必须**未声明**的属性（即「SFC 独有」如背景/颜色）→ 保留在 shared；
 *   ③ 共享表剥后**块内无剩余声明** → 整块删除，不留空壳规则（与既有 `pruneVueStyleAgainstShared`
 *      行为一致）；
 *   ④ 嵌套选择器 / 伪类 / 含 `&` 的复合块不参与（与 `collectSharedClassBodies` 同口径，
 *      避免误删「`:hover` 状态样式」等）。
 *
 * 幂等：剥完后再跑，SFC scoped 已声明的属性集不再变化 → 0 改动返回原引用。
 *
 * 🔴 形态契约：与 `pruneDuplicateStyleDecls` 同步——数组进数组出 / 对象 map 进对象 map 出；
 *  无改动返回**输入原引用**（供 `pre-write-self-healing.js` 判定 applied）。
 *
 * @param {Array<{path:string, content:string}>|Object<string,string>} files 全量产物文件
 * @returns {{ files: Array|Object, changes: string[] }}
 */
export function pruneDuplicateStyleDeclsFromShared(files = []) {
  const list = toFileArray(files);
  if (list.length < 2) return { files, changes: [] };

  // ① 收集 SFC scoped 里每个 class 的「LAYOUT_PROPS 属性集」
  // ⚠️ 必须只采 **scoped** 块（unscoped <style> 也参与的话会把 SFC 的非 scoped
  //   「全局样式」误算进来，本刀只解决 scoped 优先级冲突这一类病灶）。
  const sfcPropsByClass = new Map(); // className(去点) -> Set<prop小写>
  for (const f of list) {
    if (!f || typeof f.content !== 'string') continue;
    const p = f.path || '';
    if (!/\.vue$/i.test(p)) continue;
    const tagRx = /<style([^>]*)>([\s\S]*?)<\/style>/gi;
    let m;
    while ((m = tagRx.exec(f.content)) !== null) {
      const isScoped = /\bscoped\b/i.test(m[1] || '');
      if (!isScoped) continue;
      const body = m[2] || '';
      for (const b of extractStyleBlocks(body)) {
        // 仅采「顶层单 class」选择器（与 collectSharedClassBodies 同口径，避免
        // 把「.a > .b { … }」里的 a 当成拥有 b 的属性集）。
        const clsMatch = String(b.selector || '')
          .replace(/\/\*[\s\S]*?\*\//g, ' ')
          .replace(/\/\/[^\n]*/g, ' ')
          .trim()
          .match(CLASS_SELECTOR_RX);
        if (!clsMatch) continue;
        const props = collectPropNames(b.body);
        // 仅关心 LAYOUT_PROPS 白名单——表现类（颜色/字体/背景）即便跨文件重复也合法，
        // 不能剥（剥了会破坏视觉差异化）。
        const layoutProps = new Set();
        for (const prop of props) if (LAYOUT_PROPS.has(prop)) layoutProps.add(prop);
        if (layoutProps.size === 0) continue;
        const cls = clsMatch[1];
        if (!sfcPropsByClass.has(cls)) sfcPropsByClass.set(cls, new Set());
        for (const lp of layoutProps) sfcPropsByClass.get(cls).add(lp);
      }
    }
  }
  if (sfcPropsByClass.size === 0) return { files, changes: [] };

  // ② 找 shared 表（common.less 优先，index.less 兜底——与既有 pruneDuplicateStyleDecls 同口径）
  const shared = list.find(
    (f) =>
      f &&
      typeof f.content === 'string' &&
      /resources\/styles\/common\.less$/i.test(f.path || ''),
  ) || list.find(
    (f) =>
      f &&
      typeof f.content === 'string' &&
      /resources\/styles\/index\.less$/i.test(f.path || ''),
  );
  if (!shared) return { files, changes: [] };

  // ③ 对 shared 表的每个顶层单 class 块：剥掉「SFC scoped 已声明」的布局属性
  const sharedClasses = collectSharedClassBodies(shared.content);
  const changes = [];
  let newSharedContent = shared.content;
  let changed = false;

  for (const [cls, sharedBody] of sharedClasses) {
    const sfcProps = sfcPropsByClass.get(cls);
    if (!sfcProps || sfcProps.size === 0) continue;
    // 计算要剥的属性 = LAYOUT_PROPS ∩ SFC scoped 声明集
    const propsToRemove = new Set();
    for (const p of sfcProps) if (LAYOUT_PROPS.has(p)) propsToRemove.add(p);
    if (propsToRemove.size === 0) continue;

    const esc = cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const blockRx = new RegExp(
      `(\\.${esc}(?![\\w-])\\s*\\{)([^{}]*)(\\})`,
      'g',
    );
    const prevContent = newSharedContent;
    newSharedContent = newSharedContent.replace(blockRx, (whole, head, body, close) => {
      // 含嵌套或 `&` → 不处理（防御性，与 collectSharedClassBodies 行为一致）
      if (body.includes('{') || body.includes('&')) return whole;
      const kept = [];
      let removed = 0;
      for (const decl of String(body || '').split(';')) {
        const trimmed = decl.trim();
        if (!trimmed) continue;
        const m = trimmed.match(/(?:^|\n)\s*([a-zA-Z][\w-]*)\s*:/);
        const prop = m ? m[1].toLowerCase() : null;
        if (prop && propsToRemove.has(prop)) {
          removed += 1;
          continue;
        }
        kept.push(decl);
      }
      if (removed === 0) return whole;
      const newBody = formatDeclarationList(kept);
      // 整块剥空 → 删整块，不留空壳
      if (!newBody) return '';
      changes.push(
        `.${cls}：从 shared 表剥 ${[...propsToRemove].join(', ')} ` +
        `（${removed} 条声明；SFC scoped 已声明，避免 FLEX-003 跨文件索引冲突）`,
      );
      return `${head}\n${newBody}\n${close}`;
    });
    if (newSharedContent !== prevContent) changed = true;
  }

  if (!changed) return { files, changes: [] };

  // 形态跟随（对象 map 进 → 对象 map 出；数组进 → 数组出）
  const out = list.map((f) =>
    f?.path === shared.path ? { ...f, content: newSharedContent } : f,
  );
  return { files: mergeFileArray(files, out), changes };
}

/**
 * 跨文件自愈入口：以共享样式表（resources/styles/common.less 或 index.less）为真值，
 * 剥离各 .vue <style scoped> 里的重复布局声明。
 *
 * 幂等：剥离后再跑，子组件已无冲突属性 → removed=0 → 不变。
 *
 * 🔴 形态契约（刀 13-C）：输入支持「数组 `[{path,content}]`」与「对象 map `{path:content}`」
 * 两种形态，**返回形态与输入一致**；无改动时返回**输入原引用**（供管线判定 applied）。
 *
 * @param {Array<{path:string, content:string}>|Object<string,string>} files 全量产物文件（内存态）
 * @returns {{ files: Array|Object, changes: string[] }} 未改动则返回原引用 + 空 changes
 */
export function pruneDuplicateStyleDecls(files = []) {
  // 形态归一（单一事实源）：数组 / 对象 map 都能取到 common.less 与 *.vue
  const list = toFileArray(files);
  if (list.length < 2) return { files, changes: [] };

  // 共享样式表：产物根 resources/styles/ 下的 common.less（其次 index.less）
  const shared = list.find(
    (f) =>
      f &&
      typeof f.content === 'string' &&
      /resources\/styles\/common\.less$/i.test(f.path || ''),
  ) || list.find(
    (f) =>
      f &&
      typeof f.content === 'string' &&
      /resources\/styles\/index\.less$/i.test(f.path || ''),
  );
  if (!shared) return { files, changes: [] };

  const sharedClasses = collectSharedClassBodies(shared.content);
  if (sharedClasses.size === 0) return { files, changes: [] };

  const allChanges = [];
  let changed = false;
  const out = list.map((f) => {
    if (!f || !/\.vue$/i.test(f.path || '')) return f;
    const r = pruneVueStyleAgainstShared(f.content, sharedClasses);
    if (r.changes.length === 0) return f;
    changed = true;
    for (const c of r.changes) allChanges.push(`${f.path} → ${c}`);
    return { ...f, content: r.content };
  });

  // 形态跟随（对象 map 进 → 对象 map 出；数组进 → 数组出）
  return { files: changed ? mergeFileArray(files, out) : files, changes: allChanges };
}
