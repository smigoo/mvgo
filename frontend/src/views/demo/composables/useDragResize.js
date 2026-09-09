/**
 * Playground 拖拽调整面板尺寸 composable
 *
 * 支持三种拖拽目标：
 *   - 'left'    : 调整左侧面板宽度
 *   - 'right'   : 调整右侧面板宽度
 *   - 'horizontal': 调整中间配置面板高度（上下分界线）
 *
 * 用法：
 * const { isDragging, dragTarget, startDrag } = useDragResize(leftPanelWidth, rightPanelWidth, configAreaHeight)
 */
import { ref } from 'vue'

export function useDragResize(leftPanelWidth, rightPanelWidth, configAreaHeight) {
  const isDragging = ref(false)
  const dragTarget = ref(null)

  function startDrag(event, target) {
    isDragging.value = true
    dragTarget.value = target

    // ── 垂直拖拽（左右面板宽度）──
    if (target === 'left' || target === 'right') {
      const startX = event.clientX
      const startLeftWidth = leftPanelWidth.value
      const startRightWidth = rightPanelWidth.value

      function onMouseMove(e) {
        const deltaX = e.clientX - startX
        if (target === 'left') {
          const newWidth = Math.max(200, Math.min(600, startLeftWidth + deltaX))
          leftPanelWidth.value = newWidth
        } else if (target === 'right') {
          const newWidth = Math.max(300, Math.min(800, startRightWidth - deltaX))
          rightPanelWidth.value = newWidth
        }
      }

      function onMouseUp() {
        isDragging.value = false
        dragTarget.value = null
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)

    // ── 水平拖拽（配置面板高度）──
    } else if (target === 'horizontal') {
      const startY = event.clientY
      const startHeight = configAreaHeight.value

      function onMouseMove(e) {
        const deltaY = e.clientY - startY
        // 向下拖 → 高度增加（deltaY 正），向上拖 → 高度减小
        const newHeight = Math.max(120, Math.min(600, startHeight - deltaY))
        configAreaHeight.value = newHeight
      }

      function onMouseUp() {
        isDragging.value = false
        dragTarget.value = null
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    }
  }

  return { isDragging, dragTarget, startDrag }
}
