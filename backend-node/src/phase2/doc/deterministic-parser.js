/**
 * D1 确定性解析器（零 LLM，实测覆盖 78% 字段）
 * 职责：```json 块提取 + markdown 表格通用解析 + 列名语义归类 + 双通道兜底
 * 铁律：解析器零业务词表，所有结构信息来自文档原文
 */
const { COLUMN_SEMANTICS } = require('./doc-patterns');

/** 提取 ```json 代码块（容错：解析失败记录 raw） */
function extractJsonBlocks(text) {
  const blocks = [];
  const re = /```json\s*\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    try { blocks.push({ ok: true, data: JSON.parse(m[1]) }); }
    catch (e) { blocks.push({ ok: false, raw: m[1].slice(0, 200), error: e.message }); }
  }
  return blocks;
}

/** 通用 markdown 表格解析（支持单章节多表格） */
function parseMarkdownTable(text) {
  const tables = [];
  const lines = text.split('\n');
  let cur = null;
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith('|') && t.endsWith('|')) {
      const cells = t.slice(1, -1).split('|').map((c) => c.trim());
      const isSeparator = cells.every((c) => /^:?-{2,}:?$/.test(c) || c === '');
      if (!cur) { cur = { headers: cells, rows: [] }; continue; }
      if (isSeparator) continue;
      cur.rows.push(cells);
    } else if (cur) { tables.push(cur); cur = null; }
  }
  if (cur) tables.push(cur);
  return tables.filter((tb) => tb.rows.length > 0);
}

/** 列名语义归类（列名 → fieldBinding/controlType/description/paramName/...） */
function classifyColumns(headers, customSemantics) {
  const semantics = customSemantics || COLUMN_SEMANTICS;
  return headers.map((h) => {
    const clean = h.replace(/[:：\s]/g, '');
    for (const [sem, synonyms] of Object.entries(semantics)) {
      if (synonyms.some((s) => clean === s || clean.includes(s))) return { header: h, semantic: sem };
    }
    return { header: h, semantic: 'unknown' };
  });
}

/** 表格 → 对象数组（语义列提升为 key，未知列保留原列名） */
function tableToObjects(table, customSemantics) {
  const classified = classifyColumns(table.headers, customSemantics);
  return table.rows.map((row) => {
    const obj = {};
    classified.forEach((c, i) => {
      obj[c.semantic !== 'unknown' ? c.semantic : c.header] = row[i] || '';
    });
    return obj;
  });
}

/** 双通道取值：优先 JSON 块（数组），失败降级表格 */
function parseConfigSection(content) {
  const blocks = extractJsonBlocks(content);
  const ok = blocks.find((b) => b.ok && Array.isArray(b.data));
  if (ok) return { items: ok.data, channel: 'json' };
  const tables = parseMarkdownTable(content);
  if (tables.length) return { items: tableToObjects(tables[0]), channel: 'table-fallback' };
  return { items: [], channel: 'none' };
}

/** 从接口配置章节提取端点定义（表格行中找 METHOD PATH 模式，剥离 markdown 反引号） */
function extractEndpoint(apiRow) {
  const text = Object.values(apiRow).join(' ');
  const m = text.match(/(GET|POST|PUT|DELETE|PATCH)\s+(\/[^\s|`]+)/i);
  return m ? { method: m[1].toUpperCase(), path: m[2].replace(/[`'"]/g, '') } : null;
}

module.exports = {
  extractJsonBlocks,
  parseMarkdownTable,
  classifyColumns,
  tableToObjects,
  parseConfigSection,
  extractEndpoint,
};
