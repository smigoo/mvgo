/**
 * B-2 取证：为什么 healAbsoluteOverlayParents 没给 .c-traffic-monitor-card 补 position:relative？
 * 只读，用 dist 真函数。
 *
 * 用法：env -i PATH=... HOME=... node .tmp-b2-probe.js
 */
const fs = require('fs');
const path = require('path');

const { healAbsoluteOverlayParents } = require('./dist/ai-engine/roles/microcode/resource-mounter.js');

const F = 'workspace/custom-components/c-traffic-monitor-447d01cc/package/components/CardGrid.vue';
const content = fs.readFileSync(F, 'utf8');
const files = { 'package/components/CardGrid.vue': content };

const styleBlock = (content.match(/<style[^>]*>([\s\S]*?)<\/style>/i) || [])[1] || '';
const tplBlock = (content.match(/<template[^>]*>([\s\S]*?)<\/template>/i) || [])[1] || '';

// 复刻自愈器第 1 步
const absClasses = new Set();
const ruleRe = /\.([a-zA-Z][\w-]*)\s*\{([^{}]*)\}/g;
let rm;
while ((rm = ruleRe.exec(styleBlock)) !== null) {
  if (/position\s*:\s*absolute/i.test(rm[2])) absClasses.add(rm[1]);
}
console.log('① style 块中 position:absolute 的 class：', [...absClasses]);

// 复刻第 2 步：找直接父 class
const parentClsSet = new Set();
const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>/])*)(\/?)>/g;
const VOID = /^(img|br|hr|input|meta|link|source|path|circle|rect)$/i;
const stack = [];
let m;
const hits = [];
while ((m = tagRe.exec(tplBlock)) !== null) {
  const [, slash, tag, attrs, selfClose] = m;
  if (slash) {
    stack.pop();
    continue;
  }
  const clsM = attrs.match(/(?:^|\s)class="([^"]*)"/);
  const cls = clsM ? clsM[1] : '';
  for (const c of cls.split(/\s+/).filter(Boolean)) {
    if (absClasses.has(c)) {
      const parent = stack[stack.length - 1];
      hits.push({ absClass: c, parentCls: parent ? parent.cls : '(无父)' });
      if (parent && parent.cls) for (const pc of parent.cls.split(/\s+/).filter(Boolean)) parentClsSet.add(pc);
    }
  }
  if (!selfClose && !VOID.test(tag)) stack.push({ tag, cls });
}
console.log('② absolute 元素 → 直接父元素 class：');
for (const h of hits) console.log(`     .${h.absClass}  ←  父 "${h.parentCls}"`);
console.log('   待检查的父 class 集合：', [...parentClsSet]);

// ③ 这些父 class 是否已有 position？
for (const pc of parentClsSet) {
  const esc = pc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('\\.' + esc + '\\s*\\{([^{}]*)\\}', 'g');
  let hasPosition = false;
  let prm;
  const found = [];
  while ((prm = re.exec(styleBlock)) !== null) {
    found.push(prm[1].replace(/\s+/g, ' ').trim().slice(0, 80));
    if (/position\s*:/i.test(prm[1])) hasPosition = true;
  }
  console.log(`    .${pc}: 规则数=${found.length} hasPosition=${hasPosition}`);
  for (const f of found) console.log(`        { ${f} }`);
}

// ④ 真跑自愈器
const fixed = healAbsoluteOverlayParents(files, { logger: { warn() {} } });
console.log('④ healAbsoluteOverlayParents 修复项：', JSON.stringify(fixed));
console.log('   内容是否变化：', files['package/components/CardGrid.vue'] !== content);
