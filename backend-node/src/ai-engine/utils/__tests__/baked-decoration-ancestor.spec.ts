/**
 * 🛡️ 2026-11-05 装饰层祖先承载漏判
 *   方案：docs/2026-11-05-四任务样式各异根因修复方案.md §3.4
 *
 * 真机阳性对照：mc-max-1793849161646-723d52c3 的 ContentAction.vue +
 * resources/styles/common.less（用户报「c-env-monitor-action-btn 不应该有边框」）。
 * 验者比对产物 CSS 声明集合，不复用改者的标签栈实现。
 */
import {
  collectAncestorCarrierClasses,
  collectResourceCarrierClasses,
  stripBakedDecorationFromFiles,
} from '../../validators/code-fix-rules.js';

const VARS = new Set(['icon2', 'icon3']);

const MAPPING = [
  { resourceFile: '../resources/images/icon-7941.png', assignedVarName: 'icon2' },
  { resourceFile: '../resources/images/icon-7945.png', assignedVarName: 'icon3' },
];

const VUE = `<template>
  <div class="c-env-monitor-action" data-section-id="89:43" v-bind="$attrs">
    <div class="c-env-monitor-action-btn">
      <img :src="icon2" class="c-env-monitor-action-icon" alt="图表视图" />
    </div>
    <div class="c-env-monitor-action-btn">
      <img :src="icon3" class="c-env-monitor-action-icon" alt="列表视图" />
    </div>
  </div>
</template>
<script setup>
import icon2 from '../../resources/images/icon-7941.png'
import icon3 from '../../resources/images/icon-7945.png'
</script>`;

const LESS = `.c-env-monitor-action-btn {
  display: flex;
  align-items: center;
  width: 24px;
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid #a1ceff;
  border-radius: 4px;
  box-sizing: border-box;
}`;

const files = () => ({
  'package/components/ContentAction.vue': VUE,
  'resources/styles/common.less': LESS,
});

describe('C3/装饰层 · 祖先承载结构判据', () => {
  it('⭐ 阳性（723d52c3 真机片段）：唯一子元素是资源宿主的父容器入 carriers', () => {
    const carriers = collectAncestorCarrierClasses(VUE, VARS);
    expect(carriers.has('c-env-monitor-action-btn')).toBe(true);
    // 多兄弟的祖先容器不得入 carriers（防误剥整个 section）
    expect(carriers.has('c-env-monitor-action')).toBe(false);
  });

  it('⭐ 阳性：端到端剥掉 border / border-radius，保留布局与纯色背景', () => {
    const out = stripBakedDecorationFromFiles(files(), MAPPING);
    const css = out['resources/styles/common.less'];
    expect(css).not.toContain('border: 1px solid #a1ceff');
    expect(css).not.toContain('border-radius: 4px');
    expect(css).toContain('display: flex');
    expect(css).toContain('width: 24px');
    expect(css).toContain('background: rgba(255, 255, 255, 0.6)');
    expect(css).toContain('box-sizing: border-box');
  });

  it('幂等：重复执行结果逐字相同', () => {
    const once = stripBakedDecorationFromFiles(files(), MAPPING);
    const twice = stripBakedDecorationFromFiles(once, MAPPING);
    expect(twice['resources/styles/common.less']).toBe(once['resources/styles/common.less']);
  });

  it('阴性：多兄弟父容器（含文本与其他子元素）不入 carriers', () => {
    const tpl = `<template><div class="wrap"><div class="btn"><img :src="icon2" /></div><span>文字</span></div></template>`;
    const carriers = collectAncestorCarrierClasses(tpl, VARS);
    expect(carriers.has('wrap')).toBe(false);
    expect(carriers.has('btn')).toBe(true);
  });

  it('阴性：父容器自身不含资源宿主 ⇒ 不入 carriers，装饰不被剥', () => {
    const tpl = `<template><div class="plain-box"><span>纯文本</span></div></template>`;
    expect(collectAncestorCarrierClasses(tpl, VARS).size).toBe(0);
    const out = stripBakedDecorationFromFiles(
      { 'package/index.vue': tpl, 'resources/styles/common.less': `.plain-box { border: 1px solid #fff; }` },
      MAPPING,
    );
    expect(out['resources/styles/common.less']).toContain('border: 1px solid #fff');
  });

  it('阴性：属性里含 > 的标签不会截断标签栈', () => {
    const tpl = `<template><div class="btn" data-x="a>b"><img :src="icon2" /></div></template>`;
    expect(collectAncestorCarrierClasses(tpl, VARS).has('btn')).toBe(true);
  });

  it('回归：单 img 形态下祖先判据只收直接父容器，不重复收 img 自身', () => {
    // 既有 ① 模板信号的 tagRe 不认 `/>` 自闭合，属其既有口径；端到端零回归由
    // baked-decoration-strip.spec.ts 全绿保证，此处只验证新增判据自身。
    const tpl = `<template><div class="root"><img :src="icon2" class="icon-btn" /></div></template>`;
    const carriers = collectAncestorCarrierClasses(tpl, VARS);
    expect(carriers.has('root')).toBe(true);
    expect(carriers.has('icon-btn')).toBe(false);
    // 既有 ① 仍按原口径独立工作（不被本刀改写）
    expect(collectResourceCarrierClasses({ 'package/index.vue': VUE }, MAPPING).carriers.has('c-env-monitor-action-btn')).toBe(true);
  });

  it('🔴 收紧判据阳性：带 :style 背景图的 div 不得触发父容器承载推定', () => {
    // 既有 spec 的 tab-item 形态：唯一子元素是 CSS 背景承载 div，不是 <img>。
    const tpl = `<template><div class="tab-item"><div :style="{ backgroundImage: 'url(' + bg3 + ')' }"></div></div></template>`;
    expect(collectAncestorCarrierClasses(tpl, new Set(['bg3'])).has('tab-item')).toBe(false);
  });
});
