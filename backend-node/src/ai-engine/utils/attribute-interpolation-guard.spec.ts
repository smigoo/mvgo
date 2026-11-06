/**
 * 🛡️ 2026-11-06（mc-max-1793918750638-8cfbd218 实锤）：静态属性里的 `{{ }}` 必须在写盘前归一。
 * 病灶产物：`class="c-vehicle-monitor-slot c-vehicle-monitor-slot--{{ item.key }}"`
 * —— Vue 插值只在文本节点生效 ⇒ 类名永远不生效（状态区分色全丢）+ DOM 出现 `{`/`}` 非法类名。
 */
import { rewriteAttributeInterpolation, toTemplateLiteralExpr } from './attribute-interpolation-guard.js';

const wrap = (tpl: string) => `<template>\n${tpl}\n</template>\n<script setup>\nconst a = 1\n</script>\n`;

describe('attribute-interpolation-guard', () => {
  it('⭐ 阳性：class 内插值 ⇒ :class 模板字面量（真机 8cfbd218 形态）', () => {
    const files: any = {
      'package/components/StatsSection.vue': wrap(
        '  <div v-for="item in items" :key="item.key" class="c-vehicle-monitor-slot c-vehicle-monitor-slot--{{ item.key }}">x</div>',
      ),
    };
    const r = rewriteAttributeInterpolation(files, {});
    expect(r.rewritten).toHaveLength(1);
    expect(r.rewritten[0]).toMatchObject({ attr: 'class' });
    const out = files['package/components/StatsSection.vue'];
    // 静态部分与动态部分都在同一个表达式里（语义等价）
    expect(out).toContain('`c-vehicle-monitor-slot c-vehicle-monitor-slot--${item.key}`');
    expect(out).toContain(":class='");
    expect(out).not.toMatch(/class="[^"]*\{\{/);
  });

  it('⭐ 阳性：任意静态属性（title/alt/style）同理归一', () => {
    const files: any = {
      'package/components/A.vue': wrap('  <img alt="图标-{{ it.name }}" title="第{{ i + 1 }}项" />'),
    };
    const r = rewriteAttributeInterpolation(files, {});
    expect(r.rewritten.map((x: any) => x.attr).sort()).toEqual(['alt', 'title']);
    const out = files['package/components/A.vue'];
    expect(out).toContain('`图标-${it.name}`');
    expect(out).toContain('`第${i + 1}项`');
  });

  it('阴性：绑定属性（:class / v-bind）与纯文本插值一律不动', () => {
    const src = wrap(
      '  <div :class="`a--${item.key}`"><span>{{ item.label }}</span></div>',
    );
    const files: any = { 'package/components/B.vue': src };
    const r = rewriteAttributeInterpolation(files, {});
    expect(r.rewritten).toHaveLength(0);
    expect(files['package/components/B.vue']).toBe(src);
  });

  it('阴性：script 区里的 mustache（模板字符串）不得被当成属性改写', () => {
    const src = `<template><div>x</div></template>\n<script setup>\nconst t = "{{ notAttr }}"\n</script>\n`;
    const files: any = { 'package/components/C.vue': src };
    const r = rewriteAttributeInterpolation(files, {});
    expect(r.rewritten).toHaveLength(0);
    expect(files['package/components/C.vue']).toBe(src);
  });

  it('⭐ 阳性（防假绿）：CRLF + 深缩进 + 尾随空格的真机形态也必须真的写回', () => {
    // 旧实现拿 extractSfcTemplate 的规范化副本做 content.replace ⇒ 真机 includes=false
    // ⇒ 静默不写回却仍上报 rewritten（自测发现）。本用例锁「文件内容确实变了」。
    const src = [
      '<template>',
      '    <div class="wrap">   ',
      '        <i class="ico ico--{{ item.k }}" />',
      '    </div>',
      '</template>',
      '<script setup>',
      'const x = 1',
      '</script>',
      '',
    ].join('\r\n');
    const files: any = { 'package/components/E.vue': src };
    const r = rewriteAttributeInterpolation(files, {});
    expect(r.rewritten).toHaveLength(1);
    expect(files['package/components/E.vue']).not.toBe(src);
    expect(files['package/components/E.vue']).toContain(":class='`ico ico--${item.k}`'");
    expect(files['package/components/E.vue']).not.toContain('ico--{{');
    // 未命中的标签逐字保留（含尾随空格）
    expect(files['package/components/E.vue']).toContain('<div class="wrap">   ');
  });

  it('fail-open：表达式含反引号/${ ⇒ 跳过并留痕（不产出坏表达式）', () => {
    expect(toTemplateLiteralExpr('a-{{ `x` }}')).toBeNull();
    expect(toTemplateLiteralExpr('a-{{ `t${1}` }}')).toBeNull();
    const files: any = { 'package/components/D.vue': wrap('  <div class="a-{{ b + `c` }}">x</div>') };
    const r = rewriteAttributeInterpolation(files, {});
    expect(r.rewritten).toHaveLength(0);
    expect(r.skipped[0]).toMatchObject({ attr: 'class', reason: 'unsafe-expr' });
  });
});
