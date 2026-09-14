/**
 * 🛡️ FLEX-005 兄弟组感知回归测试（2026-09-01 缺口③ 治理）
 *
 * 事故实证 mc-max-1788186816669-8f7b5097：.c-monitor-root 五个兄弟区块里
 * tunnel/vehicle/flow 生效值为 scoped 像素量级（131/142/180），
 * daily/bridge 为 common.less 比例量级（15/17）→ 前三者独占 ~85% 高度，
 * 与 Figma 真值（各约 12~17%）严重不符。
 *
 * 既有 FLEX-004 是无兄弟组归属性的全局 WARN（值分属互不相干嵌套容器时属正常，
 * 误报面大）；FLEX-005 补上「可证兄弟组」层：解析 template DOM 按父容器分组真兄弟，
 * 组内可证地像素量级与比例量级混排 → BLOCK。
 *
 * 判定纪律（BLOCK 必须可证，宁可漏报不可误杀）：
 *   ① 兄弟组 = 同一父元素直接子元素；② 父容器可证 flex；③ 生效 grow scoped 优先；
 *   ④ 多值歧义兄弟交 FLEX-003，不参与量纲判定；⑤ grow=0 附属区不参与。
 */
import { describe, it, expect } from '@jest/globals';
import {
  FLEX_GROW_SCALES,
  classifyGrowScale,
  extractStyleBlocks,
  parseGrowFromFlexValue,
  parseVueTemplate,
  resolveClassGrows,
  collectStyleSources,
  buildFlexIndex,
  detectFlexSiblingIssues,
  healMissingFlexContainers,
} from '../flex-sibling-guard.js';
import { CodeStructureValidator } from '../../validators/code-structure-validator.js';

const V: any = CodeStructureValidator;

/** 事故形态复刻：index.vue 组件标签兄弟组 + 子组件根 class + common.less 比例量级 + scoped 像素量级 */
const mkAccidentFiles = () => [
  {
    path: 'package/index.vue',
    content: `<template>
  <div class="c-test-root">
    <SectionA />
    <SectionB />
  </div>
</template>
<script setup>
import SectionA from './components/SectionA.vue'
import SectionB from './components/SectionB.vue'
</script>`,
  },
  {
    path: 'package/components/SectionA.vue',
    content: `<template>
  <div class="c-test-section-a"><span>图表</span></div>
</template>
<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-test-section-a { flex: 131 1 0; min-height: 0; }
</style>`,
  },
  {
    path: 'package/components/SectionB.vue',
    content: `<template>
  <div class="c-test-section-b"><span>列表</span></div>
</template>`,
  },
  {
    path: 'resources/styles/common.less',
    content: `.c-test-root { display: flex; flex-direction: column; }
.c-test-section-a { flex: 17 1 0; }
.c-test-section-b { flex: 15 1 0; }`,
  },
];

describe('FLEX-005 纯函数：parseGrowFromFlexValue / classifyGrowScale', () => {
  it('解析三元组 / 裸简写 / grow-only，非数值返回 null', () => {
    expect(parseGrowFromFlexValue('131 1 0')).toBe(131);
    expect(parseGrowFromFlexValue('1')).toBe(1);
    expect(parseGrowFromFlexValue('grow: 5')).toBe(5);
    expect(parseGrowFromFlexValue('none')).toBeNull();
    expect(parseGrowFromFlexValue('1 1 auto')).toBe(1);
  });

  it('量纲分类无灰区：19=比例、20=像素、0/非法不参与', () => {
    expect(classifyGrowScale(19)).toBe('ratio');
    expect(classifyGrowScale(20)).toBe('pixel');
    expect(classifyGrowScale(12)).toBe('ratio');
    expect(classifyGrowScale(131)).toBe('pixel');
    expect(classifyGrowScale(0)).toBeNull();
    expect(classifyGrowScale(-1)).toBeNull();
    expect(FLEX_GROW_SCALES.PIXEL_MIN - FLEX_GROW_SCALES.RATIO_MAX).toBe(1);
  });
});

describe('FLEX-005 纯函数：extractStyleBlocks @import 粘连修复', () => {
  it('顶层 @import 不再与首条规则 selector 粘连（事故实锤：scoped 131 整块丢失）', () => {
    const style = `@import '../../resources/styles/index.less';

.c-test-section-a { flex: 131 1 0; min-height: 0; }
.c-test-b { color: red; }`;
    const blocks = extractStyleBlocks(style);
    const hit = blocks.find((b: any) => b.selector === '.c-test-section-a');
    expect(hit).toBeDefined();
    expect(hit.body).toContain('131 1 0');
  });
});

describe('FLEX-005 纯函数：parseVueTemplate 兄弟组解析', () => {
  it('组件标签兄弟组 + 行号定位', () => {
    const tpl = `<template>
  <div class="c-test-root">
    <SectionA />
    <SectionB />
  </div>
</template>`;
    const p = parseVueTemplate(tpl);
    expect(p.hasTemplate).toBe(true);
    expect(p.groups).toHaveLength(1);
    expect(p.groups[0].parent.classes).toContain('c-test-root');
    expect(p.groups[0].siblings.map((s: any) => s.tag)).toEqual(['SectionA', 'SectionB']);
    expect(p.groups[0].siblings[0].line).toBe(3);
  });

  it('void 元素（img）不入栈、注释剥离、引号内 > 不截断标签', () => {
    const tpl = `<template>
  <div class="root" style="display:flex">
    <!-- 占位注释不算兄弟 -->
    <img src="a.png" />
    <div class="a" title="x > y">A</div>
    <div class="b" style="flex: 131 1 0">B</div>
  </div>
</template>`;
    const p = parseVueTemplate(tpl);
    expect(p.groups).toHaveLength(1);
    const tags = p.groups[0].siblings.map((s: any) => s.tag);
    expect(tags).toEqual(['img', 'div', 'div']);
    const b = p.groups[0].siblings.find((s: any) => s.classes.includes('b'));
    expect(b.inlineGrows).toEqual([131]);
    expect(p.groups[0].parent.inlineDisplayFlex).toBe(true);
  });

  it(':class 动态绑定不参与静态解析（无静态 class 时 classes 为空）', () => {
    const tpl = `<template><div class="root"><div :class="dyn">A</div><div class="b">B</div></div></template>`;
    const p = parseVueTemplate(tpl);
    expect(p.groups[0].siblings[0].classes).toEqual([]);
    expect(p.groups[0].siblings[1].classes).toEqual(['b']);
  });
});

describe('FLEX-005 纯函数：resolveClassGrows scoped 优先', () => {
  it('scoped 源恒胜非 scoped（编译后 (0,2,0) > (0,1,0) 事故机制）', () => {
    const sources = [
      { file: 'SectionA.vue', scoped: true, content: '.c-a { flex: 131 1 0; }' },
      { file: 'common.less', scoped: false, content: '.c-a { flex: 17 1 0; }' },
    ];
    const fi = buildFlexIndex(sources);
    const r = resolveClassGrows('c-a', fi);
    expect(r.grows).toEqual([131]);
    expect(r.ambiguous).toBe(false);
    expect(r.sourceFiles).toEqual(['SectionA.vue']);
  });

  it('同 scopedness 多值 → ambiguous（交 FLEX-003，不参与量纲判定）', () => {
    const sources = [
      { file: 'a.less', scoped: false, content: '.c-a { flex: 1; }' },
      { file: 'b.less', scoped: false, content: '.c-a { flex: 17 1 0; }' },
    ];
    const fi = buildFlexIndex(sources);
    const r = resolveClassGrows('c-a', fi);
    expect(r.ambiguous).toBe(true);
  });
});

describe('FLEX-005 纯函数：detectFlexSiblingIssues', () => {
  it('事故复刻：组件标签兄弟组 scoped 像素量级 vs common.less 比例量级 → BLOCK', () => {
    const issues = detectFlexSiblingIssues(mkAccidentFiles());
    const f5 = issues.filter((i: any) => i.id === 'FLEX-005');
    expect(f5).toHaveLength(1);
    expect(f5[0].severity).toBe('BLOCK');
    expect(f5[0].file).toBe('package/index.vue');
    // 文案必须携带兄弟明细与量级标记，LLM 重试才能定点修复
    expect(f5[0].message).toContain('.c-test-root');
    expect(f5[0].message).toContain('131');
    expect(f5[0].message).toContain('15');
    expect(f5[0].message).toContain('像素量级');
    expect(f5[0].message).toContain('比例量级');
    expect(f5[0].message).toContain('SectionA.vue');
  });

  it('同文件兄弟（原生 div）：父 display:flex + 180/12 混排 → BLOCK', () => {
    const files = [
      {
        path: 'package/index.vue',
        content: `<template>
  <div class="c-t-root">
    <div class="c-t-a">A</div>
    <div class="c-t-b">B</div>
  </div>
</template>`,
      },
      {
        path: 'resources/styles/common.less',
        content: `.c-t-root { display: flex; flex-direction: column; }
.c-t-a { flex: 180 1 0; }
.c-t-b { flex: 12 1 0; }`,
      },
    ];
    const f5 = detectFlexSiblingIssues(files).filter((i: any) => i.id === 'FLEX-005');
    expect(f5).toHaveLength(1);
    expect(f5[0].message).toContain('180');
    expect(f5[0].message).toContain('12');
  });

  it('inline style flex + 父 inline display:flex → BLOCK', () => {
    const files = [
      {
        path: 'package/index.vue',
        content: `<template>
  <div style="display: flex; flex-direction: column">
    <div style="flex: 131 1 0">A</div>
    <div class="c-t-b">B</div>
  </div>
</template>`,
      },
      {
        path: 'resources/styles/common.less',
        content: `.c-t-b { flex: 15 1 0; }`,
      },
    ];
    const f5 = detectFlexSiblingIssues(files).filter((i: any) => i.id === 'FLEX-005');
    expect(f5).toHaveLength(1);
  });

  it('负面对照：全像素量级同组（规范要求写法）→ 零 FLEX-005', () => {
    const files = mkAccidentFiles().map((f) =>
      f.path === 'resources/styles/common.less'
        ? {
            path: f.path,
            content: `.c-test-root { display: flex; flex-direction: column; }
.c-test-section-a { flex: 131 1 0; }
.c-test-section-b { flex: 142 1 0; }`,
          }
        : f.path === 'package/components/SectionA.vue'
          ? { ...f, content: f.content.replace('flex: 131 1 0', 'flex: 131 1 0') }
          : f,
    );
    expect(detectFlexSiblingIssues(files).filter((i: any) => i.id === 'FLEX-005')).toHaveLength(0);
  });

  it('负面对照：全比例量级同组 → 零 FLEX-005', () => {
    const files = mkAccidentFiles().map((f) =>
      f.path === 'package/components/SectionA.vue'
        ? { ...f, content: f.content.replace('flex: 131 1 0', 'flex: 17 1 0') }
        : f,
    );
    expect(detectFlexSiblingIssues(files).filter((i: any) => i.id === 'FLEX-005')).toHaveLength(0);
  });

  it('负面对照：父容器不可证 flex（无 display:flex）→ 零 FLEX-005（flex 声明惰性）', () => {
    const files = mkAccidentFiles().map((f) =>
      f.path === 'resources/styles/common.less'
        ? {
            path: f.path,
            content: `.c-test-root { width: 100%; height: 100%; }
.c-test-section-a { flex: 17 1 0; }
.c-test-section-b { flex: 15 1 0; }`,
          }
        : f,
    );
    expect(detectFlexSiblingIssues(files).filter((i: any) => i.id === 'FLEX-005')).toHaveLength(0);
  });

  it('负面对照：grow=0 附属区不参与量纲统计（单 flex 承载兄弟不构成混排）', () => {
    const files = [
      {
        path: 'package/index.vue',
        content: `<template>
  <div class="c-t-root">
    <div class="c-t-a">A</div>
    <div class="c-t-footer" />
  </div>
</template>`,
      },
      {
        path: 'resources/styles/common.less',
        content: `.c-t-root { display: flex; flex-direction: column; }
.c-t-a { flex: 131 1 0; }
.c-t-footer { flex: 0 1 auto; }`,
      },
    ];
    expect(detectFlexSiblingIssues(files).filter((i: any) => i.id === 'FLEX-005')).toHaveLength(0);
  });

  it('负面对照：多值歧义兄弟（同 scopedness 多源不同值）不参与判定 → 交 FLEX-003', () => {
    const files = [
      {
        path: 'package/index.vue',
        content: `<template>
  <div class="c-t-root">
    <div class="c-t-a">A</div>
    <div class="c-t-b">B</div>
  </div>
</template>`,
      },
      {
        path: 'resources/styles/a.less',
        content: `.c-t-root { display: flex; }
.c-t-a { flex: 131 1 0; }`,
      },
      {
        path: 'resources/styles/b.less',
        content: `.c-t-a { flex: 1; }`,
      },
      {
        path: 'resources/styles/common.less',
        content: `.c-t-b { flex: 15 1 0; }`,
      },
    ];
    // c-t-a 在两个非 scoped 源里两套值 → ambiguous，组内无「确定像素」兄弟 → 不 BLOCK
    expect(detectFlexSiblingIssues(files).filter((i: any) => i.id === 'FLEX-005')).toHaveLength(0);
  });

  it('负面对照：嵌套容器各写各的（值分属互不相干组）→ 零 FLEX-005（FLEX-004 误报面根治）', () => {
    const files = [
      {
        path: 'package/index.vue',
        content: `<template>
  <div class="c-t-root">
    <div class="c-t-a"><div class="c-t-a-inner">i</div></div>
    <div class="c-t-b">B</div>
  </div>
</template>`,
      },
      {
        path: 'resources/styles/common.less',
        content: `.c-t-root { display: flex; flex-direction: column; }
.c-t-a { display: flex; flex-direction: column; }
.c-t-a-inner { flex: 131 1 0; }
.c-t-b { flex: 15 1 0; }`,
      },
    ];
    // c-t-a-inner 不是 c-t-b 的兄弟（隔了一层）；c-t-a 自身无 flex → 组内仅 1 个 flex 承载兄弟
    expect(detectFlexSiblingIssues(files).filter((i: any) => i.id === 'FLEX-005')).toHaveLength(0);
  });

  it('collectStyleSources：同名 .less 的 .css 编译产物排除 + scoped 标记', () => {
    const files = [
      {
        path: 'package/index.vue',
        content: `<template><div class="c-t-root"><div class="c-t-a" /><div class="c-t-b" /></div></template>
<style lang="less" scoped>
.c-t-a { flex: 1; }
</style>`,
      },
      { path: 'resources/styles/index.less', content: '.c-t-b { flex: 1; }' },
      { path: 'resources/styles/index.css', content: '.c-t-b { flex: 1 1 0; }' },
    ];
    const sources = collectStyleSources(files);
    expect(sources.map((s: any) => s.file)).toEqual(['package/index.vue', 'resources/styles/index.less']);
    expect(sources[0].scoped).toBe(true);
  });
});

describe('FLEX-005 L0-B 门禁集成（CodeStructureValidator）', () => {
  it('事故形态 → validator 输出 FLEX-005 BLOCK（fail-closed）', () => {
    const res = V.validate(mkAccidentFiles(), 'c-test', { target: 'microcode' });
    const f5 = res.issues.filter((i: any) => i.id === 'FLEX-005');
    expect(f5).toHaveLength(1);
    expect(f5[0].severity).toBe('BLOCK');
  });

  it('统一为像素量纲后 → 零 FLEX-005（自愈路径不误杀）', () => {
    const files = mkAccidentFiles().map((f) =>
      f.path === 'package/components/SectionA.vue'
        ? { ...f, content: f.content.replace('flex: 131 1 0', 'flex: 131 1 0') }
        : f.path === 'resources/styles/common.less'
          ? {
              path: f.path,
              content: `.c-test-root { display: flex; flex-direction: column; }
.c-test-section-a { flex: 131 1 0; }
.c-test-section-b { flex: 142 1 0; }`,
            }
          : f,
    );
    const res = V.validate(files, 'c-test', { target: 'microcode' });
    expect(res.issues.filter((i: any) => i.id === 'FLEX-005')).toHaveLength(0);
  });

  it('既有 FLEX-003/004 门禁不受 FLEX-005 接入影响（同批 issues 并存）', () => {
    const res = V.validate(mkAccidentFiles(), 'c-test', { target: 'microcode' });
    const ids = new Set(res.issues.filter((i: any) => /^FLEX-\d/.test(i.id)).map((i: any) => i.id));
    // 事故形态同时命中 003（scoped vs common 同 class 两套值）+ 005（兄弟组量纲混用）
    expect(ids.has('FLEX-003')).toBe(true);
    expect(ids.has('FLEX-005')).toBe(true);
  });
});

describe('healMissingFlexContainers —— 刀 20：父容器缺 display:flex', () => {
  const indexVue = (slotCls: string) => `<template>
  <div class="c-x-slot-con">
    <SwitchSection />
    <TabsSection />
    <MainSection />
  </div>
</template>
<script setup>
import SwitchSection from './components/SwitchSection.vue'
import TabsSection from './components/TabsSection.vue'
import MainSection from './components/MainSection.vue'
</script>`;

  const build = (slotCls: string) => {
    const index = `<template>
  <div class="${slotCls}">
    <SwitchSection />
    <TabsSection />
    <MainSection />
  </div>
</template>

<script setup>
import SwitchSection from './components/SwitchSection.vue'
import TabsSection from './components/TabsSection.vue'
import MainSection from './components/MainSection.vue'
</script>`
    const switchVue = `<template><div class="c-x-switch">s</div></template>`
    const tabsVue = `<template><div class="c-x-tabs-section">t</div></template>`
    const mainVue = `<template><div class="c-x-main-section">m</div></template>`
    const less = `.c-x-slot-con { width: 100%; height: 100%; }
.c-x-switch { flex: 0 0 180px; }
.c-x-tabs-section { flex: 1 1 0; width: 100%; }
.c-x-main-section { flex: 1 1 0; }`
    return [
      { path: 'package/index.vue', content: index },
      { path: 'package/components/SwitchSection.vue', content: switchVue },
      { path: 'package/components/TabsSection.vue', content: tabsVue },
      { path: 'package/components/MainSection.vue', content: mainVue },
      { path: 'resources/styles/common.less', content: less },
    ];
  };

  it('事故形态：slot-con 无 display，三个子组件根带 flex 值 → 补 display:flex', () => {
    const files = build('c-x-slot-con');
    const out = healMissingFlexContainers(files);
    expect(out.fixed.length).toBeGreaterThanOrEqual(1);
    expect(out.fixed.map((f) => f.cls)).toContain('c-x-slot-con');
    const lessFile = out.files.find((f) => f.path === 'resources/styles/common.less');
    expect(lessFile?.content).toMatch(/\.c-x-slot-con[^{]*\{[^}]*display:\s*flex;/s);
  });

  it('父容器已有 display:flex → 不动', () => {
    const files = build('c-x-slot-con');
    const less = files.find((f) => f.path!.endsWith('common.less'))!;
    less.content += `\n.c-x-slot-con { display: flex; }`;
    const out = healMissingFlexContainers(files);
    expect(out.fixed.length).toBe(0);
  });

  it('子项不带 flex 值 → 不动（纵向列表不误伤）', () => {
    const index = `<template>
  <div class="c-x-list-con">
    <div class="c-x-item">a</div>
    <div class="c-x-item">b</div>
  </div>
</template>`
    const less = `.c-x-item { width: 100%; }`
    const out = healMissingFlexContainers([
      { path: 'package/index.vue', content: index },
      { path: 'resources/styles/common.less', content: less },
    ]);
    expect(out.fixed.length).toBe(0);
  });

  it('幂等：补完再跑一次不再变化', () => {
    const once = healMissingFlexContainers(build('c-x-slot-con'));
    const twice = healMissingFlexContainers(once.files);
    expect(twice.fixed.length).toBe(0);
  });
});
