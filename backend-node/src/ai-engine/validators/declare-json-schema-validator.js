/**
 * DeclareJsonSchemaValidator —— declare.json 结构校验器（L0-B 确定性，零 LLM）
 *
 * 依据：references/specs/declare-json.md
 * 校验对象：微码组件 declare.json（P1 模板先行之后，LLM 只填业务字段，
 * 但 simple 档路径 / 降级路径仍可能让 LLM 直接产出完整 declare.json，
 * 且 LLM 填写的业务字段本身也需符合 schema）。
 *
 * 设计：
 *   - 纯静态方法 validate(declare, options)，无副作用、无 I/O
 *   - 返回 { pass, blockCount, warnCount, issues }，issue 形如
 *     { id, severity: 'BLOCK'|'WARN', message, path }（path 为 JSON 路径，如 "businessEvents.component-click.eventName"）
 *   - BLOCK = 结构违规（框架无法消费）；WARN = 内容质量建议
 *
 * 使用：
 *   const { DeclareJsonSchemaValidator } = await import('./declare-json-schema-validator.js')
 *   const result = DeclareJsonSchemaValidator.validate(declareObj, { componentId: 'c-xxx' })
 */

const SYSTEM_RESERVED_COLUMNS = new Set([
  'id', 'date_create_time', 'date_del_flag', 'version', 'inc_id', 'date_update_time'
])

const EVENT_DATA_TYPES = new Set(['string', 'number', 'boolean', 'object', 'array'])
const CSS_VAR_TYPES = new Set(['color', 'weight', 'size', 'number', 'string', 'select'])
const BUSINESS_CONFIG_TYPES = new Set(['string', 'number', 'boolean', 'object', 'array'])
const RENDER_TYPES = new Set(['radio', 'select', 'number'])
const PANEL_KEYS = new Set(['default-panel', 'model-panels', 'empty'])

const KEBAB_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const CAMEL_RE = /^[a-zA-Z0-9_$]+$/
const ID_PREFIX_RE = /^(c-|cp-|mc-|mv-|page-)/
const CHINESE_CHAR_RE = /[\u4e00-\u9fa5]/

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

function push(issues, id, severity, message, path) {
  issues.push({ id, severity, message, path })
}

/**
 * 校验单个事件/状态 schema 参数表（eventDataSchema / parameters）
 * @returns {Array<string>} 违规说明列表
 */
function validateParamSchema(schema, label) {
  const errs = []
  if (schema === undefined || schema === null) return errs
  if (!isPlainObject(schema)) {
    errs.push(`${label} 必须是对象（keyed by 字段名）`)
    return errs
  }
  const seenKeys = new Set()
  for (const [key, field] of Object.entries(schema)) {
    if (!isPlainObject(field)) {
      errs.push(`${label}.${key} 字段定义必须是对象（含 key/name/type）`)
      continue
    }
    if (seenKeys.has(key)) errs.push(`${label}.${key} 字段 key 重复`)
    seenKeys.add(key)
    if (field.key !== undefined && field.key !== key) {
      errs.push(`${label}.${key}.key 与对象 key 不一致（${field.key} vs ${key}）`)
    }
    if (!field.name || typeof field.name !== 'string') {
      errs.push(`${label}.${key} 缺少 name（中文描述）`)
    } else if (!CHINESE_CHAR_RE.test(field.name)) {
      errs.push(`${label}.${key}.name 应为中文描述（当前: "${field.name}"）`)
    }
    if (field.type !== undefined && !EVENT_DATA_TYPES.has(field.type)) {
      errs.push(`${label}.${key}.type 非法（"${field.type}"，允许: ${[...EVENT_DATA_TYPES].join('/')}）`)
    }
  }
  return errs
}

export class DeclareJsonSchemaValidator {
  /**
   * @param {Object} declare 解析后的 declare.json 对象
   * @param {Object} [options]
   * @param {string} [options.componentId] 期望的 componentId（用于一致性检查）
   * @param {string} [options.componentName] 期望的组件名（用于一致性检查）
   * @returns {{ pass: boolean, blockCount: number, warnCount: number, issues: Array }}
   */
  static validate(declare, options = {}) {
    const issues = []
    if (!isPlainObject(declare)) {
      push(issues, 'DECLARE_NOT_OBJECT', 'BLOCK', 'declare.json 顶层必须是对象', '')
      return { pass: false, blockCount: 1, warnCount: 0, issues }
    }

    const { componentId: expectId, componentName: expectName } = options

    // ========== 顶层必填字段 ==========
    if (!declare.componentId || typeof declare.componentId !== 'string') {
      push(issues, 'DECL_TOP_REQUIRED', 'BLOCK', '缺少必填字段 componentId', 'componentId')
    } else {
      if (!/^c-/.test(declare.componentId)) {
        push(issues, 'DECL_ID_PREFIX', 'BLOCK', `componentId 必须以 "c-" 开头（当前: "${declare.componentId}"）`, 'componentId')
      } else if (!KEBAB_RE.test(declare.componentId.slice(2))) {
        push(issues, 'DECL_ID_KEBAB', 'BLOCK', `componentId 须为 kebab-case（当前: "${declare.componentId}"）`, 'componentId')
      }
      if (declare.componentId.length > 50) {
        push(issues, 'DECL_ID_LENGTH', 'WARN', `componentId 超过 50 字符（当前 ${declare.componentId.length}）`, 'componentId')
      }
      if (expectId && declare.componentId !== expectId) {
        push(issues, 'DECL_ID_MISMATCH', 'WARN', `componentId 与预期不一致（declare: "${declare.componentId}"，预期: "${expectId}"）`, 'componentId')
      }
    }

    if (!declare.componentName || typeof declare.componentName !== 'string') {
      push(issues, 'DECL_NAME_REQUIRED', 'BLOCK', '缺少必填字段 componentName（组件显示名称）', 'componentName')
    } else {
      if (ID_PREFIX_RE.test(declare.componentName)) {
        push(issues, 'DECL_NAME_ID_LIKE', 'BLOCK', `componentName 是组件 ID 而非中文显示名（当前: "${declare.componentName}"）`, 'componentName')
      }
      if (!CHINESE_CHAR_RE.test(declare.componentName)) {
        push(issues, 'DECL_NAME_NO_CHINESE', 'WARN', `componentName 缺少中文字符（当前: "${declare.componentName}"）`, 'componentName')
      }
      const len = [...declare.componentName].length
      if (len < 2 || len > 50) {
        push(issues, 'DECL_NAME_LENGTH', 'WARN', `componentName 长度须 2-50 字符（当前 ${len}）`, 'componentName')
      }
      if (expectName && declare.componentName !== expectName && expectName.length > 0) {
        push(issues, 'DECL_NAME_MISMATCH', 'WARN', `componentName 与预期不一致（declare: "${declare.componentName}"，预期: "${expectName}"）`, 'componentName')
      }
    }

    if (!declare.version || typeof declare.version !== 'string') {
      push(issues, 'DECL_VERSION_REQUIRED', 'BLOCK', '缺少必填字段 version（小写 v 开头，如 "v1.0.0"）', 'version')
    } else if (!/^v\d/.test(declare.version)) {
      push(issues, 'DECL_VERSION_FORMAT', 'BLOCK', `version 须小写 v 开头（当前: "${declare.version}"）`, 'version')
    }

    // attribute.aspectRatio 必填
    const attr = declare.attribute
    if (!isPlainObject(attr)) {
      push(issues, 'DECL_ATTR_REQUIRED', 'BLOCK', '缺少必填字段 attribute（对象）', 'attribute')
    } else {
      const ar = attr.aspectRatio
      if (!Array.isArray(ar) || ar.length !== 2 || ar.some(n => typeof n !== 'number')) {
        push(issues, 'DECL_ATTR_RATIO', 'BLOCK', 'attribute.aspectRatio 必须为 [width, height] 数值数组', 'attribute.aspectRatio')
      }
    }

    // businessEvents 必填（可为空对象）
    const events = declare.businessEvents
    if (events === undefined || events === null) {
      push(issues, 'DECL_EVENTS_REQUIRED', 'BLOCK', '缺少必填字段 businessEvents（可为空对象 {}）', 'businessEvents')
    } else if (Array.isArray(events)) {
      push(issues, 'DECL_EVENTS_ARRAY', 'BLOCK', 'businessEvents 必须是对象（keyed by eventId），不能是数组', 'businessEvents')
    } else if (!isPlainObject(events)) {
      push(issues, 'DECL_EVENTS_OBJECT', 'BLOCK', 'businessEvents 必须是对象', 'businessEvents')
    } else {
      for (const [key, evt] of Object.entries(events)) {
        const base = `businessEvents.${key}`
        if (!isPlainObject(evt)) {
          push(issues, 'DECL_EVENT_ENTRY', 'BLOCK', `${base} 必须是对象`, base)
          continue
        }
        if (evt.eventId !== undefined && evt.eventId !== key) {
          push(issues, 'DECL_EVENT_ID_KEY', 'BLOCK', `${base}.eventId 与对象 key 不一致（"${evt.eventId}" vs "${key}"）`, `${base}.eventId`)
        }
        if (!evt.eventName || typeof evt.eventName !== 'string') {
          push(issues, 'DECL_EVENT_NAME', 'BLOCK', `${base} 缺少 eventName（中文描述）`, `${base}.eventName`)
        } else if (!CHINESE_CHAR_RE.test(evt.eventName)) {
          push(issues, 'DECL_EVENT_NAME_ZH', 'WARN', `${base}.eventName 应为中文描述`, `${base}.eventName`)
        }
        for (const e of validateParamSchema(evt.eventDataSchema, `${base}.eventDataSchema`)) {
          push(issues, 'DECL_EVENT_SCHEMA', 'WARN', e, `${base}.eventDataSchema`)
        }
      }
      // onload 事件检查（仅当有事件时）
      if (Object.keys(events).length > 0 && !Object.keys(events).some(k => k.endsWith('-onload'))) {
        push(issues, 'DECL_EVENT_ONLOAD', 'WARN', 'businessEvents 中缺少 "-onload"（组件加载完成）事件', 'businessEvents')
      }
    }

    // businessStatuses 必填（可为空对象）
    const statuses = declare.businessStatuses
    if (statuses === undefined || statuses === null) {
      push(issues, 'DECL_STATUSES_REQUIRED', 'BLOCK', '缺少必填字段 businessStatuses（可为空对象 {}）', 'businessStatuses')
    } else if (Array.isArray(statuses)) {
      push(issues, 'DECL_STATUSES_ARRAY', 'BLOCK', 'businessStatuses 必须是对象（keyed by statusId），不能是数组', 'businessStatuses')
    } else if (!isPlainObject(statuses)) {
      push(issues, 'DECL_STATUSES_OBJECT', 'BLOCK', 'businessStatuses 必须是对象', 'businessStatuses')
    } else {
      for (const [key, st] of Object.entries(statuses)) {
        const base = `businessStatuses.${key}`
        if (!isPlainObject(st)) {
          push(issues, 'DECL_STATUS_ENTRY', 'BLOCK', `${base} 必须是对象`, base)
          continue
        }
        if (st.statusId !== undefined && st.statusId !== key) {
          push(issues, 'DECL_STATUS_ID_KEY', 'BLOCK', `${base}.statusId 与对象 key 不一致（"${st.statusId}" vs "${key}"）`, `${base}.statusId`)
        }
        if (!st.statusName || typeof st.statusName !== 'string') {
          push(issues, 'DECL_STATUS_NAME', 'BLOCK', `${base} 缺少 statusName（中文描述）`, `${base}.statusName`)
        }
        for (const e of validateParamSchema(st.parameters, `${base}.parameters`)) {
          push(issues, 'DECL_STATUS_PARAMS', 'WARN', e, `${base}.parameters`)
        }
      }
    }

    // ========== panelKey 弹窗规则 ==========
    // 规范：有 businessStatuses（弹窗类）时 panelKey 必须为 model-panels
    if (isPlainObject(declare.businessStatuses) && Object.keys(declare.businessStatuses).length > 0) {
      if (declare.panelKey !== 'model-panels') {
        push(
          issues, 'DECL_PANEL_MODAL',
          'BLOCK',
          `弹窗类组件（配置了 businessStatuses）panelKey 必须为 "model-panels"（当前: "${declare.panelKey || '未配置'}"）`,
          'panelKey'
        )
      }
    } else if (declare.panelKey !== undefined && !PANEL_KEYS.has(declare.panelKey)) {
      push(issues, 'DECL_PANEL_KEY', 'WARN', `panelKey 非法（"${declare.panelKey}"，允许: ${[...PANEL_KEYS].join('/')}）`, 'panelKey')
    }

    // ========== layoutConfig ==========
    const layout = declare.layoutConfig
    if (layout !== undefined && layout !== null) {
      if (Array.isArray(layout)) {
        push(issues, 'DECL_LAYOUT_STRUCT', 'BLOCK', 'layoutConfig 必须是对象 { default, list }，不能是数组', 'layoutConfig')
      } else if (isPlainObject(layout)) {
        if (!layout.default || typeof layout.default !== 'string') {
          push(issues, 'DECL_LAYOUT_DEFAULT', 'BLOCK', 'layoutConfig.default 必填（默认布局 key）', 'layoutConfig.default')
        }
        if (!Array.isArray(layout.list) || layout.list.length === 0) {
          push(issues, 'DECL_LAYOUT_LIST', 'BLOCK', 'layoutConfig.list 必须是非空数组', 'layoutConfig.list')
        } else {
          for (let i = 0; i < layout.list.length; i++) {
            const item = layout.list[i]
            if (!isPlainObject(item)) {
              push(issues, 'DECL_LAYOUT_ITEM', 'BLOCK', `layoutConfig.list[${i}] 必须是对象`, `layoutConfig.list[${i}]`)
              continue
            }
            if (!item.name || typeof item.name !== 'string') {
              push(issues, 'DECL_LAYOUT_ITEM_NAME', 'BLOCK', `layoutConfig.list[${i}].name 必填`, `layoutConfig.list[${i}].name`)
            }
            if (!item.key || typeof item.key !== 'string') {
              push(issues, 'DECL_LAYOUT_ITEM_KEY', 'BLOCK', `layoutConfig.list[${i}].key 必填`, `layoutConfig.list[${i}].key`)
            }
            if (item.previewName !== undefined && !/^mc-preview/.test(item.previewName)) {
              push(issues, 'DECL_LAYOUT_PREVIEW', 'WARN', `layoutConfig.list[${i}].previewName 必须以 "mc-preview" 开头（当前: "${item.previewName}"）`, `layoutConfig.list[${i}].previewName`)
            }
          }
          if (layout.default && !layout.list.some(item => item && item.key === layout.default)) {
            push(issues, 'DECL_LAYOUT_DEFAULT_MATCH', 'WARN', `layoutConfig.default ("${layout.default}") 不在 list 中`, 'layoutConfig.default')
          }
        }
      } else {
        push(issues, 'DECL_LAYOUT_TYPE', 'BLOCK', 'layoutConfig 必须是对象', 'layoutConfig')
      }
    }

    // ========== themeConfig ==========
    const theme = declare.themeConfig
    if (theme !== undefined && theme !== null) {
      if (Array.isArray(theme)) {
        push(issues, 'DECL_THEME_STRUCT', 'BLOCK', 'themeConfig 必须是对象 { default, list }，不能是数组', 'themeConfig')
      } else if (isPlainObject(theme)) {
        if (!theme.default || typeof theme.default !== 'string') {
          push(issues, 'DECL_THEME_DEFAULT', 'BLOCK', 'themeConfig.default 必填（默认主题 key）', 'themeConfig.default')
        }
        if (!Array.isArray(theme.list) || theme.list.length === 0) {
          push(issues, 'DECL_THEME_LIST', 'BLOCK', 'themeConfig.list 必须是非空数组', 'themeConfig.list')
        } else {
          for (let i = 0; i < theme.list.length; i++) {
            const item = theme.list[i]
            if (!isPlainObject(item)) {
              push(issues, 'DECL_THEME_ITEM', 'BLOCK', `themeConfig.list[${i}] 必须是对象`, `themeConfig.list[${i}]`)
              continue
            }
            if (!item.name || typeof item.name !== 'string') {
              push(issues, 'DECL_THEME_ITEM_NAME', 'BLOCK', `themeConfig.list[${i}].name 必填`, `themeConfig.list[${i}].name`)
            }
            if (!item.key || typeof item.key !== 'string') {
              push(issues, 'DECL_THEME_ITEM_KEY', 'BLOCK', `themeConfig.list[${i}].key 必填`, `themeConfig.list[${i}].key`)
            }
          }
          if (theme.default && !theme.list.some(item => item && item.key === theme.default)) {
            push(issues, 'DECL_THEME_DEFAULT_MATCH', 'WARN', `themeConfig.default ("${theme.default}") 不在 list 中`, 'themeConfig.default')
          }
        }
      } else {
        push(issues, 'DECL_THEME_TYPE', 'BLOCK', 'themeConfig 必须是对象', 'themeConfig')
      }
    }

    // ========== dataSources ==========
    const sources = declare.dataSources
    if (sources !== undefined && sources !== null) {
      if (!Array.isArray(sources)) {
        push(issues, 'DECL_SOURCES_ARRAY', 'BLOCK', 'dataSources 必须是数组', 'dataSources')
      } else {
        for (let i = 0; i < sources.length; i++) {
          const src = sources[i]
          const base = `dataSources[${i}]`
          if (!isPlainObject(src)) {
            push(issues, 'DECL_SOURCE_ENTRY', 'BLOCK', `${base} 必须是对象`, base)
            continue
          }
          if (!src.sourceName || typeof src.sourceName !== 'string') {
            push(issues, 'DECL_SOURCE_NAME', 'BLOCK', `${base}.sourceName 必填（驼峰命名）`, `${base}.sourceName`)
          } else if (!CAMEL_RE.test(src.sourceName) || /^[A-Z]/.test(src.sourceName)) {
            push(issues, 'DECL_SOURCE_CAMEL', 'WARN', `${base}.sourceName 应为驼峰命名（当前: "${src.sourceName}"）`, `${base}.sourceName`)
          }
          if (Array.isArray(src.columns)) {
            for (let j = 0; j < src.columns.length; j++) {
              const col = src.columns[j]
              if (isPlainObject(col) && typeof col.name === 'string' && SYSTEM_RESERVED_COLUMNS.has(col.name)) {
                push(issues, 'DECL_SOURCE_RESERVED', 'WARN', `${base}.columns[${j}].name 使用系统保留字段 "${col.name}"`, `${base}.columns[${j}].name`)
              }
            }
          }
        }
      }
    }

    // ========== formSources ==========
    const forms = declare.formSources
    if (forms !== undefined && forms !== null) {
      if (!Array.isArray(forms)) {
        push(issues, 'DECL_FORMS_ARRAY', 'BLOCK', 'formSources 必须是数组', 'formSources')
      } else {
        for (let i = 0; i < forms.length; i++) {
          const form = forms[i]
          if (!isPlainObject(form)) {
            push(issues, 'DECL_FORM_ENTRY', 'BLOCK', `formSources[${i}] 必须是对象`, `formSources[${i}]`)
            continue
          }
          if (!form.formName || typeof form.formName !== 'string') {
            push(issues, 'DECL_FORM_NAME', 'BLOCK', `formSources[${i}].formName 必填`, `formSources[${i}].formName`)
          }
        }
      }
    }

    // ========== cssVariableConfig ==========
    const cssVars = declare.cssVariableConfig
    if (cssVars !== undefined && cssVars !== null) {
      if (!Array.isArray(cssVars)) {
        push(issues, 'DECL_CSSVARS_ARRAY', 'BLOCK', 'cssVariableConfig 必须是数组', 'cssVariableConfig')
      } else {
        for (let i = 0; i < cssVars.length; i++) {
          const item = cssVars[i]
          const base = `cssVariableConfig[${i}]`
          if (!isPlainObject(item)) {
            push(issues, 'DECL_CSSVAR_ENTRY', 'BLOCK', `${base} 必须是对象`, base)
            continue
          }
          if (!item.name || typeof item.name !== 'string') {
            push(issues, 'DECL_CSSVAR_NAME', 'WARN', `${base}.name 建议填写（中文描述）`, `${base}.name`)
          }
          if (!item.key || typeof item.key !== 'string') {
            push(issues, 'DECL_CSSVAR_KEY', 'BLOCK', `${base}.key 必填（CSS 变量标识）`, `${base}.key`)
          }
          if (item.type !== undefined && !CSS_VAR_TYPES.has(item.type)) {
            push(issues, 'DECL_CSSVAR_TYPE', 'WARN', `${base}.type 非法（"${item.type}"，允许: ${[...CSS_VAR_TYPES].join('/')}）`, `${base}.type`)
          }
          if (item.type === 'select' && !(Array.isArray(item.list) && item.list.length > 0)) {
            push(issues, 'DECL_CSSVAR_SELECT', 'WARN', `${base} type=select 时必须提供非空 list`, base)
          }
        }
      }
    }

    // ========== businessConfig ==========
    const bizConfig = declare.businessConfig
    if (bizConfig !== undefined && bizConfig !== null) {
      if (!Array.isArray(bizConfig)) {
        push(issues, 'DECL_BIZCFG_ARRAY', 'BLOCK', 'businessConfig 必须是数组', 'businessConfig')
      } else {
        const seenKeys = new Set()
        for (let i = 0; i < bizConfig.length; i++) {
          const item = bizConfig[i]
          const base = `businessConfig[${i}]`
          if (!isPlainObject(item)) {
            push(issues, 'DECL_BIZCFG_ENTRY', 'BLOCK', `${base} 必须是对象`, base)
            continue
          }
          if (!item.key || typeof item.key !== 'string') {
            push(issues, 'DECL_BIZCFG_KEY', 'BLOCK', `${base}.key 必填（camelCase，不可用 payload）`, `${base}.key`)
          } else {
            if (item.key === 'payload') {
              push(issues, 'DECL_BIZCFG_PAYLOAD', 'BLOCK', `${base}.key 不可使用 "payload"（框架保留）`, `${base}.key`)
            }
            if (seenKeys.has(item.key)) {
              push(issues, 'DECL_BIZCFG_DUP', 'BLOCK', `${base}.key "${item.key}" 重复`, `${base}.key`)
            }
            seenKeys.add(item.key)
          }
          if (!item.name || typeof item.name !== 'string') {
            push(issues, 'DECL_BIZCFG_NAME', 'WARN', `${base}.name 建议填写（中文描述）`, `${base}.name`)
          }
          if (item.type !== undefined && !BUSINESS_CONFIG_TYPES.has(item.type)) {
            push(issues, 'DECL_BIZCFG_TYPE', 'WARN', `${base}.type 非法（"${item.type}"，允许: ${[...BUSINESS_CONFIG_TYPES].join('/')}）`, `${base}.type`)
          }
          if (item.describe === undefined || item.describe === null || item.describe === '') {
            push(issues, 'DECL_BIZCFG_DESC', 'WARN', `${base}.describe 必填（参数用途说明）`, `${base}.describe`)
          }
          if (item.renderType !== undefined && !RENDER_TYPES.has(item.renderType)) {
            push(issues, 'DECL_BIZCFG_RENDER', 'WARN', `${base}.renderType 非法（"${item.renderType}"，允许: ${[...RENDER_TYPES].join('/')}）`, `${base}.renderType`)
          }
          if (item.renderType === 'radio' && item.default === undefined) {
            // 规范：radio 时 list 缺省自动提供 是/否 选项，default 缺省不阻塞
          }
        }
      }
    }

    const blockCount = issues.filter(i => i.severity === 'BLOCK').length
    const warnCount = issues.filter(i => i.severity === 'WARN').length
    return {
      pass: blockCount === 0,
      blockCount,
      warnCount,
      issues
    }
  }

  /**
   * 生成可读的校验摘要（供 warnings 或日志使用）
   */
  static formatSummary(result) {
    if (result.pass) return `✅ declare.json 校验通过（${result.warnCount} 条建议）`
    const blocks = result.issues.filter(i => i.severity === 'BLOCK')
    const warns = result.issues.filter(i => i.severity === 'WARN')
    const lines = []
    if (blocks.length) {
      lines.push(`🔴 ${blocks.length} 项结构违规：`)
      lines.push(...blocks.slice(0, 5).map(i => `  - [${i.id}] ${i.path || '(root)'}: ${i.message}`))
      if (blocks.length > 5) lines.push(`  ... 等 ${blocks.length} 项`)
    }
    if (warns.length) lines.push(`🟡 ${warns.length} 项质量建议（不阻塞）`)
    return lines.join('\n')
  }
}

export default DeclareJsonSchemaValidator
