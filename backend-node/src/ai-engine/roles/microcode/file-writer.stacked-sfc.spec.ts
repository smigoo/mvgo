/**
 * 写盘门禁 × CODE-023 宿主联动剥除（2026-11-18 · c-env-monitor-dcb5f88c / 27bc42b2 实锤）
 *
 * 真机病灶链（同一毫秒段，日志逐字）：
 *   09:55:50.758 🚫 写盘门禁阻断 package/index.vue（template: Tags with side effect）
 *   09:55:50.807 ✅ 文件写入完成 skipped:2 skippedPaths:[package/index.vue, ...]
 *   09:55:50.808 🛡️ CODE-023 宿主联动剥除 hosts:["package/index.vue"]   ← 坏版在此写回磁盘
 *   09:55:50.808 🛡️ 终态 map 采纳写盘出口 adopted=13                     ← 坏版被固化
 *   ⇒ 磁盘 5305B 非法 index.vue（快照 5477B 经 prune 剥 ContentSection 后的产物）+ 任务 completed。
 *
 * 本 spec 锁三条：
 *   ① 叠加坏版在**写盘门禁**即被刀23 折叠治愈（不再进入判死/快照路径）；
 *   ② 健康文件逐字不判（阴性，零误伤）；
 *   ③ CODE-023 剥除后**必须过同一把尺**（validateVueSfc）：合法才写盘，仍非法则不写盘不改内存。
 */
import { mkdtempSync, mkdirSync, readFileSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

jest.mock('../../../config/backend-root.js', () => ({
  workspaceRoot: process.cwd(),
  // logger.js 依赖 logsDir（整模块 mock 必须同给），否则 join(undefined,…) 抛错 ⇒ suite fail-to-run
  logsDir: join(process.cwd(), 'logs'),
}), { virtual: true });

import { writeFiles } from './file-writer.js';
import { validateVueSfcExpressions } from '../../utils/sfc-syntax-validation.js';

const INNER = [
  '<template>',
  '  <base-panel panelKey="default-panel">',
  '    <div class="c-demo-root"><span>{{ title }}</span></div>',
  '  </base-panel>',
  '</template>',
].join('\n');
const SCRIPT = ['<script setup>', "const title = 'demo'", '</script>'].join('\n');
const STYLE = ['<style lang="less" scoped>', '.c-demo-root { color: #fff; }', '</style>'].join('\n');

/** 健康版：单一 template/script/style */
const GOOD_VUE = `${INNER}\n${SCRIPT}\n${STYLE}\n`;

/** dcb5f88c 形态：外层 template 包住整份 SFC，再平铺一份 script+style（整份双写） */
const STACKED_VUE = `<template>\n${INNER}\n${SCRIPT}\n${STYLE}\n</template>\n${SCRIPT}\n${STYLE}`;

/** 引用了 ContentSection 且结构叠加 —— 门禁折叠后仍须剥掉被拒子组件引用 */
const STACKED_WITH_REF = STACKED_VUE.replace(
  '<span>{{ title }}</span>',
  "<ContentSection />",
).replace(
  "const title = 'demo'",
  "import ContentSection from './components/ContentSection.vue'\nconst title = 'demo'",
);

/** 同一 script 块内把 ContentSection 重复 import 两次 ⇒ 门禁判死，但剥掉后即合法 */
const DUP_IMPORT_VUE = [
  '<template>',
  '  <div class="c-root"><ContentSection /></div>',
  '</template>',
  '<script setup>',
  "import ContentSection from './components/ContentSection.vue'",
  "import ContentSection from './components/ContentSection.vue'",
  '</script>',
].join('\n');

/**
 * 两份 SFC 平铺（无外层 template 包裹）+ 引用被拒子组件。
 * 实测：剥掉引用后**仍是两份 script/style** ⇒ validateVueSfc 仍非法；
 * 且 `collapseDuplicatedSfcBlocks` 判 `not-doubled`（无外层包裹，不认整份双写）
 * ⇒ 该形态**任何自愈都救不回**，只能由终验 fail-closed 移除。
 */
const FLAT_DOUBLE_WITH_REF = [
  '<template>',
  '  <div class="c-demo-root"><ContentSection /></div>',
  '</template>',
  '<script setup>',
  "import ContentSection from './components/ContentSection.vue'",
  "const title = 'demo'",
  '</script>',
  '<style lang="less" scoped>',
  '.c-demo-root { color: #fff; }',
  '</style>',
  '<script setup>',
  "import ContentSection from './components/ContentSection.vue'",
  "const title = 'demo'",
  '</script>',
  '<style lang="less" scoped>',
  '.c-demo-root { color: #fff; }',
  '</style>',
].join('\n');

const BAD_COMPONENT = ['<script setup>', 'const broken = 1', '</script>'].join('\n');

describe('file-writer 叠加 SFC × CODE-023 写盘复检', () => {
  let root: string;
  let logs: string[];

  // 把 meta 也序列化进日志行：真机日志是「消息 + JSON 字段」一体化，
  // 只收 message 会让「计数行字段是否齐全」这类断言变成空转（塞入参=假绿）。
  const logger = () => ({
    info: (m: string, meta?: unknown) => logs.push(push(m, meta)),
    warn: (m: string, meta?: unknown) => logs.push(push(m, meta)),
    error: (m: string, meta?: unknown) => logs.push(push(m, meta)),
    debug: () => {},
  });
  const push = (m: string, meta?: unknown) =>
    meta === undefined ? String(m) : `${m} ${JSON.stringify(meta)}`;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'mvgo-fw-stacked-'));
    mkdirSync(join(root, 'package/components'), { recursive: true });
    logs = [];
  });

  afterEach(() => {
    try { rmSync(root, { recursive: true, force: true }); } catch { /* 清理失败可忽略 */ }
  });

  it('① 阳性：整份双写的 index.vue 在写盘门禁即折叠治愈，不再判死/丢文件', () => {
    const rel = 'package/index.vue';
    const res: any = writeFiles({ [rel]: STACKED_VUE }, root, { logger: logger() } as any);

    const abs = join(root, rel);
    expect(existsSync(abs)).toBe(true); // 不再因判死而缺失
    const disk = readFileSync(abs, 'utf-8');
    // 折叠判据：一份 script、一份 style、模板内容守恒、表达式级合法
    expect((disk.match(/<script setup>/g) || []).length).toBe(1);
    expect((disk.match(/<style/g) || []).length).toBe(1);
    expect(disk).toContain('c-demo-root');
    expect(disk.length).toBeLessThan(STACKED_VUE.length);
    expect(validateVueSfcExpressions(disk, rel).valid).toBe(true);
    // 落盘口径：写成功 + 有确定性折叠留痕
    expect(res?.skipped || []).not.toContain(rel);
    expect(logs.some((l) => l.includes('SFC 整份双写已确定性折叠（写盘门禁判死前）'))).toBe(true);
  });

  it('② 阴性：健康 .vue 逐字不判、零折叠留痕', () => {
    const rel = 'package/index.vue';
    writeFiles({ [rel]: GOOD_VUE }, root, { logger: logger() } as any);

    const disk = readFileSync(join(root, rel), 'utf-8');
    expect(disk.trim()).toBe(GOOD_VUE.trim());
    expect(logs.some((l) => l.includes('SFC 整份双写折叠'))).toBe(false);
    // 🔴 计数行恒打（阴性也打）：`产物终验` 若只在 bad>0 时留痕，干净产物就无从证明终验跑过
    //   （真机 mc-max-1795004421051-15749b10 全程零记录 ⇒ 只能靠"没异常"推断 = 假绿风险）。
    const gateLine = logs.find((l) => l.includes('产物终验完成（表达式级）'));
    expect(gateLine).toBeTruthy();
    expect(gateLine).toContain('"checked"');
    expect(gateLine).toContain('"failClosed"');
  });

  it('③ CODE-023 剥除后复检通过 ⇒ 磁盘写成**合法版**（不写回被门禁判死的坏版）', () => {
    const hostRel = 'package/index.vue';
    // 真机前置态：早轮已把「重复 import」坏版落过盘（CODE-023 只在磁盘已存在时才回写）
    writeFileSync(join(root, hostRel), DUP_IMPORT_VUE, 'utf-8');
    expect(validateVueSfcExpressions(DUP_IMPORT_VUE, hostRel).valid).toBe(false); // 前置态确实非法

    writeFiles(
      {
        [hostRel]: DUP_IMPORT_VUE,
        'package/components/ContentSection.vue': BAD_COMPONENT,
      },
      root,
      { logger: logger() } as any,
    );

    const abs = join(root, hostRel);
    expect(existsSync(abs)).toBe(true);
    const disk = readFileSync(abs, 'utf-8');
    // 剥掉悬空引用后即合法 ⇒ 必须把这份合法版写盘（而不是原样/换形态写回坏版）
    expect(validateVueSfcExpressions(disk, hostRel).valid).toBe(true);
    expect(disk).not.toContain('import ContentSection');
    expect(disk).not.toContain('<ContentSection');
    expect(disk).toContain('c-root'); // 模板主体未被过度删除
    expect(logs.some((l) => l.includes('CODE-023 宿主联动剥除'))).toBe(true);
  });

  it('④ 剥除后**仍非法** ⇒ 拒绝写盘复活，改由末位终验 fail-closed 移除', () => {
    const hostRel = 'package/index.vue';
    writeFileSync(join(root, hostRel), FLAT_DOUBLE_WITH_REF, 'utf-8');

    writeFiles(
      {
        [hostRel]: FLAT_DOUBLE_WITH_REF,
        'package/components/ContentSection.vue': BAD_COMPONENT,
      },
      root,
      { logger: logger() } as any,
    );

    // 关键：不得把「剥掉引用、但仍两份 script/style」的非法版本写回磁盘（N3 假绿原路径）
    const abs = join(root, hostRel);
    if (existsSync(abs)) {
      const disk = readFileSync(abs, 'utf-8');
      expect(validateVueSfcExpressions(disk, hostRel).valid).toBe(true); // 留在盘上就必须合法
    }
    expect(logs.some((l) => l.includes('CODE-023 宿主联动剥除·已抑制'))).toBe(true);
    // 计数行恒打，便于真机区分「没跑 / 零命中 / 全抑制」
    expect(logs.some((l) => l.includes('CODE-023 宿主联动剥除·已评估'))).toBe(true);
  });

  it('⑤ 真机形态回归：叠加 + 引用被拒子组件 ⇒ 折叠治愈后剥引用，产物合法', () => {
    const hostRel = 'package/index.vue';
    writeFileSync(join(root, hostRel), STACKED_WITH_REF, 'utf-8');

    writeFiles(
      {
        [hostRel]: STACKED_WITH_REF,
        'package/components/ContentSection.vue': BAD_COMPONENT,
      },
      root,
      { logger: logger() } as any,
    );

    const abs = join(root, hostRel);
    expect(existsSync(abs)).toBe(true);
    const disk = readFileSync(abs, 'utf-8');
    expect(validateVueSfcExpressions(disk, hostRel).valid).toBe(true);
    expect((disk.match(/<script setup>/g) || []).length).toBe(1);
    expect(disk).not.toContain('<ContentSection');
    expect(disk).toContain('c-demo-root');
  });
});
