/**
 * index.less → index.css 重编译工具
 *
 * 背景（方案三「幽灵样式」根治）：
 * component.js 引入的是编译产物 `resources/styles/index.css`（Vite 会拦截
 * custom-components 下的 .less 文件，所以必须预编译成 .css 才能被 component.js 直接 import）。
 * 该产物在 generateCode 阶段（microcode-engineer.execute 第 5 步）编译一次。
 *
 * 但 refiner（layout-refiner / style-refiner / layout-style-refiner）精修时会直接改磁盘的
 * `.vue` / `.less`（尤其 common.less / index.less），却不重新编译 index.css。
 * 结果：component.js 引入的 index.css 停留在旧类名/旧布局，而 scoped 样式的
 * `@import index.less` 是新内容 → 两套选择器并存（幽灵样式），布局被旧 CSS 覆盖。
 *
 * 修复：refiner 写盘后（若有 .less 变更）调用本函数，把 index.less 重新编译为 index.css，
 * 保证 component.js 引入的产物与 scoped 样式永远同源。
 *
 * 幂等 + 非阻断：index.less 不存在或编译失败时仅告警，不抛异常。
 */

import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

/**
 * 惰性加载 less 模块（Node ESM 运行时动态 import；与 microcode-engineer.execute
 * 第 5 步、screenshot-renderer.compileLessIfNeeded 的加载方式一致）。
 * 抽成独立函数便于单测 mock（Jest 的 ts-jest CJS 环境不支持动态 import()）。
 */
async function loadLess() {
  const mod = await import('less')
  return mod.default || mod
}

/**
 * 重新编译 outputPath 下的 resources/styles/index.less → index.css。
 * 与 microcode-engineer.execute 第 5 步的编译参数保持一致（javascriptEnabled: true）。
 *
 * @param {string} outputPath 组件输出目录（磁盘绝对路径）
 * @param {object} [logger] 可选日志对象（含 info/warn 方法）
 * @param {object} [lessImpl] 可选：注入的 less 模块（测试用），缺省走动态 import
 * @returns {Promise<boolean>} 是否成功重编译（index.less 不存在时返回 false，但不算错误）
 */
export async function recompileIndexCss(outputPath, logger, lessImpl = null) {
  if (!outputPath) return false

  const indexLessPath = join(outputPath, 'resources', 'styles', 'index.less')
  if (!existsSync(indexLessPath)) {
    return false
  }

  try {
    const less = lessImpl || (await loadLess())
    const result = await less.render(readFileSync(indexLessPath, 'utf-8'), {
      paths: [join(outputPath, 'resources', 'styles')],
      javascriptEnabled: true,
    })

    const indexPath = join(outputPath, 'resources', 'styles', 'index.css')
    writeFileSync(indexPath, result.css, 'utf-8')
    logger?.info?.(`✅ 已重新编译 index.less → index.css（refiner 后同步）`, {
      size: result.css.length,
    })
    return true
  } catch (e) {
    logger?.warn?.(`⚠️ refiner 后 index.less → index.css 重编译失败（保留旧 index.css，非阻断）`, {
      error: e.message,
    })
    return false
  }
}

/**
 * 判断一组 modifiedFiles 里是否包含 .less 文件（决定是否需要重编译 index.css）。
 * @param {string[]} modifiedFiles 相对路径数组
 * @returns {boolean}
 */
export function hasLessFile(modifiedFiles) {
  return Array.isArray(modifiedFiles) && modifiedFiles.some(f => typeof f === 'string' && f.endsWith('.less'))
}
