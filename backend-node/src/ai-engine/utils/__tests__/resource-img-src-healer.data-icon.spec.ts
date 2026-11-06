/**
 * C 类：v-for 数据对象空图字段 spec（2026-11-06 · mc-max-1793899537377-9a3c56bb 实锤）
 *
 * 病灶：`StatsSection.vue` 的 `statList` 是
 *     `[{ label:'合作厂商', value:'33', icon: `` }, { label:'在线设备', value:'66', icon: `` }]`
 * 而 mapping 里 `icon2`(187:262) / `icon3`(187:263) 已分配、文件已落盘 —— 产物却 `icon: ''`。
 * A/B 类救不了：模板有 `:src="item.icon"` ⇒ `hasSrc=true` 跳过 A 类；
 * 成员访问不是标识符 ⇒ `simpleBindingName` 返空、跳过 B 类；
 * `healEmptyImgSrc` 还有 `candidates.length !== 1` 硬闸 ⇒ 本 section 有 2 个资源 ⇒ 判歧义放弃。
 */

import {
  healEmptyDataIconFields,
  memberBindingOf,
  findArrayLiteral,
  splitTopLevelObjects,
  emptyFieldSpan,
  ancestorSig,
  sameVisualRow,
} from '../resource-img-src-healer';

const MAP_2ICONS = [
  { figmaNodeId: '187:262', resourceFile: '../resources/images/icon-262.png', ownerSectionId: '38:3260', assignedVarName: 'icon2', figmaBox: { x: 26920, y: 51496 } },
  { figmaNodeId: '187:263', resourceFile: '../resources/images/icon-263.png', ownerSectionId: '38:3260', assignedVarName: 'icon3', figmaBox: { x: 27249, y: 51496 } },
];

/** 复刻真机 StatsSection.vue 的关键形态 */
const SFC = `<template>
  <div class="stats" data-section-id="38:3260">
    <div v-for="item in statList" :key="item.label" class="card">
      <img :src="item.icon" class="icon" alt="" />
      <span>{{ item.label }}</span>
    </div>
  </div>
</template>

<script setup>
const statList = [
  { label: '合作厂商', value: '33', icon: \`\` },
  { label: '在线设备', value: '66', icon: \`\` }
]
</script>
`;

describe('memberBindingOf', () => {
  it('识别两级成员绑定', () => {
    expect(memberBindingOf('<img :src="item.icon">')).toEqual({ obj: 'item', field: 'icon' });
    expect(memberBindingOf('<img v-bind:src="cfg.img">')).toEqual({ obj: 'cfg', field: 'img' });
  });
  it('标识符 / 字面量 / 更深表达式一律不认（交回 A/B 类或不动）', () => {
    expect(memberBindingOf('<img :src="icon4">')).toBeNull();
    expect(memberBindingOf('<img src="../a.png">')).toBeNull();
    expect(memberBindingOf('<img :src="a.b.c">')).toBeNull();
    expect(memberBindingOf('<img :src="fn(x)">')).toBeNull();
  });
});

describe('findArrayLiteral / splitTopLevelObjects', () => {
  it('定位数组并切出顶层对象（字符串里的花括号不干扰）', () => {
    const code = `const list = [{ a: '}' }, { a: '{' }]`;
    const arr = findArrayLiteral(code, 'list')!;
    expect(arr).not.toBeNull();
    const objs = splitTopLevelObjects(code, arr.bodyStart, arr.bodyEnd);
    expect(objs).toHaveLength(2);
    expect(code.slice(objs[0].start, objs[0].end)).toBe(`{ a: '}' }`);
  });

  it('数组不存在 ⇒ null', () => {
    expect(findArrayLiteral('const x = 1', 'list')).toBeNull();
  });
});

describe('emptyFieldSpan', () => {
  it('三种空串写法都识别', () => {
    for (const q of [`''`, `""`, '``']) {
      const code = `{ icon: ${q} }`;
      expect(emptyFieldSpan(code, 0, code.length, 'icon')).not.toBeNull();
    }
  });
  it('非空字段不识别（不得复写别人的绑定）', () => {
    const code = `{ icon: icon2 }`;
    expect(emptyFieldSpan(code, 0, code.length, 'icon')).toBeNull();
  });
});

describe('healEmptyDataIconFields', () => {
  it('阳性（真机复刻）：2 个空字段 × 2 个候选 ⇒ 按 x 顺序 zip 成 icon2 / icon3 并补 import', () => {
    const r = healEmptyDataIconFields(SFC, MAP_2ICONS, '../../resources/images/');
    expect(r.changed).toBe(true);
    // 左（x=26920 → 187:262 → icon2）在前，右（x=27249 → 187:263 → icon3）在后
    expect(r.code).toContain(`{ label: '合作厂商', value: '33', icon: icon2 }`);
    expect(r.code).toContain(`{ label: '在线设备', value: '66', icon: icon3 }`);
    expect(r.code).toContain(`import icon2 from '../../resources/images/icon-262.png'`);
    expect(r.code).toContain(`import icon3 from '../../resources/images/icon-263.png'`);
    expect(r.healed[0].pairs.map((p: any) => p.figmaNodeId)).toEqual(['187:262', '187:263']);
  });

  it('顺序由 figmaBox.x 决定，不信任 mapping 数组顺序（反序输入仍配正确）', () => {
    const reversed = [MAP_2ICONS[1], MAP_2ICONS[0]];
    const r = healEmptyDataIconFields(SFC, reversed, '../../resources/images/');
    expect(r.code).toContain(`icon: icon2 }`);
    expect(r.healed[0].pairs.map((p: any) => p.figmaNodeId)).toEqual(['187:262', '187:263']);
  });

  it('阴性：空字段数与候选数不等 ⇒ 一律不动（数量不等即有歧义）', () => {
    const oneEmpty = SFC.replace(`icon: \`\``, `icon: icon9`);
    const r = healEmptyDataIconFields(oneEmpty, MAP_2ICONS, '../../resources/images/');
    expect(r.changed).toBe(false);
    expect(r.skipped.some((s: any) => s.reason === 'count-mismatch')).toBe(true);
  });

  it('阴性：候选只有 1 个 ⇒ 让位给 A/B 类（不抢同一处改动）', () => {
    const r = healEmptyDataIconFields(SFC, [MAP_2ICONS[0]], '../../resources/images/');
    expect(r.changed).toBe(false);
    expect(r.skipped.some((s: any) => s.reason === 'single-resource-defer-ab')).toBe(true);
  });

  it('阴性：候选变量名缺失或重复 ⇒ 不动', () => {
    const dup = MAP_2ICONS.map((m) => ({ ...m, assignedVarName: 'icon2' }));
    const r = healEmptyDataIconFields(SFC, dup, '../../resources/images/');
    expect(r.changed).toBe(false);
    expect(r.skipped.some((s: any) => s.reason === 'var-name-missing-or-duplicate')).toBe(true);
  });

  it('阴性：section 歧义（多个 data-section-id）⇒ 不动', () => {
    const amb = SFC.replace('data-section-id="38:3260"', 'data-section-id="38:3260" data-section-id="38:3261"');
    const r = healEmptyDataIconFields(amb, MAP_2ICONS, '../../resources/images/');
    expect(r.changed).toBe(false);
    expect(r.skipped[0].reason).toBe('ambiguous-section');
  });

  it('opts.ownerSectionId：模板无 data-section-id 时按装配层归属兜底', () => {
    const noSection = SFC.replace(' data-section-id="38:3260"', '');
    expect(healEmptyDataIconFields(noSection, MAP_2ICONS, '../../resources/images/').changed).toBe(false);
    const r = healEmptyDataIconFields(noSection, MAP_2ICONS, '../../resources/images/', { ownerSectionId: '38:3260' });
    expect(r.changed).toBe(true);
  });

  it('幂等：第二次运行原样返回', () => {
    const once = healEmptyDataIconFields(SFC, MAP_2ICONS, '../../resources/images/');
    const twice = healEmptyDataIconFields(once.code, MAP_2ICONS, '../../resources/images/');
    expect(twice.changed).toBe(false);
    expect(twice.code).toBe(once.code);
  });

  it('无成员绑定（普通 :src="iconX"）⇒ 提前退出，不干扰 A/B 类', () => {
    const plain = SFC.replace(':src="item.icon"', ':src="icon4"');
    const r = healEmptyDataIconFields(plain, MAP_2ICONS, '../../resources/images/');
    expect(r.changed).toBe(false);
  });
});

/**
 * 兄弟段合并（真机 c-a3c56-9a3c56bb 原样数据）：
 * Figma 里是 **N 个同构兄弟段**，LLM 合成一个 `v-for`，DOM 只留首个段的 id。
 * `187:262`∈`38:3260`、`187:263`∈`38:3282` —— 两段同父 `796:3`、同排 `parentBox.y=51483`。
 * 只认本段 ⇒ 永远只见 1 个候选 ⇒ `single-resource-defer-ab` ⇒ 真机依然破图。
 */
const ROW = { y: 51496, width: 53, height: 55.44972610473633 };
const rowParent = (x: number) => ({ x, y: 51483, width: 265, height: 76 });

const MAP_REAL = [
  {
    figmaNodeId: '187:262',
    resourceFile: '../resources/images/icon-262.png',
    ownerSectionId: '38:3260',
    ancestorIds: ['38:3260', '796:3', '38:3134'],
    assignedVarName: 'icon2',
    figmaBox: { x: 26920, ...ROW },
    parentBox: rowParent(26900),
  },
  {
    figmaNodeId: '187:263',
    resourceFile: '../resources/images/icon-263.png',
    ownerSectionId: '38:3282',
    ancestorIds: ['38:3282', '796:3', '38:3134'],
    assignedVarName: 'icon3',
    figmaBox: { x: 27249, ...ROW },
    parentBox: rowParent(27229),
  },
  // 同父但**不同排**的三段（真机 38:3137 / 38:3162 / 38:3206 各占一行）——绝不可被并进来
  {
    figmaNodeId: '38:3160',
    resourceFile: '../resources/images/icon-战略厂商-3160.png',
    ownerSectionId: '38:3137',
    ancestorIds: ['38:3137', '796:3', '38:3134'],
    assignedVarName: 'icon4',
    figmaBox: { x: 26914, y: 51592, width: 16, height: 16 },
    parentBox: { x: 26894, y: 51592, width: 604, height: 161 },
  },
  {
    figmaNodeId: '38:3164',
    resourceFile: '../resources/images/icon-优质厂商-3164.png',
    ownerSectionId: '38:3162',
    ancestorIds: ['38:3162', '796:3', '38:3134'],
    assignedVarName: 'icon5',
    figmaBox: { x: 26914, y: 51773, width: 16, height: 16 },
    parentBox: { x: 26894, y: 51773, width: 604, height: 161 },
  },
  {
    figmaNodeId: '38:3208',
    resourceFile: '../resources/images/icon-普通厂商-3208.png',
    ownerSectionId: '38:3206',
    ancestorIds: ['38:3206', '796:3', '38:3134'],
    assignedVarName: 'icon6',
    figmaBox: { x: 26914, y: 52005, width: 16, height: 16 },
    parentBox: { x: 26894, y: 52005, width: 604, height: 161 },
  },
];

describe('resolveSiblingCandidates · 兄弟段合并', () => {
  it('ancestorSig：`[self, 父, 祖父…]` 去首项；首项 ≠ owner 或长度 <2 ⇒ 空', () => {
    expect(ancestorSig(MAP_REAL[0])).toBe('796:3/38:3134');
    expect(ancestorSig({ ownerSectionId: 'a', ancestorIds: ['a'] })).toBe('');
    expect(ancestorSig({ ownerSectionId: 'b', ancestorIds: ['a', 'x'] })).toBe('');
    expect(ancestorSig({})).toBe('');
  });

  it('sameVisualRow：y/height 1px 容差内为同排；缺 parentBox 判否', () => {
    expect(sameVisualRow(MAP_REAL[0], MAP_REAL[1])).toBe(true);
    expect(sameVisualRow(MAP_REAL[0], MAP_REAL[2])).toBe(false);
    expect(sameVisualRow({}, MAP_REAL[0])).toBe(false);
    expect(
      sameVisualRow(
        { parentBox: { y: 10, height: 20 } },
        { parentBox: { y: 10.6, height: 20.4 } },
      ),
    ).toBe(true);
  });

  it('阳性（真机原样）：本段仅 1 候选 + 同父同排兄弟 1 个 ⇒ 补齐成 2 并正确配对', () => {
    const r = healEmptyDataIconFields(SFC, MAP_REAL, '../../resources/images/');
    expect(r.changed).toBe(true);
    expect(r.code).toContain(`{ label: '合作厂商', value: '33', icon: icon2 }`);
    expect(r.code).toContain(`{ label: '在线设备', value: '66', icon: icon3 }`);
    expect(r.healed[0].pairs.map((p: any) => p.figmaNodeId)).toEqual(['187:262', '187:263']);
    // 不同排的三段一个都不许进来
    expect(r.healed[0].pairs.some((p: any) => ['38:3160', '38:3164', '38:3208'].includes(p.figmaNodeId))).toBe(
      false,
    );
    expect(r.code).not.toContain('icon4');
  });

  it('阴性：同父但不同排（38:3137/3162/3206）⇒ 不并入，退回让位 A/B', () => {
    const noSibling = MAP_REAL.filter((m) => m.figmaNodeId !== '187:263');
    const r = healEmptyDataIconFields(SFC, noSibling, '../../resources/images/');
    expect(r.changed).toBe(false);
    expect(r.skipped.some((s: any) => s.reason === 'single-resource-defer-ab')).toBe(true);
  });

  it('阴性：补齐后总数 ≠ 空字段数（同排 3 个 / 空 2 个）⇒ 不扩，一律不动', () => {
    const third = {
      figmaNodeId: '187:264',
      resourceFile: '../resources/images/icon-264.png',
      ownerSectionId: '38:3299',
      ancestorIds: ['38:3299', '796:3', '38:3134'],
      assignedVarName: 'icon7',
      figmaBox: { x: 27560, ...ROW },
      parentBox: rowParent(27540),
    };
    const r = healEmptyDataIconFields(SFC, [...MAP_REAL, third], '../../resources/images/');
    expect(r.changed).toBe(false);
    expect(r.skipped.some((s: any) => s.reason === 'single-resource-defer-ab')).toBe(true);
  });

  it('阴性：兄弟候选缺 parentBox ⇒ 无法证明同排，不并入', () => {
    const { parentBox, ...noBox } = MAP_REAL[1] as any;
    const r = healEmptyDataIconFields(
      SFC,
      [MAP_REAL[0], noBox],
      '../../resources/images/',
    );
    expect(r.changed).toBe(false);
    expect(parentBox).toBeTruthy();
  });

  it('阴性：figmaBox.x 重复 ⇒ 无法定序，不并入', () => {
    const sameX = { ...MAP_REAL[1], figmaBox: { ...MAP_REAL[1].figmaBox, x: 26920 } };
    const r = healEmptyDataIconFields(SFC, [MAP_REAL[0], sameX], '../../resources/images/');
    expect(r.changed).toBe(false);
  });
});
