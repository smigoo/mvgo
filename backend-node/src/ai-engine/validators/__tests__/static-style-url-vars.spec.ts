/**
 * CODE-028 · 静态 `style` 里的裸 `url(<资源变量名>)` 检出（2026-10-27 · 593cf7f 实锤）
 *
 * 为什么必须单独一个守卫：CODE-022（未挂载）用的 `isResourceVarMounted` 是「全文还剩
 * `\bname\b` 就算挂载」，静态 style 里的 `url(fgStatBg0)` 恰好命中 ⇒ 判合规 ⇒ 全链
 * 认为没问题，而浏览器 404。本 spec 锁三态：
 *   ① 阳性：静态 style + 已 import ⇒ 必须报；
 *   ② 阴性：`:style` 绑定 / 相对路径 / data: / #id / 未 import / 非图片 import ⇒ 一律不报；
 *   ③ 配对对照（判别力）：**同一段 CSS 值**，只换前缀 `style=` ↔ `:style=` 结果必须相反
 *      —— 缺这条就无法证明「绑定与静态」的区分真的被编码进去了。
 */
import { describe, test, expect } from '@jest/globals'
// 直接取零依赖的 utils 层（validator 的 import 链会拉起 logger → backend-root，
// 在 jest 下触发 `import.meta.url` 与 `__filename` 的模块级 SyntaxError）。
import { findStaticStyleUrlVars } from '../../utils/resource-import-guard.js'

const SCRIPT = `<script setup>
import fgStatBg0 from '../../resources/images/bg-5909.png'
import fgStatBg1 from '../../resources/images/bg-5909.png'
import icon1 from '../../resources/images/image_473938-37.png'
import notImage from './helper.js'
</script>`

const sfc = (tpl: string) => `<template>\n${tpl}\n</template>\n${SCRIPT}\n`

describe('CODE-028 findStaticStyleUrlVars · 阳性', () => {
  test('静态 style 里的裸 url(已 import 的图片变量) ⇒ 报出变量名', () => {
    const code = sfc(
      `<div style="background-image:url(fgStatBg0);background-size:100% 100%;background-repeat:no-repeat;"></div>`,
    )
    expect(findStaticStyleUrlVars(code)).toEqual(['fgStatBg0'])
  })

  test('多个变量 ⇒ 全报、按首次出现序、不重复', () => {
    const code = sfc(
      `<div style="background-image:url(fgStatBg1)"></div><div style="background-image:url(fgStatBg0)"></div><div style="background-image:url(fgStatBg1)"></div>`,
    )
    expect(findStaticStyleUrlVars(code)).toEqual(['fgStatBg1', 'fgStatBg0'])
  })

  test('单引号包裹的静态 style 同样命中', () => {
    const code = sfc(`<div style='background-image:url(icon1)'></div>`)
    expect(findStaticStyleUrlVars(code)).toEqual(['icon1'])
  })

  test('url( name ) 带空白同样命中', () => {
    const code = sfc(`<div style="background-image: url(  fgStatBg0  )"></div>`)
    expect(findStaticStyleUrlVars(code)).toEqual(['fgStatBg0'])
  })

  test('真机形态复刻（6d79e69d ListSection.vue 卡底）', () => {
    const code = sfc(
      `<div class="card0" style="display:flex;flex-direction:row;width:134px;height:66px;flex:none;box-sizing:border-box;background-image:url(fgStatBg0);background-size:100% 100%;background-repeat:no-repeat;padding:0;"></div>`,
    )
    expect(findStaticStyleUrlVars(code)).toEqual(['fgStatBg0'])
  })
})

describe('CODE-028 findStaticStyleUrlVars · 阴性（零误报）', () => {
  test('`:style` 绑定是合法形态，绝不报', () => {
    const code = sfc(`<div :style="{ backgroundImage: 'url(' + fgStatBg0 + ')' }"></div>`)
    expect(findStaticStyleUrlVars(code)).toEqual([])
  })

  test('`v-bind:style` 绑定同样合法', () => {
    const code = sfc(`<div v-bind:style="{ backgroundImage: 'url(' + fgStatBg0 + ')' }"></div>`)
    expect(findStaticStyleUrlVars(code)).toEqual([])
  })

  test('静态 style 里是**相对路径**（真值写法）⇒ 不是变量，不报', () => {
    const code = sfc(`<div style="background-image:url(../resources/images/bg-5909.png)"></div>`)
    expect(findStaticStyleUrlVars(code)).toEqual([])
  })

  test('静态 style 里是引号字面量 ⇒ 不报', () => {
    const code = sfc(`<div style="background-image:url('./a.png')"></div>`)
    expect(findStaticStyleUrlVars(code)).toEqual([])
  })

  test('`url(#grad)` / `url(data:…)` / `url(https://…)` 均不报', () => {
    expect(findStaticStyleUrlVars(sfc(`<div style="background:url(#grad1)"></div>`))).toEqual([])
    expect(
      findStaticStyleUrlVars(sfc(`<div style="background:url(data:image/png;base64,AAA)"></div>`)),
    ).toEqual([])
    expect(
      findStaticStyleUrlVars(sfc(`<div style="background:url(https://a.com/x.png)"></div>`)),
    ).toEqual([])
  })

  test('变量未 import ⇒ 不越界（交给既有校验，本守卫不抢）', () => {
    const code = sfc(`<div style="background-image:url(fgStatBgX)"></div>`)
    expect(findStaticStyleUrlVars(code)).toEqual([])
  })

  test('import 的不是图片文件（.js）⇒ 不算资源变量，不报', () => {
    const code = sfc(`<div style="background-image:url(notImage)"></div>`)
    expect(findStaticStyleUrlVars(code)).toEqual([])
  })

  test('无 script / 无 template / 空串 ⇒ 零副作用', () => {
    expect(findStaticStyleUrlVars('')).toEqual([])
    expect(findStaticStyleUrlVars('<template><div style="background:url(bg1)"></div></template>')).toEqual(
      [],
    )
    expect(findStaticStyleUrlVars(`${SCRIPT}`)).toEqual([])
  })
})

describe('CODE-028 · 配对对照（判别力：静态 vs 绑定必须相反）', () => {
  test('同一段 CSS 值，`style=` 命中而 `:style=` 不命中', () => {
    // 静态：裸标识符进纯 CSS 文本 ⇒ 浏览器 404 ⇒ 必须报
    const staticForm = sfc(`<div style="background-image:url(fgStatBg0);"></div>`)
    // 绑定：同样的语义但走 Vue 求值 ⇒ 合法 ⇒ 必须不报
    const bindForm = sfc(`<div :style="{ backgroundImage: 'url(' + fgStatBg0 + ')' }"></div>`)
    expect(findStaticStyleUrlVars(staticForm)).toEqual(['fgStatBg0'])
    expect(findStaticStyleUrlVars(bindForm)).toEqual([])
  })

  test('🔴 回归对照：`data-style` 等自定义属性不是 CSS，不得误报', () => {
    const code = sfc(`<div data-style="background-image:url(fgStatBg0)"></div>`)
    expect(findStaticStyleUrlVars(code)).toEqual([])
  })

  test('🔴 判别力反证：把静态 style 换成 `:style` 绑定，同一变量立即从「报」变「不报」', () => {
    // 唯一差异就是属性名多一个 `:` —— 若正则少了 lookbehind 这一层，
    // 两种形态会同时命中/同时漏报，本 spec 就失去判别力。
    const staticOne = sfc(`<div style="background-image:url(fgStatBg0)"></div>`)
    const boundOne = sfc(`<div :style="'background-image:url(' + fgStatBg0 + ')'"></div>`)
    expect(findStaticStyleUrlVars(staticOne)).toEqual(['fgStatBg0'])
    expect(findStaticStyleUrlVars(boundOne)).toEqual([])
  })
})
