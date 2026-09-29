const { injectBgStyleBinding } = require('./dist/ai-engine/roles/microcode/resource-mounter.js');
const m3475 = { assignedVarName:'bg2', previewAnalysisRole:'bg', mountTarget:'t', bgRole:'sub-state',
  figmaBox:{x:64.8271484375,y:618.773681640625,width:129.5,height:9},
  parentBox:{x:64.8271484375,y:603.000244140625,width:129.5,height:24.7734375} };

// 复刻产物 L2 的「注入前」形态：LLM 写了 cover+repeat，position 由自愈器补 1px 31px（88:36 真值）
const tag = `<div class="c-traffic-monitor-card" data-section-id="2:3446" :style="{ backgroundSize: 'cover', backgroundPosition: '1px 31px', backgroundRepeat: 'no-repeat' }" v-bind="$attrs">`;
const out = injectBgStyleBinding(`<template>${tag}</template>`, tag, 'bg2', m3475);
console.log('=== injectBgStyleBinding(bg2 / 2:3475) 追加结果 ===');
console.log(out ? out.split('\n')[0] : '(null)');
console.log();
console.log('=== 产物实际形态（对照） ===');
console.log(`:style="{ ...{ backgroundSize: 'cover', backgroundPosition: '1px 31px', backgroundRepeat: 'no-repeat' }, backgroundImage: 'url(' + bg2 + ')', backgroundSize: 'cover', backgroundPosition: '0px 16px', backgroundRepeat: 'no-repeat' }"`);
