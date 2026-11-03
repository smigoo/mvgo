/**
 * R8-8：grid/display 一致性对账。
 *
 * CSS 事实：`grid-template-columns` 在非 grid 容器上不起作用。同一声明域内同时出现
 * `grid-template-columns` 与最终生效的 `display:flex`，即可确定 display 写错；
 * 只把最后一个 flex 改成 grid，不猜列数、不改其他布局声明。
 */
const DISPLAY_RE = /(^|[;{]\s*|\s)display\s*:\s*(flex|grid|block|inline|inline-flex|inline-grid|none)\s*(?=;|$)/g;
const GRID_COLUMNS_RE = /(^|[;{]\s*|\s)grid-template-columns\s*:/;

function alignDeclarationBody(body) {
  if (!GRID_COLUMNS_RE.test(body)) return { content: body, aligned: 0 };
  const matches = [...body.matchAll(DISPLAY_RE)];
  if (matches.length === 0) return { content: body, aligned: 0 };
  const last = matches[matches.length - 1];
  if (last[2] !== 'flex') return { content: body, aligned: 0 };
  const valueStart = last.index + last[0].lastIndexOf('flex');
  return {
    content: body.slice(0, valueStart) + 'grid' + body.slice(valueStart + 4),
    aligned: 1,
  };
}

function alignStyleBlocks(content) {
  let aligned = 0;
  const next = content.replace(/\{([^{}]*)\}/g, (whole, body) => {
    const out = alignDeclarationBody(body);
    aligned += out.aligned;
    return out.aligned > 0 ? `{${out.content}}` : whole;
  });
  return { content: next, aligned };
}

export function alignGridDisplayConflicts(files) {
  const result = { ...files };
  const summary = { gridDisplayScanned: 0, gridDisplayAligned: 0, hits: [] };
  for (const [file, source] of Object.entries(files || {})) {
    if (!/\.(?:vue|less|css)$/i.test(file) || typeof source !== 'string') continue;
    summary.gridDisplayScanned++;
    let content = source;
    let aligned = 0;
    if (/\.vue$/i.test(file)) {
      // 静态 inline style 与 SFC style 块是两个独立声明域，分别对账。
      content = content.replace(/(\sstyle\s*=\s*)(["'])([\s\S]*?)\2/gi, (whole, prefix, quote, body) => {
        const out = alignDeclarationBody(body);
        aligned += out.aligned;
        return out.aligned > 0 ? `${prefix}${quote}${out.content}${quote}` : whole;
      });
      content = content.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (whole, open, css, close) => {
        const out = alignStyleBlocks(css);
        aligned += out.aligned;
        return out.aligned > 0 ? `${open}${out.content}${close}` : whole;
      });
    } else {
      const out = alignStyleBlocks(content);
      content = out.content;
      aligned = out.aligned;
    }
    if (aligned > 0) {
      result[file] = content;
      summary.gridDisplayAligned += aligned;
      for (let i = 0; i < aligned; i++) summary.hits.push({ file, kind: 'block' });
    }
  }
  return { files: result, summary };
}

export default alignGridDisplayConflicts;
