#!/usr/bin/env node
/**
 * 微码组件规范检查脚本 v1.0.20
 *
 * 支持前端（Vite 项目）和后端（Node.js 服务）两种运行模式
 *
 * v1.0.20 变更：
 * - 检查项按「检查对象」划分为 M1~M5 五大系列（取消 M6 独立系列与 W 警告系列）
 * - 检查结果三态解耦：pass（通过）/ error（阻断）/ warning（提醒），级别作为结果属性
 * - 组件类型简化为两类：business / service（工具组件通过 businessExemptionList 白名单豁免）
 * - 废弃字段（versionCode）、硬编码颜色归入 M3-14 / M5-10（warning 级）
 *
 * v2.3 破坏性变更：warnings 数组元素由字符串改为与 results 一致的
 * { id, name, passed, message } 结构，便于入库与按 ID 统计。
 *
 * 用法：
 *   node mc-check.cjs                                         # 检查所有组件
 *   node mc-check.cjs c-mc-micro-image                        # 检查单个组件
 *   node mc-check.cjs --component-path /abs/path              # 检查指定绝对路径的组件
 *   node mc-check.cjs --output-dir /abs/path                  # 指定报告输出目录
 *   node mc-check.cjs --format json                           # 指定输出格式：json | html | md | all (默认: all)
 *   node mc-check.cjs --component-path /path --format json    # 后端调用模式（仅输出JSON）
 */

const fs = require('fs')
const path = require('path')

// 从脚本所在目录向上 4 级回到项目根（aidocs/skills/frontend-mc-check/scripts/）
const ROOT = path.resolve(__dirname, '../../../..')
const CFG = JSON.parse(fs.readFileSync(path.join(__dirname, 'mc-check-config.json'), 'utf-8'))
const { naming, enums } = CFG

// ─── CLI 参数解析 ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const COMPONENT_PATH_IDX = args.indexOf('--component-path')
const COMPONENT_PATH = COMPONENT_PATH_IDX !== -1 ? args[COMPONENT_PATH_IDX + 1] : null
const OUTPUT_DIR_IDX = args.indexOf('--output-dir')
const OUTPUT_DIR = OUTPUT_DIR_IDX !== -1 ? args[OUTPUT_DIR_IDX + 1] : null
const FORMAT_IDX = args.indexOf('--format')
const FORMAT = FORMAT_IDX !== -1 ? args[FORMAT_IDX + 1] : 'all'
const TARGET = args.find(
  (a) =>
    !a.startsWith('--') &&
    a !== (COMPONENT_PATH || '') &&
    a !== (OUTPUT_DIR || '') &&
    a !== (FORMAT || '')
)

// 组件基础目录：支持绝对路径（后端模式）和相对路径（前端模式）
const COMPONENT_BASE = COMPONENT_PATH
  ? path.dirname(COMPONENT_PATH)
  : path.isAbsolute(CFG.componentBaseDir)
    ? CFG.componentBaseDir
    : path.join(ROOT, CFG.componentBaseDir)

// ─── 工具函数 ─────────────────────────────────────────────────────────────────
const isKebab = (s) => new RegExp(naming.kebabCasePattern).test(s)
const isCamel = (s) => new RegExp(naming.camelCasePattern).test(s)

// 计算文件相对于组件目录的相对路径，用于跨平台兼容
const relPath = (dir, file) => path.relative(dir, file)

function getComponentDirs() {
  if (COMPONENT_PATH) return [path.basename(COMPONENT_PATH)]
  if (TARGET) return [TARGET]
  return fs
    .readdirSync(COMPONENT_BASE)
    .filter((n) => fs.statSync(path.join(COMPONENT_BASE, n)).isDirectory())
}

function readFile(p) {
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : null
}

function localDateTimeStr() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`
}

function issue(id, name, passed, msg, level = 'error') {
  return { id, name, passed, level, message: msg }
}

/**
 * 移除代码中的注释内容，避免注释中的示例代码被误判为真实调用。
 * 处理：块注释（含 JSDoc /** ... *\/）和单行注释（// ...）
 */
function stripComments(code) {
  return code
    .replace(/<!--[\s\S]*?-->/g, '') // HTML 注释（Vue 文件 <!-- --> 头部块）
    .replace(/\/\*[\s\S]*?\*\//g, '') // JS 块注释（含 JSDoc）
    .replace(/\/\/[^\n]*/g, '') // JS 单行注释
}

function collectFiles(baseDir, exts = ['.vue', '.js'], ignoreExts = []) {
  const files = []
  if (!fs.existsSync(baseDir)) return files
  const walk = (d) => {
    fs.readdirSync(d).forEach((f) => {
      const fp = path.join(d, f)
      if (fs.statSync(fp).isDirectory() && f !== 'node_modules') walk(fp)
      else if (exts.some((e) => f.endsWith(e)) && !ignoreExts.some((e) => f.endsWith(e)))
        files.push(fp)
    })
  }
  walk(baseDir)
  return files
}

/**
 * 判断组件是否需要执行 business 适用范围的检查项
 * @param {Object} declare - declare.json 内容
 * @param {string} componentId - 组件 ID
 * @returns {boolean} true 业务组件（执行 business 项），false 服务组件或白名单豁免
 */
function isBusinessComponent(declare, componentId) {
  const componentCategory = declare.componentCategory
  if (componentCategory === 'service') {
    return false
  }

  const exemptionList = CFG.businessExemptionList || []
  const isExempt = exemptionList.some((pattern) => {
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$')
      return regex.test(componentId)
    }
    return pattern === componentId
  })
  return !isExempt
}

/**
 * 收集组件样式内容（resources/styles 下 .less 文件 + package 下 .vue 的 <style> 块）
 * 供 M5-6/M5-7（@fontSize/硬编码字体）与 M5-10（硬编码颜色）共用，避免重复扫描
 * @param {string} dir - 组件目录
 * @returns {Array<{file: string, content: string}>} 样式内容集合
 */
function collectStyleSources(dir) {
  const styleSources = []
  const stylesDir = path.join(dir, 'resources/styles')
  collectFiles(stylesDir, ['.less'])
    .filter((f) => !f.includes(`${path.sep}themes${path.sep}`))
    .forEach((f) => {
      styleSources.push({ file: relPath(dir, f), content: readFile(f) || '' })
    })
  collectFiles(path.join(dir, 'package'), ['.vue']).forEach((f) => {
    const raw = readFile(f) || ''
    const styleBlocks = [...raw.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
    styleBlocks.forEach((m) => {
      styleSources.push({ file: relPath(dir, f) + ' <style>', content: m[1] })
    })
  })
  return styleSources
}

// ─── M1 命名规范 ──────────────────────────────────────────────────────────────
function checkM1(dirName, declare) {
  const results = []
  const cid = declare.componentId || ''
  const cname = declare.componentName || ''

  const cidErrors = []
  if (!cid) {
    cidErrors.push('componentId 缺失')
  } else {
    if (!cid.startsWith(naming.componentIdPrefix))
      cidErrors.push(`未以 "${naming.componentIdPrefix}" 开头`)
    if (!isKebab(cid)) cidErrors.push('不符合 kebab-case')
    if (cid !== dirName) cidErrors.push(`与目录名 "${dirName}" 不一致`)
    if (cid.length > naming.componentIdMaxLength)
      cidErrors.push(`长度 ${cid.length} 超过 ${naming.componentIdMaxLength}`)
  }
  results.push(
    issue('M1-1', 'componentId规范', cidErrors.length === 0, cidErrors.join('；') || '通过')
  )

  const nameLen = [...cname].length
  const nameOk =
    nameLen >= naming.componentNameMinLength && nameLen <= naming.componentNameMaxLength
  results.push(
    issue(
      'M1-2',
      'componentName长度',
      nameOk,
      nameOk
        ? '通过'
        : `"${cname}" 长度 ${nameLen}，要求 ${naming.componentNameMinLength}-${naming.componentNameMaxLength} 字符`
    )
  )

  const ver = declare.version || ''
  const verOk = new RegExp(naming.versionPattern).test(ver)
  results.push(
    issue('M1-3', 'version格式', verOk, verOk ? '通过' : `"${ver}" 不符合规范，应为 v1.0.0`)
  )

  return results
}

// ─── M2 必要文件 ──────────────────────────────────────────────────────────────
function checkM2(dir, declare) {
  const results = []
  const hasLayoutConfig = !!declare.layoutConfig

  const required = ['package/index.vue', 'declare.json', 'declare.js', 'component.js']
  const missing = required.filter((f) => !fs.existsSync(path.join(dir, f)))
  results.push(
    issue(
      'M2-1',
      '必要文件存在性',
      missing.length === 0,
      missing.length ? `缺少：${missing.join('、')}` : '通过'
    )
  )

  const previewPath = path.join(dir, 'resources/images', naming.previewImageName)
  results.push(
    issue(
      'M2-2',
      'mc-preview.png存在',
      fs.existsSync(previewPath),
      fs.existsSync(previewPath) ? '通过' : `resources/images/${naming.previewImageName} 不存在`
    )
  )

  const cssVarsPath = path.join(dir, 'resources/config/css-vars.js')
  results.push(
    issue(
      'M2-3',
      'css-vars.js存在性',
      fs.existsSync(cssVarsPath),
      fs.existsSync(cssVarsPath) ? '通过' : 'resources/config/css-vars.js 不存在（必须配置）'
    )
  )

  const themesDir = path.join(dir, 'resources/styles/themes')
  const themeKeys = (declare.themeConfig?.list || []).map((t) => t.key).filter(Boolean)
  const themeFilesToCheck = ['theme-vars.less', ...themeKeys.map((k) => `${k}.less`)]
  const missingTheme = themeFilesToCheck.filter((f) => !fs.existsSync(path.join(themesDir, f)))
  results.push(
    issue(
      'M2-4',
      'themes目录结构',
      missingTheme.length === 0,
      missingTheme.length ? `themes/ 缺少：${missingTheme.join('、')}` : '通过'
    )
  )

  const indexLessPath = path.join(dir, 'resources/styles/index.less')
  results.push(
    issue(
      'M2-5',
      'resources/styles/index.less存在',
      fs.existsSync(indexLessPath),
      fs.existsSync(indexLessPath) ? '通过' : 'resources/styles/index.less 不存在（必须配置）'
    )
  )

  if (hasLayoutConfig) {
    const errors = []
    const previewNames = []
    ;(declare.layoutConfig.list || []).forEach((item, i) => {
      if (!item.previewName) {
        errors.push(`list[${i}] 缺少 previewName 字段`)
        return
      }

      previewNames.push(item.previewName)

      if (!item.previewName.startsWith(naming.previewImagePrefix))
        errors.push(
          `list[${i}].previewName "${item.previewName}" 未以 "${naming.previewImagePrefix}" 开头`
        )
      else if (!fs.existsSync(path.join(dir, 'resources/images', item.previewName)))
        errors.push(`预览图 "${item.previewName}" 不存在于 resources/images/`)
    })
    results.push(
      issue(
        'M2-6',
        'layoutConfig预览图',
        errors.length === 0,
        errors.length ? errors.join('；') : '通过'
      )
    )

    // M2-5b: 预览图名称唯一性（仅在 M2-5 通过时检查）
    if (errors.length === 0 && previewNames.length > 0) {
      const duplicates = previewNames.filter((name, i) => previewNames.indexOf(name) !== i)
      const uniqueDuplicates = [...new Set(duplicates)]
      results.push(
        issue(
          'M2-7',
          'layoutConfig预览图唯一性',
          uniqueDuplicates.length === 0,
          uniqueDuplicates.length ? `previewName 重复：${uniqueDuplicates.join('、')}` : '通过'
        )
      )
    }
  }

  return results
}

// ─── M3 declare.json 字段规范 ─────────────────────────────────────────────────
function checkM3(declare, dir, isBusiness) {
  const results = []

  const topMissing = ['componentId', 'componentName', 'version'].filter((k) => !declare[k])
  if (!declare.attribute?.aspectRatio) topMissing.push('attribute.aspectRatio')
  if (declare.businessEvents === undefined) topMissing.push('businessEvents')
  if (declare.businessStatuses === undefined) topMissing.push('businessStatuses')
  if (!declare.themeConfig?.list?.length) topMissing.push('themeConfig（至少一个主题）')
  results.push(
    issue(
      'M3-1',
      'declare.json必填字段',
      topMissing.length === 0,
      topMissing.length ? `缺少：${topMissing.join('、')}` : '通过'
    )
  )

  const evErrors = []
  Object.entries(declare.businessEvents || {}).forEach(([key, ev]) => {
    if (!ev.eventId) evErrors.push(`${key}: 缺少 eventId`)
    else if (!isKebab(ev.eventId))
      evErrors.push(`${key}: eventId "${ev.eventId}" 不符合 kebab-case`)
    if (!ev.eventName) evErrors.push(`${key}: 缺少 eventName`)
    if (
      ev.eventDataSchema !== undefined &&
      (typeof ev.eventDataSchema !== 'object' ||
        Array.isArray(ev.eventDataSchema) ||
        ev.eventDataSchema === null)
    )
      evErrors.push(`${key}: eventDataSchema 必须为 object 类型`)
    const schemaKeys = new Set()
    Object.entries(ev.eventDataSchema || {}).forEach(([fk, fv]) => {
      if (!fv.key) evErrors.push(`${key}.eventDataSchema.${fk}: 缺少 key`)
      else {
        if (schemaKeys.has(fv.key)) evErrors.push(`${key}.eventDataSchema: key "${fv.key}" 重复`)
        schemaKeys.add(fv.key)
      }
      if (!fv.name) evErrors.push(`${key}.eventDataSchema.${fk}: 缺少 name`)
      if (!fv.type) evErrors.push(`${key}.eventDataSchema.${fk}: 缺少 type`)
      else if (!enums.eventDataSchemaTypes.includes(fv.type))
        evErrors.push(`${key}.eventDataSchema.${fk}: type "${fv.type}" 不合法`)
    })
  })
  if (Object.keys(declare.businessEvents || {}).length > 0)
    results.push(
      issue(
        'M3-3',
        'businessEvents字段完整性',
        evErrors.length === 0,
        evErrors.length
          ? evErrors.slice(0, 3).join('；') + (evErrors.length > 3 ? `…等${evErrors.length}处` : '')
          : '通过'
      )
    )

  const stErrors = []
  Object.entries(declare.businessStatuses || {}).forEach(([key, st]) => {
    if (!st.statusId) stErrors.push(`${key}: 缺少 statusId`)
    else if (!isKebab(st.statusId))
      stErrors.push(`${key}: statusId "${st.statusId}" 不符合 kebab-case`)
    if (!st.statusName) stErrors.push(`${key}: 缺少 statusName`)
    const paramKeys = new Set()
    Object.entries(st.parameters || {}).forEach(([pk, pv]) => {
      if (!pv.key) stErrors.push(`${key}.parameters.${pk}: 缺少 key`)
      else {
        if (paramKeys.has(pv.key)) stErrors.push(`${key}.parameters: key "${pv.key}" 重复`)
        paramKeys.add(pv.key)
      }
      if (!pv.name) stErrors.push(`${key}.parameters.${pk}: 缺少 name`)
      if (!pv.type) stErrors.push(`${key}.parameters.${pk}: 缺少 type`)
      else if (!enums.eventDataSchemaTypes.includes(pv.type))
        stErrors.push(`${key}.parameters.${pk}: type "${pv.type}" 不合法`)
    })
  })
  if (Object.keys(declare.businessStatuses || {}).length > 0)
    results.push(
      issue(
        'M3-4',
        'businessStatuses字段完整性',
        stErrors.length === 0,
        stErrors.length
          ? stErrors.slice(0, 3).join('；') + (stErrors.length > 3 ? `…等${stErrors.length}处` : '')
          : '通过'
      )
    )

  if (declare.cssVariableConfig?.length > 0) {
    const typeErrors = []
    declare.cssVariableConfig.forEach((item, i) => {
      if (!item.name) typeErrors.push(`[${i}] 缺少 name`)
      if (!item.key) typeErrors.push(`[${i}] 缺少 key`)
      if (!item.type) typeErrors.push(`[${i}] 缺少 type`)
      else if (!enums.cssVariableTypes.includes(item.type))
        typeErrors.push(
          `[${i}].type "${item.type}" 不合法，允许：${enums.cssVariableTypes.join('/')}`
        )
    })
    results.push(
      issue(
        'M3-6',
        'cssVariableConfig字段规范',
        typeErrors.length === 0,
        typeErrors.length ? typeErrors.join('；') : '通过'
      )
    )

    // M3-4b/M3-4c: cssVariableConfig 与 css-vars.js 双向校验
    const cssVarsPath = path.join(dir, 'resources/config/css-vars.js')
    if (fs.existsSync(cssVarsPath)) {
      const cssVarsContent = readFile(cssVarsPath) || ''
      const cssVarsKeys = extractCssVarsKeys(cssVarsContent)
      const frameworkVars = new Set(CFG.enums.frameworkPresetCssVars || [])

      // M3-4b: cssVariableConfig 中定义的变量必须在 css-vars.js 中存在
      const configKeys = declare.cssVariableConfig.map((item) => item.key)
      const missingInCssVars = configKeys.filter(
        (key) => !cssVarsKeys.has(key) && !frameworkVars.has(key)
      )

      if (missingInCssVars.length > 0) {
        results.push(
          issue(
            'M3-7',
            'cssVariableConfig与css-vars.js一致性',
            false,
            `cssVariableConfig 中定义的以下变量在 css-vars.js 中缺失：${missingInCssVars.join('、')}`
          )
        )
      }

      // M3-4c: css-vars.js 中的自定义变量必须在 cssVariableConfig 中声明
      const cssVarsKeysArray = Array.from(cssVarsKeys).filter((key) => !frameworkVars.has(key))
      const configKeySet = new Set(configKeys)
      const missingInConfig = cssVarsKeysArray.filter((key) => !configKeySet.has(key))

      if (missingInConfig.length > 0) {
        results.push(
          issue(
            'M3-8',
            'css-vars.js自定义变量声明',
            false,
            `css-vars.js 中定义的以下自定义变量未在 cssVariableConfig 中声明：${missingInConfig.join('、')}`
          )
        )
      }
    }
  }

  if (declare.layoutConfig) {
    const lcErrors = []
    if (!declare.layoutConfig.default) lcErrors.push('缺少 default 字段')
    ;(declare.layoutConfig.list || []).forEach((item, i) => {
      if (!item.name) lcErrors.push(`list[${i}] 缺少 name`)
      if (!item.key) lcErrors.push(`list[${i}] 缺少 key`)
    })
    results.push(
      issue(
        'M3-5',
        'layoutConfig字段完整性',
        lcErrors.length === 0,
        lcErrors.length ? lcErrors.join('；') : '通过'
      )
    )
  }

  if (declare.themeConfig) {
    const tcErrors = []
    if (!declare.themeConfig.default) tcErrors.push('缺少 default 字段')
    if (!declare.themeConfig.list?.length) tcErrors.push('list 为空，至少需要一个主题')
    ;(declare.themeConfig.list || []).forEach((item, i) => {
      if (!item.name) tcErrors.push(`list[${i}] 缺少 name`)
      if (!item.key) tcErrors.push(`list[${i}] 缺少 key`)
    })
    results.push(
      issue(
        'M3-2',
        'themeConfig字段完整性',
        tcErrors.length === 0,
        tcErrors.length ? tcErrors.join('；') : '通过'
      )
    )
  }

  if (declare.businessConfig?.length > 0) {
    const bcErrors = []
    const bcKeys = new Set()
    declare.businessConfig.forEach((item, i) => {
      if (!item.name) bcErrors.push(`[${i}] 缺少 name`)
      if (!item.key) {
        bcErrors.push(`[${i}] 缺少 key`)
      } else {
        if (!isCamel(item.key)) bcErrors.push(`[${i}].key "${item.key}" 不符合 camelCase`)
        if (bcKeys.has(item.key)) bcErrors.push(`[${i}].key "${item.key}" 重复`)
        bcKeys.add(item.key)
      }
      if (!item.type) bcErrors.push(`[${i}] 缺少 type`)
      else if (!enums.businessConfigTypes.includes(item.type.toLowerCase()))
        bcErrors.push(
          `[${i}].type "${item.type}" 不合法，允许：${enums.businessConfigTypes.join('/')}`
        )
      if (item.renderType && !enums.businessConfigRenderTypes.includes(item.renderType))
        bcErrors.push(
          `[${i}].renderType "${item.renderType}" 不合法，允许：${enums.businessConfigRenderTypes.join('/')}`
        )
    })
    results.push(
      issue(
        'M3-9',
        'businessConfig字段规范',
        bcErrors.length === 0,
        bcErrors.length
          ? bcErrors.slice(0, 3).join('；') + (bcErrors.length > 3 ? `…等${bcErrors.length}处` : '')
          : '通过'
      )
    )
  }

  if (declare.dataSources?.length > 0) {
    const dsErrors = []
    declare.dataSources.forEach((item, i) => {
      if (!item.sourceName) dsErrors.push(`dataSources[${i}] 缺少 sourceName`)
      if (!Array.isArray(item.columns)) {
        dsErrors.push(`dataSources[${i}] 缺少 columns 字段`)
      } else {
        // columns 有数据时才检查每项的合法性
        if (item.columns.length > 0) {
          item.columns.forEach((col, j) => {
            // 必填字段检查（一旦配置了 column 项，name/type/comment 必须完整）
            if (!col.name || !col.type || !col.comment) {
              dsErrors.push(`dataSources[${i}].columns[${j}] 缺少必填字段 name、type 或 comment`)
            }

            // 非法字段检查
            const illegalKeys = Object.keys(col).filter(
              (k) => !enums.dataSourcesColumnKeys.includes(k)
            )
            if (illegalKeys.length > 0)
              dsErrors.push(
                `dataSources[${i}].columns[${j}] 存在非法字段：${illegalKeys.join('、')}`
              )

            // type 枚举值检查
            if (col.type && !enums.dataSourcesColumnTypes.includes(col.type))
              dsErrors.push(
                `dataSources[${i}].columns[${j}].type "${col.type}" 不合法，允许：${enums.dataSourcesColumnTypes.join('/')}`
              )

            // 系统保留字段检查
            if (enums.dataSources_reservedColumns.includes(col.name))
              dsErrors.push(`dataSources[${i}].columns[${j}] 使用了系统保留字段 "${col.name}"`)

            // defVal 类型合法性检查
            if (col.defVal !== undefined && col.defVal !== null) {
              const defValType = typeof col.defVal
              if (defValType !== 'string' && defValType !== 'number') {
                dsErrors.push(
                  `dataSources[${i}].columns[${j}].defVal 类型必须是 string/number/null，当前为 ${defValType}`
                )
              } else if (col.type) {
                // defVal 与 type 一致性检查
                if (col.type === 'string' && defValType !== 'string') {
                  dsErrors.push(
                    `dataSources[${i}].columns[${j}].defVal 类型应为 string（type="${col.type}"），当前为 ${defValType}`
                  )
                } else if (col.type === 'number' && defValType !== 'number') {
                  dsErrors.push(
                    `dataSources[${i}].columns[${j}].defVal 类型应为 number（type="${col.type}"），当前为 ${defValType}`
                  )
                }
              }
            }
          })
        }
      }
    })
    results.push(
      issue(
        'M3-10',
        'dataSources字段规范',
        dsErrors.length === 0,
        dsErrors.length ? dsErrors.join('；') : '通过'
      )
    )
  }

  if (declare.formSources?.length > 0) {
    const fsErrors = []
    declare.formSources.forEach((item, i) => {
      if (!item.formName) fsErrors.push(`formSources[${i}] 缺少 formName`)
    })
    results.push(
      issue(
        'M3-11',
        'formSources字段规范',
        fsErrors.length === 0,
        fsErrors.length ? fsErrors.join('；') : '通过'
      )
    )
  }

  // M3-12：内容布局存在性（业务组件必查）
  if (isBusiness) {
    const layoutList = declare.layoutConfig?.list || []
    results.push(
      issue(
        'M3-12',
        '内容布局存在性',
        layoutList.length >= 1,
        layoutList.length >= 1 ? '通过' : 'layoutConfig.list 至少需要一个布局配置'
      )
    )
  }

  // M3-13：dark 主题配置（业务组件必查）
  if (isBusiness) {
    const themeList = declare.themeConfig?.list || []
    const hasDarkTheme = themeList.some((t) => t.key === 'dark')
    results.push(
      issue(
        'M3-13',
        'dark主题配置',
        hasDarkTheme,
        hasDarkTheme ? '通过' : 'themeConfig.list 中必须包含 key="dark" 的主题'
      )
    )
  }

  // M3-14：废弃字段（warning，所有组件必查，字段列表由配置 deprecatedFields 维护）
  {
    const deprecatedFields = CFG.deprecatedFields || []
    const found = deprecatedFields.filter((k) => declare[k] !== undefined)
    results.push(
      issue(
        'M3-14',
        '废弃字段',
        found.length === 0,
        found.length ? `已废弃字段不应存在：${found.join('、')}，建议移除` : '通过',
        'warning'
      )
    )
  }

  return results
}

// ─── M4 文件格式规范 ──────────────────────────────────────────────────────────
function checkM4(dir, declare, isBusiness) {
  const results = []
  const hasDarkTheme = (declare.themeConfig?.list || []).some((t) => t.key === 'dark')
  const declareJs = readFile(path.join(dir, 'declare.js')) || ''
  const themeKeys = (declare.themeConfig?.list || []).map((t) => t.key).filter(Boolean)

  results.push(
    issue(
      'M4-1',
      'declare.js格式',
      declareJs.includes('$createMcDeclare'),
      declareJs.includes('$createMcDeclare') ? '通过' : 'declare.js 未使用 $createMcDeclare'
    )
  )

  results.push(
    issue(
      'M4-2',
      'declare.js传入cssVars',
      declareJs.includes('cssVars'),
      declareJs.includes('cssVars') ? '通过' : 'declare.js 未传入 cssVars（css-vars.js 为必须项）'
    )
  )

  const componentJs = readFile(path.join(dir, 'component.js')) || ''
  results.push(
    issue(
      'M4-3',
      'component.js格式',
      componentJs.includes('./package/index.vue'),
      componentJs.includes('./package/index.vue')
        ? '通过'
        : 'component.js 未导出 ./package/index.vue'
    )
  )

  const cssVarsContent = readFile(path.join(dir, 'resources/config/css-vars.js')) || ''
  // 去注释后按「导出键」精确匹配：键名后须跟 :（对象属性）或 , }（导出列表简写），
  // 避免 String.includes 把注释或其他单词的子串误判为已导出
  const cssVarsCleaned = stripComments(cssVarsContent)
  const cssVarsMissing = ['common', ...themeKeys].filter(
    (k) => !new RegExp(`(?:^|[^\\w$])${k}\\s*(?::|[,}])`).test(cssVarsCleaned)
  )
  results.push(
    issue(
      'M4-4',
      'css-vars.js导出结构',
      cssVarsMissing.length === 0,
      cssVarsMissing.length ? `css-vars.js 缺少导出：${cssVarsMissing.join('、')}` : '通过'
    )
  )

  // M4-7: css-vars.js 字体大小变量格式检查
  if (cssVarsContent) {
    const fontSizeErrors = []
    const cleaned = stripComments(cssVarsContent)

    // 匹配所有赋值语句，查找字体大小相关变量
    const assignmentRegex = /(\w+)\s*:\s*([^,\n]+)/g
    let match
    while ((match = assignmentRegex.exec(cleaned)) !== null) {
      const key = match[1]
      const value = match[2].trim()

      // 识别字体大小变量（包含 fontSize 或 Font-size 或 font-size，或值中使用了 getCssSize）
      const isFontSizeVar = /fontSize|FontSize|font-?size/i.test(key) || /getCssSize/.test(value)

      if (isFontSizeVar) {
        // 检查是否使用了 $mcCssBuilder.getCssSize() 或 $mcCssBuilder.getCssSize(数字)
        const isValidFormat = /\$mcCssBuilder\.getCssSize\(\s*\d*\s*\)/.test(value)

        if (!isValidFormat) {
          fontSizeErrors.push(
            `${key}: "${value}" 必须使用 $mcCssBuilder.getCssSize() 或 $mcCssBuilder.getCssSize(数字)`
          )
        }
      }
    }

    if (fontSizeErrors.length > 0) {
      results.push(
        issue(
          'M4-7',
          'css-vars.js字体变量格式',
          false,
          fontSizeErrors.slice(0, 3).join('；') +
            (fontSizeErrors.length > 3 ? `…等${fontSizeErrors.length}处` : '')
        )
      )
    }
  }

  const indexLessContent = readFile(path.join(dir, 'resources/styles/index.less')) || ''
  const themeImportErrors = themeKeys.filter((k) => !indexLessContent.includes(`${k}.less`))
  results.push(
    issue(
      'M4-5',
      'index.less引入主题文件',
      themeImportErrors.length === 0,
      themeImportErrors.length
        ? `index.less 未引入主题文件：${themeImportErrors.map((k) => `themes/${k}.less`).join('、')}`
        : '通过'
    )
  )

  const packageFiles = collectFiles(path.join(dir, 'package'))
  const indexLessUsed = packageFiles.some((f) => (readFile(f) || '').includes('styles/index'))
  results.push(
    issue(
      'M4-6',
      'index.less被引用',
      indexLessUsed,
      indexLessUsed ? '通过' : 'resources/styles/index.less 未在 package/ 文件中引用'
    )
  )

  // M4-8~M4-11：dark 主题导出与变量（业务组件，存在 dark 主题时检查）
  if (isBusiness && hasDarkTheme) {
    const hasDarkExport = /export\s+default\s*\{[\s\S]*dark[\s\S]*\}/.test(cssVarsContent)
    results.push(
      issue(
        'M4-8',
        'css-vars.js导出dark',
        hasDarkExport,
        hasDarkExport ? '通过' : 'css-vars.js 必须导出 dark 对象'
      )
    )

    if (hasDarkExport) {
      const darkKeys = extractObjectKeys(cssVarsContent, 'dark')
      const coreVars = CFG.enums.darkThemeCoreVars || []
      const missingCoreVars = coreVars.filter((v) => !darkKeys.includes(v))
      results.push(
        issue(
          'M4-9',
          'dark核心变量完整性',
          missingCoreVars.length === 0,
          missingCoreVars.length ? `dark 对象缺少核心变量：${missingCoreVars.join('、')}` : '通过'
        )
      )

      if (missingCoreVars.length === 0) {
        const darkVarValues = extractObjectKeyValues(cssVarsContent, 'dark')
        const colorRules = CFG.enums.darkThemeColorRules || {}
        const colorErrors = []
        coreVars.forEach((varName) => {
          const allowedValues = colorRules[varName]
          if (!allowedValues || allowedValues.length === 0) return
          const actualValue = (darkVarValues[varName] || '').toUpperCase()
          const allowedValuesUpper = allowedValues.map((v) => v.toUpperCase())
          if (!allowedValuesUpper.includes(actualValue)) {
            colorErrors.push(
              `${varName}: "${darkVarValues[varName]}" 不在允许值 [${allowedValues.join(', ')}] 中`
            )
          }
        })
        results.push(
          issue(
            'M4-10',
            'dark核心变量色值枚举',
            colorErrors.length === 0,
            colorErrors.length
              ? colorErrors.slice(0, 3).join('；') +
                  (colorErrors.length > 3 ? `…等${colorErrors.length}处` : '')
              : '通过'
          )
        )
      }

      const optionalVars = CFG.enums.darkThemeOptionalVars || {}
      const optionalErrors = []
      Object.entries(optionalVars).forEach(([varName, allowedValues]) => {
        if (darkKeys.includes(varName)) {
          const actualValue = (
            extractObjectKeyValues(cssVarsContent, 'dark')[varName] || ''
          ).toUpperCase()
          const allowedValuesUpper = allowedValues.map((v) => v.toUpperCase())
          if (!allowedValuesUpper.includes(actualValue)) {
            optionalErrors.push(`${varName}: "${actualValue}" 必须为 ${allowedValues.join(' 或 ')}`)
          }
        }
      })
      if (optionalErrors.length > 0) {
        results.push(issue('M4-11', 'dark可选变量色值', false, optionalErrors.join('；')))
      }
    }
  }

  return results
}

// ─── M5 代码规范（脚本可检查部分）────────────────────────────────────────────
function checkM5_script(dir, dirName, declare, isBusiness) {
  const results = []
  const isApiWhitelisted = CFG.apiWhitelist.includes(dirName)

  const ignoreExts = enums.forbiddenApiIgnoreExts || []
  const packageFiles = collectFiles(path.join(dir, 'package'))
  const allFiles = collectFiles(dir)
  const allContent = allFiles.map((f) => ({
    file: relPath(dir, f),
    content: readFile(f) || ''
  }))
  const packageContent = packageFiles.map((f) => ({
    file: relPath(dir, f),
    content: readFile(f) || ''
  }))

  const indexVue = readFile(path.join(dir, 'package/index.vue')) || ''
  results.push(
    issue(
      'M5-1',
      '<base-panel>包裹',
      indexVue.includes('<base-panel'),
      indexVue.includes('<base-panel') ? '通过' : 'package/index.vue 未使用 <base-panel> 包裹'
    )
  )

  const builderCalls = packageContent.reduce(
    (sum, { content }) => sum + (content.match(/\$mcComponentBuilder\s*\(/g) || []).length,
    0
  )
  results.push(
    issue(
      'M5-2',
      '$mcComponentBuilder只调用一次',
      builderCalls <= 1,
      builderCalls <= 1 ? '通过' : `$mcComponentBuilder 被调用了 ${builderCalls} 次（应只调用1次）`
    )
  )

  if (!isApiWhitelisted) {
    const forbiddenFound = []
    allContent
      .filter(({ file }) => !ignoreExts.some((ext) => file.endsWith(ext)))
      .forEach(({ file, content }) => {
        const strippedContent = stripComments(content)
        enums.forbiddenApis.forEach((pattern) => {
          if (new RegExp(pattern).test(strippedContent))
            forbiddenFound.push(`${file} 使用了禁用 API（${pattern}）`)
        })
      })
    results.push(
      issue(
        'M5-3',
        '禁用API检查',
        forbiddenFound.length === 0,
        forbiddenFound.length ? forbiddenFound.slice(0, 2).join('；') : '通过'
      )
    )
  }

  const publishMatches = []
  packageContent.forEach(({ content }) => {
    const strippedContent = stripComments(content)
    for (const m of strippedContent.matchAll(/publishEvent\s*\(\s*['"`]([^'"`]+)['"`]/g))
      publishMatches.push(m[1])
  })
  const declaredEvents = Object.keys(declare.businessEvents || {})
  const undeclaredPublish = publishMatches.filter(
    (e) => !e.startsWith(enums.frameworkEventPrefix) && !declaredEvents.includes(e)
  )
  if (publishMatches.length > 0)
    results.push(
      issue(
        'M5-4',
        'publishEvent与businessEvents一致性',
        undeclaredPublish.length === 0,
        undeclaredPublish.length
          ? `publishEvent 未在 businessEvents 中声明：${undeclaredPublish.join('、')}`
          : '通过'
      )
    )

  const listenMatches = []
  packageContent.forEach(({ content }) => {
    const strippedContent = stripComments(content)
    for (const m of strippedContent.matchAll(/listenEvent\s*\(\s*['"`]([^'"`]+)['"`]/g))
      listenMatches.push(m[1])
  })
  const declaredStatuses = Object.keys(declare.businessStatuses || {})
  const undeclaredListen = listenMatches.filter(
    (e) => !e.startsWith(enums.frameworkEventPrefix) && !declaredStatuses.includes(e)
  )
  if (listenMatches.length > 0)
    results.push(
      issue(
        'M5-5',
        'listenEvent与businessStatuses一致性',
        undeclaredListen.length === 0,
        undeclaredListen.length
          ? `listenEvent 未在 businessStatuses 中声明：${undeclaredListen.join('、')}`
          : '通过'
      )
    )

  // M5-8/M5-9：base-panel 背景色限制（业务组件必查）
  if (isBusiness) {
    const templateMatch = indexVue.match(/<template[^>]*>([\s\S]*?)<\/template>/i)
    let basePanelTag = ''
    let basePanelContent = ''
    if (templateMatch) {
      const basePanelMatch = templateMatch[1].match(/<base-panel([^>]*)>([\s\S]*?)<\/base-panel>/i)
      if (basePanelMatch) {
        basePanelTag = basePanelMatch[1]
        basePanelContent = basePanelMatch[2]
      }
    }
    const hasBasePanelBg = hasInlineBackground(basePanelTag)
    results.push(
      issue(
        'M5-8',
        'base-panel背景色限制',
        !hasBasePanelBg,
        hasBasePanelBg ? '<base-panel> 标签不得设置内联背景色（style 属性包含 background）' : '通过'
      )
    )
    const firstChildMatch = basePanelContent.match(/<(\w+)([^>]*)>/i)
    const firstChildAttrs = firstChildMatch ? firstChildMatch[2] : ''
    const hasFirstChildBg = hasInlineBackground(firstChildAttrs)
    results.push(
      issue(
        'M5-9',
        '第一子元素背景色限制',
        !hasFirstChildBg,
        hasFirstChildBg ? '<base-panel> 的第一个子元素不得设置内联背景色' : '通过'
      )
    )
  }

  return results
}

// ─── 工具函数：JS 文件解析（零依赖） ─────────────────────────────────────────
/**
 * 判断标签属性字符串中是否设置了内联背景色
 * 静态 style 与动态 :style / v-bind:style 统一匹配：属性值中出现 background 即命中；
 * 动态绑定变量/计算属性（如 :style="panelStyle"）无法静态判定，不做误报
 * @param {string} attrs - 标签属性字符串
 * @returns {boolean} 是否设置内联背景色
 */
function hasInlineBackground(attrs) {
  if (!attrs) return false
  return /style\s*=\s*(?:"[^"]*|'[^']*)background/i.test(attrs)
}

/**
 * 提取 JS 对象的 key（使用字符串匹配，无需外部依赖）
 * @param {string} jsCode - JS 文件内容
 * @param {string} objectName - 对象名称（如 'common', 'dark', 'light'）
 * @returns {string[]} 对象的 key 数组
 */
function extractObjectKeys(jsCode, objectName) {
  try {
    const cleaned = stripComments(jsCode)
    // 匹配 const objectName = { ... }
    const objRegex = new RegExp(`const\\s+${objectName}\\s*=\\s*\\{([^}]+)\\}`, 's')
    const match = cleaned.match(objRegex)
    if (!match) return []

    const objContent = match[1]
    // 提取 key: value 中的 key
    const keyRegex = /(\w+)\s*:/g
    const keys = []
    let keyMatch
    while ((keyMatch = keyRegex.exec(objContent)) !== null) {
      keys.push(keyMatch[1])
    }
    return keys
  } catch (e) {
    return []
  }
}

/**
 * 提取 css-vars.js 所有变量 key
 * @param {string} jsCode - css-vars.js 内容
 * @returns {Set<string>} 所有变量 key 的集合
 */
function extractCssVarsKeys(jsCode) {
  const keys = new Set()
  const objectNames = ['common', 'dark', 'light']
  objectNames.forEach((name) => {
    const objKeys = extractObjectKeys(jsCode, name)
    objKeys.forEach((k) => keys.add(k))
  })
  return keys
}

/**
 * 提取 css-vars.js 中某个对象的变量及其值
 * @param {string} jsCode - css-vars.js 内容
 * @param {string} objectName - 对象名称
 * @returns {Object} { key: value } 映射
 */
function extractObjectKeyValues(jsCode, objectName) {
  try {
    const cleaned = stripComments(jsCode)
    const objRegex = new RegExp(`const\\s+${objectName}\\s*=\\s*\\{([^}]+)\\}`, 's')
    const match = cleaned.match(objRegex)
    if (!match) return {}

    const objContent = match[1]
    const kvRegex = /(\w+)\s*:\s*([^,\n]+)/g
    const kvMap = {}
    let kvMatch
    while ((kvMatch = kvRegex.exec(objContent)) !== null) {
      const key = kvMatch[1]
      const value = kvMatch[2].trim().replace(/['"]/g, '')
      kvMap[key] = value
    }
    return kvMap
  } catch (e) {
    return {}
  }
}

// ─── M5-10: 硬编码颜色检查（warning）──────────────────────────────────────────
function checkHardcodedColor(dir, styleSources) {
  const results = []

  // 样式内容由 checkComponent 预收集（.less 文件 + .vue <style> 块），此处直接复用
  const styleContents = styleSources

  const hardcodedColors = []

  styleContents.forEach(({ file, content }) => {
    content.split('\n').forEach((line, i) => {
      const trimmed = line.trim()
      // 跳过注释行和 CSS 变量定义行
      if (
        trimmed.startsWith('//') ||
        trimmed.startsWith('*') ||
        trimmed.startsWith('/*') ||
        trimmed.includes('--')
      )
        return

      // 硬编码颜色：hex / rgb / rgba（且不在 var() 内）
      if (
        (/#[0-9a-fA-F]{3,8}/.test(trimmed) || /\brgba?\s*\(/.test(trimmed)) &&
        !trimmed.includes('var(--')
      ) {
        hardcodedColors.push(`${file}:${i + 1}`)
      }
    })
  })

  const hasHardcoded = hardcodedColors.length > 0
  let message = '通过'
  if (hasHardcoded) {
    const locations = hardcodedColors.slice(0, 3).join('、')
    const suffix = hardcodedColors.length > 3 ? `…等${hardcodedColors.length}处` : ''
    message = `样式中存在硬编码颜色值，建议改用 CSS 变量：${locations}${suffix}`
  }
  results.push(issue('M5-10', '硬编码颜色', !hasHardcoded, message, 'warning'))

  return results
}

// ─── M5-6: @fontSize 变量声明与使用检查 / M5-7: 禁止硬编码字体大小 ─────────────
function checkFontSizeUsage(dir, styleSources) {
  const results = []

  // M5-6 触发条件：css-vars.js 中定义了 fontSize 变量
  const cssVarsContent = readFile(path.join(dir, 'resources/config/css-vars.js')) || ''
  const hasFontSizeDefined = /(?:^|[^\w$])fontSize\s*(?::|[,}])/.test(stripComments(cssVarsContent))

  if (hasFontSizeDefined) {
    // 要求 1：theme-vars.less 中必须有 @fontSize: var(--fontSize) 映射声明
    const themeVarsContent =
      readFile(path.join(dir, 'resources/styles/themes/theme-vars.less')) || ''
    const hasDeclaration = /@fontSize\s*:\s*var\(--fontSize\)/.test(stripComments(themeVarsContent))

    // 要求 2：业务样式中实际使用了 @fontSize（styleSources 已排除 themes/ 声明文件）
    const hasUsage = styleSources.some(({ content }) => /@fontSize/.test(stripComments(content)))

    const passed = hasDeclaration && hasUsage
    let msg = '通过'
    if (!passed) {
      const missing = []
      if (!hasDeclaration) missing.push('theme-vars.less 缺少 @fontSize: var(--fontSize) 映射声明')
      if (!hasUsage) missing.push('业务样式中未实际使用 @fontSize')
      msg = `css-vars.js 已定义 fontSize，但${missing.join('，')}`
    }
    results.push(issue('M5-6', '@fontSize变量声明与使用', passed, msg))
  }

  // M5-7: 禁止硬编码字体大小（>5px），独立于 M5-6 触发
  const hardcodedFontSizes = []
  let hasPxFontSize = false
  styleSources.forEach(({ file, content }) => {
    content.split('\n').forEach((line, i) => {
      const trimmed = line.trim()
      // 跳过注释行和 CSS 自定义属性行
      if (
        trimmed.startsWith('//') ||
        trimmed.startsWith('*') ||
        trimmed.startsWith('/*') ||
        trimmed.includes('--')
      )
        return

      const fsMatch = trimmed.match(/font-size\s*:\s*(\d+(?:\.\d+)?)px/)
      if (fsMatch) {
        hasPxFontSize = true
        if (parseFloat(fsMatch[1]) > 5) {
          hardcodedFontSizes.push(`${file}:${i + 1} (${fsMatch[0]})`)
        }
      }
    })
  })

  if (hasPxFontSize) {
    results.push(
      issue(
        'M5-7',
        '禁止硬编码字体大小',
        hardcodedFontSizes.length === 0,
        hardcodedFontSizes.length
          ? `以下位置使用了硬编码字体大小（>5px），必须改用 @fontSize 或相对单位：${hardcodedFontSizes.slice(0, 3).join('、')}${hardcodedFontSizes.length > 3 ? `…等${hardcodedFontSizes.length}处` : ''}`
          : '通过'
      )
    )
  }

  return results
}

// ─── 单组件检查入口 ───────────────────────────────────────────────────────────
function checkComponent(dirName) {
  const dir = path.join(COMPONENT_BASE, dirName)
  if (!fs.existsSync(dir)) return { dirName, error: `目录不存在：${dir}` }

  const declarePath = path.join(dir, 'declare.json')
  let declare = {}
  if (fs.existsSync(declarePath)) {
    try {
      declare = JSON.parse(fs.readFileSync(declarePath, 'utf-8'))
    } catch (e) {
      return { dirName, error: `declare.json 解析失败：${e.message}` }
    }
  }

  // 统一计算 business 判定与样式内容集合，供各检查函数复用
  const isBusiness = isBusinessComponent(declare, declare.componentId)
  const styleSources = collectStyleSources(dir)

  const allResults = [
    ...checkM1(dirName, declare),
    ...checkM2(dir, declare),
    ...checkM3(declare, dir, isBusiness),
    ...checkM4(dir, declare, isBusiness),
    ...checkM5_script(dir, dirName, declare, isBusiness),
    ...checkFontSizeUsage(dir, styleSources),
    ...checkHardcodedColor(dir, styleSources)
  ]

  const failCount = allResults.filter((r) => !r.passed && r.level !== 'warning').length
  const passCount = allResults.filter((r) => r.passed).length
  const warningCount = allResults.filter((r) => !r.passed && r.level === 'warning').length

  return {
    dirName,
    componentId: declare.componentId,
    componentName: declare.componentName,
    version: declare.version,
    totalChecks: allResults.length,
    passCount,
    failCount,
    warningCount,
    results: allResults,
    canRelease: failCount === 0
  }
}

// ─── 主流程 ───────────────────────────────────────────────────────────────────
function main() {
  const dirs = getComponentDirs()
  if (dirs.length === 0) {
    console.log('没有找到需要检查的组件目录')
    process.exit(0)
  }

  console.log(`\n🔍 微码组件规范检查 ${CFG.specVersion}\n`)
  console.log(`检查范围：${dirs.length} 个组件\n`)

  const allResults = dirs.map(checkComponent)

  allResults.forEach((comp) => {
    if (comp.error) {
      console.log(`❌ ${comp.dirName}: ${comp.error}`)
      return
    }
    const icon = comp.canRelease ? '✅' : '❌'
    console.log(
      `${icon} ${comp.dirName} [${comp.componentName || '-'}] 通过:${comp.passCount} 失败:${comp.failCount} ${comp.canRelease ? '' : '← 不允许上线'}`
    )
    comp.results
      .filter((r) => !r.passed && r.level !== 'warning')
      .forEach((r) => console.log(`   └─ [${r.id}] ${r.name}: ${r.message}`))
    comp.results
      .filter((r) => !r.passed && r.level === 'warning')
      .forEach((r) => console.log(`   ⚠  [${r.id}] ${r.name}: ${r.message}`))
  })

  const total = allResults.filter((r) => !r.error).length
  const canRelease = allResults.filter((r) => !r.error && r.canRelease).length
  const blocked = allResults.filter((r) => !r.error && !r.canRelease).length
  console.log(`\n📊 汇总：共 ${total} 个，允许上线 ${canRelease} 个，不允许上线 ${blocked} 个\n`)

  const date = localDateTimeStr()
  const reportBaseDir =
    OUTPUT_DIR ||
    (path.isAbsolute(CFG.reportOutputDir)
      ? CFG.reportOutputDir
      : path.join(ROOT, CFG.reportOutputDir))
  const reportDir = path.join(reportBaseDir, date)
  fs.mkdirSync(reportDir, { recursive: true })
  const outputPath = path.join(reportDir, 'check-result.json')
  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      {
        specVersion: CFG.specVersion,
        checkedAt: new Date().toISOString(),
        components: allResults
      },
      null,
      2
    )
  )
  console.log(`\n📄 检查结果已保存：${outputPath}`)

  // 根据 --format 参数生成报告
  const { generateReport } = require('./mc-report.cjs')
  generateReport(outputPath, FORMAT)
}

main()
