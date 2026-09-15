/**
 * 治本（2026-09-11）：normalizeRootContainerLayout 单测
 * —— 内容根容器 flex 填充 → height:100%（宿主 .pannel-content 为 block）
 */
import { normalizeRootContainerLayout, detectContentRootClass } from '../root-container-normalizer.js';

const INDEX_VUE = `<template>
  <base-panel class="c-mc-max-1-abc" panelKey="default-panel">
    <div class="c-env-monitor-xh8jdcpy-c-env-monitor-slot-con">
      <ContentSection />
      <ChartSection />
    </div>
  </base-panel>
</template>`;

const LESS = `.c-env-monitor-xh8jdcpy-c-env-monitor-slot-con {
  display: flex;
  flex-direction: column;
  width: 100%;
  flex: 1 1 0;
  padding: 8px;
  overflow: hidden;
  min-height: 0;
}
.c-env-monitor-xh8jdcpy-c-env-monitor-tab {
  flex: 1 1 0;
}`;

describe('detectContentRootClass', () => {
  it('识别 base-panel 内第一个容器的 -slot-con 词尾类', () => {
    expect(detectContentRootClass(INDEX_VUE)).toBe(
      'c-env-monitor-xh8jdcpy-c-env-monitor-slot-con',
    );
  });

  it('识别 -root 词尾', () => {
    const tpl = `<template><base-panel panelKey="p"><div class="c-x-1-root"><Main /></div></base-panel></template>`;
    expect(detectContentRootClass(tpl)).toBe('c-x-1-root');
  });

  it('无内容根 → null', () => {
    expect(detectContentRootClass('<template><base-panel><Main /></base-panel></template>')).toBeNull();
  });
});

describe('normalizeRootContainerLayout', () => {
  it('flex 填充 → height:100%，内部 section 的 flex 不动', () => {
    const r = normalizeRootContainerLayout([
      { path: 'package/index.vue', content: INDEX_VUE },
      { path: 'resources/styles/common.less', content: LESS },
    ]);
    expect(r.fixes).toHaveLength(1);
    expect(r.fixes[0]).toMatchObject({
      path: 'resources/styles/common.less',
      rootCls: 'c-env-monitor-xh8jdcpy-c-env-monitor-slot-con',
      action: 'flex-to-height',
    });
    const out = r.files[1].content;
    expect(out).toMatch(/height:\s*100%;/);
    expect(out).not.toMatch(/slot-con[^}]*flex:\s*1 1 0/s);
    // 内部非根容器的 flex 填充不受影响
    expect(out).toMatch(/c-env-monitor-tab \{[^}]*flex:\s*1 1 0/s);
  });

  it('已有 height 的根容器：只删失效 flex（removed-dead-flex）', () => {
    const less = `.c-env-monitor-xh8jdcpy-c-env-monitor-slot-con {
  height: 100%;
  flex: 1 1 0;
  display: flex;
}`;
    const r = normalizeRootContainerLayout([
      { path: 'package/index.vue', content: INDEX_VUE },
      { path: 'resources/styles/common.less', content: less },
    ]);
    expect(r.fixes[0].action).toBe('removed-dead-flex');
    expect(r.files[1].content).toMatch(/height:\s*100%;/);
    expect(r.files[1].content).not.toMatch(/flex:\s*1 1 0/);
    expect(r.files[1].content).toContain('display: flex;');
  });

  it('幂等：height:100% 且无 flex 的根容器零副作用', () => {
    const less = `.c-env-monitor-xh8jdcpy-c-env-monitor-slot-con {
  height: 100%;
  display: flex;
  flex-direction: column;
}`;
    const files = [
      { path: 'package/index.vue', content: INDEX_VUE },
      { path: 'resources/styles/common.less', content: less },
    ];
    const r = normalizeRootContainerLayout(files);
    expect(r.fixes).toEqual([]);
    expect(r.files[1].content).toBe(less);
  });

  it('.vue <style> 块同样归一', () => {
    const vue = `${INDEX_VUE}
<style lang="less" scoped>
.c-env-monitor-xh8jdcpy-c-env-monitor-slot-con {
  display: flex;
  flex-direction: column;
  flex: 1 1 0;
}
</style>`;
    const r = normalizeRootContainerLayout([{ path: 'package/index.vue', content: vue }]);
    expect(r.fixes).toHaveLength(1);
    expect(r.files[0].content).toMatch(/height:\s*100%;/);
  });

  it('grow 像素量级 flex: 180 1 0 同样归一（同为根容器失效形态）', () => {
    const less = `.c-env-monitor-xh8jdcpy-c-env-monitor-slot-con { display: flex; flex-direction: column; flex: 180 1 0; }`;
    const r = normalizeRootContainerLayout([
      { path: 'package/index.vue', content: INDEX_VUE },
      { path: 'resources/styles/common.less', content: less },
    ]);
    expect(r.fixes).toHaveLength(1);
    expect(r.files[1].content).toMatch(/height:\s*100%;/);
  });
});

/**
 * 🛡️ I4 不变量终验兜底（2026-09-11 P2-1 时序治理）
 *
 * 动机：fix pipeline 中 anchorRootContainerInFiles 对 common.less 的补丁会被
 * writeFiles 出口的 consolidateSubComponentClasses 等产物重建类步骤覆盖 ——
 * 布局类关键修复必须在「写盘前最后一刻」重跑。figmaNodeData bbox 有效时
 * 对内容根补 aspect-ratio（语义对齐 anchor：缺 width 或 height 才注入）。
 */
describe('normalizeRootContainerLayout · figma bbox width/height 100% 终验兜底', () => {
  const FIGMA_425x807 = { document: { absoluteBoundingBox: { width: 425.4, height: 807.2 } } };
  const FIGMA_TINY = { document: { absoluteBoundingBox: { width: 30, height: 40 } } };

  it('bbox 有效且缺 width/height → 补 100% 双全（I4，R4-b 起不注入 aspect-ratio）', () => {
    const less = `.c-env-monitor-xh8jdcpy-c-env-monitor-slot-con {
  display: flex;
  flex-direction: column;
  flex: 1 1 0;
}`;
    const r = normalizeRootContainerLayout(
      [
        { path: 'package/index.vue', content: INDEX_VUE },
        { path: 'resources/styles/common.less', content: less },
      ],
      { figmaNodeData: FIGMA_425x807 },
    );
    const actions = r.fixes.map((f) => f.action);
    expect(actions).toContain('flex-to-height');
    expect(actions).toContain('width-to-100');
    expect(actions).not.toContain('aspect-ratio-injected');
    expect(r.files[1].content).toMatch(/width:\s*100%;/);
    expect(r.files[1].content).toMatch(/height:\s*100%;/);
    expect(r.files[1].content).not.toContain('aspect-ratio');
  });

  it('width/height 都全 → 零副作用（不补任何尺寸声明）', () => {
    const less = `.c-env-monitor-xh8jdcpy-c-env-monitor-slot-con {
  width: 420px;
  height: 186px;
}`;
    const r = normalizeRootContainerLayout(
      [
        { path: 'package/index.vue', content: INDEX_VUE },
        { path: 'resources/styles/common.less', content: less },
      ],
      { figmaNodeData: FIGMA_425x807 },
    );
    expect(r.fixes).toEqual([]);
    expect(r.files[1].content).not.toContain('aspect-ratio');
  });

  it('缺 width 只补 width，已有 height 不动（幂等语义）', () => {
    const less = `.c-env-monitor-xh8jdcpy-c-env-monitor-slot-con {
  height: 100%;
  display: flex;
}`;
    const r = normalizeRootContainerLayout(
      [
        { path: 'package/index.vue', content: INDEX_VUE },
        { path: 'resources/styles/common.less', content: less },
      ],
      { figmaNodeData: FIGMA_425x807 },
    );
    expect(r.fixes.map((f) => f.action)).toEqual(['width-to-100']);
    expect(r.files[1].content).toMatch(/width:\s*100%;/);
    expect(r.files[1].content.match(/height:\s*100%/g)?.length).toBe(1);
    expect(r.files[1].content).not.toContain('aspect-ratio');
  });

  it('bbox 无效（W/H≤50）或缺 figmaNodeData → 不补齐（旧语义不变）', () => {
    const less = `.c-env-monitor-xh8jdcpy-c-env-monitor-slot-con { flex: 1 1 0; }`;
    for (const opts of [
      { figmaNodeData: FIGMA_TINY },
      {},
    ] as const) {
      const r = normalizeRootContainerLayout(
        [
          { path: 'package/index.vue', content: INDEX_VUE },
          { path: 'resources/styles/common.less', content: less },
        ],
        opts,
      );
      expect(r.fixes.map((f) => f.action)).not.toContain('aspect-ratio-injected');
      expect(r.fixes.map((f) => f.action)).not.toContain('width-to-100');
    }
  });
});
