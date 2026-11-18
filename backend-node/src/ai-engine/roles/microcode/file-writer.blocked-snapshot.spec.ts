/**
 * 🛡️ 2026-11-18：SFC 阻断**完整原文快照**的验收（第 1 项，纯附加诊断）。
 *
 * 病灶链：`sfc-blocked.json` 的 `sample` 只存出错那一行（trim+截断400），
 *   `Invalid end tag` 这类**跨行标签错配**单看一行无法判断缺哪个开标签、
 *   哪个闭标签游离；而坏文件一旦被回退/重写覆盖，评审与修复轮都拿不到原文。
 *
 * 本 spec 锁两层：
 *  A. 纯函数 `writeBlockedSnapshot`：逐字写全文 / 安全文件名 / 目录自建 / fail-open；
 *  B. 端到端 `writeFiles`：判死时快照落盘 + cache 条目带 snapshot 路径，
 *     合法文件不产生快照（阴阳对照，防「恒落」假绿）。
 */
import { mkdtemp, mkdir, rm, readFile, readdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

jest.mock('../../../config/backend-root.js', () => ({
  workspaceRoot: process.cwd(),
  logsDir: join(process.cwd(), 'logs'),
}), { virtual: true });

import { writeFiles, writeBlockedSnapshot } from './file-writer.js';
import { validateVueSfc } from '../../utils/sfc-syntax-validation.js';

const CACHE = 'package/.mc-gen/cache';

/** 跨行标签错配样本：第 2 行开标签缺 '<'，导致末尾 </div> 游离 → Invalid end tag。 */
const BAD_CROSSLINE = [
  '<template>',
  '  div class="c-x-slot-con" style="display:flex"',
  '    <span>真实文案</span>',
  '  </div>',
  '</template>',
  '<script setup>',
  'const a = 1',
  '</script>',
].join('\n');

describe('writeBlockedSnapshot · 纯函数（全文快照）', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mvgo-fw-snap-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test('① 逐字写全文：跨行标签错配的每一行都可读回，非单行 sample', async () => {
    const rel = writeBlockedSnapshot(join(root, CACHE), 'package/index.vue', BAD_CROSSLINE);
    expect(rel).toBeTruthy();
    const text = await readFile(join(root, CACHE, rel as string), 'utf-8');
    expect(text).toBe(BAD_CROSSLINE);
    // 跨行证据确实在：游离闭标签那一行能被读到（单行 sample 做不到）
    expect(text.split('\n')[3]).toBe('  </div>');
  });

  test('② 安全文件名：路径分隔符/非法字符被替换，不产生子目录穿越', async () => {
    const rel = writeBlockedSnapshot(
      join(root, CACHE),
      'package/components/../Bad <vue>.vue',
      BAD_CROSSLINE,
    );
    expect(rel).toBeTruthy();
    expect(rel).not.toMatch(/[/\\]\.\.[/\\]/);
    expect((rel as string).split('/')[0]).toBe('bad-sfc');
    expect(existsSync(join(root, CACHE, rel as string))).toBe(true);
  });

  test('③ 目录不存在时自建（含多级 cacheDir）', async () => {
    const deep = join(root, 'a', 'b', 'c', 'cache');
    const rel = writeBlockedSnapshot(deep, 'x.vue', BAD_CROSSLINE);
    expect(rel).toBeTruthy();
    expect(existsSync(join(deep, rel as string))).toBe(true);
  });

  test('④ fail-open：空内容 / 不可写路径 ⇒ 返回 null，不抛错', async () => {
    expect(writeBlockedSnapshot(join(root, CACHE), 'x.vue', '')).toBeNull();
    // 把 cacheDir 指向一个普通文件，强制 mkdir 失败
    const blocker = join(root, 'blocker');
    await writeFile(blocker, 'not a dir');
    expect(writeBlockedSnapshot(blocker, 'x.vue', BAD_CROSSLINE)).toBeNull();
  });

  test('⑤ 幂等：同路径重复判死，快照被最新原文覆盖（不留陈旧坏版）', async () => {
    const cacheDir = join(root, CACHE);
    const rel = writeBlockedSnapshot(cacheDir, 'package/index.vue', BAD_CROSSLINE);
    const newer = BAD_CROSSLINE.replace('const a = 1', 'const a = 2');
    writeBlockedSnapshot(cacheDir, 'package/index.vue', newer);
    const text = await readFile(join(cacheDir, rel as string), 'utf-8');
    expect(text).toBe(newer);
    expect(text).not.toContain('const a = 1');
  });
});

describe('writeFiles · 判死快照端到端（阴阳对照）', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mvgo-fw-snap-e2e-'));
    await mkdir(join(root, 'package', 'components'), { recursive: true });
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test('⑥ 阳性：模板表达式非法 ⇒ 不落盘 + sfcBlocked 带 snapshot + cache 条目记相对路径', async () => {
    const bad = `<template>
  <div :style="{ background: , paddingLeft: '4px' }">x</div>
</template>
<script setup>
const a = 1
</script>
`;
    const r = writeFiles({ 'package/components/Bad.vue': bad }, root);
    const blocked = r.sfcBlocked.find((f: any) => f.path === 'package/components/Bad.vue');
    expect(blocked).toBeTruthy();
    expect(blocked.snapshot).toBeTruthy();

    // 快照文件存在且逐字等于「门禁实际判死的内容」。
    // 注意：writeFiles 清洗链 fixSpuriousLineBreaks 会剥尾部换行，故快照 = bad.trimEnd()，
    // 这才是门禁真正看见的字节（判据同源），不是入参原始字节。
    const snapPath = join(root, '.mc-gen', 'cache', blocked.snapshot);
    expect(existsSync(snapPath)).toBe(true);
    const snapText = await readFile(snapPath, 'utf-8');
    expect(snapText).toBe(bad.trimEnd());
    // 快照内容用同一权威判据重判，仍为坏文件（证明快照确实可复现判死，非空壳）
    expect(validateVueSfc(snapText, 'package/components/Bad.vue').valid).toBe(false);

    // sfc-blocked.json 条目带 snapshot 路径（相对 cacheDir）
    const cache = JSON.parse(
      await readFile(join(root, '.mc-gen', 'cache', 'sfc-blocked.json'), 'utf-8'),
    );
    expect(cache['package/components/Bad.vue'].snapshot).toBe(blocked.snapshot);
    expect(cache['package/components/Bad.vue'].sample).toBeTruthy();
  });

  test('⑦ 阴性：合法 SFC ⇒ sfcBlocked 空，bad-sfc 目录不产生快照', async () => {
    const ok = `<template>
  <div class="a">x</div>
</template>
<script setup>
const a = 1
</script>
`;
    const r = writeFiles({ 'package/components/Ok.vue': ok }, root);
    expect(r.sfcBlocked).toEqual([]);
    expect(existsSync(join(root, 'package/components/Ok.vue'))).toBe(true);
    const badDir = join(root, '.mc-gen', 'cache', 'bad-sfc');
    if (existsSync(badDir)) {
      expect(await readdir(badDir)).toEqual([]);
    }
  });

  test('⑧ 混合：一坏一好同轮 ⇒ 只给坏文件落快照，好文件不受影响', async () => {
    const bad = `<template>
  <div :style="{ background: , paddingLeft: '4px' }">x</div>
</template>
<script setup>
const a = 1
</script>
`;
    const ok = `<template><div class="ok">y</div></template><script setup>const b = 2</script>`;
    const r = writeFiles(
      {
        'package/components/Bad.vue': bad,
        'package/components/Ok.vue': ok,
      },
      root,
    );
    expect(r.sfcBlocked.map((f: any) => f.path)).toContain('package/components/Bad.vue');
    expect(r.sfcBlocked.map((f: any) => f.path)).not.toContain('package/components/Ok.vue');
    expect(existsSync(join(root, 'package/components/Ok.vue'))).toBe(true);
    const snapDir = join(root, '.mc-gen', 'cache', 'bad-sfc');
    const files = existsSync(snapDir) ? await readdir(snapDir) : [];
    expect(files.length).toBe(1);
    expect(files[0]).toContain('Bad.vue');
  });
});
