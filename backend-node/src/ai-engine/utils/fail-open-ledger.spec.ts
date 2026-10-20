import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendFailOpenEvent } from './fail-open-ledger.js';

/**
 * 🛡️ fail-open 台账（#128 流程四件套 ② 载体）单测。
 * 覆盖：新建/合并/幂等去重/容量封顶/fail-open 不炸主流程。
 */
describe('appendFailOpenEvent（fail-open 显性化台账）', () => {
  let dir: string;
  const metaPath = () => join(dir, 'component-meta.json');
  const readMeta = () => JSON.parse(readFileSync(metaPath(), 'utf-8'));

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fol-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('meta 不存在 ⇒ 新建并写入 failOpenEvents', () => {
    expect(appendFailOpenEvent(dir, { rule: 'RES-UNREF', reason: '图片零引用', detail: { images: ['a-1'] } })).toBe(true);
    const meta = readMeta();
    expect(meta.failOpenEvents).toHaveLength(1);
    expect(meta.failOpenEvents[0]).toMatchObject({ rule: 'RES-UNREF', severity: 'WARN', reason: '图片零引用' });
    expect(typeof meta.failOpenEvents[0].at).toBe('string');
  });

  it('meta 已有其它字段 ⇒ 合并保留', () => {
    writeFileSync(metaPath(), JSON.stringify({ name: 'c-x', runtimeVerified: true }), 'utf-8');
    appendFailOpenEvent(dir, { rule: 'R1', reason: 'r1' });
    const meta = readMeta();
    expect(meta.name).toBe('c-x');
    expect(meta.runtimeVerified).toBe(true);
    expect(meta.failOpenEvents).toHaveLength(1);
  });

  it('同 rule+reason 幂等去重（重试反复触发只留最新一条）', () => {
    appendFailOpenEvent(dir, { rule: 'R1', reason: 'same' });
    appendFailOpenEvent(dir, { rule: 'R1', reason: 'same' });
    appendFailOpenEvent(dir, { rule: 'R1', reason: 'other' });
    appendFailOpenEvent(dir, { rule: 'R2', reason: 'same' });
    const meta = readMeta();
    expect(meta.failOpenEvents).toHaveLength(3);
    expect(meta.failOpenEvents.map((e: any) => `${e.rule}:${e.reason}`)).toEqual(['R1:same', 'R1:other', 'R2:same']);
  });

  it('容量封顶 50 条，溢出保最新', () => {
    for (let i = 0; i < 60; i++) appendFailOpenEvent(dir, { rule: `R${i}`, reason: `r${i}` });
    const meta = readMeta();
    expect(meta.failOpenEvents).toHaveLength(50);
    expect(meta.failOpenEvents[49].rule).toBe('R59');
    expect(meta.failOpenEvents[0].rule).toBe('R10');
  });

  it('fail-open：outputPath 缺失/事件缺字段/meta 损坏 ⇒ false 不抛错', () => {
    expect(appendFailOpenEvent('', { rule: 'R', reason: 'r' })).toBe(false);
    expect(appendFailOpenEvent(dir, { rule: '', reason: 'r' } as any)).toBe(false);
    expect(appendFailOpenEvent(dir, { rule: 'R', reason: '' } as any)).toBe(false);
    writeFileSync(metaPath(), '{broken json', 'utf-8');
    expect(appendFailOpenEvent(dir, { rule: 'R9', reason: 'r9' })).toBe(true); // 损坏 meta 重建
    expect(readMeta().failOpenEvents).toHaveLength(1);
    // 目录不存在（join 出非法路径）⇒ 写失败也 fail-open
    expect(appendFailOpenEvent(join(dir, 'no/such/deep'), { rule: 'R', reason: 'r' })).toBe(false);
  });
});
