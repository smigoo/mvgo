/**
 * 刀 19（2026-10-28）：M5-7「禁止硬编码字体大小」与生成侧归一器判据同构。
 *
 * 实锤（c-af858-5af85852）：规范检查报 7 处 font-size 硬编码 error、canRelease=false，
 * 但 7 处全部是刀 53 确定性接管产物（fg- 类规则块 + fg- 内联 style）——
 * 这些 px 是 Figma 真值渲染，font-size-normalizer.js 对它们双重豁免
 * （round-10/12/16 三实锤：归一成 calc(@fontSize*N) 后 scoped 塌 13.71px、
 * 内联 LESS 变量被浏览器丢弃）。检查器裸正则不认识豁免 ⇒ 假阳性。
 *
 * 治本：两处 M5-7 判据与归一器同源（FG_TAKEOVER_CLASS_RX）：
 *   ① skills/frontend-mc-check/scripts/mc-check.cjs（独立 zip，内嵌同一正则文本）
 *   ② src/ai-engine/roles/microcode/mc-health-validator.js（直接 import）
 * 本 spec 锁三件事：同构（skill 内嵌正则 === 源正则）、skill CLI 实锤、validator 豁免。
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

jest.mock('../config/backend-root.js', () => ({
  workspaceRoot: process.cwd(),
  logsDir: '/tmp/mvgo-test-logs',
}), { virtual: true })

import { checkMcComponent } from '../ai-engine/roles/microcode/mc-health-validator.js';
import { FG_TAKEOVER_CLASS_RX } from '../ai-engine/utils/folded-grid-section-takeover.js';

const SKILL_ENTRY = resolve(
  __dirname,
  '../../skills/frontend-mc-check/scripts/mc-check.cjs',
);

/** 实锤复刻：c-af858 的 fg- 接管类规则块（真值 16px）+ 一个非接管硬编码（应被抓） */
const FG_STYLE = [
  '.c-demo-fg-text-383263-text { font-size: 16px; }',
  '.plain-title {',
  '  font-size: 18px;',
  '}',
].join('\n');

const FG_ONLY_STYLE = '.c-demo-fg-text-383263-text { font-size: 16px; }';

function mkComponentDir(styleBody: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'm57-fg-'));
  mkdirSync(join(dir, 'package/components'), { recursive: true });
  writeFileSync(
    join(dir, 'declare.json'),
    JSON.stringify({ componentId: 'c-demo', componentName: 'demo', version: 'v1.0.0' }),
  );
  writeFileSync(
    join(dir, 'package/index.vue'),
    '<template><div class="c-demo-fg-text-383263-text">x</div></template>\n',
  );
  writeFileSync(
    join(dir, 'package/components/ContentSection.vue'),
    `<template><span class="c-demo-fg-text-383263-text">{{ text }}</span></template>\n<style scoped>\n${styleBody}\n</style>\n`,
  );
  return dir;
}

function runSkill(dir: string) {
  const outDir = mkdtempSync(join(tmpdir(), 'm57-out-'));
  const ret = spawnSync(
    process.execPath,
    [SKILL_ENTRY, '--component-path', dir, '--output-dir', outDir],
    { timeout: 60_000, encoding: 'utf-8' },
  );
  if (ret.status !== 0) {
    throw new Error(`mc-check 退出码 ${ret.status}: ${String(ret.stderr).slice(-300)}`);
  }
  const stamped = readdirSync(outDir).filter((n) =>
    statSync(join(outDir, n)).isDirectory(),
  );
  const parsed = JSON.parse(
    readFileSync(join(stamped.map((s) => join(outDir, s)).sort().pop()!, 'check-result.json'), 'utf-8'),
  );
  const comp = parsed.components[0];
  return { comp, outDir };
}

describe('刀19 M5-7 fg- 接管豁免判据同构', () => {
  const cleanups: string[] = [];
  afterEach(() => {
    for (const d of cleanups.splice(0)) {
      if (existsSync(d)) rmSync(d, { recursive: true, force: true });
    }
  });

  it('同构锁：skill 内嵌正则文本 === 源 FG_TAKEOVER_CLASS_RX.source', () => {
    const skillSrc = readFileSync(SKILL_ENTRY, 'utf-8');
    expect(skillSrc).toContain(`/${FG_TAKEOVER_CLASS_RX.source}/`);
  });

  it('skill 实锤：fg- 接管 16px 豁免，非接管 18px 仍被抓', () => {
    const dir = mkComponentDir(FG_STYLE);
    cleanups.push(dir);
    const { comp, outDir } = runSkill(dir);
    cleanups.push(outDir);
    const m57 = (comp.results || []).find((r: any) => r.id === 'M5-7');
    expect(m57).toBeDefined();
    expect(m57.passed).toBe(false);
    // 只报非接管的 18px，fg- 16px 已豁免（且仅 1 处：无「、」并列、无「等N处」后缀）
    expect(m57.message).toContain('18px');
    expect(m57.message).not.toContain('16px');
    expect(m57.message).not.toMatch(/、|等\d+处/);
  });

  it('skill 反向：纯 fg- 接管字号 ⇒ M5-7 不产生失败项', () => {
    const dir = mkComponentDir(FG_ONLY_STYLE);
    cleanups.push(dir);
    const { comp, outDir } = runSkill(dir);
    cleanups.push(outDir);
    const m57 = (comp.results || []).find((r: any) => r.id === 'M5-7');
    // 全部豁免后 hasPxFontSize=false ⇒ 不产出 M5-7；若产出则必须通过
    if (m57) expect(m57.passed).toBe(true);
  });

  it('validator 豁免：fg- 规则块 + fg- 内联 style 不报 M5-7，非接管照报', () => {
    const files = {
      'declare.json': JSON.stringify({ componentId: 'c-demo', componentName: 'demo' }),
      'package/components/A.vue': [
        '<template>',
        '  <span class="c-demo-fg-text-1-text" style="font-size:16px;color:#fff">t</span>',
        '</template>',
        '<style scoped>',
        '.c-demo-fg-text-1-text { font-size: 16px; }',
        '.bad { font-size: 20px; }',
        '</style>',
      ].join('\n'),
    };
    const r = checkMcComponent(files, JSON.parse(files['declare.json'])) as any;
    const m57 = r.failed.find((f: any) => f.id === 'M5-7');
    expect(m57).toBeDefined();
    expect(m57.message).toContain('1 处');
  });

  it('validator 反向：全部 fg- 字号 ⇒ M5-7 通过', () => {
    const files = {
      'declare.json': JSON.stringify({ componentId: 'c-demo', componentName: 'demo' }),
      'package/components/A.vue': [
        '<template>',
        '  <span class="c-demo-fg-text-1-text" style="font-size:16px">t</span>',
        '</template>',
        '<style scoped>',
        '.c-demo-fg-text-1-text { font-size: 16px; }',
        '</style>',
      ].join('\n'),
    };
    const r = checkMcComponent(files, JSON.parse(files['declare.json'])) as any;
    expect(r.failed.find((f: any) => f.id === 'M5-7')).toBeUndefined();
  });
});
