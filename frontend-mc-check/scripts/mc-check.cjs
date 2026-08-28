#!/usr/bin/env node
/**
 * 微码组件规范检查脚本 v2.1
 * 用法：
 *   node mc-check.cjs                              # 检查所有组件
 *   node mc-check.cjs c-mc-micro-image             # 检查单个组件
 *   node mc-check.cjs --component-path /abs/path   # 检查指定绝对路径的组件
 *   node mc-check.cjs --output-dir /abs/path       # 指定报告输出目录
 */

const fs = require('fs')
const path = require('path')

// 从脚本所在目录向上 4 级回到项目根（aidocs/skills/frontend-mc-check/scripts/）
const ROOT = path.resolve(__dirname, '../../../..')
const CFG = JSON.parse(fs.readFileSync(path.join(__dirname, 'mc-check-config.json'), 'utf-8'))
const { naming, enums } = CFG

// ─── CLI ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const COMPONENT_PATH_IDX = args.indexOf('--component-path')
const COMPONENT_PATH = COMPONENT_PATH_IDX !== -1 ? args[COMPONENT_PATH_IDX + 1] : null
const OUTPUT_DIR_IDX = args.indexOf('--output-dir')
const OUTPUT_DIR = OUTPUT_DIR_IDX !== -1 ? args[OUTPUT_DIR_IDX + 1] : null
const TARGET = args.find((a) => !a.startsWith('--') && a !== (COMPONENT_PATH || '') && a !== (OUTPUT_DIR || ''))

const COMPONENT_BASE = COMPONENT_PATH
  ? path.dirname(COMPONENT_PATH)
  : path.join(ROOT, CFG.componentBaseDir)

// ─── 工具 ─────────────────────────────────────────────────────────────────────
const isKebab = (s) => new RegExp(naming.kebabCasePattern).test(s)
const isCamel = (s) => new RegExp(naming.camelCasePattern).test(s)

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

function issue(id, name, passed, msg) {
  return { id, name, passed, message: msg }
}

/**
 * 移除代码中的注释内容，避免注释中的示例代码被误判为真实调用。
 * 处理：块注释（含 JSDoc /** ... *\/）和单行注释（// ...）
 */
function stripComments(code) {
  return code
    .replace(/<!--[\s\S]*?-->/g, '')   // HTML 注释（Vue 文件 <!-- --> 头部块）
    .replace(/\/\*[\s\S]*?\*\//g, '')  // JS 块注释（含 JSDoc）
    .replace(/\/\/[^\n]*/g, '')        // JS 单行注释
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
      'M2-6',
      'resources/styles/index.less存在',
      fs.existsSync(indexLessPath),
      fs.existsSync(indexLessPath) ? '通过' : 'resources/styles/index.less 不存在（必须配置）'
    )
  )

  if (hasLayoutConfig) {
    const errors = []
    ;(declare.layoutConfig.list || []).forEach((item, i) => {
      if (!item.previewName) return
      if (!item.previewName.startsWith(naming.previewImagePrefix))
        errors.push(
          `list[${i}].previewName "${item.previewName}" 未以 "${naming.previewImagePrefix}" 开头`
        )
      else if (!fs.existsSync(path.join(dir, 'resources/images', item.previewName)))
        errors.push(`预览图 "${item.previewName}" 不存在于 resources/images/`)
    })
    results.push(
      issue(
        'M2-5',
        'layoutConfig预览图',
        errors.length === 0,
        errors.length ? errors.join('；') : '通过'
      )
    )
  }

  return results
}

// ─── M3 declare.json 字段规范 ─────────────────────────────────────────────────
function checkM3(declare) {
  const results = []
  const warnings = []

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
    if (ev.eventDataSchema !== undefined && (typeof ev.eventDataSchema !== 'object' || Array.isArray(ev.eventDataSchema) || ev.eventDataSchema === null))
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
        'M3-2',
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
        'M3-3',
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
        'M3-4',
        'cssVariableConfig字段规范',
        typeErrors.length === 0,
        typeErrors.length ? typeErrors.join('；') : '通过'
      )
    )
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
        'M3-6',
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
        'M3-7',
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
    const dsWarnings = []
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
            const illegalKeys = Object.keys(col).filter(k => !enums.dataSourcesColumnKeys.includes(k))
            if (illegalKeys.length > 0)
              dsErrors.push(`dataSources[${i}].columns[${j}] 存在非法字段：${illegalKeys.join('、')}`)

            // type 枚举值检查
            if (col.type && !enums.dataSourcesColumnTypes.includes(col.type))
              dsErrors.push(`dataSources[${i}].columns[${j}].type "${col.type}" 不合法，允许：${enums.dataSourcesColumnTypes.join('/')}`)

            // 系统保留字段检查
            if (enums.dataSources_reservedColumns.includes(col.name))
              dsErrors.push(`dataSources[${i}].columns[${j}] 使用了系统保留字段 "${col.name}"`)

            // defVal 类型合法性检查
            if (col.defVal !== undefined && col.defVal !== null) {
              const defValType = typeof col.defVal
              if (defValType !== 'string' && defValType !== 'number') {
                dsErrors.push(`dataSources[${i}].columns[${j}].defVal 类型必须是 string/number/null，当前为 ${defValType}`)
              } else if (col.type) {
                // defVal 与 type 一致性检查
                if (col.type === 'string' && defValType !== 'string') {
                  dsErrors.push(`dataSources[${i}].columns[${j}].defVal 类型应为 string（type="${col.type}"），当前为 ${defValType}`)
                } else if (col.type === 'number' && defValType !== 'number') {
                  dsErrors.push(`dataSources[${i}].columns[${j}].defVal 类型应为 number（type="${col.type}"），当前为 ${defValType}`)
                }
              }
            }
          })
        }
      }
    })
    results.push(
      issue(
        'M3-8',
        'dataSources字段规范',
        dsErrors.length === 0,
        dsErrors.length ? dsErrors.join('；') : '通过'
      )
    )
    dsWarnings.forEach((w) => warnings.push(w))
  }

  if (declare.formSources?.length > 0) {
    const fsErrors = []
    declare.formSources.forEach((item, i) => {
      if (!item.formName) fsErrors.push(`formSources[${i}] 缺少 formName`)
    })
    results.push(
      issue(
        'M3-9',
        'formSources字段规范',
        fsErrors.length === 0,
        fsErrors.length ? fsErrors.join('；') : '通过'
      )
    )
  }

  return { results, warnings }
}

// ─── M4 文件格式规范 ──────────────────────────────────────────────────────────
function checkM4(dir, declare) {
  const results = []
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
  const cssVarsMissing = ['common', ...themeKeys].filter((k) => !cssVarsContent.includes(k))
  results.push(
    issue(
      'M4-4',
      'css-vars.js导出结构',
      cssVarsMissing.length === 0,
      cssVarsMissing.length ? `css-vars.js 缺少导出：${cssVarsMissing.join('、')}` : '通过'
    )
  )

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

  return results
}

// ─── M5 代码规范（脚本可检查部分）────────────────────────────────────────────
function checkM5_script(dir, dirName, declare) {
  const results = []
  const warnings = []
  const isApiWhitelisted = CFG.apiWhitelist.includes(dirName)

  const ignoreExts = enums.forbiddenApiIgnoreExts || []
  const packageFiles = collectFiles(path.join(dir, 'package'))
  const allFiles = collectFiles(dir)
  const allContent = allFiles.map((f) => ({
    file: f.replace(dir + '/', ''),
    content: readFile(f) || ''
  }))
  const packageContent = packageFiles.map((f) => ({
    file: f.replace(dir + '/', ''),
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

  return { results, warnings }
}

// ─── 警告项 ───────────────────────────────────────────────────────────────────
function checkWarnings(declare) {
  const warnings = []
  if (declare.versionCode !== undefined) warnings.push('versionCode 字段已废弃，建议移除')
  return warnings
}

// ─── CSS 变量使用检查（警告）────────────────────────────────────────────────────
function checkCssVarUsage(dir) {
  const warnings = []

  // 收集 resources/styles/ 下的 .less 文件（排除 themes/，那里是变量定义）
  const stylesDir = path.join(dir, 'resources/styles')
  const lessFiles = collectFiles(stylesDir, ['.less']).filter(
    (f) => !f.includes(`${path.sep}themes${path.sep}`)
  )

  // 收集 package/ 下 .vue 文件的 <style> 块
  const styleContents = []
  lessFiles.forEach((f) => {
    styleContents.push({ file: f.replace(dir + '/', ''), content: readFile(f) || '' })
  })
  collectFiles(path.join(dir, 'package'), ['.vue']).forEach((f) => {
    const raw = readFile(f) || ''
    const styleBlocks = [...raw.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
    styleBlocks.forEach((m) => {
      styleContents.push({ file: f.replace(dir + '/', '') + ' <style>', content: m[1] })
    })
  })

  const hardcodedColors = []
  const hardcodedSizes = []

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

      // 硬编码字体大小 > 5px
      const fsMatch = trimmed.match(/font-size\s*:\s*(\d+(?:\.\d+)?)px/)
      if (fsMatch && parseFloat(fsMatch[1]) > 5) {
        hardcodedSizes.push(`${file}:${i + 1} (${fsMatch[0]})`)
      }
    })
  })

  if (hardcodedColors.length > 0)
    warnings.push(
      `[W-CSS-1] 样式中存在硬编码颜色值，建议改用 CSS 变量：${hardcodedColors.slice(0, 3).join('、')}${hardcodedColors.length > 3 ? `…等${hardcodedColors.length}处` : ''}`
    )
  if (hardcodedSizes.length > 0)
    warnings.push(
      `[W-CSS-2] 样式中存在硬编码字体大小（>5px），建议改用 em/rem 或 CSS 变量：${hardcodedSizes.slice(0, 3).join('、')}${hardcodedSizes.length > 3 ? `…等${hardcodedSizes.length}处` : ''}`
    )

  return warnings
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

  const m3 = checkM3(declare)
  const m5 = checkM5_script(dir, dirName, declare)
  const allResults = [
    ...checkM1(dirName, declare),
    ...checkM2(dir, declare),
    ...m3.results,
    ...checkM4(dir, declare),
    ...m5.results
  ]

  const warnings = [...checkWarnings(declare), ...m3.warnings, ...m5.warnings, ...checkCssVarUsage(dir)]
  const failCount = allResults.filter((r) => !r.passed).length
  const passCount = allResults.filter((r) => r.passed).length

  return {
    dirName,
    componentId: declare.componentId,
    componentName: declare.componentName,
    version: declare.version,
    passCount,
    failCount,
    results: allResults,
    warnings,
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
      .filter((r) => !r.passed)
      .forEach((r) => console.log(`   └─ [${r.id}] ${r.name}: ${r.message}`))
    comp.warnings.forEach((w) => console.log(`   ⚠  ${w}`))
  })

  const total = allResults.filter((r) => !r.error).length
  const canRelease = allResults.filter((r) => !r.error && r.canRelease).length
  const blocked = allResults.filter((r) => !r.error && !r.canRelease).length
  console.log(`\n📊 汇总：共 ${total} 个，允许上线 ${canRelease} 个，不允许上线 ${blocked} 个\n`)

  const date = localDateTimeStr()
  const reportBaseDir = OUTPUT_DIR || path.join(ROOT, CFG.reportOutputDir)
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

  const { generateReport } = require('./mc-report.cjs')
  generateReport(outputPath)
}

main()
