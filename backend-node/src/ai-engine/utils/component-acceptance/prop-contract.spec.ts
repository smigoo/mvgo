/**
 * 🛡️ G2 props 契约断链判据 spec（2026-11-12 · mc-max-1794412559305-c97b7008 实锤）
 *
 * 真机形态：分块生成跨 chunk 接线不一致——MainSection 传 :attribute-list / :device-img，
 * 子组件 defineProps 声明 tableRows / imgSrc ⇒ 交集空 ⇒ 运行时字段表 0 行、图片 v-if
 * 不渲染；既有源码静态文本判据（文本在常量里存在即命中）FAIL=0 放行。
 * 夹具逐字段取自 c97b7008 真实产物（MainSection/DeviceInfoGroup/DeviceHeaderGroup）。
 */
import {
  runAcceptanceChecks,
  formatAcceptanceGuidance,
  extractDefinePropsKeys,
  collectComponentPropEdges,
} from './index.js';

// ── c97b7008 真实产物形态夹具（断链版） ──────────────────────────────
const MAIN_SECTION_BROKEN = `<template>
  <div class="c-device-main-section" data-section-id="801:3">
    <DeviceHeaderGroup :device-name="deviceName" :device-type="deviceType" :device-code="deviceCode" :device-img="img1" />
    <DeviceInfoGroup :attribute-list="attributeList" />
    <DeviceDescGroup :description="productDescription" />
  </div>
</template>
<script setup>
import img1 from '../../resources/images/img-1725.png'
import DeviceHeaderGroup from './DeviceHeaderGroup.vue'
import DeviceInfoGroup from './DeviceInfoGroup.vue'
import DeviceDescGroup from './DeviceDescGroup.vue'
const attributeList = [{ label: '所属产品', value: '爆闪灯' }, { label: '设备IP', value: '192.168.245.123' }]
</script>`;

const DEVICE_INFO_GROUP_BROKEN = `<template>
  <div class="c-device-info-group">
    <span>GD-Robot-04</span>
    <div class="c-device-table-grid">
      <div v-for="(row, index) in tableRows" :key="index">
        <span>{{ row.label }}</span><span>{{ row.value }}</span>
      </div>
    </div>
  </div>
</template>
<script setup>
defineProps({
  tableRows: {
    type: Array,
    default: () => []
  }
})
</script>`;

const DEVICE_HEADER_GROUP_BROKEN = `<template>
  <div class="c-device-header-group">
    <img :src="imgSrc" v-if="imgSrc" />
  </div>
</template>
<script setup>
defineProps({ imgSrc: { type: String, default: '' } })
</script>`;

const DEVICE_DESC_GROUP_OK = `<template>
  <div class="c-device-desc-group"><p>描述</p></div>
</template>
<script setup>
</script>`;

const FILES_BROKEN = {
  'package/components/MainSection.vue': MAIN_SECTION_BROKEN,
  'package/components/DeviceInfoGroup.vue': DEVICE_INFO_GROUP_BROKEN,
  'package/components/DeviceHeaderGroup.vue': DEVICE_HEADER_GROUP_BROKEN,
  'package/components/DeviceDescGroup.vue': DEVICE_DESC_GROUP_OK,
};

describe('G2 · 纯函数判据', () => {
  it('extractDefinePropsKeys：对象形态（嵌套 default 工厂）只取顶层键', () => {
    expect([...extractDefinePropsKeys(DEVICE_INFO_GROUP_BROKEN)]).toEqual(['tableRows']);
    expect([...extractDefinePropsKeys(DEVICE_HEADER_GROUP_BROKEN)]).toEqual(['imgSrc']);
  });

  it('extractDefinePropsKeys：数组形态 / 无 defineProps ⇒ 空集合', () => {
    expect([...extractDefinePropsKeys("defineProps(['a', 'bCd'])")]).toEqual(['a', 'bCd']);
    expect(extractDefinePropsKeys(DEVICE_DESC_GROUP_OK).size).toBe(0);
    expect(extractDefinePropsKeys('')).toEqual(new Set());
  });

  it('collectComponentPropEdges：断链边被收集且 kebab→camel 归一', () => {
    const edges = collectComponentPropEdges(FILES_BROKEN);
    const byChild = new Map(edges.map((e) => [e.child.split('/').pop(), e]));
    const info = byChild.get('DeviceInfoGroup.vue');
    expect(info).toBeDefined();
    expect(info.passed).toEqual(['attributeList']);
    expect(info.declared).toEqual(['tableRows']);
    const header = byChild.get('DeviceHeaderGroup.vue');
    expect(header.passed).toContain('deviceImg'); // :device-img 归一
    expect(header.passed).toContain('deviceName');
    expect(header.declared).toEqual(['imgSrc']);
  });

  it('阴性：$attrs 透传形态（子无 defineProps）不判', () => {
    const files = {
      'package/components/Parent.vue': `<template><ChildA :foo-bar="x" /></template>
<script setup>
import ChildA from './ChildA.vue'
</script>`,
      'package/components/ChildA.vue': '<template><div v-bind="$attrs">{{ $attrs.fooBar }}</div></template>',
    };
    expect(collectComponentPropEdges(files)).toEqual([]);
  });

  it('阴性：正常接线（交集非空）不报', () => {
    const files = {
      'package/components/Parent.vue': `<template><ChildA :table-rows="rows" :extra="x" /></template>
<script setup>
import ChildA from './ChildA.vue'
</script>`,
      'package/components/ChildA.vue': `<template><div>{{ tableRows }}</div></template>
<script setup>
defineProps({ tableRows: { type: Array, default: () => [] } })
</script>`,
    };
    expect(collectComponentPropEdges(files)).toEqual([]);
  });
});

describe('G2 · runAcceptanceChecks 集成', () => {
  it('⭐ 阳性：c97b7008 断链形态 ⇒ G2 FAIL 且 files 双端定位', () => {
    const r = runAcceptanceChecks({ files: FILES_BROKEN });
    const g2 = r.fails.filter((f) => f.code === 'G2');
    expect(g2.length).toBeGreaterThanOrEqual(2); // DeviceInfoGroup + DeviceHeaderGroup
    for (const f of g2) {
      expect(Array.isArray(f.files)).toBe(true);
      expect(f.files).toContain('package/components/MainSection.vue');
    }
    const info = g2.find((f) => f.files.includes('package/components/DeviceInfoGroup.vue'));
    expect(info.detail).toContain('attributeList');
    expect(info.detail).toContain('tableRows');
  });

  it('⭐ guidance 含 G2 修复模板（两种对齐形态）', () => {
    const g = formatAcceptanceGuidance([{ code: 'G2', files: ['a.vue', 'b.vue'], detail: '断链' }]);
    expect(g).toContain('G2 props 契约修复模板');
    expect(g).toContain(':table-rows ⇔ tableRows');
  });

  it('阴性：无断链产物不产生 G2 FAIL', () => {
    const files = {
      'package/components/Parent.vue': `<template><div><ChildA :table-rows="rows" /></div></template>
<script setup>
import ChildA from './ChildA.vue'
const rows = []
</script>`,
      'package/components/ChildA.vue': `<template><div>{{ tableRows.length }}</div></template>
<script setup>
defineProps({ tableRows: { type: Array, default: () => [] } })
</script>`,
    };
    const r = runAcceptanceChecks({ files });
    expect(r.fails.some((f) => f.code === 'G2')).toBe(false);
  });
});
