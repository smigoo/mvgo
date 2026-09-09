/**
 * Dynamic Agent Loader（纯 ESM，供 dynamic-workflow-graph.js 调度器使用）
 * 从 config/agents/{name}.json 读取定义 → 动态 import roles/custom/{name}.js
 * 带 mtime 时间戳打破 ESM 缓存：新建/编辑后免重启即可调度。
 */

import { promises as fs } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// configDir = backend-node/config；agents 定义目录
export const agentsDir = join(__dirname, '..', '..', 'config', 'agents')
// 动态生成角色运行时目录（dist/ai-engine/roles/custom——模板 import 路径基于此；build 后由自愈恢复）
export const customRolesDir = join(__dirname, '..', 'ai-engine', 'roles', 'custom')

/**
 * 读取动态智能体定义（不存在返回 null）
 */
export async function readDynamicAgentDef(name) {
  try {
    const raw = await fs.readFile(join(agentsDir, `${name}.json`), 'utf-8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * 列出全部动态智能体定义（用于 meta/handlers 合并）
 */
export async function listDynamicAgentDefs() {
  try {
    const files = await fs.readdir(agentsDir)
    const out = []
    for (const f of files.filter((x) => x.endsWith('.json'))) {
      try {
        out.push(JSON.parse(await fs.readFile(join(agentsDir, f), 'utf-8')))
      } catch { /* skip */ }
    }
    return out
  } catch {
    return []
  }
}

/**
 * 实例化动态智能体（按定义 import 模块并 new）
 * @param {string} name 智能体标识
 * @param {object} roleCfg 运行时配置（apiKey/baseURL/model/节点级覆盖）
 * @returns {Promise<object|null>} 实例或 null（不存在）
 */
export async function instantiateDynamicAgent(name, roleCfg = {}) {
  const def = await readDynamicAgentDef(name)
  if (!def) return null
  const filePath = join(customRolesDir, `${name}.js`)
  // 🛡️ 瞬时重试：agent-builder 先写 JSON 再写 JS，图若在 JS 落盘前调度会命中 ENOENT；
  //    重试若干次等文件就绪，避免误报「未知的 handler」（创建期竞态，非真实缺失）。
  const MAX = 3
  let lastErr = null
  for (let attempt = 1; attempt <= MAX; attempt++) {
    try {
      const ts = (await fs.stat(filePath)).mtimeMs
      const url = `${pathToFileURL(filePath).href}?t=${Math.round(ts)}`
      const mod = await import(url)
      const Cls = mod.DynamicAgent || mod.default
      if (typeof Cls !== 'function') {
        throw new Error(`动态智能体 ${name} 未导出 DynamicAgent 类`)
      }
      return new Cls({ ...(roleCfg || {}), ...(def.model ? { model: def.model } : {}) })
    } catch (e) {
      lastErr = e
      // 仅对「文件尚未就绪」类瞬时错误重试；类定义缺失/导出错误直接抛出
      if (e.code === 'ENOENT' && attempt < MAX) {
        console.warn(`[dynamic-loader] 动态智能体 ${name} 文件暂未就绪，第 ${attempt} 次重试`)
        await new Promise((r) => setTimeout(r, 300 * attempt))
        continue
      }
      throw e
    }
  }
  throw lastErr || new Error(`动态智能体 ${name} 实例化失败`)
}
