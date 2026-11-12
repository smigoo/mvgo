/**
 * Agent Builder AI 节点模板库
 * 生成 LLM 调用型智能体：用户提供 prompt + 输入输出字段 + 模型配置。
 * 代码走 BaseAgent 标准 LLM 调用（this.llm.invoke + 统一网关/供应商池）。
 * vision 模式：输入含图片路径（image 类型字段），转 base64 多模态消息调用视觉模型。
 */

/**
 * AI 节点模板：通用 LLM 分析（prompt → JSON 结构化输出）
 * def.params.vision === true 或 inputs 含 type='image' → 生成视觉分析代码
 */
export function renderLlmAnalyzer(def) {
  const { name, description } = def
  const inputKeys = (def.inputs || []).map((i) => i.key).filter(Boolean)
  const outputKeys = (def.outputs || []).map((o) => o.key).filter(Boolean)
  // 视觉模式：params.vision 或输入含 image 类型字段
  const vision = def.params?.vision === true || (def.inputs || []).some((i) => String(i.type || '').includes('image'))
  const imageFields = (def.inputs || []).filter((i) => String(i.type || '').includes('image')).map((i) => i.key)
  // 参考资源（创建时上传，注入 Prompt）：文本类读内容，图片类仅声明存在
  const refFiles = (def.referenceFiles || []).filter((r) => r && r.url)
  const REF_FILES_JSON = JSON.stringify(refFiles.map((r) => ({ name: r.name, url: r.url, type: r.type })))
  // prompt 内容转义：单引号 → \\'，反斜杠 → \\（数组 join 构造，避免嵌套模板字符串转义地狱）
  const prompt = (def.params?.prompt || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')
  // 参考文档读取代码（文本类 → 读内容，图片/pdf → 仅提示存在）
  const refPrelude = refFiles.length ? `
      const refDocs = []
      for (const rf of REF_FILES) {
        if (/(png|jpe?g|gif|webp|svg|pdf)$/i.test(rf.type || '')) {
          refDocs.push('# 参考图片: ' + rf.name + '（已上传，路径: ' + rf.url + '）')
          continue
        }
        try {
          const _fs = await import('node:fs')
          const c = _fs.readFileSync(rf.url, 'utf-8')
          refDocs.push('# 参考文档: ' + rf.name + '\\n' + c.slice(0, 8000))
        } catch (e) { logger.warn('读取参考文档失败 ' + rf.name + ': ' + e.message) }
      }
` : ''
  // prompt 数组注入参考文档段
  const refSegment = refFiles.length
    ? `,
        '',
        '# 参考文档（创建时上传，需严格遵循其规范）',
        ...refDocs`
    : ''
  // 视觉：图片读取 + 多模态消息构造代码
  const visionPrelude = vision ? `
      //  视觉模式：读取图片 → base64 data URL → 多模态消息
      const images = []
      ${imageFields.length ? imageFields.map((f) => `
      if (params.${f}) {
        try {
          const fs = await import('node:fs')
          const b64 = fs.readFileSync(params.${f}).toString('base64')
          const ext = String(params.${f}).split('.').pop() || 'png'
          images.push({ type: 'image_url', image_url: { url: 'data:image/' + ext + ';base64,' + b64 } })
        } catch (e) { logger.warn('读取图片失败 ${f}: ' + e.message) }
      }`).join('\n') : `
      if (params.imagePath) {
        try {
          const fs = await import('node:fs')
          const b64 = fs.readFileSync(params.imagePath).toString('base64')
          const ext = String(params.imagePath).split('.').pop() || 'png'
          images.push({ type: 'image_url', image_url: { url: 'data:image/' + ext + ';base64,' + b64 } })
        } catch (e) { logger.warn('读取图片失败: ' + e.message) }
      }`}
      if (images.length === 0) return { ${outputKeys.map((k) => `${k}: null`).join(', ') || 'ok: false'}, error: '缺少图片输入（image 字段）' }
` : ''
  // 视觉：HumanMessage content 为数组（text + images）；文本为纯字符串
  const messageBuild = vision
    ? `[{ type: 'text', text: prompt }, ...images]`
    : 'prompt'

  return `/**
 * ${def.label}（Agent Builder 自动生成，请勿手改）
 * 模板: ${def.templateId}${vision ? '（视觉模式）' : ''} | 创建: ${new Date().toISOString()}
 * 输入: ${inputKeys.join(', ') || '(无)'}
 * 输出: ${outputKeys.join(', ') || '(无)'}
 */

import { BaseAgent } from '../../agents/base-agent.js'
import { createLogger } from '../../logger/index.js'
import { HumanMessage } from '@langchain/core/messages'

const logger = createLogger({ name: '${name}' })

// 创建时上传的参考资源（绝对路径，运行时读取注入 Prompt）
const REF_FILES = ${REF_FILES_JSON}

export class DynamicAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      name: '${name}',
      description: '${(description || '').replace(/'/g, "\\'")}',
      model: config.model || '',
      temperature: config.temperature ?? 0.2,
      maxTokens: config.maxTokens || 4096,
      ...config,
    })
  }

  async execute(params) {
    const onProgress = params.onProgress || null
    onProgress?.({
      stage: '${name}',
      message: '${def.label} 执行中（LLM${vision ? '·视觉' : ''}）...',
      status: 'running',
    })
    try {
${refPrelude}
${visionPrelude}
      const inputSummary = ${inputKeys.length ? `JSON.stringify({ ${inputKeys.map((k) => `${k}: params.${k}`).join(', ')} })` : `'{}'`}
      const prompt = [
        '${prompt}',
        '',
        '# 输入数据',
        '\`\`\`json',
        inputSummary,
        '\`\`\`'${refSegment},
        '',
        '# 输出要求',
        '严格输出 JSON 对象，包含字段: ${outputKeys.join(', ') || 'result'}。不要输出其他内容。',
      ].join('\\n')
      const response = await this.llm.invoke([new HumanMessage(${messageBuild})])
      const text = typeof response?.content === 'string' ? response.content : JSON.stringify(response?.content || '')
      let parsed
      try {
        const cleaned = text.replace(/^\`\`\`json?\\s*/, '').replace(/\`\`\`\\s*$/, '').trim()
        parsed = JSON.parse(cleaned)
      } catch {
        parsed = { result: text }
      }
      onProgress?.({ stage: '${name}', message: '✅ ${def.label} 完成', status: 'completed' })
      return { ${outputKeys.map((k) => `${k}: parsed[${JSON.stringify(k)}] ?? null`).join(', ') || 'ok: true'}, raw: parsed }
    } catch (e) {
      logger.warn('${name} LLM 调用失败（容错返回）: ' + e.message)
      onProgress?.({ stage: '${name}', message: '⚠️ ${def.label} 失败: ' + e.message, status: 'failed' })
      return { ${outputKeys.map((k) => `${k}: null`).join(', ') || 'ok: false'}, error: e.message }
    }
  }

  parseOutput(rawOutput) {
    return rawOutput
  }
}
`
}

/** AI 模板注册表（含资源清单） */
export const LLM_TEMPLATES = {
  'llm-analyzer': {
    id: 'llm-analyzer',
    label: 'LLM 通用分析',
    description: '自定义 prompt 的 LLM 分析节点，输出 JSON 结构化字段（输入含 image 类型字段自动启用视觉模式）',
    render: renderLlmAnalyzer,
    resources: {
      inputs: [{ key: 'input（可多个）', type: 'any', required: true, desc: '喂给 prompt 的输入字段（type 填 image 则按图片读取）' }],
      outputs: [{ key: 'result（可多个）', type: 'any', required: true, desc: '期望 LLM 输出的 JSON 字段（严格按此解析）' }],
      params: [{ key: 'prompt', label: 'Prompt 模板', type: 'text', required: true, desc: '角色指令 + 分析要求（自动拼接输入 JSON 与输出要求）' }, { key: 'vision', label: '视觉模式', type: 'boolean', required: false, desc: 'true 或输入含 image 字段即启用' }],
      requires: { model: true, prompt: true },
    },
  },
  'vision-compare': {
    id: 'vision-compare',
    label: '视觉比对（双图）',
    description: '对比两张图（如设计稿 vs 截图）输出相似度与差异（对应 phase2 visual-comparator）',
    render: renderLlmAnalyzer,
    resources: {
      inputs: [
        { key: 'figmaImage', type: 'image', required: true, desc: '基准图/设计稿图片路径' },
        { key: 'renderedImage', type: 'image', required: true, desc: '渲染截图图片路径' },
      ],
      outputs: [{ key: 'similarity', type: 'number' }, { key: 'differences', type: 'array' }],
      params: [{ key: 'prompt', label: '对比指令', type: 'text', required: true, desc: '对比两图输出 similarity(0-100) 与 differences 数组', example: '对比两图，输出 JSON：similarity 相似度分数、differences 差异点数组' }],
      requires: { model: true, prompt: true },
    },
  },
}
