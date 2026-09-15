/**
 * 🎯 2026-09-14 治本①②：section 内容映射守卫（验证优先，不自动重排/删除）。
 *
 * 真机验证（c-traffic-monitor-29570c8e）：
 *   memberOrderIssues 抓到 88:32（当日总流量/24小时反）与 2:3660（34,620/82,379 反）；
 *   duplicateTextIssues 抓到「24小时/当日总流量/流量预测」跨组件重复。
 */
import { checkSectionContent, buildSectionContentContract, healDuplicateTextIssues } from './section-content-guard.js';

/** 构造最小 figma 树节点 */
function node(id, name, type, x, y, children = []) {
  return { id, name, type, absoluteBoundingBox: { x, y, width: 10, height: 10 }, children };
}
function text(id, name, x, y) {
  return node(id, name, 'TEXT', x, y);
}
/** 构造 horizontal section plan */
function horizSection(id, ids) {
  return { id, title: id, body: { layout: 'horizontal' }, sourceNodeIds: ids, children: [] };
}
function planWith(sections) {
  return { effectiveSections: sections };
}

describe('checkSectionContent · 左右序与内容错装守卫', () => {
  const figmaRoot = {
    document: {
      id: 'root', name: 'root', type: 'FRAME',
      absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 400 },
      children: [
        node('s1', 'row', 'FRAME', 0, 0, [
          node('m1', 'm1', 'GROUP', 40, 0, [text('m1t', 't-隧道', 40, 0), text('m1d', 'd-34,620', 40, 0)]),
          node('m2', 'm2', 'GROUP', 200, 0, [text('m2t', 't-大桥', 200, 0), text('m2d', 'd-82,379', 200, 0)]),
        ]),
        node('s2', 'header', 'FRAME', 0, 100, [text('s2t', '当日总流量', 40, 100)]),
        node('s3', 'sub', 'FRAME', 0, 120, [text('s3t', '当日总流量', 40, 120), text('s3d', '24小时', 200, 120)]),
      ],
    },
  };

  it('① 统计行左右反：成员文本（d- 数值，最独特）在产物中反序 → 报 issue', () => {
    const files = [
      {
        path: 'package/components/ContentSection.vue',
        content: '<template><div>82,379 大桥</div><div>34,620 隧道</div></template>', // 大桥在前（错）
      },
      // 标题「隧道/大桥」同现于另一文件（模拟 tabs/车型分布引用）→ 标题不再独特，数值成为唯一签名
      { path: 'package/components/OtherTabs.vue', content: '<template>隧道 大桥 切换</template>' },
    ];
    const r = checkSectionContent({
      files,
      plan: planWith([horizSection('s1', ['s1', 'm1', 'm2']), { id: 's2', sourceNodeIds: ['s2', 's2t'] }, { id: 's3', sourceNodeIds: ['s3', 's3t', 's3d'] }]),
      figmaRoot: figmaRoot.document,
    });
    expect(r.memberOrderIssues).toHaveLength(1);
    expect(r.memberOrderIssues[0].sectionId).toBe('s1');
    expect(r.memberOrderIssues[0].expectedLeftToRight).toEqual(['34,620', '82,379']);
  });

  it('① 顺序正确 → 不报', () => {
    const files = [
      {
        path: 'package/components/ContentSection.vue',
        content: '<template><div>34,620 隧道</div><div>82,379 大桥</div></template>',
      },
      { path: 'package/components/OtherTabs.vue', content: '<template>隧道 大桥 切换</template>' },
    ];
    const r = checkSectionContent({
      files,
      plan: planWith([horizSection('s1', ['s1', 'm1', 'm2'])]),
      figmaRoot: figmaRoot.document,
    });
    expect(r.memberOrderIssues).toHaveLength(0);
  });

  it('② 唯一归属文本被 2 个组件渲染 → 报重复（t-/d- 前缀归一化生效）', () => {
    const files = [
      { path: 'package/components/HeaderSection.vue', content: '<template><div>当日总流量 24小时</div></template>' },
      { path: 'package/components/ContentSubHeader.vue', content: '<template><div>当日总流量 24小时</div></template>' },
    ];
    const r = checkSectionContent({
      files,
      plan: planWith([{ id: 's2', sourceNodeIds: ['s2', 's2t'] }]),
      figmaRoot: figmaRoot.document,
    });
    // 「当日总流量」仅归属 s2，却渲染在 2 个文件 → 报；「24小时」归属 s3（未提供该 section）→ 不参与
    expect(r.duplicateTextIssues.some((d) => d.text === '当日总流量')).toBe(true);
  });

  it('② 多 section 共有的文本（图例类）→ 合法重复，不报', () => {
    const fig = {
      document: {
        id: 'root', name: 'r', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 },
        children: [
          node('c1', 'c1', 'FRAME', 0, 0, [text('c1t', '北京方向', 0, 0)]),
          node('c2', 'c2', 'FRAME', 0, 0, [text('c2t', '北京方向', 0, 0)]),
        ],
      },
    };
    const files = [
      { path: 'package/components/A.vue', content: '<template>北京方向</template>' },
      { path: 'package/components/B.vue', content: '<template>北京方向</template>' },
    ];
    const r = checkSectionContent({
      files,
      plan: planWith([
        { id: 'c1', sourceNodeIds: ['c1', 'c1t'] },
        { id: 'c2', sourceNodeIds: ['c2', 'c2t'] },
      ]),
      figmaRoot: fig.document,
    });
    expect(r.duplicateTextIssues).toHaveLength(0);
  });

  it('②-b R5-dup 注释不算渲染：文本仅在 HTML 注释里 → 不误判为「渲染在 2 组件」', () => {
    // 实锤（流量监测）：「当日总流量」在 ContentSection.vue 里只是 `<!-- 当日总流量区域背景 -->`
    // 注释，非 UI 文本。裸 f.content.includes 会把注释误判为「渲染」→ duplicateTextIssues 假阳性。
    const fig = {
      document: {
        id: 'root', name: 'r', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 },
        children: [node('s2', 'sub', 'FRAME', 0, 0, [text('s2t', '当日总流量', 40, 0)])],
      },
    };
    const files = [
      // 真正渲染「当日总流量」的 owner 文件
      { path: 'package/components/ContentSubHeader.vue', content: '<span>当日总流量</span>' },
      // 非 owner 文件里「当日总流量」只在注释里 → 不算渲染
      { path: 'package/components/ContentSection.vue', content: '<div><!-- 当日总流量区域背景 --></div><span>统计值</span>' },
    ];
    const r = checkSectionContent({
      files,
      plan: planWith([{ id: 's2', sourceNodeIds: ['s2', 's2t'] }]),
      figmaRoot: fig.document,
    });
    // 注释里的「当日总流量」不算渲染 → 只有 1 个组件真正渲染 → 不报 duplicate
    expect(r.duplicateTextIssues.filter((d) => d.text === '当日总流量')).toHaveLength(0);
  });

  it('无 figmaRoot / 无 plan / 空 files → 空结果（fail-open，不抛错）', () => {
    expect(checkSectionContent({ files: [], plan: { effectiveSections: [] }, figmaRoot: null })).toEqual({ memberOrderIssues: [], duplicateTextIssues: [] });
    expect(checkSectionContent({ files: [{ path: 'package/components/A.vue', content: 'x' }], plan: null, figmaRoot: null }).memberOrderIssues).toHaveLength(0);
  });
});

describe('buildSectionContentContract · per-section 内容归属契约（prompt 预防层）', () => {
  const figmaRoot = {
    document: {
      id: 'root', name: 'r', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 },
      children: [
        node('s1', 's1', 'FRAME', 0, 0, [
          node('g1', 'g1', 'GROUP', 40, 0, [text('t1', 't-隧道', 40, 0)]),
          node('g2', 'g2', 'GROUP', 260, 0, [text('t2', 't-大桥', 260, 0)]),
        ]),
      ],
    },
  };

  it('横向 section 高置信统计行 → deterministic:true 确定性配对（标题↔数值↔x 成对）', () => {
    const fig = {
      document: {
        id: 'root', name: 'r', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 },
        children: [
          node('s1', 's1', 'FRAME', 0, 0, [
            node('g1', 'g1', 'GROUP', 40, 0, [text('t1', 't-隧道', 40, 0), text('d1', 'd-34,620', 40, 0)]),
            node('g2', 'g2', 'GROUP', 260, 0, [text('t2', 't-大桥', 260, 0), text('d2', 'd-82,379', 260, 0)]),
          ]),
        ],
      },
    };
    const c = buildSectionContentContract(
      { effectiveSections: [{ id: 's1', title: 'row', body: { layout: 'horizontal' }, sourceNodeIds: ['s1', 'g1', 'g2'] }] },
      fig.document,
    );
    expect(c).toHaveLength(1);
    expect(c[0].direction).toBe('row');
    expect(c[0].deterministic).toBe(true);
    expect(c[0].members).toEqual([
      { title: '隧道', value: '34,620', x: 40, figmaNodeId: 'g1' },
      { title: '大桥', value: '82,379', x: 260, figmaNodeId: 'g2' },
    ]);
  });

  it('横向 section 无数值配对（88:32 sub-header）→ deterministic:false 回退 LLM', () => {
    const fig = {
      document: {
        id: 'root', name: 'r', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 },
        children: [
          node('s1', 's1', 'FRAME', 0, 0, [
            node('g1', 'g1', 'GROUP', 40, 0, [text('t1', 't-24小时', 40, 0)]),
            node('g2', 'g2', 'GROUP', 260, 0, [text('t2', 't-当日总流量', 260, 0)]),
          ]),
        ],
      },
    };
    const c = buildSectionContentContract(
      { effectiveSections: [{ id: 's1', title: 'sub', body: { layout: 'horizontal' }, sourceNodeIds: ['s1', 'g1', 'g2'] }] },
      fig.document,
    );
    expect(c).toHaveLength(1);
    expect(c[0].deterministic).toBe(false);
    // 回退 LLM 的成员级配对仍保留 title/value/x（不带 figmaNodeId）
    expect(c[0].members).toEqual([
      { title: '24小时', value: null, x: 40 },
      { title: '当日总流量', value: null, x: 260 },
    ]);
  });

  it('无 figmaRoot / 无 plan → 空数组（fail-open）', () => {
    expect(buildSectionContentContract(null, figmaRoot.document)).toEqual([]);
    expect(buildSectionContentContract({ effectiveSections: [] }, null)).toEqual([]);
  });
});

describe('healDuplicateTextIssues（阶段 C 高置信自愈）', () => {
  // 复用 checkSectionContent 的事实源：88:32 子树含「24小时」「当日总流量」，
  // 但产物把「24小时」错装到 ContentForecast.vue（流量预测组件）
  const figmaRoot: any = {
    id: 'root', name: 'cp-流量监测', type: 'FRAME',
    children: [
      { id: '2:3550', name: 'header', type: 'FRAME', children: [] },
      {
        id: '88:32', name: 'sub-header', type: 'FRAME',
        children: [
          { id: '2:3548', name: 't-24小时', type: 'TEXT', characters: '24小时', absoluteBoundingBox: { x: 100, y: 100, width: 50, height: 20 } },
          { id: '2:3560', name: 't-当日总流量', type: 'TEXT', characters: '当日总流量', absoluteBoundingBox: { x: 50, y: 100, width: 80, height: 20 } },
        ],
      },
      {
        id: '2:3565', name: 'sub-header', type: 'FRAME',
        children: [
          { id: '2:3572', name: 't-流量预测', type: 'TEXT', characters: '流量预测', absoluteBoundingBox: { x: 200, y: 100, width: 60, height: 20 } },
        ],
      },
    ],
  };

  function makePlan() {
    return {
      effectiveSections: [
        { id: '2:3550', type: 'header', title: 'header', sourceNodeIds: ['2:3550'] },
        { id: '88:32', title: 'sub-header', sourceNodeIds: ['88:32', '2:3548', '2:3560'] },
        { id: '2:3565', title: 'sub-header', sourceNodeIds: ['2:3565', '2:3572'] },
      ],
    };
  }

  function makeFiles() {
    return [
      { path: 'package/components/HeaderSection.vue', content: '<template><div>环境监测</div></template>\n<script setup>\nimport { ref } from "vue"\n</script>' },
      { path: 'package/components/ContentSubHeader.vue', content: '<template><div>当日总流量</div><div>24小时</div></template>\n<script setup>\nimport { ref } from "vue"\n</script>' },
      { path: 'package/components/ContentForecast.vue', content: '<template><div class="h"><span>24小时</span></div><div class="c">流量预测</div></template>\n<script setup>\nimport { ref } from "vue"\n</script>' },
      { path: 'package/components/ContentSubHeader2.vue', content: '<template><div>流量预测</div></template>\n<script setup>\nimport { ref } from "vue"\n</script>' },
    ];
  }

  it('唯一归属文本「24小时」从非 owner 组件删除，owner 组件保留', () => {
    const files = makeFiles();
    const r = healDuplicateTextIssues({ files, plan: makePlan(), figmaRoot });
    const forecast = r.files.find((f) => f.path === 'package/components/ContentForecast.vue');
    const subHeader = r.files.find((f) => f.path === 'package/components/ContentSubHeader.vue');
    expect(forecast.content).not.toContain('24小时');
    expect(subHeader.content).toContain('24小时'); // owner 保留
    expect(r.healed.length).toBeGreaterThan(0);
  });

  it('owner 组件不在 renderedIn 时跳过（不猜）', () => {
    const files = [
      { path: 'package/components/ContentForecast.vue', content: '<template><span>24小时</span></template>' },
      // 没有 ContentSubHeader.vue（owner 组件缺失）
    ];
    const r = healDuplicateTextIssues({ files, plan: makePlan(), figmaRoot });
    expect(r.healed.length).toBe(0);
  });

  it('空 files / 空 plan → 原样返回零自愈', () => {
    expect(healDuplicateTextIssues({ files: [], plan: makePlan(), figmaRoot }).healed).toEqual([]);
    expect(healDuplicateTextIssues({ files: makeFiles(), plan: null, figmaRoot }).healed).toEqual([]);
  });

  it('无重复文本 → 零自愈', () => {
    const files = [
      { path: 'package/components/ContentSubHeader.vue', content: '<template><div>当日总流量</div></template>' },
      { path: 'package/components/ContentForecast.vue', content: '<template><div>流量预测</div></template>' },
    ];
    const r = healDuplicateTextIssues({ files, plan: makePlan(), figmaRoot });
    expect(r.healed.length).toBe(0);
  });
});

describe('checkSectionContent · memberOrderIssues 假阳性修复（<br/> 断行）', () => {
  // 真机 mc-1789464855419 实锤：switch 成员「隧道设备」「南北接线\n设备」DOM 序其实正确，
  // 但产物里「南北接线<br/>设备」被 <br/> 断开 → 旧实现 content.indexOf('南北接线设备')=-1
  // 误判序反。修复后 renderedText.indexOf（剥离标签后 = 南北接线设备）命中 → 不误报。
  const figmaRoot = {
    document: {
      id: 'root', name: 'cp-设备监测', type: 'FRAME',
      children: [
        {
          id: '89:38', name: 'switch', type: 'FRAME',
          children: [
            { id: '2:8791', name: 't-隧道设备', type: 'TEXT', characters: '隧道设备', absoluteBoundingBox: { x: 1486, y: 475, width: 45, height: 16 } },
            { id: '2:8816', name: 't-南北接线 设备', type: 'TEXT', characters: '南北接线\n设备', absoluteBoundingBox: { x: 1689, y: 475, width: 45, height: 20 } },
          ],
        },
      ],
    },
  };

  const plan = {
    effectiveSections: [
      { id: '89:38', title: 'switch', body: { layout: 'horizontal' }, sourceNodeIds: ['89:38', '2:8791', '2:8816'] },
    ],
  };

  it('产物里「南北接线<br/>设备」被 <br/> 断开 → 不误判序反', () => {
    const files = [
      { path: 'package/components/SwitchSection.vue', content: `<template>
<div class="c-device-monitor-switch">
  <div class="btn"><div class="title">隧道设备</div></div>
  <div class="btn"><div class="title">南北接线<br/>设备</div></div>
</div>
</template>
<script setup>
import { ref } from 'vue'
</script>` },
    ];
    const r = checkSectionContent({ files, plan, figmaRoot });
    expect(r.memberOrderIssues).toHaveLength(0);
  });
});
