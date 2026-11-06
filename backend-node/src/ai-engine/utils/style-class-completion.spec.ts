/**
 * 🧵 样式补缺（2026-11-06 · mc-max-1799319861321-a9364bd4 实锤）
 *
 * 真机：`common.less` 只写了 21 个类，模板用了 59 个 ⇒ 38 个类零规则；其中
 * `ContentForecast` 的 24 个 `forecast-*` 全缺 ⇒ 该段渲染成裸文本堆叠（结构在、样式无）。
 * 既有 `CLASS-MUST-EXIST` 检出 38 个却只 WARN（reportOnly），没人补。
 *
 * 本 spec 锁「差距计算」与「回收过滤」两块确定性逻辑（LLM 调用不在本层）：
 *  · 缺一个都不能算齐；伪类/动态片段不得被当成类名；
 *  · 回收时**只吃缺失类**，已定义规则绝不能被覆盖（宁可漏补也不能把好的改坏）。
 */
import {
  buildStructuralFallback,
  buildStructuralRule,
  appendRules,
  collectDefinedClasses,
  collectTemplateClassTokens,
  collectUsedClasses,
  diffMissingClasses,
  harvestMissingRuleBlocks,
} from './style-class-completion.js';

describe('样式补缺 · 差距计算', () => {
  it('⭐ 阳性：模板类 − 样式表类 = 缺失清单（真机 forecast 族形态）', () => {
    const vue = `<template>
  <div class="c-traffic-monitor-content-forecast">
    <div class="c-traffic-monitor-forecast-sub-header">
      <span class="c-traffic-monitor-forecast-tit-text">流量预测</span>
    </div>
    <div class="c-traffic-monitor-forecast-accuracy"></div>
  </div>
</template>`;
    const files = { 'package/components/ContentForecast.vue': vue };
    const defined = collectDefinedClasses(`
.c-traffic-monitor-content-forecast { display: flex; }
.c-traffic-monitor-slot-con { height: 100%; }
`);
    const used = collectUsedClasses([], files);
    const missing = diffMissingClasses(used, defined);
    expect(missing).toEqual([
      'c-traffic-monitor-forecast-sub-header',
      'c-traffic-monitor-forecast-tit-text',
      'c-traffic-monitor-forecast-accuracy',
    ]);
  });

  it('⭐ 阳性：传入的 classNamesList 与模板扫描并集去重（不重复计）', () => {
    const files = { 'package/components/A.vue': '<template><div class="a b">x</div></template>' };
    const used = collectUsedClasses(['a', 'c'], files);
    expect(used).toEqual(['a', 'c', 'b']);
  });

  it('阴性：伪类/动态片段/插值不被当类名（避免假缺失）', () => {
    const vue = '<template><div class="a {{ dyn }}" :class="{ \'x--on\': on }"><span class="b:c">y</span></div></template>';
    expect(collectTemplateClassTokens(vue)).toEqual(['a']);
  });

  it('阴性：选择器内的类才算已定义（声明里的 .foo 字符串不算）', () => {
    const css = `.a { content: ".b"; }\n@media (min-width: 1px) { .c { color: red } }`;
    const d = collectDefinedClasses(css);
    expect(d.has('a')).toBe(true);
    expect(d.has('c')).toBe(true);
    expect(d.has('b')).toBe(false);
  });

  it('阴性：used 全部已定义 ⇒ 缺失为空（不误触发补缺）', () => {
    const files = { 'package/components/A.vue': '<template><div class="a b">x</div></template>' };
    const d = collectDefinedClasses('.a{}.b{}');
    expect(diffMissingClasses(collectUsedClasses([], files), d)).toEqual([]);
  });
});

describe('样式补缺 · 结构性兜底（A：只补布局骨架，不猜视觉）', () => {
  const files = {
    'package/components/A.vue': `<template>
  <div class="c-x-sec">
    <div class="c-x-row"><span class="c-x-txt">文字</span></div>
  </div>
</template>`,
  };

  it('⭐ 阳性：容器类补 display/flex-direction/min-width；文本叶子只补 box-sizing', () => {
    const fb = buildStructuralFallback(['c-x-sec', 'c-x-row', 'c-x-txt'], files);
    expect(fb.covered).toEqual(['c-x-sec', 'c-x-row', 'c-x-txt']);
    expect(fb.blocks[0]).toBe('.c-x-sec { box-sizing: border-box; display: flex; flex-direction: column; min-width: 0; }');
    expect(fb.blocks[2]).toBe('.c-x-txt { box-sizing: border-box; }');
  });

  it('反向：绝不写颜色/字号/宽高/圆角（兜底不是"还原"）', () => {
    const rule = buildStructuralRule('c-x-sec', { hasElementChildren: true });
    expect(rule).not.toMatch(/color|font-size|height|border-radius|box-shadow|background/i);
    // 只允许 `min-width`（缩小约束），不允许固定 `width:`
    expect(rule.replace(/min-width:\s*0;/g, '')).not.toMatch(/\bwidth\s*:/);
  });

  it('反向：模板里找不到宿主的类 ⇒ 跳过（不凭空造规则）', () => {
    const fb = buildStructuralFallback(['c-not-in-template'], files);
    expect(fb.blocks).toEqual([]);
    expect(fb.skipped).toEqual(['c-not-in-template']);
  });
});

describe('样式补缺 · 回收过滤（只吃缺失类，绝不覆盖）', () => {
  const missing = new Set(['c-x-a', 'c-x-b']);
  const defined = new Set(['c-x-root']);

  it('⭐ 阳性：只摘缺失类的块；模型重写已有类也一律丢弃', () => {
    const llm = `
.c-x-root { display: block; }        /* 已存在 ⇒ 丢 */
.c-x-a { display: flex; gap: 4px; }
.c-x-b { min-width: 0; }
.c-other { color: red; }             /* 不在缺失清单 ⇒ 丢 */
`;
    const blocks = harvestMissingRuleBlocks(llm, missing, defined);
    expect(blocks).toEqual([
      '.c-x-a { display: flex; gap: 4px; }',
      '.c-x-b { min-width: 0; }',
    ]);
  });

  it('阴性：空块 / @media 头 / 纯注释一律不摘', () => {
    const llm = `@media (min-width: 1px) { .c-x-a { display: flex; } }\n.c-x-a { }\n/* .c-x-b {} */`;
    const blocks = harvestMissingRuleBlocks(llm, missing, defined);
    // @media 头被跳过；空块不摘；注释块不进 append（无 body）
    expect(blocks).toEqual([]);
  });

  it('appendRules：保留原内容并追加说明注释（不改写已有规则）', () => {
    const out = appendRules('.a { color: red; }\n', ['.b { display: flex; }']);
    expect(out).toContain('.a { color: red; }');
    expect(out).toContain('[样式补缺]');
    expect(out).toContain('.b { display: flex; }');
    // 空块数组 ⇒ 原样返回（幂等）
    expect(appendRules('.a{}', [])).toBe('.a{}');
  });
});
