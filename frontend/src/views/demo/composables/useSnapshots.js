/**
 * Playground 快照版本管理 composable
 * 
 * 用法：
 * const { modificationCount, undoLoading, restoreLoading,
 *          initializeSnapshot, undoLastModification, restoreToInitial,
 *          updateModificationCount } = useSnapshots(componentId, reloadAllFiles, refreshPreview)
 */
import { ref } from 'vue'
import { message } from 'ant-design-vue'
import http from '@/core/http'

export function useSnapshots(componentId, reloadAllFiles, refreshPreview) {
  const modificationCount = ref(0)
  const undoLoading = ref(false)
  const restoreLoading = ref(false)

  async function initializeSnapshot() {
    try {
      await http.post(`/api/demo/initialize/${componentId.value}`)
      await updateModificationCount()
    } catch (err) {
      console.error('初始快照失败:', err)
    }
  }

  async function undoLastModification() {
    undoLoading.value = true
    try {
      const data = await http.post(`/api/demo/undo/${componentId.value}`)
      if (data.success) {
        message.success('已后退到上一个版本')
        await reloadAllFiles()
        refreshPreview()
        await updateModificationCount()
      } else {
        message.warning(data.message || '没有可后退的修改')
      }
    } catch (err) {
      message.error('后退失败: ' + err.message)
    } finally {
      undoLoading.value = false
    }
  }

  async function restoreToInitial() {
    restoreLoading.value = true
    try {
      const data = await http.post(`/api/demo/restore/${componentId.value}`)
      if (data.success) {
        message.success('已恢复到初始状态')
        await reloadAllFiles()
        refreshPreview()
        await updateModificationCount()
      } else {
        message.warning(data.message || '恢复失败')
      }
    } catch (err) {
      message.error('恢复失败: ' + err.message)
    } finally {
      restoreLoading.value = false
    }
  }

  async function updateModificationCount() {
    try {
      const data = await http.get(`/api/demo/modifications/${componentId.value}`)
      modificationCount.value = data.data.count || 0
    } catch {}
  }

  return {
    modificationCount,
    undoLoading,
    restoreLoading,
    initializeSnapshot,
    undoLastModification,
    restoreToInitial,
    updateModificationCount,
  }
}
