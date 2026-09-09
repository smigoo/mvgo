/**
 * 🛡️ 文本兄弟顺序保真（TEXT-001 / N4c，2026-09-01）
 *
 * 事故实证 mc-max-1788251680480-98c9140b（A/B 修复后首个一次通过样本）：
 * Figma tabs-list 的 4 个 TEXT 子节点——
 *   视觉 x 序：一氧化碳(1509.8) → 能见度(1586.6) → 洞内照明(1645) → 洞外光强(1717)
 *   children 数组序：一氧化碳 → 洞内照明 → 洞外光强 → 能见度（≠视觉序！图层顺序≠视觉顺序）
 *   产物 tabs 数组序 = children 序 → 「能见度」从视觉第 2 位掉到末位。
 * 文案全部正确、只有顺序错 → DO-NOT-INVENT-TEXT / ELEMENT 覆盖率全部放行（盲区）。
 *
 * 本模块是文本顺序的**唯一真相源**（三处消费，不新增并行实现）：
 *   ① code-fix-rules「fix-text-sibling-order」（fixTextOrderDrift，生成侧 N4c 自愈）
 *   ② code-structure-validator TEXT-001 BLOCK（detectTextOrderDrift，fail-closed 兜底）
 *   ③ spec 回归测试
 *
 * 事实源 = 同一父容器下 TEXT 直接子节点的**视觉坐标排序**（水平组按 x、垂直组按 y），
 * 不用 children 数组序——本事故样本自身即「图层序≠视觉序」的反例。
 *
 * 防误伤约束（宁可漏报，不可误伤）：
 *   - 组内文本必须互不相同（重复文本无法建立一一映射）
 *   - 每个文本 trim 后长度 ≥ 2 且非空
 *   - 产物侧只处理「文本多重集合完全相等」的组（部分匹配=别的区块，忽略）
 *   - 修复仅在结构完全可判定时执行（数组元素数=文本数、每元素恰含一个组文本；
 *     template 静态元素每文本唯一出现），否则保留 drift 给门禁
 */

/** 转义正则元字符 */
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 从 figmaNodeData 收集「TEXT 兄弟组」：同一父容器的 ≥2 个直接 TEXT 子节点，
 * 按视觉坐标排序（x 跨度 > y 跨度 → 水平组按 x 升序；否则垂直组按 y 升序）。
 *
 * @param {object} figmaNodeData Figma 节点树（{ document } 或根节点）
 * @returns {Array<{parentName: string, direction: 'horizontal'|'vertical', orderedTexts: string[]}>}
 */
export function collectFigmaTextSiblingGroups(figmaNodeData) {
  const groups = [];
  if (!figmaNodeData || typeof figmaNodeData !== 'object') return groups;

  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    const children = Array.isArray(node.children) ? node.children : [];
    if (children.length > 0) {
      const texts = children.filter(
        (c) =>
          c &&
          c.type === 'TEXT' &&
          typeof c.characters === 'string' &&
          c.characters.trim().length >= 2,
      );
      if (texts.length >= 2) {
        const trimmed = texts.map((t) => t.characters.trim());
        if (new Set(trimmed).size === trimmed.length) {
          const boxes = texts.map((t) => t.absoluteBoundingBox);
          if (boxes.every((b) => b && typeof b.x === 'number')) {
            const xs = boxes.map((b) => [b.x, b.x + (b.width || 0)]);
            const ys = boxes.map((b) => [b.y, b.y + (b.height || 0)]);
            const xRange =
              Math.max(...xs.map((r) => r[1])) - Math.min(...xs.map((r) => r[0]));
            const yRange =
              Math.max(...ys.map((r) => r[1])) - Math.min(...ys.map((r) => r[0]));
            const direction = xRange > yRange ? 'horizontal' : 'vertical';
            const keyed = texts.map((t, i) => ({ text: trimmed[i], box: boxes[i] }));
            keyed.sort((a, b) =>
              direction === 'horizontal'
                ? a.box.x - b.box.x
                : a.box.y - b.box.y,
            );
            groups.push({
              parentName: String(node.name || ''),
              direction,
              orderedTexts: keyed.map((k) => k.text),
            });
          }
        }
      }
    }
    for (const child of children) walk(child);
  };

  walk(figmaNodeData.document || figmaNodeData);
  return groups;
}

/**
 * 扫描 script 代码中所有顶层平衡的数组字面量区间（跳过字符串/注释/模板插值）。
 * @returns {Array<[number, number]>} [start, endExclusive]（含方括号）
 */
function scanArrayLiteralRanges(code) {
  const ranges = [];
  const n = code.length;
  let i = 0;
  let depth = 0;
  let start = -1;
  while (i < n) {
    const c = code[i];
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      i++;
      while (i < n) {
        if (code[i] === '\\') {
          i += 2;
          continue;
        }
        if (quote === '`' && code[i] === '$' && code[i + 1] === '{') {
          i += 2;
          let d = 1;
          while (i < n && d > 0) {
            if (code[i] === '{') d++;
            else if (code[i] === '}') d--;
            if (d > 0) i++;
          }
          continue;
        }
        if (code[i] === quote) break;
        i++;
      }
      i++;
      continue;
    }
    if (c === '/' && code[i + 1] === '/') {
      while (i < n && code[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && code[i + 1] === '*') {
      i += 2;
      while (i < n && !(code[i] === '*' && code[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (c === '[') {
      if (depth === 0) start = i;
      depth++;
    } else if (c === ']') {
      depth--;
      if (depth === 0 && start >= 0) {
        ranges.push([start, i + 1]);
        start = -1;
      }
      if (depth < 0) depth = 0;
    }
    i++;
  }
  return ranges;
}

/**
 * 把数组字面量内容按顶层逗号分割为 item 列表（保留 item 与其后的分隔符原文）。
 * @param {string} inner 不含首尾方括号的数组内容
 * @returns {Array<{item: string, sep: string}>}
 */
function splitTopLevelItems(inner) {
  const parts = [];
  const n = inner.length;
  let i = 0;
  let itemStart = 0;
  let depth = 0;
  while (i < n) {
    const c = inner[i];
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      i++;
      while (i < n) {
        if (inner[i] === '\\') {
          i += 2;
          continue;
        }
        if (quote === '`' && inner[i] === '$' && inner[i + 1] === '{') {
          i += 2;
          let d = 1;
          while (i < n && d > 0) {
            if (inner[i] === '{') d++;
            else if (inner[i] === '}') d--;
            if (d > 0) i++;
          }
          continue;
        }
        if (inner[i] === quote) break;
        i++;
      }
      i++;
      continue;
    }
    if (c === '/' && inner[i + 1] === '/') {
      while (i < n && inner[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && inner[i + 1] === '*') {
      i += 2;
      while (i < n && !(inner[i] === '*' && inner[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === ',' && depth === 0) {
      parts.push({ item: inner.slice(itemStart, i), sep: ',' });
      i++;
      itemStart = i;
      continue;
    }
    i++;
  }
  // 尾段（可能为空，或有尾随注释/空白）
  const tail = inner.slice(itemStart);
  if (parts.length > 0 || tail.trim().length > 0) {
    parts.push({ item: tail, sep: '' });
  }
  return parts;
}

/**
 * 在 .vue 内容中找包含全部组文本的最小数组字面量区间（script 区）。
 * @returns {{range: [number, number], order: string[]}|null}
 */
function findArrayLiteralWithTexts(content, texts) {
  const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
  if (!scriptMatch) return null;
  const script = scriptMatch[1];
  const offset = scriptMatch.index + scriptMatch[0].indexOf(script);

  let best = null;
  for (const [s, e] of scanArrayLiteralRanges(script)) {
    const seg = script.slice(s, e);
    if (texts.every((t) => seg.includes(t))) {
      if (!best || e - s < best.range[1] - best.range[0]) {
        // 文本出现顺序（按在区间内的首次位置）
        const order = [...texts].sort(
          (a, b) => seg.indexOf(a) - seg.indexOf(b),
        );
        best = { range: [offset + s, offset + e], order };
      }
    }
  }
  return best;
}

/**
 * 在 template 区找「静态文本元素」：元素内容恰为指定文本（无插值）。
 * 每个文本必须唯一出现，否则返回 null（保守防误伤）。
 * @returns {Array<{text: string, match: string, full: string, index: number}>|null}
 *   index 为**整个文件内容**中的绝对位置（含 <template> 标签偏移）
 */
function findStaticTextElements(content, texts) {
  const templateMatch = content.match(/<template>([\s\S]*)<\/template>/i);
  if (!templateMatch) return null;
  const template = templateMatch[1];
  // template 捕获组在 content 中的绝对起始偏移（<template> 标签之后）
  const templateAbsOffset =
    templateMatch.index + templateMatch[0].indexOf(template);

  const found = [];
  for (const t of texts) {
    const re = new RegExp(
      `<([a-zA-Z][\\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>(\\s*)${escapeRegExp(t)}(\\s*)</\\1\\s*>`,
      'g',
    );
    let m;
    const hits = [];
    while ((m = re.exec(template)) !== null) {
      hits.push(m);
    }
    if (hits.length !== 1) return null; // 0 个或多个 → 不可判定
    const hit = hits[0];
    found.push({
      text: t,
      full: hit[0],
      match: `${hit[3]}${t}${hit[4]}`,
      index: templateAbsOffset + hit.index,
    });
  }
  // 按 template 中出现位置排序 = 实际渲染顺序
  found.sort((a, b) => a.index - b.index);
  return found;
}

/** 归一化 files 输入（支持 [{path,content}] 与 Record 两种形态） */
function normalizeFiles(files) {
  if (Array.isArray(files)) {
    return files.map((f) => ({
      path: String(f.path || ''),
      content: typeof f.content === 'string' ? f.content : '',
    }));
  }
  if (files && typeof files === 'object') {
    return Object.entries(files).map(([path, content]) => ({
      path: String(path),
      content: typeof content === 'string' ? content : '',
    }));
  }
  return [];
}

/**
 * 检测产物中「文本兄弟组顺序漂移」。
 *
 * @param {Array<{path:string,content:string}>|Record<string,string>} files
 * @param {object} figmaNodeData
 * @returns {Array<{file: string, kind: 'array'|'template', parentName: string,
 *                    expected: string[], actual: string[]}>}
 */
export function detectTextOrderDrift(files, figmaNodeData) {
  const groups = collectFigmaTextSiblingGroups(figmaNodeData);
  if (groups.length === 0) return [];

  const drifts = [];
  for (const file of normalizeFiles(files)) {
    if (!/\.vue$/i.test(file.path) || !file.content) continue;
    for (const group of groups) {
      const texts = group.orderedTexts;
      // 快速过滤：文件必须包含全部组文本（多重集合相等的前置）
      if (!texts.every((t) => file.content.includes(t))) continue;

      // 形态 A：script 数组字面量
      const arr = findArrayLiteralWithTexts(file.content, texts);
      if (arr && arr.order.length === texts.length) {
        // ⚠️ 同元素豁免（2026-09-02，mc-max-1788280167414-49dfbe7d 实锤）：
        // 组内文本全部落在**同一个数组元素内部**（对象字面量字段 / 单字符串）时，
        // 那是「对象字段顺序」，不是「兄弟渲染顺序」——DOM 顺序由 <template> 决定，
        // 不由 script 对象字面量的字段先后决定。旧逻辑按文本首次出现位置排序 →
        // 例：`[{ count: '(0/484)', name: 'CO/VI检测器' }, ...]` 的组文本
        // '(0/484)'+设备名同属一个元素 → 误判漂移 → 自愈保守拒绝（元素数≠文本数）
        // → 全部丢给门禁 → TEXT-001 BLOCK=7 → 重试耗尽。
        // 判定：数组任一顶层元素包含全部组文本 → 跳过（非兄弟顺序）。
        const [s, e] = arr.range;
        const arrItems = splitTopLevelItems(file.content.slice(s + 1, e - 1));
        const sameElement = arrItems.some((p) =>
          texts.every((t) => p.item.includes(t)),
        );
        if (!sameElement && !arraysEqual(arr.order, texts)) {
          // 集合相等性由 findArrayLiteralWithTexts 的 includes 保证（组内文本互异）
          drifts.push({
            file: file.path,
            kind: 'array',
            parentName: group.parentName,
            expected: texts,
            actual: arr.order,
          });
          continue;
        }
      }

      // 形态 B：template 静态兄弟元素
      const elems = findStaticTextElements(file.content, texts);
      if (
        elems &&
        elems.length === texts.length &&
        !arraysEqual(
          elems.map((e) => e.text),
          texts,
        )
      ) {
        drifts.push({
          file: file.path,
          kind: 'template',
          parentName: group.parentName,
          expected: texts,
          actual: elems.map((e) => e.text),
        });
      }
    }
  }
  return drifts;
}

function arraysEqual(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * 修复产物中的文本顺序漂移（N4c 自愈）。
 * 无法安全重排的 drift 保留在 remaining（供 TEXT-001 门禁 fail-closed）。
 *
 * @param {Record<string,string>|Array} files
 * @param {object} figmaNodeData
 * @returns {{fixed: Array, remaining: Array, files: Record<string,string>}}
 */
export function fixTextOrderDrift(files, figmaNodeData) {
  const normalized = normalizeFiles(files);
  const out = {};
  for (const f of normalized) out[f.path] = f.content;

  const fixed = [];
  const remaining = [];

  for (const drift of detectTextOrderDrift(normalized, figmaNodeData)) {
    const content = out[drift.file];
    if (typeof content !== 'string') {
      remaining.push(drift);
      continue;
    }

    if (drift.kind === 'array') {
      const arr = findArrayLiteralWithTexts(content, drift.expected);
      if (!arr) {
        remaining.push(drift);
        continue;
      }
      const [s, e] = arr.range;
      const inner = content.slice(s + 1, e - 1);
      const parts = splitTopLevelItems(inner);
      // 保守：元素数=文本数、每元素恰含一个组文本、无空段
      const meaningful = parts.filter((p) => p.item.trim().length > 0);
      if (
        meaningful.length !== drift.expected.length ||
        parts.length !== meaningful.length ||
        !drift.expected.every((t) =>
          meaningful.filter((p) => p.item.includes(t)).length === 1,
        )
      ) {
        remaining.push(drift);
        continue;
      }
      // 按期望顺序重排（每元素按其包含的文本索引）
      const byText = new Map();
      for (const p of meaningful) {
        const t = drift.expected.find((x) => p.item.includes(x));
        byText.set(t, p);
      }
      const reordered = drift.expected.map((t) => byText.get(t));
      // 重建为规范格式（2026-09-02 修正）：不依赖各元素自身携带的尾随分隔符——
      // splitTopLevelItems 只有末元素无分隔符，重排后原末元素可能不在末位，
      // 旧逻辑 item+sep 直接拼接会产出 `'CO/VI检测器''激光雷达'` 相邻字面量（拼接断裂）。
      // 逐元素 trim 外围空白 + 统一 ', ' 分隔：单行/多行数组均正确重建。
      const rebuilt =
        '[' + reordered.map((p) => p.item.trim()).join(', ') + ']';
      out[drift.file] = content.slice(0, s) + rebuilt + content.slice(e);
      fixed.push(drift);
      continue;
    }

    if (drift.kind === 'template') {
      const elems = findStaticTextElements(content, drift.expected);
      if (!elems || elems.length !== drift.expected.length) {
        remaining.push(drift);
        continue;
      }
      // 从后往前按绝对位置切片替换：避免「替换后的元素字符串与文件中
      // 原有同文本元素重复」导致 String.replace 命中错误位置（位置序 i 的
      // 元素文本 → expected[i]）。
      let next = content;
      const desc = [...elems]
        .map((el, i) => ({ el, i }))
        .sort((a, b) => b.el.index - a.el.index);
      for (const { el, i } of desc) {
        const want = drift.expected[i];
        if (el.text === want) continue;
        const newFull = el.full.replace(el.text, want);
        next =
          next.slice(0, el.index) +
          newFull +
          next.slice(el.index + el.full.length);
      }
      // 验证修复后结构完整 + 顺序正确：
      // drift 复检会被「改坏的内容」骗过（乱码导致文本不唯一 → findStaticTextElements
      // 返回 null → 无 drift → 误判成功），故必须用强校验——
      // 每个文本恰出现一次、元素结构仍可解析、顺序 = expected。
      if (next !== content) {
        const elemsAfter = findStaticTextElements(next, drift.expected);
        const ok =
          elemsAfter !== null &&
          elemsAfter.length === drift.expected.length &&
          arraysEqual(
            elemsAfter.map((e) => e.text),
            drift.expected,
          );
        if (ok) {
          out[drift.file] = next;
          fixed.push(drift);
        } else {
          remaining.push(drift);
        }
      } else {
        remaining.push(drift);
      }
    }
  }

  return { fixed, remaining, files: out };
}

export default {
  collectFigmaTextSiblingGroups,
  detectTextOrderDrift,
  fixTextOrderDrift,
};
