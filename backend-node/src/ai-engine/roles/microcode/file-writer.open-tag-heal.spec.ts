/**
 * 🛡️ 2026-11-18 · 方案 A 端到端验收：写盘门禁**判死前**自愈缺开始标签。
 *
 * 证明三件事：
 *  ① 坏文件（裸 div 缺 <）在 writeFiles 里被自愈后**正常落盘**（不再进 sfcBlocked），
 *     且磁盘内容逐字含补回的 `<div ...>`；
 *  ② 合法文件零改动、不留快照（阴阳对照，防误伤）；
 *  ③ 真·不可修的畸形（模板表达式坏）仍照旧判死 + 落快照（回退路径未被抹掉）。
 */
import { mkdtemp, mkdir, rm, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

jest.mock('../../../config/backend-root.js', () => ({
  workspaceRoot: process.cwd(),
  logsDir: join(process.cwd(), 'logs'),
}), { virtual: true });

import { writeFiles } from './file-writer.js';

const SFC = (body: string) => `<template>
${body}
</template>
<script setup>
const a = 1
</script>
`;

describe('writeFiles · 缺开始标签判死前自愈（方案 A）', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mvgo-fw-opentag-'));
    await mkdir(join(root, 'package', 'components'), { recursive: true });
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('① 裸 div（缺 < + >）⇒ 自愈后正常落盘，不进 sfcBlocked，磁盘含补回标签', async () => {
    const bad = SFC(`  <base-panel panelKey="default-panel">
    div class="c-x-slot-con" style="display:flex"
      <span>真实文案</span>
    </div>
  </base-panel>`);
    const r = writeFiles({ 'package/components/Op.vue': bad }, root);
    expect(r.sfcBlocked.map((f: any) => f.path)).not.toContain('package/components/Op.vue');
    expect(existsSync(join(root, 'package/components/Op.vue'))).toBe(true);
    const onDisk = await readFile(join(root, 'package/components/Op.vue'), 'utf-8');
    expect(onDisk).toContain('<div class="c-x-slot-con" style="display:flex">');
    expect(onDisk).toContain('真实文案');
  });

  it('② 合法 SFC ⇒ 零改动落盘，无快照（阴阳对照）', async () => {
    const ok = SFC(`  <div class="a"><span>ok</span></div>`);
    const r = writeFiles({ 'package/components/Ok.vue': ok }, root);
    expect(r.sfcBlocked).toEqual([]);
    expect(existsSync(join(root, 'package/components/Ok.vue'))).toBe(true);
    const badDir = join(root, '.mc-gen', 'cache', 'bad-sfc');
    if (existsSync(badDir)) {
      const { readdir } = await import('fs/promises');
      expect(await readdir(badDir)).toEqual([]);
    }
  });

  it('③ 真·不可修畸形 ⇒ 仍判死 + 落快照（回退路径未抹掉）', async () => {
    const bad = `<template>
  <div :style="{ background: , paddingLeft: '4px' }">x</div>
</template>
<script setup>
const a = 1
</script>
`;
    const r = writeFiles({ 'package/components/Unfix.vue': bad }, root);
    expect(r.sfcBlocked.map((f: any) => f.path)).toContain('package/components/Unfix.vue');
    expect(existsSync(join(root, 'package/components/Unfix.vue'))).toBe(false);
    const blocked = r.sfcBlocked.find((f: any) => f.path === 'package/components/Unfix.vue');
    expect(blocked.snapshot).toBeTruthy();
    expect(existsSync(join(root, '.mc-gen', 'cache', blocked.snapshot))).toBe(true);
  });
});
