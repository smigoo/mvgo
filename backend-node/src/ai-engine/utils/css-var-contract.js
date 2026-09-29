/**
 * CSS 变量名契约（微码组件）
 *
 * ══════════════════════════════════════════════════════════════
 * 契约的唯一事实源
 * ══════════════════════════════════════════════════════════════
 * `frontend/src/core/microcode/utils.js#getCssVarsConfig`：
 *
 *     const prefix = '--'
 *     const stylesKey = prefix + key        // key = css-vars.js 的键名，**原样拼接**
 *     cssConfig.styles[stylesKey] = ...
 *
 * ⇒ 注入的 CSS 变量名 = `--` + 键名（**不做 kebab 转换**）
 * ⇒ `var(--colorPrimary)` 命中；`var(--color-primary)` **永不命中**。
 *
 * 键名来源（确定性）：`resources/config/css-vars.js` 由
 * `file-writer.js#buildCssVarsFile` 生成，键名为 camelCase
 * （colorTextBase / colorPrimary / colorPrimaryBg / fontWeightStrong / fontSize …）。
 *
 * ══════════════════════════════════════════════════════════════
 * 实况（2026-09-29 · c-traffic-monitor-209472ff 实锤）
 * ══════════════════════════════════════════════════════════════
 * 全语料 467 产物离线审计（367 个目录样本，29,497 条 `var()` 引用）：
 *
 *   名字合法（驼峰，命中）     25,679   87.1%
 *   kebab 可确定性归一            464    1.6%   ← 本模块修的就是这一档
 *   归一后仍无定义              3,354   11.4%   ← 另一类问题（不在本模块职责内）
 *
 * kebab 分布（TOP）：`--color-primary` / `--color-text-base` / `--color-success` /
 * `--color-danger` / `--color-border` / `--color-warning` / `--font-weight-strong`
 * —— **全部是框架预设键的 kebab 写法**，归一后 100% 命中。
 *
 * 症状：变量命中不了 ⇒ 静默回落 LLM 自己写的 fallback ⇒ 表现为
 * 「颜色/字重不对，且**不随主题切换**」。
 * `c-traffic-monitor-209472ff` 的 `var(--color-primary, #00cccc)` 即此形态：
 * 激活 tab 的 Figma 真值是 `#ffffff`、链接是 `#1990ff`，实际全部渲染为
 * LLM 臆造的 fallback `#00cccc`（青）。
 */

/** kebab-case → camelCase（仅用于 CSS 变量名场景） */
export function cssVarKebabToCamel(name) {
  return String(name || '').replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
}

/**
 * 从 css-vars.js 源码中提取键名集合。
 * 只认「对象字面量里两空格以上缩进的 `key:`」——与 `buildCssVarsObjectBody`
 * 的输出格式（`  key: 'value',`）同源，避免把注释/字符串里的 `xx:` 误收。
 * @param {string} cssVarsSource css-vars.js 文件内容
 * @returns {Set<string>}
 */
export function extractCssVarKeys(cssVarsSource) {
  const keys = new Set();
  if (typeof cssVarsSource !== 'string' || !cssVarsSource) return keys;
  for (const m of cssVarsSource.matchAll(/^\s{2,}([A-Za-z][A-Za-z0-9_]*)\s*:/gm)) {
    keys.add(m[1]);
  }
  return keys;
}

/** 引用 CSS 变量的正则（只吃到变量名，fallback 部分原样保留） */
const CSS_VAR_REF_RE = /var\(\s*--([A-Za-z0-9_-]+)/g;

/**
 * 🛡️ CSS 变量名契约归一（kebab → camel，fail-closed）
 *
 * 动作：把 `var(--color-primary)` 这类 **kebab 写法**归一为 `var(--colorPrimary)`，
 * **当且仅当**归一后的名字确实存在于该产物的 css-vars 键集合中。
 *
 * 硬约束：
 *  - **fail-closed**：归一后仍不存在 ⇒ 原样保留（不猜、不新建变量、不动 fallback）。
 *    未定义变量的处理是另一类问题，不在本模块职责内。
 *  - **幂等**：已是 camel 的名字直接跳过；重复执行零改动。
 *  - **只改变量名**，fallback 原样保留 —— 变量命中后 fallback 不再被求值，
 *    且不得由本模块臆造色值（杜绝硬编码）。
 *  - 无 css-vars 键集合 ⇒ 零改动（不猜）。
 *
 * @param {Object<string,string>} files 产物文件表（原地更新命中的文件）
 * @param {Set<string>} [cssVarKeys] 键集合；缺省时从 files 里的
 *        `resources/config/css-vars.js` 解析（该文件由 buildCssVarsFile 确定性生成、必在 files 内）
 * @returns {{ applied: boolean, details: { files: string[], renamed: Array<{from:string,to:string,count:number}> } | null }}
 */
export function normalizeCssVarNames(files, cssVarKeys = null) {
  if (!files || typeof files !== 'object') return { applied: false, details: null };

  let keys = cssVarKeys;
  if (!(keys instanceof Set) || keys.size === 0) {
    keys = extractCssVarKeys(files['resources/config/css-vars.js']);
  }
  // 拿不到契约键集合 ⇒ 无法判定 ⇒ 零改动（宁漏不误伤）
  if (!keys || keys.size === 0) return { applied: false, details: null };

  const changed = [];
  const renamedCount = new Map(); // `--old` → { to, count }

  for (const [fp, code] of Object.entries(files)) {
    if (!/\.(vue|less|css)$/i.test(fp) || typeof code !== 'string') continue;
    if (!code.includes('var(--')) continue;

    let hit = 0;
    const out = code.replace(CSS_VAR_REF_RE, (full, name) => {
      // ① 名字已合法（camel 且命中）⇒ 幂等跳过
      if (keys.has(name)) return full;
      // ② 非 kebab 形态 ⇒ 不猜（`--xxx` / `--colorTextPrimary` 一类交给别的规则）
      if (!name.includes('-')) return full;
      const camel = cssVarKebabToCamel(name);
      // ③ fail-closed：归一后仍不存在 ⇒ 原样保留
      if (!keys.has(camel)) return full;

      hit++;
      const rec = renamedCount.get(`--${name}`) || { to: `--${camel}`, count: 0 };
      rec.count++;
      renamedCount.set(`--${name}`, rec);
      return `var(--${camel}`;
    });

    if (hit > 0) {
      files[fp] = out;
      changed.push(`${fp}(${hit})`);
    }
  }

  if (changed.length === 0) return { applied: false, details: null };

  const renamed = [...renamedCount.entries()]
    .map(([from, v]) => ({ from, to: v.to, count: v.count }))
    .sort((a, b) => b.count - a.count);

  return {
    applied: true,
    details: { files: changed, renamed },
  };
}
