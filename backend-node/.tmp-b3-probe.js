/**
 * B-3 取证（只读）：section 2:3446 的文本事实是什么？产物拿到的是什么？
 *
 * 用法：env -i PATH=... HOME=... node .tmp-b3-probe.js
 */
const fs = require('fs');
const path = require('path');

const dir = 'workspace/custom-components/c-traffic-monitor-447d01cc';
const read = (p) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, p), 'utf8'));
  } catch {
    return null;
  }
};

const analysis = read('.checkpoint/analysis.json');
const shadow = read('.checkpoint/context-shadow.json');

const TARGET = '2:3446';

function dumpSections(node, depth = 0, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const n of node) dumpSections(n, depth, out);
    return out;
  }
  const id = node.figmaNodeId || node.figmaNode || node.nodeId || node.id;
  if (node.sectionId || id || node.title || node.type) {
    const texts = node.texts || node.textContent || node.contentTexts || node.labels;
    if (String(id) === TARGET || String(node.sectionId) === TARGET || texts) {
      out.push({
        depth,
        id,
        title: node.title || node.name,
        type: node.type,
        texts,
        anchor: node.sourceNodeIds,
      });
    }
  }
  for (const k of ['sections', 'effectiveSections', 'children', 'subSections']) {
    if (node[k]) dumpSections(node[k], depth + 1, out);
  }
  return out;
}

for (const [name, doc] of [['analysis', analysis], ['shadow', shadow]]) {
  if (!doc) {
    console.log(`\n### ${name}: 缺失`);
    continue;
  }
  console.log(`\n### ${name} 顶层键: ${Object.keys(doc).join(', ')}`);
  const plan = doc.subComponentPlan || (doc.context && doc.context.subComponentPlan);
  if (plan) {
    const secs = plan.effectiveSections || plan.sections || [];
    console.log(`   effectiveSections = ${secs.length}`);
    for (const s of secs) {
      const ids = [s.figmaNodeId, s.figmaNode, s.sectionId, ...(s.sourceNodeIds || [])].filter(Boolean).join(',');
      console.log(
        `   - id=${s.id || '?'} type=${s.type || '?'} title=${JSON.stringify(s.title || s.name || '')} figma=[${ids}]`,
      );
      const t = s.texts || s.textContent || s.contentTexts;
      if (t) console.log(`       texts=${JSON.stringify(t).slice(0, 300)}`);
    }
  }
  const gi = doc.generationInput || (doc.context && doc.context.generationInput);
  if (gi) {
    console.log(`   generationInput 键: ${Object.keys(gi).join(', ')}`);
    const s2 = gi.sections || gi.layoutSections;
    if (Array.isArray(s2)) {
      for (const s of s2) {
        const ids = [s.figmaNodeId, s.figmaNode, ...(s.sourceNodeIds || [])].filter(Boolean).join(',');
        console.log(`   gi - id=${s.id || '?'} type=${s.type || '?'} figma=[${ids}] texts=${JSON.stringify(s.texts || s.textContent || s.labels || null).slice(0, 240)}`);
      }
    }
  }
}
