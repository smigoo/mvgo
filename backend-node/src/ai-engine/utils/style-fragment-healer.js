/**
 * 🛡️ style-fragment-healer.js —— LLM「压缩残片」格式损坏自愈（刀 25 / 刀 26，方案 E 双链路共用）。
 *
 * 背景（2026-10-12 · mc-max-1791779417789-cba8407d 实锤）：
 *   ① LESS：模型写 CSS 时用「声明+闭括号挤一行」的压缩残片（`  display: flex;}`），
 *      当该残片**连续出现两行**时，第一行的 `}` 闭合内层规则、第二行把声明连同 `}`
 *      塞进**外层规则**（`.c-cba840-form` 意外获得 display:flex 无 flex-direction）
 *      → 表单容器变 row-flex、全部表单项横向排列并互相溢出。
 *      LESS 语法合法 ⇒ 编译类门禁（LESS-COMPILE-001）必然放行，属「格式损坏→语义漂移」类。
 *   ② Script：`<script setup>` 对象字面量里出现**整行只有 `,`** 的残片
 *      → `[vue/compiler-sfc] Unexpected token` → 预览端组件加载失败。
 *
 * 两个修复器均为**确定性局部判据**（命名无关、零产物结构假设）、幂等、fail-open；
 * 纯函数、零 import.meta、零 backend-root，可独立单测。
 *
 * 挂载点：runPreWriteSelfHealing ④-d（在 FLEX 归一与 ⑩⑪「最终形态检测」之前，
 * 使后续门禁看到的是修复后的形态）。
 */

import { extractRootTemplate } from './layout-truth-healer.js';

/**
 * 刀 25：连续相同的「压缩残片闭块行」归一。
 *
 * 病灶（真实片段）：
 *   :deep(.ant-form-item-control) {
 *     flex: 1 1 auto;
 *     min-width: 0;
 *   display: flex;}      ← 残片 A：声明+闭括号同行（闭合内层规则）
 *   display: flex;}      ← 残片 B：逐字重复（把声明塞进外层规则并提前闭合）
 *
 * 修复（括号计数不变：两个 `}` 仍是两个 `}`）：
 *     display: flex;     ← 声明归给最内层未闭合块（模型的真实意图位）
 *   }                    ← 闭内层
 * }                      ← 闭外层（外层不再误得声明）
 *
 * 判据（命名无关）：
 *   ① 两行**直接相邻**（中间无其它行）；
 *   ② 两行**去掉首尾空白后逐字相同**；
 *   ③ 行形态 = `声明...;}`（以 `;}` 结尾，声明部分非空）。
 *   直接相邻 + 逐字相同 ⇒ 第二行只能是生成残片（合法 CSS 中同一选择器缩进的
 *   相邻两行不可能既是不同规则又开始于同一声明文本——中间必有选择器行）。
 *
 * @param {string} source CSS/LESS 文本（.less 全文或 SFC `<style>` 块）
 * @returns {string} 修复后文本（无命中时原样返回，引用相等）
 */
export function normalizeDuplicatedCompressedClosers(source) {
  if (typeof source !== 'string' || source.indexOf(';}') < 0) return source;
  const lines = source.split('\n');
  let changed = false;
  for (let i = 0; i < lines.length - 1; i++) {
    const a = lines[i];
    const b = lines[i + 1];
    if (a.trim() !== b.trim()) continue;
    const trimmed = a.trim();
    // 形态：`声明;}` —— 以 `;}` 收尾且声明部分非空（排除纯 `}` / `;}` 空声明）
    if (!trimmed.endsWith(';}')) continue;
    const decl = trimmed.slice(0, -1); // 去掉末尾 `}`（保留 `;`）
    if (!decl.trim().endsWith(';') || decl.trim().length === 0) continue;
    // 修复：残片 A 展开（声明保留在最内层块）→ `DECL` + `}`（闭内层）+ `}`（闭外层）。
    // 原两行各带一个 `}`（共 2 个），修复后 `}` 数不变（`  }` + `}`），括号计数严格守恒。
    const indentA = a.slice(0, a.length - a.trimStart().length);
    const indentB = b.slice(0, b.length - b.trimStart().length);
    lines[i] = `${indentA}${decl}`;
    lines.splice(i + 1, 1, `${indentB}}`, '}');
    changed = true;
    // 不跳号：i+1 位置已变为 `}`，继续 for 会与下一行比较（`}` vs 下一行），
    // 天然不满足判据 ⇒ 无需额外游标管理。
  }
  return changed ? lines.join('\n') : source;
}

/**
 * 刀 26：`<script>` 区段内「整行只有逗号」残片删除。
 *
 * 病灶（真实片段）：
 *   productModel: '',
 *   ,                  ← 整行只有逗号 → Unexpected token
 *   shadowTime: '5',
 *
 * 判据（命名无关、保守）：
 *   ① 仅处理 `<script ...>...</script>` 区段（.vue）；纯 .js 文件按全文处理；
 *   ② 行去空白后**恰为一个 `,`** —— 字符串行（`','`）天然不命中；
 *   ③ **上一行以 `,` 结尾**（前一项已闭合，此逗号必为残片）——避免误删
 *      数组挖洞 `[1,\n,\n2]` 的合法语义（该写法生成器本就不该产出，且修复方向即用户意图）。
 *
 * @param {string} source SFC / JS 全文
 * @returns {string} 修复后文本（无命中时原样返回，引用相等）
 */
export function stripLoneCommaLines(source) {
  if (typeof source !== 'string' || source.indexOf(',') < 0) return source;
  const isSfc = /<script[\s>]/i.test(source) && /<\/script>/i.test(source);

  const fixBlock = (block) => {
    const lines = block.split('\n');
    let changed = false;
    for (let i = 1; i < lines.length; i++) {
      if (!/^\s*,\s*$/.test(lines[i])) continue;
      if (!/,\s*$/.test(lines[i - 1] || '')) continue;
      lines.splice(i, 1);
      changed = true;
      i -= 1; // 删除后原地复核（连续多行残片）
    }
    return changed ? lines.join('\n') : block;
  };

  if (!isSfc) return fixBlock(source);

  return source.replace(
    /(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi,
    (full, open, body, close) => {
      const fixed = fixBlock(body);
      return fixed === body ? full : open + fixed + close;
    },
  );
}

/**
 * 刀 27：v-for 列表容器「横向排列」确定性纠偏。
 *
 * 背景（2026-10-12 · mc-1791783806265-5831962c 实锤）：节点列表容器被写成
 * `display:flex; flex-direction:row; justify-content:space-between`，其内 v-for 的
 * 节点卡片 `width:100%` → 所有卡片横向排开、仅首卡可见（overflow-x:hidden 裁掉其余）。
 * 设计语义为纵向列表。
 *
 * 判据（命名无关、跨模板+CSS 局部可判）：
 *   ① 模板中带 `v-for` 的元素（列表项），其类 Card 的规则含 `width` ≥90%；
 *   ② 该元素的**父容器**类 List（标签栈解析，自闭合/void 元素不入栈）的规则块含
 *      `display:flex` 与显式 `flex-direction: row`。
 *   两者同时成立 ⇒ row 与子项满宽自相矛盾（row 下子项 100% 宽必然横向溢出/裁切）。
 *
 * 修复（改父容器 List 块）：`flex-direction: row → column`；同块
 *   `justify-content: space-between → flex-start`（column 下 space-between 会把卡片
 *   纵向拉开）、`align-items: center → stretch`（保证子卡满宽）。
 *   幂等：修后显式 row 不再存在。
 *
 * 2026-10-13 增强（mc-1791885185329-7e7fce94 实锤）：容器块嵌 `&::-webkit-scrollbar`
 *   等装饰性子规则时，旧「含嵌套一律跳过」策略导致整块失明 → 判据升级为**嵌套掩码**：
 *   嵌套区域等长替换为空格，只对顶层声明做判定与替换——嵌套子规则的 width 不再误算
 *   （从根上根治 c-8bb771-tab 误伤），装饰嵌套容器也能命中。
 *
 * @param {Record<string,string>} files 产物文件集（path → content）
 * @returns {{ files: Record<string,string>, changes: Array<{file: string, cls: string}> }}
 */
export function normalizeVForRowListDirection(files) {
  const changes = [];
  if (!files || typeof files !== 'object') return { files, changes };
  const out = { ...files };

  // ① 扫每个 .vue 模板：标签栈解析，收集 (v-for 列表项类, 父容器类)
  const pairs = []; // { file, itemCls, parentCls }
  for (const [fp, fc] of Object.entries(out)) {
    if (!fp.endsWith('.vue') || typeof fc !== 'string') continue;
    // 🔒 深度感知提取根模板：lazy 正则被 `<template #slot>` 具名插槽截断
    //   （2026-10-14 · base-panel 产物 index.vue 实锤，刀 28 同病灶已修）
    const rt = extractRootTemplate(fc);
    if (!rt) continue;
    const body = rt.tpl;
    const stack = []; // 每层 { classes }
    for (const tag of body.matchAll(/<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>])*?)(\/?)>/g)) {
      const [, closing, tagName, attrs, selfClose] = tag;
      const isVoid = /^(img|br|hr|input|meta|link|source|area|base|col|embed|track|wbr)$/i.test(tagName);
      if (closing) {
        stack.pop();
        continue;
      }
      const clsMatch = attrs.match(/\sclass="([^"]+)"/);
      const classes = clsMatch ? clsMatch[1].split(/\s+/).filter(Boolean) : [];
      if (!selfClose && !isVoid) {
        // v-for 命中：父容器 = 栈顶（当前已打开的最内层容器）
        if (/\bv-for\b/.test(attrs) && classes.length > 0 && stack.length > 0) {
          const parent = stack[stack.length - 1];
          if (parent.classes.length > 0) {
            pairs.push({
              file: fp,
              itemCls: classes,
              parentCls: parent.classes,
            });
          }
        }
        stack.push({ classes });
      } else if (/\bv-for\b/.test(attrs) && classes.length > 0 && stack.length > 0) {
        // 自闭合 v-for 元素（罕见）：父容器同为栈顶
        const parent = stack[stack.length - 1];
        if (parent.classes.length > 0) {
          pairs.push({ file: fp, itemCls: classes, parentCls: parent.classes });
        }
      }
    }
  }
  if (pairs.length === 0) return { files: out, changes };

  // ②③ CSS 侧判定 + 修复（改父容器块）
  const cssPaths = Object.keys(out).filter(
    (p) => /\.(less|css)$/i.test(p) && typeof out[p] === 'string',
  );
  // 大括号配对提取完整规则块。返回 null = 无该类规则。
  // 🔒 判据只看**顶层声明**：嵌套掩码把块内嵌套子规则区域替换为等长空格（长度保持 ⇒
  //    索引不变），嵌套子规则的 width/flex-direction 不会误算进父块——从根上根治
  //    c-8bb771-tab 误伤（取代旧「含嵌套一律跳过」的保守策略）。
  //    同时容器块带 `&::-webkit-scrollbar` 等装饰嵌套不再失明（2026-10-13 ·
  //    mc-1791885185329-7e7fce94 实锤：父容器嵌滚动条装饰 → 整块被跳过 → 刀 27 失效）。
  const maskNested = (raw) => {
    const arr = raw.split('');
    let depth = 0;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (ch === '{') {
        depth++;
        arr[i] = ' ';
        continue;
      }
      if (ch === '}') {
        depth--;
        arr[i] = ' ';
        continue;
      }
      if (depth > 0) arr[i] = ' ';
    }
    return arr.join('');
  };
  // 顶层区间内的定向替换：在 masked 上 matchAll（等长掩码 ⇒ 索引即 raw 索引），
  // 再回写 raw 对应切片——嵌套子规则内容不受影响。
  const replaceTopLevel = (raw, re, repl) => {
    const masked = maskNested(raw);
    const gre = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    let outStr = '';
    let last = 0;
    for (const m of masked.matchAll(gre)) {
      outStr += raw.slice(last, m.index) + repl;
      last = m.index + m[0].length;
    }
    return outStr + raw.slice(last);
  };
  const findBlock = (css, cls) => {
    const esc = cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const head = css.match(new RegExp(`(^|[^\\w-])\\.${esc}\\s*\\{`));
    if (!head) return null;
    const start = head.index + head[0].length;
    let depth = 1;
    let i = start;
    while (i < css.length && depth > 0) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') depth--;
      i++;
    }
    if (depth !== 0) return null; // 括号不平衡：交给下游门禁
    const close = i - 1;
    const raw = css.slice(start, close);
    return { start, close, block: raw, masked: maskNested(raw) };
  };
  for (const { itemCls, parentCls } of pairs) {
    // 列表项满宽判据：v-for 元素任一类**顶层声明**含 width ≥90%（absolute 脱流子项排除
    // ——其布局与容器 flex-direction 无关，如 env-monitor 绝对定位 tab 滑块；嵌套子规则
    // 的 width 不参与判定——masked 已剔除）
    const itemFullWidth = (css) =>
      itemCls.some((c) => {
        const b = findBlock(css, c);
        if (!b) return false;
        if (/position\s*:\s*absolute/i.test(b.masked)) return false;
        const wm = b.masked.match(/width\s*:\s*([\d.]+)%/);
        return !!wm && parseFloat(wm[1]) >= 90;
      });
    for (const cp of cssPaths) {
      const css = out[cp];
      // 🔒 该 css 无满宽子项 → 看下一个 css（2026-10-14 · mc-max-1791942831818-0397a327
      //    实锤：cssPaths 首个文件常是只含 @import 的 index.less，旧 `break` 把整条
      //    扫描杀掉，判据变成文件顺序依赖的掷骰子）
      if (!itemFullWidth(css)) continue;
      for (const pc of parentCls) {
        const blk = findBlock(css, pc);
        if (!blk) continue;
        if (!/display\s*:\s*flex/i.test(blk.masked)) continue;
        if (!/flex-direction\s*:\s*row/i.test(blk.masked)) continue;
        let next = replaceTopLevel(
          blk.block,
          /flex-direction\s*:\s*row/i,
          'flex-direction: column',
        );
        next = replaceTopLevel(
          next,
          /justify-content\s*:\s*space-between/i,
          'justify-content: flex-start',
        );
        next = replaceTopLevel(
          next,
          /align-items\s*:\s*center/i,
          'align-items: stretch',
        );
        if (next !== blk.block) {
          out[cp] = css.slice(0, blk.start) + next + css.slice(blk.close);
          changes.push({ file: cp, cls: pc });
        }
        break;
      }
      if (changes.some((c) => c.file === cp)) break;
    }
  }
  return { files: out, changes };
}

/**
 * 组合入口：对单个文件内容按类型应用修复器。
 * - .less / .css 全文：刀 25；
 * - .vue：`<style>` 块刀 25 + `<script>` 块刀 26；
 * - 其它（.js 等）：刀 26 全文。
 *
 * @param {string} path 产物相对路径（仅用扩展名分流，命名无关）
 * @param {string} content 文件内容
 * @returns {{ content: string, lessFixed: boolean, commaFixed: boolean }}
 */
export function healStyleFragments(path, content) {
  const res = { content, lessFixed: false, commaFixed: false };
  if (typeof content !== 'string' || content.length === 0) return res;
  const lower = String(path || '').toLowerCase();

  if (lower.endsWith('.less') || lower.endsWith('.css')) {
    const fixed = normalizeDuplicatedCompressedClosers(content);
    if (fixed !== content) {
      res.content = fixed;
      res.lessFixed = true;
    }
    return res;
  }

  if (lower.endsWith('.vue')) {
    let out = content;
    // 刀 25 → `<style>` 块（含 lang 属性的 scoped less）
    out = out.replace(
      /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi,
      (full, open, body, close) => {
        const fixed = normalizeDuplicatedCompressedClosers(body);
        return fixed === body ? full : open + fixed + close;
      },
    );
    // 刀 26 → `<script>` 块
    const next = stripLoneCommaLines(out);
    if (next !== out) {
      res.commaFixed = true;
      out = next;
    }
    if (out !== content) res.lessFixed = res.lessFixed || out !== content;
    res.content = out;
    return res;
  }

  // 其余文本文件（.js 等）：仅刀 26
  const fixed = stripLoneCommaLines(content);
  if (fixed !== content) {
    res.content = fixed;
    res.commaFixed = true;
  }
  return res;
}

export default healStyleFragments;
