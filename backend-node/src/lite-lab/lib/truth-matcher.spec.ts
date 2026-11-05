import {
  aiAnchorBackgroundAssets,
  backfillContainerFill,
  backfillSfcFiles,
  backfillScriptOptionTruth,
  bgFileNameCore,
  buildImageRefIndex,
  clearRootContentBackground,
  findNodeById,
  buildNodeTextContext,
  collectAncestorTexts,
  collectFigmaTruth,
  findNodeIdBySuffix,
  mountAssetIcons,
  normalizeAnchorText,
  relocatePanelTitle,
} from './truth-matcher';

describe('truth-matcher（lite-lab 真值回填判据）', () => {
  const figmaNode = (over: Record<string, any> = {}) => ({
    id: '1:2',
    type: 'TEXT',
    characters: '设备在线',
    style: { fontSize: 14 },
    fills: [{ type: 'SOLID', color: { r: 0, g: 0.5, b: 1 }, opacity: 1 }],
    absoluteBoundingBox: { x: 0, y: 0, width: 60, height: 20 },
    ...over,
  });

  it('阳性：exact 命中并回填 font-size + color（默认开启、尺寸默认关）', () => {
    const truth = collectFigmaTruth(figmaNode());
    const r = backfillSfcFiles(
      [{ path: 'package/index.vue', content: '<template><span class="t">设备在线</span></template>' }],
      truth,
    );
    expect(r.stats.evaluated).toBe(1);
    expect(r.stats.exact).toBe(1);
    expect(r.stats.fontSizeApplied).toBe(1);
    expect(r.stats.colorApplied).toBe(1);
    expect(r.stats.sizeApplied).toBe(0);
    expect(r.files[0].changed).toBe(true);
    expect(r.files[0].edits[0].beforeStyle).toBeNull();
    expect(r.files[0].edits[0].applied['font-size']).toBe('14px');
    expect(r.files[0].edits[0].applied['color']).toBe('#0080ff');
    expect(r.files[0].edits[0].applied['width']).toBeUndefined();
  });

  it('阳性：applySizes 开启时回填宽高；已存在 style 时合并且不覆盖已有属性', () => {
    const truth = collectFigmaTruth(figmaNode());
    const r = backfillSfcFiles(
      [{
        path: 'a.vue',
        content: '<template><span style="font-weight:500;color:#ff0000">设备在线</span></template>',
      }],
      truth,
      { applySizes: true },
    );
    expect(r.files[0].edits[0].beforeStyle).toBe('font-weight:500;color:#ff0000');
    expect(r.files[0].edits[0].applied['color']).toBeUndefined(); // 已有 color 不覆盖
    expect(r.files[0].edits[0].applied['width']).toBe('60px');
    expect(r.files[0].edits[0].applied['height']).toBe('20px');
  });

  it('阳性：子串回退（figma「51」命中产物「51次」）', () => {
    const truth = collectFigmaTruth(figmaNode({ characters: '51', id: '9:9' }));
    const r = backfillSfcFiles(
      [{ path: 'a.vue', content: '<template><b>51次</b></template>' }],
      truth,
    );
    expect(r.stats.substr).toBe(1);
    expect(r.files[0].edits[0].matchType).toBe('substr');
  });

  it('阴性：插值文本跳过（interpSkipped），短文本跳过，miss 不改内容', () => {
    const truth = collectFigmaTruth({
      id: 'r',
      type: 'FRAME',
      children: [
        figmaNode({ characters: '设备状态', id: 'i1' }),
        figmaNode({ characters: '0', id: 'i2' }),
        figmaNode({ characters: '不存在文本', id: 'i3' }),
      ],
    });
    const src = '<template><span>{{ x }}</span><i>0</i><p>别的</p></template>';
    const r = backfillSfcFiles([{ path: 'a.vue', content: src }], truth);
    expect(r.stats.evaluated).toBe(3);
    // 产物唯一插值元素被元素级跳过；其 figma 文本「设备状态」匹配不到任何静态文本 ⇒ miss
    expect(r.stats.interpSkipped).toBe(1);
    expect(r.stats.shortSkipped).toBe(1);
    expect(r.stats.miss).toBe(2);
    expect(r.stats.exact).toBe(0);
    expect(r.files[0].changed).toBe(false);
  });

  it('阴性：0 输入也要有完整 stats（0 也打）', () => {
    const r = backfillSfcFiles(
      [{ path: 'a.vue', content: '<template><p>x</p></template>' }],
      { texts: [], assets: [], containerCount: 0 },
    );
    expect(r.stats.evaluated).toBe(0);
    expect(r.stats.miss).toBe(0);
    expect(r.files[0].changed).toBe(false);
  });

  it('位移安全：同一文件多处命中，重放后所有 edit 全部生效', () => {
    const truth = collectFigmaTruth({
      id: 'r',
      type: 'FRAME',
      children: [
        figmaNode({ characters: '甲文本', id: 'a', style: { fontSize: 12 } }),
        figmaNode({ characters: '乙文本特别长', id: 'b', style: { fontSize: 20 } }),
      ],
    });
    const src = '<template><p>甲文本</p><section><em>乙文本特别长</em></section></template>';
    const r = backfillSfcFiles([{ path: 'a.vue', content: src }], truth);
    expect(r.stats.exact).toBe(2);
    // 函数内部从后往前重放，直接断言最终内容（applyColor 默认开 ⇒ color 一并回填）
    expect(r.files[0].content).toContain(
      '<p style="font-size:12px;color:#0080ff">甲文本</p>',
    );
    expect(r.files[0].content).toContain(
      '<em style="font-size:20px;color:#0080ff">乙文本特别长</em>',
    );
    expect(normalizeAnchorText(' 甲 文本 ')).toBe('甲文本');
  });

  it('图片节点进 assets 清单，TEXT 不进容器计数', () => {
    const t = collectFigmaTruth({
      id: 'r',
      type: 'FRAME',
      children: [
        figmaNode(),
        { id: 'img:1', type: 'RECTANGLE', name: 'bg-card', fills: [{ type: 'IMAGE', imageRef: 'abc', visible: true }], absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 80 } },
      ],
    });
    expect(t.texts).toHaveLength(1);
    expect(t.assets).toHaveLength(1);
    expect(t.assets[0].imageRef).toBe('abc');
    expect(t.assets[0].width).toBe(100);
  });
});

describe('template 限定与资源挂载（真机回归）', () => {
  const figmaNode = (over: Record<string, any> = {}) => ({
    id: '1:2',
    type: 'TEXT',
    characters: '51',
    style: { fontSize: 14 },
    fills: [{ type: 'SOLID', color: { r: 0, g: 0.5, b: 1 }, opacity: 1 }],
    absoluteBoundingBox: { x: 0, y: 0, width: 60, height: 20 },
    ...over,
  });

  it('🔴 回归阴性：script 内代码行不得被匹配（mc-lab-1793861715204 实锤 style 注到 <script> 上）', () => {
    const truth = collectFigmaTruth(figmaNode({ characters: 'const width = 60' }));
    const src = '<template><p>别的</p></template>\n<script setup>\nconst width = 60\n</script>';
    const r = backfillSfcFiles([{ path: 'a.vue', content: src }], truth);
    expect(r.stats.exact).toBe(0);
    expect(r.files[0].changed).toBe(false);
    expect(r.files[0].content).not.toContain('<script setup style=');
  });

  it('template 外的文本一律不参与匹配（style 块同理）', () => {
    const truth = collectFigmaTruth(figmaNode({ characters: '设备在线', id: '9:1' }));
    const src = '<style>.a::after { content: "设备在线" }</style>\n<template><p>别的</p></template>';
    const r = backfillSfcFiles([{ path: 'a.vue', content: src }], truth);
    expect(r.stats.exact).toBe(0);
    expect(r.files[0].changed).toBe(false);
  });

  it('资源挂载阳性：兄弟文本锚点命中 → <img> 插入 + import 注入 + imageRef 去重', () => {
    const assets = [
      { nodeId: '2:8060', name: 'bus icon A', imageRef: 'refA', fileName: 'icon-a.png', width: 48, height: 48, siblingTexts: ['客车'] },
      { nodeId: '2:8062', name: 'bus icon B', imageRef: 'refA', fileName: 'icon-a.png', width: 48, height: 48, siblingTexts: ['客车'] },
      { nodeId: '2:8049', name: 'icon', imageRef: 'refB', fileName: 'icon-b.png', width: 48, height: 48, siblingTexts: ['监控'] },
    ];
    const src = '<template><section><div><span>客车</span></div><div><span>监控</span></div></section></template>';
    const r = mountAssetIcons([{ path: 'package/index.vue', content: src }], assets as any);
    expect(r.stats.assetsTotal).toBe(3);
    expect(r.stats.uniqueImageRefs).toBe(2);
    expect(r.stats.mounted).toBe(2);
    expect(r.files[0].changed).toBe(true);
    expect(r.files[0].content).toContain('<img class="lab-asset-img" :src="labAsset_2_8060" style="width:48px;height:48px" />');
    expect(r.files[0].content).toContain("import labAsset_2_8060 from '../resources/images/icon-a.png'");
    expect(r.files[0].content).toContain("import labAsset_2_8049 from '../resources/images/icon-b.png'");
    // 插入位置在对应文本元素之前
    const busIdx = r.files[0].content.indexOf('客车');
    expect(r.files[0].content.indexOf('labAsset_2_8060')).toBeLessThan(busIdx);
  });

  it('资源挂载阴性：无兄弟文本 / 文件缺失 / 锚点未命中，如实分档且零改动', () => {
    const assets = [
      { nodeId: '1:1', name: 'a', imageRef: 'r1', fileName: 'a.png', siblingTexts: [] },
      { nodeId: '1:2', name: 'b', imageRef: 'r2', fileName: 'b.png', siblingTexts: ['不存在文本'] },
      { nodeId: '1:3', name: 'c', imageRef: 'r3', siblingTexts: ['别的'] },
    ];
    const src = '<template><p>别的</p></template>';
    const r = mountAssetIcons([{ path: 'package/index.vue', content: src }], assets as any);
    expect(r.stats.noSiblingTexts).toBe(1);
    expect(r.stats.noAnchor).toBe(1);
    expect(r.stats.noFile).toBe(1);
    expect(r.stats.mounted).toBe(0);
    expect(r.files[0].changed).toBe(false);
  });

  it('🔴 回归（mc-lab-1793862674851 实锤）：mount 未改动时必须保留上游（文本回填）changed/edits，否则回填结果被「只写 changed 文件」逻辑整批丢弃', () => {
    const src = '<template><p>别的</p></template>';
    const assets = [
      { nodeId: '1:1', name: 'a', imageRef: 'r1', fileName: 'a.png', siblingTexts: [] },
    ];
    // 上游 backfill 改过该文件（changed=true, edits 非空），mount 自身零改动
    const r = mountAssetIcons(
      [{ path: 'package/index.vue', content: src, changed: true, edits: [{ kind: 'style' }] as any }],
      assets as any,
    );
    expect(r.stats.mounted).toBe(0);
    expect(r.stats.noSiblingTexts).toBe(1);
    expect(r.files[0].changed).toBe(true); // 不得被 mount 的重算覆盖成 false
    expect(r.files[0].edits.length).toBe(1); // edits 透传，报告 editCount 不失真
  });
});

describe('imageRef 索引与 svg 占位替换（mc-lab-1793865328825 真机回归）', () => {
  it('buildImageRefIndex：外层容器映射到子树内层 IMAGE fill 的 imageRef；自身 fill 优先', () => {
    const tree = {
      id: '1:1',
      children: [
        {
          id: '2:8036', // 外层容器（downloadAssets 实际下载的节点）
          children: [
            { id: '2:8037', fills: [{ type: 'IMAGE', visible: true, imageRef: 'refIconA' }] },
          ],
        },
        {
          id: '2:9000', // 自身有 fill 的节点
          fills: [{ type: 'IMAGE', visible: true, imageRef: 'refOwn' }],
          children: [
            { id: '2:9001', fills: [{ type: 'IMAGE', visible: true, imageRef: 'refInner' }] },
          ],
        },
      ],
    };
    const idx = buildImageRefIndex(tree);
    expect(idx.get('2:8036')).toBe('refIconA'); // 容器 → 子树 imageRef
    expect(idx.get('2:8037')).toBe('refIconA');
    expect(idx.get('2:9000')).toBe('refOwn'); // 自身 fill 优先于后代
    expect(idx.get('2:9001')).toBe('refInner');
  });

  it('svg 占位替换（v-for 数据驱动）：按 (y,x) 序把 labIcon 注入 script 数组，svg 替换为 :src="alias.labIcon"', () => {
    const assets = [
      { nodeId: '2:8037', name: 'a', imageRef: 'r1', fileName: 'icon-a.png', x: 10, y: 100, width: 48, height: 48, siblingTexts: [] },
      { nodeId: '2:8060', name: 'b', imageRef: 'r2', fileName: 'icon-b.png', x: 10, y: 50, width: 48, height: 48, siblingTexts: [] },
    ];
    const src = [
      '<template>',
      '  <div class="cards">',
      '    <div v-for="item in stats" :key="item.name" class="card">',
      '      <div class="icon"><svg viewBox="0 0 24 24"><path d="M3 7h11v8H3z" /></svg></div>',
      '      <span>{{ item.name }}</span>',
      '    </div>',
      '  </div>',
      '</template>',
      '<script setup>',
      "import { ref } from 'vue'",
      'const stats = ref([',
      "  { name: '危化品车', value: 51 },",
      "  { name: '超高车辆', value: 19 },",
      '])',
      '</script>',
    ].join('\n');
    const r = mountAssetIcons([{ path: 'package/index.vue', content: src }], assets as any);
    expect(r.stats.noSiblingTexts).toBe(2);
    expect(r.stats.svgReplaced).toBe(1); // 模板里 1 个 svg 块
    expect(r.stats.mounted).toBe(1);
    expect(r.files[0].changed).toBe(true);
    const out = r.files[0].content;
    // svg 被替换为数据驱动 img
    expect(out).toContain(':src="item.labIcon"');
    expect(out).not.toContain('<svg');
    // labIcon 注入顺序 = 资产 (y,x) 升序：y=50 的 2:8060 进第一个对象，y=100 的 2:8037 进第二个
    const firstObj = out.slice(out.indexOf('{ name'), out.indexOf('超高车辆'));
    expect(firstObj).toContain('labIcon: labAsset_2_8060');
    expect(out).toContain('labIcon: labAsset_2_8037');
    // import 注入
    expect(out).toContain("import labAsset_2_8060 from '../resources/images/icon-b.png'");
    expect(out).toContain("import labAsset_2_8037 from '../resources/images/icon-a.png'");
  });

  it('svg 占位替换（静态 1:1）：无 v-for、1 svg + 1 资产 → 直接 :src 变量替换', () => {
    const assets = [
      { nodeId: '2:8049', name: 'icon', imageRef: 'r1', fileName: 'icon-8049.png', x: 0, y: 0, width: 48, height: 48, siblingTexts: [] },
    ];
    const src =
      '<template><div><svg viewBox="0 0 24 24"><path d="M3 7" /></svg><span>今日累计</span></div></template>';
    const r = mountAssetIcons([{ path: 'package/index.vue', content: src }], assets as any);
    expect(r.stats.svgReplaced).toBe(1);
    expect(r.files[0].content).toContain(':src="labAsset_2_8049"');
    expect(r.files[0].content).not.toContain('<svg');
  });

  it('svg 占位替换保守性：资产数 ≠ svg 块数 → svgSkipped 且零改动', () => {
    const assets = [
      { nodeId: '1:1', name: 'a', imageRef: 'r1', fileName: 'a.png', x: 0, y: 0, siblingTexts: [] },
      { nodeId: '1:2', name: 'b', imageRef: 'r2', fileName: 'b.png', x: 0, y: 10, siblingTexts: [] },
    ];
    const src =
      '<template><div><svg viewBox="0 0 24 24"><path d="M3" /></svg></div></template>';
    const r = mountAssetIcons([{ path: 'package/index.vue', content: src }], assets as any);
    expect(r.stats.svgSkipped).toBe(2);
    expect(r.stats.svgReplaced).toBe(0);
    expect(r.files[0].content).toContain('<svg'); // 原样保留
    expect(r.files[0].changed).toBe(false);
  });

  it('🔴 回归（mc-lab-1793868147587 实锤）：data-URI icon 字段形态 → 值替换为 import 标识符，模板零改动', () => {
    const assets = [
      { nodeId: '2:8060', name: 'a', imageRef: 'r1', fileName: 'icon-a.png', x: 10, y: 50, width: 48, height: 48, siblingTexts: [] },
      { nodeId: '2:8037', name: 'b', imageRef: 'r2', fileName: 'icon-b.png', x: 10, y: 100, width: 48, height: 48, siblingTexts: [] },
    ];
    const dataUri = (c: string) =>
      `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg"><rect fill="%23${c}"/></svg>`;
    const src = [
      '<template>',
      '  <div v-for="item in stats" :key="item.name">',
      '    <img :src="item.icon" :alt="item.name" />',
      '  </div>',
      '</template>',
      '<script setup>',
      "import { ref } from 'vue'",
      'const stats = ref([',
      `  { name: '危化品车', icon: '${dataUri('E84A4A')}' },`,
      `  { name: '超高车辆', icon: '${dataUri('F5A623')}' },`,
      '])',
      '</script>',
    ].join('\n');
    const r = mountAssetIcons([{ path: 'package/index.vue', content: src }], assets as any);
    expect(r.stats.dataUriReplaced).toBe(2);
    expect(r.stats.mounted).toBe(2);
    expect(r.stats.svgSkipped).toBe(0);
    expect(r.files[0].changed).toBe(true);
    const out = r.files[0].content;
    // data-URI 值替换为 import 标识符（按 y 序：y=50→2:8060 进第一个对象）
    expect(out).not.toContain('data:image/svg+xml');
    expect(out).toContain("icon: labAsset_2_8060");
    expect(out).toContain("icon: labAsset_2_8037");
    expect(out).toContain("import labAsset_2_8060 from '../resources/images/icon-a.png'");
    // 模板绑定零改动
    expect(out).toContain(':src="item.icon"');
  });

  it('🔴 回归（mc-lab-1793868575285 实锤）：CSS 类占位形态 → icon 字段注入 + 占位 span 替换 <img>', () => {
    const assets = [
      { nodeId: '2:8060', name: 'a', imageRef: 'r1', fileName: 'icon-a.png', x: 10, y: 50, width: 48, height: 48, siblingTexts: [] },
      { nodeId: '2:8037', name: 'b', imageRef: 'r2', fileName: 'icon-b.png', x: 10, y: 100, width: 48, height: 48, siblingTexts: [] },
    ];
    const src = [
      '<template>',
      '  <div v-for="item in stats" :key="item.name">',
      '    <div class="icon-wrap">',
      '      <span class="truck" :class="item.iconClass"></span>',
      '    </div>',
      '    <span>{{ item.name }}</span>',
      '  </div>',
      '</template>',
      '<script setup>',
      "import { ref } from 'vue'",
      'const stats = ref([',
      "  { name: '危化品车', value: 51, iconClass: 'truck--red' },",
      "  { name: '超高车辆', value: 19, iconClass: 'truck--orange' },",
      '])',
      '</script>',
    ].join('\n');
    const r = mountAssetIcons([{ path: 'package/index.vue', content: src }], assets as any);
    expect(r.stats.iconClassReplaced).toBe(2);
    expect(r.stats.mounted).toBe(2);
    expect(r.stats.svgSkipped).toBe(0);
    expect(r.files[0].changed).toBe(true);
    const out = r.files[0].content;
    // 占位 span 替换为 <img :src="item.icon">
    expect(out).toContain(':src="item.icon"');
    expect(out).not.toContain(':class="item.iconClass"');
    // script 注入 icon 字段（按 y 序：y=50→2:8060 进第一个对象）
    expect(out).toContain("iconClass: 'truck--red', icon: labAsset_2_8060");
    expect(out).toContain("iconClass: 'truck--orange', icon: labAsset_2_8037");
    expect(out).toContain("import labAsset_2_8060 from '../resources/images/icon-a.png'");
  });
});

describe('VECTOR 反哺与空 icon 回填（mc-lab-1793869911710/9928144 真机回归）', () => {
  const tree = {
    id: '0:1',
    children: [
      {
        id: '2:7941',
        name: 'icon',
        children: [{ id: '2:7941-inner', type: 'VECTOR' }],
      },
      {
        id: '2:7945',
        name: 'icon',
        children: [{ id: '2:7945-inner', type: 'VECTOR' }],
      },
      {
        id: '2:8001',
        type: 'FRAME',
        children: [
          { id: '2:8002', type: 'VECTOR' },
          { id: '2:8003', type: 'TEXT', characters: '摄像机' },
        ],
      },
      {
        id: '2:8004',
        type: 'FRAME',
        children: [
          { id: '2:8005', type: 'VECTOR' },
          { id: '2:8006', type: 'TEXT', characters: '风速风向仪' },
        ],
      },
    ],
  };

  it('findNodeIdBySuffix：文件名后缀反查节点 id', () => {
    expect(findNodeIdBySuffix(tree, '7941')).toBe('2:7941');
    expect(findNodeIdBySuffix(tree, '9999')).toBeUndefined();
  });

  it('buildNodeTextContext：VECTOR 节点的近邻文本（父层 TEXT，父无取祖父）', () => {
    const ctx = buildNodeTextContext(tree);
    expect(ctx.get('2:8002')).toEqual(['摄像机']);
    expect(ctx.get('2:8005')).toEqual(['风速风向仪']);
  });

  it('空变量回填：ref(\'\') 与裸 const \'\' 两种形态 + icon-* 资产 zip', () => {
    const assets = [
      { nodeId: '2:7941', name: 'icon', fileName: 'icon-7941.png', x: 0, y: 0, width: 24, height: 24, siblingTexts: [] },
      { nodeId: '2:7945', name: 'icon', fileName: 'icon-7945.png', x: 0, y: 10, width: 24, height: 24, siblingTexts: [] },
    ];
    const src = [
      '<template>',
      '  <img class="a" :src="barIcon" />',
      '  <img class="b" :src="listIcon" />',
      '</template>',
      '<script setup>',
      "const barIcon = ref('')",
      "const listIcon = ''",
      '</script>',
    ].join('\n');
    const r = mountAssetIcons([{ path: 'package/index.vue', content: src }], assets as any);
    expect(r.stats.emptyIconVarsReplaced).toBe(2);
    expect(r.files[0].changed).toBe(true);
    const out = r.files[0].content;
    expect(out).toContain("const barIcon = ref(labAsset_2_7941)"); // ref 形态保留
    expect(out).toContain('const listIcon = labAsset_2_7945'); // 裸 const 形态保留
    expect(out).toContain("import labAsset_2_7941 from '../resources/images/icon-7941.png'");
  });

  it('🔴 回归（mc-lab-1793871304346 实锤）：空变量替换不得吞语句间换行（胶合 = SFC 语法错误）', () => {
    const assets = [
      { nodeId: '2:7941', name: 'icon', fileName: 'icon-7941.png', x: 0, y: 0, width: 24, height: 24, siblingTexts: [] },
      { nodeId: '2:7945', name: 'icon', fileName: 'icon-7945.png', x: 0, y: 10, width: 24, height: 24, siblingTexts: [] },
    ];
    const src = [
      '<template>',
      '  <img class="a" :src="iconChart" />',
      '  <img class="b" :src="iconList" />',
      '</template>',
      '<script setup>',
      "const iconChart = ''",
      "const iconList = ''",
      'const chartRef = ref(null)',
      '</script>',
    ].join('\n');
    const r = mountAssetIcons([{ path: 'package/index.vue', content: src }], assets as any);
    expect(r.stats.emptyIconVarsReplaced).toBe(2);
    const out = r.files[0].content;
    // 语句必须各自成行（真机实锤：\s* 吞换行 → labAsset_2_7941const … 胶合）
    expect(out).toContain("const iconChart = labAsset_2_7941\nconst iconList = labAsset_2_7945\nconst chartRef = ref(null)");
    expect(out).not.toContain('labAsset_2_7941const');
  });

  it('空 icon 字段回填：对象 name ↔ 图标近邻文本语义锚定，非 icon 资产不参与', () => {
    const assets = [
      // 15+ 下载图标中只有 2 个有近邻文本锚定（几何 zip 不可行场景）；反哺条目用 nearbyTexts
      { nodeId: '2:8002', name: 'icon', fileName: 'icon-8444.png', x: 0, y: 0, nearbyTexts: ['摄像机'] },
      { nodeId: '2:8005', name: 'icon', fileName: 'icon-8473.png', x: 0, y: 10, nearbyTexts: ['风速风向仪'] },
      { nodeId: '2:8999', name: 'icon', fileName: 'icon-8999.png', x: 0, y: 20, nearbyTexts: [] },
    ];
    const src = [
      '<template>',
      '  <div v-for="item in deviceList" :key="item.name">',
      '    <img :src="item.icon" :alt="item.name" />',
      '  </div>',
      '</template>',
      '<script setup>',
      'const deviceList = [',
      "  { name: '摄像机', current: 2, total: 484, icon: '' },",
      "  { name: '风速风向仪', current: 1, total: 484, icon: '' },",
      "  { name: '烟道机器人', current: 0, total: 484, icon: '' },",
      '])',
      '</script>',
    ].join('\n');
    const r = mountAssetIcons([{ path: 'package/index.vue', content: src }], assets as any);
    expect(r.stats.emptyIconFieldsReplaced).toBe(2); // 第三个无锚定，保守留空
    const out = r.files[0].content;
    expect(out).toContain("icon: labAsset_2_8002"); // 摄像机
    expect(out).toContain("icon: labAsset_2_8005"); // 风速风向仪
    expect(out.match(/icon: ''/g)?.length).toBe(1); // 烟道机器人留空
  });

  it('字段+变量共存（58c3addd 完整场景）：字段语义消费后，变量按 img alt 锚定剩余资产', () => {
    const assets = [
      { nodeId: '2:8801', name: 'icon', fileName: 'icon-8801.png', x: 0, y: 0, nearbyTexts: ['隧道设备'] },
      { nodeId: '2:8802', name: 'icon', fileName: 'icon-8802.png', x: 0, y: 5, nearbyTexts: ['南北接线设备'] },
      { nodeId: '2:8002', name: 'icon', fileName: 'icon-8444.png', x: 0, y: 10, nearbyTexts: ['摄像机'] },
      { nodeId: '2:8005', name: 'icon', fileName: 'icon-8473.png', x: 0, y: 20, nearbyTexts: ['风速风向仪'] },
    ];
    const src = [
      '<template>',
      '  <img class="s1" :src="shieldIcon" alt="隧道设备" />',
      '  <img class="s2" :src="radarIcon" alt="南北接线设备" />',
      '  <div v-for="item in deviceList" :key="item.name">',
      '    <img :src="item.icon" :alt="item.name" />',
      '  </div>',
      '</template>',
      '<script setup>',
      "const shieldIcon = ''",
      "const radarIcon = ''",
      'const deviceList = [',
      "  { name: '摄像机', icon: '' },",
      "  { name: '风速风向仪', icon: '' },",
      '])',
      '</script>',
    ].join('\n');
    const r = mountAssetIcons([{ path: 'package/index.vue', content: src }], assets as any);
    expect(r.stats.emptyIconFieldsReplaced).toBe(2); // 字段先消费语义资产
    expect(r.stats.emptyIconVarsReplaced).toBe(2); // 变量按 alt 锚定剩余
    const out = r.files[0].content;
    expect(out).toContain('const shieldIcon = labAsset_2_8801'); // alt 隧道设备
    expect(out).toContain('const radarIcon = labAsset_2_8802'); // alt 南北接线设备
    expect(out).toContain('icon: labAsset_2_8002'); // 摄像机
    expect(out).toContain('icon: labAsset_2_8005'); // 风速风向仪
  });
});

describe('script 字面量真值回填（③ 立项 / mc-lab-1793871304346 实锤：exact=0 而真值色齐全）', () => {
  const mkTruth = (texts: any[]) => ({ texts, assets: [], containerCount: 0 });

  const OPT_SRC = [
    '<template><div class="c"></div></template>',
    '<script setup>',
    "const xAxisData = ref(['2', '4', '6', '8'])",
    'const buildOption = () => ({',
    '  xAxis: {',
    "    type: 'category',",
    '    data: xAxisData.value,',
    '    axisLabel: { color: \'#E0E0E0\', fontSize: 11 },',
    '  },',
    '  yAxis: {',
    "    type: 'value',",
    '    min: 0,',
    '    max: 40,',
    '    interval: 10,',
    '    axisLabel: { color: \'#E0E0E0\', fontSize: 11 },',
    '    splitLine: { lineStyle: { color: \'rgba(255,255,255,0.12)\', type: \'dashed\' } },',
    '  },',
    '  series: [{',
    '    markLine: {',
    '      lineStyle: { color: \'#FF5A5A\', type: \'dashed\', width: 1 },',
    '      label: { show: true, formatter: \'预警线\', color: \'#FF5A5A\', fontSize: 11 },',
    '    },',
    '  }],',
    '})',
    '</script>',
  ].join('\n');

  it('xAxis 变量数组 + yAxis min/max/interval 派生 + markLine formatter → 全命中才回填（值全派生自真值）', () => {
    const truth = mkTruth([
      { nodeId: '1', characters: '2', color: '#333333', fontSize: 12 },
      { nodeId: '2', characters: '4', color: '#333333', fontSize: 12 },
      { nodeId: '3', characters: '6', color: '#333333', fontSize: 12 },
      { nodeId: '4', characters: '8', color: '#333333', fontSize: 12 },
      { nodeId: '5', characters: '40\n30\n20\n10\n0', color: '#333333', fontSize: 12 },
      { nodeId: '6', characters: '预警线', color: '#d32f2f', fontSize: 12 },
    ]);
    const r = backfillScriptOptionTruth([{ path: 'package/index.vue', content: OPT_SRC }], truth as any);
    expect(r.stats.xAxisBackfilled).toBe(1);
    expect(r.stats.yAxisBackfilled).toBe(1);
    expect(r.stats.markLineBackfilled).toBe(1);
    // color：x/y axisLabel + markLine label + lineStyle 同源 = 4
    expect(r.stats.scriptColorApplied).toBe(4);
    expect(r.stats.scriptFontSizeApplied).toBe(3);
    const out = r.files[0].content;
    expect(out.match(/color: '#333333'/g)?.length).toBe(2);
    expect(out.match(/color: '#d32f2f'/g)?.length).toBe(2); // label + lineStyle 同源
    expect(out.match(/fontSize: 12/g)?.length).toBe(3);
    expect(out).not.toContain('#E0E0E0');
    expect(out).not.toContain('#FF5A5A');
    // splitLine 网格线无真值依据，必须原样保留（禁止臆造）
    expect(out).toContain('rgba(255,255,255,0.12)');
    expect(r.files[0].changed).toBe(true);
  });

  it('🔴 保守放弃：真值未全命中（缺 8 / 缺 y 轴 / 缺预警线）→ 零改动，0 也打', () => {
    const truth = mkTruth([
      { nodeId: '1', characters: '2', color: '#333333', fontSize: 12 },
      { nodeId: '2', characters: '4', color: '#333333', fontSize: 12 },
    ]);
    const r = backfillScriptOptionTruth([{ path: 'package/index.vue', content: OPT_SRC }], truth as any);
    expect(r.stats.xAxisBackfilled).toBe(0);
    expect(r.stats.yAxisBackfilled).toBe(0);
    expect(r.stats.markLineBackfilled).toBe(0);
    expect(r.stats.scriptSkipped).toBe(3);
    expect(r.stats.scriptColorApplied).toBe(0);
    expect(r.files[0].changed).toBe(false);
    expect(r.files[0].content).toBe(OPT_SRC); // 逐字节不变
  });

  it('🔴 保守放弃：轴标签颜色不唯一（激活态双色）→ 不冻色', () => {
    const truth = mkTruth([
      { nodeId: '1', characters: '2', color: '#333333', fontSize: 12 },
      { nodeId: '2', characters: '4', color: '#333333', fontSize: 12 },
      { nodeId: '3', characters: '6', color: '#2c9bea', fontSize: 12 }, // 颜色冲突
      { nodeId: '4', characters: '8', color: '#333333', fontSize: 12 },
      { nodeId: '5', characters: '40\n30\n20\n10\n0', color: '#333333', fontSize: 12 },
      { nodeId: '6', characters: '预警线', color: '#d32f2f', fontSize: 12 },
    ]);
    const r = backfillScriptOptionTruth([{ path: 'package/index.vue', content: OPT_SRC }], truth as any);
    expect(r.stats.xAxisBackfilled).toBe(0);
    // markLine 真值独立，不受轴影响，仍应回填
    expect(r.stats.markLineBackfilled).toBe(1);
    expect(r.files[0].content).toContain('#E0E0E0'); // 轴标签保持原样
  });
});

describe('bg-* 背景图命名↔结构锚定 + img 尺寸还原（2026-11-05 grill 决议·方案丁）', () => {
  const mk = (over: Partial<any> = {}) => ({
    nodeId: '2:9001',
    name: 'icon',
    fileName: 'icon-9001.png',
    siblingTexts: [],
    ...over,
  });
  const BG_SRC = [
    '<template>',
    '  <div :class="[\'c-x-tab\', { \'c-x-tab--active\': active }]">A</div>',
    '</template>',
    '<style scoped>',
    '.c-x-tab { color: #888; }',
    '.c-x-tab--active { color: #fff; background: #B8D8F0; }',
    '</style>',
  ].join('\n');

  it('bg-tab-active-7891.png → tab--active 类规则 background 替换（原色保留 + url + 100% 100%）', () => {
    const assets = [mk({ nodeId: '2:9101', fileName: 'bg-tab-active-7891.png' })];
    const r = mountAssetIcons([{ path: 'package/index.vue', content: BG_SRC }], assets as any);
    expect(r.stats.bgAnchored).toBe(1);
    const out = r.files[0].content;
    expect(out).toContain(
      "background: #B8D8F0 url('../resources/images/bg-tab-active-7891.png') center / 100% 100% no-repeat",
    );
    expect(out).toContain('#B8D8F0'); // 原色保留兜底
  });

  it('🔴 阴性：核心段无类命中 → bgSkipNoClass，内容逐字节不变', () => {
    const assets = [mk({ nodeId: '2:9102', fileName: 'bg-sidebar-head-9102.png' })];
    const r = mountAssetIcons([{ path: 'package/index.vue', content: BG_SRC }], assets as any);
    expect(r.stats.bgAnchored).toBe(0);
    expect(r.stats.bgSkipNoClass).toBe(1);
    expect(r.files[0].content).toBe(BG_SRC);
  });

  // dea19159 实锤：bg-7890.png（295×26）= tabs 胶囊条整图，无语义核心段/无邻居文本/AI label 幻觉三通道全灭 → 尺寸锚定兜底
  it('阳性（尺寸锚定）：纯 id 命名 bg ↔ 规则 height 精确 + width 匹配 + 唯一 → 挂载', () => {
    const src = [
      '<template>',
      '  <div class="c-x-tabs"><button class="c-x-tab">A</button></div>',
      '</template>',
      '<style scoped>',
      '.c-x-tabs { display: flex; height: 26px; border-radius: 13px; background: rgba(228, 238, 245, 0.9); }',
      '.c-x-tab { height: 22px; background: transparent; }',
      '</style>',
    ].join('\n');
    const assets = [mk({ nodeId: '2:7890', fileName: 'bg-7890.png', width: 295.0000011, height: 26.9999995 })];
    const r = mountAssetIcons([{ path: 'package/index.vue', content: src }], assets as any);
    expect(r.stats.bgAnchored).toBe(1);
    expect(r.stats.bgSkipNoClass).toBe(0);
    const out = r.files[0].content;
    expect(out).toContain(
      "background: rgba(228, 238, 245, 0.9) url('../resources/images/bg-7890.png') center / 100% 100% no-repeat",
    );
  });

  it('🔴 阴性（尺寸锚定）：height 同值多规则 → bgSkipAmbiguous 弃权', () => {
    const src = [
      '<template><div class="c-x-tabs">A</div><div class="c-y-bar">B</div></template>',
      '<style scoped>',
      '.c-x-tabs { height: 26px; background: #EEE; }',
      '.c-y-bar { height: 26px; background: #DDD; }',
      '</style>',
    ].join('\n');
    const assets = [mk({ nodeId: '2:7890', fileName: 'bg-7890.png', width: 295, height: 26 })];
    const r = mountAssetIcons([{ path: 'package/index.vue', content: src }], assets as any);
    expect(r.stats.bgAnchored).toBe(0);
    expect(r.stats.bgSkipAmbiguous).toBe(1);
    expect(r.files[0].content).toBe(src);
  });

  it('🔴 阴性（尺寸锚定）：无 height 真值 → 不激活通道，保持 bgSkipNoClass', () => {
    const assets = [mk({ nodeId: '2:7890', fileName: 'bg-7890.png' })];
    const r = mountAssetIcons([{ path: 'package/index.vue', content: BG_SRC }], assets as any);
    expect(r.stats.bgAnchored).toBe(0);
    expect(r.stats.bgSkipNoClass).toBe(1);
    expect(r.files[0].content).toBe(BG_SRC);
  });

  // 83cfb20e 实锤：`.dark X` 主题副本是 X 的投影不是歧义——命名锚定应全投影挂载
  it('阳性（主题副本）：light + .dark 副本同文件 → 两条投影都挂 url，不判歧义', () => {
    const src = [
      '<template><div class="c-x-card">A</div></template>',
      '<style scoped>',
      '.c-x-card { color: #fff; background: linear-gradient(90deg, #2A7FEC 0%, #4A9BF0 100%); }',
      '.dark .c-x-card { background: linear-gradient(90deg, #1B5FD9 0%, #2A7FEC 100%); }',
      '</style>',
    ].join('\n');
    const assets = [mk({ nodeId: '2:8788', fileName: 'bg-card-8788.png' })];
    const r = mountAssetIcons([{ path: 'package/index.vue', content: src }], assets as any);
    expect(r.stats.bgAnchored).toBe(1);
    expect(r.stats.bgSkipAmbiguous).toBe(0);
    const out = r.files[0].content;
    // light 主体 + dark 副本两条投影都同层追加 url（原色保留）
    expect((out.match(/bg-card-8788\.png/g) || []).length).toBe(2);
  });

  it('🔴 阴性：同文件真重复（两条非主题变体同名规则）→ 仍 bgSkipAmbiguous', () => {
    const src = [
      '<template><div class="c-x-card">A</div></template>',
      '<style scoped>',
      '.c-x-card { color: #fff; background: #2A7FEC; }',
      '.c-x-card { color: #000; background: #1B5FD9; }',
      '</style>',
    ].join('\n');
    const assets = [mk({ nodeId: '2:8788', fileName: 'bg-card-8788.png' })];
    const r = mountAssetIcons([{ path: 'package/index.vue', content: src }], assets as any);
    expect(r.stats.bgAnchored).toBe(0);
    expect(r.stats.bgSkipAmbiguous).toBe(1);
  });

  it('🔴 阴性：核心段命中多个类（歧义）→ bgSkipAmbiguous 放弃', () => {
    const src = BG_SRC.replace('.c-x-tab {', '.c-x-tab-active-sub {');
    const assets = [mk({ nodeId: '2:9103', fileName: 'bg-tab-active-9103.png' })];
    const r = mountAssetIcons([{ path: 'package/index.vue', content: src }], assets as any);
    expect(r.stats.bgAnchored).toBe(0);
    expect(r.stats.bgSkipAmbiguous).toBe(1);
  });

  it('🔴 阴性：命中类无 background 键 → bgSkipNoBgKey（只换已有键，不臆造）', () => {
    const src = BG_SRC.replace('.c-x-tab--active { color: #fff; background: #B8D8F0; }', '.c-x-tab--active { color: #fff; }');
    const assets = [mk({ nodeId: '2:9104', fileName: 'bg-tab-active-9104.png' })];
    const r = mountAssetIcons([{ path: 'package/index.vue', content: src }], assets as any);
    expect(r.stats.bgAnchored).toBe(0);
    expect(r.stats.bgSkipNoBgKey).toBe(1);
    expect(r.files[0].content).toBe(src);
  });

  it('尺寸还原：空变量路径变量↔img 一一对应直接注入 bbox 尺寸', () => {
    const assets = [
      mk({ nodeId: '2:9201', fileName: 'icon-9201.png', width: 24, height: 24 }),
      mk({ nodeId: '2:9202', fileName: 'icon-9202.png', width: 18, height: 18 }),
    ];
    const src = [
      '<template>',
      '  <img class="a" :src="iconA" />',
      '  <img class="b" :src="iconB" />',
      '</template>',
      '<script setup>',
      "const iconA = ref('')",
      "const iconB = ''",
      '</script>',
    ].join('\n');
    const r = mountAssetIcons([{ path: 'package/index.vue', content: src }], assets as any);
    expect(r.stats.emptyIconVarsReplaced).toBe(2);
    expect(r.stats.sizeRestored).toBe(2);
    const out = r.files[0].content;
    expect(out).toContain('<img class="a" :src="iconA" style="width:24px;height:24px" />');
    expect(out).toContain('<img class="b" :src="iconB" style="width:18px;height:18px" />');
  });

  it('尺寸还原保守：v-for 共享标签资产尺寸不一致 → 不注入（防止异形图标错标）', () => {
    const assets = [
      mk({ nodeId: '2:9301', fileName: 'icon-9301.png', width: 24, height: 24, nearbyTexts: ['摄像机'] }),
      mk({ nodeId: '2:9302', fileName: 'icon-9302.png', width: 32, height: 20, nearbyTexts: ['风速仪'] }),
    ];
    const src = [
      '<template>',
      '  <div v-for="item in list" :key="item.name">',
      '    <img :src="item.icon" :alt="item.name" />',
      '  </div>',
      '</template>',
      '<script setup>',
      'const list = [',
      "  { name: '摄像机', icon: '' },",
      "  { name: '风速仪', icon: '' },",
      ']',
      '</script>',
    ].join('\n');
    const r = mountAssetIcons([{ path: 'package/index.vue', content: src }], assets as any);
    expect(r.stats.emptyIconFieldsReplaced).toBe(2);
    expect(r.stats.sizeRestored).toBe(0);
    expect(r.files[0].content).not.toContain('style="width:');
  });

  it('findNodeById：子树精确命中', () => {
    const tree = { id: '0:1', children: [{ id: '2:7941', children: [{ id: '3:1' }] }] };
    expect(findNodeById(tree, '3:1')).toEqual({ id: '3:1' });
    expect(findNodeById(tree, '9:9')).toBeUndefined();
  });
});

describe('字段路径分组锚定与尺寸对应（mc-lab-1793873410979 三实锤）', () => {
  it('🔴 无 name 顶层对象走 img alt 锚定（statLeft={icon:\'\'} + alt=隧道设备）', () => {
    const assets = [
      { nodeId: '2:9401', name: 'icon', fileName: 'icon-9401.png', siblingTexts: [], nearbyTexts: ['隧道设备'] },
      { nodeId: '2:9402', name: 'icon', fileName: 'icon-9402.png', siblingTexts: [], nearbyTexts: ['南北接线设备'] },
      { nodeId: '2:9403', name: 'icon', fileName: 'icon-9403.png', siblingTexts: [], nearbyTexts: ['摄像机'] },
    ];
    const src = [
      '<template>',
      '  <img :src="statLeft.icon" alt="隧道设备" class="s" />',
      '  <img :src="statRight.icon" alt="南北接线设备" class="s" />',
      '  <div v-for="item in list" :key="item.name">',
      '    <img :src="item.icon" :alt="item.name" />',
      '  </div>',
      '</template>',
      '<script setup>',
      'const statLeft = { icon: \'\' }',
      'const statRight = { icon: \'\' }',
      'const list = [',
      "  { name: '摄像机', icon: '' },",
      ']',
      '</script>',
    ].join('\n');
    const r = mountAssetIcons([{ path: 'package/index.vue', content: src }], assets as any);
    // 2 个 stat 对象（alt 锚定）+ 1 个卡字段（name 锚定）
    expect(r.stats.emptyIconFieldsReplaced).toBe(3);
    const out = r.files[0].content;
    expect(out).toContain('icon: labAsset_2_9401'); // alt=隧道设备 ↔ nearbyTexts
    expect(out).toContain('icon: labAsset_2_9402');
    expect(out).toContain('icon: labAsset_2_9403');
  });

  it('🔴 尺寸按绑定组对应：stat 组与数组组各自注入各自真值尺寸，不错标', () => {
    const assets = [
      { nodeId: '2:9411', name: 'icon', fileName: 'icon-9411.png', siblingTexts: [], nearbyTexts: ['隧道设备'], width: 35.25, height: 28.33 },
      { nodeId: '2:9412', name: 'icon', fileName: 'icon-9412.png', siblingTexts: [], nearbyTexts: ['南北接线设备'], width: 35.25, height: 28.33 },
      { nodeId: '2:9413', name: 'icon', fileName: 'icon-9413.png', siblingTexts: [], nearbyTexts: ['摄像机'], width: 26.65, height: 32 },
      { nodeId: '2:9414', name: 'icon', fileName: 'icon-9414.png', siblingTexts: [], nearbyTexts: ['风速仪'], width: 26.65, height: 32 },
    ];
    const src = [
      '<template>',
      '  <img :src="statLeft.icon" alt="隧道设备" class="s" />',
      '  <img :src="statRight.icon" alt="南北接线设备" class="s" />',
      '  <div v-for="item in list" :key="item.name">',
      '    <img :src="item.icon" :alt="item.name" />',
      '  </div>',
      '</template>',
      '<script setup>',
      'const statLeft = { icon: \'\' }',
      'const statRight = { icon: \'\' }',
      'const list = [',
      "  { name: '摄像机', icon: '' },",
      "  { name: '风速仪', icon: '' },",
      ']',
      '</script>',
    ].join('\n');
    const r = mountAssetIcons([{ path: 'package/index.vue', content: src }], assets as any);
    expect(r.stats.emptyIconFieldsReplaced).toBe(4);
    expect(r.stats.sizeRestored).toBe(3); // statLeft + statRight + 数组共享标签
    const out = r.files[0].content;
    // stat 标签拿到自己的 35.25×28.33（🔴 回归：旧版被 12 卡的 26.65×32 错标）
    expect(out).toContain(':src="statLeft.icon" alt="隧道设备" class="s" style="width:35.25px;height:28.33px"');
    expect(out).toContain(':src="statRight.icon" alt="南北接线设备" class="s" style="width:35.25px;height:28.33px"');
    // 数组共享标签拿 26.65×32
    expect(out).toContain(':src="item.icon" :alt="item.name" style="width:26.65px;height:32px"');
  });

  it('🔴 alt 锚定歧义保守放弃：两资产近邻文本都含 alt → 不绑', () => {
    const assets = [
      { nodeId: '2:9421', name: 'icon', fileName: 'icon-9421.png', siblingTexts: [], nearbyTexts: ['设备'] },
      { nodeId: '2:9422', name: 'icon', fileName: 'icon-9422.png', siblingTexts: [], nearbyTexts: ['隧道设备'] },
    ];
    const src = [
      '<template>',
      '  <img :src="statLeft.icon" alt="隧道设备" />',
      '</template>',
      '<script setup>',
      'const statLeft = { icon: \'\' }',
      '</script>',
    ].join('\n');
    const r = mountAssetIcons([{ path: 'package/index.vue', content: src }], assets as any);
    expect(r.stats.emptyIconFieldsReplaced).toBe(0);
    expect(r.files[0].content).toContain("icon: ''");
  });
});

describe('AI 背景图兜底（2026-11-05 立项：bg-7890 纯 id 命名的兜底通道）', () => {
  const AI_SRC = [
    '<template>',
    '  <div class="stat-card">',
    '    <span class="stat-label">巡检统计</span>',
    '  </div>',
    '</template>',
    '<style scoped>',
    '.stat-card { color: #333; background: #10233c; }',
    '.stat-label { font-size: 12px; }',
    '</style>',
  ].join('\n');

  it('阳性（033c5e0c 三代）：label 命中叶子（无 bg 键）→ 祖先回溯挂到所在卡容器', () => {
    // 旧口径「只认叶子自身类」在 033c5e0c 实锤失效：真机 label 词命中的是无 bg 键的
    // 文本 span，真挂载点是卡容器（AI label 语义 = bg 图区域内可见文字 → 挂其所在容器）。
    // 三代：叶子类无 bg 键 → 沿祖先链回溯找唯一命中 + 有 background 键的容器。
    const r = aiAnchorBackgroundAssets(
      [{ path: 'package/index.vue', content: AI_SRC }],
      [{ fileName: 'bg-7890.png', label: '巡检统计' }],
    );
    expect(r.stats.anchored).toBe(1);
    expect(r.stats.skipNoBgKey).toBe(0);
    expect(r.files[0].content).toContain(
      ".stat-card { color: #333; background: #10233c url('../resources/images/bg-7890.png') center / 100% 100% no-repeat; }",
    );
  });

  it('阳性：label 命中带 background 键的叶子类 → 换值（原色保留 + url）', () => {
    const src = [
      '<template>',
      '  <div class="stat-card">巡检统计</div>',
      '</template>',
      '<style scoped>',
      '.stat-card { background: #10233c; }',
      '</style>',
    ].join('\n');
    const r = aiAnchorBackgroundAssets(
      [{ path: 'package/index.vue', content: src }],
      [{ fileName: 'bg-7890.png', label: '巡检统计' }],
    );
    expect(r.stats.candidates).toBe(1);
    expect(r.stats.anchored).toBe(1);
    expect(r.files[0].changed).toBe(true);
    expect(r.files[0].content).toContain(
      "background: #10233c url('../resources/images/bg-7890.png') center / 100% 100% no-repeat",
    );
    expect(r.files[0].content).toContain('#10233c');
  });

  it('🔴 阴性：label 模板零命中（AI 幻觉）→ skipNoLabelHit，零改动；包含匹配须较长侧 ≥4 字符', () => {
    // 完全不存在的文本（真幻觉）
    const r = aiAnchorBackgroundAssets(
      [{ path: 'package/index.vue', content: AI_SRC }],
      [{ fileName: 'bg-7890.png', label: '不存在的区域' }],
    );
    expect(r.stats.anchored).toBe(0);
    expect(r.stats.skipNoLabelHit).toBe(1);
    expect(r.files[0].content).toBe(AI_SRC);
    // 短词包含「统计」→ 命中「巡检统计」叶子 → 祖先回溯挂 .stat-card（三代语义）
    const r2 = aiAnchorBackgroundAssets(
      [{ path: 'package/index.vue', content: AI_SRC }],
      [{ fileName: 'bg-7890.png', label: '统计' }],
    );
    expect(r2.stats.anchored).toBe(1);
    expect(r2.stats.skipNoLabelHit).toBe(0);
    expect(r2.stats.skipNoBgKey).toBe(0);
  });

  it('🔴 阴性→三代迁移：命中叶子无 class → 祖先回溯挂所在容器（033c5e0c）', () => {
    const src = AI_SRC.replace('<span class="stat-label">巡检统计</span>', '<span>巡检统计</span>');
    const r = aiAnchorBackgroundAssets(
      [{ path: 'package/index.vue', content: src }],
      [{ fileName: 'bg-7890.png', label: '巡检统计' }],
    );
    // 无类叶子 → 祖先链回溯 → .stat-card 有 bg 键 → 挂上（旧口径 skipNoClass 保守过度）
    expect(r.stats.anchored).toBe(1);
  });

  it('🔴 阴性：同名文字命中两个不同类（多卡片）→ LCA 收敛到 template 层无类 → 回溯到顶零改动', () => {
    const src = [
      '<template>',
      '  <div class="card-a">巡检统计</div>',
      '  <div class="card-b">巡检统计</div>',
      '</template>',
      '<style scoped>',
      '.card-a { background: #111; }',
      '.card-b { background: #222; }',
      '</style>',
    ].join('\n');
    const r = aiAnchorBackgroundAssets(
      [{ path: 'package/index.vue', content: src }],
      [{ fileName: 'bg-7890.png', label: '巡检统计' }],
    );
    expect(r.stats.anchored).toBe(0);
    // 二代 LCA：多卡片同名 → LCA 收敛到 template（无类）；三代回溯上溯到 #root 仍无
    // bg 键 → skipNoBgKey（保守性保留，计数桶从 skipNoClass 迁移）
    expect(r.stats.skipNoBgKey).toBe(1);
  });

  it('🔴 阴性：类名无 style 规则 / background 已含 url → 统一走 skipNoBgKey（不重复换）', () => {
    const noRule = aiAnchorBackgroundAssets(
      [{ path: 'package/index.vue', content: AI_SRC.replace('.stat-label { font-size: 12px; }', '') }],
      [{ fileName: 'bg-7890.png', label: '巡检统计' }],
    );
    // 三代：stat-label 无规则 → 祖先回溯 → .stat-card 有 bg 键 → 挂上（033c5e0c 语义）
    expect(noRule.stats.anchored).toBe(1);

    const hasUrl = [
      '<template>',
      '  <div class="stat-card">巡检统计</div>',
      '</template>',
      '<style scoped>',
      ".stat-card { background: #10233c url('../resources/images/bg-other.png') no-repeat; }",
      '</style>',
    ].join('\n');
    const r2 = aiAnchorBackgroundAssets(
      [{ path: 'package/index.vue', content: hasUrl }],
      [{ fileName: 'bg-7890.png', label: '巡检统计' }],
    );
    expect(r2.stats.anchored).toBe(0);
    expect(r2.stats.skipAlreadyUrl).toBe(0);
    expect(r2.stats.skipNoBgKey).toBe(1);
    expect(r2.files[0].content).toBe(hasUrl);
  });

  it('两候选同文件不同规则 → 各自换值，坐标互不踩（降序 splice 验证）', () => {
    const src = [
      '<template>',
      '  <div class="card-a">巡检统计</div>',
      '  <div class="card-b">告警统计</div>',
      '</template>',
      '<style scoped>',
      '.card-a { background: #111111; }',
      '.card-b { background: #222222; }',
      '</style>',
    ].join('\n');
    const r = aiAnchorBackgroundAssets(
      [{ path: 'package/index.vue', content: src }],
      [
        { fileName: 'bg-7890.png', label: '巡检统计' },
        { fileName: 'bg-8807.png', label: '告警统计' },
      ],
    );
    expect(r.stats.anchored).toBe(2);
    const out = r.files[0].content;
    expect(out).toContain("background: #111111 url('../resources/images/bg-7890.png')");
    expect(out).toContain("background: #222222 url('../resources/images/bg-8807.png')");
  });

  it('bgFileNameCore 口径：语义段保留、纯 id 为空（与命名锚定同一来源）', () => {
    expect(bgFileNameCore('bg-tab-active-7891.png')).toBe('tab-active');
    expect(bgFileNameCore('bg-7890.png')).toBe('');
    expect(bgFileNameCore('bg-8439.png')).toBe('');
    expect(bgFileNameCore(undefined)).toBe('');
  });
});

describe('Q2 容器 fill 真值回填（mc-lab-1793876687382 三实锤）', () => {
  const CF_SRC = [
    '<template>',
    '  <div class="card-list">',
    '    <div v-for="item in deviceList" :key="index" class="device-card">',
    '      <div class="card-icon-wrap">',
    '        <img class="card-icon" :src="item.icon" :alt="item.name" />',
    '      </div>',
    '      <div class="card-name">{{ item.name }}</div>',
    '    </div>',
    '  </div>',
    '</template>',
    '<script setup>',
    'const deviceList = [',
    "  { name: '摄像机', icon: labAsset_2_8444 },",
    "  { name: '风速仪', icon: labAsset_2_8590 },",
    "  { name: '雷达', icon: labAsset_2_8561 },",
    ']',
    '</script>',
    '<style scoped>',
    '.card-icon-wrap { width: 28px; height: 28px; border-radius: 50%; background: rgba(44, 123, 229, 0.85); }',
    '.card-name { color: #333; background: #FFFFFF; }',
    '</style>',
  ].join('\n');

  const truthWith = (parentFill: any, containers: any[] = []) => ({
    texts: [],
    assets: [
      { nodeId: '2:8444', name: 'icon', fileName: 'icon-8444.png', siblingTexts: [], parentFill },
      { nodeId: '2:8590', name: 'icon', fileName: 'icon-8590.png', siblingTexts: [], parentFill },
      { nodeId: '2:8561', name: 'icon', fileName: 'icon-8561.png', siblingTexts: [], parentFill },
    ],
    containerCount: 3,
    containers,
  });

  it('A 通道：父容器全透明 → icon-wrap 臆造深蓝底 → transparent（v-for 间接变量 unanimous）', () => {
    const truth = truthWith(null);
    const r = backfillContainerFill([{ path: 'package/index.vue', content: CF_SRC }], truth as any);
    expect(r.stats.wrapTransparentized).toBe(1);
    expect(r.files[0].content).toContain('background: transparent');
    expect(r.files[0].content).not.toContain('rgba(44, 123, 229');
  });

  it('A 通道：父容器全同真值色 → 换色', () => {
    const truth = truthWith({ color: '#E8F1FB', opacity: 1 });
    const r = backfillContainerFill([{ path: 'package/index.vue', content: CF_SRC }], truth as any);
    expect(r.stats.wrapColorFixed).toBe(1);
    expect(r.files[0].content).toContain('background: #E8F1FB');
  });

  it('🔴 保守：parentFill 混合（有的透明有的有色）→ skipAmbiguous 零改动', () => {
    const truth = truthWith(null);
    (truth.assets[1] as any).parentFill = { color: '#E8F1FB', opacity: 1 };
    const r = backfillContainerFill([{ path: 'package/index.vue', content: CF_SRC }], truth as any);
    expect(r.stats.wrapTransparentized).toBe(0);
    expect(r.stats.skipAmbiguous).toBe(1);
    expect(r.files[0].content).toContain('rgba(44, 123, 229');
  });

  it('B 通道：容器 childTexts ↔ 元素子树文本唯一交集 → background 换真值色', () => {
    const src = [
      '<template>',
      '  <div class="nav-item-active">监控</div>',
      '  <div class="nav-item">照明</div>',
      '</template>',
      '<style scoped>',
      '.nav-item-active { background: #999999; }',
      '.nav-item { background: #EEEEEE; }',
      '</style>',
    ].join('\n');
    const truth = {
      texts: [],
      assets: [],
      containerCount: 2,
      containers: [
        { nodeId: '2:1', name: 'tab-active', color: '#2C7BE5', childTexts: ['监控'] },
        { nodeId: '2:2', name: 'tab', color: '#F5F5F5', childTexts: ['照明'] },
      ],
    };
    const r = backfillContainerFill([{ path: 'package/index.vue', content: src }], truth as any);
    // token 级类匹配后 .nav-item-active 与 .nav-item 各自唯一命中，两条都换
    expect(r.stats.containerColorFixed).toBe(2);
    expect(r.files[0].content).toContain('background: #2C7BE5');
    expect(r.files[0].content).toContain('background: #F5F5F5');
  });

  it('🔴 保守：url/渐变 background 一律不动（v1 不碰）', () => {
    const src = [
      '<template>',
      '  <div class="banner">设备监测</div>',
      '</template>',
      '<style scoped>',
      ".banner { background: url('../resources/images/bg-8439.png') no-repeat; }",
      '</style>',
    ].join('\n');
    const truth = {
      texts: [],
      assets: [],
      containerCount: 1,
      containers: [{ nodeId: '2:9', name: 'banner', color: '#2C7BE5', childTexts: ['设备监测'] }],
    };
    const r = backfillContainerFill([{ path: 'package/index.vue', content: src }], truth as any);
    expect(r.stats.containerColorFixed).toBe(0);
    expect(r.stats.skipUrlOrGradient).toBe(1);
    expect(r.files[0].content).toContain('bg-8439.png');
  });

  it('AI label 互为包含匹配：label「设备类型」↔ 叶子「设备类型28」唯一命中 → 锚定成功', () => {
    const src = [
      '<template>',
      '  <div class="head-type">设备类型28</div>',
      '</template>',
      '<style scoped>',
      '.head-type { background: #123456; }',
      '</style>',
    ].join('\n');
    const r = aiAnchorBackgroundAssets(
      [{ path: 'package/index.vue', content: src }],
      [{ fileName: 'bg-8439.png', label: '设备类型' }],
    );
    expect(r.stats.anchored).toBe(1);
    expect(r.files[0].content).toContain('bg-8439.png');
  });

  it('🔴 AI label 包含匹配仍守唯一裁决：两个不同类命中 → LCA 收敛 template 层 → 回溯到顶零改动', () => {
    const src = [
      '<template>',
      '  <div class="head-a">设备类型28</div>',
      '  <div class="head-b">设备类型99</div>',
      '</template>',
      '<style scoped>',
      '.head-a { background: #111111; }',
      '.head-b { background: #222222; }',
      '</style>',
    ].join('\n');
    const r = aiAnchorBackgroundAssets(
      [{ path: 'package/index.vue', content: src }],
      [{ fileName: 'bg-8439.png', label: '设备类型' }],
    );
    expect(r.stats.anchored).toBe(0);
    // 三代：LCA 收敛 template（无类）→ 回溯到 #root 无 bg 键 → skipNoBgKey
    // （保守性保留：绝不在两个歧义卡中随机挑一个挂）
    expect(r.stats.skipNoBgKey).toBe(1);
  });
});

describe('AI label 分词 LCA 锚定（二代）+ B 通道插值回退（61c25280 实锤）', () => {
  it('分词 LCA：AI 串「总数:56302 隧道设备 异常数:5」→ 三词命中子叶 → LCA=summary-card--primary → 挂 url', () => {
    const src = [
      '<template>',
      '  <div class="summary-card summary-card--primary">',
      '    <span class="s-label">总数:</span>',
      '    <span class="s-device">隧道设备</span>',
      '    <span class="s-abn">异常数:</span>',
      '  </div>',
      '</template>',
      '<style scoped>',
      '.summary-card { display: flex; }',
      '.summary-card--primary { background: #3b82f6; }',
      '</style>',
    ].join('\n');
    const r = aiAnchorBackgroundAssets(
      [{ path: 'package/index.vue', content: src }],
      [{ fileName: 'bg-8788.png', label: '总数:56302 隧道设备 异常数:5' }],
    );
    expect(r.stats.anchored).toBe(1);
    expect(r.files[0].content).toContain("background: #3b82f6 url('../resources/images/bg-8788.png')");
  });

  it('插值回退：v-for tab（深灰臆造底）→ script 字面量匹配容器 fill 白/蓝 → 众数→基础类、少数→--active', () => {
    const src = [
      '<template>',
      '  <div class="tab-bar">',
      '    <button v-for="tab in tabs" :key="tab.key" class="c-monitor-tab"',
      '      :class="{ \'c-monitor-tab--active\': activeTab === tab.key }">',
      '      <span class="c-monitor-tab-text">{{ tab.label }}</span>',
      '    </button>',
      '  </div>',
      '</template>',
      '<script setup>',
      'const tabs = [',
      "  { key: 'monitor', label: '监控', badge: '3' },",
      "  { key: 'light', label: '照明' },",
      "  { key: 'fan', label: '通风' },",
      ']',
      '</script>',
      '<style scoped>',
      '.c-monitor-tab { background: #36404e; color: #fff; }',
      '.c-monitor-tab--active { background: #ffffff; color: #3b82f6; }',
      '</style>',
    ].join('\n');
    const truth = {
      texts: [],
      assets: [],
      containerCount: 3,
      containers: [
        { nodeId: '2:1', name: 'tab-1', color: '#ffffff', childTexts: ['监控'] },
        { nodeId: '2:2', name: 'tab-2', color: '#ffffff', childTexts: ['照明'] },
        { nodeId: '2:3', name: 'tab-3', color: '#ffffff', childTexts: ['通风'] },
        { nodeId: '2:4', name: 'tab-active', color: '#2C7BE5', childTexts: ['监控'] },
      ],
    };
    const r = backfillContainerFill([{ path: 'package/index.vue', content: src }], truth as any);
    // 「监控」命中白+蓝两容器 → fill 分组 白×3? 蓝来自「监控」+「通风」…… 按实现：白 2（监控/照明/通风各自白命中按字面量计数），蓝 1
    expect(r.stats.containerColorFixed).toBe(2);
    const out = r.files[0].content;
    expect(out).toContain('background: #ffffff'); // 基础类 → 众数白
    expect(out).toContain('background: #2C7BE5'); // --active → 少数蓝
    expect(out).not.toContain('#36404e');
  });

  // 🔴 033c5e0c 实锤（2026-11-05）：AI 兜底对插值产物结构性失效。
  // label「总数:56302」的「总数:」部分同时命中左右两卡 → LCA 泛化到外层 wrap；
  // 数字「56302」是 {{ summaryLeft.total }} 插值 → 静态 ownText 零命中。
  // 治本四件：插值虚拟文本匹配 + 簇分离剔离群 + 祖先回溯找 bg 键 + 渐变键多层替换。
  it('AI 兜底插值回退：双卡插值产物 + label「总数:56302」→ 数字虚拟文本锚左卡 → 簇分离剔右卡 → 祖先回溯挂渐变卡', () => {
    const src = [
      '<template>',
      '  <div class="card-summary">',
      '    <div class="card-item card-item--blue">',
      '      <div class="card-icon"><img :src="a" alt="" /></div>',
      '      <div class="card-info">',
      '        <div class="card-total">',
      '          <span style="color:#ffffff">总数:</span>',
      '          <span class="card-total-num">{{ summaryLeft.total }}</span>',
      '        </div>',
      '        <div class="card-name">{{ summaryLeft.name }}</div>',
      '      </div>',
      '    </div>',
      '    <div class="card-item card-item--light">',
      '      <div class="card-icon"><img :src="b" alt="" /></div>',
      '      <div class="card-info">',
      '        <div class="card-total">',
      '          <span style="color:#333333">总数:</span>',
      '          <span class="card-total-num">{{ summaryRight.total }}</span>',
      '        </div>',
      '      </div>',
      '    </div>',
      '  </div>',
      '</template>',
      '<script setup>',
      'const summaryLeft = { total: \'56302\', name: \'隧道设备\' }',
      'const summaryRight = { total: \'1280\', name: \'南北接线\' }',
      '</script>',
      '<style scoped>',
      '.card-summary { display: flex; gap: 12px; }',
      '.card-item { flex: 1; display: flex; align-items: center; }',
      '.card-item--blue { background: linear-gradient(135deg, #3B8FFC 0%, #2C6FD9 100%); color: #fff; }',
      '.card-item--light { background: rgba(255, 255, 255, 0.65); color: #1F2329; }',
      '.card-total { display: flex; }',
      '</style>',
    ].join('\n');
    const r = aiAnchorBackgroundAssets(
      [{ path: 'package/index.vue', content: src }],
      [{ fileName: 'bg-8788.png', label: '总数:56302' }],
    );
    // 数字「56302」经插值虚拟文本命中左卡 total-num → 左卡 span+num 同簇（2 节点）
    // → 右卡 span 是离群（剔除后 LCA 更深）→ LCA=card-total → 祖先回溯到 --blue 渐变键
    expect(r.stats.anchored).toBe(1);
    expect(r.stats.skipNoBgKey).toBe(0);
    const out = r.files[0].content;
    // 渐变键 → 多层替换：url 在上层，原渐变保留兜底
    expect(out).toMatch(/\.card-item--blue \{ background: url\('(\.\.\/)*resources\/images\/bg-8788\.png'\) center \/ 100% 100% no-repeat, linear-gradient/);
    // --light 卡不受影响
    expect(out).toContain('.card-item--light { background: rgba(255, 255, 255, 0.65);');
  });

  it('AI 兜底插值回退：右卡 label「总数:1280」→ 锚 --light 纯色卡 → 追加 url 同层', () => {
    const src = [
      '<template>',
      '  <div class="card-summary">',
      '    <div class="card-item card-item--blue">',
      '      <div class="card-total"><span>总数:</span><span class="num">{{ s.total }}</span></div>',
      '    </div>',
      '    <div class="card-item card-item--light">',
      '      <div class="card-total"><span>总数:</span><span class="num">{{ r.total }}</span></div>',
      '    </div>',
      '  </div>',
      '</template>',
      '<script setup>',
      'const s = { total: \'56302\' }',
      'const r = { total: \'1280\' }',
      '</script>',
      '<style scoped>',
      '.card-item--blue { background: linear-gradient(135deg, #3B8FFC 0%, #2C6FD9 100%); }',
      '.card-item--light { background: rgba(255, 255, 255, 0.65); }',
      '</style>',
    ].join('\n');
    const r2 = aiAnchorBackgroundAssets(
      [{ path: 'package/index.vue', content: src }],
      [{ fileName: 'bg-8807.png', label: '总数:1280' }],
    );
    expect(r2.stats.anchored).toBe(1);
    const out = r2.files[0].content;
    // 纯色（rgba 也是纯色）键 → 现行为：原值后追加 url
    expect(out).toMatch(/\.card-item--light \{ background: rgba\(255, 255, 255, 0\.65\) url\('/);
    expect(out).not.toContain('bg-8807.png\') center / 100% 100% no-repeat, linear'); // 不挂到蓝卡
  });
});

describe('面板标题插槽归位（478f0758 实锤：标题渲染进内容区 + 头部插槽空置）', () => {
  const TITLE_SRC = [
    '<template>',
    '  <base-panel panelKey="default-panel">',
    '    <div class="c-equipment-monitor-content">',
    '      <div class="c-equipment-monitor-top">',
    '        <span class="c-equipment-monitor-top-title" style="font-size:16px">设备监测</span>',
    '        <span class="c-equipment-monitor-top-metric">设备类型 28</span>',
    '      </div>',
    '      <div class="c-equipment-monitor-body">内容</div>',
    '    </div>',
    '  </base-panel>',
    '</template>',
  ].join('\n');

  it('阳性：标题 span（== displayName）从内容区摘除 → 注入 #title-left 插槽', () => {
    const r = relocatePanelTitle([{ path: 'package/index.vue', content: TITLE_SRC }], '设备监测');
    expect(r.stats.panels).toBe(1);
    expect(r.stats.titleRelocated).toBe(1);
    const out = r.files[0].content;
    // 注入插槽在 base-panel 开标签之后、内容容器之前
    expect(out).toMatch(/<base-panel panelKey="default-panel">\s*\n\s*<template #title-left>设备监测<\/template>/);
    // 内容区不再有标题 span
    expect(out).not.toContain('top-title');
    expect(out).toContain('设备类型 28'); // 兄弟节点不受影响
    expect(out).toContain('c-equipment-monitor-body'); // 其余结构完整
  });

  it('阴性：文本 ≠ displayName → 零改动 skipNoTitle', () => {
    const r = relocatePanelTitle([{ path: 'package/index.vue', content: TITLE_SRC }], '另一个名字');
    expect(r.stats.titleRelocated).toBe(0);
    expect(r.stats.skipNoTitle).toBe(1);
    expect(r.files[0].content).toBe(TITLE_SRC);
  });

  it('阴性：已有 #title-left → 不重复注入', () => {
    const src = TITLE_SRC.replace(
      '<base-panel panelKey="default-panel">',
      '<base-panel panelKey="default-panel">\n    <template #title-left>设备监测</template>',
    );
    const r = relocatePanelTitle([{ path: 'package/index.vue', content: src }], '设备监测');
    expect(r.stats.titleRelocated).toBe(0);
    expect(r.stats.skipNoTitle).toBe(1);
    expect(r.files[0].content).toBe(src);
  });

  it('阴性：displayName 为空 / 无 base-panel → 零改动', () => {
    const r1 = relocatePanelTitle([{ path: 'package/index.vue', content: TITLE_SRC }], '');
    expect(r1.stats.panels).toBe(0);
    expect(r1.files[0].content).toBe(TITLE_SRC);
    const r2 = relocatePanelTitle([{ path: 'package/index.vue', content: '<template><div>设备监测</div></template>' }], '设备监测');
    expect(r2.stats.panels).toBe(0);
    expect(r2.files[0].content).toBe('<template><div>设备监测</div></template>');
  });

  // 98a06fd4 真机实锤：只摘文本节点残留 ① 孤立 </span>（node.end 不含闭标签）② 空壳标题行容器（装饰竖条 → 预览孤立「|」）
  it('阳性（容器级摘除）：标题行容器全文==displayName → 整块摘除，无孤立闭标签/空壳容器', () => {
    const src = [
      '<template>',
      '  <base-panel panelKey="default-panel">',
      '    <div class="c-equipment-monitor-content">',
      '      <div class="c-equipment-monitor-topbar">',
      '        <div class="c-equipment-monitor-topbar-title">',
      '          <span class="c-equipment-monitor-topbar-bar"></span>',
      '          <span class="c-equipment-monitor-topbar-text">设备监测</span>',
      '        </div>',
      '        <div class="c-equipment-monitor-topbar-stats">设备类型 28</div>',
      '      </div>',
      '      <div class="c-equipment-monitor-body">内容</div>',
      '    </div>',
      '  </base-panel>',
      '</template>',
    ].join('\n');
    const r = relocatePanelTitle([{ path: 'package/index.vue', content: src }], '设备监测');
    expect(r.stats.titleRelocated).toBe(1);
    const out = r.files[0].content;
    // topbar-title 容器（含装饰 bar span）整块消失
    expect(out).not.toContain('topbar-title');
    expect(out).not.toContain('topbar-bar');
    // 无孤立闭标签残留
    expect(out).not.toMatch(/<\/span>\s*<\/div>/);
    // topbar 里的 stats 兄弟（含其他文字）不受影响
    expect(out).toContain('topbar-stats');
    expect(out).toContain('设备类型 28');
    expect(out).toContain('c-equipment-monitor-body');
    // 插槽注入
    expect(out).toMatch(/<template #title-left>设备监测<\/template>/);
  });
});

describe('预编译 index.css 同步（478f0758 实锤：预览剥 SFC style 注入 index.css）', () => {
  const SFC = [
    '<template>',
    '  <div class="card-summary">',
    '    <div class="stat-card stat-card--blue">',
    '      <span>总数:</span><span class="num">{{ s.total }}</span>',
    '    </div>',
    '  </div>',
    '</template>',
    '<script setup>',
    "const s = ref({ total: '56302' })",
    '</script>',
    '<style scoped>',
    '.stat-card--blue { background: linear-gradient(135deg, #5BA4F5 0%, #409EFF 100%); }',
    '</style>',
  ].join('\n');
  const CSS = [
    '.stat-card--blue {',
    '  background: linear-gradient(135deg, #5BA4F5 0%, #409EFF 100%);',
    '  box-shadow: 0 2px 6px rgba(64, 158, 255, 0.3);',
    '}',
  ].join('\n');

  it('AI 兜底挂图：SFC 与预编译 index.css 同规则同步替换，css 内 url 深度 = ../images/', () => {
    const r = aiAnchorBackgroundAssets(
      [
        { path: 'package/index.vue', content: SFC },
        { path: 'resources/styles/index.css', content: CSS },
      ],
      [{ fileName: 'bg-8788.png', label: '总数:56302' }],
    );
    expect(r.stats.anchored).toBe(1);
    const sfc = r.files.find((f) => f.path === 'package/index.vue')!;
    const css = r.files.find((f) => f.path === 'resources/styles/index.css')!;
    expect(sfc.changed).toBe(true);
    // SFC：渐变键 → 多层替换（url 在上层，原渐变兜底），路径 ../resources/images/
    expect(sfc.content).toContain(
      "background: url('../resources/images/bg-8788.png') center / 100% 100% no-repeat, linear-gradient(135deg, #5BA4F5 0%, #409EFF 100%)",
    );
    // css：多层替换且路径按 CSS 位置解析（styles/ → ../images/）
    expect(css.changed).toBe(true);
    expect(css.content).toContain(
      "background: url('../images/bg-8788.png') center / 100% 100% no-repeat, linear-gradient(135deg, #5BA4F5 0%, #409EFF 100%)",
    );
    // 两个文件各替换一次，互不串位
    expect((css.content.match(/bg-8788/g) || []).length).toBe(1);
  });

  it('阴性：纯 SFC 输入不受裸 CSS 回退影响（规则不重复计数）', () => {
    const r = aiAnchorBackgroundAssets(
      [{ path: 'package/index.vue', content: SFC }],
      [{ fileName: 'bg-8788.png', label: '总数:56302' }],
    );
    expect(r.stats.anchored).toBe(1);
    // 唯一命中不被破坏（若裸回退误扫 SFC 会产生重复规则 → 歧义 skip）
    expect(r.stats.skipClassAmbiguous).toBe(0);
  });
});

describe('bg 结构锚定 parentTexts（83cfb20e 实锤：整图卡底图 siblingTexts 空 + AI label 零命中）', () => {
  // 真值形状：设备卡 group 下没有直接 TEXT 子节点（文本嵌在子 frame 里）⇒ siblingTexts=[]，
  // 但父容器**整子树**文本 = ['摄像机','(2/484)']，这才是确定性结构锚点。
  const figmaTree = () => ({
    id: '2:8400',
    type: 'FRAME',
    children: [
      {
        id: '2:8438',
        type: 'GROUP',
        children: [
          {
            id: '2:8438-a',
            type: 'FRAME',
            children: [
              { id: '2:8438-t1', type: 'TEXT', characters: '摄像机' },
              { id: '2:8438-t2', type: 'TEXT', characters: '(2/484)' },
            ],
          },
          {
            id: '2:8439',
            type: 'RECTANGLE',
            fills: [{ type: 'IMAGE', imageRef: 'ref8439', visible: true }],
            absoluteBoundingBox: { x: 10, y: 20, width: 117, height: 64 },
          },
        ],
      },
    ],
  });

  it('collectFigmaTruth：siblingTexts 空 → parentTexts 收到父容器整子树文本', () => {
    const truth = collectFigmaTruth(figmaTree());
    const a = truth.assets.find((x) => x.nodeId === '2:8439')!;
    expect(a.siblingTexts).toEqual([]);
    expect(a.parentTexts).toEqual(['摄像机', '(2/484)']);
  });

  it('阳性：parentTexts 拼结构候选 → LCA 卡容器 class → 规则 background 挂 url', () => {
    const truth = collectFigmaTruth(figmaTree());
    const a = truth.assets.find((x) => x.nodeId === '2:8439')!;
    a.fileName = 'bg-8439.png';
    const label = a.parentTexts!.join(' ');
    const src = [
      '<template>',
      '  <div class="c-x-device-list">',
      '    <div v-for="d in list" :key="d.id" class="c-x-device-card">',
      '      <i class="c-x-device-icon" />',
      '      <span class="c-x-device-name">摄像机</span>',
      '      <span class="c-x-device-count">(2/484)</span>',
      '    </div>',
      '  </div>',
      '</template>',
      '<style scoped>',
      '.c-x-device-list { display: flex; }',
      '.c-x-device-card { width: 117px; height: 64px; background: #EAF2FF; border-radius: 6px; }',
      '</style>',
    ].join('\n');
    const r = aiAnchorBackgroundAssets(
      [{ path: 'package/index.vue', content: src }],
      [{ fileName: 'bg-8439.png', label }],
    );
    expect(r.stats.anchored).toBe(1);
    expect(r.files[0].content).toContain(
      "background: #EAF2FF url('../resources/images/bg-8439.png') center / 100% 100% no-repeat",
    );
  });

  it('🔴 阴性：父容器整子树无文本 → parentTexts 缺省（不臆造锚点）', () => {
    const truth = collectFigmaTruth({
      id: '2:8500',
      type: 'FRAME',
      children: [
        {
          id: '2:8501',
          type: 'RECTANGLE',
          fills: [{ type: 'IMAGE', imageRef: 'ref8501', visible: true }],
          absoluteBoundingBox: { x: 0, y: 0, width: 30, height: 30 },
        },
      ],
    });
    const a = truth.assets.find((x) => x.nodeId === '2:8501')!;
    expect(a.parentTexts).toBeUndefined();
    expect(a.siblingTexts).toEqual([]);
  });

  it('上溯：父层纯容器无文本 → 取祖父层整子树文本（最多 3 跳）', () => {
    // 真机 2:8439 形状：IMAGE 节点父层是纯装饰容器，文本在再上一层卡容器里
    const truth = collectFigmaTruth({
      id: '2:8600',
      type: 'FRAME',
      children: [
        {
          id: '2:8601',
          type: 'GROUP',
          children: [
            {
              id: '2:8602',
              type: 'FRAME',
              children: [
                {
                  id: '2:8603',
                  type: 'RECTANGLE',
                  fills: [{ type: 'IMAGE', imageRef: 'ref8603', visible: true }],
                  absoluteBoundingBox: { x: 5, y: 5, width: 117, height: 64 },
                },
              ],
            },
            {
              id: '2:8606',
              type: 'FRAME',
              children: [
                { id: '2:8604', type: 'TEXT', characters: '烟道机器人' },
                { id: '2:8605', type: 'TEXT', characters: '(0/484)' },
              ],
            },
          ],
        },
      ],
    });
    const a = truth.assets.find((x) => x.nodeId === '2:8603')!;
    expect(a.siblingTexts).toEqual([]); // 父亲容器无直接 TEXT 兄弟
    expect(a.parentTexts).toEqual(['烟道机器人', '(0/484)']); // 祖父卡容器整子树文本
  });
});

describe('聚合 label 双卡同名 → 数字严格档分簇（c91f6190 实锤：bgAiSkipNoBgKey=2）', () => {
  // 真实产物结构：两张统计卡各有「总 数:」「异常数:」同名文本；只有卡容器有 background 键。
  // 宽松档下「总数:56302」与「总 数:」双向包含 ⇒ 两卡都命中 ⇒ LCA 泛化到 .stat-cards
  // （无 bg 键）⇒ skipNoBgKey。严格档要求数字段相容 ⇒ 命中簇按卡分离。
  const TWO_CARD = [
    '<template>',
    '  <div class="c-x-stat-cards">',
    '    <div class="c-x-stat-card c-x-stat-card--primary">',
    '      <div class="c-x-stat-row">',
    '        <span class="c-x-stat-label">总 数:</span>',
    '        <span class="c-x-stat-number">56302</span>',
    '      </div>',
    '      <div class="c-x-stat-row c-x-stat-row--sub">',
    '        <span class="c-x-stat-sub-label">隧道设备</span>',
    '        <span class="c-x-stat-sub-label">异常数:</span>',
    '        <span class="c-x-stat-sub-number">5</span>',
    '      </div>',
    '    </div>',
    '    <div class="c-x-stat-card c-x-stat-card--secondary">',
    '      <div class="c-x-stat-row">',
    '        <span class="c-x-stat-label">总 数:</span>',
    '        <span class="c-x-stat-number">1280</span>',
    '      </div>',
    '      <div class="c-x-stat-row c-x-stat-row--sub">',
    '        <span class="c-x-stat-sub-label">南北接线 设备</span>',
    '        <span class="c-x-stat-sub-label">异常数:</span>',
    '        <span class="c-x-stat-sub-number">3</span>',
    '      </div>',
    '    </div>',
    '  </div>',
    '</template>',
    '<style scoped>',
    '.c-x-stat-cards { display: flex; gap: 6px; }',
    '.c-x-stat-card { border-radius: 6px; padding: 5px 8px; }',
    '.c-x-stat-card--primary { background: linear-gradient(135deg, #3B9EFF 0%, #2E7FD6 100%); }',
    '.c-x-stat-card--secondary { background: rgba(255, 255, 255, 0.75); }',
    '.c-x-stat-label { font-size: 14px; }',
    '.c-x-stat-number { font-weight: 700; }',
    '.c-x-stat-sub-label { opacity: 0.85; }',
    '.c-x-stat-sub-number { color: #FF4D4F; }',
    '.c-x-stat-row--sub { gap: 4px; }',
    '</style>',
  ].join('\n');

  it('阳性：左卡 label→primary 渐变多层、右卡 label→secondary 纯色同层（各挂各的卡）', () => {
    const r = aiAnchorBackgroundAssets(
      [{ path: 'package/index.vue', content: TWO_CARD }],
      [
        { fileName: 'bg-8788.png', label: '总数:56302 隧道设备 异常数:5' },
        { fileName: 'bg-8807.png', label: '总数:1280 南北接线设备 异常数:3' },
      ],
    );
    expect(r.stats.anchored).toBe(2);
    expect(r.stats.skipNoBgKey).toBe(0);
    const out = r.files[0].content;
    // 左卡：渐变 → 多层（url 在上，渐变兜底）
    expect(out).toContain(
      "background: url('../resources/images/bg-8788.png') center / 100% 100% no-repeat, linear-gradient(135deg, #3B9EFF 0%, #2E7FD6 100%)",
    );
    // 右卡：纯色 → 同层追加
    expect(out).toContain(
      "background: rgba(255, 255, 255, 0.75) url('../resources/images/bg-8807.png') center / 100% 100% no-repeat",
    );
    // 两张卡没串（8788 只出现在 primary 规则体、8807 只出现在 secondary 规则体）
    const primaryBody = out.slice(out.indexOf('.c-x-stat-card--primary'), out.indexOf('.c-x-stat-card--secondary'));
    expect(primaryBody).toContain('bg-8788');
    expect(primaryBody).not.toContain('bg-8807');
  });

  it('阳性（结构 label 形态）：含独立无数字同名词「总数:」时，长数字词定簇仍然分对卡', () => {
    // 真实结构 label（parentTexts.join(' ')）分词后「总数:」独立成词、无数字 ⇒ 双卡同名；
    // 靠 ≥4 位长数字（56302 / 1280）定簇，否则 LCA 又泛化到 .c-x-stat-cards。
    const r = aiAnchorBackgroundAssets(
      [{ path: 'package/index.vue', content: TWO_CARD }],
      [
        { fileName: 'bg-8788.png', label: '隧道设备 总数: 56302 异常数:' },
        { fileName: 'bg-8807.png', label: '总数: 1280 异常数: 南北接线 设备' },
      ],
    );
    expect(r.stats.anchored).toBe(2);
    const out = r.files[0].content;
    expect(out).toContain("bg-8788.png') center / 100% 100% no-repeat, linear-gradient(135deg, #3B9EFF 0%, #2E7FD6 100%)");
    expect(out).toContain("background: rgba(255, 255, 255, 0.75) url('../resources/images/bg-8807.png')");
  });

  it('回退：严格档零命中时退回宽松档（计入 skipNoBgKey 而非 skipNoLabelHit）', () => {
    // label 的数字 99999 在产物里不存在 ⇒ 严格档无命中；宽松档命中两卡「总 数:」
    // ⇒ LCA 泛化到 .c-x-stat-cards（无 bg 键）⇒ skipNoBgKey=1，证明回退确实发生。
    const r = aiAnchorBackgroundAssets(
      [{ path: 'package/index.vue', content: TWO_CARD }],
      [{ fileName: 'bg-0000.png', label: '总数:99999' }],
    );
    expect(r.stats.anchored).toBe(0);
    expect(r.stats.skipNoLabelHit).toBe(0);
    expect(r.stats.skipNoBgKey).toBe(1);
    expect(r.files[0].content).toBe(TWO_CARD);
  });

  it('阴性：无数字 label 不受严格档影响（照常命中）', () => {
    const r = aiAnchorBackgroundAssets(
      [{ path: 'package/index.vue', content: TWO_CARD }],
      [{ fileName: 'bg-1111.png', label: '隧道设备 异常数' }],
    );
    // 「隧道设备」唯一命中左卡；「异常数」两卡同名 → 簇分离后仍落左卡（首命中簇）
    expect(r.stats.anchored + r.stats.skipNoBgKey + r.stats.skipNoLabelHit).toBe(1);
  });
});

describe('collectAncestorTexts（最近有文本祖先，≤3 跳，判据单一来源）', () => {
  const tree = {
    id: 'r:1',
    type: 'FRAME',
    children: [
      {
        id: 'g:1',
        type: 'GROUP',
        children: [
          {
            id: 'f:1',
            type: 'FRAME',
            children: [
              {
                id: 'img:1',
                type: 'RECTANGLE',
                fills: [{ type: 'IMAGE', imageRef: 'x', visible: true }],
                absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 },
              },
            ],
          },
          {
            id: 't:1',
            type: 'FRAME',
            children: [
              { id: 't:2', type: 'TEXT', characters: '摄像机' },
              { id: 't:3', type: 'TEXT', characters: '(2/484)' },
            ],
          },
        ],
      },
    ],
  };

  it('父层无文本 → 上溯到有文本祖先，取其整子树文本', () => {
    expect(collectAncestorTexts(tree, 'img:1')).toEqual(['摄像机', '(2/484)']);
  });

  it('全链无文本 → 空数组（不臆造锚点）', () => {
    const bare = {
      id: 'r:2',
      type: 'FRAME',
      children: [{ id: 'img:2', type: 'RECTANGLE', fills: [{ type: 'IMAGE', imageRef: 'y' }] }],
    };
    expect(collectAncestorTexts(bare, 'img:2')).toEqual([]);
  });

  it('cap 生效：整页级祖先文本被截断（防噪声）', () => {
    const wide = {
      id: 'r:3',
      type: 'FRAME',
      children: [
        {
          id: 'g:3',
          type: 'GROUP',
          children: [
            { id: 'img:3', type: 'RECTANGLE', fills: [{ type: 'IMAGE', imageRef: 'z' }] },
            ...Array.from({ length: 20 }, (_, i) => ({ id: `t:${i}`, type: 'TEXT', characters: `文本${i}` })),
          ],
        },
      ],
    };
    expect(collectAncestorTexts(wide, 'img:3').length).toBe(12);
  });
});

describe('面板根内容容器背景清除（微码语义：内容区不该有背景）', () => {
  const SRC = (style: string, body = '<div class="c-x-content"><span class="c-x-label">总数</span></div>') =>
    [
      '<template>',
      '  <base-panel panelKey="default-panel">',
      '    <template #title-left>设备监测</template>',
      `    ${body}`,
      '  </base-panel>',
      '</template>',
      '<style scoped>',
      style,
      '</style>',
    ].join('\n');

  it('阳性：默认插槽根元素的 background → transparent，其它属性与兄弟规则不受影响', () => {
    const src = SRC('.c-x-content { display: flex; background: #E3ECF8; }\n.c-x-label { background: #111; }');
    const r = clearRootContentBackground([{ path: 'package/index.vue', content: src }]);
    expect(r.stats.panels).toBe(1);
    expect(r.stats.rootClasses).toBe(1);
    expect(r.stats.cleared).toBe(1);
    const out = r.files[0].content;
    expect(out).toContain('background: transparent');
    expect(out).not.toContain('#E3ECF8');
    expect(out).toContain('display: flex'); // 非背景属性保留
    expect(out).toContain('.c-x-label { background: #111; }'); // 阳性对照：子元素背景不动
  });

  it('阴性：具名插槽（#title-left）里的元素不当内容区根 → 它的背景规则不清', () => {
    const src = SRC(
      '.c-x-head { background: #FFF; }\n.c-x-content { background: #E3ECF8; }',
      '<template #title-left><div class="c-x-head">标题</div></template>\n    <div class="c-x-content">内容</div>',
    );
    const r = clearRootContentBackground([{ path: 'package/index.vue', content: src }]);
    const out = r.files[0].content;
    expect(r.stats.rootClasses).toBe(1); // 只认默认插槽的 .c-x-content
    expect(out).toContain('background: #FFF'); // 具名插槽内的元素没被当根，背景保留
    expect(out).not.toContain('#E3ECF8'); // 内容区被清
    expect(out).toContain('background: transparent');
  });

  it('阴性：后代规则（.c-x-content .c-x-label）不属于该元素自身 → 不动', () => {
    const src = SRC('.c-x-content .c-x-label { background: #222; }');
    const r = clearRootContentBackground([{ path: 'package/index.vue', content: src }]);
    expect(r.stats.cleared).toBe(0);
    expect(r.files[0].content).toBe(src);
  });

  it('阳性：主题投影（.dark / .light 与预编译 index.css）一并清（深色主题破色的根因）', () => {
    const sfc = SRC('.c-x-content { background: #E3ECF8; }\n.dark .c-x-content { background: #101820; }');
    const css = [{ path: 'resources/styles/index.css', content: '/* 面板 */\n.c-x-content{background:#E3ECF8}\n.light .c-x-content{background:#E4EEF5}\n' }];
    const r = clearRootContentBackground([{ path: 'package/index.vue', content: sfc }, ...css]);
    expect(r.stats.cleared).toBe(4); // SFC 2 条 + css 2 条
    for (const f of r.files) {
      expect(f.content).not.toMatch(/background:\s*#(E3ECF8|101820|E4EEF5)/i);
      expect(f.content).toContain('background: transparent');
    }
  });

  it('阴性：已是 transparent → 幂等，不重复改（skipAlreadyTransparent）', () => {
    const src = SRC('.c-x-content { background: transparent; }');
    const r = clearRootContentBackground([{ path: 'package/index.vue', content: src }]);
    expect(r.stats.cleared).toBe(0);
    expect(r.stats.skipAlreadyTransparent).toBe(1);
    expect(r.files[0].content).toBe(src);
  });

  it('阴性：规则体本无 background 声明 → skipNoBackground（不臆造声明）', () => {
    const src = SRC('.c-x-content { display: flex; }');
    const r = clearRootContentBackground([{ path: 'package/index.vue', content: src }]);
    expect(r.stats.cleared).toBe(0);
    expect(r.stats.skipNoBackground).toBe(1);
    expect(r.files[0].content).toBe(src);
  });

  it('阴性：无 base-panel → rootClasses=0，零改动', () => {
    const src = ['<template>', '  <div class="c-x-content">内容</div>', '</template>', '<style scoped>', '.c-x-content { background: #E3ECF8; }', '</style>'].join('\n');
    const r = clearRootContentBackground([{ path: 'package/index.vue', content: src }]);
    expect(r.stats.panels).toBe(0);
    expect(r.stats.rootClasses).toBe(0);
    expect(r.files[0].content).toBe(src);
  });
});
