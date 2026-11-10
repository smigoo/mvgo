/**
 * component-acceptance 判据 spec（2026-11-10 立项 · D1 单一事实源）
 * 阳性夹具：0dce5e24 五 FAIL 实况形态；阴性：b15aa33a 零 FAIL 形态。
 */
import { runAcceptanceChecks, formatAcceptanceGuidance, identifyNodeRole } from './index.js';

const TABS_TEMPLATE = (bind) => `<template>
  <div data-section-id="2:7954" class="c-x-tabs">${bind}</div>
</template>`;

const INDEX_WITH_IMPORTS = (imports) => `<template><base-panel><TabsSection /><SubHeader /></base-panel></template>
<script setup>
${imports.map((i) => `import ${i} from './components/${i}.vue'`).join('\n')}
</script>`;

describe('runAcceptanceChecks（判分闭环 D1 单一事实源）', () => {
  const figmaNodeData = {
    document: {
      id: '0:0',
      children: [
        {
          id: '2:7952',
          name: '重点车辆监测',
          children: [
            { id: '2:7954', name: 'tabs', type: 'FRAME', children: [
              { id: 't1', type: 'TEXT', characters: '江阴靖江长江隧道' },
              { id: 't2', type: 'TEXT', characters: '江阴大桥' },
            ] },
            { id: '136:122', name: 'sub-header', type: 'FRAME', children: [
              { id: 's1', type: 'TEXT', characters: '今日累计' },
            ] },
            { id: '136:120', name: 'header', type: 'FRAME', children: [
              { id: 'h1', type: 'TEXT', characters: '重点车辆监测' },
            ] },
          ],
        },
      ],
    },
  };

  it('① 阳性：tab 无绑定 + sub-header 缺失 + 双 bg + 悬空引用 + 重叠 ⇒ 5 类 FAIL', () => {
    const files = {
      'package/index.vue': INDEX_WITH_IMPORTS(['TabsSection', 'SubHeader', 'Ghost']),
      // tab 静态渲染无 @click（G1-v2 命中）；「今日累计」不存在（A1-v2 命中）
      'package/components/TabsSection.vue': TABS_TEMPLATE('<span>江阴靖江长江隧道</span><span>江阴大桥</span>'),
      'package/components/SubHeader.vue': '<template><div>别的文字</div></template>',
      'package/components/StatsSection.vue':
        '<template><div :style="{ backgroundImage: `url(${bg})` }" style="background-image:url(\'a.png\')"></div></template>',
    };
    const r = runAcceptanceChecks({
      files,
      figmaNodeData,
      textOverlaps: [{ a: '客车', b: '江阴靖江长江隧道', ratio: 0.49 }],
    });
    const codes = r.fails.map((f) => f.code);
    expect(codes).toContain('G1-v2');
    expect(codes).toContain('A1-v2');
    expect(codes).toContain('E3-v2');
    expect(codes).toContain('Dangling');
    expect(codes).toContain('D2');
  });

  it('② 阴性：tab 有绑定 + 段文本齐全 + 单 bg + 闭包闭合 ⇒ 零 FAIL', () => {
    const files = {
      'package/index.vue': INDEX_WITH_IMPORTS(['TabsSection', 'SubHeader']),
      'package/components/TabsSection.vue': TABS_TEMPLATE(
        '<div v-for="t in tabs" :class="{ active: activeTab === t.key }" @click="handleTabChange(t.key)">{{ t.label }}</div>',
      ) + '\n<script setup>\nimport { ref } from "vue"\nconst tabs = [{ key: "a", label: "江阴靖江长江隧道" }, { key: "b", label: "江阴大桥" }]\nconst activeTab = ref("a")\nfunction handleTabChange(k) { activeTab.value = k }\n</script>',
      'package/components/SubHeader.vue': '<template><div>今日累计</div></template>',
      'package/components/StatsSection.vue':
        '<template><div :style="{ backgroundImage: `url(${bg})` }"></div></template>',
    };
    const r = runAcceptanceChecks({ files, figmaNodeData });
    expect(r.fails).toHaveLength(0);
  });

  it('③ header 段豁免：标题由宿主渲染，产物无此文本不算缺失', () => {
    const files = {
      'package/index.vue': '<template><base-panel><div>x</div></base-panel></template>',
    };
    const r = runAcceptanceChecks({ files, figmaNodeData });
    const a1 = r.fails.filter((f) => f.code === 'A1-v2' && f.detail.includes('重点车辆监测'));
    expect(a1).toHaveLength(0);
  });

  it('④ formatAcceptanceGuidance：空清单返回空串，非空返回编号列表', () => {
    expect(formatAcceptanceGuidance([])).toBe('');
    const g = formatAcceptanceGuidance([{ code: 'D2', detail: '文本重叠 1 对' }]);
    expect(g).toContain('[D2]');
    expect(g).toContain('必须逐条消除');
  });
});

describe('identifyNodeRole 与 _identifyNodeType 口径一致性（naming 向下兼容 P1）', () => {
  it('① bg-tab-active → bg（R10 误判形态天然排除）', () => {
    expect(identifyNodeRole('bg-tab-active')).toBe('bg');
  });
  it('② tabs-icon → icon（拆分例外容器）', () => {
    expect(identifyNodeRole('tabs-icon')).toBe('icon');
  });
  it('③ tab-active / tab-x → business（业务容器，G1-v2 命中域）', () => {
    expect(identifyNodeRole('tab-active')).toBe('business');
    expect(identifyNodeRole('tab-list')).toBe('business');
  });
  it('④ title-bg-x → chrome（面板装饰例外）', () => {
    expect(identifyNodeRole('title-bg-main')).toBe('chrome');
  });
  it('⑤ G1-v2 guidance 附交互修复模板（治 effective=false）', () => {
    const g = formatAcceptanceGuidance([
      { code: 'G1-v2', detail: 'tab 段 2:7954 无切换绑定' },
    ]);
    expect(g).toContain('handleTabChange');
    expect(g).toContain('activeTab');
    expect(g).toContain('@click');
  });
});

describe('E3-v3 卡级 bg 强制（车辆 30a318a9 实锤：卡图挂祖先）', () => {
  const figMulti = {
    document: {
      id: '0:0',
      children: [{
        id: '2:7952', name: 'cp-重点车辆监测', children: [
          { id: '136:120', name: 'slot', children: [
            { id: '136:127', name: '1', type: 'FRAME', fills: [{ type: 'IMAGE', visible: true }] },
            { id: '136:128', name: '2', type: 'FRAME', fills: [{ type: 'IMAGE', visible: true }] },
            { id: '136:129', name: '3', type: 'FRAME', fills: [{ type: 'IMAGE', visible: true }] },
          ] },
        ],
      }],
    },
  };

  it('① 阳性：三卡真值各带 bg，产物卡级无 backgroundImage ⇒ E3-v3 FAIL', () => {
    const files = {
      'package/index.vue': `<template><base-panel>
  <div data-section-id="136:120" :style="{ backgroundImage: 'url(' + bg3 + ')' }">
    <div data-section-id="136:127">A</div>
    <div data-section-id="136:128">B</div>
    <div data-section-id="136:129">C</div>
  </div></base-panel></template>`,
    };
    const r = runAcceptanceChecks({ files, figmaNodeData: figMulti });
    expect(r.fails.some((f) => f.code === 'E3-v3')).toBe(true);
  });

  it('② 阴性：每卡各自带 backgroundImage ⇒ 无 E3-v3', () => {
    const files = {
      'package/index.vue': `<template><base-panel>
  <div data-section-id="136:120">
    <div data-section-id="136:127" :style="{ backgroundImage: 'url(' + bgA + ')' }">A</div>
    <div data-section-id="136:128" :style="{ backgroundImage: 'url(' + bgB + ')' }">B</div>
    <div data-section-id="136:129" :style="{ backgroundImage: 'url(' + bgC + ')' }">C</div>
  </div></base-panel></template>`,
    };
    const r = runAcceptanceChecks({ files, figmaNodeData: figMulti });
    expect(r.fails.filter((f) => f.code === 'E3-v3')).toHaveLength(0);
  });
});
