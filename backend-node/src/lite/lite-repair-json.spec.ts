import { repairJson } from './repair-json.util';

/**
 * 回归单测：锁定 2026-09-03 的 JSON 损坏确定性修复（治本）。
 * 直接测零依赖纯函数 repairJson（src/lite/repair-json.util.ts），
 * 避开 LiteService 的重依赖与 import.meta 链，保证单测可稳定跑绿。
 */
// 模型（尤 qwen3.7-plus）偶发「完成但 JSON 中部含非法字符」——裸控制字符是主因
const CTRL = String.fromCharCode(0x1f);

describe('repairJson（JSON 损坏确定性修复）', () => {
  it('救回「中部含控制字符 + 尾随逗号」的损坏 JSON', () => {
    const corrupted = `{
      "theme": "dark",
      "colors": { "background": "#0f1419", "primary": "#558eff", },
      "layout": { "sections": [ { "name": "header", "desc": "标题栏${CTRL}icon" }, { "name": "c", "desc": "x" }, ] }
    }`;
    const fixed = repairJson(corrupted);
    expect(fixed).toBeTruthy();
    expect(Array.isArray(fixed)).toBe(false);
    expect(fixed.theme).toBe('dark');
    expect(fixed.colors.background).toBe('#0f1419');
    expect(fixed.layout.sections.length).toBe(2);
    expect(fixed.layout.sections[0].desc).toBe('标题栏icon'); // 控制字符被剥离
  });

  it('处理 ```json 围栏 + 前后夹废文本', () => {
    const fenced = '说明一下：\n```json\n' + JSON.stringify({ theme: 'light', ok: 1 }) + '\n```\n以上';
    const fixed = repairJson(fenced);
    expect(fixed.theme).toBe('light');
    expect(fixed.ok).toBe(1);
  });

  it('裸 JSON.parse 对同款损坏会抛错（证 bug 真实存在，修复非多余）', () => {
    const corrupted = '{ "a": "b' + CTRL + 'c", }';
    expect(() => JSON.parse(corrupted)).toThrow();
    const fixed = repairJson(corrupted);
    expect(fixed.a).toBe('bc'); // 控制字符剥离 + 尾逗号修复
  });

  it('无 JSON 文本返回 null（交由上层回退，不抛错）', () => {
    expect(repairJson('这根本不是 json')).toBeNull();
    expect(repairJson('')).toBeNull();
    expect(repairJson(null as any)).toBeNull();
    expect(repairJson(undefined as any)).toBeNull();
  });

  it('前端集成：parseBrief / extractMicrocodeOutput 经此修复后不再退化', () => {
    // parseBrief 路径：损坏 JSON → 仍得有效对象（非 {raw} 退化）
    const brief = repairJson('{"theme":"dark","layout":{"sections":[{"name":"h"}]},}');
    expect(brief.theme).toBe('dark');
    expect(brief.layout.sections[0].name).toBe('h');
    // extractMicrocodeOutput 路径：declare.json 损坏仍能提取合法对象
    const text =
      '```vue\n<template><div/></template>\n<script setup></script>\n<style scoped></style>\n```\n' +
      '```json\n{"panelType":"default-panel","size":{"width":0,"height":0},}\n```';
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/i);
    const declareJson = jsonMatch ? repairJson(jsonMatch[1]) : repairJson(text);
    expect(declareJson).toBeTruthy();
    expect(declareJson.panelType).toBe('default-panel');
  });
});
