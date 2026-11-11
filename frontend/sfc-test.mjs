// 用 vue3-sfc-loader 在 Node 里编译两个 SFC，比较渲染函数根节点
import { loadModule } from 'vue3-sfc-loader'
import * as Vue from 'vue'
import lessMod from 'less'
import * as echarts from 'echarts'
import * as antd from 'ant-design-vue'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = '/Users/smigoo/工作/mvgo/frontend/workspace/custom-components'
const targets = process.argv.slice(2)

const options = {
  moduleCache: { vue: Vue, less: lessMod, echarts, 'ant-design-vue': antd },
  getFile(p) {
    const rel = String(p).replace(/^.*custom-components\//, '')
    const abs = path.join(ROOT, rel)
    if (fs.existsSync(abs)) return fs.readFileSync(abs, 'utf8')
    throw new Error('找不到文件: ' + rel)
  },
  addStyle() {},
  handleModule(type, getContentData, modulePath) {
    if (type === '.png' || type === '.jpg' || type === '.svg') return '/img.png'
    return undefined
  },
}

for (const id of targets) {
  try {
    const comp = await loadModule(`${id}/package/index.vue`, options)
    const render = comp.render || comp.setup?.render
    const src = render ? render.toString() : '(no render)'
    console.log('=====', id)
    console.log('renderHead:', src.slice(0, 300).replace(/\n/g, ' '))
    console.log('hasTemplateTag:', /["']template["']/.test(src))
  } catch (e) {
    console.log('=====', id, 'ERROR:', String(e).slice(0, 300))
  }
}
