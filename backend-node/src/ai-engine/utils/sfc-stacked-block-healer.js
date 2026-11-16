/**
 * 🛡️ 2026-11-16 · 模型犯错后的确定性自修复（文件结构级）。
 *
 * 病灶（mc-max-1794761757056-0d15ab1b 实锤）：多轮 writeFiles / 断点续跑把整份 SFC
 * 重复追加，形成「外层 <template> 包住内层 <template> + 第一组 script/style，外层闭合后再挂
 * 第二组 script/style」的叠加畸形。既有自修复全是内容级（CSS 属性、裸 key、tab 骨架），
 * `deduplicateTemplateBlocks` 只认「2+ 个顶层 template 块」，本形态只有 1 个顶层块 ⇒ 零命中；
 * 写盘门禁只拦不修 ⇒ 修复轮两轮「重新生成完整文件」盲修无效 ⇒ 终验回退碎片 ⇒ 空白 + 422。
 *
 * 真机离线复算：剥掉冗余外层 template、每组 SFC 块只留一份（T + S1 + T1），
 * `@vue/compiler-sfc` parse=0 错 / compileTemplate=0 错 / `validateVueSfc`=true
 * ⇒ **不需要 LLM 重生成，纯文本归一即可救回完整合法入口**。
 *
 * 纪律（照抄 healScriptBlockLeakage 的成熟范式）：
 *  - 判据单一来源：候选合法性只由 `validateVueSfcExpressions` + `validateVueSfc` 裁决，
 *    不自建「有没有 <template>」正则，不写第二套 SFC 解析。
 *  - 启动条件：原文 `validateVueSfcExpressions` **已 FAIL** 才尝试；合格文件（含多 style、
 *    嵌套 `<template #slot>`、less @import）一律原样返回 ⇒ 阴阳对照天然成立、不误伤。
 *  - 内容守恒：候选 template 必须保留原文出现过的全部大写组件标签，否则弃用
 *    （总纲 §4 收敛必对账、不得双丢失）。
 *  - 不猜：无候选过判据 ⇒ `unfixable` 原样返回，交门禁 fail-fast；**script-only 碎片不造
 *    template**（凭空生成模板属产物直改），只给配方化回灌。
 *  - 幂等：自愈结果本身合法 ⇒ 再跑一次返回 already-valid、逐字不变。
 *  - 纯函数、无 IO、无 logger；计数行文案由 `formatHealStatsLine` 统一产出，调用方恒打。
 *
 * 退役判据（总纲 §6）：计数行 `SFC 叠加结构自愈·已评估` 的 healed 为 hit；
 * 连续 N>=20 单 healed=0 ⇒ 降级为只报断言；连续 M>=10 单 evaluated=0 ⇒ 删除接线。
 */

import {
  validateVueSfc,
  validateVueSfcExpressions,
} from './sfc-syntax-validation.js';

const MAX_CANDIDATES = 24;
const OPEN_BLOCK_RX = /<(template|script|style)\b[^>]*>/gi;
const CLOSE_BLOCK_RX = /<\/(template|script|style)\s*>/gi;
const COMPONENT_TAG_RX = /<([A-Z][A-Za-z0-9_-]*)\b/g;
const SFC_BLOCK_IN_TEMPLATE_RX = /<(?:script|style)\b/i;

/** 扫描全部 template 块（含嵌套 slot）：栈配对，每个 open 配其后第一个同层 close。 */
function scanTemplateBlocks(src) {
  const tokens = [];
  const openRx = new RegExp(OPEN_BLOCK_RX.source, 'gi');
  const closeRx = new RegExp(CLOSE_BLOCK_RX.source, 'gi');
  let m;
  while ((m = openRx.exec(src)) !== null) {
    if (m[1].toLowerCase() !== 'template') continue;
    tokens.push({ index: m.index, end: m.index + m[0].length, kind: 'open' });
  }
  while ((m = closeRx.exec(src)) !== null) {
    if (m[1].toLowerCase() !== 'template') continue;
    tokens.push({ index: m.index, end: m.index + m[0].length, kind: 'close' });
  }
  tokens.sort((a, b) => a.index - b.index);
  const stack = [];
  const blocks = [];
  for (const tok of tokens) {
    if (tok.kind === 'open') {
      stack.push(tok);
    } else if (stack.length > 0) {
      const open = stack.pop();
      blocks.push({
        start: open.index,
        end: tok.end,
        text: src.slice(open.index, tok.end),
        content: src.slice(open.end, tok.index),
      });
    }
  }
  return blocks;
}

/** script/style 不嵌套，按出现顺序一一配对。 */
function scanSimpleBlocks(src, tag) {
  const openRx = new RegExp(`<${tag}\\b[^>]*>`, 'gi');
  const closeRx = new RegExp(`</${tag}\\s*>`, 'gi');
  const opens = [...src.matchAll(openRx)].map((x) => ({
    index: x.index,
    end: x.index + x[0].length,
  }));
  const closes = [...src.matchAll(closeRx)].map((x) => ({
    index: x.index,
    end: x.index + x[0].length,
  }));
  const out = [];
  for (let i = 0; i < Math.min(opens.length, closes.length); i += 1) {
    if (closes[i].index < opens[i].end) continue;
    out.push({
      start: opens[i].index,
      end: closes[i].end,
      text: src.slice(opens[i].index, closes[i].end),
      content: src.slice(opens[i].end, closes[i].index),
    });
  }
  return out;
}

/** 从所有 template 内容里收集必须守恒的子组件标签（script 里的比较符不进入）。 */
function collectComponentTags(contents) {
  const set = new Set();
  for (const c of contents) {
    const rx = new RegExp(COMPONENT_TAG_RX.source, 'g');
    let m;
    while ((m = rx.exec(c)) !== null) set.add(m[1]);
  }
  return [...set];
}

/**
 * 确定性归一「整份 SFC 叠加」。
 *
 * @param {string} source .vue 全文
 * @param {string} [filePath] 仅用于判据错误串前缀
 * @returns {{
 *   source: string, fixed: boolean, reason: string, strategy: string|null,
 *   stats: object, diagnosis: { shape: string, templateBlocks: number,
 *     scriptBlocks: number, styleBlocks: number, conservedTags: string[] }|null
 * }}
 */
export function healStackedSfcBlocks(source = '', filePath = '') {
  const src = String(source || '');
  const stats = {
    evaluated: 0,
    candidates: 0,
    tried: 0,
    healed: 0,
    conservedTags: 0,
    rejectedConservation: 0,
    rejectedInvalid: 0,
    templateBlocks: 0,
    scriptBlocks: 0,
    styleBlocks: 0,
    reason: 'empty',
  };
  const done = (text, fixed, reason, diagnosis = null) => {
    stats.reason = reason;
    return {
      source: text,
      fixed,
      reason,
      strategy: fixed ? 'stacked-blocks-normalized' : null,
      stats: { ...stats },
      diagnosis,
    };
  };
  if (!src.trim()) return done(src, false, 'empty');

  // 🔑 主闸：合格文件逐字不判（含多 style / 嵌套 slot / less @import）。
  const baseline = validateVueSfcExpressions(src, filePath);
  if (baseline.valid) return done(src, false, 'already-valid');

  stats.evaluated = 1;
  const templates = scanTemplateBlocks(src);
  const scripts = scanSimpleBlocks(src, 'script');
  const styles = scanSimpleBlocks(src, 'style');
  stats.templateBlocks = templates.length;
  stats.scriptBlocks = scripts.length;
  stats.styleBlocks = styles.length;

  const diagnosis = {
    shape:
      templates.length > 1
        ? '外层 template 包裹内层 template + SFC 块（叠加）'
        : scripts.length > 1 || styles.length > 1
          ? '多组 script/style 块叠加'
          : '单组块内语法错',
    templateBlocks: templates.length,
    scriptBlocks: scripts.length,
    styleBlocks: styles.length,
    conservedTags: [],
  };

  // 无 template 可救：绝不凭空造模板（产物直改禁令），只给配方回灌。
  if (templates.length === 0) return done(src, false, 'no-template', diagnosis);

  // 🔑 触发判据（2026-11-16 回归收紧）：只认「整份 SFC 被叠加」两类形态，
  //   不认「任意畸形」。既有产品语义要求「两个平级 <template> + 单组 script/style」
  //   这类畸形 revision 必须被预览拒绝 / 回退 last-good（task-code-snapshot-closure.spec
  //   两例锁定），若在此归一就会抹掉回退路径 ⇒ 严格限定：
  //     A. 某个 template 的 content 含 <script>/<style> 开标签（外层 wrapper 包住内层 SFC）；
  //     B. 两组完整 script+style 副本叠加且有多个 template 块。
  const hasWrappedSfcBlock = templates.some((t) =>
    SFC_BLOCK_IN_TEMPLATE_RX.test(t.content),
  );
  const hasDuplicateFullGroups =
    scripts.length > 1 && styles.length > 1 && templates.length > 1;
  if (!hasWrappedSfcBlock && !hasDuplicateFullGroups) {
    return done(src, false, 'not-stacked', diagnosis);
  }

  const tags = collectComponentTags(templates.map((t) => t.content));
  stats.conservedTags = tags.length;
  diagnosis.conservedTags = tags;
  // 无组件标签可锚定 ⇒ 不允许「随便挑一个 template」归一（无锚不定，宁可 fail-fast）。
  if (tags.length === 0) {
    return done(src, false, 'unfixable-no-anchor', diagnosis);
  }

  // 候选：每个「不含 SFC 块标签」的 template × 每个 script × 每个 style；
  // 外层 wrapper 因 content 含 <script>/<style> 被预筛掉，由判据最终裁决。
  const usable = templates
    .filter((t) => !SFC_BLOCK_IN_TEMPLATE_RX.test(t.content))
    .sort((a, b) => b.content.length - a.content.length);
  const scriptTexts = scripts.length > 0 ? scripts.map((s) => s.text) : [null];
  const styleTexts = styles.length > 0 ? styles.map((s) => s.text) : [null];
  const seen = new Set();
  const combos = [];
  for (const t of usable) {
    for (const s of scriptTexts) {
      for (const st of styleTexts) {
        const cand = [t.text, s, st].filter(Boolean).join('\n');
        if (seen.has(cand)) continue;
        seen.add(cand);
        combos.push(cand);
      }
    }
  }
  combos.length = Math.min(combos.length, MAX_CANDIDATES);
  stats.candidates = combos.length;

  for (const cand of combos) {
    stats.tried += 1;
    // 内容守恒：挑错 template 会丢子组件标签，直接弃用该候选。
    if (tags.some((tag) => !cand.includes(`<${tag}`))) {
      stats.rejectedConservation += 1;
      continue;
    }
    if (!validateVueSfcExpressions(cand, filePath).valid) {
      stats.rejectedInvalid += 1;
      continue;
    }
    // 与 chunk-snapshot-pusher ②d 逐字同口径：validateVueSfc 的 style(less) 错误在内存/临时
    // 路径下有已知假阳（@import 连带 theme-vars 未定义），不计入结构裁决；其余错误一律判死。
    const strict = validateVueSfc(cand, filePath);
    const fatal = (strict.errors || []).filter(
      (e) => !/ style: /.test(String(e)),
    );
    if (!strict.valid && fatal.length > 0) {
      stats.rejectedInvalid += 1;
      continue;
    }
    stats.healed = 1;
    return done(cand, true, 'healed', diagnosis);
  }
  return done(src, false, 'unfixable', diagnosis);
}

/** 真机计数行统一文案（0 也打；调用方对每个被评估的坏文件恒打一行）。 */
export function formatHealStatsLine(stats = {}, filePath = '') {
  const s = {
    evaluated: 0,
    candidates: 0,
    tried: 0,
    healed: 0,
    conservedTags: 0,
    rejectedConservation: 0,
    rejectedInvalid: 0,
    templateBlocks: 0,
    scriptBlocks: 0,
    styleBlocks: 0,
    reason: '-',
    ...(stats || {}),
  };
  return (
    `🛡️ SFC 叠加结构自愈·已评估：file=${filePath} evaluated=${s.evaluated} ` +
    `candidates=${s.candidates} tried=${s.tried} healed=${s.healed} ` +
    `conservedTags=${s.conservedTags} templateBlocks=${s.templateBlocks} ` +
    `scriptBlocks=${s.scriptBlocks} styleBlocks=${s.styleBlocks} ` +
    `rejectedConservation=${s.rejectedConservation} rejectedInvalid=${s.rejectedInvalid} ` +
    `reason=${s.reason}`
  );
}

/**
 * L2 配方化回灌：把 SFC 结构错误译成「可照抄代码形态 + 归属定位」，
 * 替换 phase2:2478 原有的自然语言「重新生成完整文件」（修复轮唯一实证有效形态）。
 *
 * @param {Array<{path: string, errors: string[]}>} blocked 写盘门禁实测阻断清单（单一事实源）
 * @param {{round?: number, skeleton?: string}} [options]
 * @returns {string}
 */
export function buildSfcStructureRecipe(blocked = [], options = {}) {
  const list = (Array.isArray(blocked) ? blocked : []).filter(
    (f) => f && typeof f.path === 'string',
  );
  const round = Math.max(1, Number(options.round) || 1);
  const skeleton = String(options.skeleton || '').trim();
  const lines = [
    '【SFC 结构修复配方（可照抄，禁止自由重写整份文件）】',
    `轮次 ${round}/2：确定性自愈器已评估仍无法归一，按本配方重排；两轮仍失败即 fail-closed。`,
    '命中形态：两份完整 SFC 叠加 / 外层 <template> 包住 <script><style> / 只有 <script> 没有 <template>。',
    '写盘门禁实测命中（错误文件 + 行列 + 原文，逐条消除，不得换文件）：',
  ];
  for (const f of list.slice(0, 5)) {
    const errs = (Array.isArray(f.errors) ? f.errors : [])
      .slice(0, 2)
      .map((e) => String(e).slice(0, 220));
    lines.push(`  - ${f.path}：${errs.join('；') || '（无错误详情）'}`);
  }
  lines.push('');
  lines.push('【正确形态：一个 .vue 只能有这一组，照抄块顺序】');
  lines.push('<template>');
  lines.push('  <base-panel panelKey="default-panel">');
  lines.push('    <div class="...">');
  lines.push('      <!-- 子组件标签：必须原样保留上一轮该文件已写出的全部标签，禁止增删 -->');
  lines.push('    </div>');
  lines.push('  </base-panel>');
  lines.push('</template>');
  lines.push('<script setup>');
  lines.push('  // 原样保留上一轮的 import / 状态 / 事件，不得删除');
  lines.push('</script>');
  lines.push('<style lang="less" scoped>');
  lines.push("@import '../resources/styles/index.less';");
  lines.push('</style>');
  lines.push('');
  lines.push('【禁止清单（违反即被写盘门禁判死）】');
  lines.push('  1. 第二个 <template> / 第二个 <script setup> / 第二个 <style> 块；');
  lines.push('  2. 在 <template> 内出现 <script> 或 <style> 标签；');
  lines.push('  3. 输出只有 <script> 没有 <template> 的半截文件；');
  lines.push('  4. 把整份文件重复追加到已有内容之后（只输出一份完整文件）。');
  if (skeleton) {
    lines.push('');
    lines.push('【归属段定位：上一轮组件树骨架（标签必须逐个命中）】');
    lines.push(skeleton.slice(0, 1600));
  } else {
    lines.push('');
    lines.push(
      '【归属段定位】本轮无组件树骨架可引用：以「写盘门禁实测命中」里的文件路径与行列为准，',
    );
    lines.push(
      '只修该文件被点名的块，禁止凭空补段、禁止改动其他文件（指空段＝无效配方）。',
    );
  }
  return lines.join('\n');
}

export default healStackedSfcBlocks;
