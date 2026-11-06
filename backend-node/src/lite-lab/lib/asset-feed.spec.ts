/**
 * 下载结果 → 实例定位 spec
 *
 * 这三个用例分别对应 2026-11-05~06 的三次真机翻车，都是「用文件名反推实例」造成的：
 *   ① 中文节点名（`icon-战略厂商-3160.png`）被 `^icon-\d+\.` 判否 ⇒ 图标整类丢失
 *   ② 去重条目与锚点共用文件名 ⇒ 多实例塌缩成 1 个
 *   ③ 同名多实例（6 张卡都叫 `icon`）靠 name 模糊匹配会互相顶替
 */

import { resolveFeedNodeId, trailingNumericSuffix, isFedAssetFileName } from './asset-feed';

const known = (ids: string[]) => (id: string) => ids.includes(id);
const noSuffix = () => undefined;

describe('resolveFeedNodeId', () => {
  it('① 中文节点名 + ref 存在 ⇒ 用 ref 命中（741c9eed 三个 section 图标）', () => {
    expect(
      resolveFeedNodeId(
        { name: 'icon-战略厂商', ref: '38:3160', localPath: '/a/resources/images/icon-战略厂商-3160.png' },
        known(['38:3160', '38:3164', '38:3208']),
        noSuffix,
      ),
    ).toBe('38:3160');
  });

  it('② 去重条目与锚点共用文件名 ⇒ 仍按各自 ref 区分（11a0ef5f 6 卡只有 2 张有图）', () => {
    const files = ['48:5808', '48:5823', '48:5838', '48:5853', '48:5868', '48:5883'];
    const isKnown = known(files);
    const resolved = [
      { ref: '48:5808', localPath: '/i/icon-5808.png' },
      { ref: '48:5823', localPath: '/i/icon-5823.png' },
      // 后 4 个是 dedupe 条目：localPath 都指向锚点 icon-5823.png
      { ref: '48:5838', localPath: '/i/icon-5823.png', deduplicatedFrom: '48:5823' },
      { ref: '48:5853', localPath: '/i/icon-5823.png', deduplicatedFrom: '48:5823' },
      { ref: '48:5868', localPath: '/i/icon-5823.png', deduplicatedFrom: '48:5823' },
      { ref: '48:5883', localPath: '/i/icon-5823.png', deduplicatedFrom: '48:5823' },
    ].map((a) => resolveFeedNodeId(a as any, isKnown, noSuffix));

    expect(resolved).toEqual(files);
    // 关键：不能塌缩到锚点
    expect(new Set(resolved).size).toBe(6);
  });

  it('③ ref 不可用（历史产物/已删节点）时，末尾数字段兜底', () => {
    expect(
      resolveFeedNodeId(
        { name: 'icon', ref: '9:9', localPath: '/i/icon-战略厂商-3160.png' },
        known(['38:3160']),
        (s) => (s === '3160' ? '38:3160' : undefined),
      ),
    ).toBe('38:3160');
  });

  it('文件前缀不在 icon/bg/g 内 ⇒ 不归本通道（避免把 bg.png 之类误当图标）', () => {
    for (const p of ['/i/image_313-5800.png', '/i/source-screenshot.png', '/i/mc-preview.png']) {
      expect(resolveFeedNodeId({ ref: '1:1', localPath: p }, known(['1:1']), noSuffix)).toBeUndefined();
    }
  });

  it('ref 指向不存在的节点且无后缀 ⇒ undefined（宁可跳过也不猜）', () => {
    expect(resolveFeedNodeId({ ref: '9:9', localPath: '/i/icon-x.png' }, known(['1:1']), noSuffix)).toBeUndefined();
  });

  it('后缀反查出的节点不存在 ⇒ undefined', () => {
    expect(
      resolveFeedNodeId({ localPath: '/i/icon-999.png' }, known(['1:1']), (s) => `from-${s}`),
    ).toBeUndefined();
  });
});

describe('trailingNumericSuffix', () => {
  it('从末尾取数字段（中文名在前不影响）', () => {
    expect(trailingNumericSuffix('icon-战略厂商-3160.png')).toBe('3160');
    expect(trailingNumericSuffix('icon-5823.png')).toBe('5823');
    expect(trailingNumericSuffix('bg-tab-active-7891.webp')).toBe('7891');
  });

  it('末尾无数字 ⇒ undefined', () => {
    expect(trailingNumericSuffix('icon.png')).toBeUndefined();
    expect(trailingNumericSuffix('bg-hero.png')).toBeUndefined();
  });
});

describe('isFedAssetFileName', () => {
  it('三种前缀都算', () => {
    expect(isFedAssetFileName('icon-1.png')).toBe(true);
    expect(isFedAssetFileName('bg-hero-2.png')).toBe(true);
    expect(isFedAssetFileName('g-group-3.png')).toBe(true);
  });
  it('其它前缀不算', () => {
    expect(isFedAssetFileName('image_313-5800.png')).toBe(false);
    expect(isFedAssetFileName('my-icon-1.png')).toBe(false);
  });
});
