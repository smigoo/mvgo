import { describe, expect, it } from '@jest/globals';
import { indexFigmaNodes } from '../section-tree.js';
import {
  collectFoldedGridTakeover,
  FG_TAKEOVER_CLASS_RX,
} from '../folded-grid-section-takeover.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 🔀 刀 54 段内分区接管·接线回归锁（2026-11-03）。
 *
 * 病灶：弹窗家族（36:1693 设备详情 / 38:3134 合作厂商 / 跨 32 目录 slot-icon 家族）
 * 复合段（kv 网格+标题+描述混居）对「整段二选一」的 detect* 家族全 miss ⇒ 交 LLM ⇒
 * 布局发挥。接线刀：检测链最末位（footer 之后）对全 miss leaf 跑
 * `partitionLeafRegions`（8e548cf 第一阶段），kv 区走与 detectKvGridLeaf **同一份**
 * 事实口径（buildKvGridFacts），text 区逐成员绝对定位；任一子区判据不过 ⇒ 整段
 * fail-open 交 LLM。
 * fixture 与真机同源（4ee12198 真值缓存，与 region-partitioner.spec 同一文件）。
 */
const FIXTURE = join(
  process.cwd(), // jest cwd = backend-node/
  '..',
  'temp-components',
  '6a51f7caed28c5d5b13c61a5',
  'mc-max-1793666536794-4ee12198',
  '.mc-gen',
  'cache',
  'figma-node-data.json',
);

function loadRaw() {
  const raw = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  return raw.document || raw;
}

const TREE = [{ id: 'root', isLayoutContainer: true, children: [{ id: '36:1693' }] }];

function vue0(out: any) {
  return [...out.map.values()][0].vue as string;
}

describe('刀 54 端到端 collectFoldedGridTakeover · regions 复合接管', () => {
  it('阳性（真机 36:1693）：十类全 miss 的复合叶被 regions 接管，计数进 regionHits 不混 gridHits', () => {
    const out: any = collectFoldedGridTakeover({
      treeSections: TREE,
      figmaNodeData: loadRaw(),
      resourceMapping: [],
      componentName: 'c-device',
    });
    expect(out.regionHits).toBe(1);
    expect(out.gridHits).toBe(0);
    expect(out.kvGridHits).toBe(0);
    expect(out.map.size).toBe(1);
    const tr = [...out.map.values()][0];
    expect(tr.kind).toBe('regions');
    expect(tr.suppressed).toBe(false);
    expect(tr.height).toBeGreaterThan(0);
    // kv 区 12 对（36:1693 真值 81:7）+ text 区 6 文本（map 值不透传 kv/textRuns ⇒
    //   以产物内容计数断言）
    expect((vue0(out).match(/-kv-cell"/g) || []).length).toBe(12);
    expect((vue0(out).match(/{{ rt\d+ }}/g) || []).length).toBe(6);
    expect(vue0(out)).toContain('grid-template-columns:repeat(2, max-content)');
  });

  it('产物形态：单 SFC = 相对定位容器 + kv 区绝对定位 grid + text 逐成员绝对定位', () => {
    const out: any = collectFoldedGridTakeover({
      treeSections: TREE,
      figmaNodeData: loadRaw(),
      resourceMapping: [],
      componentName: 'c-device',
    });
    const vue: string = [...out.map.values()][0].vue;
    expect(vue).toContain('-fg-regions-');
    expect(vue).toContain('data-section-id="36:1693"');
    expect(vue).toContain('position:relative');
    expect(vue).toContain('position:absolute');
    expect(vue).toContain('grid-template-columns:repeat(2, max-content)');
    // kv 单元构造复用 kvgrid 同一 helper（label 定宽右对齐 + script 常量 kvl/kvv 防撞名）
    expect(vue).toContain('{{ kvl0 }}');
    expect(vue).toContain('{{ rt0 }}');
    expect(vue).not.toContain('display:none'); // 不走两阶段抑制
    // 类名签名登记：字号归一豁免/孤儿样式守卫自动生效的唯一入口
    expect(FG_TAKEOVER_CLASS_RX.test('c-device-fg-regions-361693')).toBe(true);
  });

  it('R7 阳性：原始 id 无锚但 figmaAnchorId 指向复合真值 ⇒ 分区器与检测器同走修复锚', () => {
    const out: any = collectFoldedGridTakeover({
      treeSections: [{ id: 'root', isLayoutContainer: true, children: [{ id: '136:122', figmaAnchorId: '36:1693' }] }],
      figmaNodeData: loadRaw(),
      resourceMapping: [],
      componentName: 'c-device',
    });
    expect(out.regionHits).toBe(1);
    expect([...out.map.values()][0]).toMatchObject({ kind: 'regions', sectionId: '136:122' });
    expect((vue0(out).match(/-kv-cell"/g) || []).length).toBe(12);
  });

  it('fail-open：段 id 无锚 ⇒ 记 skip（reason 含 regions:）且零接管', () => {
    const out: any = collectFoldedGridTakeover({
      treeSections: [{ id: 'root', isLayoutContainer: true, children: [{ id: 'nonexistent:0' }] }],
      figmaNodeData: loadRaw(),
      resourceMapping: [],
      componentName: 'c-device',
    });
    expect(out.regionHits).toBe(0);
    expect(out.map.size).toBe(0);
    const skip = out.skipped.find((s: any) => s.id === 'nonexistent:0');
    expect(skip).toBeTruthy();
    expect(skip.reason).toContain('regions:partition:anchorMissing');
  });

  it('审计行：已评估日志字段含 regionsTaken（0 也打）', () => {
    const logs: any[] = [];
    const logger = { info: (...a: any[]) => logs.push(a) };
    collectFoldedGridTakeover({
      treeSections: TREE,
      figmaNodeData: loadRaw(),
      resourceMapping: [],
      componentName: 'c-device',
      logger,
    });
    const audit = logs.find((a) => String(a[0]).includes('已评估'));
    expect(audit).toBeTruthy();
    expect(audit[1]).toHaveProperty('regionsTaken');
    expect(audit[1].regionsTaken).toBe(1);
    // 🔴 刀55 计数行铁律：几何翻案计数恒存在（0 也打；本 fixture 叶走 regions 非 list）
    expect(audit[1]).toHaveProperty('listDirectionOverrides');
    expect(audit[1].listDirectionOverrides).toBe(0);
    // 🔴 判据行铁律：真机可 grep 的命中行
    const hit = logs.find((a) => String(a[0]).includes('段内分区接管'));
    expect(hit).toBeTruthy();
    expect(hit[1]).toMatchObject({ leaf: '36:1693', regions: 2 });
  });
});
