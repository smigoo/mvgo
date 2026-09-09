/**
 * P0-C：构建精简重试 Prompt（纯函数，零业务依赖，便于单测）。
 * 失败重试不再重发完整 Figma/规范/截图上下文，只携带：
 * - 目标文件清单
 * - 与目标文件直接相关的上下文契约（chunk.contextFiles，各最多 4000 字）
 * - 上一次的错误类型与说明
 * 并保留微码组件最关键约束，避免质量崩塌。
 *
 * @param {object} chunk - 分块描述（含 files / contextFiles）
 * @param {string} lastErrType - 'max_tokens' | 'truncation' | 'semantics' | 'parse_failure' | 其他
 * @param {string} lastErr - 上一次错误描述
 * @returns {string}
 */
export function buildRetryPrompt(chunk, lastErrType, lastErr) {
  const targetFiles = (chunk?.files || []).join('\n') || '（由调用方指定）'
  const segmentType = chunk?.segmentType || ''
  const contractParts = (chunk?.contextFiles || []).map((cf) => {
    const content = (cf?.content || '').slice(0, 4000)
    return '// @file ' + cf.path + '\n' + content
  })
  let errorNote
  if (lastErrType === 'max_tokens') {
    errorNote = '⚠️ 上次因 max_tokens（输出长度超限）被截断，请精简输出（减少冗余注释和空白），只输出必要文件内容。'
  } else if (lastErrType === 'semantics') {
    errorNote = '⚠️ 上次 <script> 输出语义不完整（' + lastErr + '）。请修正并重新输出完整的 <script setup> 块：import 去重、声明模板用到的全部变量/资源、补全 onMounted 逻辑，闭合 </script>。'
  } else if (lastErrType === 'parse_failure') {
    errorNote = '⚠️ 上次输出不是合规的 JSON 结构，解析失败（' + lastErr + '）。请重新输出合规 JSON：顶层必须包含 files 对象（形如 { "package/index.vue": "..." }），并用 // === path === 分隔符包裹每个文件内容，确保 JSON 能被完整解析、files 字段非空。'
  } else {
    errorNote = '⚠️ 上次输出被截断或不完整（涉及文件：' + (chunk?.files || []).join('、') + '）。请务必完整输出每一个文件的全部内容，闭合所有标签。'
  }

  // 🛡️ P1-3：按 segmentType 区分输出格式，避免 script/template 分块重试时被要求输出多文件分隔符格式
  let outputFormatNote
  if (segmentType === 'script') {
    outputFormatNote = '只输出单个 <script setup> 到 </script> 完整块，不要输出 <template>/<style>，不要用 // === path === 分隔符包裹。'
  } else if (segmentType === 'template') {
    outputFormatNote = '只输出单个 <template> 到 </template> 完整块，不要输出 <script>/<style>，不要用 // === path === 分隔符包裹。'
  } else {
    outputFormatNote = '输出使用 // === path === 分隔各文件。'
  }

  const parts = [
    '你是微码组件开发工程师。基于以下上下文契约重新生成目标文件，修复上次错误。',
    '## 关键约束（不可违反）\n- 主组件 <script setup> 中调用一次 $mcComponentBuilder() 并直接解构（声明+赋值一体）：const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()\n- 禁止用 let runtimeBuilder = null 分离声明与赋值（会触发 TDZ）\n- onMounted 中 runtimeBuilder.publishEvent(\'组件名-onload\', {...})\n- 禁止手写资源 import（bg1/icon1 由系统注入）\n- ' + outputFormatNote,
    '## 目标文件（必须输出）\n' + targetFiles,
  ]
  if (contractParts.length) parts.push('## 上下文契约（仅相关文件，各最多 4000 字）\n' + contractParts.join('\n\n'))
  parts.push(errorNote)
  parts.push('请只输出目标文件的完整内容，末尾闭合所有标签。')
  return parts.join('\n\n')
}
