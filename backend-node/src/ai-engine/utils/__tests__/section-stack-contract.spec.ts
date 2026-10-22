/**
 * 刀 52 单测 —— 父容器「垂直堆叠」几何契约。
 *
 * fixture 全部照抄真机 Figma 原始返回（`38:3134` depth=8，1:1）与真机产物模板形态：
 *   796:3 的 5 个子项 = 两张统计卡（同 y 并列，被 `data-rowpeers-wrap` 包住）+ 三个厂商段。
 */
import {
  detectStackIssues,
  healStackGeometry,
  enforceStackGeometry,
} from '../section-stack-contract.js';

const n = (
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  children: any[] = [],
) => ({
  id,
  type: 'FRAME',
  name: id,
  absoluteBoundingBox: { x, y, width, height },
  children,
});

/** 真值：slot-icon 容器 787 高；统计行 76；三段 161/212/265；间距 33/20/20（合计 787） */
export const FIGMA_ROOT = {
  document: n('38:3134', 26866, 51431, 660, 868, [
    n('796:3', 26894, 51483, 604, 787, [
      n('38:3260', 26900, 51483, 265, 76),
      n('38:3282', 27229, 51483, 265, 76),
      n('38:3137', 26894, 51592, 604, 161),
      n('38:3162', 26894, 51773, 604, 212),
      n('38:3206', 26894, 52005, 604, 265),
    ]),
  ]),
};

const INDEX = `\
<template>
  <base-panel panelKey="default-panel">
    <div class="c-db2d65-slot-con" style="display:flex;flex-direction:column;">
      <div class="c-db2d65-icon-con" data-section-id="796:3" style="flex:1;min-height:0;display:flex;flex-direction:column;">
        <div data-rowpeers-wrap style="flex:0.192;min-height:0;display:flex;flex-direction:row;gap:64px;">
          <div class="c-db2d65-stats-con" data-section-id="38:3260" style="background:linear-gradient(90deg,#d4e3fe66,#0084ff66);min-width:0;flex:1;min-height:0;display:flex;flex-direction:row;">
            <ContentIcon style="flex:0.366;min-width:0;" />
          </div>
          <div class="c-db2d65-group-con" data-section-id="38:3282" style="min-width:0;flex:1;min-height:0;display:flex;flex-direction:row;">
            <ContentIcon2 style="flex:0.366;min-width:0;" />
          </div>
        </div>
        <div class="c-db2d65-container" data-section-id="38:3137" style="background:rgba(226,208,132,0.2);border-radius:12px;flex:0.204;min-height:0;display:flex;flex-direction:column;padding-top:25px;padding-left:20px;">
          <HeaderText style="flex:0 1 auto;height:16px;" />
        </div>
        <div class="c-db2d65-container" data-section-id="38:3162" style="flex:0.268;min-height:0;display:flex;flex-direction:column;padding-top:25px;padding-left:20px;">
          <HeaderText2 style="flex:0 1 auto;height:16px;" />
        </div>
        <div class="c-db2d65-container" data-section-id="38:3206" style="flex:0.335;min-height:0;display:flex;flex-direction:column;padding-top:25px;padding-left:20px;">
          <HeaderText3 style="flex:0 1 auto;height:16px;" />
        </div>
      </div>
    </div>
  </base-panel>
</template>
`;

const FILES: Record<string, string> = { 'package/index.vue': INDEX };
const opts = () => ({ figmaRoot: FIGMA_ROOT as any });

describe('刀 52 阳性：真机 796:3（两卡并列 + 三段纵向）', () => {
  test('① 检出 1 个目标容器，四个高度单元与真值逐字一致', () => {
    const det = detectStackIssues(FILES, opts());
    expect(det.stats.mapped).toBe(1);
    expect(det.stats.matched).toBe(1);
    expect(det.issues).toHaveLength(1);
    const geo = det.issues[0].geo;
    expect(geo.paddingTop).toBe(0);
    expect(geo.leftover).toBe(0);
    expect(geo.units.map((u: any) => [u.height, u.gapBefore, u.members.length])).toEqual([
      [76, 0, 1],
      [161, 33, 1],
      [212, 20, 1],
      [265, 20, 1],
    ]);
  });

  test('② 行组包裹层与普通段一视同仁：wrap 拿到 76px，三段拿到 161/212/265px', () => {
    const res = enforceStackGeometry(FILES, opts());
    expect(res.changed).toBe(true);
    const out = res.files['package/index.vue'];
    expect(out).toMatch(/data-rowpeers-wrap[^>]*flex:0 1 76px/);
    expect(out).toMatch(/data-section-id="38:3137"[^>]*flex:0 1 161px/);
    expect(out).toMatch(/data-section-id="38:3162"[^>]*flex:0 1 212px/);
    expect(out).toMatch(/data-section-id="38:3206"[^>]*flex:0 1 265px/);
  });

  test('③ 间距写进 margin-top（33/20/20），第一项无 margin', () => {
    const res = enforceStackGeometry(FILES, opts());
    const out = res.files['package/index.vue'];
    expect(out).toMatch(/data-section-id="38:3137"[^>]*margin-top:33px/);
    expect(out).toMatch(/data-section-id="38:3162"[^>]*margin-top:20px/);
    expect(out).toMatch(/data-section-id="38:3206"[^>]*margin-top:20px/);
    const wrapLine = out.split('\n').find((l) => l.includes('data-rowpeers-wrap')) || '';
    expect(wrapLine).not.toContain('margin-top');
  });

  test('④ 行组内部成员不动（横向等分语义保持，只改 wrap 自己）', () => {
    const res = enforceStackGeometry(FILES, opts());
    const out = res.files['package/index.vue'];
    const l1 = out.split('\n').find((l) => l.includes('data-section-id="38:3260"')) || '';
    const l2 = out.split('\n').find((l) => l.includes('data-section-id="38:3282"')) || '';
    expect(l1).toContain('flex:1;');
    expect(l2).toContain('flex:1;');
    expect(l1).not.toContain('flex:0 1 76px');
  });

  test('⑤ 只改内联，其它声明（背景/圆角/display/padding）一字不丢，class 原文不动', () => {
    const res = enforceStackGeometry(FILES, opts());
    const out = res.files['package/index.vue'];
    expect(out).toContain('background:rgba(226,208,132,0.2)');
    expect(out).toContain('border-radius:12px');
    expect(out).toContain('padding-top:25px');
    expect(out).toContain('padding-left:20px');
    expect(out).toContain('class="c-db2d65-container"');
  });

  test('⑥ 幂等：自愈结果再跑一次必须 0 改动', () => {
    const once = enforceStackGeometry(FILES, opts());
    const twice = enforceStackGeometry(once.files, opts());
    expect(twice.changed).toBe(false);
    expect(twice.files).toEqual(once.files);
  });
});

describe('刀 52 阴性：判不了就必须交回既有比例行为', () => {
  test('⑦ 子元素既无 data-section-id 也不是行组 ⇒ unmapped-child（段内子组件属于刀 50 的域）', () => {
    const onlySections = {
      'package/index.vue': INDEX.replace(/data-rowpeers-wrap/, 'data-x').replace(
        /data-section-id="38:3260"/,
        'data-y="38:3260"',
      ),
    };
    const det = detectStackIssues(onlySections, opts());
    expect(det.issues).toHaveLength(0);
    expect(det.stats.skipped['unmapped-child']).toBeGreaterThan(0);
  });

  test('⑧ 容器 inline 不是 column ⇒ 不属于本契约（横向容器高度不是主轴）', () => {
    const files = {
      'package/index.vue': INDEX.replace(
        'data-section-id="796:3" style="flex:1;min-height:0;display:flex;flex-direction:column;"',
        'data-section-id="796:3" style="flex:1;min-width:0;display:flex;flex-direction:row;"',
      ),
    };
    const det = detectStackIssues(files, opts());
    expect(det.issues).toHaveLength(0);
  });

  test('⑨ 容器真值缺失 ⇒ container-box-unknown，不改文件', () => {
    const files = {
      'package/index.vue': INDEX.replace('data-section-id="796:3"', 'data-section-id="999:9"'),
    };
    const det = detectStackIssues(files, opts());
    expect(det.issues).toHaveLength(0);
    expect(det.stats.skipped['container-box-unknown']).toBe(1);
  });

  test('⑩ 内容溢出父高 ⇒ content-overflow（真值自相矛盾时绝不硬塞）', () => {
    // 父容器真值只声明 200 高，而子项 76 + 33 + 161 = 270 ⇒ 溢出
    const shortRoot = {
      document: n('38:3134', 26866, 51431, 660, 868, [
        n('796:3', 26894, 51483, 604, 200, [
          n('38:3260', 26900, 51483, 265, 76),
          n('38:3137', 26894, 51592, 604, 161),
        ]),
      ]),
    };
    const overflowTpl = `<template>
  <div data-section-id="796:3" style="display:flex;flex-direction:column;">
    <div data-rowpeers-wrap style="flex:0.192;min-height:0;display:flex;flex-direction:row;gap:64px;">
      <div data-section-id="38:3260" style="flex:1;min-width:0;"></div>
    </div>
    <div data-section-id="38:3137" style="flex:0.204;min-height:0;display:flex;flex-direction:column;">
      <HeaderText />
    </div>
  </div>
</template>`;
    const det = detectStackIssues({ 'package/index.vue': overflowTpl }, { figmaRoot: shortRoot });
    expect(det.issues).toHaveLength(0);
    expect(det.stats.skipped['content-overflow']).toBe(1);
  });

  test('⑪ 无 figmaRoot ⇒ 整链静默跳过（不报错、不改文件）', () => {
    const det = detectStackIssues(FILES, {});
    expect(det.stats.skipped.noFigma).toBe(1);
    const res = enforceStackGeometry(FILES, {});
    expect(res.changed).toBe(false);
    expect(res.files).toEqual(FILES);
  });

  test('⑫ 已是真值 ⇒ 0 改动（幂等前置判断，不产生假变更）', () => {
    const good = FILES['package/index.vue']
      .replace(
        'data-rowpeers-wrap style="flex:0.192;min-height:0;',
        'data-rowpeers-wrap style="flex:0 1 76px;min-height:0;',
      )
      .replace(
        'data-section-id="38:3137" style="background:rgba(226,208,132,0.2);border-radius:12px;flex:0.204;min-height:0;',
        'data-section-id="38:3137" style="background:rgba(226,208,132,0.2);border-radius:12px;flex:0 1 161px;min-height:0;margin-top:33px;',
      )
      .replace(
        'data-section-id="38:3162" style="flex:0.268;min-height:0;',
        'data-section-id="38:3162" style="flex:0 1 212px;min-height:0;margin-top:20px;',
      )
      .replace(
        'data-section-id="38:3206" style="flex:0.335;min-height:0;',
        'data-section-id="38:3206" style="flex:0 1 265px;min-height:0;margin-top:20px;',
      );
    const res = enforceStackGeometry({ 'package/index.vue': good }, opts());
    expect(res.changed).toBe(false);
  });
});
