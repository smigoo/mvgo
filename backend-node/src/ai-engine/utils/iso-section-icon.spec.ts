/**
 * 🧬 2026-11-12 契约：**段头 / 段内 items 图标必须物化**（E2-v3 真阳性归零）。
 *
 * 真机病灶（mc-max-1794426617609-e35971ca 实测，连续两单拒交付）：
 *   ① 同构收敛把三个兄弟段收成一个 `v-for` 后，兄弟段的薄包装文件被清理 ⇒ 段头 icon 的
 *      **宿主组件消失**；而三段 `header.controls` 实测为 `[]`，icon 只存在于资源映射的
 *      `ownerSectionId` 上 ⇒ `extractIconResource` 恒空 ⇒ 产物 `icon: ""`
 *      ⇒ `icon-战略厂商-3160 / icon-优质厂商-3164 / icon-普通厂商-3208` 三张真值图标零消费。
 *   ② stats 段真值 `body.items` **每项各带 icon.resource**（icon-262 合作厂商 / icon-263
 *      在线设备，md5 与像素内容都不同），产物数据两项却都填同一个变量 ⇒ 第二张零消费。
 *   两者合起来 = E2-v3「4 张前景资源已落盘但产物零消费」⇒ 硬拒。
 *
 * 本 spec 钉住四件事：
 *   A. `buildIsoSectionIconMap` 只收「icon 角色 + 有文件 + 非装饰/非 skipMount」，按段 id 取首条；
 *   B. `extractIconResource` 在 header 空时按归属段兜底（且不改变 header 优先的旧口径）；
 *   C. index 改写把成员 icon 落成 `import` 变量 + `:icon` + 常量裸标识符，且**不破坏**无 icon 的旧形态；
 *   D. items 级补位按 **label 文本**锚定（不按下标猜），单图标段与非唯一 owner 一律不动。
 */
import {
  buildIsoSectionIconMap,
  extractIconResource,
  collectIsomorphicSectionGroups,
} from './isomorphic-section-group.js';
import { rewriteOneRepeatGroup, isImportableResourcePath } from './index-repeat-group-rewrite.js';
import {
  collectSectionItemIcons,
  bindSectionItemIcons,
  bindItemIconsInFile,
  resourceImportPathForFile,
} from './section-item-icon-bind.js';

// ── 真机同形 fixture（节选自 resource-dom-mapping.json） ──
const MAPPING = [
  { figmaNodeId: '38:3135', resourceFile: null, ownerSectionId: '38:3134', previewAnalysisRole: 'bg', skipMount: true, assignedVarName: null },
  { figmaNodeId: '38:3136', resourceFile: '../resources/images/header-3136.png', ownerSectionId: '38:3134', previewAnalysisRole: 'icon', isTinyDecoration: true, assignedVarName: 'icon1' },
  { figmaNodeId: '38:3160', resourceFile: '../resources/images/icon-战略厂商-3160.png', ownerSectionId: '38:3137', previewAnalysisRole: 'icon', assignedVarName: 'icon4' },
  { figmaNodeId: '38:3164', resourceFile: '../resources/images/icon-优质厂商-3164.png', ownerSectionId: '38:3162', previewAnalysisRole: 'icon', assignedVarName: 'icon5' },
  { figmaNodeId: '38:3208', resourceFile: '../resources/images/icon-普通厂商-3208.png', ownerSectionId: '38:3206', previewAnalysisRole: 'icon', assignedVarName: 'icon6' },
  { figmaNodeId: '187:262', resourceFile: '../resources/images/icon-262.png', ownerSectionId: '38:3260', previewAnalysisRole: 'icon', assignedVarName: 'icon2' },
  { figmaNodeId: '187:263', resourceFile: '../resources/images/icon-263.png', ownerSectionId: '38:3282', previewAnalysisRole: 'icon', assignedVarName: 'icon3' },
];

const statsSection = {
  id: '38:3260',
  body: {
    items: [
      {
        id: '38:3260',
        name: '合作厂商',
        icon: { figmaNode: '187:262', resource: '../resources/images/icon-262.png' },
        content: { elements: [{ type: 'value', text: '33' }, { type: 'label', text: '合作厂商' }] },
      },
      {
        id: '38:3282',
        name: '在线设备',
        icon: { figmaNode: '187:263', resource: '../resources/images/icon-263.png' },
        content: { elements: [{ type: 'value', text: '66' }, { type: 'label', text: '在线设备' }] },
      },
    ],
  },
};

describe('A. buildIsoSectionIconMap：按归属段取段头 icon', () => {
  it('三段 icon 各归其段，且跳过 bg / 装饰碎图', () => {
    const m = buildIsoSectionIconMap(MAPPING);
    expect(m.get('38:3137').resource).toBe('../resources/images/icon-战略厂商-3160.png');
    expect(m.get('38:3162').resource).toBe('../resources/images/icon-优质厂商-3164.png');
    expect(m.get('38:3206').resource).toBe('../resources/images/icon-普通厂商-3208.png');
    // 同一 owner 有多条时取首条（icon-262 先于 icon-263 登记，分属不同 owner）
    expect(m.get('38:3260').resource).toBe('../resources/images/icon-262.png');
    // tiny 装饰图不进（header-3136 与根 bg 同 owner）
    expect(m.get('38:3134')).toBeUndefined();
    // 变量名与 buildVarToMapping 同源
    expect(m.get('38:3137').varName).toBe('icon4');
  });

  it('阴性：非 icon 角色（无 usage 也无 role=icon）不入表', () => {
    const m = buildIsoSectionIconMap([
      { figmaNodeId: 'x:1', resourceFile: '../resources/images/plain.png', ownerSectionId: 'x:9', previewAnalysisRole: 'img', usage: 'background-image' },
    ]);
    expect(m.has('x:9')).toBe(false);
  });

  it('阴性：skipMount 的真值资源不入表（只当背景用）', () => {
    const m = buildIsoSectionIconMap([
      { figmaNodeId: 'y:1', resourceFile: '../resources/images/bg.png', ownerSectionId: 'y:9', previewAnalysisRole: 'icon', skipMount: true },
    ]);
    expect(m.has('y:9')).toBe(false);
  });
});

describe('B. extractIconResource：归属段兜底（header 优先不变）', () => {
  it('header.controls 为空 ⇒ 按 ownerSectionId 取到真值图标（改前恒空）', () => {
    const sec = { id: '38:3137', header: { title: '战略合作厂商', controls: [] }, body: { items: [] } };
    const sectionIconByOwner = buildIsoSectionIconMap(MAPPING);
    expect(extractIconResource(sec)).toBe(''); // 无兜底表 ⇒ 与改前一致
    expect(extractIconResource(sec, { sectionIconByOwner })).toBe(
      '../resources/images/icon-战略厂商-3160.png',
    );
  });

  it('header 声明口优先于归属口（旧口径不回退）', () => {
    const sec = {
      id: '38:3137',
      header: { title: 'x', controls: [{ type: 'icon', resourceFile: '../resources/images/header-declared.png' }] },
      body: { items: [] },
    };
    expect(extractIconResource(sec, { sectionIconByOwner: buildIsoSectionIconMap(MAPPING) })).toBe(
      '../resources/images/header-declared.png',
    );
  });

  it('collect：三段 member 都带 icon（这正是 E2-v3 缺的那一份）', () => {
    const secs = ['38:3137', '38:3162', '38:3206'].map((id) => ({
      id,
      header: { title: `段${id}`, controls: [] },
      body: { layout: 'horizontal', gridColumns: 4, children: [{ type: 'text', text: '华为技术' }, { type: 'text', text: '8台' }] },
    }));
    const res = collectIsomorphicSectionGroups(secs, {
      flattenOneLevel: true,
      minMembers: 2,
      sectionIconByOwner: buildIsoSectionIconMap(MAPPING),
    });
    expect(res.groups).toHaveLength(1);
    expect(res.groups[0].members.map((m) => m.icon)).toEqual([
      '../resources/images/icon-战略厂商-3160.png',
      '../resources/images/icon-优质厂商-3164.png',
      '../resources/images/icon-普通厂商-3208.png',
    ]);
    expect(res.groups[0].members.map((m) => m.iconVar)).toEqual(['icon4', 'icon5', 'icon6']);
  });
});

describe('C. index 改写：成员 icon 落成 import 变量', () => {
  const INDEX = `<template>
  <div>
    <ContentSection data-section-id="38:3137" style="flex:0.2;" />
    <ContentSection3 data-section-id="38:3162" style="flex:0.3;" />
    <ContentSection4 data-section-id="38:3206" style="flex:0.5;" />
  </div>
</template>

<script setup>
import ContentSection from './components/ContentSection.vue'
import ContentSection3 from './components/ContentSection3.vue'
import ContentSection4 from './components/ContentSection4.vue'
</script>`;

  const plan = (icons: Array<[string, string, string]>) => ({
    repName: 'ContentSection',
    members: icons.map(([id, icon, compName], i) => ({
      id,
      title: `段${i + 1}`,
      icon,
      items: [{ name: 'A', value: '1台' }],
      compName,
      style: ['flex:0.2;', 'flex:0.3;', 'flex:0.5;'][i],
    })),
  });

  const ICONS: Array<[string, string, string]> = [
    ['38:3137', '../resources/images/icon-战略厂商-3160.png', 'ContentSection'],
    ['38:3162', '../resources/images/icon-优质厂商-3164.png', 'ContentSection3'],
    ['38:3206', '../resources/images/icon-普通厂商-3208.png', 'ContentSection4'],
  ];

  it('三个 icon 都注入 import、常量用裸标识符、模板下发 :icon', () => {
    const out = rewriteOneRepeatGroup(INDEX, plan(ICONS));
    expect(out.ok).toBe(true);
    expect(out.iconImports).toBe(3);
    expect(out.content).toContain("import isoIcon1 from '../resources/images/icon-战略厂商-3160.png'");
    expect(out.content).toContain("import isoIcon2 from '../resources/images/icon-优质厂商-3164.png'");
    expect(out.content).toContain("import isoIcon3 from '../resources/images/icon-普通厂商-3208.png'");
    expect(out.content).toContain(':icon="isoItem.icon"');
    // 常量里必须是裸标识符，不能是字符串路径（否则运行时 undefined）
    expect(out.content).toContain('icon: isoIcon1');
    expect(out.content).not.toContain('icon: "../resources/images/icon-战略厂商-3160.png"');
  });

  it('成员自带 iconVar（assignedVarName）时优先复用它，不自造 isoIconN', () => {
    const p = plan(ICONS);
    p.members = p.members.map((m, i) => ({ ...m, iconVar: ['icon4', 'icon5', 'icon6'][i] }));
    const out = rewriteOneRepeatGroup(INDEX, p);
    expect(out.ok).toBe(true);
    expect(out.content).toContain("import icon4 from '../resources/images/icon-战略厂商-3160.png'");
    expect(out.content).toContain('icon: icon4');
    expect(out.content).not.toContain('isoIcon1');
  });

  it('阴性：成员全是空 icon ⇒ 不下发 :icon、不注入 import（旧形态逐字节不变）', () => {
    const p = plan([
      ['38:3137', '', 'ContentSection'],
      ['38:3162', '', 'ContentSection3'],
      ['38:3206', '', 'ContentSection4'],
    ]);
    const out = rewriteOneRepeatGroup(INDEX, p);
    expect(out.ok).toBe(true);
    expect(out.iconImports).toBe(0);
    expect(out.content).not.toContain(':icon=');
    expect(out.content).not.toContain('import isoIcon');
    expect(out.content).toContain('icon: ""');
  });

  it('阴性：http/data URI 不转 import（原样字符串保留）', () => {
    expect(isImportableResourcePath('https://cdn.example.com/a.png')).toBe(false);
    expect(isImportableResourcePath('data:image/png;base64,AAA')).toBe(false);
    expect(isImportableResourcePath('../resources/images/a.png')).toBe(true);
    const p = plan([
      ['38:3137', 'https://cdn.example.com/a.png', 'ContentSection'],
      ['38:3162', '../resources/images/b.png', 'ContentSection3'],
      ['38:3206', '../resources/images/c.png', 'ContentSection4'],
    ]);
    const out = rewriteOneRepeatGroup(INDEX, p);
    expect(out.ok).toBe(true);
    expect(out.content).toContain('icon: "https://cdn.example.com/a.png"');
  });
});

describe('D. items 级图标补位：label 文本锚定', () => {
  const STATS_FILE = `<template>
  <div class="s" data-section-id="38:3260">
    <div v-for="item in statItems" :key="item.label">
      <img :src="item.icon" v-if="item.icon" />
      <div>{{ item.value }}</div>
      <div>{{ item.label }}</div>
    </div>
  </div>
</template>

<script setup>
import icon2 from '../../resources/images/icon-262.png'
import { computed } from 'vue'
const statItems = computed(() => [
  { label: '合作厂商', value: '33', icon: icon2, order: 0 },
  { label: '在线设备', value: '66', icon: icon2, order: 1 }
])
</script>`;

  it('collectSectionItemIcons：两项图标各带真值资源与系统变量名', () => {
    const got = collectSectionItemIcons(statsSection, MAPPING);
    expect(got).toEqual([
      { labelText: '合作厂商', resource: '../resources/images/icon-262.png', figmaNode: '187:262', varName: 'icon2' },
      { labelText: '在线设备', resource: '../resources/images/icon-263.png', figmaNode: '187:263', varName: 'icon3' },
    ]);
  });

  it('按「在线设备」label 锚定换掉错图，并补 import；合作厂商那项不动', () => {
    const res = bindItemIconsInFile(STATS_FILE, collectSectionItemIcons(statsSection, MAPPING), 'package/components/StatsSection.vue');
    expect(res.changes).toEqual([{ label: '在线设备', from: 'icon2', to: 'icon3' }]);
    expect(res.content).toContain("import icon3 from '../../resources/images/icon-263.png'");
    expect(res.content).toContain("{ label: '合作厂商', value: '33', icon: icon2, order: 0 }");
    expect(res.content).toContain("{ label: '在线设备', value: '66', icon: icon3, order: 1 }");
  });

  it('幂等：已是正确变量 ⇒ 零改动、不重复 import', () => {
    const once = bindItemIconsInFile(STATS_FILE, collectSectionItemIcons(statsSection, MAPPING), 'package/components/StatsSection.vue');
    const twice = bindItemIconsInFile(once.content, collectSectionItemIcons(statsSection, MAPPING), 'package/components/StatsSection.vue');
    expect(twice.changes).toHaveLength(0);
    expect(twice.content).toBe(once.content);
    expect((twice.content.match(/import icon3/g) || []).length).toBe(1);
  });

  it('阴性：段内只有一个图标 ⇒ 整段跳过（正常链路处理）', () => {
    const single = { id: 's:1', body: { items: [{ id: 's:1', name: 'x', icon: { resource: '../resources/images/a.png' }, content: { elements: [{ type: 'label', text: 'x' }] } }] } };
    const files = { 'package/components/A.vue': '<template><div data-section-id="s:1"/></template>' };
    const r = bindSectionItemIcons(files, [single], MAPPING);
    expect(r.applied).toHaveLength(0);
    expect(files['package/components/A.vue']).toContain('data-section-id="s:1"');
  });

  it('阴性：data-section-id 命中多个文件（归属不明）⇒ 不猜、不改', () => {
    const files = {
      'package/components/A.vue': '<template><div data-section-id="38:3260"/></template>',
      'package/components/B.vue': '<template><div data-section-id="38:3260"/></template>',
    };
    const r = bindSectionItemIcons(files, [statsSection], MAPPING);
    expect(r.applied).toHaveLength(0);
    expect(r.skipped[0].reason).toBe('owner-files=2');
  });

  it('路径换算：components/ 下的文件要多退一级', () => {
    expect(resourceImportPathForFile('package/components/S.vue', '../resources/images/a.png')).toBe('../../resources/images/a.png');
    expect(resourceImportPathForFile('package/index.vue', '../resources/images/a.png')).toBe('../resources/images/a.png');
  });
});
