/**
 * 🧬 P1-2 契约：同构段条目「名称 / 数值」确定性拆分 + 伪条目过滤（2026-11-12 · 8b15a757 实锤）。
 *
 * 真机病灶（mc-1794449448272-8b15a757 三厂商段）：
 *   ① 真值条目 `{type:'partner-card', name:'华为技术', text:'华为技术 8台'}`——
 *      isoEntryValue 只认 value/count/num ⇒ 全 '' ⇒ C1b 12 条真值标签缺席；
 *   ② 条目轨末尾混入 `{"type":"icon","name":"战略合作厂商图标","resourceFile":...}`
 *      ⇒ 落盘 items 末尾出现 `{"name":"","value":""}` 空条目。
 *
 * 判据（与 splitTitleValueByStyle 同纪律：真值驱动、命名无关、fail-open 不臆造）：
 *   · text 以 name 为前缀 + 尾段「数字+单位」⇒ 确定性拆分；
 *   · 显式 value/count/num 优先，text 拆分不覆盖；
 *   · icon/媒体/资源伪条目不进 items 数据。
 */
import {
  splitIsoEntryNameValue,
  filterIsoPseudoEntries,
  collectIsomorphicSectionGroups,
} from './isomorphic-section-group.js';

/** 8b15a757 真机同形三厂商段 fixture（children=分组容器包 partner-card + 末尾 icon） */
function partnerSection(id, title, rows) {
  const cards = rows.map(([name, val]) => ({
    type: 'partner-card',
    name,
    text: `${name} ${val}`,
    repeatedFill: '#ffffff',
  }));
  const per = 4;
  const children = [];
  for (let i = 0; i < cards.length; i += per) {
    children.push({
      id: `${id}-row${i}`,
      name: `厂商卡片组第${i / per + 1}行`,
      role: 'row',
      layout: 'horizontal-4-items',
      children: cards.slice(i, i + per),
    });
  }
  children.push({
    type: 'icon',
    name: `${title}图标`,
    figmaNode: `${id}-icon`,
    resourceFile: '../resources/images/icon-x.png',
    resourceVarName: 'iconX',
  });
  return {
    id,
    title,
    header: { title, controls: [] },
    body: { layout: 'grid', gridColumns: 4, children },
  };
}

const ZHANLUE = partnerSection('38:3137', '战略合作厂商', [
  ['华为技术', '8台'], ['中兴通讯', '8台'], ['海康威视', '13台'],
  ['新华三集团', '1台'], ['浪潮信息', '0台'], ['天地伟业', '0台'],
]);
const YOUZHI = partnerSection('38:3162', '优质厂商', [
  ['大华股份', '8台'], ['宇视科技', '7台'], ['西门子', '4台'],
  ['施耐德电气', '3台'], ['ABB中国', '0台'], ['中科曙光', '0台'],
]);
const PUTONG = partnerSection('38:3206', '普通厂商', [
  ['特来电', '5台'], ['金溢科技', '2台'], ['汉威科技', '6台'],
  ['烽火通信', '1台'], ['锐捷网络', '9台'], ['迈普通信', '4台'],
]);

describe('P1-2 · splitIsoEntryNameValue（text 尾段确定性拆分）', () => {
  it('阳性：华为技术 8台 ⇒ {name:"华为技术", value:"8台"}', () => {
    expect(splitIsoEntryNameValue({ type: 'partner-card', name: '华为技术', text: '华为技术 8台' }))
      .toEqual({ name: '华为技术', value: '8台' });
  });

  it('小数与无单位：{name:"占比", text:"占比 12.5%"} ⇒ value:"12.5%"', () => {
    expect(splitIsoEntryNameValue({ name: '占比', text: '占比 12.5%' }))
      .toEqual({ name: '占比', value: '12.5%' });
    expect(splitIsoEntryNameValue({ name: '总数', text: '总数 42' }))
      .toEqual({ name: '总数', value: '42' });
  });

  it('显式 value 优先，text 拆分不覆盖', () => {
    expect(splitIsoEntryNameValue({ name: '华为技术', text: '华为技术 8台', value: '9台' }))
      .toEqual({ name: '华为技术', value: '9台' });
  });

  it('阴性：text 与 name 无前缀关系 ⇒ 不拆（fail-open 不臆造）', () => {
    expect(splitIsoEntryNameValue({ name: '华为技术', text: '完全不同的文案' }))
      .toEqual({ name: '华为技术', value: '' });
  });

  it('阴性：尾段非数字 ⇒ 不拆', () => {
    expect(splitIsoEntryNameValue({ name: '厂商', text: '厂商 全线产品' }))
      .toEqual({ name: '厂商', value: '' });
  });

  it('阴性：无 text ⇒ 与旧行为逐字一致（value/count/num 老口径）', () => {
    expect(splitIsoEntryNameValue({ name: '厂商', value: '8台' }))
      .toEqual({ name: '厂商', value: '8台' });
    expect(splitIsoEntryNameValue({ name: '厂商', count: 8 }))
      .toEqual({ name: '厂商', value: '8' });
    expect(splitIsoEntryNameValue({ name: '厂商' }))
      .toEqual({ name: '厂商', value: '' });
  });
});

describe('P1-2 · filterIsoPseudoEntries（伪条目过滤）', () => {
  it('阳性：icon 资源条目被滤除，partner-card 保留', () => {
    const cards = [
      { type: 'partner-card', name: '华为技术', text: '华为技术 8台' },
      { type: 'partner-card', name: '中兴通讯', text: '中兴通讯 8台' },
    ];
    const icon = { type: 'icon', name: '战略合作厂商图标', figmaNode: '38:3160', resourceFile: '../x.png' };
    const out = filterIsoPseudoEntries([...cards, icon]);
    expect(out).toEqual(cards);
  });

  it('阳性：无 resourceFile 但 name 含「图标」且有 figmaNode 的条目被滤除', () => {
    const out = filterIsoPseudoEntries([{ name: '优质厂商图标', figmaNode: '38:3164' }]);
    expect(out).toEqual([]);
  });

  it('阴性：纯文本条目（含 figmaNode 但非图标命名）不误杀', () => {
    const card = { type: 'partner-card', name: '华为技术', text: '华为技术 8台', figmaNode: '38:3141' };
    expect(filterIsoPseudoEntries([card])).toEqual([card]);
  });
});

describe('P1-2 · collectIsomorphicSectionGroups 端到端（8b15a757 真机同形）', () => {
  it('三段收敛成组；items 全带台数；无空条目', () => {
    const res = collectIsomorphicSectionGroups([ZHANLUE, YOUZHI, PUTONG], { flattenOneLevel: true });
    expect(res.groups.length).toBe(1);
    const g = res.groups[0];
    expect(g.members.length).toBe(3);
    for (const m of g.members) {
      for (const it of m.items) {
        expect(it.name).not.toBe('');
        expect(it.value).toMatch(/^\d+(\.\d+)?台$/);
      }
      expect(m.items.some((it) => !it.name)).toBe(false);
    }
    const zl = g.members.find((m) => m.id === '38:3137');
    expect(zl.items[0]).toEqual({ name: '华为技术', value: '8台' });
    expect(zl.items).toHaveLength(6); // 6 张卡，icon 伪条目不计
  });
});
