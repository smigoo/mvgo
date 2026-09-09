/**
 * 运行时环境变量单一真相源（runtime-env）
 *
 * 目标：消除「本地好、线上崩」。
 * 此前预览地址 / Java 地址 / 质量参数分散在多个文件直接读 process.env 或硬编码域名，
 * 且部署脚本漏写部分变量 → 线上静默走错误默认值（如质量参数回退 1 轮/75 分、审计日志打到 localhost）。
 * 本模块集中所有「影响本地/线上行为一致性」的环境变量读取，并提供启动期校验。
 *
 * 规则：
 * - 生产缺失必填项 → 启动直接失败（fail-fast），打印缺失清单。
 * - 开发缺失 → 告警并回退到开发友好默认值，不阻断本地启动。
 * - 业务代码一律通过本模块取配置，禁止再写 process.env.XXX 或硬编码域名。
 *
 * ai-engine 的 ESM .js 文件通过 `import { ... } from '../../config/runtime-env.js'` 引用，
 * 与 backend-root.js 引用方式一致（编译后位于 dist/config/runtime-env.js）。
 */

const NODE_ENV = process.env.NODE_ENV || 'development'
const IS_PRODUCTION = NODE_ENV === 'production'

function normUrl(value?: string): string {
  const url = value?.trim()
  return url ? url.replace(/\/$/, '') : ''
}

/**
 * 前端真实预览页基准地址（截图器探测用）。
 * 必填：生产缺失 → 启动失败（没有它截图器会打到错误域名）。
 * 开发缺失 → 回退本机 2610（本地前端通常就跑在 2610）。
 */
export function getPreviewBaseUrl(): string {
  const configured = normUrl(process.env.MC_PREVIEW_BASE_URL)
  if (configured) return configured
  if (IS_PRODUCTION) {
    throw new Error(
      '[启动失败] 生产环境必须设置 MC_PREVIEW_BASE_URL（前端真实根，含子路径，如 https://go.microvideo.cn/mvgo）。' +
        '不要写门户根或域名根，否则截图器会探测到门户而非前端。',
    )
  }
  console.warn('[配置告警] 未设置 MC_PREVIEW_BASE_URL，开发环境回退到 http://127.0.0.1:2610')
  return 'http://127.0.0.1:2610'
}

/**
 * 预览页候选地址（按探测顺序）。
 * - 主地址恒为 MC_PREVIEW_BASE_URL（必填/显式）。
 * - 开发环境额外追加本机前端 2610/2611（fail-over，本机可达优先）。
 * - 已删除所有硬编码猜测域名（https://go.microvideo.cn）与僵尸别名
 *   （FRONTEND_URL / APP_BASE_URL / PUBLIC_BASE_URL / SITE_URL / PUBLIC_SITE_URL）。
 */
export function getFrontendCandidates(): string[] {
  const candidates = [getPreviewBaseUrl()]
  if (!IS_PRODUCTION) {
    candidates.push(
      'http://127.0.0.1:2610',
      'http://localhost:2610',
      'http://127.0.0.1:2611',
      'http://localhost:2611',
    )
  }
  return candidates
    .map(normUrl)
    .filter((value, index, list) => value && list.indexOf(value) === index)
}

/**
 * Java 后端地址（操作日志 fire-and-forget 上报目标）。
 * 开发缺失 → 回退本地 8080/api；生产由 validateRuntimeEnv 强制必填，
 * 避免静默回退到 localhost 导致审计日志写不进去还无报错。
 */
export function getJavaBackendUrl(): string {
  const configured = normUrl(process.env.JAVA_BACKEND_URL)
  if (configured) return configured
  if (IS_PRODUCTION) {
    // 不在取值处抛错，交由 validateRuntimeEnv 统一收集必填项后一次性报错
    return ''
  }
  console.warn('[配置告警] 未设置 JAVA_BACKEND_URL，开发环境回退到 http://localhost:8080/api')
  return 'http://localhost:8080/api'
}

// ---------------- 高保真还原质量参数 ----------------
// 默认值统一对齐本地严格值（MAX_ITERATIONS=3 / QUALITY_SCORE_THRESHOLD=90 /
// MIN_ITERATIONS=1 / VISUAL_SIMILARITY_THRESHOLD=95），
// 确保「线上未显式配置」时仍与本地一致，不再静默走 1 轮/75 分的宽松默认。

export function getMaxIterations(): number {
  return parseInt(process.env.MAX_ITERATIONS || '3', 10)
}

export function getQualityScoreThreshold(): number {
  return parseInt(process.env.QUALITY_SCORE_THRESHOLD || '90', 10)
}

export function getMinIterations(): number {
  return parseInt(process.env.MIN_ITERATIONS || '1', 10)
}

export function getVisualSimilarityThreshold(): number {
  return parseInt(process.env.VISUAL_SIMILARITY_THRESHOLD || '95', 10)
}

export function getMaxVisualIterations(): number {
  return parseInt(process.env.MAX_VISUAL_ITERATIONS || '1', 10)
}

/**
 * 启动期环境校验（生产 fail-fast，开发打印配置来源）。
 * 在 main.ts 的 bootstrap() 最前调用，确保配置问题在启动阶段就暴露，
 * 而不是上线后某个功能静默失效。
 */
export function validateRuntimeEnv(): void {
  if (IS_PRODUCTION) {
    const required = [
      'MONGODB_URI',
      'SESSION_SECRET',
      'FIELD_ENCRYPTION_KEY',
      'MC_PREVIEW_BASE_URL',
      'JAVA_BACKEND_URL',
    ]
    const missing = required.filter((key) => !process.env[key]?.trim())
    if (missing.length) {
      throw new Error(
        `[启动失败] 生产环境缺失必填环境变量: ${missing.join(', ')}。请在部署脚本或 .env.production 中补齐后再部署。`,
      )
    }
  } else {
    console.log('[配置] 运行环境变量已加载:', {
      NODE_ENV,
      MC_PREVIEW_BASE_URL: getPreviewBaseUrl(),
      JAVA_BACKEND_URL: getJavaBackendUrl(),
      MAX_ITERATIONS: getMaxIterations(),
      QUALITY_SCORE_THRESHOLD: getQualityScoreThreshold(),
      MIN_ITERATIONS: getMinIterations(),
      VISUAL_SIMILARITY_THRESHOLD: getVisualSimilarityThreshold(),
      MAX_VISUAL_ITERATIONS: getMaxVisualIterations(),
    })
  }
}
