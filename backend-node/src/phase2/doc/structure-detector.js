/**
 * D0 结构探测器（确定性，<50ms）
 * 职责：markdown 标题提取 + 模糊标题匹配定位章节 + 章节级 hash + req-d 标记识别
 * 实测：参考文档 10/10 章节命中（六级嵌套标题有效）
 */
const crypto = require('crypto');
const { SECTION_TITLES, REQ_D_GENERATED_RE, REQ_D_MERGE_RE } = require('./doc-patterns');

/** 去掉标题编号前缀（"4.2.5.1.2.7 businessEvents（业务事件）" → "businessEvents（业务事件）"） */
function stripNumber(title) {
  return title.replace(/^[\d.]+\s*/, '').trim();
}

/** 提取全级标题 */
function extractHeadings(md) {
  const lines = md.split('\n');
  const headings = [];
  lines.forEach((line, idx) => {
    const m = line.match(/^(#{1,6})\s+(.+)$/);
    if (m) headings.push({ level: m[1].length, title: m[2].trim(), line: idx });
  });
  return { lines, headings };
}

/** 章节定位：同义词库 includes 匹配（不按章节号） */
function locateSections(md, customTitles) {
  const titles = customTitles || SECTION_TITLES;
  const { lines, headings } = extractHeadings(md);

  const found = {};
  for (const [key, synonyms] of Object.entries(titles)) {
    for (const h of headings) {
      const clean = stripNumber(h.title);
      if (synonyms.some((s) => clean === s || clean.startsWith(s) || clean.includes(s))) {
        if (!found[key]) found[key] = { ...h, cleanTitle: clean };
      }
    }
  }

  // 每个章节的行范围（到下一个同级或更高级标题）+ 章节级 hash
  const ranges = {};
  for (const [key, h] of Object.entries(found)) {
    let end = lines.length;
    for (const other of headings) {
      if (other.line > h.line && other.level <= h.level) { end = other.line; break; }
    }
    const content = lines.slice(h.line, end).join('\n');
    ranges[key] = {
      start: h.line,
      end,
      content,
      hash: crypto.createHash('sha1').update(content).digest('hex'),
    };
  }
  return { headings, found, ranges };
}

/** req-d 工具链标记识别（mvgo 兼容） */
function detectReqDMarks(md) {
  const generated = REQ_D_GENERATED_RE.test(md);
  const mergeMatch = md.match(REQ_D_MERGE_RE);
  return {
    reqDGenerated: generated,
    reqDLastMerge: mergeMatch ? mergeMatch[1] : null,
    trustLevel: generated ? 'highest' : 'normal',
  };
}

/** 全文 hash（doc-analysis 缓存 key） */
function docHash(md) {
  return crypto.createHash('sha256').update(md).digest('hex');
}

/** D0 主入口 */
function detect(md) {
  const { headings, found, ranges } = locateSections(md);
  const marks = detectReqDMarks(md);
  const allKeys = Object.keys(SECTION_TITLES);
  const foundKeys = Object.keys(found);
  return {
    headingCount: headings.length,
    found: foundKeys,
    missed: allKeys.filter((k) => !foundKeys.includes(k)),
    ranges,
    ...marks,
    docHash: docHash(md),
  };
}

module.exports = { detect, locateSections, detectReqDMarks, docHash, stripNumber, extractHeadings };
