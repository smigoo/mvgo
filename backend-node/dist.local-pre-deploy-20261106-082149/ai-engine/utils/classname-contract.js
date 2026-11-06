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
// 🛡️ 刀 13b（2026-09-13）：嵌套 `&` 选择器的父选择器栈解析（与归一器共用同一实现）
import { buildParentSelectorMap, expandAmpSelector } from './less-selector-stack.js';
// 🛡️ 刀 14（2026-09-13）：C3 判据必须先剥 `[自动修复]` 兜底 stub 段（同一实现，禁手搓正则）。
// 单向依赖：class-dialect-normalizer 不 import 本模块，无环。
import { stripAutoFixSection } from './class-dialect-normalizer.js';

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
  // 🛡️ 刀 14（2026-09-13）：编译产物 `.css` 不入样式源 —— 同名 `.less` 存在时该 `.css` 是它的
  // LESS 派生，且 `[自动修复]` 兜底段经主题层（`&.dark { @import '../common.less' }`）与
  // `@import (multiple)` 展开后，**标记注释与规则块分离**，`stripAutoFixSection` 只能剥掉一部分
  // → 残留 `.dark .c-x { display:flex; flex-direction:row }` 会把「只有 stub」误判成「样式侧存在」
  // → C3 的可修/不可修二分失效（刀 12 已在 `buildStyleClassIndex` 落过这条原则，此处补齐，
  // 保持「编译产物不是设计意图」的单一口径）。
  for (const [p, c] of Object.entries(files)) {
    if (typeof c !== 'string') continue;
    if (/\.css$/i.test(p)) {
      const lessSibling = p.replace(/\.css$/i, '.less');
      if (Object.prototype.hasOwnProperty.call(files, lessSibling)) continue;
    }
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
  // 🛡️ 刀 13b（2026-09-13）：先把嵌套 `&` 还原成完整选择器再抽 token。
  // 否则归一后的 `&--active`（选择器里连 `.` 都没有）会**完全不可见** → 契约层
  // 「样式修饰符规则无模板使用」这项判定出现新盲区（归一器把样式改对了，门禁却看不见，
  // 既不能报警也不能确认）。父选择器栈与归一器共用同一实现（less-selector-stack）。
  const parents = buildParentSelectorMap(styles);
  let lineIdx = -1;
  // 只取选择器行（含 { 或以 , 结尾）
  for (const line of String(styles).split('\n')) {
    lineIdx += 1;
    const t = line.trim();
    if (!t.includes('{') && !/,\s*$/.test(t)) continue;
    const selectorRaw = t.replace(/\{.*$/, '').trim();
    if (!selectorRaw) continue;
    const selector = expandAmpSelector(selectorRaw, parents[lineIdx]) || selectorRaw;
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
          raw: selectorRaw,
          resolvedSelector: selector,
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
            raw: selectorRaw,
            resolvedSelector: selector,
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
        raw: selectorRaw,
        resolvedSelector: selector,
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
  // 🛡️ 刀 14（2026-09-13）：C3 的「样式侧是否存在」判定必须**先剥 [自动修复] 兜底 stub**。
  // 兜底 stub（`display:flex;flex-direction:row`）不是设计意图，却会让「样式侧有同名类」成立
  // → 掩盖「模板基名与样式基名体系脱节」的真缺陷（刀 12 铁律：stub 是症状遮罩）。
  // 反过来，剥掉后「模板基类只剩 stub」就成了**设计缺失**的确凿信号 → 支撑下面的可修/不可修二分。
  const designStyles = stripAutoFixSection(styles);
  // 精确类名集合（用于 C3 的宽松命中）—— 基于设计样式（已剥 stub）
  const styleClassSet = new Set();
  for (const m of designStyles.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) {
    if (/^c-mc-[a-z]+-\d{10,}/.test(m[1])) continue;
    styleClassSet.add(m[1].toLowerCase());
  }
  // 设计样式里的「基名 → 该基名已有的修饰符后缀集合」（不可修 C3 给候选基名用）
  const designBaseMods = new Map();
  for (const r of styleRules) {
    if (!r.baseToken) continue;
    const k = r.baseToken.toLowerCase();
    const sfx = String(r.modKey || '').slice(k.length);
    const s = designBaseMods.get(k) || new Set();
    if (sfx) s.add(sfx);
    designBaseMods.set(k, s);
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
  //
  // 🛡️ 刀 14（2026-09-13）**可修 / 不可修二分**（与刀 13 A 的 COMP-001 同源设计）。
  // 事故 mc-1789310631072-8fb4f52f：模板两张卡片写作 `.c-device-monitor-active` /
  // `.c-device-monitor-default`（+ 状态类 `--on` / `--active`），而样式侧的设计基名是
  // `.c-device-monitor-switch-item{&--active{…}}` —— **完全换名**（非前缀扩展，R4 判据够不到）。
  // 门禁 C3 报「模板修饰符类无对应样式规则」是**真**的，但要求 LLM「补样式」是**不可达成**的：
  // 样式侧根本没有该状态的设计真值，补出来的只能是臆造。表现为每轮 BLOCK 各不相同
  // （LESS-COMPILE-001 → CODE-015 → CODE-024 C3 = 打地鼠），3 轮软失败。
  // 故：基类在设计样式里**存在** → 可修（保持 error，补一条规则即可）；
  //     基类在设计样式里**不存在**（只有 stub 或完全没有）→ 不可修，降 warn 并在文案里
  //     给出「带同修饰符的设计基名候选」，引导对齐基名而不是空转重试。
  for (const p of vueFiles) {
    const fact = byFile[p] || {};
    for (const tok of fact.exact || []) {
      if (!isContractModifier(tok)) continue;
      if (/^c-mc-[a-z]+-\d{10,}/.test(tok)) continue;
      if (styleClassSet.has(tok.toLowerCase())) continue;
      const key = modifierKeyOf(tok);
      if (key && styleRuleKeys.has(key)) continue;
      if (key && key.startsWith('*') && styleRuleKeys.has(key)) continue;

      const { base, suffix } = splitModifier(tok);
      const baseKey = base ? String(base).toLowerCase() : '';
      const baseInDesign = baseKey ? styleClassSet.has(baseKey) : false;
      if (!baseInDesign && baseKey) {
        const sfxKey = normalizeModifierSuffix(suffix);
        const candidates = [...designBaseMods.entries()]
          .filter(([, mods]) => mods.has(sfxKey))
          .map(([b]) => b)
          .slice(0, 3);
        violations.push({
          id: 'CLASSNAME-C3-UNREACHABLE',
          code: 'C3',
          severity: 'warn',
          file: p,
          message:
            `模板修饰符类 \`${tok}\` 无对应样式规则，且其基类 \`${base}\` 在样式侧**无设计规则**` +
            `（仅兜底 [自动修复] stub 或完全缺失）——补样式只会臆造设计，重试无法收敛。` +
            `请把模板基名对齐到样式侧的设计基名` +
            (candidates.length
              ? `（带 \`${sfxKey}\` 的候选：${candidates.map((c) => `\`${c}\``).join(' / ')}）`
              : `（样式侧无同修饰符的设计基名，建议删除该状态类或统一两侧基名）`),
        });
        continue;
      }
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
