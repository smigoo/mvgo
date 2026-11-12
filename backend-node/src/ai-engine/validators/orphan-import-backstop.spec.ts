/**
 * 🛡️ 根治⑧（2026-11-12 · mc-max-1794476159098-97af5197 实锤）：
 * CODE-022 确定性兜底 —— orphan-import-backstop 单测。
 *
 * 病灶复刻：LLM 自造「文件名派生 + bg 前缀」变量名（bgbg_m35 / bgbg_m36 ←
 * bg-_m-35.png / bg-_m-36.png）；bgbg_m35 挂 base-panel 活着、bgbg_m36 孤儿 import
 * ⇒ CODE-022 硬闸 ⇒ pre-write 修复器只迭代契约名 ⇒ 永不自愈 ⇒ 重试耗尽 fail-closed。
 */
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  healOrphanResourceImports,
  recountUnmountedResourceImports,
  tryFixOrphanResourceImports,
} from './orphan-import-backstop.js';

const MAPPING = [
  {
    downloadStatus: 'success',
    assignedVarName: 'bg_m35',
    resourceFile: 'resources/images/bg-_m-35.png',
  },
  {
    downloadStatus: 'success',
    assignedVarName: 'bg_m36',
    resourceFile: 'resources/images/bg-_m-36.png',
  },
];

/** 97af5197 真实形态：bgbg_m35 挂 base-panel（活）、bgbg_m36 孤儿 import */
const SFC_97AF5197 = `<template>
  <div class="base-panel" :style="{ backgroundImage: 'url(' + bgbg_m35 + ')' }">
    <span>内容</span>
  </div>
</template>
<script setup>
import { ref } from 'vue'
import bgbg_m35 from '../../resources/images/bg-_m-35.png'
import bgbg_m36 from '../../resources/images/bg-_m-36.png'
// 资源变量由系统自动注入（bgbg_m36 = bg-_m-36.png）
const title = ref('统计')
</script>
<style scoped>
.base-panel { background-size: 100% 100%; }
</style>
`;

describe('recountUnmountedResourceImports（与门禁 findUnmountedResourceVars 同口径）', () => {
  it('孤儿 import 检出；已挂载变量不报', () => {
    expect(recountUnmountedResourceImports(SFC_97AF5197)).toEqual(['bgbg_m36']);
  });

  it('无图片 import / 无 script ⇒ 空（不误报）', () => {
    expect(recountUnmountedResourceImports('<template><div/></template>')).toEqual([]);
    expect(recountUnmountedResourceImports('')).toEqual([]);
  });

  it('注释里的变量名不算挂载（门禁同口径：剥注释）', () => {
    const c = `<template><div/></template>
<script setup>
import bgbg_m36 from '../resources/images/bg-_m-36.png'
// bgbg_m36 用于背景
</script>`;
    expect(recountUnmountedResourceImports(c)).toEqual(['bgbg_m36']);
  });
});

describe('healOrphanResourceImports（① alias 归位 + ② 孤儿删除）', () => {
  it('97af5197 形态：臆造名 bgbg_m35 alias 回契约名 bg_m35（保留挂载），孤儿 bgbg_m36 import 连同假陈述注释删除', () => {
    const r = healOrphanResourceImports(SFC_97AF5197, MAPPING);
    expect(r.changed).toBe(true);
    expect(r.aliases).toEqual([{ from: 'bgbg_m35', to: 'bg_m35' }]);
    expect(r.pruned).toEqual(['bgbg_m36']);

    // alias：import 行与模板引用都归位契约名
    expect(r.content).toContain('import bg_m35 from');
    expect(r.content).toContain("'url(' + bg_m35 + ')'");
    expect(r.content).not.toContain('bgbg_m35');
    // prune：孤儿 import 与「整行注释提到该变量」的假陈述一并清除
    expect(r.content).not.toContain("import bgbg_m36");
    expect(r.content).not.toContain('bgbg_m36');
    // 契约名 bg_m36 未被引用 ⇒ 自愈只删不注入，绝不留下新的零引用 import
    expect(r.content).not.toContain('import bg_m36 from');
    // 复核归零
    expect(recountUnmountedResourceImports(r.content)).toEqual([]);
  });

  it('撞名守卫：契约名已被本文件其它声明占用 ⇒ 不改名（跳过），挂载保留', () => {
    const c = SFC_97AF5197.replace(
      "const title = ref('统计')",
      "const title = ref('统计')\nconst bg_m35 = 'fallback'",
    );
    const r = healOrphanResourceImports(c, MAPPING);
    expect(r.aliases).toEqual([]);
    expect(r.skipped).toEqual([{ name: 'bgbg_m35', contract: 'bg_m35', reason: 'contract-declared' }]);
    expect(r.content).toContain('bgbg_m35'); // 原样保留
    expect(r.pruned).toEqual(['bgbg_m36']);
  });

  it('契约名孤儿 import 同样 prune（与 pre-write pruneUnmountedResourceImports 行为一致）', () => {
    const c = `<template><div/></template>
<script setup>
import bg_m36 from '../resources/images/bg-_m-36.png'
import bg_m35 from '../resources/images/bg-_m-35.png'
</script>
<style>
.a { background-image: url('./x.png'); }
</style>`;
    const r = healOrphanResourceImports(c, MAPPING);
    // bg_m35/bg_m36 都零引用 ⇒ 双删；无挂载 ⇒ 无 alias
    expect(r.pruned.sort()).toEqual(['bg_m35', 'bg_m36']);
    expect(r.aliases).toEqual([]);
    expect(recountUnmountedResourceImports(r.content)).toEqual([]);
  });

  it('已挂载契约名 import 不动（不误删真挂载）', () => {
    const c = `<template>
  <div :style="{ backgroundImage: 'url(' + bg_m35 + ')' }"/>
</template>
<script setup>
import bg_m35 from '../resources/images/bg-_m-35.png'
</script>`;
    const r = healOrphanResourceImports(c, MAPPING);
    expect(r.changed).toBe(false);
    expect(r.content).toBe(c);
  });

  it('幂等：二次调用零改动', () => {
    const once = healOrphanResourceImports(SFC_97AF5197, MAPPING);
    const twice = healOrphanResourceImports(once.content, MAPPING);
    expect(twice.changed).toBe(false);
    expect(twice.aliases).toEqual([]);
    expect(twice.pruned).toEqual([]);
  });

  it('mapping 缺失 ⇒ alias 退化跳过、孤儿删除仍生效（CODE-022 与 mapping 无关）', () => {
    const r = healOrphanResourceImports(SFC_97AF5197, null);
    expect(r.aliases).toEqual([]);
    expect(r.pruned).toEqual(['bgbg_m36']);
    // bgbg_m35 已挂载且无契约名可归位 ⇒ 原样保留（活的挂载不动）
    expect(r.content).toContain('bgbg_m35');
    expect(recountUnmountedResourceImports(r.content)).toEqual([]);
  });
});

describe('tryFixOrphanResourceImports（hard-gate 出口磁盘兜底）', () => {
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'orphan-import-backstop-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('CODE-022 BLOCK 指到的文件磁盘自愈并复核归零', () => {
    mkdirSync(join(dir, 'package', 'components'), { recursive: true });
    mkdirSync(join(dir, '.mc-gen'), { recursive: true });
    writeFileSync(
      join(dir, '.mc-gen', 'resource-dom-mapping.json'),
      JSON.stringify(MAPPING),
      'utf-8',
    );
    writeFileSync(join(dir, 'package', 'index.vue'), SFC_97AF5197, 'utf-8');

    const r = tryFixOrphanResourceImports(dir, [
      {
        id: 'CODE-022',
        severity: 'BLOCK',
        file: 'package/index.vue',
        message: '资源变量未挂载：import 了 1 个资源变量但 0 处引用（bgbg_m36）',
      },
    ]);
    expect(r.fixed).toBe(true);
    expect(r.remaining).toEqual([]);

    const onDisk = readFileSync(join(dir, 'package', 'index.vue'), 'utf-8');
    expect(onDisk).toContain('import bg_m35 from');
    expect(onDisk).not.toContain('bgbg_m36');
    expect(recountUnmountedResourceImports(onDisk)).toEqual([]);
  });

  it('无 CODE-022 issue ⇒ 不触发（fixed=false，零副作用）', () => {
    mkdirSync(join(dir, 'package'), { recursive: true });
    writeFileSync(join(dir, 'package', 'index.vue'), SFC_97AF5197, 'utf-8');
    const before = readFileSync(join(dir, 'package', 'index.vue'), 'utf-8');
    const r = tryFixOrphanResourceImports(dir, [
      { id: 'CODE-023', severity: 'BLOCK', file: 'package/index.vue', message: '悬空子组件标签：<Foo>（缺组件文件）' },
    ]);
    expect(r.fixed).toBe(false);
    expect(readFileSync(join(dir, 'package', 'index.vue'), 'utf-8')).toBe(before);
  });
});
