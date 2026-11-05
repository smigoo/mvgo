/**
 * @file class-prefix-fixer.js — 🛡️ 层③（2026-09-11）：模板类名统一补前缀（CODE-020 确定性自愈）。
 *
 * 根因（P0-6 实锤）：模板 class 写了 `c-device-monitor-tab-item`（漏组件前缀），而 common.less
 * 里是 `.c-device-monitor-0quu3hqa-c-device-monitor-tab-item` → 选择器不命中、整块样式失效。
 * CODE-020 门禁只「报错 + 重试」，LLM 重试反复犯同一错 → BLOCK 耗尽。此处按确定性自愈原则
 * 在落盘前直接改写：模板类名 → CSS 里的唯一后缀命中形态（补回漏掉的前缀）。
 *
 * 判据与 CODE-020（findUndefinedComponentClasses）严格同口径：
 *   - 只处理 c- 开头组件类；豁免 c-mc-max- / c-mc-；
 *   - CSS（*.less）精确存在 → 不动；
 *   - 存在「`xxx-{cls}`」后缀命中 → 改写为该命中值（多个候选取最短、再字典序，确定性）；
 *   - 连后缀都没有（figma 节点名占位类）→ 不动（与门禁口径一致，不报也不改）。
 *
 * 「已定义」集合 = 所有 *.less 中的 `.cls` ∪ 各 .vue 自有 `<style>` 块中的 `.cls`
 * （scoped 自有样式同样是合法定义，改写反而会破坏样式绑定）。
 *
 * 幂等：改写后模板类名即 CSS 精确命中，重复调用零副作用。只改写 .vue 文件，不碰 .less。
 */

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

import { extractSfcTemplate } from './sfc-template-extractor.js';
import { resolveDomClass } from './class-facts.js';

function toList(files) {
  if (Array.isArray(files)) return files;
  if (files && typeof files === 'object') {
    return Object.entries(files).map(([path, content]) => ({ path, content }));
  }
  return [];
}

export function fixMissingClassPrefixes(files = [], options = {}) {
  const list = toList(files);
  const fixes = [];
  // 🛡️ P1.3（2026-09-11）：类事实驱动（DOM 为唯一判据）。旧路径「样式源里出现过就算已定义」
  // 对**修饰符类**天然失效：样式用 LESS 嵌套 `&--active` 表达时，嵌套展开后的完整类名
  // 从未出现在任何样式文本里 → suffix-hit 找不到候选 → 模板里的无前缀修饰符类永不修正
  // （1afdb842 实测：fixMissingClassPrefixes = 0 fixes，而 DOM 基类带前缀）。
  // 现优先用 classFacts.resolveDomClass：DOM 有对应形态（含 base+suffix 重组）则整 token 对齐。
  const facts = options.classFacts || null;

  // 1. 收集「已定义」类名：*.less + 各 .vue 自有 <style> 块
  const defined = new Set();
  const collectClasses = (css) => {
    for (const m of String(css || '').matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) {
      defined.add(m[1]);
    }
  };
  for (const f of list) {
    const p = String(f?.path || '');
    const c = f?.content;
    if (typeof c !== 'string') continue;
    if (/\.less$/i.test(p)) {
      collectClasses(c);
    } else if (/\.vue$/i.test(p)) {
      for (const sm of c.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
        collectClasses(sm[1]);
      }
    }
  }
  if (defined.size === 0) return { files: list, fixes };

  // 2. 模板里未定义的 c- 组件类 → 找后缀命中，建立改写映射
  const definedArr = [...defined];
  const remap = new Map();
  for (const f of list) {
    const p = String(f?.path || '');
    if (!/\.vue$/i.test(p) || typeof f?.content !== 'string') continue;
    // 🛡️ 2026-09-11（P1.3）：模板区提取统一用共享边界法（lazy `</template>` 会被具名插槽
    // 提前截断，插槽后的模板类全部看不见 → 漏补前缀）。同时保证「修饰符类整 token 处理」：
    // token 正则含 `[\w-]*` 会整体捕获 `c-x-tab-item--active`，本函数从不做局部前缀拼接。
    const tplBody = extractSfcTemplate(f.content);
    if (!tplBody) continue;
    for (const m of tplBody.matchAll(/(?<![\w-])(c-[A-Za-z0-9][\w-]*)/g)) {
      const cls = m[1];
      if (cls.startsWith('c-mc-max-') || cls.startsWith('c-mc-')) continue;
      if (remap.has(cls)) continue;
      // ① facts 驱动（首选）：DOM 形态对齐（含修饰符 base+suffix 重组）
      const fact = facts?.byFile?.[p];
      if (fact) {
        const resolved = resolveDomClass(fact, cls);
        if (resolved?.variants?.length) {
          // 多形态（长短并存）：优先样式里已定义者，其次按长度稳定取第一个
          const pick =
            resolved.variants.find((v) => defined.has(v)) ||
            [...resolved.variants].sort((a, b) => b.length - a.length)[0];
          if (pick && pick !== cls) remap.set(cls, pick);
          continue;
        }
        // facts 命中不到 → 该 token 在 DOM 不存在：保持原有 suffix 兜底语义（下方）
      }
      // ② 兜底（无 facts / facts 无该 token）：旧 suffix-hit 语义
      if (defined.has(cls)) continue;
      const suffix = `-${cls}`;
      const candidates = definedArr
        .filter((d) => d.endsWith(suffix))
        .sort((a, b) => a.length - b.length || a.localeCompare(b));
      if (candidates.length > 0) remap.set(cls, candidates[0]);
    }
  }
  if (remap.size === 0) return { files: list, fixes };

  // 3. 改写（模板 + script 字符串引用同步，保持动态 :class 一致；style 块已含原类名则不会进 remap）
  const out = list.map((f) => ({ path: f?.path, content: f?.content }));
  for (const f of out) {
    if (!/\.vue$/i.test(String(f.path)) || typeof f.content !== 'string') continue;
    let content = f.content;
    for (const [cls, rep] of remap) {
      const re = new RegExp(`(?<![\\w-])${escapeRe(cls)}(?![\\w-])`, 'g');
      if (re.test(content)) {
        content = content.replace(new RegExp(`(?<![\\w-])${escapeRe(cls)}(?![\\w-])`, 'g'), rep);
        fixes.push({ path: f.path, from: cls, to: rep });
      }
    }
    f.content = content;
  }
  return { files: out, fixes };
}
