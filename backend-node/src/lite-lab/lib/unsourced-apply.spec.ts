/**
 * 闸③ v1-lite · 无源样式落地 spec（2026-11-06）
 *
 * 每条阳性都配阴性对照：破坏性编辑器最大的风险不是「没改」，而是「改错」。
 * 定位信息全部来自闸④ 的 finding（绝对偏移），本 spec 因此也顺带证明
 * 「检测算出的偏移」与「落地切到的原文」是同一份事实，而不是两套解析。
 */

import { applyUnsourcedStyles, renderUnsourcedAppliedMarkdown } from './unsourced-apply';
import { detectUnsourcedStyles, countAutoApplicable } from './unsourced-style';
import type { E2nMap } from './e2n-map';

const solid = (r: number, g: number, b: number, a = 1) => ({
  type: 'SOLID', visible: true, blendMode: 'NORMAL', color: { r, g, b, a },
});
const bb = (x: number, y: number, w: number, h: number) => ({ x, y, width: w, height: h });

/** 卡片：无阴影、无描边、圆角真值 6px（与真机 48:5798/48:5799 同构） */
const FIG = {
  id: 'root',
  type: 'FRAME',
  children: [
    {
      id: 'card',
      type: 'GROUP',
      name: 'card',
      absoluteBoundingBox: bb(0, 0, 470, 72),
      fills: [],
      children: [
        {
          id: 'card-bg',
          type: 'RECTANGLE',
          absoluteBoundingBox: bb(0, 0, 470, 72),
          fills: [solid(0.651, 0.807, 1)],
          cornerRadius: 6,
          strokes: [],
          effects: [],
        },
      ],
    },
  ],
};

const E2N = {
  seeds: [],
  nodes: [
    {
      figmaId: 'card',
      figmaType: 'GROUP',
      figmaName: 'card',
      prodKey: 'k',
      prodPath: 'div',
      classes: ['card'],
      how: 'vvt-unit',
      matched: 1,
      instCount: 1,
      unique: true,
    },
  ],
  multi: [],
  unmapped: [],
  prodNodes: [],
  stats: {
    prodNodes: 1, figmaTexts: 0, seeds: 0, ambiguousSeeds: 0, partialSeeds: 0,
    missSeeds: 0, nodes: 1, multi: 0, depthResolved: 0, figmaContainers: 1,
  },
} as unknown as E2nMap;

const sfc = (body: string) => ({
  path: 'package/index.vue',
  content: `<template><div class="card"></div></template>\n<style lang="less">\n${body}\n</style>`,
});

/** 检测 + 落地（走真实两模块，不手搓 finding） */
function run(body: string, extra: { maxPerFile?: number; maxTotal?: number } = {}) {
  const files = [sfc(body)];
  const found = detectUnsourcedStyles({ figmaRoot: FIG, e2n: E2N, prodFiles: files });
  const res = applyUnsourcedStyles({ findings: found.findings, prodFiles: files, ...extra });
  return { found, res, out: res.files[0].content };
}

describe('applyUnsourcedStyles · 阳性（两类可落地）', () => {
  it('box-shadow delete：声明消失、不留空行、其它属性一个字节不动', () => {
    const { res, out } = run('.card {\n  width: 100%;\n  box-shadow: 0 1px 3px rgba(0,0,0,.08);\n  height: 40px;\n}');
    expect(res.stats.applied).toBe(1);
    expect(res.stats.delete).toBe(1);
    expect(out).not.toContain('box-shadow');
    expect(out).toContain('  width: 100%;\n  height: 40px;');
    expect(out).not.toMatch(/\n\s*\n\s*height/); // 没有留下空行
    expect(res.files[0].changed).toBe(true);
  });

  it('border-radius override：只换值，缩进/属性名/分号保留', () => {
    const { res, out } = run('.card {\n  border-radius: 8px;\n  display: flex;\n}');
    expect(res.stats.override).toBe(1);
    expect(out).toContain('  border-radius: 6px;');
    expect(out).not.toContain('8px');
    expect(out).toContain('  display: flex;');
    expect(res.applied[0]).toMatchObject({ kind: 'override', rawProp: 'border-radius', from: '8px', to: '6px' });
  });

  it('同一规则体两条声明：合成一次重写，两条都生效', () => {
    const { res, out } = run('.card { border-radius: 8px; box-shadow: 0 1px 2px #000; }');
    expect(res.stats.applied).toBe(2);
    expect(res.stats.rulesRewritten).toBe(1);
    expect(out).toContain('border-radius: 6px;');
    expect(out).not.toContain('box-shadow');
  });

  it('同文件两条规则：按 bodyStart 降序应用，两条都命中（顺序错则后者偏移失效）', () => {
    const { res, out } = run('.card { box-shadow: 0 1px 2px #000; }\n.card { border-radius: 8px; }');
    expect(res.stats.applied).toBe(2);
    expect(res.stats.rulesRewritten).toBe(2);
    expect(out).not.toContain('box-shadow');
    expect(out).toContain('.card { border-radius: 6px; }');
  });

  it('删空的规则体保留为空（less 合法），并计数', () => {
    const { res, out } = run('.card { box-shadow: 0 1px 2px #000; }');
    expect(res.stats.emptyRulesLeft).toBe(1);
    expect(out).not.toContain('box-shadow');
    expect(out).toContain('.card {');
  });
});

describe('applyUnsourcedStyles · 阴性（一行都不许改）', () => {
  it('fanout：按设计只报告（拆类才能解，删了会让多数实例失真值）', () => {
    const root = {
      id: 'root',
      type: 'FRAME',
      children: [
        { id: 'c1', type: 'GROUP', absoluteBoundingBox: bb(0, 0, 470, 72), fills: [], children: [
          { id: 'c1-bg', type: 'RECTANGLE', absoluteBoundingBox: bb(0, 0, 470, 72), fills: [solid(0.651, 0.807, 1)] },
        ] },
        { id: 'c2', type: 'GROUP', absoluteBoundingBox: bb(0, 80, 470, 72), fills: [], children: [
          { id: 'c2-bg', type: 'RECTANGLE', absoluteBoundingBox: bb(0, 80, 470, 72), fills: [solid(1, 1, 1, 0.43)] },
        ] },
      ],
    };
    const e2n = {
      ...E2N,
      nodes: [
        ...(E2N.nodes as Array<Record<string, unknown>>),
        { ...(E2N.nodes as Array<Record<string, unknown>>)[0], figmaId: 'c2' },
      ],
    } as unknown as E2nMap;
    const files = [sfc('.card { background: #a6ceff; }')];
    const found = detectUnsourcedStyles({ figmaRoot: root, e2n, prodFiles: files });
    expect(found.findings[0].verdict).toBe('fanout');
    const res = applyUnsourcedStyles({ findings: found.findings, prodFiles: files });
    expect(res.stats.reportOnly).toBe(1);
    expect(res.stats.applied).toBe(0);
    expect(res.files[0].changed).toBe(false);
  });

  it('background / border 的 delete：只报告（背景常由祖先提供；border 长手删一条会更实）', () => {
    // background 只有「真值明确无 fill」才出 delete ⇒ 需要一个无 fill 的节点
    const root = {
      id: 'root',
      type: 'FRAME',
      children: [
        ...(FIG.children as Array<Record<string, unknown>>),
        { id: 'plain', type: 'GROUP', absoluteBoundingBox: bb(0, 100, 100, 20), fills: [], children: [] },
      ],
    };
    const e2n = {
      ...E2N,
      nodes: [
        ...(E2N.nodes as Array<Record<string, unknown>>),
        { ...(E2N.nodes as Array<Record<string, unknown>>)[0], figmaId: 'plain', classes: ['plain'] },
      ],
    } as unknown as E2nMap;
    const files = [
      {
        path: 'package/index.vue',
        content:
          '<template><div class="card plain"></div></template>\n<style lang="less">\n' +
          '.card { border-bottom: 1px solid #eee; }\n.plain { background: #fff; }\n</style>',
      },
    ];
    const found = detectUnsourcedStyles({ figmaRoot: root, e2n, prodFiles: files });
    const verdicts = found.findings.map((f) => `${f.prop}:${f.verdict}`).sort();
    expect(verdicts).toEqual(['background:delete', 'border:delete']);
    const res = applyUnsourcedStyles({ findings: found.findings, prodFiles: files });
    expect(res.stats.applied).toBe(0);
    expect(res.stats.reportOnly).toBe(2);
    expect(res.files[0].changed).toBe(false);
  });

  it('less 变量：不删（可能删掉真值通道本身）', () => {
    const { res, out } = run('.card { box-shadow: @shadow; }');
    expect(res.stats.applied).toBe(0);
    expect(res.skipped[0].reason).toBe('less-var');
    expect(out).toContain('box-shadow: @shadow;');
  });

  it('!important：不删（语义强度是有意为之，交人工）', () => {
    const { res } = run('.card { box-shadow: 0 0 8px #000 !important; }');
    expect(res.stats.applied).toBe(0);
    expect(res.skipped[0].reason).toBe('important');
  });

  it('多元值圆角：不覆盖（只换首个会改变语义）', () => {
    const { res } = run('.card { border-radius: 8px 8px 0 0; }');
    expect(res.stats.applied).toBe(0);
    expect(res.skipped[0].reason).toBe('multi-value');
  });

  it('偏移已失效（检测后内容被改过）：放弃并留痕，不按旧偏移盲删', () => {
    const files = [sfc('.card {\n  box-shadow: 0 1px 2px #000;\n}')];
    const found = detectUnsourcedStyles({ figmaRoot: FIG, e2n: E2N, prodFiles: files });
    // 模拟上游在检测与落地之间插了一行 ⇒ 偏移整体下移，旧偏移处的原文已不是那条声明
    const shifted = [{ path: files[0].path, content: files[0].content.replace('<style lang="less">\n', '<style lang="less">\n.card { width: 1px; }\n') }];
    const res = applyUnsourcedStyles({ findings: found.findings, prodFiles: shifted });
    expect(res.stats.applied).toBe(0);
    expect(res.skipped[0].reason).toBe('stale-offset');
    expect(res.files[0].changed).toBe(false);
  });

  it('单文件上限：超出降级为报告', () => {
    const { res } = run(
      '.card { box-shadow: 0 1px 2px #000; }\n.card { box-shadow: 0 2px 4px #000; }',
      { maxPerFile: 1 },
    );
    expect(res.stats.applied).toBe(1);
    expect(res.skipped[0].reason).toBe('cap-exceeded');
  });

  it('幂等：落地后再落地一次，找不到原文 ⇒ 全 stale-offset，零改动', () => {
    const first = run('.card { border-radius: 8px; box-shadow: 0 1px 2px #000; }');
    const again = applyUnsourcedStyles({
      findings: first.found.findings, // 故意复用旧 finding
      prodFiles: first.res.files.map((f) => ({ path: f.path, content: f.content })),
    });
    expect(again.stats.applied).toBe(0);
    expect(again.files[0].changed).toBe(false);
  });

  it('文件不存在：跳过并留痕', () => {
    const found = detectUnsourcedStyles({
      figmaRoot: FIG, e2n: E2N,
      prodFiles: [sfc('.card { box-shadow: 0 1px 2px #000; }')],
    });
    const res = applyUnsourcedStyles({ findings: found.findings, prodFiles: [] });
    expect(res.stats.applied).toBe(0);
    expect(res.skipped[0].reason).toBe('file-missing');
  });
});

/**
 * 收敛自证（闸③ 的核心判据，service 层的 `unsourcedRemainingAuto` 就是它的产物）：
 * 落地后**重新检测**，「可落地项」必须归零。
 *
 * 这条同时证明两件事：① `isAutoApplicable` 单一来源（检测与落地共用同一判据）；
 * ② 落地确实改变了被判定的事实，而不是「改了别处、判定照旧」。
 */
describe('闸③ 收敛自证', () => {
  it('detect → apply → detect：可落地项归零，剩下的只有按设计不落地的', () => {
    const files = [
      sfc(
        '.card { border-radius: 8px; box-shadow: 0 1px 2px #000; }\n' +
          '.card { background: #fff; border-bottom: 1px solid #eee; }',
      ),
    ];
    const first = detectUnsourcedStyles({ figmaRoot: FIG, e2n: E2N, prodFiles: files });
    expect(countAutoApplicable(first.findings)).toBe(2);
    expect(first.findings.length).toBeGreaterThan(2); // 还有 background / border 这两条不落地的

    const res = applyUnsourcedStyles({ findings: first.findings, prodFiles: files });
    expect(res.stats.applied).toBe(2);

    const second = detectUnsourcedStyles({
      figmaRoot: FIG,
      e2n: E2N,
      prodFiles: res.files.map((f) => ({ path: f.path, content: f.content })),
    });
    // 🔴 必须为 0
    expect(countAutoApplicable(second.findings)).toBe(0);
    // 且「不该动」的仍然原样保留（border 无描边 ⇒ 只报告；background 有真值 ⇒ 本就不报）
    const left = second.findings.map((f) => `${f.prop}:${f.verdict}`).sort();
    expect(left).toEqual(['border:delete']);
  });

  it('报告三段齐全（检出 → 落地 → 未落地），且落地表列出真实动作', () => {
    const md = renderUnsourcedAppliedMarkdown(
      { considered: 3, reportOnly: 1, applied: 2, delete: 1, override: 1, skipped: 0, filesChanged: 1, rulesRewritten: 2, emptyRulesLeft: 0, byReason: {} },
      [
        { file: 'package/index.vue', cls: 'card', selector: '.card', figmaId: 'card', kind: 'override', rawProp: 'border-radius', from: '8px', to: '6px' },
        { file: 'package/index.vue', cls: 'card', selector: '.card', figmaId: 'card', kind: 'delete', rawProp: 'box-shadow', from: '0 1px 2px #000', to: '' },
      ],
      [],
    );
    expect(md).toContain('无源样式落地');
    expect(md).toContain('已落地 **2**');
    expect(md).toContain('边框');
    expect(md).toContain('`border-radius`');
    expect(md).toContain('6px');
  });
});
