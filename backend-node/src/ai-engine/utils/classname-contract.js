/**
 * @file classname-contract.js — 🛡️ P1.6（2026-09-11）：**类名契约的单一实现**。
 *
 * 契约（写入 docs/mc-spec-compliance-plan「M7 类名契约」）：
 *   C1 修饰符只允许标准形态 `--mod`（BEM）；`is-active` 等布尔方言必须归一后落盘。
 *   C2 修饰符类必须与**同一元素的基类**前缀一致（DOM 形态），否则选择器永不命中。
 *   C3 模板出现的修饰符类必须在样式源有对应规则（激活态必须有效）。
 *   C4 样式中的修饰符规则必须有模板使用（无死规则 / 无被 base 化规则）。
 *
 * 为什么单一实现：门禁（CODE-024，fail-closed BLOCK）与产物不变量（I7，报告）必须
 * 用同一判据，否则「门禁放过、不变量报警」这类双源漂移会立刻复发
 * （P1.5 单一事实源原则：同一事实只允许一处实现）。
 *
 * 判据基准 = classFacts（DOM 事实源，utils/class-facts.js 采集），不再靠「样式源里出现过」。
 * jest 安全：无 import.meta。
 */

import {
  splitModifier,
  hasModifier,
  normalizeModifierSuffix,
  isAliasModifierToken,
  modifierKeyOf,
} from './class-facts.js';

/**
 * 契约意义上的「修饰符类」判定（**比 splitModifier 更严格**，防语义类名误判）。
 *
 * 为什么需要：`c-device-monitor-active` 这类**语义类名**（＝"active 卡片"）会被 splitModifier
 * 的单横线规则识别成 `-active` 修饰符 → 契约层 C2/C4 误报为「基类不在 DOM」
 * （实测存量 20 组件 C2 虚高到 71 条）。契约只认两种确凿形态：
 *   ① BEM 双横线 `--mod`；② 布尔别名 `is-active` / `active`（独立 token）。
 */
export function isContractModifier(cls = '') {
  if (isAliasModifierToken(cls)) return true;
  const { suffix } = splitModifier(cls);
  return suffix.startsWith('--');
}

/** 收集全部样式源文本（.less/.css + 各 .vue 的 <style>） */
export function collectAllStyleSources(files = {}) {
  let all = '';
  for (const [p, c] of Object.entries(files)) {
    if (typeof c !== 'string') continue;
    if (/\.(less|css)$/i.test(p)) all += `\n/*${p}*/\n${c}`;
    else if (/\.vue$/i.test(p)) {
      const m = c.match(/<style[^>]*>([\s\S]*?)<\/style>/gi);
      if (m) all += `\n/*${p}*/\n${m.join('\n')}`;
    }
  }
  return all;
}

/**
 * 从样式源提取「选择器里带修饰符的规则」。
 * 支持两种形态：① `.c-x-item--active {`（BEM）② `.c-x-item.is-active {`（复合布尔类）
 * @param {string} styles
 * @param {string} fileHint 归属文件名（仅用于报告）
 * @returns {Array<{baseToken:string, bareToken:string, modKey:string, aliasForm:boolean, raw:string}>}
 */
export function extractModifierRules(styles = '') {
  const out = [];
  // 只取选择器行（含 { 或以 , 结尾）
  for (const line of String(styles).split('\n')) {
    const t = line.trim();
    if (!t.includes('{') && !/,\s*$/.test(t)) continue;
    const selector = t.replace(/\{.*$/, '').trim();
    if (!selector) continue;
    // 拆出选择器中的类 token
    const tokens = [...selector.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)].map((m) => m[1]);
    if (tokens.length === 0) continue;
    // ① 形态一：token 自带修饰符（c-x-item--active）
    const withMod = tokens.filter((tk) => isContractModifier(tk) && !isAliasModifierToken(tk));
    if (withMod.length > 0) {
      for (const tk of withMod) {
        const { base, suffix } = splitModifier(tk);
        out.push({
          baseToken: base,
          bareToken: tk,
          modKey: `${base.toLowerCase()}${normalizeModifierSuffix(suffix)}`,
          aliasForm: false,
          raw: selector,
        });
      }
      continue;
    }
    // ② 形态二：复合布尔类（.c-x-item.is-active）—— base 取非别名 token，mod 取别名 token
    const aliasTokens = tokens.filter((tk) => isAliasModifierToken(tk));
    const baseTokens = tokens.filter((tk) => !isAliasModifierToken(tk) && /^c-/.test(tk));
    if (aliasTokens.length > 0 && baseTokens.length > 0) {
      for (const alias of aliasTokens) {
        for (const base of baseTokens) {
          out.push({
            baseToken: base,
            bareToken: `${base}.${alias}`,
            modKey: modifierKeyOf(base) || `*${normalizeModifierSuffix(alias)}`,
            aliasForm: true,
            raw: selector,
            aliasToken: alias,
          });
        }
      }
      continue;
    }
    // ③ 仅别名类（.is-active {）—— 无基类信息，按通配处理
    for (const alias of aliasTokens) {
      out.push({
        baseToken: '',
        bareToken: alias,
        modKey: modifierKeyOf(alias),
        aliasForm: true,
        raw: selector,
        aliasToken: alias,
      });
    }
  }
  return out;
}

/**
 * 类名契约校验（单一实现）。
 * @param {Object<string,string>} files 产物文件表
 * @param {import('./class-facts.js').ClassFacts|null} classFacts DOM 类事实（缺省时由调用方保证已注入/自采集）
 * @returns {Array<{id:string, code:'C1'|'C2'|'C3'|'C4', severity:'error'|'warn', file:string, message:string}>}
 */
export function checkClassNameContract(files = {}, classFacts = null) {
  const violations = [];
  const facts = classFacts || null;
  const byFile = facts?.byFile || {};
  const vueFiles = Object.keys(files).filter((p) => /\.vue$/i.test(p));

  // DOM 全局索引：修饰符键 → 该修饰符在 DOM 里所属的基类形态集合
  const domModToBases = new Map(); // modKey(小写) → Set<baseToken 原样>
  const domModAliasOnly = new Set(); // 仅布尔别名的通配键集合
  const domAllBases = new Map(); // baseKey → Set<token>
  for (const p of vueFiles) {
    const fact = byFile[p];
    if (!fact) continue;
    for (const [baseKey, bucket] of Object.entries(fact.bases || {})) {
      const set = domAllBases.get(baseKey) || new Set();
      for (const b of bucket.bare || []) set.add(b);
      domAllBases.set(baseKey, set);
      for (const [suffix, toks] of Object.entries(bucket.mods || {})) {
        const key = `${baseKey}${normalizeModifierSuffix(suffix)}`;
        const s = domModToBases.get(key) || new Set();
        for (const t of toks) s.add(t);
        domModToBases.set(key, s);
      }
    }
  }
  // 布尔别名形态的 DOM 类（is-active 单独出现在 :class 里）→ 通配键
  for (const p of vueFiles) {
    for (const tok of byFile[p]?.exact || []) {
      if (isAliasModifierToken(tok)) domModAliasOnly.add(normalizeModifierSuffix(tok.replace(/^is-/, '')));
    }
  }

  const styles = collectAllStyleSources(files);
  const styleRules = extractModifierRules(styles);
  const styleRuleKeys = new Set(styleRules.map((r) => r.modKey).filter(Boolean));
  // 精确类名集合（用于 C3 的宽松命中）
  const styleClassSet = new Set();
  for (const m of styles.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) {
    if (/^c-mc-[a-z]+-\d{10,}/.test(m[1])) continue;
    styleClassSet.add(m[1].toLowerCase());
  }

  // ——— C1 方言：模板出现布尔别名修饰符 → error（应已在归一阶段消除） ———
  for (const p of vueFiles) {
    const fact = byFile[p] || {};
    for (const tok of fact.exact || []) {
      if (!isAliasModifierToken(tok)) continue;
      violations.push({
        id: 'CLASSNAME-C1',
        code: 'C1',
        severity: 'error',
        file: p,
        message: `模板使用非标准修饰符方言 \`${tok}\`（契约要求 --mod；应在写盘前归一为「基类--active」）`,
      });
    }
  }

  // ——— C3 模板 → 样式：修饰符类必须有对应规则 ———
  for (const p of vueFiles) {
    const fact = byFile[p] || {};
    for (const tok of fact.exact || []) {
      if (!isContractModifier(tok)) continue;
      if (/^c-mc-[a-z]+-\d{10,}/.test(tok)) continue;
      if (styleClassSet.has(tok.toLowerCase())) continue;
      const key = modifierKeyOf(tok);
      if (key && styleRuleKeys.has(key)) continue;
      if (key && key.startsWith('*') && styleRuleKeys.has(key)) continue;
      violations.push({
        id: 'CLASSNAME-C3',
        code: 'C3',
        severity: 'error',
        file: p,
        message: `模板修饰符类 \`${tok}\` 无对应样式规则（激活态必然失效）`,
      });
    }
  }

  // ——— C2 修饰符规则的基类必须与 DOM 形态一致 ———
  for (const rule of styleRules) {
    if (!rule.baseToken) continue;
    const baseKey = rule.baseToken.toLowerCase();
    const domBases = domAllBases.get(baseKey);
    if (!domBases || domBases.size === 0) {
      // 基类不在 DOM（可能是宿主/工具类）→ 仅当该修饰符在 DOM 中另有归属时才算契约违背
      if (domModToBases.has(rule.modKey)) {
        violations.push({
          id: 'CLASSNAME-C2',
          code: 'C2',
          severity: 'error',
          file: 'styles',
          message: `修饰符规则基类 \`${rule.baseToken}\` 不在 DOM（选择器永不命中）：${rule.raw.slice(0, 60)}`,
        });
      }
      continue;
    }
    const exactHit = [...domBases].some((b) => b === rule.baseToken);
    if (!exactHit) {
      violations.push({
        id: 'CLASSNAME-C2',
        code: 'C2',
        severity: 'error',
        file: 'styles',
        message:
          `修饰符规则基类形态与 DOM 不一致：规则用 \`${rule.baseToken}\`，DOM 实为 ` +
          `${[...domBases].slice(0, 2).map((b) => `\`${b}\``).join('/')}（前缀不一致 → 永不命中）：${rule.raw.slice(0, 60)}`,
      });
    }
  }

  // ——— C4 样式 → 模板：修饰符规则必须有模板使用 ———
  const domKeys = new Set([...domModToBases.keys(), ...[...domModAliasOnly].map((s) => `*${s}`)]);
  for (const rule of styleRules) {
    if (!rule.modKey) continue;
    if (domKeys.has(rule.modKey)) continue;
    if (rule.modKey.startsWith('*') && domKeys.has(rule.modKey)) continue;
    // 通配对通配（如 DOM 有 is-active、样式也是 .is-active）已在上方覆盖
    violations.push({
      id: 'CLASSNAME-C4',
      code: 'C4',
      severity: 'warn',
      file: 'styles',
      message: `样式修饰符规则无模板使用（疑似被 base 化或拼错）：${rule.raw.slice(0, 60)}`,
    });
  }

  // 去重（同 code + message 只留一条）
  const seen = new Set();
  return violations.filter((v) => {
    const k = `${v.code}|${v.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
