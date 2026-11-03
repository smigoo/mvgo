import { describe, expect, it } from '@jest/globals';
import { indexFigmaNodes } from '../section-tree.js';
import { partitionLeafRegions } from '../region-partitioner.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 🔀 段内分区器回归锁（2026-11-03 立项）。
 * 阳性 fixture = 真机 4ee12198（36:1693 cp-设备详情）真值缓存——弹窗家族
 * `bg + header VECTOR + slot-icon GROUP` 结构模式：整段 detect* 全 miss
 * （kv:kvPairs=0）而 LLM 发挥致布局错的原始病灶。fixture 与真机同源。
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

function loadIdx() {
  const raw = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  return indexFigmaNodes(raw.document || raw);
}

describe('partitionLeafRegions · 段内分区器（弹窗家族 slot-icon 穿透）', () => {
  it('阳性（真机 36:1693 回归锁）：穿透 slot-icon ⇒ kv 区 24 文本 + text 区，全部归区', () => {
    const idx = loadIdx();
    const hit = partitionLeafRegions({ id: '36:1693' }, idx);
    expect(hit.ok).toBe(true);
    expect(hit.pierced).toBe('801:3');
    const kv = hit.regions.find((r) => r.kind === 'kvgrid');
    const text = hit.regions.find((r) => r.kind === 'text');
    expect(kv).toBeTruthy();
    expect(kv!.members.length).toBe(24); // 12 对 label/value
    expect(text).toBeTruthy();
    expect(text!.members.length).toBe(6); // 编码/产品描述/描述长文等
    // 完整性：两区并集 = 段内全部文本（partition:unaccounted 守卫的正面断言）
    expect(kv!.members.length + text!.members.length).toBe(30);
    // kv 区在 text 区（标题带）之下（视觉序）
    expect(kv!.box.y).toBeGreaterThan(100);
  });

  it('fail-closed：不存在的段 id ⇒ 不分区', () => {
    const idx = loadIdx();
    const hit = partitionLeafRegions({ id: 'nonexistent:0' }, idx);
    expect(hit.ok).toBe(false);
    expect(hit.reason).toBe('partition:anchorMissing');
  });
});
