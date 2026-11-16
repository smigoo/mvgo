/**
 * 🛡️ 消歧三回归锚（2026-11-16 · c-traffic-trend-10176e21 快照源预览实锤）
 *
 * 病灶：快照代理 base（…/code-snapshots/{rev}/file?path=resources/styles/index.css）
 * 走 `new URL(rel, base)` 时 query 不参与相对消解 ⇒ `../images/bg.png` 产出
 * `…/code-snapshots/images/bg.png`（丢 revision、丢 ?path=）⇒ 404 ⇒ 背景规则
 * cascade 竞争失败 ⇒ computed background-image = none（bg 供料/注入/编译全对仍白底）。
 *
 * 修复：rewriteCssAssetUrls 的 base 命中 `/file?path=<虚拟路径>` 形态时走
 * resolveAgainstBase——相对路径在 **path 参数虚拟路径内**段级归一，回填同代理形态
 * （保 revision、保其余 query）。绝对/协议/data 引用原样（幂等）。
 *
 * 前端仓无 jest/vitest ⇒ node 直跑断言（与 ts-offline-module-check 同法）：
 *   node src/utils/__tests__/css-asset-url.snapshot-path.spec.mjs
 */
import { rewriteCssAssetUrls, rewriteVueStyleAssetUrls } from '../css-asset-url.js'
import { readFileSync } from 'node:fs'

let pass = 0
let fail = 0
const t = (name, cond) => { cond ? pass++ : (fail++, console.log('✕ ' + name)) }

const SNAP = 'http://h:2610/api/tasks/c-x/code-snapshots/r-abc/file?path=resources%2Fstyles%2Findex.css&preview=1&token=T'
const WS = 'http://h:2610/api/preview/g/c/resources/styles/index.css'

const r1 = rewriteCssAssetUrls("a{background-image:url('../images/bg.png')}", SNAP)
t('快照形态 ../images 归一到 path=resources/images', r1.includes('path=resources%2Fimages%2Fbg.png'))
t('快照形态保 revision', r1.includes('r-abc'))
t('快照形态保 preview/token query', r1.includes('preview=1&token=T'))
t('引号闭合完整（修复：模板曾丢右引号）', r1.includes('.png&preview=1&token=T")'))

const r2 = rewriteCssAssetUrls("a{background:url('icon.png')}", SNAP)
t('同目录相对归一', r2.includes('path=resources%2Fstyles%2Ficon.png'))

const r3 = rewriteCssAssetUrls("a{background:url('../images/bg.png')}", WS)
t('常规路径形态标准解析（行为不变）', r3.includes('/api/preview/g/c/resources/images/bg.png'))

const r4 = rewriteCssAssetUrls("a{background:url('/abs/x.png')} b{background:url('https://c/x')} c{background:url(data:image/png;base64,xx)}", SNAP)
t('绝对路径不动', r4.includes("url('/abs/x.png')"))
t('https 不动', r4.includes("url('https://c/x')"))
t('data: 不动', r4.includes('data:image/png'))

const once = rewriteCssAssetUrls("a{background:url('../images/bg.png')}", SNAP)
t('幂等：二次执行不变', rewriteCssAssetUrls(once, SNAP) === once)

const r6 = rewriteCssAssetUrls("a{background:url('../../../../etc/x')}", SNAP)
t('越界 ../ 回退标准解析（不猜路径）', !r6.includes('path=etc'))

const r7 = rewriteVueStyleAssetUrls("<style>a{background:url('../images/bg.png')}</style><template><img src='../x'></template>", SNAP)
t('SFC style 通道同享修复', r7.includes('path=resources%2Fimages%2Fbg.png'))

console.log(`css-asset-url 消歧三: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
