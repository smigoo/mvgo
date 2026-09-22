/**
 * 🛡️ 视觉序确定性装配（2026-09-22 · c-device-monitor-be31dcf3 实锤）
 *
 * 病灶：LLM 生成的数据数组（v-for 源）按 Figma **文档序**排列，而 grid/flex 渲染按
 * **行优先**消费 → 卡片大面积错位。
 *
 * 实锤一（grid 列优先文档序）：
 *   Figma 2:8437 cons GROUP 的 children 顺序是列优先（第1列4卡→第2列→第3列），
 *   产物 ContentCons.vue 的 deviceList 照抄文档序 → `grid-template-columns: repeat(3,1fr)`
 *   行优先渲染后 12 卡中 11 张错位（正确行1 = 摄像机/风速风向仪/超高检测器）。
 *
 * 实锤二（tabs 文档序 ≠ y 序）：
 *   Figma 89:39 tabs FRAME 的 children 文档序末尾是 …消防(y=740), 交通诱导(y=783), 供配电(y=681)，
 *   视觉 y 序应为 …供配电, 消防, 交通诱导。产物 tabs 数组照抄文档序 → tab 顺序错。
 *
 * 治本：后处理阶段从 Figma 真值读子节点 (y,x) 序（grid）或 y 序（tabs），
 * 按文本签名匹配并确定性重排 script 中的数据数组。
 *
 * 保守纪律（全部满足才动手，宁可漏报不误杀）：
 *   - grid 模式：模板元素的 class 对应 style 规则含 grid-template-columns，
 *     且该元素带 data-section-id → Figma 子节点 ≥4 个内容卡；
 *   - tabs 模式：文件名含 Tabs / 模板根 class 含 tabs，且 Figma 树中恰有 1 个
 *     name='tabs' 的节点（唯一性防误绑）；
 *   - 产物数组长度 === Figma 卡数，文本签名集合 100% 相等（且无重名卡）；
 *   - 顺序确实不同才重排（幂等：顺序已正确则零改动）。
 *
 * 纯函数、zero-dep、ESM；只重排「对象块原文」的顺序，不重写对象内容。
 */

const CONTENT_CARD_TYPES = new Set(['GROUP', 'FRAME', 'INSTANCE', 'COMPONENT']);

function isContentCard(n) {
  if (!n || typeof n !== 'object' || !n.absoluteBoundingBox) return false;
  const t = String(n.type || '').toUpperCase();
  if (!CONTENT_CARD_TYPES.has(t)) return false;
  const name = String(n.name || '').toLowerCase();
  if (/^(bg|background|icon|vector|decorator|divider)$/.test(name)) return false;
  return true;
}

/** 子树内第一个非空 TEXT 字符（文档序），作为卡签名（label）。 */
function firstText(node) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === 'TEXT' && typeof node.characters === 'string') {
    const s = node.characters.trim();
    if (s) return s;
  }
  if (Array.isArray(node.children)) {
    for (const c of node.children) {
      const r = firstText(c);
      if (r) return r;
    }
  }
  return null;
}

function findNodeById(root, id) {
  if (!root || typeof root !== 'object' || id == null) return null;
  if (String(root.id) === String(id)) return root;
  if (Array.isArray(root.children)) {
    for (const c of root.children) {
      const r = findNodeById(c, id);
      if (r) return r;
    }
  }
  return null;
}

function findAllByName(root, nameLower) {
  const hits = [];
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (String(n.name || '').toLowerCase() === nameLower) hits.push(n);
    if (Array.isArray(n.children)) n.children.forEach(walk);
  };
  walk(root);
  return hits;
}

/** 收集某 Figma 容器的内容卡（过滤装饰原子），带 box + firstText 标签。 */
function collectContentCards(secNode) {
  return (secNode.children || [])
    .filter(isContentCard)
    .map((c) => ({ box: c.absoluteBoundingBox, label: firstText(c) }))
    .filter((x) => x.label && x.box);
}

/**
 * 切分模板体的高层子块（元素块，跳过注释/纯文本；自闭合标签独立成块）。
 * @param {string} body 模板体（不含根开闭标签）
 * @returns {{blocks: Array<{src: string, start: number, end: number}>}}
 */
function splitTopLevelTemplateBlocks(body) {
  const blocks = [];
  let depth = 0;
  let start = 0;
  let i = 0;
  let inComment = false;
  while (i < body.length) {
    if (!inComment && body.startsWith('<!--', i)) { inComment = true; i += 4; continue; }
    if (inComment) {
      if (body.startsWith('-->', i)) { inComment = false; i += 3; } else i++;
      continue;
    }
    if (body[i] === '<') {
      const tagM = body.slice(i).match(/^<\/?([a-zA-Z][\w-]*)/);
      if (tagM) {
        const isClose = body[i + 1] === '/';
        const fullTagM = body.slice(i).match(/^<[^>]*>/);
        const isSelfClose = !!fullTagM && /\/>\s*$/.test(fullTagM[0]);
        if (!isClose && !isSelfClose) {
          if (depth === 0) start = i;
          depth++;
        } else if (isClose) {
          depth--;
          if (depth === 0) {
            const end = i + (fullTagM ? fullTagM[0].length : tagM[0].length);
            blocks.push({ src: body.slice(start, end), start, end });
          }
          if (depth < 0) depth = 0;
    } else if (isSelfClose && depth === 0) {
        const end = i + fullTagM[0].length;
        blocks.push({ src: body.slice(i, end), start: i, end });
      }
      i += fullTagM ? fullTagM[0].length : tagM[0].length;
      continue;
    }
    }
    i++;
  }
  // 🛡️ 残缺容错（mc-1790048059931 实锤）：容器闭合标签缺失时 depth 无法归零，
  //   内层元素永远在 depth≥1 层 → 0 块。此时把「从 start 到 body 尾」收为一块，
  //   让容器下沉逻辑有机会接管（下沉后再切，item 就在顶层了）。
  if (depth > 0 && start > 0) {
    blocks.push({ src: body.slice(start), start, end: body.length });
  }
  return { blocks };
}

/** 提取 script 段首个「对象数组」的全部标签签名（label/text/name/title）。无则 null。 */
function extractScriptArrayLabels(vueContent) {
  const scriptOpen = vueContent.search(/<script[^>]*>/);
  if (scriptOpen < 0) return null;
  const scriptOpenEnd = vueContent.indexOf('>', scriptOpen) + 1;
  const scriptClose = vueContent.toLowerCase().indexOf('</script>', scriptOpenEnd);
  if (scriptClose < 0) return null;
  const script = vueContent.slice(scriptOpenEnd, scriptClose);
  const arrDeclRe = /(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*(?:ref\s*\(\s*)?\[/g;
  const m = arrDeclRe.exec(script);
  if (!m) return null;
  const bracketAt = m.index + m[0].length - 1;
  let depth = 0;
  let end = -1;
  for (let i = bracketAt; i < script.length; i++) {
    if (script[i] === '[') depth++;
    else if (script[i] === ']') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end < 0) return null;
  const inner = script.slice(bracketAt + 1, end);
  const blocks = splitTopLevelObjects(inner);
  if (blocks.length === 0) return null;
  const labels = new Set();
  for (const b of blocks) {
    const sig = objSignature(b.src);
    if (sig == null) return null; // 有对象无标签字段 → 不适合标签锚定
    labels.add(sig);
  }
  return labels;
}

/**
 * 标签双射锚定：在 Figma 全树找「内容卡标签集合与候选集合完全相等」的容器。
 * 唯一命中才返回（多容器同集合 = 歧义，放弃）。
 */
function findNodeByLabelBijection(root, candidateLabels) {
  let hit = null;
  let hits = 0;
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n.children) && n.children.length >= candidateLabels.size) {
      const cards = collectContentCards(n);
      if (cards.length === candidateLabels.size) {
        const set = new Set(cards.map((c) => c.label));
        if (set.size === cards.length) {
          let allIn = true;
          for (const l of set) if (!candidateLabels.has(l)) allIn = false;
          for (const l of candidateLabels) if (!set.has(l)) allIn = false;
          if (allIn) {
            hits++;
            hit = cards;
          }
        }
      }
    }
    if (Array.isArray(n.children)) n.children.forEach(walk);
  };
  walk(root);
  return hits === 1 ? hit : null;
}

/**
 * 静态模板 tab 块重排（e875f162 实锤：LLM 手写 6 个 tab div，顺序错位）。
 * 识别「根容器直接子块」中含目标标签文本的块，按 Figma y 序重排这些块。
 * 保守条件：命中的块数 === 标签数；未命中块保持原位。
 */
function reorderStaticTemplateBlocks(vueContent, targetLabels) {
  const tplOpen = vueContent.search(/<template[^>]*>/);
  if (tplOpen < 0) return null;
  const tplOpenEnd = vueContent.indexOf('>', tplOpen) + 1;
  // 🛡️ 残缺容错（mc-1790048059931 实锤）：L0-B 执行时 SFC 可能处于「括号自愈前」的
  // 中间态——</template> 或根闭合标签缺失（写盘门禁报 Element is missing end tag
  // 即此形态）。此时仍按「找到根开标签 + body 直到尾部」切块，不依赖闭合标签成对。
  const tplCloseLower = vueContent.toLowerCase().indexOf('</template>', tplOpenEnd);
  const rootOpen = vueContent.slice(tplOpenEnd).search(/<[a-z]/i);
  if (rootOpen < 0) return null;
  const rootAbs = tplOpenEnd + rootOpen;
  let rootTagEnd = vueContent.indexOf('>', rootAbs);
  let rootTag = vueContent.slice(rootAbs, rootTagEnd + 1);
  let rootTagName = rootTag.match(/<([a-z][\w-]*)/i)?.[1];
  if (!rootTagName) return null;
  // 根闭合标签位置：优先精确匹配根标签名（在 template 闭合前找）；template 缺失时查到 script 前
  const searchEnd = tplCloseLower >= 0 ? tplCloseLower : vueContent.toLowerCase().indexOf('<script', tplOpenEnd);
  const bound = searchEnd >= 0 ? searchEnd : vueContent.length;
  let rootCloseIdx = vueContent.toLowerCase().lastIndexOf(`</${rootTagName}`, bound);
  // 🛡️ 残缺形态判定（mc-1790048059931 实锤）：若根闭合标签后到 template 闭合之间
  //   还残留其他内容（如未闭合的子容器尾巴），说明根闭合其实缺失——lastIndexOf
  //   找到的是**最后一个子元素**的闭合，不是根。此时放弃精确定位，body 直接取
  //   「根开标签后 → template/script 边界」，由切块器按深度自适应（未闭合的
  //   尾部残块会被切进最后一个子块，重排不受影响——子块顺序仍正确）。
  if (rootCloseIdx >= 0) {
    const between = vueContent.slice(rootCloseIdx, bound).replace(new RegExp(`</${rootTagName}\\s*>`, 'i'), '').trim();
    if (between) rootCloseIdx = -1; // 根闭合后有残留 → 视为残缺
  }
  let body = vueContent.slice(rootTagEnd + 1, rootCloseIdx >= 0 ? rootCloseIdx : bound);

  // 🛡️ 容器下沉（e875f162 实锤：根 > tabs-list > 6 个 tab-item）：
  //   根直接子块只有 1 个且是「列表容器语义」（class 含 list/container/items）时，
  //   下沉一层以该容器为切块范围——否则 6 个 tab 在第二层，切块永远只有 1 块。
  let probe = splitTopLevelTemplateBlocks(body);
  if (probe.blocks.length === 1) {
    const clsM = probe.blocks[0].src.match(/class="([^"]*)"/);
    const cls = clsM ? clsM[1] : '';
    if (/(?:^|[\s-])(list|container|items|wrap)(?:[\s-]|$)/i.test(cls)) {
      const inner = probe.blocks[0];
      const innerTagM = inner.src.match(/^<([a-zA-Z][\w-]*)[^>]*>/);
      if (innerTagM) {
        const innerName = innerTagM[1];
        const innerClose = inner.src.toLowerCase().lastIndexOf(`</${innerName}`);
        if (innerClose > 0) {
          body = inner.src.slice(innerTagM[0].length, innerClose);
        }
      }
    }
  }

  // 切顶层子块（含注释）——统一走 splitTopLevelTemplateBlocks
  const { blocks } = splitTopLevelTemplateBlocks(body);
  if (blocks.length === 0) return null;

  // 匹配含标签文本的块（块内出现 >标签< 文本）
  const labelToBlock = new Map();
  const matched = [];
  for (const b of blocks) {
    for (const label of targetLabels) {
      if (labelToBlock.has(label)) continue;
      const re = new RegExp(`>\\s*${escapeRe(label)}\\s*<`);
      if (re.test(b.src)) {
        labelToBlock.set(label, b);
        matched.push(b);
        break;
      }
    }
  }
  if (labelToBlock.size !== targetLabels.length) return null; // 有标签找不到块 → 放弃

  // 按目标顺序生成新块序列（未匹配块原位保留，占住原 slot）
  const slots = blocks.map((b) => (matched.includes(b) ? null : b));
  const ordered = targetLabels.map((l) => labelToBlock.get(l));
  let oi = 0;
  const newBlocks = slots.map((s) => s ?? ordered[oi++]);

  // 顺序确实不同才重排（幂等）
  const curOrder = matched.map((b) => targetLabels.find((l) => labelToBlock.get(l) === b));
  const isSame = targetLabels.every((l, idx) => curOrder[idx] === l);
  if (isSame) return null;

  const newBody =
    body.slice(0, blocks[0].start) +
    newBlocks.map((b) => b.src).join('') +
    body.slice(blocks[blocks.length - 1].end);
  return vueContent.slice(0, rootAbs) + rootTag + newBody + vueContent.slice(rootCloseIdx >= 0 ? rootCloseIdx : bound);
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 解析数组字面量源串中的顶层对象块（保持原文，不重格式化）。
 * @returns {Array<{src: string, start: number, end: number}>}
 */
function splitTopLevelObjects(arrSrc) {
  const objs = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < arrSrc.length; i++) {
    const ch = arrSrc[i];
    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        objs.push({ src: arrSrc.slice(start, i + 1), start, end: i + 1 });
        start = -1;
      }
      if (depth < 0) return objs;
    }
  }
  return objs;
}

/** 提取对象字面量的文本签名（label/text/name/title 字段，第一个命中）。 */
function objSignature(objSrc) {
  const m = objSrc.match(
    /\b(?:label|text|name|title)\s*:\s*(['"])([^'"]+)\1/,
  );
  return m ? m[2].trim() : null;
}

/**
 * 在 vue 全文中定位 script 段内的候选数据数组声明并按目标签名序重排。
 * 只处理元素为「对象字面量」的数组；字符串数组（如 ['a','b']）不在触发面内
 * （其重排无对象粒度签名，误伤面大，保守跳过）。
 *
 * @param {string} vueContent 子组件 .vue 全文
 * @param {string[]} targetLabels 目标签名序（Figma 行优先/y 序）
 * @returns {{content: string, reordered: string[]}|null} 新全文与被重排的数组名；无需/无法处理返回 null
 */
function reorderScriptArrays(vueContent, targetLabels) {
  const scriptOpen = vueContent.search(/<script[^>]*>/);
  if (scriptOpen < 0) return null;
  const scriptOpenEnd = vueContent.indexOf('>', scriptOpen) + 1;
  const scriptClose = vueContent.toLowerCase().indexOf('</script>', scriptOpenEnd);
  if (scriptClose < 0) return null;
  const script = vueContent.slice(scriptOpenEnd, scriptClose);

  const targetSet = new Set(targetLabels);
  if (targetSet.size !== targetLabels.length) return null; // Figma 侧重名卡：放弃（保守）

  const arrDeclRe = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:ref\s*\(\s*)?\[/g;
  let m;
  let out = script;
  const reordered = [];

  while ((m = arrDeclRe.exec(script)) !== null) {
    const arrName = m[1];
    const bracketAt = m.index + m[0].length - 1; // '[' 的位置
    // 配平找 ']'
    let depth = 0;
    let end = -1;
    for (let i = bracketAt; i < script.length; i++) {
      const ch = script[i];
      if (ch === '[') depth++;
      else if (ch === ']') {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end < 0) continue;
    const arrSrc = script.slice(bracketAt, end + 1);
    const inner = arrSrc.slice(1, -1);
    const blocks = splitTopLevelObjects(inner);
    if (blocks.length !== targetLabels.length || blocks.length === 0) continue;

    const sigs = blocks.map((b) => objSignature(b.src));
    if (sigs.some((s) => s == null)) continue;
    const sigSet = new Set(sigs);
    // 集合 100% 相等才重排（缺一/多一都放弃）
    if (sigSet.size !== sigs.length) continue;
    if (sigs.length !== targetSet.size || [...sigSet].every((s) => !targetSet.has(s))) continue;
    let allIn = true;
    for (const s of sigs) if (!targetSet.has(s)) allIn = false;
    for (const s of targetLabels) if (!sigSet.has(s)) allIn = false;
    if (!allIn) continue;

    // 顺序已正确 → 跳过（幂等）
    const already = sigs.every((s, i) => s === targetLabels[i]);
    if (already) continue;

    const bySig = new Map(blocks.map((b, i) => [sigs[i], b.src]));
    const indentMatch = inner.match(/\n(\s*)\{/);
    const indent = indentMatch ? indentMatch[1] : '  ';
    const newArrSrc = `[\n${indent}` + targetLabels.map((l) => bySig.get(l)).join(`,\n${indent}`) + `\n]`;

    out =
      out.slice(0, bracketAt) +
      newArrSrc +
      out.slice(end + 1);
    reordered.push(arrName);
    // 更新扫描游标：新数组长度变了，重置到 newArrSrc 之后继续找后续声明
    arrDeclRe.lastIndex = script.length; // 直接停止（一次处理一个文件内首个匹配数组已足够，避免坐标漂移）
    break;
  }

  if (reordered.length === 0) return null;
  return {
    content: vueContent.slice(0, scriptOpenEnd) + out + vueContent.slice(scriptClose),
    reordered,
  };
}

/**
 * 主入口：对一个子组件 .vue 执行视觉序确定性重排。
 *
 * @param {string} vueContent 子组件 .vue 全文
 * @param {Object} figmaNodeData Figma 节点树（接受 {document} 包裹或直接根节点）
 * @param {Object} [opts] { fileName?: string }
 * @returns {{content: string, mode: 'grid'|'tabs'|'tabs-static', reordered: string[], labels: string[]}|null}
 */
export function reorderArraysByFigmaVisualOrder(vueContent, figmaNodeData, opts = {}) {
  if (!vueContent || typeof vueContent !== 'string' || !figmaNodeData) return null;
  const root =
    figmaNodeData && typeof figmaNodeData === 'object'
      ? figmaNodeData.document ?? figmaNodeData
      : null;
  if (!root || typeof root !== 'object') return null;

  const templateMatch = vueContent.match(/<template[^>]*>([\s\S]*?)<\/template>/);
  if (!templateMatch) return null;
  const template = templateMatch[1];

  let figmaLabels = null;
  let mode = null;

  // ── grid 模式（2026-09-22 二段放宽）：style 有 grid-template-columns ──
  // 锚定优先级：① 元素 data-section-id（快路径）；② 标签双射扫描全树
  //   （e875f162 实锤：LLM 不写 data-section-id，但 12 卡标签与 Figma GROUP
  //   内容卡 firstText 100% 双射 —— 双射即锚，不再要求显式 id）。
  const styleMatch = vueContent.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  if (styleMatch && /grid-template-columns/.test(styleMatch[1])) {
    // ① data-section-id 快路径
    let anchored = null;
    const idRe = /data-section-id="([\d:]+)"/g;
    let im;
    while (!anchored && (im = idRe.exec(template)) !== null) {
      const secNode = findNodeById(root, im[1]);
      if (!secNode || !Array.isArray(secNode.children)) continue;
      const cards = collectContentCards(secNode);
      if (cards.length >= 4) anchored = cards;
    }
    // ② 标签双射扫描：从 script 数组提取候选标签集，全树找唯一匹配节点
    if (!anchored) {
      const candidateLabels = extractScriptArrayLabels(vueContent);
      if (candidateLabels && candidateLabels.size >= 4) {
        anchored = findNodeByLabelBijection(root, candidateLabels);
      }
    }
    if (anchored && anchored.length >= 4) {
      anchored.sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
      figmaLabels = anchored.map((c) => c.label);
      mode = 'grid';
    }
  }

  // ── tabs 模式：文件名含 Tabs / 模板根 class 含 tabs，且 Figma 树中恰有 1 个 name='tabs' 节点 ──
  if (!figmaLabels) {
    const fileName = String(opts.fileName || '');
    const rootClsMatch = template.match(/class="([^"]+)"/);
    const rootCls = rootClsMatch ? rootClsMatch[1] : '';
    const isTabsSemantic = /tabs/i.test(fileName) || /\btabs\b/.test(rootCls);
    if (isTabsSemantic) {
      const hits = findAllByName(root, 'tabs');
      if (hits.length === 1 && Array.isArray(hits[0].children)) {
        const items = hits[0].children
          .filter(isContentCard)
          .map((c) => ({ box: c.absoluteBoundingBox, label: firstText(c) }))
          .filter((x) => x.label && x.box);
        if (items.length >= 2) {
          items.sort((a, b) => a.box.y - b.box.y);
          figmaLabels = items.map((c) => c.label);
          // 先试 script 数组；无数组（静态手写模板）则重排模板块
          const arrResult = reorderScriptArrays(vueContent, figmaLabels);
          if (arrResult) {
            return { content: arrResult.content, mode: 'tabs', reordered: arrResult.reordered, labels: figmaLabels };
          }
          const tplResult = reorderStaticTemplateBlocks(vueContent, figmaLabels);
          if (tplResult) {
            return { content: tplResult, mode: 'tabs-static', reordered: ['<template>'], labels: figmaLabels };
          }
          return null;
        }
      }
    }
  }

  if (!figmaLabels) return null;

  const result = reorderScriptArrays(vueContent, figmaLabels);
  if (!result) return null;
  return { content: result.content, mode, reordered: result.reordered, labels: figmaLabels };
}

export default reorderArraysByFigmaVisualOrder;
