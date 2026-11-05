/**
 * 🛡️ 2026-11-05 样式还原真值依据治理 · P1 接线判据
 *   方案：docs/2026-11-05-样式还原真值依据治理方案.md §3.5 / §3.7 / §5.1
 *
 * 背景：`inferredBy` 此前只是 `inferBackgroundStyle` 的返回字段，全 src 零外部消费
 *   ⇒ 产物里写了 background-size，却看不出它来自 Figma scaleMode 直读还是几何兜底
 *   （静默写死）。修法落在统一出口：写回 mapping 引用（既有 checkpoint 字段）+
 *   reject-summary 第三源恒打计数。
 *
 * 判据口径：**验者只读返回值结构与源码接线，不复用改者的白名单正则**。
 * 真机 fixture 来源任务：`mc-max-1793846560547-8deeb6c4`（figma.json IMAGE fills=5、
 *   scaleMode 5/5 全 STRETCH），按 10-31 治理方案「fixture 从 checkpoint 最小化提取 +
 *   附来源任务号」的既有做法构造。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inferBackgroundStyle } from '../background-size-inference.js';
import {
  pickStyleTruthAudit,
  buildRejectSummary,
  formatRejectSummaryLine,
} from '../reject-summary.js';

const GRAPHS = join(__dirname, '../../graphs');
const readGraph = (f) => readFileSync(join(GRAPHS, f), 'utf8');

const box = { x: 0, y: 0, width: 100, height: 40 };

describe('样式真值来源 · 统一出口写回', () => {
  it('🩺 阳性：Figma scaleMode=STRETCH ⇒ 写回 mapping.backgroundInferredBy=scaleMode 且四件套同源', () => {
    const mapping: any = { imageScaleMode: 'STRETCH', figmaBox: box, parentBox: box };
    const bg = inferBackgroundStyle(mapping);
    expect(bg.inferredBy).toBe('scaleMode');
    expect(bg.size).toBe('100% 100%');
    expect(mapping.backgroundInferredBy).toBe('scaleMode');
  });

  it('🩺 阴性：无 scaleMode ⇒ 回落几何推断，档位必须是 geometry 而非 scaleMode', () => {
    const mapping: any = { figmaBox: box, parentBox: box };
    const bg = inferBackgroundStyle(mapping);
    expect(bg.inferredBy).toBe('geometry');
    expect(mapping.backgroundInferredBy).toBe('geometry');
  });

  it('🩺 阴性防误伤：冻结入参不写回，但返回值仍带 inferredBy（不污染外部常量）', () => {
    const mapping: any = Object.freeze({ imageScaleMode: 'FILL', figmaBox: box, parentBox: box });
    const bg = inferBackgroundStyle(mapping);
    expect(bg.inferredBy).toBe('scaleMode');
    expect(bg.size).toBe('cover');
    expect(mapping.backgroundInferredBy).toBeUndefined();
  });

  it('🩺 阴性防误伤：null 入参不抛错，返回值仍可消费', () => {
    const bg = inferBackgroundStyle(null as any);
    expect(bg.inferredBy).toBe('geometry');
    expect(bg.size).toBe('100% 100%');
  });
});

describe('样式真值来源 · 任务级恒打计数', () => {
  it('🩺 真机同构阳性（8deeb6c4：5/5 STRETCH）⇒ scaleMode=5、geometry=0、noBg=0', () => {
    const mapping = Array.from({ length: 5 }, (_, i) => ({
      figmaNodeId: `node-${i}`,
      imageScaleMode: 'STRETCH',
      backgroundInferredBy: 'scaleMode',
    }));
    expect(pickStyleTruthAudit(mapping)).toEqual({
      evaluated: 5,
      scaleMode: 5,
      geometry: 0,
      noBackgroundInference: 0,
      unknownSource: 0,
    });
  });

  it('🩺 混合档位：几何兜底与未参与背景推断分列，未知来源单独计数', () => {
    const mapping = [
      { backgroundInferredBy: 'scaleMode' },
      { backgroundInferredBy: 'geometry' },
      { backgroundInferredBy: 'geometry' },
      { figmaNodeId: 'icon-only' },
      { backgroundInferredBy: 'hallucinated' },
    ];
    expect(pickStyleTruthAudit(mapping)).toEqual({
      evaluated: 5,
      scaleMode: 1,
      geometry: 2,
      noBackgroundInference: 1,
      unknownSource: 1,
    });
  });

  it('🩺 0 也打：空数组返回全零结构而非 null（可与「零问题」区分）', () => {
    expect(pickStyleTruthAudit([])).toEqual({
      evaluated: 0,
      scaleMode: 0,
      geometry: 0,
      noBackgroundInference: 0,
      unknownSource: 0,
    });
    expect(pickStyleTruthAudit(null)).toEqual(pickStyleTruthAudit([]));
    expect(pickStyleTruthAudit({} as any)).toEqual(pickStyleTruthAudit([]));
  });

  it('🩺 零回归：不传第三源时 buildRejectSummary 仍是「双源皆空 → null」', () => {
    expect(buildRejectSummary({})).toBeNull();
    expect(buildRejectSummary({ takeoverAudit: null, contractAudit: null })).toBeNull();
  });

  it('🩺 全零仍落盘 + 日志行含 styleTruth 且全 0 也打', () => {
    const summary = buildRejectSummary({ styleTruthAudit: pickStyleTruthAudit([]) });
    expect(summary).not.toBeNull();
    expect(summary.styleTruth.evaluated).toBe(0);
    expect(summary.takeover).toBeNull();
    const line = formatRejectSummaryLine(summary);
    expect(line).toContain('REJECT-SUMMARY');
    expect(line).toContain('styleTruth:evaluated=0,scaleMode=0,geometry=0,noBg=0,unknown=0');
  });

  it('🩺 双端接线：phase2 / vue3 两个 graph 都必须传 styleTruthAudit（漏一端即口径分叉）', () => {
    for (const f of ['mc-component-graph-phase2.js', 'mc-component-graph-vue3.js']) {
      const src = readGraph(f);
      expect(src).toContain('pickStyleTruthAudit');
      expect(src).toContain('styleTruthAudit: Array.isArray(styleTruthMapping)');
      expect(src).toContain("state._uiCache?.resourceDomMapping");
    }
  });
});
