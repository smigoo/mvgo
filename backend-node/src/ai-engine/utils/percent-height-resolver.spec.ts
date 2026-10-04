/**
 * 🛡️ percent-height-resolver.spec.ts —— H1 百分比高度拉伸自愈器（只报不改）回归。
 *
 * 阳性样本锚定真机实锤：
 *   - fb505213 / a803f7：`antd-table-con` 真值 T子=173 / T父=270，产物 `height:100%` 撑满
 *     → 保存按钮被推出可视区（用户截图「为什么保存按钮这么远」）。
 *   - 图表族：`*-echarts-*-con` 真值 T子=T父（同高），产物却写 `flex:0.32`（应 ≈1.000）。
 */
import {
  H1_BLOCK_CLS_RE,
  H1_FILLER_RE,
  H1_EPS_RATIO,
  buildTruthHeightIndex,
  collectSlotBoundComponents,
  scanStretchCandidates,
  judgeCandidates,
  resolvePercentHeightStretch,
} from './percent-height-resolver.js';

describe('percent-height-resolver (H1)', () => {
  describe('判定域正则', () => {
    it('BLOCK_CLS_RE 命中内容区块三明治类名', () => {
      for (const c of [
        'c-fb5052-antd-table-con',
        'c-a812-07monarch-echarts-line-con',
        'c-xxx-header-wrap',
        'c-yyy-card-body',
        'c-zzz-chart-con',
        'c-x-table-con-wrap',
        'c-8afc00-tabs-con',
      ]) {
        expect(H1_BLOCK_CLS_RE.test(c)).toBe(true);
      }
    });

    it('BLOCK_CLS_RE 不把 `icon` 中的 `con` 误当容器段（命名重叠陷阱）', () => {
      // 实测：c-*-monitor-tabs-icon（TabsIcon.vue 图标元素）曾被误报为高度拉伸区块。
      expect(H1_BLOCK_CLS_RE.test('c-env-monitor-tabs-icon')).toBe(false);
      expect(H1_BLOCK_CLS_RE.test('c-x-monitor-tabs-icon')).toBe(false);
      // 形状段必须是完整 dash 段：末尾段不是已知形状 → 不命中（保守 fail-open）。
      expect(H1_BLOCK_CLS_RE.test('c-x-table-body-inner')).toBe(false);
    });

    it('FILLER_RE 命中填充容器（合法填满壳 body）', () => {
      for (const c of [
        'c-fb5052-slot-con',
        'c-fb5052-con-con',
        'c-fb5052-container',
        'c-fb5052-root',
        'slot-con',
      ]) {
        expect(H1_FILLER_RE.test(c)).toBe(true);
      }
      expect(H1_FILLER_RE.test('c-fb5052-antd-table-con')).toBe(false);
    });
  });

  describe('buildTruthHeightIndex', () => {
    it('从 effectiveSections 建索引并记录 parentId', () => {
      const idx = buildTruthHeightIndex({
        effectiveSections: [
          {
            id: '287',
            layoutMetadata: { height: 270 },
            children: [{ id: '287:5', layoutMetadata: { height: 173 } }],
          },
        ],
      });
      expect(idx.get('287').height).toBe(270);
      expect(idx.get('287:5').height).toBe(173);
      expect(idx.get('287:5').parentId).toBe('287');
    });

    it('figmaRoot 优先于 effectiveSections（同 id 取 figma 实测高度）', () => {
      const idx = buildTruthHeightIndex({
        figmaRoot: {
          id: '0',
          children: [{ id: '1:2', absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 88 } }],
        },
        effectiveSections: [{ id: '1:2', layoutMetadata: { height: 999 } }],
      });
      expect(idx.get('1:2').height).toBe(88);
    });

    it('无真值源 → 空索引', () => {
      expect(buildTruthHeightIndex({}).size).toBe(0);
      expect(buildTruthHeightIndex({ figmaRoot: null, effectiveSections: [] }).size).toBe(0);
    });
  });

  describe('壳槽位接管（traffic-monitor 族 30 条误报治本）', () => {
    it('collectSlotBoundComponents 收集 <template #slot> 内的组件名', () => {
      const idx = `  <base-panel panelKey="default-panel">
    <template #header-right>
      <HeaderSection />
    </template>
    <div class="c-x-slot-con">
      <ContentSection style="flex:1;" />
    </div>
  </base-panel>`;
      const s = collectSlotBoundComponents(idx);
      expect(s.has('HeaderSection')).toBe(true);
      expect(s.has('ContentSection')).toBe(false);
    });

    it('槽位接管的子组件根元素被剔除（填满槽位合法），内容区子组件仍参与判定', () => {
      const files = {
        'package/index.vue': `  <base-panel panelKey="default-panel">
    <template #header-right>
      <HeaderSection />
    </template>
    <div class="c-x-con-con" data-section-id="272:2">
      <ContentSection style="flex:0.812;" />
    </div>
  </base-panel>`,
        // 被 #header-right 接管 → 根元素 height:100% 合法
        'package/components/HeaderSection.vue': `<template>
  <div data-section-id="2:3550" class="c-x-header-section" style="height:100%"></div>
</template>`,
        // 内容区引用 → 根元素撑满父 = 真病灶
        'package/components/ContentSection.vue': `<template>
  <div data-section-id="210:45641" class="c-x-table-wrap" style="height:100%"></div>
</template>`,
      };
      const cands = scanStretchCandidates(files);
      const hdr = cands.find((c) => c.blockClass === 'c-x-header-section');
      const con = cands.find((c) => c.blockClass === 'c-x-table-wrap');
      expect(hdr.slotBound).toBe(true);
      expect(con.slotBound).toBe(false);

      const idx = buildTruthHeightIndex({
        effectiveSections: [
          { id: '272:2', layoutMetadata: { height: 270 }, children: [{ id: '210:45641', layoutMetadata: { height: 173 } }] },
          { id: '2:9778', layoutMetadata: { height: 807 }, children: [{ id: '2:3550', layoutMetadata: { height: 33 } }] },
        ],
      });
      const { issues, stats } = judgeCandidates(cands, idx);
      expect(stats.slotBound).toBe(1);
      expect(issues).toHaveLength(1);
      expect(issues[0].blockClass).toBe('c-x-table-wrap');
    });
  });

  describe('scanStretchCandidates', () => {
    it('扫出带 sid 的内容区块 + height:100% 信号，并记录 DOM 祖先 sid', () => {
      const files = {
        'package/components/ContentSection.vue': `<template>
  <div data-section-id="287" class="c-fb5052-con-con">
    <div class="c-fb5052-antd-table-con" data-section-id="287:5" style="height:100%">
      <table></table>
    </div>
  </div>
</template>`,
      };
      const cands = scanStretchCandidates(files);
      expect(cands).toHaveLength(1);
      expect(cands[0].blockClass).toBe('c-fb5052-antd-table-con');
      expect(cands[0].sid).toBe('287:5');
      expect(cands[0].parentSid).toBe('287');
      expect(cands[0].signals).toContain('h100');
    });

    it('填充容器（*-con-con / *-slot-con）被排除，不出候选', () => {
      const files = {
        'a.vue': `<template>
  <div class="c-x-con-con" data-section-id="1" style="height:100%"></div>
  <div class="c-y-slot-con" data-section-id="2" style="height:100%"></div>
</template>`,
      };
      expect(scanStretchCandidates(files)).toHaveLength(0);
    });

    it('小数 flex 从 common.less 的 class 规则体反查（非内联）', () => {
      const files = {
        'resources/styles/common.less': '.c-a-monarch-echarts-line-con { flex: 0.32; }',
        'a.vue': `<template>
  <div class="c-a-monarch-echarts-line-con" data-section-id="2:7459"></div>
</template>`,
      };
      const cands = scanStretchCandidates(files);
      expect(cands).toHaveLength(1);
      expect(cands[0].signals).toContain('ff:0.32');
    });

    it('整数 flex:1 不作为比例信号（无歧义）', () => {
      const files = {
        'a.vue': `<template>
  <div class="c-a-table-wrap" data-section-id="9" style="flex:1 1 0"></div>
</template>`,
      };
      expect(scanStretchCandidates(files)).toHaveLength(0);
    });

    it('动态 :class / :style 不参与（只认静态属性）', () => {
      const files = {
        'a.vue': `<template>
  <div class="c-a-table-wrap" data-section-id="9" :style="{ height: '100%' }"></div>
</template>`,
      };
      expect(scanStretchCandidates(files)).toHaveLength(0);
    });
  });

  describe('judgeCandidates', () => {
    const idx = buildTruthHeightIndex({
      effectiveSections: [
        {
          id: '287',
          layoutMetadata: { height: 270 },
          children: [{ id: '287:5', layoutMetadata: { height: 173 } }],
        },
      ],
    });

    it('h100 且 T子≠T父 → HIT', () => {
      const { issues, stats } = judgeCandidates(
        [{ file: 'a.vue', blockClass: 'c-fb5052-antd-table-con', sid: '287:5', parentSid: '287', signals: ['h100'] }],
        idx,
      );
      expect(stats.hits).toBe(1);
      expect(issues[0].truthChild).toBe(173);
      expect(issues[0].truthParent).toBe(270);
      expect(issues[0].detail).toContain('撑满父容器');
    });

    it('h100 但 T子=T父 → SAFE（无偏差）', () => {
      const same = buildTruthHeightIndex({
        effectiveSections: [
          { id: 'p', layoutMetadata: { height: 200 }, children: [{ id: 'c', layoutMetadata: { height: 200 } }] },
        ],
      });
      const { issues, stats } = judgeCandidates(
        [{ file: 'a.vue', blockClass: 'c-x-table-wrap', sid: 'c', parentSid: 'p', signals: ['h100'] }],
        same,
      );
      expect(stats.hits).toBe(0);
      expect(stats.safe).toBe(1);
      expect(issues).toHaveLength(0);
    });

    it('比例 flex 未复现真值比 → HIT；恰好复现 → SAFE', () => {
      const same = buildTruthHeightIndex({
        effectiveSections: [
          { id: 'p', layoutMetadata: { height: 200 }, children: [{ id: 'c', layoutMetadata: { height: 200 } }] },
        ],
      });
      // 真值比 = 1.000，flex:0.32 严重偏离
      expect(
        judgeCandidates(
          [{ file: 'a.vue', blockClass: 'c-x-chart-con', sid: 'c', parentSid: 'p', signals: ['ff:0.32'] }],
          same,
        ).stats.hits,
      ).toBe(1);
      // 真值比 = 1.000，flex:0.98 在 ε=0.06 内
      expect(
        judgeCandidates(
          [{ file: 'a.vue', blockClass: 'c-x-chart-con', sid: 'c', parentSid: 'p', signals: ['ff:0.98'] }],
          same,
        ).stats.safe,
      ).toBe(1);
    });

    it('无真值（sid 不在索引）→ NO_TRUTH，不臆造', () => {
      const { issues, stats } = judgeCandidates(
        [{ file: 'a.vue', blockClass: 'c-x-table-con', sid: '99:99', parentSid: null, signals: ['h100'] }],
        idx,
      );
      expect(issues).toHaveLength(0);
      expect(stats.noTruth).toBe(1);
    });

    it('跨文件父链回退：DOM 无祖先 sid 时，用真值 parentId 取 T父', () => {
      const { issues } = judgeCandidates(
        // parentSid=null（DOM 里同文件找不到祖先），但索引里 287:5.parentId=287
        [{ file: 'a.vue', blockClass: 'c-fb5052-antd-table-con', sid: '287:5', parentSid: null, signals: ['h100'] }],
        idx,
      );
      expect(issues).toHaveLength(1);
      expect(issues[0].parentSid).toBe('287');
      expect(issues[0].truthParent).toBe(270);
    });
  });

  describe('resolvePercentHeightStretch（主入口）', () => {
    const sections = [
      {
        id: '287',
        layoutMetadata: { height: 270 },
        children: [{ id: '287:5', layoutMetadata: { height: 173 } }],
      },
    ];

    it('阳性：修复前 fb505213 形态 → 报 1 条', () => {
      const files = {
        'package/components/ContentSection.vue': `<template>
  <div class="c-fb5052-con-con" data-section-id="287">
    <div class="c-fb5052-antd-table-con" data-section-id="287:5" style="height:100%">
      <table></table>
    </div>
  </div>
</template>`,
      };
      const { issues, stats } = resolvePercentHeightStretch(files, { effectiveSections: sections });
      expect(stats.hits).toBe(1);
      expect(issues[0].blockClass).toBe('c-fb5052-antd-table-con');
    });

    it('阴性：修复后形态（table-wrap 无 height:100%）→ 0 命中', () => {
      const files = {
        'package/components/ContentSection.vue': `<template>
  <div class="c-fb5052-con-con" data-section-id="287">
    <div class="c-fb5052-table-wrap" data-section-id="287:5" style="flex:0 0 auto">
      <table></table>
    </div>
  </div>
</template>`,
      };
      const { issues } = resolvePercentHeightStretch(files, { effectiveSections: sections });
      expect(issues).toHaveLength(0);
    });

    it('阴性：填充容器 height:100% 不报', () => {
      const files = {
        'a.vue': `<template>
  <div class="c-fb5052-con-con" data-section-id="287" style="height:100%"></div>
</template>`,
      };
      expect(resolvePercentHeightStretch(files, { effectiveSections: sections }).issues).toHaveLength(0);
    });

    it('入参防御：files=null → skipped=no-files', () => {
      const r = resolvePercentHeightStretch(null, { effectiveSections: sections });
      expect(r.issues).toHaveLength(0);
      expect(r.stats.skipped).toBe('no-files');
    });

    it('入参防御：无真值源 → skipped=no-truth-index（fail-open）', () => {
      const files = { 'a.vue': '<template><div class="c-x-table-con" data-section-id="1" style="height:100%"></div></template>' };
      const r = resolvePercentHeightStretch(files, {});
      expect(r.issues).toHaveLength(0);
      expect(r.stats.skipped).toBe('no-truth-index');
    });

    it('不改动入参 files（只报不改 ⇒ 天然幂等）', () => {
      const files = {
        'a.vue': `<template>
  <div class="c-fb5052-con-con" data-section-id="287">
    <div class="c-fb5052-antd-table-con" data-section-id="287:5" style="height:100%"></div>
  </div>
</template>`,
      };
      const snapshot = JSON.stringify(files);
      resolvePercentHeightStretch(files, { effectiveSections: sections });
      expect(JSON.stringify(files)).toBe(snapshot);
    });

    it('maxIssues 截断生效', () => {
      const many = { 'a.vue': '<template>' + Array.from({ length: 80 }, (_, i) => `<div class="c-x-table-con" data-section-id="287:5" style="height:100%"></div>`).join('') + '</template>' };
      const { issues } = resolvePercentHeightStretch(many, { effectiveSections: sections, maxIssues: 10 });
      expect(issues.length).toBe(10);
    });
  });

  describe('常量', () => {
    it('EPS_RATIO = 0.06（离线原型收敛口径）', () => {
      expect(H1_EPS_RATIO).toBe(0.06);
    });
  });
});
