/**
 * 🛡️ 2026-11-18 · SFC 模板「缺开始标签」确定性自愈（N1 死结 · 方案 A）。
 *
 * 病灶：`Invalid end tag.` / `Element is missing end tag.` 是**跨行标签错配**——
 *   LLM 把 `<div class="x">` 写成裸文本 `div class="x"`（丢了 `<` 或 `>`），
 *   `@vue/compiler-sfc` 只在游离闭标签那一行报错，**错误文案不带标签名**
 *   （实测 compileTemplate：`{ msg: 'Invalid end tag.', line: 4, col: 3 }`）。
 *   现有自愈器 `healStackedSfcBlocks` 只认「整份 SFC 叠加」两类形态，
 *   单块内残缺一律 `not-stacked/unfixable` 原样交门禁判死（11-16 回归收紧，
 *   为保留 last-good 回退路径，不能放宽它）。本模块是**独立**的自愈器，
 *   只接在 `writeFiles` 写盘门禁**判死前**，不碰终验门/快照服务，零回退路径干扰。
 *
 * 非硬编码纪律（用户硬约束「修补不应该是硬编码」）：
 *  - 标签名**从产物自身的游离闭标签动态提取**（如 `</div>` → `div`），
 *    不在代码里写死 div/span/任何具体标签。
 *  - 修复动作是**通用候选**：对缺 `<` 补 `<`、对缺 `>` 补 `>`、对整块重复做配对归一；
 *    候选是搜索出来的，不是写死的 if-else 补丁。
 *  - 裁决**只由编译器**做：`validateVueSfcExpressions` valid 才接受，
 *    本模块不自建第二套 SFC 解析、不写「见到 X 就补 Y」的具体标签规则。
 *  - 内容守恒：候选必须保留原文全部大写组件标签 + 全部非空文本 token，否则弃用
 *    （防「修好语法却悄悄丢文案/子组件」的次生缺口）。
 *
 * fail-safe / 阴阳对照：
 *  - 主闸：`validateVueSfcExpressions(src).valid` 为真 ⇒ 合格文件逐字不判（already-valid）。
 *  - 触发只认两类 end-tag 错误，其余畸形不碰（not-in-scope）。
 *  - 无候选过判据 ⇒ `unfixable` 原样返回，交门禁 fail-fast；绝不产物直改、不猜标签。
 *  - 幂等：修好的文件再跑一次返回 already-valid、逐字不变。
 *  - 纯函数、无 IO、无 logger；计数行由 `formatOpenTagHealStatsLine` 统一产出，调用方恒打。
 */

import { validateVueSfcExpressions } from './sfc-syntax-validation.js';
import { extractSfcTemplate } from './sfc-template-extractor.js';

const MAX_CANDIDATES = 32;

/** 只有这两类跨行标签错配是本模块管辖范围；其余畸形不碰。 */
const END_TAG_RX = /(?:Invalid end tag|Element is missing end tag)/i;

/**
 * 从校验错误里取首个 end-tag 错误的行号（错误串格式 `file:line:col template: msg`）。
 * @returns {{line:number, kind:'invalid'|'missing'}|null}
 */
function firstEndTagError(errors = []) {
  for (const e of errors || []) {
    const s = String(e);
    if (!END_TAG_RX.test(s)) continue;
    const m = s.match(/:(\d+):\d+/);
    const line = m ? Number(m[1]) : 0;
    return {
      line,
      kind: /missing end tag/i.test(s) ? 'missing' : 'invalid',
    };
  }
  return null;
}

/**
 * 取模板区（single source = extractSfcTemplate），按行切开。
 * 返回 { lines, offset } —— offset 为模板区在全文中的起始行号，用于把错误行号映射回模板区。
 */
function templateLines(source) {
  const tpl = extractSfcTemplate(source);
  if (tpl === null) return null;
  const lines = tpl.split('\n');
  const head = source.slice(0, source.indexOf(tpl));
  const offset = head ? head.split('\n').length - 1 : 0;
  return { lines, offset };
}

/**
 * 收集内容守恒锚点：大写组件标签（<Foo）与非空文本 token。
 * 只做守恒比对，不做任何解析/判定。
 */
function conservationAnchors(source) {
  const componentTags = new Set(
    [...String(source || '').matchAll(/<([A-Z][A-Za-z0-9_-]*)\b/g)].map((m) => m[1]),
  );
  const textTokens = new Set(
    String(source || '')
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t && /[^\s<>{}]/.test(t)),
  );
  return { componentTags, textTokens };
}

function conserved(candidate, anchors) {
  for (const tag of anchors.componentTags) {
    if (!candidate.includes(`<${tag}`)) return false;
  }
  for (const tok of anchors.textTokens) {
    if (!candidate.includes(tok)) return false;
  }
  return true;
}

/**
 * 生成候选修复文本（非硬编码标签名）。
 *
 * 策略：
 *  ① 定位错误行在模板区的索引 `errIdx`。
 *  ② 扫描错误行附近（含自身 ± 3 行）找「裸开始标签」——形如
 *     `^(\s*)([a-zA-Z][\w-]*)(\s[^<>]*?)?$` 且**不含 `<`**（即 `<` 被 LLM 吞掉，
 *     例如 `  div class="x" style="..."`），标签名由该行自身给出，不写死。
 *     对每处生成 3 个通用候选：补 `<`、补 `<`+`>`、补 `<`+`>` 并保留原属性。
 *  ③ 另对「缺 `>`」形态：错误行前的行含 `<tag ...` 但没有闭合 `>`，补 `>`。
 *
 * 每个候选都交给 validateVueSfcExpressions 裁决，本函数只负责**搜索**。
 */
function buildCandidates(tpl, errLineInTpl) {
  const out = [];
  const seen = new Set();
  const push = (lines, tag) => {
    const text = lines.join('\n');
    if (seen.has(text)) return;
    seen.add(text);
    out.push({ text, tag });
  };

  const { lines } = tpl;
  const center = Math.max(0, Math.min(lines.length - 1, errLineInTpl));
  const lo = Math.max(0, center - 4);
  const hi = Math.min(lines.length - 1, center + 1);

  for (let i = lo; i <= hi; i += 1) {
    const line = lines[i];
    if (line.includes('<')) continue; // 已有开始标签，非「缺 <」形态
    // 裸开始标签：行首是标签名，后跟属性文本，无 '<'、无 '>'
    const m = line.match(/^(\s*)([a-zA-Z][\w-]*)(\s[^<>]*?)?$/);
    if (!m) continue;
    const [, indent, tag, attrsRaw] = m;
    if (/^(const|let|var|return|import|export|if|else|for|while|function)$/.test(tag)) continue;
    const attrs = attrsRaw || '';

    // 候选 A：补 '<' 与 '>'（把裸标签还原为完整开始标签）
    const a = [...lines];
    a[i] = `${indent}<${tag}${attrs}>`;
    push(a, tag);

    // 候选 B：只补 '<'（原本可能已有隐含闭合，如自闭合前的属性）
    const b = [...lines];
    b[i] = `${indent}<${tag}${attrs}`;
    push(b, tag);

    // 候选 C：补 '<' 且自闭合（属性以 '/' 结尾的形态）
    if (attrs.trimEnd().endsWith('/')) {
      const c = [...lines];
      c[i] = `${indent}<${tag}${attrs.trimEnd()}>`;
      push(c, tag);
    }
  }

  // 缺 '>' 形态：错误行之前的行里有 '<tag ...' 但没有 '>' 闭合
  for (let i = lo; i <= hi && out.length < MAX_CANDIDATES; i += 1) {
    const line = lines[i];
    const m = line.match(/^(\s*)<([a-zA-Z][\w-]*)(\s[^<>]*?)$/);
    if (!m) continue;
    const d = [...lines];
    d[i] = `${line}>`;
    push(d, m[2]);
  }

  return out.slice(0, MAX_CANDIDATES);
}

/** 把模板区文本拼回完整 SFC 全文（只替换模板区，不动 script/style）。 */
function spliceTemplate(source, tpl, newTplLines) {
  const tplText = tpl.lines.join('\n');
  const at = source.indexOf(tplText);
  if (at < 0) return null;
  return source.slice(0, at) + newTplLines.join('\n') + source.slice(at + tplText.length);
}

const done = (stats, text, fixed, reason, extra = {}) => {
  stats.reason = reason;
  return {
    source: text,
    fixed,
    reason,
    strategy: fixed ? 'open-tag-restored' : null,
    stats: { ...stats },
    ...extra,
  };
};

/**
 * 主入口：对「缺开始标签」类跨行错配做确定性自愈。
 *
 * @param {string} source SFC 全文
 * @param {string} [filePath] 仅用于报错展示
 * @returns {{source:string, fixed:boolean, reason:string, strategy:string|null,
 *            stats:Object, diagnosis?:Object}}
 */
export function healSfcOpenTag(source = '', filePath = '') {
  const src = String(source || '');
  const stats = {
    evaluated: 0,
    candidates: 0,
    tried: 0,
    healed: 0,
    rejectedConservation: 0,
    rejectedInvalid: 0,
    reason: 'empty',
  };
  if (!src.trim()) return done(stats, src, false, 'empty');

  // 主闸：合格文件逐字不判
  const baseline = validateVueSfcExpressions(src, filePath);
  if (baseline.valid) return done(stats, src, false, 'already-valid');

  const err = firstEndTagError(baseline.errors);
  if (!err || !err.line) return done(stats, src, false, 'not-in-scope');

  const tpl = templateLines(src);
  if (!tpl) return done(stats, src, false, 'no-template');

  const anchors = conservationAnchors(src);
  const errLineInTpl = err.line - 1 - tpl.offset;
  const candidates = buildCandidates(tpl, errLineInTpl);
  stats.evaluated = 1;
  stats.candidates = candidates.length;
  if (candidates.length === 0) return done(stats, src, false, 'no-candidate');

  const diagnosis = {
    errorKind: err.kind,
    errorLine: err.line,
    candidateCount: candidates.length,
  };

  for (const cand of candidates) {
    stats.tried += 1;
    const full = spliceTemplate(src, tpl, cand.text.split('\n'));
    if (!full) {
      stats.rejectedInvalid += 1;
      continue;
    }
    // 守恒必须在**拼回全文后**检查：anchors 含 script/style 区的 token，
    // 只比对模板片段会把这些 token 全判丢失 ⇒ 假拒绝（诊断实测 rejectedConservation 误=2）。
    if (!conserved(full, anchors)) {
      stats.rejectedConservation += 1;
      continue;
    }
    if (!validateVueSfcExpressions(full, filePath).valid) {
      stats.rejectedInvalid += 1;
      continue;
    }
    stats.healed = 1;
    return done(stats, full, true, 'healed', {
      diagnosis: { ...diagnosis, restoredTag: cand.tag },
    });
  }
  return done(stats, src, false, 'unfixable', { diagnosis });
}

/** 真机计数行统一文案（0 也打；调用方对每个被评估的坏文件恒打一行）。 */
export function formatOpenTagHealStatsLine(stats = {}, filePath = '') {
  const s = stats || {};
  return (
    `🛡️ SFC 缺开始标签自愈·已评估 ${filePath} ` +
    `evaluated=${s.evaluated || 0} candidates=${s.candidates || 0} tried=${s.tried || 0} ` +
    `healed=${s.healed || 0} rejectedConservation=${s.rejectedConservation || 0} ` +
    `rejectedInvalid=${s.rejectedInvalid || 0} reason=${s.reason || '-'}`
  );
}

export default healSfcOpenTag;
