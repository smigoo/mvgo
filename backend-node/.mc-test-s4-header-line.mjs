/**
 * S4-f 回归锚（2026-11-13 · 0669e091 实锤）：S4-b 整块注入重建**完整标题行**。
 * 病灶：tab 容器 2:3566 嵌在「流量预测标题行」section 2:3565 内（Figma 子树：
 *   2:3566 tab + 2:3571「流量预测」标题 + 2:3577「节假日预测>」链接），
 *   LLM 零承载 ⇒ S4-b 整块注入只重建 tab 条 ⇒ 标题/链接无人认领 ⇒ 副标题整行消失。
 * 修法：注入块按父 section 子树重建 标题(左)+tab条(中)+链接(右)。
 */
import { readFileSync } from 'node:fs';
import { injectTabInteractivity } from './src/ai-engine/validators/code-fix-rules.js';

let pass = 0, fail = 0;
const assert = (c, label, detail = '') => {
  if (c) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`); }
};

// ═══ 数据：0669e091 真实 Figma 真值 + 剥掉 S4 注入块的产物（模拟 LLM 原始输出）═══
const figma = JSON.parse(
  readFileSync('./data/figma-node-cache/1t7Dmmpsl5i0PC8BJt2QLf_2-9778_9e4c1b4f.json', 'utf-8'),
);
let indexSrc = readFileSync(
  './workspace/custom-components/c-traffic-monitor-0669e091/package/index.vue', 'utf-8',
);
// 剥 S4 已注入的 tabblock（含标题/链接 span）与 mcActiveTab 状态行 → 回到「LLM 零承载」态
indexSrc = indexSrc.replace(/\n[ \t]*<div class="mc-s4-tabblock"[\s\S]*?<\/div>\n[ \t]*<\/div>/, '');
indexSrc = indexSrc.replace(/^const mcActiveTab = ref\(0\)\n/m, '');
assert(!indexSrc.includes('mc-s4-tabblock'), 'fixture：产物已剥掉 S4 注入块（LLM 零承载态）');

const files = { 'package/index.vue': indexSrc };
const identify = (d) => {
  const ids = [];
  const stack = [d.document || d];
  while (stack.length) {
    const n = stack.pop();
    if (!n || typeof n !== 'object') continue;
    const nm = String(n.name || '').toLowerCase();
    const deco = /^bg|^icon|^image|^img/.test(nm) || nm.includes('背景') || nm.includes('图标');
    if (/\btab/.test(nm) && !deco) ids.push(String(n.id));
    if (Array.isArray(n.children)) stack.push(...n.children);
  }
  return ids;
};

console.log('■ 阳性：完整标题行重建（0669e091 真 2:3565）');
const r1 = injectTabInteractivity(files, figma, identify);
{
  const out = r1.files['package/index.vue'];
  assert(out.includes('mc-s4-tabblock'), 'tab 条注入（tabblock 存在）');
  assert(out.includes('mc-s4-tablist'), 'tablist 容器存在');
  assert(out.includes('>江阴靖江长江隧道</div>') && out.includes('>江阴大桥</div>'), 'tab 两项真值文本');
  assert(out.includes('mc-s4-row-title') && out.includes('>流量预测</span>'), '🔴 副标题「流量预测」恢复（核心断言）');
  assert(out.includes('mc-s4-row-link') && out.includes('>节假日预测></span>'), '「节假日预测>」链接恢复');
  assert(out.includes('data-section-id="2:3571"'), '标题带 Figma 真值锚 2:3571');
  // 落点：块必须在根内容容器（slot-con）内部
  const slotAt = out.indexOf('c-mc-max-1794540427510-0669e091');
  const blockAt = out.indexOf('mc-s4-tabblock');
  assert(slotAt > -1 && blockAt > slotAt, '注入块落在 slot-con 根容器内部');
  // 标题在 tab 条之前（设计：标题左）
  assert(out.indexOf('mc-s4-row-title') < out.indexOf('mc-s4-tablist'), '标题在 tab 条之前（标题左、tab 右）');
  assert((r1.stats.headerTextsRecovered || 0) >= 2, `stats.headerTextsRecovered=${r1.stats.headerTextsRecovered}`);
}
console.log('■ 幂等：二次注入不重复');
{
  const r2 = injectTabInteractivity(r1.files, figma, identify);
  const out2 = r2.files['package/index.vue'];
  const n = (out2.match(/mc-s4-tabblock/g) || []).length;
  assert(n === 1, `carrier 已有锚 ⇒ 不重复注入（tabblock×${n}）`);
  assert((out2.match(/>流量预测<\/span>/g) || []).length === 1, '标题不重复');
}
console.log('■ 阴性：父 section 无其他文本 ⇒ 只注入 tab 条（旧行为不回归）');
{
  // 构造：tab 2:9000 直接挂在纯容器 2:8999 下（无标题/链接兄弟）
  const figma2 = {
    document: {
      id: '0', name: 'root', type: 'FRAME',
      children: [{
        id: '2:8999', name: 'panel', type: 'FRAME',
        children: [{
          id: '2:9000', name: '@antd/tab', type: 'FRAME',
          children: [
            { id: '2:9001', name: 'btn-active', type: 'FRAME', children: [{ id: '2:9002', name: 't', type: 'TEXT', characters: '日检' }] },
            { id: '2:9003', name: 'btn', type: 'FRAME', children: [{ id: '2:9004', name: 't', type: 'TEXT', characters: '周检' }] },
          ],
        }],
      }],
    },
  };
  const f2 = { 'package/index.vue': '<template>\n  <div class="x-slot-con" style="display:flex;flex-direction:column;height:100%">\n  </div>\n</template>\n' };
  const r3 = injectTabInteractivity(f2, figma2, identify);
  const out3 = r3.files['package/index.vue'];
  assert(out3.includes('mc-s4-tabblock') && out3.includes('>日检</div>') && out3.includes('>周检</div>'), '纯 tab 注入正常');
  assert(!out3.includes('mc-s4-row-title') && !out3.includes('mc-s4-row-link'), '无标题/链接时不造空元素');
}

console.log(`\n═══ 结果：${pass} pass / ${fail} fail ═══`);
process.exit(fail > 0 ? 1 : 0);
