/**
 * best-of 修复轮单调不劣守卫回归。
 *
 * 真机语料（mc-max-1794461199581-253def62）：`FAIL=4 prev=1 effective=false` ——
 * 修复轮为消一条 D-GRID 把「普通厂商」整组删掉，最终按更坏版本拒交付。
 * 本 spec 锁四件事：快照内容纯净、优劣比较严格、劣化判定、恢复后内存与磁盘一致。
 */
import {
  snapshotAcceptanceFiles,
  isBetterSnapshot,
  shouldRollback,
  restoreAcceptanceSnapshot,
} from './best-of';

const FILES = {
  'package/index.vue': '<template><A/></template>',
  'package/components/StatsSection.vue': '<template><img/></template>',
  'package/declare.json': { attribute: { title: 'x' } }, // 非字符串：不进快照
};

function accOf(codes: string[]) {
  return { fails: codes.map((code) => ({ code })) };
}

describe('best-of · 修复轮单调不劣守卫', () => {
  it('快照只收字符串文件，非字符串结构体不参与（防后续轮次原地改写）', () => {
    const snap = snapshotAcceptanceFiles(FILES, accOf(['D-GRID']));
    expect(snap).not.toBeNull();
    expect(Object.keys(snap!.files).sort()).toEqual([
      'package/components/StatsSection.vue',
      'package/index.vue',
    ]);
    expect(snap!.failCount).toBe(1);
    expect(snap!.codes).toEqual(['D-GRID']);
  });

  it('优劣比较严格：等值不覆盖、更差不算更好', () => {
    expect(isBetterSnapshot(null, { failCount: 1 } as any)).toBe(true);
    expect(isBetterSnapshot({ failCount: 1 } as any, { failCount: 1 } as any)).toBe(false);
    expect(isBetterSnapshot({ failCount: 1 } as any, { failCount: 4 } as any)).toBe(false);
    expect(isBetterSnapshot({ failCount: 4 } as any, { failCount: 1 } as any)).toBe(true);
  });

  it('劣化判定：FAIL 数上升才回滚（真机 1 → 4）', () => {
    expect(shouldRollback({ failCount: 1 }, 4)).toBe(true);
    expect(shouldRollback({ failCount: 4 }, 1)).toBe(false);
    expect(shouldRollback({ failCount: 1 }, 1)).toBe(false);
    expect(shouldRollback(null as any, 4)).toBe(false);
  });

  it('恢复：内存原地改写 + 按相对路径写回磁盘', () => {
    const snap = snapshotAcceptanceFiles(FILES, accOf(['D-GRID']))!;
    const files: Record<string, any> = {
      'package/index.vue': 'BROKEN',
      'package/components/StatsSection.vue': 'BROKEN',
    };
    const written: Array<{ abs: string; content: string }> = [];
    const mkdirs: string[] = [];
    const io = {
      join: (a: string, b: string) => `${a}/${b}`,
      dirname: (p: string) => p.slice(0, p.lastIndexOf('/')),
      mkdirSync: (d: string) => void mkdirs.push(d),
      writeFileSync: (abs: string, content: string) => void written.push({ abs, content }),
    };
    const r = restoreAcceptanceSnapshot(snap, files, '/out/proj', io as any);
    expect(files['package/index.vue']).toBe('<template><A/></template>');
    expect(files['package/components/StatsSection.vue']).toBe('<template><img/></template>');
    expect(written.map((w) => w.abs).sort()).toEqual([
      '/out/proj/package/components/StatsSection.vue',
      '/out/proj/package/index.vue',
    ]);
    expect(r.restored.length).toBe(2);
    expect(r.writeFailed).toEqual([]);
    // 子目录必须建（components/），否则写盘 ENOENT
    expect(mkdirs).toContain('/out/proj/package/components');
  });

  it('恢复：单文件写盘异常不抛出，只记入 writeFailed（内存已恢复即视为可用）', () => {
    const snap = snapshotAcceptanceFiles(FILES, accOf(['D-GRID']))!;
    const files: Record<string, any> = {};
    const io = {
      join: (a: string, b: string) => `${a}/${b}`,
      dirname: (p: string) => p.slice(0, p.lastIndexOf('/')),
      mkdirSync: () => {},
      writeFileSync: (abs: string) => {
        if (abs.endsWith('StatsSection.vue')) throw new Error('EPERM');
      },
    };
    const r = restoreAcceptanceSnapshot(snap, files, '/out/proj', io as any);
    expect(r.writeFailed).toEqual(['package/components/StatsSection.vue']);
    expect(r.restored).toEqual(['package/index.vue']);
    expect(files['package/components/StatsSection.vue']).toBe('<template><img/></template>');
  });
});
