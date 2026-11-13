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
    // D2 降级（2026-11-13 安全组）：文本重叠与 RUNTIME-016 同源，已转 warns 不再 BLOCK
    expect(r.warns.some((w) => w.includes('D2'))).toBe(true);
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

describe('E3-v4 bg 归属段对位（流量 mc-max-1794114542727 实锤：卡图挂祖先被拉伸 4 倍）', () => {
  // mapping 形态取自真实落盘数据：88:34「bg-[m]」归属段 2:3660，
  // 祖先链 [2:3660, 88:33, 2:9778]；产物却把图挂到祖先段 88:33。
  const mappingReal = [
    {
      figmaNodeId: '88:34',
      name: 'bg-[m]',
      previewAnalysisRole: 'bg',
      downloadStatus: 'success',
      resourceFile: '../resources/images/bg-_m-34.png',
      ownerSectionId: '2:3660',
      ancestorIds: ['2:3660', '88:33', '2:9778'],
      targetDomSelector: '[data-section-id="2:3660"]',
      figmaBox: { width: 91, height: 34 },
    },
  ];
  const IMPORT_BG =
    '\n<script setup>\nimport bg1 from "../../resources/images/bg-_m-34.png"\n</script>';

  it('① v5 反转（55a17681 裁决「只允许挂父级」）：bg 挂祖先 88:33（ancestorIds[1]）⇒ FAIL（v3 的 WARN 放行口子删除——修复轮修不过的历史理由已被 hardConstraints 配方推翻，55a17681 effective=true 实证）', () => {
    const files = {
      'package/index.vue':
        '<template><div data-section-id="88:33" :style="{ backgroundImage: \'url(\' + bg1 + \')\', backgroundSize: \'100% 100%\' }"></div></template>' +
        IMPORT_BG,
    };
    const r = runAcceptanceChecks({ files, resourceDomMapping: mappingReal });
    const e34 = r.fails.filter((x) => x.code === 'E3-v4');
    expect(e34).toHaveLength(1);
    expect(e34[0].detail).toContain('祖先段');
    expect(e34[0].hardConstraints?.[0]).toMatchObject({ targetDomSelector: '[data-section-id="2:3660"]' });
    expect(r.warns.some((w) => w.includes('远祖挂载判 FAIL'))).toBe(true);
  });

  it('② 阴性：bg 消费在归属段 2:3660 自身 ⇒ 无 E3-v4', () => {
    const files = {
      'package/index.vue':
        '<template><div data-section-id="88:33"><div data-section-id="2:3660" :style="{ backgroundImage: \'url(\' + bg1 + \')\' }"></div></div></template>' +
        IMPORT_BG,
    };
    const r = runAcceptanceChecks({ files, resourceDomMapping: mappingReal });
    expect(r.fails.filter((x) => x.code === 'E3-v4')).toHaveLength(0);
  });

  it('③ 边缘：资源未 import（落盘未消费）⇒ 不报 E3-v4；E2-v3 于 2026-11-11 降级为 WARN', () => {
    const files = { 'package/index.vue': '<template><div data-section-id="88:33"></div></template>' };
    const r = runAcceptanceChecks({ files, resourceDomMapping: mappingReal });
    expect(r.fails.filter((x) => x.code === 'E3-v4')).toHaveLength(0);
    expect(r.warns.some((w) => w.includes('E2-v3'))).toBe(true);
  });

  it('④ guidance 附 E3-v4 归属修复规则（治「只缩样式糊过去」）', () => {
    const g = formatAcceptanceGuidance([{ code: 'E3-v4', detail: 'x' }]);
    expect(g).toContain('data-section-id');
    expect(g).toContain('严禁把该背景挂到祖先容器');
    expect(g).toContain('真值尺寸');
  });
});

describe('E2-v3 落盘未消费（修复 Object.values 逐字符遍历 bug）', () => {
  const mapping = [
    {
      figmaNodeId: '1',
      name: 'bg',
      previewAnalysisRole: 'bg',
      downloadStatus: 'success',
      resourceFile: '../resources/images/a.png',
      targetDomSelector: '[data-section-id="9:9"]',
    },
  ];

  it('① 阳性：success 资源未被任何 .vue 引用 ⇒ E2-v3 WARN（2026-11-11 降级：卫生问题不拦交付）', () => {
    const files = { 'package/index.vue': '<template><div /></template>' };
    const r = runAcceptanceChecks({ files, resourceDomMapping: mapping });
    expect(r.warns.some((w) => w.includes('E2-v3'))).toBe(true);
    expect(r.fails.filter((f) => f.code === 'E2-v3')).toHaveLength(0);
  });

  it('② 阴性：资源已在子组件 import ⇒ 无 E2-v3（旧逐字符遍历必报，回归锁）', () => {
    const files = {
      'package/index.vue': '<template><div /></template>',
      'package/components/A.vue':
        '<template><div /></template>\n<script setup>\nimport a from "../../resources/images/a.png"\n</script>',
    };
    const r = runAcceptanceChecks({ files, resourceDomMapping: mapping });
    expect(r.warns.some((w) => w.includes('E2-v3'))).toBe(false);
  });

  // 🛡️ E2-v3 语义分层（2026-11-11 晚 · 37f6f9fd 回归修正）：296709f 一刀切 WARN 漏放
  //   了前景内容位图零消费（产品图已下载却零 <img>＝肉眼缺图）。
  it('③ 语义分层·阳性：role=image 前景位图零消费 ⇒ FAIL（37f6f9fd 产品图形态）', () => {
    const fgMapping = [
      {
        figmaNodeId: '36:1725',
        name: '产品图',
        previewAnalysisRole: 'image',
        downloadStatus: 'success',
        resourceFile: '../resources/images/img-1725.png',
        ownerSectionId: '801:3',
      },
    ];
    const files = { 'package/index.vue': '<template><div /></template>' };
    const r = runAcceptanceChecks({ files, resourceDomMapping: fgMapping });
    const e2 = r.fails.filter((f) => f.code === 'E2-v3');
    expect(e2).toHaveLength(1);
    expect(e2[0].detail).toContain('前景');
    // 🛡️ A6-c（9e75b757 实锤）：files 必须是**承载文件**（ownerSectionId=801:3 →
    // 含该段锚的 .vue；本例产物只有 index.vue）——资源图片路径在 A6 修复轮
    // shouldRegenerate 匹配 chunk.files（全是 .vue）永远落空 ⇒ 修复轮 0 有效。
    expect(e2[0].files).toEqual(['package/index.vue']);
  });

  // 🛡️ P0#4（2026-11-12 · a3529d83 icon-8036 / 828c281a img-1725 / 84dc4bdf 三连拒）：
  //   修复轮只有自然语言 guidance ⇒ LLM 拿别的资源顶包（icon-123 顶 icon-8036）→ 复检
  //   仍 FAIL → 拒交付。FAIL 必须携带可照抄 hardConstraints（ownerSectionId/usage/尺寸）。
  it('⑤ 前景 FAIL 附 hardConstraints 可照抄配方（ownerSectionId/usage/尺寸/importPath 齐全）', () => {
    const fgMapping = [
      {
        figmaNodeId: '2:8038',
        name: 'icon-危化品车',
        previewAnalysisRole: 'icon',
        downloadStatus: 'success',
        resourceFile: '../resources/images/icon-8036.png',
        ownerSectionId: '136:129',
        recommendedUsage: 'imgSrc',
        figmaBox: { width: 48, height: 48 },
      },
    ];
    const files = { 'package/index.vue': '<template><div /></template>' };
    const r = runAcceptanceChecks({ files, resourceDomMapping: fgMapping });
    const e2 = r.fails.filter((f) => f.code === 'E2-v3');
    expect(e2).toHaveLength(1);
    expect(e2[0].hardConstraints).toHaveLength(1);
    expect(e2[0].hardConstraints[0]).toMatchObject({
      fname: 'icon-8036.png',
      ownerSectionId: '136:129',
      usage: 'imgSrc',
      width: 48,
      height: 48,
      importPath: '../resources/images/icon-8036.png',
    });
    // guidance 输出可照抄 <img> 配方并明令禁止顶包
    const g = formatAcceptanceGuidance(e2);
    expect(g).toContain('E2-v3 前景资源挂载配方');
    expect(g).toContain('[data-section-id="136:129"]');
    expect(g).toContain('严禁用其他资源顶包');
    // 🛡️ 4bed3cd6：归属段未建模时配方必须带「先建宿主容器」指令（防无处可挂→顶包）
    //   A6-c′：该指令已同步点名承载文件（写入哪个 .vue）
    expect(g).toContain('其真值父段');
    expect(g).toContain('【写入 package/index.vue】');
    // bg/无 role 不给配方（仍 WARN）
    const r2 = runAcceptanceChecks({ files, resourceDomMapping: mapping });
    expect(r2.fails.filter((f) => f.code === 'E2-v3')).toHaveLength(0);
  });

  // 🛡️ A6-c′（2026-11-12 · mc-max-1794461963464-28ec5c09 实锤）：承载文件定位新增
  //   `figmaPath` 区域段级（`slot-<中文段名>` 优先，其次 figmaPath 最长中文段）。
  //   真机旧三级两级失效——owner 段锚 9/10 在产物缺失（S1 inject-section-anchors 只标段根）
  //   ＋ fname 全英文（Group-3664 等）无中文段 ⇒ 10/10 兜底 package/index.vue ⇒ 修复轮
  //   shouldRegenerate 只命中 chunk 3（index.vue），真承载 chunk 5/8 永不重写 ⇒ E2-v3
  //   恒不复检通过。本锚锁「owner 段锚缺失时 → figmaPath 区域段命中真承载子组件」。
  it('⑦ 承载文件定位·figmaPath 区域段：owner 段锚缺失时命中真承载子组件（不再兜底 index.vue）', () => {
    const fgMapping = [
      {
        figmaNodeId: '88:34',
        name: 'Group-3664',
        previewAnalysisRole: 'image',
        downloadStatus: 'success',
        resourceFile: '../resources/images/Group-3664.png',
        ownerSectionId: '88:33', // 产物无该段锚（真机 9/10 同形）
        figmaPath: 'cp-流量监测/slot-当日总流量/Frame 2136636802/bg-[m]/Group 1321315135/Group',
        recommendedUsage: 'imgSrc',
        figmaBox: { width: 120, height: 60 },
      },
      {
        figmaNodeId: '2:3450',
        name: 'Group_2136637423-3450',
        previewAnalysisRole: 'icon',
        downloadStatus: 'success',
        resourceFile: '../resources/images/Group_2136637423-3450.png',
        ownerSectionId: '2:3442', // 同样缺失
        figmaPath: 'cp-流量监测/slot-车型分布/con/card/bg-[m]/Frame 2136639398/Group 2136637423',
        recommendedUsage: 'imgSrc',
        figmaBox: { width: 32, height: 32 },
      },
    ];
    const files = {
      'package/index.vue': '<template><base-panel><Daily /></base-panel></template>',
      'package/components/ContentDailyTotalFlow.vue':
        '<template><div data-section-id="2:3550"><span>当日总流量</span></div></template>',
      'package/components/ContentVehicleDist.vue':
        '<template><div data-section-id="2:3438"><span>车型分布</span></div></template>',
    };
    const r = runAcceptanceChecks({ files, resourceDomMapping: fgMapping });
    const e2 = r.fails.filter((f) => f.code === 'E2-v3');
    expect(e2).toHaveLength(1);
    // 🔴 真承载子组件被正确点名（旧实现此处为 ['package/index.vue']）
    expect([...e2[0].files].sort()).toEqual([
      'package/components/ContentDailyTotalFlow.vue',
      'package/components/ContentVehicleDist.vue',
    ]);
    expect(e2[0].files).not.toContain('package/index.vue');
    // 每条 hardConstraints 都带 carrierFile，供配方逐条标注写入文件
    expect(e2[0].hardConstraints.map((h) => h.carrierFile)).toEqual([
      'package/components/ContentDailyTotalFlow.vue',
      'package/components/ContentVehicleDist.vue',
    ]);
    // 回灌配方显式点名写入文件
    const g = formatAcceptanceGuidance(e2);
    expect(g).toContain('【写入 package/components/ContentDailyTotalFlow.vue】');
    expect(g).toContain('【写入 package/components/ContentVehicleDist.vue】');
  });

  // 🛡️ A6-c′ 阴性对照：owner 段锚存在时仍优先 owner（不回退到 figmaPath 区域段）
  it('⑧ 承载文件定位·阴性：owner 段锚存在时优先 owner 对应文件', () => {
    const fgMapping = [
      {
        figmaNodeId: '2:9000',
        name: 'Group-9000',
        previewAnalysisRole: 'image',
        downloadStatus: 'success',
        resourceFile: '../resources/images/Group-9000.png',
        ownerSectionId: '2:7777',
        // figmaPath 指向另一区域（若误用区域段会选错文件）
        figmaPath: 'cp-流量监测/slot-车型分布/con/card/Group 9000',
        figmaBox: { width: 200, height: 100 },
      },
    ];
    const files = {
      'package/index.vue': '<template><div /></template>',
      'package/components/ContentDailyTotalFlow.vue':
        '<template><div data-section-id="2:7777">当日总流量</div></template>',
      'package/components/ContentVehicleDist.vue':
        '<template><div data-section-id="2:3438">车型分布</div></template>',
    };
    const r = runAcceptanceChecks({ files, resourceDomMapping: fgMapping });
    const e2 = r.fails.filter((f) => f.code === 'E2-v3');
    expect(e2).toHaveLength(1);
    expect(e2[0].files).toEqual(['package/components/ContentDailyTotalFlow.vue']);
  });

  it('④ 语义分层·role=icon 零消费 ⇒ 同样 FAIL（前景内容家族一致口径）', () => {
    const fgMapping = [
      {
        figmaNodeId: '2:1',
        name: '头部图标',
        previewAnalysisRole: 'icon',
        downloadStatus: 'success',
        resourceFile: '../resources/images/icon-2-1.png',
      },
    ];
    const files = { 'package/index.vue': '<template><div /></template>' };
    const r = runAcceptanceChecks({ files, resourceDomMapping: fgMapping });
    expect(r.fails.filter((f) => f.code === 'E2-v3')).toHaveLength(1);
    expect(r.warns.some((w) => w.includes('E2-v3'))).toBe(false);
  });

  it('⑤ 语义分层·阴性：role=bg 零消费保持 WARN（296709f 治误杀成果不回退）', () => {
    const files = { 'package/index.vue': '<template><div /></template>' };
    const r = runAcceptanceChecks({ files, resourceDomMapping: mapping });
    expect(r.fails.filter((f) => f.code === 'E2-v3')).toHaveLength(0);
    expect(r.warns.some((w) => w.includes('E2-v3'))).toBe(true);
  });

  it('⑥ 语义分层·混合：image 零消费 FAIL + bg 零消费 WARN 同任务并存不互相吞', () => {
    const mixed = [
      {
        figmaNodeId: 'a',
        previewAnalysisRole: 'image',
        downloadStatus: 'success',
        resourceFile: '../resources/images/img-a.png',
      },
      {
        figmaNodeId: 'b',
        previewAnalysisRole: 'bg',
        downloadStatus: 'success',
        resourceFile: '../resources/images/bg-b.png',
      },
    ];
    const files = { 'package/index.vue': '<template><div /></template>' };
    const r = runAcceptanceChecks({ files, resourceDomMapping: mixed });
    expect(r.fails.filter((f) => f.code === 'E2-v3')).toHaveLength(1);
    expect(r.warns.some((w) => w.includes('E2-v3'))).toBe(true);
  });

  it('⑦ 阴性：无 role 的落盘未消费 ⇒ 维持 WARN（不猜前景，避免误杀回潮）', () => {
    const noRole = [
      {
        figmaNodeId: 'c',
        downloadStatus: 'success',
        resourceFile: '../resources/images/x.png',
      },
    ];
    const files = { 'package/index.vue': '<template><div /></template>' };
    const r = runAcceptanceChecks({ files, resourceDomMapping: noRole });
    expect(r.fails.filter((f) => f.code === 'E2-v3')).toHaveLength(0);
    expect(r.warns.some((w) => w.includes('E2-v3'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 🔴 P0-2（2026-11-11 交接文档）：C1 三漏口扩口 + L5 空声明 E5
// ═══════════════════════════════════════════════════════════════════
import { extractScriptStringLiterals } from './index.js';

describe('P0-2 C1 扩口（漏口①script 常量 ②--占位 ③真值有文本产物空）', () => {
  const fig = {
    document: {
      id: '0:0',
      children: [
        { id: 'n1', type: 'TEXT', characters: '爆闪灯' },
        { id: 'n2', type: 'TEXT', characters: '设备详情' },
        { id: 'n3', type: 'TEXT', children: [
          { id: 'n3a', type: 'TEXT', characters: ' GD-Robot-04 ' },
        ] },
        { id: 'n4', name: '@echarts/柱状图', type: 'FRAME', children: [
          { id: 'n4a', type: 'TEXT', characters: '车型分布' },
        ] },
      ],
    },
  };

  it('① 漏口②：模板静态 `--`/待补充 占位 ⇒ C1 FAIL（旧符号豁免放行实锤补口）', () => {
    const files = {
      'package/index.vue': '<template><div>--</div><div>待补充</div></template>',
    };
    const r = runAcceptanceChecks({ files, figmaNodeData: fig });
    const c1 = r.fails.find((f) => f.code === 'C1');
    expect(c1).toBeTruthy();
    expect(c1.detail).toContain('展示文本');
  });

  it('② 漏口①：script 常量数组占位（statsItems 形态）⇒ C1 FAIL 且附 file', () => {
    const files = {
      'package/components/StatsSection.vue':
        '<template><div v-for="s in statsItems">{{ s.label }}</div></template>\n' +
        "<script setup>\nconst statsItems = [{ label: '--' }, { label: '待补充' }]\n</script>",
    };
    const r = runAcceptanceChecks({ files, figmaNodeData: fig });
    const c1 = r.fails.find((f) => f.code === 'C1' && /script 常量/.test(f.detail));
    expect(c1).toBeTruthy();
    expect(c1.file).toBe('package/components/StatsSection.vue');
  });

  it('③ 漏口①阴性：script 内真值文案 + 英文标识符不误报', () => {
    const files = {
      'package/components/StatsSection.vue':
        '<template><div>{{ a }}</div></template>\n' +
        "<script setup>\n// 注释里的中文不该被抓：非真值词\nimport x from './a.vue'\nconst a = '爆闪灯'\n</script>",
    };
    const r = runAcceptanceChecks({ files, figmaNodeData: fig });
    expect(r.fails.filter((f) => f.code === 'C1' && /script 常量/.test(f.detail))).toHaveLength(0);
  });

  it('④ 漏口①：script 注释中的中文被剥除，不进臆造清单', () => {
    const lits = extractScriptStringLiterals(
      "// TODO 处理臆造词\n/* 块注释 臆造词 */\nconst a = '真值'\nconst url = 'http://x//y'\n",
    );
    expect(lits).toEqual(['真值', 'http://x//y']);
  });

  it('⑤ 漏口③：真值标签（≥2 个）产物零命中 ⇒ C1b FAIL；图表子树文案免检', () => {
    const files = {
      'package/index.vue': '<template><div>x</div></template>',
    };
    const r = runAcceptanceChecks({ files, figmaNodeData: fig });
    const c1b = r.fails.find((f) => f.code === 'C1b');
    expect(c1b).toBeTruthy();
    expect(c1b.detail).toContain('爆闪灯');
    expect(c1b.detail).not.toContain('车型分布'); // @echarts 子树免检
  });

  it('⑥ 漏口③阴性：标签齐全或仅缺 1 个 ⇒ 无 C1b（阈值 ≥2 防单点误杀）', () => {
    const files = {
      'package/index.vue': '<template><div>设备详情 爆闪灯</div></template>',
    };
    const r = runAcceptanceChecks({ files, figmaNodeData: fig });
    expect(r.fails.filter((f) => f.code === 'C1b')).toHaveLength(0);
  });

  // 🛡️ A6 前置（2026-11-11 晚 · 4b27c0bd 实锤）：C1b fail 必须可定位文件，
  //   否则 failFiles 不含真坏文件 ⇒ A6/R12 断点恢复把占位组件每轮复活。
  it('⑦ C1b 附文件定位：缺席标签的祖先链命中产物承载段 ⇒ fail.files=carrier', () => {
    const figSec = {
      document: {
        id: '0:0',
        children: [
          {
            id: 'sec1',
            name: '厂商分组',
            type: 'FRAME',
            children: [
              { id: 'sub', type: 'FRAME', children: [{ id: 'l1', type: 'TEXT', characters: '大华股份' }] },
              { id: 'l2', type: 'TEXT', characters: '宇视科技' },
            ],
          },
        ],
      },
    };
    const files = {
      'package/index.vue': '<template><div>x</div></template>',
      'package/components/VendorList.vue':
        '<template><div data-section-id="sec1"><span>y</span></div></template>',
    };
    const r = runAcceptanceChecks({ files, figmaNodeData: figSec });
    const c1b = r.fails.find((f) => f.code === 'C1b');
    expect(c1b).toBeTruthy();
    expect(c1b.files).toEqual(['package/components/VendorList.vue']);
  });

  it('⑧ C1b 定位阴性：产物无任何承载段（无 data-section-id）⇒ FAIL 但不带 files（放行语义不误扩）', () => {
    const files = { 'package/index.vue': '<template><div>x</div></template>' };
    const r = runAcceptanceChecks({ files, figmaNodeData: fig }); // fig 顶层无 section 框架
    const c1b = r.fails.find((f) => f.code === 'C1b');
    expect(c1b).toBeTruthy();
    expect(c1b.files).toBeUndefined();
  });

  it('⑨ C1b 定位多段：标签分属两个承载段 ⇒ files 去重收集全部 carrier', () => {
    const figMulti = {
      document: {
        id: '0:0',
        children: [
          { id: 'secA', name: 'A', type: 'FRAME', children: [{ id: 'la', type: 'TEXT', characters: '大华股份' }] },
          { id: 'secB', name: 'B', type: 'FRAME', children: [{ id: 'lb', type: 'TEXT', characters: '宇视科技' }] },
        ],
      },
    };
    const files = {
      'package/index.vue': '<template><div>x</div></template>',
      'package/components/A.vue': '<template><div data-section-id="secA"></div></template>',
      'package/components/B.vue': '<template><div data-section-id="secB"></div></template>',
    };
    const r = runAcceptanceChecks({ files, figmaNodeData: figMulti });
    const c1b = r.fails.find((f) => f.code === 'C1b');
    expect(c1b).toBeTruthy();
    expect([...c1b.files].sort()).toEqual([
      'package/components/A.vue',
      'package/components/B.vue',
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 🔴 P0#1（2026-11-12 · mc-max-1794413869389-bd32c592 实锤）：C1 标签剥离
//   <[^>]+> 被属性值内 `>`（@legend-select="(v) => $emit(...)"）提前截断，
//   代码残段（$emit('legen、@data-zoom="、/>）泄漏成「展示文本」⇒ 假 FAIL
//   连坐修复轮。修：剥标签前清空引号属性值 ＋ 代码特征 token 豁免兜底。
// ═══════════════════════════════════════════════════════════════════
describe('P0#1 C1 代码片段误报（bd32c592：属性值含 > 截断泄漏）', () => {
  const fig = {
    document: {
      id: '0:0',
      children: [
        { id: 't1', type: 'TEXT', characters: '爆闪灯' },
        { id: 't2', type: 'TEXT', characters: '设备详情' },
      ],
    },
  };

  it('① 属性值内含 > 的事件绑定不再泄漏成展示文本（bd32c592 实锤形态）', () => {
    const files = {
      'package/components/ContentForecast.vue':
        '<template>\n' +
        '  <div>爆闪灯</div>\n' +
        "  <ForecastChart @legend-select=\"(v) => $emit('legend-select', v)\" @data-zoom=\"onZoom\" />\n" +
        '</template>',
    };
    const r = runAcceptanceChecks({ files, figmaNodeData: fig });
    const c1 = r.fails.filter((f) => f.code === 'C1' && /展示文本/.test(f.detail));
    expect(c1).toHaveLength(0);
  });

  it('② 阳性对照：真臆造中文文案仍 FAIL（修复不放水）', () => {
    const files = {
      'package/index.vue':
        '<template><div>设备详情</div><div>臆造词甲</div><div>臆造词乙</div></template>',
    };
    const r = runAcceptanceChecks({ files, figmaNodeData: fig });
    const c1 = r.fails.find((f) => f.code === 'C1' && /展示文本/.test(f.detail));
    expect(c1).toBeTruthy();
    expect(c1.detail).toContain('2 条');
  });

  it('③ 代码特征 token 兜底豁免：/>、$emit( 残段不进臆造清单（旧实现 2 条 ⇒ FAIL）', () => {
    const files = {
      'package/index.vue':
        "<template><div>爆闪灯</div><div>设备详情</div><div>/></div><div>$emit('legend', v)</div></template>",
    };
    const r = runAcceptanceChecks({ files, figmaNodeData: fig });
    const c1 = r.fails.filter((f) => f.code === 'C1' && /展示文本/.test(f.detail));
    expect(c1).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 🔴 C1-DUP（2026-11-12 · mc-max-1794415139727-828c281a 实锤）：刀53/54 regions
//   接管（ContentHeader.vue rt4=「产品描述」绝对定位）与 LLM chunk（ContentSection.vue
//   runs[0]=「产品描述」）跨文件重叠渲染同一真值文本 ⇒ 页面两份。
// ═══════════════════════════════════════════════════════════════════
describe('C1-DUP 重复渲染（828c281a：接管组件与 LLM chunk 跨文件重叠）', () => {
  const fig = {
    document: {
      id: '0:0',
      children: [
        { id: 'd1', type: 'TEXT', characters: '产品描述' },
        { id: 'd2', type: 'TEXT', characters: '该设备为太阳能供电一体化爆闪灯。' },
      ],
    },
  };
  const takeoverFile =
    '<template><div data-section-id="36:1693" class="c-device-fg-regions-361693">' +
    '<span class="c-device-fg-regions-361693-rt" style="position:absolute;">{{ rt4 }}</span>' +
    '</div></template>\n<script setup>\nconst rt4 = "产品描述"\n</script>';
  const llmFile =
    '<template><div data-section-id="36:1708">' +
    '<span>{{ runs[0].text }}</span><span>{{ runs[1].text }}</span>' +
    '</div></template>\n<script setup>\nconst runs = [{ "text": "产品描述" }, { "text": "该设备为太阳能供电一体化爆闪灯。" }]\n</script>';

  it('① 828c281a 形态：接管文件+LLM 文件渲染同一真值唯一标签 ⇒ C1-DUP FAIL，files 只列非接管文件', () => {
    const files = {
      'package/components/ContentHeader.vue': takeoverFile,
      'package/components/ContentSection.vue': llmFile,
    };
    const r = runAcceptanceChecks({ files, figmaNodeData: fig });
    const dup = r.fails.find((f) => f.code === 'C1-DUP');
    expect(dup).toBeTruthy();
    expect(dup.detail).toContain('产品描述');
    expect(dup.files).toEqual(['package/components/ContentSection.vue']);
    // 修复指导可执行：指明以接管组件为准 + 禁止隐藏糊弄
    const g = formatAcceptanceGuidance([dup]);
    expect(g).toContain('以它为准');
    expect(g).toContain('禁止用 v-if=false');
  });

  it('② 阴性a：真值中该标签出现 2 次（本就多处展示）⇒ 不判', () => {
    const fig2 = {
      document: {
        id: '0:0',
        children: [
          { id: 'd1', type: 'TEXT', characters: '产品描述' },
          { id: 'd2', type: 'TEXT', characters: '产品描述' },
        ],
      },
    };
    const files = {
      'package/components/ContentHeader.vue': takeoverFile,
      'package/components/ContentSection.vue': llmFile,
    };
    const r = runAcceptanceChecks({ files, figmaNodeData: fig2 });
    expect(r.fails.filter((f) => f.code === 'C1-DUP')).toHaveLength(0);
  });

  it('③ 阴性b：单文件渲染（哪怕 script+模板双形态）⇒ 不判；真值缺席标签（图表配置文案）不进本判据', () => {
    const single =
      '<template><div data-section-id="36:1708"><span>{{ rt4 }}</span></div></template>\n' +
      '<script setup>\nconst rt4 = "产品描述"\nconst markName = "阈值线"\n</script>';
    const another =
      '<template><div>x</div></template>\n<script setup>\nconst markName2 = "阈值线"\n</script>';
    const r = runAcceptanceChecks({
      files: { 'package/components/A.vue': single, 'package/components/B.vue': another },
      figmaNodeData: fig,
    });
    expect(r.fails.filter((f) => f.code === 'C1-DUP')).toHaveLength(0);
  });

  it('④ 死数据守卫（f8d1be8a 实锤）：script 常量未被本文件模板消费 ⇒ 不算渲染，不判重复', () => {
    // index.vue 模板只有 <TabsSection/>，tabList 是未接线死数据；真渲染在 TabsSection.vue
    const figTabs = {
      document: {
        id: '0:0',
        children: [{ id: 't1', type: 'TEXT', characters: '江阴靖江长江隧道' }],
      },
    };
    const indexDead =
      '<template><div class="wrap"><TabsSection /></div></template>\n' +
      "<script setup>\nconst tabList = [{ key: 'tunnel', label: '江阴靖江长江隧道' }]\n</script>";
    const tabsLive =
      '<template><div data-section-id="2:7959"><div v-for="t in tabs">{{ t.label }}</div></div></template>\n' +
      "<script setup>\nconst tabs = [{ label: '江阴靖江长江隧道', value: 'tunnel' }]\n</script>";
    const r = runAcceptanceChecks({
      files: {
        'package/index.vue': indexDead,
        'package/components/TabsSection.vue': tabsLive,
      },
      figmaNodeData: figTabs,
    });
    expect(r.fails.filter((f) => f.code === 'C1-DUP')).toHaveLength(0);
  });

  it('⑤ 死数据守卫不误伤：script 常量被模板消费（v-for 引用变量）⇒ 照常判重复（828c281a 形态保持）', () => {
    const figTabs2 = {
      document: {
        id: '0:0',
        children: [{ id: 't1', type: 'TEXT', characters: '产品描述' }],
      },
    };
    // 两文件都真渲染：变量名出现在模板 v-for/插值中
    const fA =
      '<template><div data-section-id="36:1693"><span v-for="r in runs">{{ r.text }}</span></div></template>\n' +
      '<script setup>\nconst runs = [{ text: "产品描述" }]\n</script>';
    const fB =
      '<template><div data-section-id="36:1708"><span>{{ desc.text }}</span></div></template>\n' +
      '<script setup>\nconst desc = { text: "产品描述" }\n</script>';
    const r = runAcceptanceChecks({
      files: { 'package/components/A.vue': fA, 'package/components/B.vue': fB },
      figmaNodeData: figTabs2,
    });
    expect(r.fails.filter((f) => f.code === 'C1-DUP')).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 🔴 G-SLOT（2026-11-12 · mc-max-1794421297344-f3543604 实锤）：T4 剥离标题
//   依赖外壳 #title-left 渲染，但 LLM 是否挂载 title-left 是随机的 ⇒ 标题丢失。
// ═══════════════════════════════════════════════════════════════════
describe('G-SLOT 外壳 slot 装配契约（f3543604 标题丢失实锤）', () => {
  const fig = {
    document: {
      id: '0:0',
      children: [{ id: 't1', type: 'TEXT', characters: '重点车辆监测' }],
    },
  };
  const stripped =
    '<template><div data-section-id="2:7959">' +
    '<!-- 🎯 面板标题由 base-panel 外壳渲染，标题元素已程序化移除 -->' +
    '</div></template>';

  it('① f3543604 形态：剥离留痕在场 + index.vue 无 #title-left ⇒ G-SLOT FAIL 附配方', () => {
    const files = {
      'package/index.vue':
        '<template><base-panel panelKey="default-panel"><div class="x">内容</div></base-panel></template>',
      'package/components/ContentMonitor.vue': stripped,
    };
    const r = runAcceptanceChecks({ files, figmaNodeData: fig });
    const g = r.fails.find((f) => f.code === 'G-SLOT');
    expect(g).toBeTruthy();
    expect(g.files).toEqual(['package/index.vue']);
    // guidance 配方可照抄（title-left 挂载形态）
    const guidance = formatAcceptanceGuidance([g]);
    expect(guidance).toContain('#title-left');
    expect(guidance).toContain('G-SLOT 外壳标题装配配方');
  });

  it('② 阴性a：无剥离留痕（T4 未触发）⇒ 不判', () => {
    const files = {
      'package/index.vue':
        '<template><base-panel panelKey="default-panel"><div class="x">内容</div></base-panel></template>',
      'package/components/ContentMonitor.vue': '<template><div data-section-id="2:7959"><span>重点车辆监测</span></div></template>',
    };
    const r = runAcceptanceChecks({ files, figmaNodeData: fig });
    expect(r.fails.filter((f) => f.code === 'G-SLOT')).toHaveLength(0);
  });

  it('③ 阴性b：剥离留痕在场 + index.vue 已挂 #title-left（含内容）⇒ 不判（f6a0da7b 形态）', () => {
    const files = {
      'package/index.vue':
        '<template><base-panel panelKey="default-panel">' +
        '<template #title-left><HeaderSection /></template>' +
        '<div class="x">内容</div></base-panel></template>',
      'package/components/ContentMonitor.vue': stripped,
    };
    const r = runAcceptanceChecks({ files, figmaNodeData: fig });
    expect(r.fails.filter((f) => f.code === 'G-SLOT')).toHaveLength(0);
  });
});

describe('P0-2 E5 style 空声明（2026-11-11 降级 FAIL→WARN：痕迹标记不拦交付）', () => {
  it('① 阳性：style 块内孤立 ; ⇒ E5 WARN 附文件名', () => {
    const files = {
      'package/components/ContentSection2.vue':
        '<template><div class="x">a</div></template>\n<style>\n.x {\n  color: red;\n  ;\n}\n</style>',
    };
    const r = runAcceptanceChecks({ files });
    const e5 = r.warns.find((w) => w.includes('E5'));
    expect(e5).toBeTruthy();
    expect(e5).toContain('ContentSection2.vue');
    expect(e5).toContain('空声明');
  });

  it('② 阴性：正常 style（无空声明）⇒ 无 E5 WARN', () => {
    const files = {
      'package/components/Ok.vue':
        '<template><div class="y">a</div></template>\n<style>\n.y { color: blue; }\n</style>',
    };
    const r = runAcceptanceChecks({ files });
    expect(r.warns.filter((w) => w.includes('E5'))).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 🔴 E3-v4 v3→v5（2026-11-11/12 · bd907abf/0a501b7e/830ae7bd 三连拒 → 55a17681 横幅）：
//   ①退化真值（figmaBox 宽/高≤0）弃权 ②祖先段挂载 v3 曾降级 WARN、v5 依用户裁决
//   「只允许挂父级」反转为 FAIL ③无关段/零消费仍 FAIL
describe('E3-v4 v5 退化真值豁免与祖先挂载反转', () => {
  const mkFiles = (consumeId: string) => ({
    'package/index.vue':
      '<template><div data-section-id="0:1" :style="{ backgroundImage: \'url(\' + bgx + \')\' }"><span>x</span></div></template>\n' +
      "<script setup>\nimport bgx from '../../resources/images/bg-test.png'\n</script>",
  });
  const mkMapping = (ancestorIds: string[], box: any) => [
    {
      previewAnalysisRole: 'bg',
      downloadStatus: 'success',
      resourceFile: 'resources/images/bg-test.png',
      targetDomSelector: 'data-section-id="0:2"',
      ancestorIds,
      figmaBox: box,
    },
  ];

  it('① v5 反转：祖先段挂载（wantId 卡片级、bg 挂祖先段容器 0:1=ancestorIds[1]）⇒ FAIL（v3 WARN 放行删除；55a17681 横幅实锤同形态）', () => {
    const r = runAcceptanceChecks({
      files: mkFiles('0:1'),
      resourceDomMapping: mkMapping(['0:0', '0:1'], { width: 141, height: 74 }),
    });
    const e34 = r.fails.filter((f) => f.code === 'E3-v4');
    expect(e34).toHaveLength(1);
    expect(e34[0].hardConstraints?.[0]?.mountedOn).toBe('0:1');
  });

  it('② 退化真值（figmaBox 高度 0）⇒ 弃权 WARN，不进 FAIL', () => {
    const r = runAcceptanceChecks({
      files: mkFiles('0:1'),
      resourceDomMapping: mkMapping(['0:0', '0:1'], { width: 390, height: 0 }),
    });
    expect(r.fails.filter((f) => f.code === 'E3-v4')).toHaveLength(0);
    expect(r.warns.some((w) => w.includes('退化真值弃权'))).toBe(true);
  });

  it('③ 阴性：挂到无关段（非祖先）⇒ 仍 FAIL（真错挂形态保留拦截）', () => {
    const files = {
      'package/index.vue':
        '<template><div data-section-id="0:9" :style="{ backgroundImage: \'url(\' + bgx + \')\' }"><span>y</span></div></template>\n' +
        "<script setup>\nimport bgx from '../../resources/images/bg-test.png'\n</script>",
    };
    const r = runAcceptanceChecks({
      files,
      resourceDomMapping: mkMapping(['0:0'], { width: 141, height: 74 }),
    });
    expect(r.fails.filter((f) => f.code === 'E3-v4')).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 🔴 E3-v4 v4（2026-11-11 · mc-max-1794407888630-408d924a 实锤）：
//   数据驱动消费（FG_CARD_BGS 常量 + 模板引用）是**独立合规形态**，与 wantId 是否为
//   产物段级容器无关——折叠接管把兄弟卡背景组轮换注入 v-for item 时，wantId 恰是
//   已建段级容器（锚卡 id 136:127），但 var 只经常量间接消费。真错形态仍 FAIL。
describe('E3-v4 v4 数据驱动消费为独立合规形态', () => {
  const mappingCard = [
    {
      figmaNodeId: '136:124',
      previewAnalysisRole: 'bg',
      downloadStatus: 'success',
      resourceFile: '../resources/images/bg-124.png',
      ownerSectionId: '136:128',
      ancestorIds: ['136:128', '2:8023', '136:121', '2:7952'],
      targetDomSelector: '[data-section-id="136:128"]',
      figmaBox: { x: 166, y: 984, width: 120, height: 74 },
    },
  ];
  const ROTATED_FILES =
    '<template><div data-section-id="136:127">' +
    // 🔒 v4 判别点：wantId 136:128 是产物**已建段级容器**（v2 下本例 FAIL，v4 数据驱动放行）
    '<div data-section-id="136:128"><span>锚卡容器已建但无字面 bg 引用</span></div>' +
    '<div class="card" v-for="(item, i) in cards">{{ FG_CARD_BGS[i % FG_CARD_BGS.length] }}</div>' +
    '</div></template>\n' +
    "<script setup>\nimport bg2 from '../../resources/images/bg-124.png'\n" +
    'const FG_CARD_BGS = [bg2]\nconst cards = [1, 2, 3]\n</script>';

  it('① 408d924a 形态：wantId=已建段级容器且 var 数据驱动消费 ⇒ WARN 放行（v2 下本例 FAIL）', () => {
    const r = runAcceptanceChecks({ files: { 'package/index.vue': ROTATED_FILES }, resourceDomMapping: mappingCard });
    expect(r.fails.filter((f) => f.code === 'E3-v4')).toHaveLength(0);
    expect(r.warns.some((w) => w.includes('卡片级 owner 放行'))).toBe(true);
  });

  it('② 真错不变：import 后全产物零消费 ⇒ 仍 FAIL', () => {
    const files =
      '<template><div data-section-id="136:127"><span>无任何 bg 引用</span></div></template>\n' +
      "<script setup>\nimport bg2 from '../../resources/images/bg-124.png'\n</script>";
    const r = runAcceptanceChecks({ files: { 'package/index.vue': files }, resourceDomMapping: mappingCard });
    expect(r.fails.filter((f) => f.code === 'E3-v4')).toHaveLength(1);
  });

  it('③ 真错不变：字面挂无关段（无数据驱动）⇒ 仍 FAIL', () => {
    const files =
      '<template><div data-section-id="88:33" :style="{ backgroundImage: \'url(\' + bg2 + \')\' }"></div></template>\n' +
      "<script setup>\nimport bg2 from '../../resources/images/bg-124.png'\n</script>";
    const r = runAcceptanceChecks({ files: { 'package/index.vue': files }, resourceDomMapping: mappingCard });
    expect(r.fails.filter((f) => f.code === 'E3-v4')).toHaveLength(1);
  });

  it('④ v6 顺序修正回归钉（根治④反转）：var 数据驱动消费、但字面同时出现在祖先段 136:121 开标签 ⇒ 一处合规不洗白另一处错挂，仍 FAIL（v4/v5 时代本例放行）', () => {
    const files =
      '<template><div data-section-id="136:121" :style="{ backgroundImage: \'url(\' + bg2 + \')\' }">' +
      '<div data-section-id="136:128"><span>锚卡容器</span></div>' +
      '<div class="card" v-for="(item, i) in cards">{{ FG_CARD_BGS[i % FG_CARD_BGS.length] }}</div>' +
      '</div></template>\n' +
      "<script setup>\nimport bg2 from '../../resources/images/bg-124.png'\n" +
      'const FG_CARD_BGS = [bg2]\nconst cards = [1, 2, 3]\n</script>';
    const r = runAcceptanceChecks({ files: { 'package/index.vue': files }, resourceDomMapping: mappingCard });
    // v6 语义：字面挂载点（136:121 祖先段根，ancestorIds[1+]）不被数据驱动消费洗白 ⇒ FAIL
    expect(r.fails.filter((f) => f.code === 'E3-v4')).toHaveLength(1);
    expect(r.warns.some((w) => w.includes('远祖挂载判 FAIL'))).toBe(true);
  });
});

/**
 * G1-v2 carrier 三级解析（2026-11-11 深夜 · mc-max-1794410168821-0f6cb791 实锤）
 * tab 并入祖先段生成（2:3566→83:30 slot-流量预测 ⇒ ContentForecast 接线完整），
 * 旧解析按「第一个含段首文本的文件」随机命中数据列表/图例 ⇒ 误杀四轮全灭。
 */
describe('G1-v2 carrier 三级解析（0f6cb791 形态）', () => {
  const tabFigma = {
    document: {
      id: '0:0',
      name: 'cp-流量监测',
      type: 'FRAME',
      children: [
        {
          id: '2:9778',
          name: 'cp-流量监测',
          type: 'FRAME',
          children: [
            {
              id: '83:30',
              name: 'slot-流量预测',
              type: 'FRAME',
              children: [
                {
                  id: '2:3565',
                  name: 'sub-header',
                  type: 'GROUP',
                  children: [
                    {
                      id: '2:3566',
                      name: '@antd/tab',
                      type: 'FRAME',
                      children: [
                        { id: 'tt1', type: 'TEXT', characters: '江阴靖江长江隧道' },
                        { id: 'tt2', type: 'TEXT', characters: '江阴大桥' },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  };

  it('① 阳性（0f6cb791 实锤）：语义祖先段文件接线完整、文本候选无绑定 ⇒ 不误杀', () => {
    const files = {
      // 数据列表：含 tab 文本但无绑定（旧解析首轮误判 carrier）
      'package/components/DataList.vue':
        '<template><div>江阴靖江长江隧道 34,620 / 江阴大桥 82,379</div></template>',
      // 语义 carrier：祖先段 83:30 锚 + 完整 tab 接线
      'package/components/Forecast.vue':
        '<template><div data-section-id="83:30"><div :class="[currentTab===t.value?\'on\':\'\']" @click="handleTabChange(t.value)" v-for="t in tabs">{{t.label}}</div></div></template>\n' +
        "<script setup>\nimport { ref } from 'vue'\nconst currentTab = ref('tunnel')\nconst handleTabChange = (v) => { currentTab.value = v }\n</script>",
      // 图例文件：含文本无绑定
      'package/components/VehicleDist.vue': '<template><div>江阴靖江长江隧道分布</div></template>',
    };
    const r = runAcceptanceChecks({ files, figmaNodeData: tabFigma });
    expect(r.fails.filter((f) => f.code === 'G1-v2')).toHaveLength(0);
  });

  it('② 真错不变：全部候选（含语义祖先段）均无绑定 ⇒ FAIL 且 file=首个候选', () => {
    const files = {
      'package/components/DataList.vue': '<template><div>江阴靖江长江隧道</div></template>',
      'package/components/Forecast.vue':
        '<template><div data-section-id="83:30"><span>江阴靖江长江隧道 静态标题</span></div></template>',
    };
    const r = runAcceptanceChecks({ files, figmaNodeData: tabFigma });
    const g1 = r.fails.filter((f) => f.code === 'G1-v2');
    expect(g1).toHaveLength(1);
    // file 按级1>级2>级3 取首个：级2 祖先段锚（Forecast.vue）优先于级3 文本命中
    expect(g1[0].file).toBe('package/components/Forecast.vue');
    expect(g1[0].detail).toContain('均无切换绑定');
  });

  it('③ 真错不变：tab 文本不在任何文件（无承载）⇒ FAIL', () => {
    const files = {
      'package/components/Other.vue': '<template><div>别的内容</div></template>',
    };
    const r = runAcceptanceChecks({ files, figmaNodeData: tabFigma });
    const g1 = r.fails.filter((f) => f.code === 'G1-v2');
    expect(g1).toHaveLength(1);
    expect(g1[0].detail).toContain('无承载');
  });
});
