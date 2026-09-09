'use strict'

/**
 * SkillLoader — 用户规范包（Skill 包）加载与安全校验（ai-engine-v2）
 *
 * 规范不只是结构化字段，大头是「文本知识」（框架用法、代码风格、禁止项）。
 * 要能被用户选择/上传，就必须是可打包、可版本化的单元：
 *
 *   user/<packageId>/
 *   ├── skill.json          清单：id / label / version / baseSpec / 规范字段（可内联）
 *   ├── spec.json           可选：规范字段独立文件（存在时深合并，优先级高于 skill.json 内联）
 *   ├── prompts/*.md        该规范的 prompt 素材
 *   ├── validators/*.json   声明式校验规则（禁止可执行代码）
 *   └── examples/           正/反例（纯文本读取，永不执行）
 *
 * ⚠️ 安全硬约束（用户包 = 不可信输入）
 *   1. 包内任何文件「永不 require / 永不 eval」，一律 readFileSync 当文本
 *   2. 扩展名白名单；examples/ 外禁止代码文件
 *   3. 禁软链接（可指向包外）、禁路径穿越、禁绝对路径
 *   4. engineerClass 走白名单，用户不能指定任意类名
 *   5. 体积/文件数上限，防解析炸弹
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const USER_SPECS_DIR = path.join(__dirname, 'user')

/** 允许被实例化的生成器类（用户包不得越过此白名单） */
const ALLOWED_ENGINEER_CLASSES = Object.freeze(['MicrocodeEngineer', 'Vue3Engineer'])

/** 通用文件扩展名白名单 */
const ALLOWED_EXTENSIONS = Object.freeze(['.json', '.md', '.txt'])

/** examples/ 目录额外允许的「纯文本示例代码」扩展名（只读取，永不执行） */
const EXAMPLE_EXTENSIONS = Object.freeze(['.vue', '.less', '.css', '.js', '.ts', '.tsx', '.jsx', '.html'])

/** 体积与数量上限 */
const LIMITS = Object.freeze({
  maxFileBytes: 512 * 1024, // 单文件 512KB
  maxTotalBytes: 5 * 1024 * 1024, // 整包 5MB
  maxFileCount: 200
})

/** 包 id 合法字符：小写字母/数字/中划线，2-64 位 */
const PACKAGE_ID_RE = /^[a-z0-9][a-z0-9-]{1,63}$/

/**
 * 递归扫描包内文件并执行安全校验
 * @param {string} packageDir
 * @returns {{files: string[], totalBytes: number}}
 * @throws {Error} 违反任一安全约束
 */
function scanPackageSafely(packageDir) {
  const files = []
  let totalBytes = 0

  const walk = (dir) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const abs = path.join(dir, entry.name)
      const rel = path.relative(packageDir, abs)

      // 禁软链接：可绕过包边界指向任意系统文件
      if (entry.isSymbolicLink()) {
        throw new Error(`包含软链接（禁止）: ${rel}`)
      }
      // 路径穿越防护
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        throw new Error(`检测到路径穿越: ${rel}`)
      }
      if (entry.isDirectory()) {
        walk(abs)
        continue
      }
      if (!entry.isFile()) {
        throw new Error(`包含非常规文件类型（禁止）: ${rel}`)
      }

      const ext = path.extname(entry.name).toLowerCase()
      const inExamples = rel.split(path.sep)[0] === 'examples'
      const allowed = ALLOWED_EXTENSIONS.includes(ext) || (inExamples && EXAMPLE_EXTENSIONS.includes(ext))
      if (!allowed) {
        throw new Error(
          `不允许的文件类型 "${ext}": ${rel}` +
            (EXAMPLE_EXTENSIONS.includes(ext) ? '（示例代码只能放在 examples/ 下）' : '')
        )
      }

      const size = fs.statSync(abs).size
      if (size > LIMITS.maxFileBytes) {
        throw new Error(`文件超过 ${LIMITS.maxFileBytes / 1024}KB 上限: ${rel}`)
      }
      totalBytes += size
      files.push(rel)

      if (files.length > LIMITS.maxFileCount) {
        throw new Error(`文件数超过 ${LIMITS.maxFileCount} 个上限`)
      }
      if (totalBytes > LIMITS.maxTotalBytes) {
        throw new Error(`整包超过 ${LIMITS.maxTotalBytes / 1024 / 1024}MB 上限`)
      }
    }
  }

  walk(packageDir)
  return { files, totalBytes }
}

/**
 * 校验规范字段中的安全敏感项
 * @param {Object} def 合并后的规范字段
 * @param {string} packageId
 */
function validateSpecFields(def, packageId) {
  const errors = []

  if (def.engineerClass && !ALLOWED_ENGINEER_CLASSES.includes(def.engineerClass)) {
    errors.push(
      `engineerClass "${def.engineerClass}" 不在白名单内 (${ALLOWED_ENGINEER_CLASSES.join(', ')})`
    )
  }

  // promptInjection 引用路径检查（禁绝对路径与穿越，具体存在性由 prompt-resolver 自检）
  const injection = def.promptInjection || {}
  for (const [node, refs] of Object.entries(injection)) {
    if (!Array.isArray(refs)) {
      errors.push(`promptInjection.${node} 必须是数组`)
      continue
    }
    for (const ref of refs) {
      if (typeof ref !== 'string') {
        errors.push(`promptInjection.${node} 含非字符串引用`)
      } else if (path.isAbsolute(ref) || ref.split('/').includes('..')) {
        errors.push(`promptInjection.${node} 含非法路径: ${ref}`)
      }
    }
  }

  // 声明式校验规则：只接受 JSON 文件引用，不接受可执行入口
  if (def.validators && typeof def.validators === 'object' && def.validators.script) {
    errors.push('validators.script 不被支持：用户包不得包含可执行代码，校验规则请用声明式 JSON')
  }

  if (errors.length > 0) {
    throw new Error(`[SkillLoader] 规范包 "${packageId}" 校验失败:\n  - ` + errors.join('\n  - '))
  }
}

/**
 * 读取并校验单个 Skill 包
 * @param {string} packageDir 包根目录
 * @returns {Object} 规范定义（含 __source/__packageDir/__baseSpec 元字段）
 */
function loadSkillPackage(packageDir) {
  const packageId = path.basename(packageDir)

  const manifestPath = path.join(packageDir, 'skill.json')
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`[SkillLoader] 规范包 "${packageId}" 缺少 skill.json`)
  }

  const { files, totalBytes } = scanPackageSafely(packageDir)

  let manifest
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
  } catch (e) {
    throw new Error(`[SkillLoader] "${packageId}/skill.json" 解析失败: ${e.message}`)
  }

  // 清单必填字段
  const missing = ['id', 'label', 'version'].filter((k) => !manifest[k])
  if (missing.length > 0) {
    throw new Error(`[SkillLoader] "${packageId}/skill.json" 缺少字段: ${missing.join(', ')}`)
  }
  if (!PACKAGE_ID_RE.test(manifest.id)) {
    throw new Error(
      `[SkillLoader] 非法规范 id "${manifest.id}"（要求小写字母/数字/中划线，2-64 位）`
    )
  }

  // spec.json 存在则深合并（优先级高于 skill.json 内联字段）
  let def = { ...manifest }
  const specPath = path.join(packageDir, 'spec.json')
  if (fs.existsSync(specPath)) {
    let specPart
    try {
      specPart = JSON.parse(fs.readFileSync(specPath, 'utf-8'))
    } catch (e) {
      throw new Error(`[SkillLoader] "${packageId}/spec.json" 解析失败: ${e.message}`)
    }
    def = deepMerge(def, specPart)
    def.id = manifest.id // id 以清单为准，spec.json 不得篡改
  }

  validateSpecFields(def, packageId)

  return Object.assign(def, {
    __source: 'user',
    __packageId: packageId,
    __packageDir: packageDir,
    __fileCount: files.length,
    __totalBytes: totalBytes
  })
}

/**
 * 扫描 user/ 目录加载全部用户规范包
 * @param {string} [dir=USER_SPECS_DIR]
 * @returns {{specs: Object[], errors: string[]}} 单个包失败不影响其他包（隔离）
 */
function loadUserSpecs(dir = USER_SPECS_DIR) {
  const specs = []
  const errors = []
  if (!fs.existsSync(dir)) return { specs, errors }

  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith('.')) continue
    try {
      specs.push(loadSkillPackage(path.join(dir, entry.name)))
    } catch (e) {
      errors.push(e.message)
    }
  }
  return { specs, errors }
}

function deepMerge(base, override) {
  const out = Array.isArray(base) ? [...base] : { ...base }
  for (const key of Object.keys(override)) {
    const ov = override[key]
    const bv = base[key]
    if (ov && typeof ov === 'object' && !Array.isArray(ov) && bv && typeof bv === 'object' && !Array.isArray(bv)) {
      out[key] = deepMerge(bv, ov)
    } else {
      out[key] = ov
    }
  }
  return out
}

export {
  USER_SPECS_DIR,
  ALLOWED_ENGINEER_CLASSES,
  ALLOWED_EXTENSIONS,
  EXAMPLE_EXTENSIONS,
  LIMITS,
  scanPackageSafely,
  loadSkillPackage,
  loadUserSpecs,
  deepMerge
}
