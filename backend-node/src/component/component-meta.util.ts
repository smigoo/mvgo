/**
 * component-meta.json 持久化工具
 *
 * 生成管线（Vue3 主线 / Lite 链路）在产出组件时调用，
 * 将 component-meta.json 写入「后端 workspace」与「前端 workspace」两处，
 * 供 ApiBindingWizard 在两种环境下读取预填：
 *   - 开发：前端 fetch `/__raw/workspace/vue3-components/{groupId}/{componentId}/component-meta.json`
 *           该路径映射到 `resolveFrontendWorkspace()/vue3-components/...`
 *   - 生产：前端 fetch `/api/component/{componentId}/file?path=component-meta.json`
 *           后端 resolveComponentBaseDirs 会扫描同两个目录
 *
 * 即使 requirementDoc / docAnalysis 为空也照常写入，确保文件始终存在，
 * 避免向导打开时的 404 噪音（原逻辑仅在存在 requirementDoc 时写，导致 Lite 组件缺文件）。
 */
import { mkdir, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { vue3ComponentsDir, customComponentsDir } from '../config/backend-root'
import { resolveFrontendWorkspace } from '../config/workspace.config'

export type ComponentMetaType = 'vue3' | 'microcode'

/**
 * 持久化 component-meta.json
 * @param groupId     组件所属分组（Vue3 组件目录结构需要）
 * @param componentId 组件目录名（通常等于 sessionId）
 * @param componentType 'vue3' | 'microcode'，决定写入 vue3-components 还是 custom-components
 * @param requirementDoc 需求文档（可为空）
 * @param docAnalysis 需求分析结果（可为空）
 * @param quality    生成质量信息（P0-3：degraded/layoutSource/degradeReason，可为空）
 */
export async function saveComponentMeta(
  groupId: string,
  componentId: string,
  componentType: ComponentMetaType,
  requirementDoc?: string,
  docAnalysis?: Record<string, any>,
  quality?: { degraded?: boolean; layoutSource?: string; degradeReason?: string },
): Promise<void> {
  const metaContent = JSON.stringify(
    {
      requirementDoc: requirementDoc || '',
      docAnalysis: docAnalysis || null,
      generatedAt: new Date().toISOString(),
      //  P0-3: 生成质量标志（视觉分析降级可见）
      quality: quality || null,
    },
    null,
    2,
  )

  const isMicrocode = componentType === 'microcode'
  const targets = isMicrocode
    ? [
        join(customComponentsDir, componentId),
        join(resolveFrontendWorkspace(), 'custom-components', componentId),
      ]
    : [
        join(vue3ComponentsDir, groupId, componentId),
        join(resolveFrontendWorkspace(), 'vue3-components', groupId, componentId),
      ]

  for (const targetPath of targets) {
    if (!existsSync(targetPath)) {
      await mkdir(targetPath, { recursive: true })
    }
    await writeFile(join(targetPath, 'component-meta.json'), metaContent)
  }
}
