import { mkdtemp, mkdir, rm, writeFile, readFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

jest.mock('../../config/backend-root.js', () => ({
  workspaceRoot: process.cwd(),
}), { virtual: true })

import {
  LessCompileGate,
  rebalanceBlockComments,
  gateStandaloneLessWrite,
  rebalanceOrphanCloseParens,
  scanStandaloneLessDefects,
  stripDeepSelectors,
} from './less-compile-gate.js'

describe('LessCompileGate.validateDirectory', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mvgo-less-gate-'))
    await mkdir(join(root, 'package'), { recursive: true })
    await mkdir(join(root, 'resources', 'styles', 'themes'), { recursive: true })
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('reads final disk files and blocks an undefined variable introduced after earlier checks', async () => {
    await writeFile(
      join(root, 'package', 'index.vue'),
      `<template><div class="root" /></template>\n<style lang="less" scoped>@import '../resources/styles/index.less';</style>`,
      'utf-8',
    )
    await writeFile(join(root, 'resources', 'styles', 'index.less'), `@import './themes/theme-vars.less';\n@import './themes/dark.less';\n`, 'utf-8')
    await writeFile(join(root, 'resources', 'styles', 'themes', 'theme-vars.less'), `.common() { @font-cn: Arial; }\n.theme-dark() { @text: #fff; }\n`, 'utf-8')
    await writeFile(join(root, 'resources', 'styles', 'themes', 'dark.less'), `&.dark { .theme-dark(); @import (multiple) '../common.less'; }\n`, 'utf-8')
    await writeFile(join(root, 'resources', 'styles', 'common.less'), `.root { color: @text; font-family: @font-cn; }\n`, 'utf-8')

    const result = await LessCompileGate.validateDirectory(root)

    expect(result.pass).toBe(false)
    expect(result.diagnostics.some(item => String(item.message).includes('@font-cn'))).toBe(true)
  })

  it('passes when common and theme mixins are applied before importing common.less', async () => {
    await writeFile(
      join(root, 'package', 'index.vue'),
      `<template><div class="root" /></template>\n<style lang="less" scoped>@import '../resources/styles/index.less';</style>`,
      'utf-8',
    )
    await writeFile(join(root, 'resources', 'styles', 'index.less'), `@import './themes/theme-vars.less';\n@import './themes/dark.less';\n`, 'utf-8')
    await writeFile(join(root, 'resources', 'styles', 'themes', 'theme-vars.less'), `.common() { @font-cn: Arial; }\n.theme-dark() { @text: #fff; }\n`, 'utf-8')
    await writeFile(join(root, 'resources', 'styles', 'themes', 'dark.less'), `&.dark { .common(); .theme-dark(); @import (multiple) '../common.less'; }\n`, 'utf-8')
    await writeFile(join(root, 'resources', 'styles', 'common.less'), `.root { color: @text; font-family: @font-cn; }\n`, 'utf-8')

    const result = await LessCompileGate.validateDirectory(root)

    expect(result.pass).toBe(true)
  })

  it('heals a missing trailing brace before a new top-level rule', async () => {
    await writeFile(
      join(root, 'package', 'index.vue'),
      `<template><div class="root" /></template>\n<style lang="less" scoped>@import '../resources/styles/index.less';</style>`,
      'utf-8',
    )
    await writeFile(join(root, 'resources', 'styles', 'index.less'), `@import './themes/theme-vars.less';\n@import './themes/dark.less';\n`, 'utf-8')
    await writeFile(join(root, 'resources', 'styles', 'themes', 'theme-vars.less'), `.common() { @font-cn: Arial; }\n.theme-dark() { @text: #fff; }\n`, 'utf-8')
    await writeFile(join(root, 'resources', 'styles', 'themes', 'dark.less'), `&.dark { .common(); .theme-dark(); @import (multiple) '../common.less'; }\n`, 'utf-8')
    await writeFile(join(root, 'resources', 'styles', 'common.less'), `.root {\n  color: @text;\n.child { color: red; }\n`, 'utf-8')

    const result = await LessCompileGate.validateDirectory(root)

    expect(result.pass).toBe(true)
    expect(result.diagnostics.some(item => item.id === 'LESS-AUTOHEAL-001')).toBe(true)
  })

  // 🛡️ 治本扩展（2026-09-29 · mc-max-1790696917698-bf3612dc 实锤）：
  //   未闭合块注释 heal 的两处缺口——①「横幅正文 + 空行 + 首个规则」形态
  //   单行前瞻恒不命中；② 多横幅形态第一处插入后其余全漏修（下标集合误标）。
  //   复刻 bf3612dc：common.less 两个分区横幅均未闭合 + .vue SFC 内嵌 style
  //   经 @import common.less 链路（连锁 BLOCK 的真凶是 common.less）。
  it('heals multiple unclosed banner comments in common.less (bf3612dc shape)', async () => {
    await writeFile(
      join(root, 'package', 'index.vue'),
      `<template><div class="root" /></template>\n<style lang="less" scoped>@import '../resources/styles/index.less';</style>`,
      'utf-8',
    )
    await writeFile(join(root, 'resources', 'styles', 'index.less'), `@import './themes/theme-vars.less';\n@import './themes/dark.less';\n`, 'utf-8')
    await writeFile(join(root, 'resources', 'styles', 'themes', 'theme-vars.less'), `.common() { @font-cn: Arial; }\n.theme-dark() { @text: #fff; }\n`, 'utf-8')
    await writeFile(join(root, 'resources', 'styles', 'themes', 'dark.less'), `&.dark { .common(); .theme-dark(); @import (multiple) '../common.less'; }\n`, 'utf-8')
    // 两个分区横幅注释都只开不闭：正文行 + 空行 + 首个规则（旧 heal 单行前瞻不命中的形态）
    await writeFile(
      join(root, 'resources', 'styles', 'common.less'),
      [
        '/* ============================================================',
        '   标题区',
        '',
        '.c-x-title {',
        '  width: 100%;',
        '}',
        '',
        '/* ============================================================',
        '   图表区',
        '',
        '.c-x-chart {',
        '  height: 100%;',
        '}',
        '',
      ].join('\n'),
      'utf-8',
    )

    const result = await LessCompileGate.validateDirectory(root)

    expect(result.pass).toBe(true)
    // 磁盘上两处横幅都被补了独立闭合行
    const healed = await readFile(join(root, 'resources', 'styles', 'common.less'), 'utf-8')
    expect(healed.split('\n').filter(l => l.trim() === '*/')).toHaveLength(2)
    // 正常多行块注释不受影响：补的闭合行不得吞掉合法内容（规则仍在）
    expect(healed).toContain('.c-x-title {')
    expect(healed).toContain('.c-x-chart {')
  })

  // 🎯 2026-10-05 报错归属修正（mc-max-1791132079721-6b655282 真机实锤）：
  //   common.less:5 残留 `</a-table>`（SFC 模板闭合标签泄漏进 .less）→ LESS Unrecognised input。
  //   旧实现把 `error.line` 无条件加上调用方 .vue 的 <style> 行偏移 → 同一病灶被平移成
  //   107 / 154 / 166 等互不相同的**假行号**，且归错文件，下游 `_reviseFiles` 还会把无辜 .vue
  //   列为重写目标。修正后：file/line 一律指向真实病灶，引入方记在 `importedFrom`。
  it('⭐ 归属修正：@import 链内报错归到真实文件与真实行号，不再平移成 .vue 假行号', async () => {
    await writeFile(
      join(root, 'package', 'index.vue'),
      `<template><div class="root" /></template>\n<style lang="less" scoped>@import '../resources/styles/index.less';</style>`,
      'utf-8',
    )
    await writeFile(
      join(root, 'resources', 'styles', 'index.less'),
      [
        "@import './themes/theme-vars.less';",
        '.common();',
        '.theme-dark();',
        "@import (multiple) './common.less';",
        '',
      ].join('\n'),
      'utf-8',
    )
    await writeFile(
      join(root, 'resources', 'styles', 'themes', 'theme-vars.less'),
      `.common() { @font-cn: Arial; }\n.theme-dark() { @text: #fff; }\n`,
      'utf-8',
    )
    await writeFile(
      join(root, 'resources', 'styles', 'common.less'),
      [
        '.root {',
        '  color: @text;',
        '  font-family: @font-cn;',
        '}',
        '</a-table>',
        '',
      ].join('\n'),
      'utf-8',
    )

    const result = await LessCompileGate.validateDirectory(root)
    const blocks = result.diagnostics.filter(d => d.severity === 'BLOCK')

    expect(result.pass).toBe(false)
    expect(blocks.length).toBeGreaterThan(0)
    // ① 全部 BLOCK 都指向真实病灶文件，不再归到任何 .vue
    expect(blocks.every(b => b.file === 'resources/styles/common.less')).toBe(true)
    expect(blocks.some(b => String(b.file).endsWith('.vue'))).toBe(false)
    // ② 行号是真值（第 5 行），没有被 .vue 的 <style> 偏移放大
    expect(blocks.every(b => b.line === 5)).toBe(true)
    // ③ 引入方被记录（谁 @import 了它）
    expect(blocks.some(b => b.importedFrom === 'package/index.vue')).toBe(true)
    expect(blocks.some(b => b.importedFrom === 'resources/styles/index.less')).toBe(true)

    // ④ 修复提示：按定位去重（同一病灶只出现一条编号项）+ 说明引入方 + 不再出现 .vue 假定位
    const guidance = LessCompileGate.buildFixGuidance(result)
    expect(guidance).toContain('resources/styles/common.less:5:1')
    expect(guidance).toContain('引入方')
    expect(guidance).not.toMatch(/index\.vue:\d+/)
    expect(guidance.match(/resources\/styles\/common\.less:5:1/g)?.length).toBe(1)
  })

  it('不越界：.vue 自身 <style> 的语法错误仍归属该 .vue，且保留 <style> 行偏移', async () => {
    await writeFile(
      join(root, 'package', 'index.vue'),
      [
        '<template><div class="root" /></template>',
        '<style lang="less" scoped>',
        '.a {',
        '  color: red;',
        '}',
        '</a-table>',
        '</style>',
        '',
      ].join('\n'),
      'utf-8',
    )

    const result = await LessCompileGate.validateDirectory(root)
    const blocks = result.diagnostics.filter(d => d.severity === 'BLOCK')

    expect(result.pass).toBe(false)
    expect(blocks).toHaveLength(1)
    // 文件第 6 行 = `</a-table>`（offset = <style> 起始行 - 1 = 1）
    expect(blocks[0].file).toBe('package/index.vue')
    expect(blocks[0].line).toBe(6)
    expect(blocks[0].importedFrom).toBeNull()
  })
})

describe("rebalanceBlockComments（2026-10-15 · a715fafc B 降级配套）", () => {
  // a715fafc 事故形态：consolidator 误删多行块注释收尾行 → /* 失配
  const broken = [
    "/* ====",
    "   头部注释",
    "   ==== */",
    ".a { color: red; }",
    "}/* ====",      // 未闭合注释头（吞掉后面一个 */ 后错位）
    "   Header 区",
    "   ==== */",
    ".b { color: blue; }",
    "",
  ].join("\n");

  it("未闭合 /* 与孤立 */ 被抹除，输出注释配平", async () => {
    const out = rebalanceBlockComments(broken);
    const opens = (out.match(/\/\*/g) || []).length;
    const closes = (out.match(/\*\//g) || []).length;
    expect(opens).toBe(closes);
    // 样式规则保留
    expect(out).toContain(".a { color: red; }");
    expect(out).toContain(".b { color: blue; }");
  });

  it("已配平文本零改动（幂等）", async () => {
    const good = "/* x */\n.a { color: red; }\n/* y */\n";
    expect(rebalanceBlockComments(good)).toBe(good);
  });

  it("配平后可过 gateStandaloneLessWrite 注释缺陷检查", async () => {
    const retry = gateStandaloneLessWrite(rebalanceBlockComments(broken), "x.less");
    const commentDefects = retry.defects.filter((d) =>
      String(d.message || d).includes("注释")
    );
    expect(commentDefects).toHaveLength(0);
  });
});

describe("孤立右圆括号配平（2026-10-19 · mc-max-1792235823223-5e063d76 实锤）", () => {
  // 真机形态：LLM 写 `background: @color-bg-page);` —— 大括号平衡、缺陷扫描零命中，
  // 落盘后 LessCompileGate 报 `Unrecognised input. Possibly missing opening '('`(191:29)
  // ⇒ L0-B 重试 2 轮耗尽 ⇒ 整次生成失败。
  const realWorld = [
    "@fontSize: var(--fontSize);",
    ".c-x-slot-con {",
    "  display: flex;",
    "  min-height: 0; /* VERT-004 */;",
    "  background: @color-bg-page);",
    "}",
    "",
  ].join("\n");

  it("① 真机形态：孤立 ) 被抹除，结果可编译（阳性对照 · less 真编译）", async () => {
    // ⚠️ 用 require 而非 await import：jest 以 CJS 运行，动态 import 需 --experimental-vm-modules
    const less = require("less");
    // 原文必然编译失败
    let beforeErr = "";
    try {
      await less.render(realWorld, { globalVars: { "color-bg-page": "#fff", fontSize: "12px" } });
    } catch (e: any) {
      beforeErr = String(e?.message || e);
    }
    expect(beforeErr).toContain("Unrecognised input");

    const r = rebalanceOrphanCloseParens(realWorld);
    expect(r.changed).toBe(true);
    expect(r.dropped).toHaveLength(1);
    expect(r.source).toContain("background: @color-bg-page;");
    expect(r.source).not.toContain("@color-bg-page)");

    // 修后必须真能编译通过
    const out = await less.render(r.source, {
      globalVars: { "color-bg-page": "#fff", fontSize: "12px" },
    });
    expect(out.css).toContain("background: #fff");
  });

  it("② dropped 带行列（定位可辩驳）", () => {
    const r = rebalanceOrphanCloseParens(realWorld);
    expect(r.dropped[0].line).toBe(5);
    expect(r.dropped[0].code).toContain("@color-bg-page)");
  });

  it("③ 阴性：合法圆括号（calc/rgba/:not）零改动", () => {
    const ok = [
      ".a { width: calc(100% - 12px); }",
      ".b { color: rgba(0, 0, 0, 0.5); }",
      ".c:not(.d) { margin: 0; }",
      ".e { transform: translate(-50%, -50%); }",
    ].join("\n");
    const r = rebalanceOrphanCloseParens(ok);
    expect(r.changed).toBe(false);
    expect(r.source).toBe(ok);
  });

  it("④ 阴性：字符串与注释内的 ) 不误伤", () => {
    const ok = [
      '.a::after { content: ")("; }', // 字符串内的括号
      ".b { color: red; } /* ) 孤立在注释里 */",
      ".c { color: blue; } // )",
    ].join("\n");
    const r = rebalanceOrphanCloseParens(ok);
    expect(r.changed).toBe(false);
  });

  it("⑤ 缺 ( （无法确定性补位）⇒ 走缺陷扫描判坏，不假装修好", () => {
    const src = ".a { width: calc(100% - 12px; }\n"; // 缺 )
    const r = rebalanceOrphanCloseParens(src);
    expect(r.changed).toBe(false);
    const defects = scanStandaloneLessDefects(src);
    expect(defects.some((d: any) => d.id === "LESS-WRITE-004")).toBe(true);
  });

  it("⑥ 幂等：跑两次结果一致", () => {
    const once = rebalanceOrphanCloseParens(realWorld);
    const twice = rebalanceOrphanCloseParens(once.source);
    expect(twice.changed).toBe(false);
    expect(twice.source).toBe(once.source);
  });

  it("⑦ 接入写盘门禁：gateStandaloneLessWrite 修掉孤立 ) 且 ok=true", () => {
    const g = gateStandaloneLessWrite(realWorld, "resources/styles/common.less");
    expect(g.ok).toBe(true);
    expect(g.defects).toHaveLength(0);
    expect(g.fixes.join(",")).toContain("heal(parens:1)");
    expect(g.content).toContain("background: @color-bg-page;");
  });
});

// 🛡️ 2026-10-19（c-a579d-6a579df0 实锤）：独立 .less 里的 `:deep()` 在全局 CSS 注入下
//   是死规则（浏览器整条丢弃）⇒ 写盘门禁确定性改写为裸后代选择器。
describe("stripDeepSelectors（D-① :deep 死规则改写）", () => {
  const DEEP_LESS = [
    ".c-component-antd-input {",
    "  :deep(.ant-input) { background: transparent; }",
    "  &:deep(.ant-btn) { border-radius: 4px; }",
    "  :deep(.ant-input)::placeholder { color: @color-text-secondary; }",
    "}",
    "/* 注释里的 :deep(.x) 不动 */",
    ".s { content: ':deep(.y)'; }",
  ].join("\n");

  it("① 嵌套裸形态改写为后代（真机形态）", () => {
    const r = stripDeepSelectors(DEEP_LESS);
    expect(r.count).toBe(3);
    expect(r.source).toContain("  .ant-input { background: transparent; }");
    expect(r.source).toContain("  & .ant-btn { border-radius: 4px; }");
    expect(r.source).toContain("  .ant-input::placeholder { color: @color-text-secondary; }");
    // 注释/字符串内字面量不动
    expect(r.source).toContain("/* 注释里的 :deep(.x) 不动 */");
    expect(r.source).toContain("content: ':deep(.y)'");
  });

  it("② 内层嵌套括号完整取内层选择器", () => {
    const r = stripDeepSelectors(":deep(.a:not(.b)) { x: 1 }");
    expect(r.source).toBe(".a:not(.b) { x: 1 }");
    expect(r.count).toBe(1);
  });

  it("③ ::v-deep 旧写法同改", () => {
    const r = stripDeepSelectors(".p ::v-deep(.q) { x: 1 }");
    expect(r.source).toBe(".p .q { x: 1 }");
  });

  it("④ 未闭合 :deep( 不猜改写 ⇒ 缺陷扫描判 LESS-WRITE-005", () => {
    const r = stripDeepSelectors(".a { :deep(.b { x: 1 } }");
    expect(r.count).toBe(0);
    const defects = scanStandaloneLessDefects(r.source);
    expect(defects.some((d: any) => d.id === "LESS-WRITE-005")).toBe(true);
  });

  it("⑤ 接入写盘门禁：gateStandaloneLessWrite 产 strip-deep 修复且 ok=true", () => {
    const g = gateStandaloneLessWrite(DEEP_LESS, "resources/styles/common.less");
    expect(g.ok).toBe(true);
    expect(g.fixes.join(",")).toContain("strip-deep:3");
    expect(g.content).not.toMatch(/:{1,2}v?-deep\(/);
  });

  it("⑥ 幂等：已改写源再跑零改动", () => {
    const once = stripDeepSelectors(DEEP_LESS);
    const twice = stripDeepSelectors(once.source);
    expect(twice.count).toBe(0);
    expect(twice.source).toBe(once.source);
  });
});
