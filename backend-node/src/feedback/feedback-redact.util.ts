// 2026-11-06 源文件丢失后由 dist 编译产物（dist/feedback/feedback-redact.util.js + .d.ts）机械重建，
// 逻辑与 dist 产物逐行对应。
import { maskSecretFingerprint } from '../common/utils/secret-fingerprint'

export const REDACTED = '***REDACTED***'
export const DEFAULT_LOG_MAX_BYTES = 512 * 1024
export const DEFAULT_LOG_TAIL_LINES = 120
const DEFAULT_HEAD_BYTES = 16 * 1024
export const DESCRIPTION_MAX_CHARS = 2000

/** 已知前缀特征的高危 token（Figma / GitLab / OpenAI / GitHub / Apifox） */
const PREFIX_TOKEN_RULES: Array<{ label: string; pattern: RegExp }> = [
  { label: 'figma', pattern: /figd_[A-Za-z0-9_-]{10,}/g },
  { label: 'gitlab', pattern: /glpat-[A-Za-z0-9_-]{10,}/g },
  { label: 'sk', pattern: /sk-[A-Za-z0-9_-]{16,}/g },
  { label: 'github', pattern: /gh[pousr]_[A-Za-z0-9]{20,}/g },
  { label: 'github', pattern: /github_pat_[A-Za-z0-9_]{20,}/g },
  { label: 'apifox', pattern: /apk-[A-Za-z0-9_-]{16,}/g },
]

/** 已带 * 的视为脱敏过，避免二次处理把指纹再改写 */
function isAlreadyMasked(value: string): boolean {
  return value.includes('*')
}

/** 对任意文本做密钥脱敏：前缀特征 token 打指纹，Bearer / Header / query / JSON 字段形态的密钥替换为 REDACTED */
export function redactTextSecrets(input?: string | null): string {
  if (!input || typeof input !== 'string') return ''
  let out = input
  for (const rule of PREFIX_TOKEN_RULES) {
    out = out.replace(rule.pattern, (m) => maskSecretFingerprint(m) ?? '****')
  }
  out = out.replace(
    /\b(Bearer)\s+([A-Za-z0-9._\-+/=]{12,})/gi,
    (m, name: string, value: string) => isAlreadyMasked(value) ? m : `${name} ${REDACTED}`,
  )
  out = out.replace(
    /\b(X-Figma-Token|PRIVATE-TOKEN|X-Api-Key|x-api-key|Authorization|Token)\b(\s*[:=]\s*)(["']?)([^\s"',;}\]]{8,})\3/gi,
    (m, name: string, sep: string, quote: string, value: string) => isAlreadyMasked(value) ? m : `${name}${sep}${quote}${REDACTED}${quote}`,
  )
  out = out.replace(
    /\b(access_token|refresh_token|api_key|apikey|api-key|secret|password|passwd|pwd|token)\b(\s*=\s*)([^&\s"',;}\]]{6,})/gi,
    (m, key: string, sep: string, value: string) => (isAlreadyMasked(value) ? m : `${key}${sep}${REDACTED}`),
  )
  out = out.replace(
    /("(?:[A-Za-z0-9_]*(?:[Tt]oken|[Ss]ecret|[Pp]assword|[Aa]pi[_-]?[Kk]ey)[A-Za-z0-9_]*)"\s*:\s*")([^"]{6,})(")/g,
    (m, prefix: string, value: string, suffix: string) => isAlreadyMasked(value) ? m : `${prefix}${REDACTED}${suffix}`,
  )
  return out
}

export interface TruncateLogResult {
  text: string
  bytes: number
  originalBytes: number
  truncated: boolean
  keptTailLines: number
}

/** 按字节截断（防多字节字符被切半），保留首部 + 尾部若干行，中间用标记说明 */
function sliceByBytes(input: string, maxBytes: number): string {
  if (maxBytes <= 0) return ''
  if (Buffer.byteLength(input, 'utf8') <= maxBytes) return input
  const buf = Buffer.from(input, 'utf8').subarray(0, maxBytes)
  return buf.toString('utf8').replace(/\uFFFD+$/, '')
}

export function truncateLogText(
  input?: string | null,
  options: { maxBytes?: number; tailLines?: number; headBytes?: number } = {},
): TruncateLogResult {
  const text = typeof input === 'string' ? input : ''
  const originalBytes = Buffer.byteLength(text, 'utf8')
  const maxBytes = options.maxBytes ?? DEFAULT_LOG_MAX_BYTES
  const tailLines = options.tailLines ?? DEFAULT_LOG_TAIL_LINES
  const headBytes = Math.min(options.headBytes ?? DEFAULT_HEAD_BYTES, Math.floor(maxBytes / 4))
  if (originalBytes <= maxBytes) {
    return { text, bytes: originalBytes, originalBytes, truncated: false, keptTailLines: 0 }
  }
  const tailBudget = Math.max(0, Math.min(Math.floor(maxBytes * 0.6), maxBytes - headBytes - 256))
  const allLines = text.split('\n')
  const tailChunk: string[] = []
  let tailBytes = 0
  for (let i = allLines.length - 1; i >= 0; i -= 1) {
    const line = allLines[i]
    const lineBytes = Buffer.byteLength(line, 'utf8') + 1
    if (tailChunk.length >= tailLines) break
    if (tailBytes + lineBytes > tailBudget) break
    tailChunk.unshift(line)
    tailBytes += lineBytes
  }
  const head = sliceByBytes(text, headBytes)
  const marker =
    `\n\n... [日志已截断：原始 ${originalBytes} 字节 / ${allLines.length} 行，` +
    `这里保留首部 ${Buffer.byteLength(head, 'utf8')} 字节 + 尾部 ${tailChunk.length} 行] ...\n\n`
  const merged = `${head}${marker}${tailChunk.join('\n')}`
  const finalText = sliceByBytes(merged, maxBytes)
  return {
    text: finalText,
    bytes: Buffer.byteLength(finalText, 'utf8'),
    originalBytes,
    truncated: true,
    keptTailLines: tailChunk.length,
  }
}

/** 反馈描述先脱敏再限长（超出加「已截断」尾标） */
export function sanitizeDescription(input?: string | null): string {
  const cleaned = redactTextSecrets(typeof input === 'string' ? input : '').trim()
  if (cleaned.length <= DESCRIPTION_MAX_CHARS) return cleaned
  return `${cleaned.slice(0, DESCRIPTION_MAX_CHARS)}…[已截断]`
}

export { maskSecretFingerprint }
