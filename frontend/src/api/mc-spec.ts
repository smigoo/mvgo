/**
 * @Description: 微码组件规范检查接口（backend-node /api/mc-spec/*）
 *
 * 后端约定：所有规范检查 skill 的入口都是 `scripts/mc-check.cjs`，
 * 内置默认 skill 为 `frontend-mc-check`（v1.0.20，M1~M5 五系列）。
 */
import http from '@/core/http'

/** 单个检查项 */
export interface McSpecItem {
  /** 检查项编号，如 M5-6 */
  id: string
  /** 检查项名称，如 主题变量引用 */
  name: string
  /** 级别：error / warning / pass */
  level: string
  /** 是否通过 */
  passed: boolean
  /** 说明（失败时为具体原因） */
  message: string
}

/** 检查结果 */
export interface McSpecCheckResult {
  specVersion: string
  checkedAt: string
  componentId: string
  dirName: string
  passCount: number
  failCount: number
  warningCount: number
  /** M 系列全部通过才为 true，false 表示不允许上线 */
  canRelease: boolean
  items: McSpecItem[]
  errors: McSpecItem[]
  warnings: McSpecItem[]
  /** 后端自包含 HTML 报告地址（同源，可直接 iframe/新窗口打开） */
  reportUrl?: string
  skillId: string
}

/** 可用规范检查 skill */
export interface McSpecSkill {
  id: string
  name: string
  builtin: boolean
  available: boolean
  /** SKILL.md 里的 description（可选） */
  description?: string
  /** SKILL.md 里的 version（可选） */
  version?: string
  /** 自定义 skill 的安装时间（ISO） */
  uploadedAt?: string
}

/** M 系列中文名（与 SKILL.md 保持一致） */
export const MC_SERIES_LABEL: Record<string, string> = {
  M1: 'M1 命名规范',
  M2: 'M2 必要文件',
  M3: 'M3 declare.json 字段',
  M4: 'M4 文件格式',
  M5: 'M5 代码规范',
}

/**
 * 后端统一响应包装为 { success, code, message, data }，
 * core/http 只做 JSON 解析不解包，这里统一取出业务体。
 */
const unwrap = (res: any) =>
  res && typeof res === 'object' && 'data' in res ? res.data : res

// ⚠️ 必须写全路径 `/api/...`：core/http.js 的 resolveUrl 对以 `/` 开头的 URL
// 原样透传、不补 /api 前缀，写成 '/mc-spec/check' 会请求到站点根路径直接 404。

/** 可用 skill 列表 */
export async function listMcSpecSkills(): Promise<McSpecSkill[]> {
  const res: any = await http.get('/api/mc-spec/skills')
  const data = unwrap(res)
  return Array.isArray(data?.skills) ? data.skills : []
}

/**
 * 按检查项编号推断「主要修改对象」，避免 AI 在组件里全局乱找。
 * 如 M1-3（version 格式）实际要改的是根目录 declare.json，不是 package/declare.json。
 */
const FIX_TARGET_HINT: Array<{ test: RegExp; hint: string }> = [
  { test: /^M1-/, hint: '主要修改对象：组件根目录 declare.json（componentId / componentName / version）' },
  { test: /^M2-/, hint: '主要修改对象：组件目录结构与资源文件（package/、resources/、declare.json、declare.js、component.js 等）' },
  { test: /^M3-/, hint: '主要修改对象：组件根目录 declare.json 的各配置字段' },
  { test: /^M4-/, hint: '主要修改对象：declare.js / component.js / css-vars.js / resources/styles/index.less' },
  { test: /^M5-/, hint: '主要修改对象：package/index.vue 及 package/components/ 下的子组件' },
]

/**
 * 生成单个失败项的 AI 修复指令（复用 Playground 对话式修改管线落盘）
 *
 * 指令里带上微码规范硬性要点，让修改器做最小修复而不是重构。
 */
export function buildMcSpecFixPrompt(item: McSpecItem): string {
  const target = FIX_TARGET_HINT.find((t) => t.test.test(item.id || ''))?.hint || ''
  return [
    `请修复微码组件规范检查失败项 [${item.id}] ${item.name}：`,
    item.message,
    target,
    '',
    '要求：',
    '1. 先用 list_files / read_file 定位真实文件（注意 declare.json 在组件根目录，不在 package/ 下），确认当前内容后再改；',
    '2. 只做与该失败项直接相关的最小修改，不要重构、不要改动无关代码；',
    '3. 若失败原因是「字段缺失」或「当前值为空」，请按规范直接新增/补齐默认值（例如 version 填 "v1.0.0"），**不要反问用户、不要因为信息不全就放弃修改**；',
    '4. 遵守微码组件规范：declare.json 字段完整（componentId、componentName、version、attribute、aspectRatio、businessEvents、businessStatuses、themeConfig、layoutConfig.list 等）、css-vars.js 必须导出 cssVars、样式颜色/字号经 themes/theme-vars.less 与 resources/styles 变量引用、resources/styles/index.less 必须存在且在 package/index.vue 中引用、index.vue 根节点必须用 <base-panel> 包裹；',
    '5. 若该失败项需要二进制产物（如 mc-preview.png 截图），跳过并在回复中说明需手动处理；',
    '6. 必须调用 write_file 落盘，回复中列出改动文件清单；可以提问，但提问前先把能确定的修改写完。',
  ].filter(Boolean).join('\n')
}

/**
 * AI 修复单个规范失败项：走 Playground 对话式修改管线（/api/demo/ai-chat），
 * AI 修改结果直接写入组件 workspace 文件（耗时约 1~2 分钟）。
 */
export async function fixMcSpecItem(
  componentId: string,
  item: McSpecItem,
): Promise<any> {
  const res: any = await http.post('/api/demo/ai-chat', {
    componentId,
    message: buildMcSpecFixPrompt(item),
  })
  const data = unwrap(res) ?? res
  // ⚠️ agent 失败时后端仍返回 HTTP 200，但 success=false（如 API Key 未配置）。
  // 不判断就会出现「提示修复完成、重查却没变」的假成功。
  if (data && data.success === false) {
    const detail = Array.isArray(data.toolErrors) && data.toolErrors.length
      ? data.toolErrors.join('；')
      : data.content || data.error || ''
    const err: any = new Error(`AI 修复未成功执行：${detail || '未知原因'}`)
    err.data = { message: err.message }
    throw err
  }
  return data
}

/**
 * 对单个组件执行规范检查（同步，约 1s）
 * @param componentId 组件 ID
 * @param skillId 可选，留空用内置默认 skill
 */
export async function checkMcSpec(
  componentId: string,
  skillId?: string,
): Promise<McSpecCheckResult> {
  const res: any = await http.post('/api/mc-spec/check', { componentId, skillId })
  return unwrap(res)?.result as McSpecCheckResult
}

/**
 * 上传 zip 注册自定义规范检查 skill（**仅管理员**）
 *
 * 契约：zip 内必须含约定入口 `scripts/mc-check.cjs`；顶层目录会自动剥离。
 *
 * @param file zip 文件
 * @param opts.skillId 可选，显式指定 skill 标识（留空取 zip 顶层目录名 / 文件名）
 * @param opts.overwrite 同名已存在时是否覆盖
 */
export async function uploadMcSpecSkill(
  file: File,
  opts: { skillId?: string; overwrite?: boolean } = {},
): Promise<McSpecSkill> {
  const fd = new FormData()
  fd.append('file', file)
  if (opts.skillId) fd.append('skillId', opts.skillId)
  if (opts.overwrite) fd.append('overwrite', 'true')
  // FormData 交给浏览器自行设置 multipart 边界
  const res: any = await http.upload('/api/mc-spec/skills', fd)
  const data = unwrap(res) ?? res
  if (data && data.success === false) {
    const err: any = new Error(data.message || '上传失败')
    err.data = { message: err.message }
    throw err
  }
  return data?.skill as McSpecSkill
}

/** 卸载自定义 skill（**仅管理员**，内置不可删） */
export async function removeMcSpecSkill(skillId: string): Promise<void> {
  const res: any = await http.delete(`/api/mc-spec/skills/${encodeURIComponent(skillId)}`)
  const data = unwrap(res) ?? res
  if (data && data.success === false) {
    const err: any = new Error(data.message || '卸载失败')
    err.data = { message: err.message }
    throw err
  }
}
