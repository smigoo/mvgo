/**
 * 🎯 2026-09-14 治本①②：section 内容映射守卫（验证优先，不自动重排/删除）。
 *
 * 真机验证（c-traffic-monitor-29570c8e）：
 *   memberOrderIssues 抓到 88:32（当日总流量/24小时反）与 2:3660（34,620/82,379 反）；
 *   duplicateTextIssues 抓到「24小时/当日总流量/流量预测」跨组件重复。
 */
import { checkSectionContent, buildSectionContentContract, healDuplicateTextIssues, checkSectionExclusiveEvidence, checkSectionTruthCoverage } from './section-content-guard.js';
import { assignSectionComponentNames } from './section-tree.js';

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

describe('healDuplicateTextIssues · SFC 校验改为「差分判据」（2026-09-29 治本）', () => {
  // 真机实锤（流量监测 mc-max-1790657317082-67u1cdxz）：
  //   validateVueSfc 校验 SFC <style> 的**孤立文本**、不解析 @import，
  //   于是 `border: 1px solid @color-border-light`（槽位定义在 themes/theme-vars.less）被误报
  //   `variable @color-border-light is undefined` → valid:false。
  //   旧判据「整体 valid 才通过」把 HeaderSection.vue / HeaderSub.vue 的**所有**待删文本一并否决
  //   → 该任务 5 条重复只自愈 3 条，漏掉「当日总流量」「24小时」。
  //   新判据：只在删除**引入新错误**时回退。
  const figmaRoot: any = {
    id: 'root', name: 'cp-流量监测', type: 'FRAME',
    children: [
      {
        id: '88:32', name: 'sub-header', type: 'FRAME',
        children: [
          { id: '88:321', name: 't-当日总流量', type: 'TEXT', characters: '当日总流量', absoluteBoundingBox: { x: 50, y: 100, width: 80, height: 20 } },
        ],
      },
    ],
  };
  const plan = {
    effectiveSections: [{ id: '88:32', title: 'sub-header', sourceNodeIds: ['88:32', '88:321'] }],
  };
  // 同一文本被两个组件渲染（owner=HeaderSub，错装=HeaderSection）
  const makeFiles = () => [
    { path: 'package/components/HeaderSub.vue', content: '<template><div><span>当日总流量</span></div></template>' },
    { path: 'package/components/HeaderSection.vue', content: '<template><div><span>当日总流量</span></div></template>' },
  ];

  it('文件预先存在的 SFC 错误（含 @import 误报）不再否决删除', () => {
    // 模拟真机 validateVueSfc：不论内容如何都报同一条「槽位未定义」
    const validateSfc = () => ({
      valid: false,
      errors: ['package/components/x.vue:43:21 style: variable @color-border-light is undefined'],
    });
    const r = healDuplicateTextIssues({ files: makeFiles(), plan, figmaRoot, validateSfc });
    expect(r.healed.length).toBeGreaterThan(0);
  });

  it('删除**引入新错误** → 仍然回退（安全性不放松）', () => {
    // 删掉文本后会出现 `<span></span>` 空标签 → 视为本次删除引入的新错误
    const validateSfc = (c: string) =>
      c.includes('<span></span>')
        ? { valid: false, errors: ['package/components/x.vue:9:9 parse: Invalid empty element'] }
        : { valid: true, errors: [] };
    const r = healDuplicateTextIssues({ files: makeFiles(), plan, figmaRoot, validateSfc });
    expect(r.healed).toHaveLength(0);
  });

  it('行号漂移不误判为新增错误（签名剥离 line:col）', () => {
    let call = 0;
    const validateSfc = () => {
      call += 1;
      return {
        valid: false,
        errors: [`package/components/x.vue:${call === 1 ? 43 : 87}:21 style: variable @color-border-light is undefined`],
      };
    };
    const r = healDuplicateTextIssues({ files: makeFiles(), plan, figmaRoot, validateSfc });
    expect(r.healed.length).toBeGreaterThan(0);
  });

  it('原本 valid、删除后 invalid → 判定为新增错误并回退', () => {
    const validateSfc = (c: string) =>
      c.includes('<span></span>')
        ? { valid: false, errors: ['package/components/x.vue:9:9 parse: broken'] }
        : { valid: true, errors: [] };
    const r = healDuplicateTextIssues({ files: makeFiles(), plan, figmaRoot, validateSfc });
    expect(r.healed).toHaveLength(0);
  });
});

describe('checkSectionExclusiveEvidence · 借用文本/资源（2026-09-29 治本·阶段 D）', () => {
  // 真机实锤（流量监测 mc-max-1790657317082-67u1cdxz）：
  //   2:3660 是横向行，两个成员 2:3680 / 2:3683 在 Figma 里是**纯数字块**；
  //   但产物 ContentSection.vue（2:3680 的组件）渲染了 2:3438 的车型分布卡 ——
  //   背景图 bg-_m-36.png（节点属 2:3438 子树）、客车/22350。这两项都不是 2:3680 的证据。
  const figmaRoot: any = {
    id: 'root', name: 'cp-流量监测', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 400 },
    children: [
      {
        id: '2:3660', name: 'row', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 60 },
        children: [
          {
            id: '2:3680', name: 'card', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 52 },
            children: [
              { id: '2:3681', name: 't-江阴大桥', type: 'TEXT', characters: '江阴大桥', absoluteBoundingBox: { x: 0, y: 0, width: 60, height: 20 } },
              { id: '2:3682', name: 'd-82,379', type: 'TEXT', characters: '82,379', absoluteBoundingBox: { x: 0, y: 30, width: 40, height: 20 } },
            ],
          },
          {
            id: '2:3683', name: 'card', type: 'GROUP', absoluteBoundingBox: { x: 200, y: 0, width: 100, height: 52 },
            children: [
              { id: '2:3684', name: 't-江阴靖江长江隧道', type: 'TEXT', characters: '江阴靖江长江隧道', absoluteBoundingBox: { x: 200, y: 0, width: 90, height: 20 } },
              { id: '2:3685', name: 'd-34,620', type: 'TEXT', characters: '34,620', absoluteBoundingBox: { x: 200, y: 30, width: 40, height: 20 } },
            ],
          },
        ],
      },
      {
        id: '2:3438', name: 'row', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 100, width: 400, height: 120 },
        children: [
          {
            id: '2:3444', name: 'card', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 100, width: 100, height: 120 },
            children: [
              { id: '2:3450', name: 'bg', type: 'RECTANGLE', absoluteBoundingBox: { x: 0, y: 100, width: 100, height: 120 } },
              { id: '2:3445', name: 't-客车', type: 'TEXT', characters: '客车', absoluteBoundingBox: { x: 0, y: 100, width: 30, height: 20 } },
              { id: '2:3446', name: 'd-22350', type: 'TEXT', characters: '22350', absoluteBoundingBox: { x: 0, y: 130, width: 40, height: 20 } },
            ],
          },
        ],
      },
    ],
  };

  function makePlan(): any {
    return planWith([
      {
        id: '2:3660', title: 'row', sourceNodeIds: ['2:3660'],
        isLayoutContainer: true,
        children: [
          { id: '2:3680', title: 'card', body: { layout: 'vertical' }, sourceNodeIds: ['2:3680'] },
          { id: '2:3683', title: 'card', body: { layout: 'vertical' }, sourceNodeIds: ['2:3683'] },
        ],
      },
      {
        id: '2:3438', title: 'row', sourceNodeIds: ['2:3438'],
        isLayoutContainer: true,
        children: [
          { id: '2:3444', title: 'card', body: { layout: 'vertical' }, sourceNodeIds: ['2:3444'] },
        ],
      },
    ]);
  }

  // 组件名由 assignSectionComponentNames 决定（与真机同口径），测试动态取名避免与命名规则耦合
  function fileFor(sectionId: string, content: string) {
    const names = assignSectionComponentNames(makePlan().effectiveSections);
    const name = names.get(sectionId);
    return { path: `package/components/${name}.vue`, content };
  }

  const resourceDomMapping = [
    { resourceFile: '../resources/images/bg-_m-36.png', figmaNodeId: '2:3450' },
  ];

  it('2:3680 的组件渲染了 2:3438 的文本与背景图 → 两条借用都报', () => {
    const files = [
      fileFor(
        '2:3680',
        '<template><div class="card"><span>客车</span><span>22350</span><img :src="bg4" /></div></template>'
          + '<script setup>import bg4 from \'../../resources/images/bg-_m-36.png\'</script>',
      ),
    ];
    const r = checkSectionExclusiveEvidence({
      files, plan: makePlan(), figmaRoot, resourceDomMapping,
    });
    expect(r.borrowedAssetIssues).toHaveLength(1);
    expect(r.borrowedAssetIssues[0].sectionId).toBe('2:3680');
    expect(r.borrowedAssetIssues[0].resource).toBe('bg-_m-36.png');
    const texts = r.borrowedTextIssues.map((i: any) => i.text).sort();
    expect(texts).toContain('客车');
    expect(texts).toContain('22350');
  });

  it('各组件只渲染自己子树的证据 → 不报（零假阳性）', () => {
    const files = [
      fileFor('2:3680', '<template><div><span>江阴大桥</span><span>82,379</span></div></template>'),
      fileFor('2:3444', '<template><div><span>客车</span><span>22350</span><img :src="bg4" /></div></template>'
        + '<script setup>import bg4 from \'../../resources/images/bg-_m-36.png\'</script>'),
    ];
    const r = checkSectionExclusiveEvidence({
      files, plan: makePlan(), figmaRoot, resourceDomMapping,
    });
    expect(r.borrowedTextIssues).toEqual([]);
    expect(r.borrowedAssetIssues).toEqual([]);
  });

  it('多 section 共有的文本（图例类）不算借用', () => {
    // 让「客车」同时出现在 2:3680 子树里 → 归属歧义 → 不判
    const root2: any = JSON.parse(JSON.stringify(figmaRoot));
    root2.children[0].children[0].children.push({
      id: '2:3689', name: 't-客车', type: 'TEXT', characters: '客车',
      absoluteBoundingBox: { x: 0, y: 40, width: 30, height: 20 },
    });
    const files = [fileFor('2:3680', '<template><div><span>客车</span></div></template>')];
    const r = checkSectionExclusiveEvidence({
      files, plan: makePlan(), figmaRoot: root2, resourceDomMapping,
    });
    expect(r.borrowedTextIssues).toEqual([]);
  });

  it('资源无法解析归属（mapping 缺失）→ 不判', () => {
    const files = [
      fileFor('2:3680', '<template><div><img :src="bg9" /></div></template>'
        + '<script setup>import bg9 from \'../../resources/images/unknown.png\'</script>'),
    ];
    const r = checkSectionExclusiveEvidence({
      files, plan: makePlan(), figmaRoot, resourceDomMapping,
    });
    expect(r.borrowedAssetIssues).toEqual([]);
  });

  it('同一图片文件挂在多个节点（去重复用）→ 任一节点属本 section 即不报', () => {
    // 真机实锤：icon-3561.png 同时是 2:3561 与 2:3441 的图标（deduplicatedFrom）
    const files = [
      fileFor('2:3444', '<template><div><img :src="ic" /></div></template>'
        + '<script setup>import ic from \'../../resources/images/icon-3561.png\'</script>'),
    ];
    const root2: any = JSON.parse(JSON.stringify(figmaRoot));
    root2.children[1].children[0].children.push({ id: '2:3441', name: 'icon', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 100, width: 18, height: 18 } });
    const r = checkSectionExclusiveEvidence({
      files,
      plan: makePlan(),
      figmaRoot: root2,
      resourceDomMapping: [
        { resourceFile: '../resources/images/icon-3561.png', figmaNodeId: '2:3561' },
        { resourceFile: '../resources/images/icon-3561.png', figmaNodeId: '2:3441' },
      ],
    });
    expect(r.borrowedAssetIssues).toEqual([]);
  });

  it('空输入零崩溃', () => {
    expect(checkSectionExclusiveEvidence({ files: [], plan: makePlan(), figmaRoot }))
      .toEqual({ borrowedTextIssues: [], borrowedAssetIssues: [] });
    expect(checkSectionExclusiveEvidence({ files: [{ path: 'package/components/A.vue', content: 'x' }], plan: null }))
      .toEqual({ borrowedTextIssues: [], borrowedAssetIssues: [] });
  });
});

describe('checkSectionTruthCoverage · 真值文案覆盖（2026-09-29 治本·A）', () => {
  // 真机实锤（流量监测 mc-max-1790657317082-67u1cdxz）：
  //   HeaderSection.vue 骨架挂 section 2:3550（真值「流量监测」「*数据实时更新」），
  //   实际渲染 88:32 的「当日总流量」「24小时」→ 自己的真值 0 命中 + 外来文案 2 个。
  const figmaRoot: any = {
    id: 'root', name: 'cp-流量监测', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 400 },
    children: [
      {
        id: '2:3550', name: 'header', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 30 },
        children: [
          { id: '2:3551', name: 't-流量监测', type: 'TEXT', characters: '流量监测', absoluteBoundingBox: { x: 35, y: 6, width: 60, height: 18 } },
          { id: '2:3552', name: 't-*数据实时更新', type: 'TEXT', characters: '*数据实时更新', absoluteBoundingBox: { x: 320, y: 6, width: 70, height: 18 } },
        ],
      },
      {
        id: '88:32', name: 'sub-header', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 60, width: 400, height: 24 },
        children: [
          { id: '88:32a', name: 't-当日总流量', type: 'TEXT', characters: '当日总流量', absoluteBoundingBox: { x: 58, y: 62, width: 80, height: 18 } },
          { id: '88:32b', name: 't-24小时', type: 'TEXT', characters: '24小时', absoluteBoundingBox: { x: 326, y: 62, width: 40, height: 18 } },
        ],
      },
    ],
  };

  function makePlan(): any {
    return planWith([
      {
        id: 'root', title: 'root', sourceNodeIds: ['root'], isLayoutContainer: true,
        children: [
          { id: '2:3550', title: 'header', body: { layout: 'horizontal' }, sourceNodeIds: ['2:3550'] },
          { id: '88:32', title: 'sub-header', body: { layout: 'horizontal' }, sourceNodeIds: ['88:32'] },
        ],
      },
    ]);
  }

  function fileFor(sectionId: string, content: string) {
    const name = assignSectionComponentNames(makePlan().effectiveSections).get(sectionId);
    return { path: `package/components/${name}.vue`, content };
  }

  it('自己的真值 0 命中 + 渲染了邻居文案 → 报（含真值/外来文案清单）', () => {
    const files = [
      fileFor(
        '2:3550',
        '<template><div><span>当日总流量</span><span>24小时</span></div></template>',
      ),
    ];
    const r = checkSectionTruthCoverage({ files, plan: makePlan(), figmaRoot });
    expect(r).toHaveLength(1);
    expect(r[0].sectionId).toBe('2:3550');
    expect(r[0].truthTexts).toEqual(expect.arrayContaining(['流量监测', '*数据实时更新']));
    expect(r[0].foreignTexts).toEqual(expect.arrayContaining(['当日总流量', '24小时']));
  });

  it('渲染了自己的真值文案（哪怕不全）→ 不报', () => {
    const files = [
      fileFor('2:3550', '<template><div><span>流量监测</span></div></template>'),
    ];
    expect(checkSectionTruthCoverage({ files, plan: makePlan(), figmaRoot })).toEqual([]);
  });

  it('渲染的都是自己的文案、只是内容不全 → 不报（内容不全交给覆盖类门禁）', () => {
    const files = [
      fileFor('2:3550', '<template><div></div></template>'),
    ];
    expect(checkSectionTruthCoverage({ files, plan: makePlan(), figmaRoot })).toEqual([]);
  });

  it('真值文案只有图层名噪声（t/d）→ 不参与判定，不产生假阻断', () => {
    const noisy: any = JSON.parse(JSON.stringify(figmaRoot));
    noisy.children[0].children = [
      { id: '2:3553', name: 't', type: 'TEXT', characters: 't', absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 } },
      { id: '2:3554', name: 'd', type: 'TEXT', characters: 'd', absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 } },
    ];
    const files = [
      fileFor('2:3550', '<template><div><span>当日总流量</span></div></template>'),
    ];
    expect(checkSectionTruthCoverage({ files, plan: makePlan(), figmaRoot: noisy })).toEqual([]);
  });

  it('组件名未绑定到任何 section → 不判', () => {
    const files = [{ path: 'package/components/Unknown.vue', content: '<template><div><span>当日总流量</span></div></template>' }];
    expect(checkSectionTruthCoverage({ files, plan: makePlan(), figmaRoot })).toEqual([]);
  });

  it('空输入零崩溃', () => {
    expect(checkSectionTruthCoverage({ files: [], plan: makePlan(), figmaRoot })).toEqual([]);
    expect(checkSectionTruthCoverage({ files: [{ path: 'package/components/A.vue', content: 'x' }], plan: null })).toEqual([]);
    expect(checkSectionTruthCoverage({ files: [{ path: 'package/components/A.vue', content: 'x' }], plan: makePlan(), figmaRoot: null })).toEqual([]);
  });
});
