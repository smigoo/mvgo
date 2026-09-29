/**
 * B 的 Figma 真值取证（只读）：
 *  - 找 frame-2136637409 / frame-2136637410（左右两卡）及其 TEXT 子节点的真实文本
 *  - 找环形图节点（@echarts / 图表）的真实 absoluteBoundingBox.height → 验证 52px
 *
 * 用法：node .tmp-b-figma-truth.js <组件目录>
 */
const fs = require('fs');
const path = require('path');

const dir = process.argv[2] || 'workspace/custom-components/c-traffic-monitor-447d01cc';
const cache = path.join(dir, '.mc-gen/cache/figma-node-data.json');
if (!fs.existsSync(cache)) {
  console.error('缺 figma-node-data.json:', cache);
  process.exit(1);
}
const raw = JSON.parse(fs.readFileSync(cache, 'utf8'));
const doc = raw.document || raw;

const byId = new Map();
const parentOf = new Map();
(function walk(n, parent) {
  if (!n || typeof n !== 'object') return;
  if (n.id != null) {
    byId.set(String(n.id), n);
    if (parent) parentOf.set(String(n.id), String(parent.id));
  }
  for (const c of n.children || []) walk(c, n);
})(doc, null);

console.log('节点总数：', byId.size);

function textOf(n) {
  let s = n.characters || '';
  for (const c of n.children || []) s += ' | ' + textOf(c);
  return s.replace(/\s+/g, ' ').trim();
}

function bb(n) {
  const b = n.absoluteBoundingBox || {};
  return `x=${b.x} y=${b.y} w=${b.width} h=${b.height}`;
}

// 1) 左右两卡：找名字/后缀匹配 2136637409 / 2136637410 的节点
const targets = [];
for (const [id, n] of byId) {
  if (/2136637409|2136637410/.test(id) || /2136637409|2136637410/.test(String(n.name || ''))) {
    targets.push([id, n]);
  }
}
console.log(`\n=== 匹配 frame-2136637409/2136637410 的节点：${targets.length} 个 ===`);
for (const [id, n] of targets.slice(0, 8)) {
  console.log(`  id=${id} name=${n.name} type=${n.type} ${bb(n)}`);
  for (const c of n.children || []) {
    console.log(`     └ ${c.id} ${c.name} [${c.type}] "${textOf(c).slice(0, 40)}" ${bb(c)}`);
  }
}

// 2) 图表节点：类型/名字含 chart / echarts / 环 / 饼
const charts = [];
for (const [id, n] of byId) {
  const s = String(n.name || '') + ' ' + String(n.type || '');
  if (/chart|echarts|环形|环图|饼图|donut|pie/i.test(s)) charts.push([id, n]);
}
console.log(`\n=== 疑似图表节点：${charts.length} 个 ===`);
for (const [id, n] of charts.slice(0, 12)) {
  console.log(`  id=${id} name=${n.name} type=${n.type} ${bb(n)}`);
}

// 3) 在「内容区 con」附近按几何找 52 高的小节点
console.log('\n=== 高度 ≈52px 且宽度 <200 的节点（前 12）===');
let cnt = 0;
for (const [id, n] of byId) {
  const b = n.absoluteBoundingBox;
  if (!b) continue;
  if (Math.abs(b.height - 52) <= 3 && b.width < 200) {
    console.log(`  id=${id} name=${n.name} type=${n.type} ${bb(n)} text="${textOf(n).slice(0, 30)}"`);
    if (++cnt >= 12) break;
  }
}
