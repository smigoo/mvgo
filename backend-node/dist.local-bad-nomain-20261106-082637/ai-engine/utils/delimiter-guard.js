/**
 * 分隔符保护工具
 *
 * 背景：多文件输出使用 `// === path/to/file.ext ===` 作为文件分隔符。
 * 但模型极易在代码内部用**完全相同的写法**做分节注释，例如：
 *
 *   <script setup>
 *   // === 子组件引入 ===
 *   import Foo from './components/Foo.vue'
 *   // === 响应式状态 ===
 *   const list = ref([])
 *   // === 生命周期 ===
 *   onMounted(() => { ... })
 *   </script>
 *
 * 解析器会把这些行当成文件分隔符，判定「非法文件名」后跳过，
 * 连带把该行之后的内容整段切走 → 产物缺少 </script>，
 * 下游误判为「输出被截断」，且重试无效（模型稳定使用这种注释风格）。
 *
 * 本工具在解析前把「非法文件名 + 段内容像代码」的分隔行改写为 `// --- X ---`：
 * 既保留注释语义，又不再匹配分隔符正则。
 *
 * 段内容不像代码（如结尾的「// === 说明 ===\n以上是完整实现」）则**保持原样**，
 * 让解析器按旧行为丢弃，避免说明文字污染产物文件。
 */

/** 整行分隔符（`// === X ===`），group1=缩进 group2=名称 */
const DELIMITER_LINE = /^([ \t]*)\/\/[ \t]*={2,3}[ \t]*(.+?)[ \t]*={2,3}[ \t]*$/

/**
 * 判断一段文本是否像代码（用于区分「代码分节」与「结尾说明文字」）。
 * 判据：出现 ASCII 代码符号，或以常见语句关键字开头的行。
 * 中文说明文字通常只含全角标点，不会命中。
 * @param {string} text
 * @returns {boolean}
 */
export function looksLikeCode(text) {
  if (!text || !text.trim()) return false
  if (/[{};=<>()[\]]/.test(text)) return true
  return /^\s*(import|export|const|let|var|function|class|return|await|async|if|for|while|try)\b/m.test(text)
}

/**
 * 中和代码内分节注释。
 * @param {string} text 待解析的 LLM 原始输出
 * @param {(p: string) => boolean} isValidFilePath 文件名合法性判定（由调用方提供，各角色规则略有差异）
 * @returns {{ text: string, neutralized: number, names: string[] }}
 */
export function neutralizeSectionComments(text, isValidFilePath) {
  if (!text || typeof text !== 'string') {
    return { text: text || '', neutralized: 0, names: [] }
  }
  if (typeof isValidFilePath !== 'function') {
    return { text, neutralized: 0, names: [] }
  }

  const lines = text.split('\n')

  // 先定位所有分隔行（仅整行形式，避免误伤字符串字面量里出现的同形文本）
  const delimiterIdx = []
  for (let i = 0; i < lines.length; i++) {
    if (DELIMITER_LINE.test(lines[i])) delimiterIdx.push(i)
  }
  if (delimiterIdx.length === 0) {
    return { text, neutralized: 0, names: [] }
  }

  let neutralized = 0
  const names = []

  for (let k = 0; k < delimiterIdx.length; k++) {
    const i = delimiterIdx[k]
    const m = lines[i].match(DELIMITER_LINE)
    if (!m) continue
    const name = m[2].trim()
    if (!name) continue

    let valid = false
    try {
      valid = !!isValidFilePath(name)
    } catch {
      valid = false
    }
    if (valid) continue // 真·文件分隔符，原样保留

    // 取该分隔符管辖的段内容（到下一个分隔行为止）
    const end = k + 1 < delimiterIdx.length ? delimiterIdx[k + 1] : lines.length
    const body = lines.slice(i + 1, end).join('\n')
    if (!looksLikeCode(body)) continue // 说明文字 → 保持旧行为（交给解析器丢弃）

    lines[i] = `${m[1]}// --- ${name} ---`
    neutralized++
    if (names.length < 10) names.push(name)
  }

  return { text: lines.join('\n'), neutralized, names }
}
