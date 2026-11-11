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
 * 🛡️ 2026-11-11（红卡根治）：**编译失败不再静默**。
 *   原实现 catch 后仅 warn、返回 false，而调用方（如 lite.service.ts P1.10）把 false
 *   当「非阻断」放过 ⇒ 坏产物带着「完整 100%」进预览，浏览器端现编 LESS 失败 ⇒
 *   用户看到「组件样式 (LESS) 渲染失败」红卡。
 *   现改为：编译失败时先跑 `repairLessDirectory`（确定性 healer + 以 less 报错为 oracle
 *   的定点手术）→ 再编译；仍失败则以 `compileIndexCssStrict` 的 `reason:'invalid'`
 *   如实上报，由调用方决定**不发布**，绝不带着坏样式装成功。
 */

import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import less from 'less'
import { repairLessDirectory } from '../validators/less-compile-gate.js'

/**
 * 🔴 2026-11-11：改为**静态** import less。
 * 原实现用 `await import('less')` 惰性加载，在 jest（CJS transform）下会抛
 * `A dynamic import callback was invoked without --experimental-vm-modules`
 * ⇒ 真编译终验在单测环境里恒失败（假红），且掩盖真实结论。
 * less-compile-gate.js 早已静态 import less 并在同一套 jest 下正常工作，故静态引入无风险。
 */

/**
 * 严格版本：编译 index.less → index.css，失败时先自动修复再重试，并如实上报结果。
 *
 * @param {string} outputPath 组件输出目录（磁盘绝对路径）
 * @param {object} [logger]
 * @param {{maxRepairRounds?: number}} [options]
 * @returns {Promise<{ok: boolean, reason: 'ok'|'missing'|'invalid', applied: string[], error: any, cssSize: number}>}
 */
export async function compileIndexCssStrict(outputPath, logger, options = {}) {
  const empty = { ok: false, reason: 'missing', applied: [], error: null, cssSize: 0 }
  if (!outputPath) return empty

  const styleDir = join(outputPath, 'resources', 'styles')
  const indexLessPath = join(styleDir, 'index.less')
  if (!existsSync(indexLessPath)) return empty

  // 阶段 1：真编译自愈（healer + oracle 定点手术），有修复则记录
  const repair = await repairLessDirectory(outputPath, {
    maxRounds: options.maxRepairRounds ?? 10,
    logger,
  })
  if (repair.applied.length) {
    logger?.info?.(`🔧 LESS 自动修复 ${repair.applied.length} 处（编译前）`, { applied: repair.applied })
  }
  if (!repair.ok) {
    const e = repair.error
    logger?.error?.(
      `❌ index.less 编译仍失败（已自动修复 ${repair.applied.length} 处）：${e?.filename || 'index.less'}:${e?.line || '?'} ${String(e?.message || '').split('\n')[0]}`,
      { applied: repair.applied },
    )
    return { ok: false, reason: 'invalid', applied: repair.applied, error: e, cssSize: 0 }
  }

  // 阶段 2：渲染出 CSS（自愈已保证可编译，此处只处理 I/O 异常）
  try {
    const compiler = options.lessImpl || less
    const result = await compiler.render(readFileSync(indexLessPath, 'utf-8'), {
      filename: indexLessPath,
      paths: [styleDir],
      javascriptEnabled: true,
    })
    writeFileSync(join(styleDir, 'index.css'), result.css, 'utf-8')
    return { ok: true, reason: 'ok', applied: repair.applied, error: null, cssSize: result.css.length }
  } catch (e) {
    logger?.error?.(`❌ index.less → index.css 写出失败：${e?.message || e}`)
    return { ok: false, reason: 'invalid', applied: repair.applied, error: e, cssSize: 0 }
  }
}

/**
 * 重新编译 outputPath 下的 resources/styles/index.less → index.css（布尔兼容版）。
 * 与 microcode-engineer.execute 第 5 步的编译参数保持一致（javascriptEnabled: true）。
 * 🛡️ 2026-11-11 起：失败前会先尝试确定性自愈 + 定点修复；@see compileIndexCssStrict
 *
 * @param {string} outputPath 组件输出目录（磁盘绝对路径）
 * @param {object} [logger] 可选日志对象（含 info/warn 方法）
 * @param {object} [lessImpl] 可选：注入的 less 模块（测试用），缺省走动态 import
 * @returns {Promise<boolean>} 是否产出了可编译的 index.css
 */
export async function recompileIndexCss(outputPath, logger, lessImpl = null) {
  if (!outputPath) return false

  const indexLessPath = join(outputPath, 'resources', 'styles', 'index.less')
  if (!existsSync(indexLessPath)) {
    return false
  }

  // 测试注入模式：保持原有行为（不跑自愈，避免单测依赖磁盘产物结构）
  if (lessImpl) {
    try {
      const result = await lessImpl.render(readFileSync(indexLessPath, 'utf-8'), {
        paths: [join(outputPath, 'resources', 'styles')],
        javascriptEnabled: true,
      })
      writeFileSync(join(outputPath, 'resources', 'styles', 'index.css'), result.css, 'utf-8')
      return true
    } catch (e) {
      logger?.warn?.(`⚠️ index.less → index.css 重编译失败（保留旧 index.css，非阻断）`, {
        error: e.message,
      })
      return false
    }
  }

  const strict = await compileIndexCssStrict(outputPath, logger)
  if (strict.ok) {
    logger?.info?.('✅ 已重新编译 index.less → index.css（refiner 后同步）', { size: strict.cssSize })
  }
  return strict.ok
}

/**
 * 判断一组 modifiedFiles 里是否包含 .less 文件（决定是否需要重编译 index.css）。
 * @param {string[]} modifiedFiles 相对路径数组
 * @returns {boolean}
 */
export function hasLessFile(modifiedFiles) {
  return Array.isArray(modifiedFiles) && modifiedFiles.some(f => typeof f === 'string' && f.endsWith('.less'))
}
