/**
 * 背景归属：兄弟段误剥 + 空壳 :style + 宿主外壳终局兜底（2026-11-17 · ef014f7d 实锤）
 *
 * 病灶链（真机 mc-max-1794845381637-ef014f7d，同一秒落盘前后两份快照 diff 确证）：
 *   1. `backstopMountBgOwnership` 正确给两个**兄弟段** 1:388 / 1:400 各补绑同一张
 *      bg-1-390.png（mapping 里是 1:390 与 1:402 两条独立 owner，同图实例）；
 *   2. `stripDuplicateAncestorBg` / `stripDuplicateSectionRootBg` 的判据是「该 var 在本元素
 *      **之后的整段模板**里再次出现」⇒ 把兄弟段判成双重挂载 ⇒ 剥掉 1:388 的 backgroundImage，
 *      只留 `{ backgroundSize, backgroundPosition, backgroundRepeat }` 空壳 ⇒ 该段背景永久丢失；
 *   3. `<base-panel>` 上被注入 `:style="{ backgroundImage: 'url(' + bgctive414 + ')' ... }"`
 *      （80×26 的 tab 激活态胶囊图按 100%×100% 铺满整块面板）—— M6-3a 剥离在生成阶段执行，
 *      背景注入 pass 在其后，故落盘前必须再兜一次（同一判据函数，非第二份正则）。
 *
 * 本 spec 锁定四条语义：兄弟不剥 / 祖先-后代仍剥 / 空壳整条清 / base-panel 终局剥。
 */

jest.mock('../../config/backend-root.js', () => ({
  backendRoot: process.cwd(),
  projectRoot: process.cwd(),
  workspaceRoot: process.cwd() + '/workspace',
  customComponentsDir: process.cwd() + '/workspace/custom-components',
  vue3ComponentsDir: process.cwd() + '/workspace/vue3-components',
  tempComponentsDir: process.cwd() + '/temp-components',
  dataDir: process.cwd() + '/data',
  logsDir: process.cwd() + '/logs',
  configDir: process.cwd() + '/config',
  chatAttachmentsDir: process.cwd() + '/temp-chat-attachments',
  apifoxZipsDir: process.cwd() + '/data/apifox-zips',
  apiCatalogsDir: process.cwd() + '/data/api-catalogs',
  resolveFrontendWorkspacePath: () => process.cwd(),
  frontendCustomComponentsDir: () => process.cwd(),
  frontendVue3ComponentsDir: () => process.cwd(),
}), { virtual: true })

import {
  runPreWriteSelfHealing,
  stripDuplicateAncestorBg,
  stripDuplicateSectionRootBg,
} from './pre-write-self-healing.js'
import { stripBasePanelInlineBackground } from './host-shell-bg.js'

const silentLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }

describe('兄弟段同挂同一 bg 不得被剥（ef014f7d 回归锚）', () => {
  it('阳性对照：兄弟两段各挂 bg4 ⇒ 两处 backgroundImage 全部保留', () => {
    const src = `<template>
  <div class="root">
    <div class="seg-a" data-section-id="1:388" :style="{ backgroundImage: 'url(' + bg4 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }"></div>
    <div class="seg-b" data-section-id="1:400" :style="{ backgroundImage: 'url(' + bg4 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }"></div>
  </div>
</template>`
    const outAncestor = stripDuplicateAncestorBg(src)
    expect(outAncestor).toBe(src)
    const outRoot = stripDuplicateSectionRootBg(src)
    expect(outRoot).toBe(src)
    // 两段都必须仍有 backgroundImage（旧判据会把 seg-a 的剥掉）
    const segA = outAncestor.match(/data-section-id="1:388"[^>]*>/)![0]
    const segB = outAncestor.match(/data-section-id="1:400"[^>]*>/)![0]
    expect(segA).toContain('backgroundImage')
    expect(segB).toContain('backgroundImage')
  })

  it('阳性对照：真祖先-后代同挂 ⇒ 剥祖先、保留后代', () => {
    const src = `<template>
  <div data-section-id="136:127" :style="{ backgroundImage: 'url(' + bg1 + ')', backgroundSize: '100% 100%' }">
    <div class="card" data-section-id="136:128" :style="{ backgroundImage: 'url(' + bg1 + ')' }">A</div>
  </div>
</template>`
    const out = stripDuplicateAncestorBg(src)
    const ancestor = out.match(/<div data-section-id="136:127"[^>]*>/)![0]
    expect(ancestor).not.toContain('backgroundImage')
    expect(out).toContain('data-section-id="136:128" :style')
    expect(out).toContain('backgroundImage')
  })

  it('阴性：单个元素挂 bg、后代不重复 ⇒ 原样返回（引用相等）', () => {
    const src = `<template>
  <div data-section-id="1:388" :style="{ backgroundImage: 'url(' + bg4 + ')' }">
    <span>x</span>
  </div>
</template>`
    expect(stripDuplicateAncestorBg(src)).toBe(src)
    expect(stripDuplicateSectionRootBg(src)).toBe(src)
  })
})

describe('剥除后空壳 :style 整条清除', () => {
  it('祖先剥掉 image 后只剩 background* 非 image 键 ⇒ 整条 :style 删除，不留「有尺寸无图」空壳', () => {
    const src = `<template>
  <div data-section-id="2:1" :style="{ backgroundImage: 'url(' + bg1 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
    <div class="c" data-section-id="2:2" :style="{ backgroundImage: 'url(' + bg1 + ')' }">A</div>
  </div>
</template>`
    const out = stripDuplicateAncestorBg(src)
    const ancestor = out.match(/<div data-section-id="2:1"[^>]*>/)![0]
    expect(ancestor).toBe('<div data-section-id="2:1">')
    expect(ancestor).not.toContain('backgroundSize')
    expect(ancestor).not.toContain('backgroundPosition')
  })

  it('阴性：剥 image 后仍有非 background 键（布局）⇒ 只剥 image，保留 :style', () => {
    const src = `<template>
  <div data-section-id="2:3" :style="{ backgroundImage: 'url(' + bg1 + ')', display: 'flex' }">
    <div class="c" data-section-id="2:4" :style="{ backgroundImage: 'url(' + bg1 + ')' }">A</div>
  </div>
</template>`
    const out = stripDuplicateAncestorBg(src)
    const ancestor = out.match(/<div data-section-id="2:3"[^>]*>/)![0]
    expect(ancestor).not.toContain('backgroundImage')
    expect(ancestor).toContain("display: 'flex'")
  })
})

describe('宿主外壳（base-panel）内联背景终局兜底', () => {
  it('阳性：base-panel 上的动态 :style 背景被整条剥离（ef014f7d 原样形态）', () => {
    const src = `<template>
  <base-panel panelKey="aio-panel" :style="{ backgroundImage: 'url(' + bgctive414 + ')', backgroundPosition: '0px 0px', backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' }">
    <div class="c-slot-con"></div>
  </base-panel>
</template>`
    const out = stripBasePanelInlineBackground(src)
    expect(out).not.toContain('bgctive414')
    expect(out).toContain('<base-panel panelKey="aio-panel">')
  })

  it('阳性：runPreWriteSelfHealing 端到端剥掉 base-panel 背景并计数', () => {
    const files = {
      'package/index.vue': `<template>
  <base-panel panelKey="default-panel" :style="{ backgroundImage: 'url(' + bg2 + ')', backgroundSize: '100% 100%' }">
    <div class="c-x-slot-con" style="display:flex;flex-direction:column"></div>
  </base-panel>
</template>
<script setup>
import bg2 from '../resources/images/bg-tile2-active-414.png'
</script>`,
    }
    const { files: out, summary } = runPreWriteSelfHealing(
      files as any,
      {},
      { logger: silentLogger as any },
    )
    // 只断言 base-panel 开标签被剥净（import 行可能按剪枝策略保留/删除，不是本守卫职责）
    const bpTag = out['package/index.vue'].match(/<base-panel[^>]*>/)![0]
    expect(bpTag).not.toContain('backgroundImage')
    expect(bpTag).not.toContain('backgroundSize')
    expect((summary as any).hostShellBgStripped || 0).toBe(1)
  })

  it('阴性：base-panel 无背景 ⇒ 不产生改动、不计数', () => {
    const files = {
      'package/index.vue': `<template>
  <base-panel panelKey="default-panel">
    <div class="c-x-slot-con"></div>
  </base-panel>
</template>`,
    }
    const { files: out, summary } = runPreWriteSelfHealing(
      files as any,
      {},
      { logger: silentLogger as any },
    )
    expect((summary as any).hostShellBgStripped || 0).toBe(0)
    expect(out['package/index.vue']).toContain('<base-panel panelKey="default-panel">')
  })
})
