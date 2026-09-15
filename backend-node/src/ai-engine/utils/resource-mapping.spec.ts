import { injectResourceImports, extractResourceVarNames } from './resource-import-guard.js';
import { formatResourceMapping, filterPanelResources, isPanelResource, matchResourceMapping } from './resource-mapping-formatter.js';

describe('资源变量名单一事实源（assignedVarName）', () => {
  // 模拟 figma-connector._buildResourceDomMapping 固化后的 mapping：
  // 面板级 bg 占用 bg1，业务 bg 是 bg2（编号基于全量 success 资源）
  const mapping = [
    {
      name: 'bg',
      figmaPath: 'cp-flow/bg',
      previewAnalysisRole: 'bg',
      downloadStatus: 'success',
      isPanelResource: true,
      assignedVarName: 'bg1',
      resourceFile: '../resources/images/panel-bg.png',
      hint: 'bg → 面板背景',
      usage: ':style="{ backgroundImage: `url(${bgX})` }"',
    },
    {
      name: 'bg-vehicle',
      previewAnalysisRole: 'bg',
      downloadStatus: 'success',
      isPanelResource: false,
      assignedVarName: 'bg2',
      resourceFile: '../resources/images/vehicle-bg.png',
      hint: 'bg-vehicle → 车型背景',
      usage: ':style="{ backgroundImage: `url(${bgX})` }"',
    },
    {
      name: 'icon-arrow',
      previewAnalysisRole: 'icon',
      downloadStatus: 'success',
      isPanelResource: false,
      assignedVarName: 'icon1',
      resourceFile: '../resources/images/icon-arrow.png',
      hint: 'icon-arrow → 箭头图标',
      usage: '<img :src="iconX">',
    },
  ];

  it('isPanelResource 与 filterPanelResources 口径一致', () => {
    expect(isPanelResource(mapping[0])).toBe(true);
    expect(isPanelResource(mapping[1])).toBe(false);
    const filtered = filterPanelResources(mapping);
    expect(filtered).toHaveLength(2);
    expect(filtered[0].assignedVarName).toBe('bg2');
  });

  it('prompt 侧（filterPanelResources:true）与注入侧指向同一个 bg2', () => {
    // prompt 侧：过滤面板资源后，业务 bg 显示变量名 bg2（编号不因过滤而漂移）
    const promptText = formatResourceMapping(mapping, { filterPanelResources: true, importPrefix: './' });
    expect(promptText).toContain('bg2');
    expect(promptText).toContain('vehicle-bg.png');
    // 面板 bg1 不应出现在 prompt（被过滤）
    expect(promptText).not.toContain('panel-bg.png');

    // 注入侧：模板里写了 bg2，注入的 import 必须指向 vehicle-bg.png（而非 panel-bg.png）
    const code = `<template><div :style="{ backgroundImage: \`url(\${bg2})\` }"></div></template>\n<script setup>\n</script>`;
    const injected = injectResourceImports(code, mapping, './');
    expect(injected).toContain("import bg2 from './vehicle-bg.png'");
    expect(injected).not.toContain('panel-bg.png');
  });

  it('extractResourceVarNames 返回 assignedVarName 集合', () => {
    const names = extractResourceVarNames(mapping);
    expect(names).toContain('bg1');
    expect(names).toContain('bg2');
    expect(names).toContain('icon1');
  });
});

describe('老 mapping 回退兼容（无 assignedVarName）', () => {
  const legacyMapping = [
    {
      name: 'bg-a',
      previewAnalysisRole: 'bg',
      downloadStatus: 'success',
      resourceFile: '../resources/images/a.png',
      hint: 'bg-a',
      usage: ':style="{}"',
    },
    {
      name: 'icon-b',
      previewAnalysisRole: 'icon',
      downloadStatus: 'success',
      resourceFile: '../resources/images/b.png',
      hint: 'icon-b',
      usage: '<img>',
    },
  ];

  it('无 assignedVarName 时回退到按角色顺序编号（bg1/icon1）', () => {
    const code = `<template><div :style="{ backgroundImage: \`url(\${bg1})\` }"><img :src="icon1"></div></template>\n<script setup>\n</script>`;
    const injected = injectResourceImports(code, legacyMapping, './');
    expect(injected).toContain("import bg1 from './a.png'");
    expect(injected).toContain("import icon1 from './b.png'");
  });
});

describe('语义名不作变量名（assignedVarName 纯编号）', () => {
  /**
   * 2026-08-16 事故 mc-max-1786886215651-4b8cccc9 回归：
   * figma-connector 曾用 `semanticVarName || 编号` 固化 assignedVarName，导致语义名
   * bgtabActive 被当作变量名 → prompt 里同时出现语义名与编号两套体系 → 模型手写
   * `const bgtabActive = bg1` 别名映射，与 injectResourceImports 注入的
   * `import bgtabActive` 重复声明 → Vue SFC 编译错误拒绝写盘。
   * 修复：assignedVarName 恒为编号，semanticVarName 仅作描述用途。
   */
  const semanticMapping = [
    {
      name: 'bg-tab-active',
      previewAnalysisRole: 'bg',
      downloadStatus: 'success',
      isPanelResource: false,
      assignedVarName: 'bg3', // 修复后：编号，而非语义名
      semanticVarName: 'bgtabActive', // 语义名仅描述用途
      resourceFile: '../resources/images/bg-tab-active.png',
      hint: 'bg-tab-active → tab-active区域',
      usage: ':style="{ backgroundImage: `url(${bgX})` }"',
    },
  ];

  it('formatter 用编号变量名，不用语义名', () => {
    const text = formatResourceMapping(semanticMapping, { filterPanelResources: false, importPrefix: './' });
    expect(text).toContain('bg3');
    expect(text).not.toContain('bgtabActive');
  });

  it('injectResourceImports 注入 import bg3，不注入语义名 import', () => {
    const code = `<template><div :style="{ backgroundImage: \`url(\${bg3})\` }"></div></template>\n<script setup>\n</script>`;
    const injected = injectResourceImports(code, semanticMapping, './');
    expect(injected).toContain("import bg3 from './bg-tab-active.png'");
    expect(injected).not.toContain('bgtabActive');
  });
});

/**
 * matchResourceMapping 匹配精度（2026-09-01 事故 5 衍生 · mc-max-1788239096135-c19dfe56）
 *
 * 实锤：visual-parser.extractFigmaHints 原用
 *   `m.figmaNodeId === nodeId || (name && (m.hint?.includes(name) || m.targetDomSelector?.includes(name)))`
 * 且 `find()` 按数组顺序取首个命中。事故 mapping 里容器 tabs-icon（索引 4，missing）排在
 * 它的两个 icon 子节点（索引 5/6，success，即 icon1/icon2）**之前**，而
 * `"tabs-icon → tabs-icon区域".includes("icon")` 为真 → 子节点先命中容器条目。
 *
 * 后果：下载成功的子图标被标注成「⛔ 下载失败 / 该位置无对应变量，禁止引用任何变量名」
 * → LLM 不敢用 icon1/icon2 → 资源漏用（RESOURCE-001）。
 * 即 W4 新增的「禁止引用变量名」文案被错误地盖到了真正有变量的节点上，反而放大危害。
 */
describe('matchResourceMapping 结构树节点→资源条目匹配精度', () => {
  // 与事故 mapping 同构（顺序即事故实际顺序：容器在前、子节点在后）
  const mapping: any[] = [
    { name: 'bg', figmaNodeId: '2:7880', downloadStatus: 'missing', hint: 'bg → bg区域' },
    { name: 'bg', figmaNodeId: '2:7890', downloadStatus: 'success', assignedVarName: 'bg1', hint: 'bg → bg区域' },
    { name: 'bg-tab-active', figmaNodeId: '2:7891', downloadStatus: 'success', assignedVarName: 'bg2', hint: 'bg-tab-active → tab-active区域' },
    { name: 'tabs-icon', figmaNodeId: '89:43', downloadStatus: 'missing', hint: 'tabs-icon → tabs-icon区域', targetDomSelector: '.tabs-icon-container' },
    { name: 'icon', figmaNodeId: '2:7941', downloadStatus: 'success', assignedVarName: 'icon1', hint: 'icon → icon区域' },
    { name: 'icon', figmaNodeId: '2:7945', downloadStatus: 'success', assignedVarName: 'icon2', hint: 'icon → icon区域' },
  ];

  it('核心：名为 icon 的子节点 → 命中自身 success 条目，不得被容器 tabs-icon 抢走', () => {
    const hit = matchResourceMapping({ id: '2:7941', name: 'icon' }, mapping);
    expect(hit?.figmaNodeId).toBe('2:7941');
    expect(hit?.downloadStatus).toBe('success');
    expect(hit?.assignedVarName).toBe('icon1');
  });

  it('第二个同名子节点也各自命中（不串到 icon1）', () => {
    const hit = matchResourceMapping({ id: '2:7945', name: 'icon' }, mapping);
    expect(hit?.assignedVarName).toBe('icon2');
  });

  it('负面对照：容器 tabs-icon 自身仍命中 missing 条目（不得过度修正）', () => {
    const hit = matchResourceMapping({ id: '89:43', name: 'tabs-icon' }, mapping);
    expect(hit?.figmaNodeId).toBe('89:43');
    expect(hit?.downloadStatus).toBe('missing');
  });

  it('id 缺失时按节点名精确匹配兜底（不得用 includes 子串）', () => {
    // 无 id，名为 bg-tab-active → 应命中同名条目，而不是首个 hint 含 'bg' 的条目
    const hit = matchResourceMapping({ name: 'bg-tab-active' }, mapping);
    expect(hit?.figmaNodeId).toBe('2:7891');
  });

  it('子串不得误命中：节点名 icon 且 id 不在 mapping 中时，也不得落到 tabs-icon', () => {
    const hit = matchResourceMapping({ id: '9:9999', name: 'icon' }, mapping);
    expect(hit?.name).toBe('icon');
    expect(hit?.figmaNodeId).not.toBe('89:43');
  });

  it('负面对照：无匹配 → 返回 null（保持原语义，调用方据此不加标注）', () => {
    expect(matchResourceMapping({ id: '0:0', name: 'unknown-node' }, mapping)).toBeNull();
  });

  it('负面对照：mapping 为空 / 节点为空 → 返回 null', () => {
    expect(matchResourceMapping({ id: '1:1', name: 'bg' }, [])).toBeNull();
    expect(matchResourceMapping(null, mapping)).toBeNull();
  });
});

/**
 * 家族病 C 类（覆盖丢失）+ D 类（视觉臆造）回归测试（2026-09-01）。
 *
 * 事故实证 mc-max-1788239096135-c19dfe56（cp-环境监测）：
 * - C 类：bg1（bg-7890.png，bgRole='container' 区域背景）在 prompt 里只给了「挂载目标」，
 *   而「禁止用 CSS 渐变替代图片」铁律**只在 sub-state 分支输出**（formatter:212）→
 *   区域背景分支漏了 → LLM 用 linear-gradient 替代 bg1，胶囊形两端圆弧丢失。
 * - D 类：icon 分区（formatter:294-298）**没有** bg 分区（:221）那条
 *   「CSS禁止：border/border-radius/background」→ LLM 给包 icon1/icon2 的容器臆造
 *   border: 1px solid #a1ceff（icon PNG 自带底色 → 双重边框）。
 *
 * 修法：禁渐变铁律从 sub-state 分支提升为所有非 skipMount 的 bg 通用；
 *       icon 分区补 CSS 禁止约束（与 bg 分区 :221 同款口径）。
 */
describe('家族病 C/D 类：背景禁渐变替代 + 图标禁臆造边框', () => {
  // 事故实况：bg-7890.png 是 tabs-list 整条背景（胶囊形），bgRole='container'
  const bgContainer = {
    name: 'bg',
    figmaPath: 'cp-环境监测/tabs-list/bg',
    previewAnalysisRole: 'bg',
    downloadStatus: 'success',
    assignedVarName: 'bg1',
    resourceFile: '../resources/images/bg-7890.png',
    hint: 'bg → bg区域',
    usage: ':style="{ backgroundImage: `url(${bgX})` }"',
    mountTarget: '.c-env-monitor-tabs-list',
    bgRole: 'container', // ← 旧链路因此拿不到禁渐变铁律
    recommendedUsage: 'backgroundBlock',
  };

  const iconItem = {
    name: 'icon',
    previewAnalysisRole: 'icon',
    downloadStatus: 'success',
    assignedVarName: 'icon1',
    resourceFile: '../resources/images/icon-7941.png',
    hint: 'icon → icon区域',
    usage: '<img :src="iconX">',
    recommendedUsage: 'imgSrc',
  };

  it('C 类：区域背景（bgRole=container）也必须带「禁止 CSS 渐变替代」铁律', () => {
    const text = formatResourceMapping([bgContainer], { importPrefix: './' });
    expect(text).toContain('禁止用 CSS linear-gradient 渐变');
  });

  it('D 类：icon 资源必须带「禁止给容器加 border」约束', () => {
    const text = formatResourceMapping([iconItem], { importPrefix: './' });
    expect(text).toMatch(/border/);
  });

  it('负面对照：面板整体背景（skipMount）不输出禁渐变铁律（它根本不还原）', () => {
    const text = formatResourceMapping([{ ...bgContainer, skipMount: true }], {
      importPrefix: './',
    });
    expect(text).not.toContain('禁止用 CSS linear-gradient 渐变');
  });

  it('回归保护：sub-state 状态背景仍保留原有铁律（防提升时误删）', () => {
    const text = formatResourceMapping(
      [{ ...bgContainer, bgRole: 'sub-state', mountTarget: '.c-env-monitor-tab-item' }],
      { importPrefix: './' },
    );
    expect(text).toContain('禁止用 CSS linear-gradient 渐变');
  });

  /**
   * 家族病 C 类**复发**（2026-09-15 · mc-max-1789452271404-7e0e19d2 实锤）：
   *
   * 上一轮只加了「禁止用 CSS 渐变替代」铁律，却仍在同一条目里把该 bg 的
   * `visualMeta.fillsSummary`（= `linear-gradient(#b5deff 0%, #d1ecff 100%)`，即 bg-7890.png
   * 那张胶囊底图本身的填充）以「样式:」吐给模型 → **一边禁止一边递刀**，模型照抄成
   * `.c-env-monitor-tab-item`（错误元素）的 CSS 背景，且 CSS 版不透明 → 盖住了本该显示的图片。
   *
   * 修法：**可用（已下载）资源不再输出 fillsSummary**（同一视觉只允许一条落地路径 = 图片本身）；
   * 该值仅在「资源缺失」分支作为兜底参考出现，并显式标注使用范围。
   */
  describe('复发回归：可用资源的 fillsSummary 不得进入 prompt', () => {
    const bgWithFills = {
      ...bgContainer,
      visualMeta: {
        width: 295,
        height: 27,
        fillsSummary: 'linear-gradient(#b5deff 0%, #d1ecff 100%)',
      },
    };

    it('compact：success 的 bg 不输出「样式:」，且不得出现该填充色值', () => {
      const text = formatResourceMapping([bgWithFills], { compact: true });
      expect(text).not.toContain('样式:');
      // ⚠️ 不能断言 not.toContain('linear-gradient')：铁律文案本身含该字样（compact 版写的是
      //    「禁止用 CSS gradient/color 替代」，非 compact 版写的是「禁止用 CSS linear-gradient 渐变替代」）。
      //    真正的不变量是「**填充色值**不得进入 prompt」。
      expect(text).not.toContain('#b5deff');
      expect(text).not.toContain('#d1ecff');
      // 图片铁律仍在（不是删规则，是不再递刀）
      expect(text).toContain('禁止用 CSS gradient/color 替代');
      // 图本身与挂载信息必须还在
      expect(text).toContain('bg-7890.png');
      expect(text).toContain('bg1');
    });

    it('非 compact：同上（两处必须同口径，防只改一处）', () => {
      const text = formatResourceMapping([bgWithFills], { importPrefix: './' });
      expect(text).not.toContain('样式：');
      expect(text).not.toContain('#b5deff');
      expect(text).not.toContain('#d1ecff');
      expect(text).toContain('禁止用 CSS linear-gradient 渐变');
    });

    it('尺寸/效果不是「另一种视觉表达」→ 仍保留', () => {
      const text = formatResourceMapping(
        [{ ...bgWithFills, visualMeta: { ...bgWithFills.visualMeta, effectsSummary: 'box-shadow: 0 1px 2px #000' } }],
        { importPrefix: './' },
      )
      expect(text).toContain('295×27px')
      expect(text).toContain('box-shadow')
    })

    it('负面对照：资源缺失（failed）时仍给填充参考，但标注「仅本资源缺失时使用」', () => {
      const text = formatResourceMapping(
        [{ ...bgWithFills, downloadStatus: 'missing', resourceFile: null }],
        { compact: true },
      )
      expect(text).toContain('兜底填充参考')
      expect(text).toContain('仅本资源缺失时使用')
      expect(text).toContain('linear-gradient')
    })
  })
});
