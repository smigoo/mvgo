/**
 * 🧩 internalSubcomponents props 契约注入（2026-11-06 · mc-max-1793921632778-90eae287 实锤）
 *
 * ## 病灶（三段断链）
 * planner 已产出 `internalSubcomponents[].props = ['chartData','chartConfig']`（R1 图表隔离），
 * 但：① prompt 只列 prop 名字、不给数据源；② 父组件标签 `<TunnelChartSection class="…" />`
 * 一个 prop 都不传；③ 子组件 `const cfg = props.chartConfig || {}` ⇒ `series=[]` ⇒ 只有坐标轴没有柱子。
 *
 * ## 本模块职责（确定性兜底 · 端无关纯函数）
 * 对「产物里**真的**声明了 chartConfig 的子组件」补上父→子绑定：
 *  · 契约来源 = 子组件自身 `defineProps`（产物事实，不新建口径）
 *  · 数据来源 = plan 的 `internalSubcomponents`（chartType / series / categories），**缺失即不造**
 *  · 幂等：标签已有 `:chart-config` 直接跳过
 *  · 冲突：常量名与文件内既有标识符撞名 ⇒ 加数字后缀
 *
 * ## 宁空勿造（用户裁决 2026-11-06）
 * `chartData` **仅在 series 真值存在时**注入；真值缺失只注入结构 config（type 来自 @echarts 结构识别），
 * 并计 `dataMissing`。**绝不**用占位数字/随机数填充 —— 那等于编造真值。
 */

const TAG_RX = /<([A-Z][A-Za-z0-9]*)((?:"[^"]*"|'[^']*'|[^>"'])*)\/?>/g;

/** 取 `<script setup>` 区内容区间（含 setup 优先，回退首个 script）。 */
export function findScriptBlock(content) {
  const setup = /<script\b[^>]*\bsetup\b[^>]*>([\s\S]*?)<\/script>/i.exec(content);
  if (setup) {
    const start = setup.index + setup[0].indexOf('>') + 1;
    return { start, end: start + setup[1].length, content: setup[1] };
  }
  const plain = /<script\b[^>]*>([\s\S]*?)<\/script>/i.exec(content);
  if (!plain) return null;
  const start = plain.index + plain[0].indexOf('>') + 1;
  return { start, end: start + plain[1].length, content: plain[1] };
}

/** 解析 `defineProps({...})` 的顶层键名（对象字面量形态；数组形态同样支持）。 */
export function extractDefinePropNames(content) {
  const names = new Set();
  const text = typeof content === 'string' ? content : '';
  // 🔴 必须用**配平扫描**取对象字面量：非贪婪 `\}\s*\)` 会在 `default: () => ({})` 处提前收口
  //   （真机 TunnelChartSection 就是这种写法 ⇒ legendConfig 等后排 key 全丢）。
  const objHead = /defineProps\s*\(\s*\{/.exec(text);
  if (objHead) {
    const open = text.indexOf('{', objHead.index);
    let depth = 0;
    let end = -1;
    for (let i = open; i < text.length; i += 1) {
      const ch = text[i];
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    const body = end > open ? text.slice(open + 1, end) : '';
    // 顶层 key：行首浅缩进 + 标识符 + 冒号（嵌套键缩进更深，天然被跳过）
    for (const m of body.matchAll(/^\s{0,4}([A-Za-z_$][\w$]*)\s*:/gm)) names.add(m[1]);
    if (names.size > 0) return names;
  }
  const arr = /defineProps\s*\(\s*\[([\s\S]*?)\]\s*\)/.exec(text);
  if (arr) {
    for (const m of arr[1].matchAll(/['"]([A-Za-z_$][\w$]*)['"]/g)) names.add(m[1]);
  }
  return names;
}

/** 本地组件 import 映射：tagName → 相对路径（`./X.vue`）。 */
export function collectLocalComponentImports(content) {
  const map = new Map();
  for (const m of String(content || '').matchAll(
    /import\s+([A-Z][A-Za-z0-9]*)\s+from\s+['"](\.\/[^'"]+\.vue)['"]/g,
  )) {
    map.set(m[1], m[2]);
  }
  return map;
}

function camelTag(tag) {
  return String(tag || '').replace(/^[A-Z]/, (c) => c.toLowerCase());
}

function tagHasBinding(attrs, prop) {
  return new RegExp(`:\\s*${prop}\\s*=|v-bind\\s*=|v-bind:${prop}\\s*=`).test(attrs);
}

function toKebab(s) {
  return String(s).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

/**
 * 主入口：为「声明了 chartConfig 的子组件标签」补父→子绑定。
 *
 * @param {Object<string,string>} files 产物文件表（原地修改）
 * @param {Array} internalSubs plan 的 internalSubcomponents 扁平集合（含 chartType/series/categories）
 * @param {{logger?:object}} [options]
 * @returns {{subs:number, declared:number, bound:number, injected:number, conflict:number, dataMissing:number, unmatched:number, unboundAfter:number}}
 */
export function injectChartSubProps(files, internalSubs, options = {}) {
  const stats = {
    subs: 0,
    declared: 0,
    bound: 0,
    injected: 0,
    conflict: 0,
    dataMissing: 0,
    unmatched: 0,
    unboundAfter: 0,
  };
  if (!files || typeof files !== 'object') return stats;

  const subs = (Array.isArray(internalSubs) ? internalSubs : []).filter(
    (s) => s && (s.type === 'chart-component' || s.chartType) && s.chartType !== undefined,
  );
  if (subs.length === 0) return stats;
  const pool = subs.map((s) => ({ ...s, used: false }));

  const takeSub = (childProps) => {
    // 优先同类型（子组件若声明了 chartType 默认值则先比它）
    const want = String(childProps.chartTypeHint || '').toLowerCase();
    let hit = want ? pool.find((p) => !p.used && String(p.chartType).toLowerCase() === want) : null;
    if (!hit) hit = pool.find((p) => !p.used);
    if (hit) hit.used = true;
    return hit || null;
  };

  for (const [path, content] of Object.entries(files)) {
    if (!/\.vue$/i.test(path) || typeof content !== 'string') continue;
    const imports = collectLocalComponentImports(content);
    if (imports.size === 0) continue;

    const edits = [];
    const consts = [];
    TAG_RX.lastIndex = 0;
    let tm;
    while ((tm = TAG_RX.exec(content)) !== null) {
      const tag = tm[1];
      if (!imports.has(tag)) continue;
      const attrs = tm[2] || '';
      stats.subs += 1;
      const childRel = imports.get(tag).replace(/^\.\//, '');
      const childPath = path.replace(/[^/]+$/, childRel);
      const childContent = files[childPath];
      if (typeof childContent !== 'string') continue;
      const childPropNames = extractDefinePropNames(childContent);
      if (!childPropNames.has('chartConfig')) continue; // 不是图表子组件 ⇒ 不碰
      stats.declared += 1;
      if (tagHasBinding(attrs, 'chart-config')) {
        stats.bound += 1;
        continue;
      }

      const sub = takeSub({
        chartTypeHint: (/(?:chartType|type)\s*:\s*['"]([a-z]+)['"]/.exec(childContent) || [])[1] || '',
      });
      if (!sub) {
        stats.unmatched += 1;
        continue;
      }

      // 常量名：<tagCamel>ChartConfig，撞名加后缀
      let base = `${camelTag(tag)}ChartConfig`;
      let name = base;
      let n = 2;
      while (new RegExp(`\\b${name}\\b`).test(content)) {
        name = `${base}${n}`;
        n += 1;
        if (n > 9) break;
      }
      if (name !== base) stats.conflict += 1;

      const series = Array.isArray(sub.series) ? sub.series : [];
      const categories = Array.isArray(sub.categories) ? sub.categories : [];
      const cfgParts = [`type: '${String(sub.chartType || 'bar').toLowerCase()}'`];
      if (series.length > 0) cfgParts.push(`series: ${JSON.stringify(series)}`);
      if (categories.length > 0) cfgParts.push(`categories: ${JSON.stringify(categories)}`);
      const colors = Array.isArray(sub.seriesColors) ? sub.seriesColors : [];
      if (colors.length > 0) cfgParts.push(`colors: ${JSON.stringify(colors)}`);
      consts.push(`const ${name} = { ${cfgParts.join(', ')} }`);

      const extra = [];
      if (childPropNames.has('chartData')) {
        if (series.length > 0) {
          const dataName = `${camelTag(tag)}ChartData`;
          consts.push(`const ${dataName} = ${JSON.stringify(series)}`);
          extra.push(`:chart-data="${dataName}"`);
        } else {
          // 宁空勿造：有契约无真值 ⇒ 不注入数据，显式计数
          stats.dataMissing += 1;
        }
      }

      const bindings = [`      :chart-config="${name}"`, ...extra.map((e) => `      ${e}`)].join('\n');
      // 🔴 2026-11-06（070cfc74 真机回滚实锤）：自闭合标签的尾部 `/` 会被 TAG_RX 归进 attrs
      //   （` class="cf" /`），重组时再补 `/>` ⇒ 双斜杠 ⇒ `Illegal '/' in tags` ⇒ 注入被整体回滚。
      //   重组前必须剥掉 attrs 尾部的自闭合斜杠。
      const attrsClean = attrs.trim().replace(/\/+\s*$/, '').trim();
      const newTag = `<${tag}\n${bindings}${attrsClean ? `\n      ${attrsClean}` : ''}\n    />`;
      edits.push({ start: tm.index, end: tm.index + tm[0].length, text: newTag });
      stats.injected += 1;
    }

    if (edits.length === 0) continue;
    let next = content;
    for (let i = edits.length - 1; i >= 0; i -= 1) {
      const e = edits[i];
      next = `${next.slice(0, e.start)}${e.text}${next.slice(e.end)}`;
    }
    const script = findScriptBlock(next);
    if (!script) continue; // 无 script ⇒ 不敢改（fail-open，不改坏）
    const inject = `\n// 🧩 内部子组件 props 契约（系统注入 · 数据真值缺失时不注入 chart-data）\n${consts.join('\n')}\n`;
    const withConsts = `${next.slice(0, script.end)}${inject}${next.slice(script.end)}`;
    files[path] = withConsts;
    options.logger?.info?.('🧩 内部子组件 props 契约注入', {
      file: path,
      injected: stats.injected,
    });
  }

  stats.unboundAfter = Math.max(0, stats.declared - stats.bound - stats.injected);
  return stats;
}

/** 该 tag 是否是图表子组件（供外部快速判定/测试）。 */
export function isChartSubTag(files, path, tag) {
  const imports = collectLocalComponentImports(files[path] || '');
  const rel = imports.get(tag);
  if (!rel) return false;
  const childPath = path.replace(/[^/]+$/, rel.replace(/^\.\//, ''));
  return extractDefinePropNames(files[childPath] || '').has('chartConfig');
}

export { toKebab };
