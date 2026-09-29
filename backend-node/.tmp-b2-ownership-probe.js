/**
 * ② 行为探针：bgBindingOwnership + injectBgStyleBinding 归属判据
 * 全部调用 dist 真函数（零 LLM、零源码改动）
 */
const { bgBindingOwnership, injectBgStyleBinding } = require('./dist/ai-engine/roles/microcode/resource-mounter.js');

let pass = 0, fail = 0;
function eq(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else fail++;
  console.log(`${ok ? '✅' : '❌'} ${label}\n     got  = ${JSON.stringify(got)}\n     want = ${JSON.stringify(want)}`);
}

console.log('=== A. bgBindingOwnership 判据表 ===');
eq('无 backgroundImage → none', bgBindingOwnership(`<div class="card" :style="{ display: 'flex' }">`, 'bg2'), 'none');
eq('完全无 :style → none', bgBindingOwnership(`<div class="card">`, 'bg2'), 'none');
eq('self: 拼接形', bgBindingOwnership(`:style="{ backgroundImage: 'url(' + bg2 + ')' }"`, 'bg2'), 'self');
eq('self: 模板形', bgBindingOwnership(':style="{ backgroundImage: `url(${bg2})` }"', 'bg2'), 'self');
eq('self: 裸变量', bgBindingOwnership(`:style="{ backgroundImage: url(bg2) }"`, 'bg2'), 'self');
eq('self: 连字符键', bgBindingOwnership(`style="background-image: url(bg2)"`, 'bg2'), 'self');
eq('other: 拼接形', bgBindingOwnership(`:style="{ backgroundImage: 'url(' + bg4 + ')' }"`, 'bg2'), 'other');
eq('other: 模板形', bgBindingOwnership(':style="{ backgroundImage: `url(${bg4})` }"', 'bg2'), 'other');
eq('literal: 相对路径', bgBindingOwnership(`:style="{ backgroundImage: 'url(../resources/images/x.png)' }"`, 'bg2'), 'literal');
eq('多声明取首个（bg4 在前）', bgBindingOwnership(`:style="{ backgroundImage: 'url(' + bg4 + ')', backgroundSize: 'cover', backgroundImage: 'url(' + bg2 + ')' }"`, 'bg2'), 'other');
eq('归属而非名字（inner 含 bg2 但绑 bg4）', bgBindingOwnership(`:style="{ backgroundImage: 'url(' + bg4 + ')', backgroundPosition: '0px 16px' }"`, 'bg2'), 'other');

console.log('\n=== B. injectBgStyleBinding 归属闸门 ===');
const m3475 = { assignedVarName: 'bg2', previewAnalysisRole: 'bg', mountTarget: 't', bgRole: 'sub-state',
  figmaBox: { x: 64.8271484375, y: 618.773681640625, width: 129.5, height: 9 },
  parentBox: { x: 64.8271484375, y: 603.000244140625, width: 129.5, height: 24.7734375 } };

const cardRootBefore = `<div class="c-traffic-monitor-card" data-section-id="2:3446" :style="{ backgroundSize: 'cover', backgroundPosition: '1px 31px', backgroundRepeat: 'no-repeat' }" v-bind="$attrs">`;
const diags = [];
const outB1 = injectBgStyleBinding(`<template>${cardRootBefore}</template>`, cardRootBefore, 'bg2', m3475, diags);
eq('B1 无背景绑定 ⇒ 允许挂载', outB1 !== null, true);
eq('B1 诊断为空', diags.length, 0);

const cardRootWithBg4 = `<div class="c-traffic-monitor-card" data-section-id="2:3446" :style="{ ...{ backgroundSize: 'cover', backgroundPosition: '1px 31px', backgroundRepeat: 'no-repeat' }, backgroundImage: 'url(' + bg4 + ')', backgroundSize: '191px 80px', backgroundPosition: '1px 31px', backgroundRepeat: 'no-repeat' }" v-bind="$attrs">`;
const diags2 = [];
const outB2 = injectBgStyleBinding(`<template>${cardRootWithBg4}</template>`, cardRootWithBg4, 'bg2', m3475, diags2);
eq('B2 宿主被 bg4 占用 ⇒ 拒绝追加（null）', outB2, null);
eq('B2 诊断记录冲突', diags2.map((d) => d.reason + '/' + d.occupiedBy), ['bg-binding-conflict/other']);

const diags3 = [];
const outB3 = injectBgStyleBinding(`<template>${cardRootWithBg4}</template>`, cardRootWithBg4, 'bg4', m3475, diags3);
eq('B3 已绑本资源 ⇒ 幂等（null）', outB3, null);
eq('B3 无冲突诊断', diags3.length, 0);

const tagTpl = '<div class="c-x" :style="{ backgroundImage: `url(${bg7})`, backgroundSize: \'cover\' }">';
const outB4 = injectBgStyleBinding(`<template>${tagTpl}</template>`, tagTpl, 'bg2', m3475);
eq('B4 模板形他人绑定 ⇒ 拒绝', outB4, null);

const tagLit = `<div class="c-x" style="background-image: url(../resources/images/bg-_m-36.png)">`;
const outB5 = injectBgStyleBinding(`<template>${tagLit}</template>`, tagLit, 'bg2', m3475);
eq('B5 原生 style 字面量路径 ⇒ 拒绝', outB5, null);

const tagPlain = `<div class="c-x" style="display:flex;flex-direction:column;">`;
const outB6 = injectBgStyleBinding(`<template>${tagPlain}</template>`, tagPlain, 'bg2', m3475);
eq('B6 原生 style 无背景 ⇒ 允许挂载', outB6 !== null, true);

console.log(`\n=== 结果：${pass} passed / ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);
