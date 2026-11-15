// Figma Plugin API 节点语义模拟器（回归安全网地基）
// 目的：把 backend-node/data/figma-node-cache/*.json（REST 格式，只有 absoluteBoundingBox）
// 升格成 Plugin API 语义节点，忠实复现真机行为，尤其是：
//   1) appendChild / insertChild / group 的 reparent 自动保持绝对位置
//   2) x / y 是相对父级坐标，setter 会改变 absoluteBoundingBox（二次补偿漂移的根因）
// 没有这两条，桩树全绿而真机崩坏（改的人=验的人假绿）。
//
// 本文件只读消费缓存 JSON，不写回；纯 Node，无 Figma 依赖。

let __seq = 0;
const registry = new Map();

function num(v, fallback) {
  return Number.isFinite(v) ? v : fallback;
}

// 从 REST 节点递归构造。parentAbs 用于把绝对坐标转换成相对父级的 x/y。
function fromRest(raw, parentAbs, parent) {
  const b = raw.absoluteBoundingBox || {};
  const absX = num(b.x, 0);
  const absY = num(b.y, 0);
  const w = num(b.width, num(raw.width, 0));
  const h = num(b.height, num(raw.height, 0));

  const node = createNode({
    id: raw.id || ('shim-' + (++__seq)),
    name: raw.name || '',
    type: raw.type || 'GROUP',
    relX: parent ? absX - parentAbs.x : absX,
    relY: parent ? absY - parentAbs.y : absY,
    w, h,
    raw,
  });

  // visible：REST 里大多缺省（=可见），仅显式 false 才算隐藏
  if (raw.visible === false) node.visible = false;

  const kids = Array.isArray(raw.children) ? raw.children : [];
  for (const kc of kids) {
    const child = fromRest(kc, { x: absX, y: absY }, node);
    node.children.push(child);
    child.parent = node;
  }
  return node;
}

function createNode(opts) {
  const node = {
    id: opts.id,
    name: opts.name,
    type: opts.type,
    relX: opts.relX || 0,
    relY: opts.relY || 0,
    w: opts.w || 0,
    h: opts.h || 0,
    children: [],
    parent: null,
    visible: opts.visible,
    locked: opts.locked || false,
    pluginData: {},
    _raw: opts.raw || {},
    exportSettings: Array.isArray(opts.raw && opts.raw.exportSettings) ? opts.raw.exportSettings.slice() : [],

    // x/y：相对父级。setter 改变绝对位置 —— 这是复现二次补偿的关键。
    get x() { return this.relX; },
    set x(v) { this.relX = num(v, this.relX); },
    get y() { return this.relY; },
    set y(v) { this.relY = num(v, this.relY); },
    get width() { return this.w; },
    set width(v) { this.w = num(v, this.w); },
    get height() { return this.h; },
    set height(v) { this.h = num(v, this.h); },

    // absoluteBoundingBox：从 parent 链累加相对坐标动态派生（只读语义）
    get absoluteBoundingBox() {
      let ax = this.relX, ay = this.relY, p = this.parent;
      while (p) { ax += p.relX; ay += p.relY; p = p.parent; }
      return { x: ax, y: ay, width: this.w, height: this.h };
    },
    get absoluteTransform() { return null; }, // REST 缓存无 transform；有 bbox 时 absRect 优先 bbox

    appendChild(child) {
      // Figma：reparent 保持绝对位置不变，自动重算相对坐标
      const abs = child.absoluteBoundingBox;
      detach(child);
      child.parent = this;
      this.children.push(child);
      const pa = this.absoluteBoundingBox;
      child.relX = abs.x - pa.x;
      child.relY = abs.y - pa.y;
      return child;
    },
    insertChild(index, child) {
      const abs = child.absoluteBoundingBox;
      detach(child);
      child.parent = this;
      const at = Math.max(0, Math.min(num(index, 0), this.children.length));
      this.children.splice(at, 0, child);
      const pa = this.absoluteBoundingBox;
      child.relX = abs.x - pa.x;
      child.relY = abs.y - pa.y;
      return child;
    },
    remove() { detach(this); },
    resize(w, h) { this.w = num(w, this.w); this.h = num(h, this.h); },
    getPluginData(k) { return Object.prototype.hasOwnProperty.call(this.pluginData, k) ? this.pluginData[k] : ''; },
    setPluginData(k, v) { this.pluginData[k] = String(v); },
    getPluginDataKeys() { return Object.keys(this.pluginData); },
    setSharedPluginData(ns, k, v) { this.pluginData['shared:' + ns + ':' + k] = String(v); },
    getSharedPluginData(ns, k) { return this.pluginData['shared:' + ns + ':' + k] || ''; },
    async exportAsync() { return new Uint8Array(0); },

    findAll(fn) {
      const out = [];
      (function walk(n) {
        if (fn(n)) out.push(n);
        for (const c of n.children) walk(c);
      })(this);
      return out;
    },
    findOne(fn) {
      let hit = null;
      (function walk(n) {
        if (hit) return;
        if (fn(n)) { hit = n; return; }
        for (const c of n.children) { walk(c); if (hit) return; }
      })(this);
      return hit;
    },
  };

  // 从 raw 拷贝插件会读的标量属性
  const r = opts.raw || {};
  for (const k of ['fills', 'strokes', 'effects', 'layoutMode', 'layoutWrap', 'itemSpacing',
                   'primaryAxisAlignItems', 'counterAxisAlignItems', 'paddingLeft', 'paddingTop',
                   'paddingRight', 'paddingBottom', 'characters', 'fontSize', 'cornerRadius',
                   'opacity', 'blendMode', 'clipsContent', 'constraints', 'background']) {
    if (r[k] !== undefined && r[k] !== null) node[k] = r[k];
  }
  if (node.type === 'TEXT' && node.characters === undefined) node.characters = r.name || '';

  registry.set(node.id, node);
  return node;
}

function detach(node) {
  if (!node.parent) return;
  const idx = node.parent.children.indexOf(node);
  if (idx >= 0) node.parent.children.splice(idx, 1);
  node.parent = null;
}

// figma.group(nodes)：新建 GROUP 包住 nodes，保持所有绝对位置不变，bbox = 并集
function figmaGroup(nodes, parentHint, indexHint) {
  const arr = (nodes || []).filter(Boolean);
  if (!arr.length) return null;
  const parent = parentHint || arr[0].parent;
  if (!parent) return null;

  let minX = Infinity, minY = Infinity, maxR = -Infinity, maxB = -Infinity;
  for (const n of arr) {
    const b = n.absoluteBoundingBox;
    minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
    maxR = Math.max(maxR, b.x + b.width); maxB = Math.max(maxB, b.y + b.height);
  }
  const g = createNode({
    id: 'shim-group-' + (++__seq),
    name: 'Group ' + (++__seq),
    type: 'GROUP',
    relX: 0, relY: 0,
    w: maxR - minX, h: maxB - minY,
    raw: {},
  });
  // 先设为绝对 minX/minY（无父时 rel=abs），再挂到 parent，reparent 会自动换算
  g.relX = minX; g.relY = minY;
  parent.insertChild(num(indexHint, Math.min.apply(null, arr.map(n => parent.children.indexOf(n)).filter(i => i >= 0))), g);
  for (const n of arr) g.appendChild(n);
  return g;
}

function figmaUngroup(node) {
  if (!node || !node.parent) return [];
  const p = node.parent;
  const idx = p.children.indexOf(node);
  const kids = node.children.slice();
  detach(node);
  kids.forEach((k, i) => p.insertChild(idx + i, k));
  return kids;
}

function createFrame() {
  const f = createNode({ id: 'shim-frame-' + (++__seq), name: 'Frame ' + (++__seq), type: 'FRAME', raw: {} });
  return f;
}

function buildFigmaMock(rootRaw) {
  // rootRaw 可能整包是 {document,...}，也可能直接是 document 节点
  const doc = rootRaw && rootRaw.document ? rootRaw.document : rootRaw;
  const root = fromRest(doc, { x: 0, y: 0 }, null);
  registry.clear();
  (function reg(n) { registry.set(n.id, n); for (const c of n.children) reg(c); })(root);

  const page = {
    id: 'shim-page', name: 'Page 1', type: 'PAGE',
    relX: 0, relY: 0,   // absoluteBoundingBox 累加链需要；page 是坐标原点
    children: [root],
    selection: [root],
    appendChild(n) { this.children.push(n); n.parent = this; },
  };
  root.parent = page;

  const messages = [];
  const store = {};
  const figma = {
    currentPage: page,
    fileKey: rootRaw.fileKey || 'shim-file',
    root,
    messages,
    on() {},
    showUI() {},
    notify() {},
    triggerUndo() {},
    commitUndo() {},
    group: figmaGroup,
    ungroup: figmaUngroup,
    createFrame,
    getNodeById(id) { return registry.get(id) || null; },
    async getNodeByIdAsync(id) { return registry.get(id) || null; },
    ui: {
      onmessage: null,
      postMessage(m) { messages.push(m); },
    },
    clientStorage: {
      async getAsync(k) { return store[k]; },
      async setAsync(k, v) { store[k] = v; },
      async deleteAsync(k) { delete store[k]; },
    },
  };
  return figma;
}

// 结构快照：每个节点一行，包含身份/命名/层级/绝对几何/pluginData 标记
function snapshot(figma) {
  const lines = [];
  function walk(n, depth) {
    const b = n.absoluteBoundingBox;
    const pd = Object.keys(n.pluginData || {}).sort().map(k => k + '=' + n.pluginData[k]).join(',');
    // 合成节点 id（shim-group-N / shim-frame-N）的自增序号随运行批次变化，
    // 不代表结构差异；归一成稳定占位符，保证跨批次基线可比。真实节点 id 保留。
    const stableId = /^shim-(?:group|frame)-\d+$/.test(n.id) ? n.id.replace(/-\d+$/, '-#') : n.id;
    lines.push([
      '  '.repeat(depth) + n.type,
      'name=' + JSON.stringify(n.name),
      'id=' + stableId,
      'abs=' + Math.round(b.x) + ',' + Math.round(b.y) + ',' + Math.round(b.width) + ',' + Math.round(b.height),
      'vis=' + (n.visible === false ? 0 : 1),
      'pd={' + pd + '}',
      'kids=' + n.children.length,
    ].join(' | '));
    for (const c of n.children) walk(c, depth + 1);
  }
  walk(figma.root, 0);
  return lines.join('\n');
}

module.exports = { fromRest, createNode, buildFigmaMock, snapshot, registry };
