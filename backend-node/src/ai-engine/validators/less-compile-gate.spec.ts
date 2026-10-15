import { mkdtemp, mkdir, rm, writeFile, readFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

jest.mock('../../config/backend-root.js', () => ({
  workspaceRoot: process.cwd(),
}), { virtual: true })

import { LessCompileGate, rebalanceBlockComments, gateStandaloneLessWrite } from './less-compile-gate.js'

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
