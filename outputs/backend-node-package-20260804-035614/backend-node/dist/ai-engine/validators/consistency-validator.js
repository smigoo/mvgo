/**
 * ConsistencyValidator — 声明↔消费一致性对账（确定性，零 LLM）
 * 三对对账：
 *  ① 事件声明（declare.json businessEvents）↔ publishEvent 调用点
 *  ② 配置声明（declare.json businessConfig keys）↔ getConfig/config 消费点
 *  ③ 数据字段（declare.json dataSources columns）↔ 代码字段引用
 * 输出：不一致清单（declaredNotUsed / usedNotDeclared），供 L2 路由精准修补
 * v2 修复（实测 fail 教训）：可选链正则 (?:\?\.)? 作为整体可选，
 *   兼容 runtimeBuilder?.publishEvent?.('x') 与直接 publishEvent('x') 两种写法
 */
import { createLogger } from '../logger/index.js'

const logger = createLogger({ name: 'consistency-validator' })

/** 从 declare.json 提取声明集合 */
function extractDeclarations(declare) {
  const events = Object.keys(declare?.businessEvents || {})
  const configs = (declare?.businessConfig || []).map((c) => c.key).filter(Boolean)
  const dataFields = []
  for (const ds of declare?.dataSources || []) {
    for (const col of ds.columns || []) {
      if (col.name) dataFields.push(col.name)
    }
  }
  const statuses = Object.keys(declare?.businessStatuses || {})
  return { events, configs, dataFields, statuses }
}

/** 从代码提取消费集合（可选链 (?:\?\.)? 整体可选，兼容两种调用写法） */
function extractConsumptions(codeCorpus) {
  // publishEvent('xxx' / publishEvent?.('xxx' 调用点
  const published = new Set()
  for (const m of codeCorpus.matchAll(/publishEvent(?:\?\.)?\(\s*['"`]([\w-]+)['"`]/g)) published.add(m[1])
  // listenEvent('xxx' 状态方法注册点
  const listened = new Set()
  for (const m of codeCorpus.matchAll(/listenEvent(?:\?\.)?\(\s*['"`]([\w-]+)['"`]/g)) listened.add(m[1])
  // getConfig('key' / config.value.key / config.key 消费点
  const configUsed = new Set()
  for (const m of codeCorpus.matchAll(/getConfig\(\s*['"`]([\w-]+)['"`]/g)) configUsed.add(m[1])
  for (const m of codeCorpus.matchAll(/config\.value\.(\w+)/g)) configUsed.add(m[1])
  for (const m of codeCorpus.matchAll(/config\.(\w+)\s*[,})]/g)) configUsed.add(m[1])
  return { published, listened, configUsed }
}

/** 事件名归一（mc-xxx-onload → onload 后缀比对用） */
function eventMatches(declared, publishedSet) {
  for (const p of publishedSet) {
    if (p === declared || p.endsWith('-' + declared) || declared.endsWith('-' + p) || declared.endsWith(p)) return true
  }
  return false
}

export class ConsistencyValidator {
  /**
   * @param {object} params
   * @param {object} params.declare - declare.json 内容
   * @param {Record<string, string>} params.files - 生成文件集 {path: content}
   */
  validate({ declare, files }) {
    if (!declare) {
      return { skipped: true, reason: '无 declare.json', issues: [] }
    }

    const codeCorpus = Object.entries(files || {})
      .filter(([p]) => /\.(vue|js|ts)$/.test(p))
      .map(([, c]) => c)
      .join('\n')

    const decl = extractDeclarations(declare)
    const cons = extractConsumptions(codeCorpus)
    const issues = []

    // ① 事件声明 ↔ 调用点
    for (const evt of decl.events) {
      if (!eventMatches(evt, cons.published)) {
        issues.push({
          type: 'event-declared-not-published',
          severity: 'WARN',
          target: evt,
          message: `事件「${evt}」已在 declare.json 声明，但代码中无 publishEvent 调用点`,
          fix: `在对应业务时机调用 runtimeBuilder.publishEvent('${evt}', {...})`,
        })
      }
    }

    // ② 配置声明 ↔ 消费点
    for (const key of decl.configs) {
      if (!cons.configUsed.has(key)) {
        issues.push({
          type: 'config-declared-not-consumed',
          severity: 'WARN',
          target: key,
          message: `配置「${key}」已在 businessConfig 声明，但代码中无 getConfig/config 消费（配置未真正生效）`,
          fix: `通过 getConfig('${key}', 默认值) 读取并在逻辑中使用`,
        })
      }
    }

    // ③ 数据字段声明 ↔ 代码引用（弱校验：字段名在代码中出现即可）
    const unusedFields = decl.dataFields.filter((f) => !codeCorpus.includes(f))
    if (decl.dataFields.length && unusedFields.length === decl.dataFields.length) {
      issues.push({
        type: 'datasource-fields-unused',
        severity: 'WARN',
        target: (decl.dataSources || []).map((d) => d.sourceName).join(','),
        message: `dataSources 声明的 ${decl.dataFields.length} 个字段全部未在代码中引用`,
        fix: '检查数据字段映射是否落地',
      })
    }

    // 反向对账：调用了但未声明的事件（declare 漏声明）
    for (const p of cons.published) {
      const declared = decl.events.some((e) => e === p || p.endsWith('-' + e) || e.endsWith('-' + p) || e.endsWith(p))
      if (!declared) {
        issues.push({
          type: 'event-published-not-declared',
          severity: 'INFO',
          target: p,
          message: `代码 publishEvent('${p}') 但未在 declare.json businessEvents 声明`,
          fix: `在 businessEvents 补充声明「${p}」`,
        })
      }
    }

    const pass = issues.filter((i) => i.severity === 'WARN').length === 0
    logger.info('🧾 一致性对账', {
      events: `${decl.events.length}声明/${cons.published.size}调用`,
      configs: `${decl.configs.length}声明/${cons.configUsed.size}消费`,
      issues: issues.length, pass,
    })

    return {
      skipped: false,
      pass,
      issues,
      stats: {
        eventsDeclared: decl.events.length,
        eventsPublished: cons.published.size,
        configsDeclared: decl.configs.length,
        configsConsumed: cons.configUsed.size,
        fieldsDeclared: decl.dataFields.length,
      },
      summary: issues.length
        ? `声明↔消费对账发现 ${issues.length} 处不一致`
        : '声明与消费完全一致',
    }
  }
}

export default ConsistencyValidator
