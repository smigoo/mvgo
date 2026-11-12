/**
 * 🛡️ S3/S4 判据驱动确定性兜底（2026-11-11 · docs/2026-11-11-S3S4判据驱动确定性兜底方案.md）
 *
 * S3：E3-v4 背景归属补挂（缺容器注入 / 存在未消费补 bg / 幂等跳过）
 * S4：G1-v2 tab 交互注入（无状态注入三件套 / 已有 @click 幂等跳过）
 * 阳性样本取自 90e4e5e7 真机产物形态。
 */
import {
  backstopMountBgOwnership,
  injectTabInteractivity,
} from './code-fix-rules.js';
import { CodeFixPipeline, FIX_PHASE } from './code-fix-pipeline.js';
import { runAcceptanceChecks } from '../utils/component-acceptance/index.js';

const MAPPING = [
  {
    resourceFile: '../resources/images/bg-_m-34.png',
    figmaNodeId: '88:34',
    ownerSectionId: '2:3660',
    targetDomSelector: '[data-section-id="2:3660"]',
    figmaBox: { x: 10, y: 196, width: 426, height: 91 },
    previewAnalysisRole: 'bg',
    downloadStatus: 'success',
  },
];

describe('S3 bg 归属确定性补挂', () => {
  it('阳性①：归属容器不存在 ⇒ 注入带真值尺寸+bg 的 div（90e4e5e7 形态）', () => {
    const files = {
      'package/components/Flow.vue':
        "<template>\n  <div data-section-id=\"88:33\">\n    <span>当日总流量</span>\n  </div>\n</template>\n<script setup>\nimport bg1 from '../../resources/images/bg-_m-34.png'\n</script>",
    };
    const r = backstopMountBgOwnership(files, MAPPING);
    const out = r.files['package/components/Flow.vue'];
    expect(r.stats.missingContainerInjected).toBe(1);
    expect(out).toContain('data-section-id="2:3660"');
    expect(out).toContain('width:426px');
    expect(out).toContain('height:91px');
    expect(out).toContain('bg-_m-34.png');
    // 🛡️ 2026-11-12 治本断言（5afb401f 缺陷①）：背景必须走 :style 动态绑定——
    //   静态 style 里 url('bg1') 是字面量，变量不解析 ⇒ 背景恒不显示。
    expect(out).toContain("backgroundImage: 'url(' + bg1 + ')'");
    expect(out).not.toMatch(/background-image:url\('bg1'\)/);
    // 🛡️ 治本断言（5afb401f 缺陷②）：注入 div 必须是**根内容容器的子元素**
    //   （原插「引用所在行行尾」落到父级/兄弟位置 ⇒ 错位方块破坏布局）。
    expect(out).toMatch(/data-section-id="88:33">\s*<div data-section-id="2:3660"/);
  });

  it('阳性②：归属容器存在但未消费 bg ⇒ 开标签补 background 绑定（动态 :style，非静态 style）', () => {
    const files = {
      'package/components/Flow.vue':
        "<template>\n  <div data-section-id=\"2:3660\" style=\"width:426px;height:91px;\">\n    <span>34,620</span>\n  </div>\n</template>\n<script setup>\nimport bg1 from '../../resources/images/bg-_m-34.png'\n</script>",
    };
    const r = backstopMountBgOwnership(files, MAPPING);
    const out = r.files['package/components/Flow.vue'];
    expect(r.stats.containerTagged).toBe(1);
    // 动态绑定形态（与幂等态样本同一正确形态）：`backgroundImage: 'url(' + bg1 + ')'`
    expect(out).toMatch(/data-section-id="2:3660"/);
    expect(out).toContain("backgroundImage: 'url(' + bg1 + ')'");
    // 静态尺寸保留（真值尺寸不能丢）
    expect(out).toContain('style="width:426px;height:91px;"');
    // 不得再出现「静态 style 里塞变量名」的错误形态
    expect(out).not.toMatch(/style="[^"]*url\('bg1'\)/);
  });

  it('幂等：归属容器已消费该 bg（变量名在标签内）⇒ 跳过不双挂', () => {
    const files = {
      'package/components/Flow.vue':
        "<template>\n  <div data-section-id=\"2:3660\" :style=\"{ backgroundImage: 'url(' + bg1 + ')', backgroundSize: '100% 100%' }\">\n    <span>34,620</span>\n  </div>\n</template>\n<script setup>\nimport bg1 from '../../resources/images/bg-_m-34.png'\n</script>",
    };
    const r = backstopMountBgOwnership(files, MAPPING);
    expect(r.stats.skippedAlreadyMounted).toBe(1);
    expect(r.files['package/components/Flow.vue']).toBe(
      files['package/components/Flow.vue'],
    );
  });

  /**
   * 🛡️ 2026-11-12 新增：S3 由「默认关闭」恢复「默认启用」后的**首要风险闸**。
   *   判据 E3-v4 v4（component-acceptance/index.js:646）把「数据驱动消费」列为**独立合规形态**
   *   并放行 ⇒ 修侧若照旧补挂，会造出第二份背景块（重复渲染）。
   */
  it('防护：数据驱动消费态（判据 E3-v4 v4 放行形态）⇒ 跳过注入，输出逐字不变', () => {
    const code = `<template>
  <div data-section-id="88:33">
    <div v-for="it in statItems" :key="it.k" :style="{ backgroundImage: 'url(' + it.bg + ')' }">{{ it.k }}</div>
  </div>
</template>
<script setup>
import bg1 from '../../resources/images/bg-_m-34.png'
const statItems = [{ k: 'a', bg: bg1 }]
</script>`;
    const r = backstopMountBgOwnership({ 'package/components/Flow.vue': code }, MAPPING);
    expect(r.stats.skippedDataDriven).toBe(1);
    expect(r.stats.missingContainerInjected).toBe(0);
    expect(r.stats.containerTagged).toBe(0);
    expect(r.files['package/components/Flow.vue']).toBe(code);
  });

  it('③ 动态形态祖先错挂：补挂归属容器同时剥掉祖先段的同资源动态背景（防双挂/拉伸）', () => {
    const code = `<template>
  <div data-section-id="88:33" :style="{ backgroundImage: 'url(' + bg1 + ')' }">
    <span>当日总流量</span>
  </div>
</template>
<script setup>
import bg1 from '../../resources/images/bg-_m-34.png'
</script>`;
    const r = backstopMountBgOwnership({ 'package/components/Flow.vue': code }, MAPPING);
    const out = r.files['package/components/Flow.vue'];
    expect(r.stats.missingContainerInjected).toBe(1);
    expect(r.stats.movedFromAncestor).toBe(1);
    expect(out).toContain('data-section-id="2:3660"');
    // 祖先段上的同资源动态背景已剥离（旧正则只认带连字符的 background-image ⇒ 清不掉）
    expect(out).not.toMatch(/data-section-id="88:33"[^>]*backgroundImage/);
  });
});

/**
 * 🛡️ S3 ③ 错挂清理两处治本（2026-11-12 · 真机 mc-max-1794461963464-28ec5c09 实锤）
 *   症状：S3 之后两张注入 div 的 `backgroundImage` **双双丢失** ⇒ E3-v4 由 1 条变 2 条。
 *   两个独立缺陷叠加：
 *     ⑥ `open.includes(varName)` 纯子串 ⇒ 短名命中长名内部（`bg3` ⊂ `bgbg3475`）。
 *     ⑦ ③ 只豁免当前 wantId ⇒ 同一 fname 被多个归属段共用时，兄弟段互相剥离。
 */
describe('S3 ③ 错挂清理：同 fname 多归属段 + 短变量名子串', () => {
  const SHARED_MAPPING = [
    {
      resourceFile: '../resources/images/bg-3475.png',
      figmaNodeId: '2:3473',
      ownerSectionId: '2:3474',
      targetDomSelector: '[data-section-id="2:3474"]',
      figmaBox: { x: 0, y: 0, width: 130, height: 9 },
      previewAnalysisRole: 'bg',
      downloadStatus: 'success',
    },
    {
      resourceFile: '../resources/images/bg-3475.png',
      figmaNodeId: '2:3523',
      ownerSectionId: '2:3524',
      targetDomSelector: '[data-section-id="2:3524"]',
      figmaBox: { x: 0, y: 0, width: 130, height: 9 },
      previewAnalysisRole: 'bg',
      downloadStatus: 'success',
    },
    {
      resourceFile: '../resources/images/bg-_m-35.png',
      figmaNodeId: '2:3495',
      ownerSectionId: '2:3496',
      targetDomSelector: '[data-section-id="2:3496"]',
      figmaBox: { x: 0, y: 0, width: 191, height: 81 },
      previewAnalysisRole: 'bg',
      downloadStatus: 'success',
    },
  ];

  it('缺陷⑦ 回归：同一 fname 被两个归属段共用 ⇒ 两份注入 div 均保留 backgroundImage（禁互剥）', () => {
    const files = {
      'package/index.vue':
        "<template>\n  <div data-section-id=\"88:33\">\n    <span>x</span>\n  </div>\n</template>\n<script setup>\nconst x = 1\n</script>",
    };
    const r = backstopMountBgOwnership(files, SHARED_MAPPING);
    const out = r.files['package/index.vue'];
    // bg-3475.png 两条 + bg-_m-35.png 一条 = 3 个容器都不存在 ⇒ 各注入一份
    expect(r.stats.missingContainerInjected).toBe(3);
    const tag3474 = out.match(/<div data-section-id="2:3474"[^>]*>/)?.[0] || '';
    const tag3524 = out.match(/<div data-section-id="2:3524"[^>]*>/)?.[0] || '';
    // 关键：两个兄弟归属段必须**同时**保有背景（旧实现互相剥离 ⇒ 两者皆空）
    expect(tag3474).toContain('backgroundImage');
    expect(tag3524).toContain('backgroundImage');
    expect(tag3474).toContain('bgbg3475');
    expect(tag3524).toContain('bgbg3475');
  });

  it('缺陷⑥ 回归：短变量名 bg3 不得命中长变量名 bgbg3475 内部 ⇒ 不误剥他段背景', () => {
    const files = {
      'package/index.vue':
        "<template>\n  <div data-section-id=\"2:3660\" :style=\"{ backgroundImage: 'url(' + bgbg3475 + ')' }\"></div>\n</template>\n<script setup>\nimport bg3 from '../../resources/images/bg-_m-35.png'\nconst bgbg3475 = 'x'\n</script>",
    };
    const mapping = [
      {
        resourceFile: '../resources/images/bg-_m-35.png',
        figmaNodeId: '2:3495',
        ownerSectionId: '2:3496',
        figmaBox: { x: 0, y: 0, width: 191, height: 81 },
        previewAnalysisRole: 'bg',
        downloadStatus: 'success',
      },
    ];
    const r = backstopMountBgOwnership(files, mapping);
    const out = r.files['package/index.vue'];
    // 2:3660 上的 bgbg3475 与 bg3 无任何关系 ⇒ 原样保留（旧实现被 `bg3 ⊂ bgbg3475` 误剥）
    expect(out).toContain("backgroundImage: 'url(' + bgbg3475 + ')'");
    expect(r.stats.movedFromAncestor).toBe(0);
  });
});

describe('S4 tab 交互确定性注入', () => {
  const FIGMA = {
    document: {
      children: [
        { id: '2:7954', name: 'tabs', type: 'FRAME', children: [] },
      ],
    },
  };
  const identify = () => ['2:7954'];

  it('阳性：tab 段承载无 @click ⇒ 注入 Mc 三件套（handleMcTabSwitch + activeMcTab）', () => {
    const files = {
      'package/components/TabsSection.vue':
        "<template>\n  <div data-section-id=\"2:7954\">\n    <span>隧道</span><span>大桥</span>\n  </div>\n</template>\n<script setup>\nconst x = 1\n</script>",
    };
    const r = injectTabInteractivity(files, FIGMA, identify);
    const out = r.files['package/components/TabsSection.vue'];
    expect(r.stats.injected).toBe(1);
    expect(out).toContain('@click="handleMcTabSwitch"');
    expect(out).toContain('const activeMcTab = ref(');
    expect(out).toContain('import { ref }');
  });

  it('幂等：容器已有 @click ⇒ 跳过不重复注入', () => {
    const files = {
      'package/components/TabsSection.vue':
        "<template>\n  <div data-section-id=\"2:7954\" @click=\"handleTabChange\">\n    <span>隧道</span>\n  </div>\n</template>\n<script setup>\nconst tabs = []\n</script>",
    };
    const r = injectTabInteractivity(files, FIGMA, identify);
    expect(r.stats.skippedHasClick).toBe(1);
    expect(r.stats.injected).toBe(0);
  });
});

describe('S3-b：无 import 资源也兜底（de2d9836 noVarConsumer=18/20 形态）', () => {
  it('阳性：LLM 没 import 的 bg ⇒ 自动补 import + 注入容器到 index.vue 兜底', () => {
    const files = {
      'package/index.vue':
        "<template>\n  <div data-section-id=\"88:33\">\n    <span>设备监测</span>\n  </div>\n</template>\n<script setup>\nconst x = 1\n</script>",
    };
    const mapping = [
      {
        resourceFile: '../resources/images/bg-item-device-status-4-130.png',
        figmaNodeId: '5:36087',
        ownerSectionId: '5:36088',
        figmaBox: { x: 0, y: 0, width: 117, height: 64 },
        previewAnalysisRole: 'bg',
        downloadStatus: 'success',
      },
    ];
    const r = backstopMountBgOwnership(files, mapping);
    const out = r.files['package/index.vue'];
    expect(r.stats.importInjected).toBe(1);
    expect(r.stats.missingContainerInjected).toBe(1);
    expect(out).toMatch(/import bg\w+ from '\.\.\/\.\.\/resources\/images\/bg-item-device-status-4-130\.png'/);
    expect(out).toContain('data-section-id="5:36088"');
    expect(out).toContain('width:117px');
  });

  it('落点优先级：targetDomSelector id 已存在于子组件 ⇒ 落该子组件而非 index.vue', () => {
    const files = {
      'package/index.vue':
        "<template>\n  <div><CardGrid /></div>\n</template>\n<script setup>\nconst x = 1\n</script>",
      'package/components/CardGrid.vue':
        "<template>\n  <div data-section-id=\"5:36088\">\n    <span>卡</span>\n  </div>\n</template>\n<script setup>\nconst y = 2\n</script>",
    };
    const mapping = [
      {
        resourceFile: '../resources/images/bg-item-device-1-120.png',
        figmaNodeId: '5:36087',
        ownerSectionId: '5:36089',
        targetDomSelector: '[data-section-id="5:36088"]',
        figmaBox: { x: 0, y: 0, width: 117, height: 64 },
        previewAnalysisRole: 'bg',
        downloadStatus: 'success',
      },
    ];
    const r = backstopMountBgOwnership(files, mapping);
    expect(r.files['package/components/CardGrid.vue']).toMatch(
      /import bg\w+ from '\.\.\/\.\.\/resources\/images\/bg-item-device-1-120\.png'/,
    );
    expect(r.files['package/components/CardGrid.vue']).toContain(
      'data-section-id="5:36089"',
    );
    expect(r.files['package/index.vue']).toBe(files['package/index.vue']);
  });
});

describe('F1 G1-v2 判据收敛：item 级 tab 不独立判（d3877740 8连报→1）', () => {
  const TRUTH_TABS = {
    document: {
      children: [
        {
          id: '89:37',
          name: '@antd/tab',
          type: 'FRAME',
          children: [
            {
              id: '89:39',
              name: 'tabs',
              type: 'FRAME',
              children: [
                { id: '2:8825', name: 'tab-active', type: 'GROUP', children: [] },
                { id: '2:8830', name: 'tab', type: 'GROUP', children: [] },
              ],
            },
          ],
        },
      ],
    },
  };

  it('阳性：产物零承载时只报 1 条 G1-v2（最外层容器），不再逐项 8 连报', () => {
    const r = runAcceptanceChecks({
      files: { 'package/index.vue': '<template><div>无tab</div></template>' },
      figmaNodeData: TRUTH_TABS,
    });
    const g1 = r.fails.filter((f) => f.code === 'G1-v2');
    expect(g1).toHaveLength(1);
    expect(g1[0].detail).toContain('89:37');
  });
});

describe('S4-b tab 块整块注入（真值缺失兜底）', () => {
  it('阳性：tab 容器零承载 ⇒ 注入完整 tab 块（容器+列表+各项真值文本+状态）', () => {
    const figma = {
      document: {
        children: [
          {
            id: '89:37',
            name: '@antd/tab',
            type: 'FRAME',
            children: [
              {
                id: '89:39',
                name: 'tabs',
                type: 'FRAME',
                children: [
                  { id: '2:8825', name: 'tab-active', type: 'GROUP', children: [{ type: 'TEXT', characters: '监控' }] },
                  { id: '2:8830', name: 'tab', type: 'GROUP', children: [{ type: 'TEXT', characters: '照明' }] },
                  { id: '2:8836', name: 'tab', type: 'GROUP', children: [{ type: 'TEXT', characters: '通风' }] },
                ],
              },
              { id: '2:8437', name: 'cons', type: 'FRAME', children: [] },
            ],
          },
        ],
      },
    };
    const files = {
      'package/components/CardGrid.vue':
        "<template>\n  <div>\n    <div data-section-id=\"2:8437\">\n      <span>卡</span>\n    </div>\n  </div>\n</template>\n<script setup>\nconst y = 2\n</script>",
    };
    const r = injectTabInteractivity(files, figma, () => ['89:37', '89:39', '2:8825', '2:8830', '2:8836']);
    const out = r.files['package/components/CardGrid.vue'];
    expect(r.stats.blockInjected).toBe(1);
    expect(out).toContain('data-section-id="89:37"');
    expect(out).toContain('data-section-id="89:39"');
    expect(out).toContain('监控');
    expect(out).toContain('照明');
    expect(out).toContain('mcActiveTab = ref(0)');
    // 只注入一次（item 级不重复注入）
    expect((out.match(/mc-s4-tabblock/g) || []).length).toBe(1);
  });
});

/**
 * S4-c（2026-11-11 · ce3e3b27 实锤）：执行顺序 + tab 项结构判据
 *   ① 顺序：S4 与 S1 同在 POLISH 且 S1 注册在后 ⇒ S4 看不到 data-section-id 锚点（noCarrier=1）；
 *      改为 INTERACTION 阶段（PHASE_ORDER 尾部）后，必在所有 POLISH 规则之后执行。
 *   ② 结构：tab 项子节点名为 `btn-active`/`btn`（不含 tabs）时，原「name 含 tabs」判据认不出。
 */
describe('S4-c 阶段顺序（INTERACTION 在 POLISH 之后）', () => {
  it('interaction 阶段的规则必在全部 polish 规则之后执行', () => {
    const order = [];
    const p = new CodeFixPipeline();
    // 刻意先注册 interaction，再注册 polish —— 验证的是阶段顺序，不是注册顺序
    p.register({
      id: 's4-probe',
      phase: FIX_PHASE.INTERACTION,
      fix: (c) => (order.push('interaction'), c),
    });
    p.register({
      id: 's1-probe',
      phase: FIX_PHASE.POLISH,
      fix: (c) => (order.push('polish'), c),
    });
    p.apply({ 'package/index.vue': '<template><div /></template>' });
    expect(order).toEqual(['polish', 'interaction']);
  });
});

describe('S4-c tab 项结构判据（与命名无关）', () => {
  const mkFigma = (children) => ({ document: { id: '0:0', type: 'DOCUMENT', children } });

  it('阳性：子节点名为 btn-active/btn（不含 tabs）⇒ 仍能注入完整 tab 块', () => {
    const figma = mkFigma([
      {
        id: '2:3566',
        name: '@antd/tab',
        type: 'FRAME',
        children: [
          { id: '2:3567', name: 'btn-active', type: 'GROUP', children: [{ type: 'TEXT', characters: '监控' }] },
          { id: '2:3569', name: 'btn', type: 'GROUP', children: [{ type: 'TEXT', characters: '照明' }] },
        ],
      },
    ]);
    const files = {
      'package/index.vue':
        "<template>\n  <div class=\"root\" />\n</template>\n<script setup>\nconst x = 1\n</script>",
    };
    const r = injectTabInteractivity(files, figma, () => ['2:3566']);
    expect(r.stats.blockInjected).toBe(1);
    const out = r.files['package/index.vue'];
    expect(out).toContain('监控');
    expect(out).toContain('照明');
    expect(out).toContain('mcActiveTab = ref(0)');
  });

  it('阳性：tab 列表在孙层（89:37 → 89:39 六项）⇒ 取全部 6 项而非直接子节点', () => {
    const six = ['监控', '照明', '通风', '供配电', '消防', '交通诱导'];
    const figma = mkFigma([
      {
        id: '89:37',
        name: '@antd/tab',
        type: 'FRAME',
        children: [
          {
            id: '89:39',
            name: 'tabs',
            type: 'FRAME',
            children: six.map((t, i) => ({
              id: `2:88${i}`,
              name: 'tab',
              type: 'GROUP',
              children: [{ type: 'TEXT', characters: t }],
            })),
          },
          { id: '2:8437', name: 'cons', type: 'FRAME', children: [] },
        ],
      },
    ]);
    const files = {
      'package/index.vue':
        "<template>\n  <div class=\"root\" />\n</template>\n<script setup>\nconst x = 1\n</script>",
    };
    const r = injectTabInteractivity(files, figma, () => ['89:37']);
    expect(r.stats.blockInjected).toBe(1);
    const out = r.files['package/index.vue'];
    for (const t of six) expect(out).toContain(t);
    expect(out).toContain('data-section-id="89:39"');
  });
});

/**
 * S4-d（2026-11-11 · a5df24e9 实锤）：整块注入降级为最后手段
 *   产物已有 tab 状态（tabs/activeTab）时，旧逻辑仍整块注入 ⇒ 面板外多出一份无样式 tab（竖排游离文字）。
 *   新契约：① 有状态+v-for ⇒ 只补锚点；② 有状态+无列表 ⇒ 补锚点并接到既有状态；③ 无状态才注入，
 *   且块必须带样式、只落在根内容容器内部。
 */
describe('S4-d 块注入降级为最后手段', () => {
  const FIGMA_TAB = {
    document: {
      children: [
        {
          id: '2:7954',
          name: '@antd/tab',
          type: 'FRAME',
          children: [
            { id: '2:7955', name: 'btn', type: 'GROUP', children: [{ type: 'TEXT', characters: '江阴靖江长江隧道' }] },
            { id: '2:7956', name: 'btn', type: 'GROUP', children: [{ type: 'TEXT', characters: '江阴大桥' }] },
          ],
        },
      ],
    },
  };

  it('① 已有 tabs 状态 + v-for 列表 ⇒ 只补锚点，不注入新块', () => {
    const code = `<template>
  <div class="root" data-section-id="2:7952">
    <div class="tabs">
      <span v-for="(t, i) in tabs" :key="i">{{ t.label }}</span>
    </div>
  </div>
</template>
<script setup>
import { ref } from 'vue'
const tabs = ref([{ label: '江阴靖江长江隧道', value: 'tunnel' }, { label: '江阴大桥', value: 'bridge' }])
const activeTab = ref('tunnel')
</script>`;
    const r = injectTabInteractivity({ 'package/index.vue': code }, FIGMA_TAB, () => ['2:7954']);
    expect(r.stats.blockInjected).toBe(0);
    expect(r.stats.anchoredExisting).toBe(1);
    const out = r.files['package/index.vue'];
    expect(out).not.toContain('mc-s4-tabblock');
    expect(out).toContain('data-section-id="2:7954"');
    expect(out).toContain('v-for="(t, i) in tabs"');
  });

  it('② 已有 tab 状态但无 v-for ⇒ 文本承载元素补锚点并接到既有状态（不造假交互）', () => {
    const code = `<template>
  <div class="root" data-section-id="2:7952">
    <span class="hd">江阴靖江长江隧道 江阴大桥</span>
  </div>
</template>
<script setup>
import { ref } from 'vue'
const tabs = ref([{ label: 'A', value: 'tunnel' }, { label: 'B', value: 'bridge' }])
const activeTab = ref('tunnel')
</script>`;
    const r = injectTabInteractivity({ 'package/index.vue': code }, FIGMA_TAB, () => ['2:7954']);
    expect(r.stats.blockInjected).toBe(0);
    expect(r.stats.anchoredExisting).toBe(1);
    const out = r.files['package/index.vue'];
    expect(out).toContain('data-section-id="2:7954"');
    expect(out).toContain("@click=\"activeTab = activeTab === 'tunnel' ? 'bridge' : 'tunnel'\"");
  });

  it('③ 无 tab 状态 ⇒ 注入块，且落在根内容容器内部、自带样式（不得再出现无样式游离块）', () => {
    const code = `<template>
  <base-panel panelKey="default-panel">
    <div class="c-x-slot-con">
      <div class="content" />
    </div>
  </base-panel>
</template>
<script setup>
const x = 1
</script>`;
    const r = injectTabInteractivity({ 'package/index.vue': code }, FIGMA_TAB, () => ['2:7954']);
    expect(r.stats.blockInjected).toBe(1);
    const out = r.files['package/index.vue'];
    // 位置：在 slot-con 开标签之后、content 之前（面板内部）
    const atSlot = out.indexOf('c-x-slot-con');
    const atBlock = out.indexOf('mc-s4-tabblock');
    const atContent = out.indexOf('class="content"');
    expect(atBlock).toBeGreaterThan(atSlot);
    expect(atBlock).toBeLessThan(atContent);
    expect(out).not.toMatch(/<\/base-panel>\s*<div class="mc-s4-tabblock"/);
    // 样式：容器与项都必须带最小可用样式
    expect(out).toContain('display:flex;flex-direction:row;align-items:center');
    expect(out).toContain('font-size:14px;line-height:1;white-space:nowrap;cursor:pointer;');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 🛡️ S4-e（2026-11-11 · c-vehicle-monitor-4cf5135f 实锤）：目标文件零 tab 状态
//   ≠ 产物零 tab——tab 状态在**其他文件**（header 插槽 ContentSection.vue 的
//   完整 pill tab）时，整块注入会制造第二套无样式 tab（截图两行裸文字）。
// 🛡️ R5（同任务）：资源导入绑定被写成字符串字面量 `iconSrc: 'icon5'` ⇒ 404。
import { healResourceBindingStringLiterals } from './code-fix-rules.js';

describe('S4-e 跨文件 tab 状态检测（整块注入前最后一道闸）', () => {
  const mkFigma = (children) => ({ document: { id: '0:0', type: 'DOCUMENT', children } });
  const tabTree = [
    {
      id: '2:3566',
      name: '@antd/tab',
      type: 'FRAME',
      children: [
        {
          id: '2:3567',
          name: 'tabs',
          type: 'FRAME',
          children: [
            { id: 't1', name: 'tab-active', type: 'GROUP', children: [{ type: 'TEXT', characters: '江阴靖江长江隧道' }] },
            { id: 't2', name: 'tab', type: 'GROUP', children: [{ type: 'TEXT', characters: '江阴大桥' }] },
          ],
        },
        { id: '2:3600', name: 'cons', type: 'FRAME', children: [] },
      ],
    },
  ];

  it('阳性：目标文件零状态但兄弟文件有 tabs ⇒ 跳过注入（skippedTabStateElsewhere=1）', () => {
    const files = {
      'package/index.vue':
        "<template>\n  <div>\n    <div data-section-id=\"2:3600\"><span>内容</span></div>\n  </div>\n</template>\n<script setup>\nconst y = 2\n</script>",
      'package/components/ContentSection.vue':
        "<template><div v-for=\"t in tabs\" :key=\"t.value\">{{ t.label }}</div></template>\n<script setup>\nconst tabs = ref([{ label: '江阴靖江长江隧道', value: 'a' }, { label: '江阴大桥', value: 'b' }])\nconst activeTab = ref('a')\n</script>",
    };
    const r = injectTabInteractivity(files, mkFigma(tabTree), () => ['2:3566', '2:3567', 't1', 't2']);
    expect(r.stats.skippedTabStateElsewhere).toBe(1);
    expect(r.stats.blockInjected).toBe(0);
    expect(r.files['package/index.vue']).not.toContain('mc-s4-tabblock');
  });

  it('阴性：全部文件都零 tab 状态 ⇒ 维持原整块注入路径（blockInjected=1）', () => {
    const files = {
      'package/index.vue':
        "<template>\n  <div>\n    <div data-section-id=\"2:3600\"><span>内容</span></div>\n  </div>\n</template>\n<script setup>\nconst y = 2\n</script>",
    };
    const r = injectTabInteractivity(files, mkFigma(tabTree), () => ['2:3566', '2:3567', 't1', 't2']);
    expect(r.stats.blockInjected).toBe(1);
    expect(r.stats.skippedTabStateElsewhere).toBe(0);
  });
});

describe('R5 资源导入绑定字符串字面量剥离', () => {
  it('阳性：iconSrc: \'icon5\'（icon5 为图片导入绑定）⇒ 剥引号还原变量引用', () => {
    const files = {
      'package/components/StatsSection.vue':
        "<template><div>{{ a.label }}</div></template>\n<script setup>\nimport icon5 from '../../resources/images/icon-8036.png'\nconst items = [{ label: 'a', iconSrc: 'icon5' }, { label: 'b', iconSrc: 'icon8' }]\n</script>",
    };
    const r = healResourceBindingStringLiterals(files);
    expect(r.stats.stripped).toBe(1); // icon8 未 import，不剥
    expect(r.stats.filesHealed).toBe(1);
    expect(r.files['package/components/StatsSection.vue']).toContain('iconSrc: icon5');
    expect(r.files['package/components/StatsSection.vue']).not.toContain("iconSrc: 'icon5'");
  });

  it('阴性：非图片导入的同名字符串 / 普通字符串值 ⇒ 不动', () => {
    const files = {
      'package/components/Ok.vue':
        "<template><div>{{ x }}</div></template>\n<script setup>\nimport icon5 from './icon5.util.js'\nconst x = 'icon5'\nconst label = 'notimport'\n</script>",
    };
    const r = healResourceBindingStringLiterals(files);
    expect(r.stats.stripped).toBe(0);
    expect(r.files['package/components/Ok.vue']).toContain("const x = 'icon5'");
  });
});
