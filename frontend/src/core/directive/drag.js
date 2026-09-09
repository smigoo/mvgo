/**
 * 自定义指令 - 拖拽
 * @author 朱琦
 * @date   时间：2022/4/6
 */
export default {
  name: 'drag',
  mounted(el, binding, vnode) {
    // 创建一个响应式引用来存储当前的值
    el.currentValue = binding.value
    el.style.cursor = 'all-scroll'

    el.onmousedown = function (e) {
      var disx = e.pageX - el.offsetLeft
      var disy = e.pageY - el.offsetTop

      // 获取当前窗口的宽度与高度
      const windowWidth = window.innerWidth
      const windowHeight = window.innerHeight
      document.onmousemove = function (e) {
        el.classList.add('moveing')
        el.style.cursor = 'move'
        // 计算元素的新位置
        let newLeft = e.pageX - disx
        let newTop = e.pageY - disy

        // 更新元素的位置
        el.style.left = `${newLeft}px`
        el.style.top = `${newTop}px`
        // 如果 el.currentValue.isOpen 为 false，直接限制元素不溢出屏幕
        if (!el.currentValue?.isOpen) {
          newLeft = Math.max(0, Math.min(newLeft, windowWidth - el.offsetWidth))
          newTop = Math.max(0, Math.min(newTop, windowHeight - el.offsetHeight))
        } else {
          // 当 el.currentValue.isOpen 为 true 时，限制上下左右的边界，并根据 el.currentValue.direction 进行特殊限制
          // 限制上下边界不超出屏幕
          newTop = Math.max(0, Math.min(newTop, windowHeight - el.offsetHeight))
          const contentDom = el.currentValue.contentDom

          newTop = Math.max(contentDom.offsetHeight + 15, newTop)
          if (el.currentValue.direction === 'right') {
            // 距离右边不小于 contentDom.offsetWidth
            newLeft = Math.min(windowWidth - contentDom.offsetWidth, newLeft)
          } else if (el.currentValue.direction === 'left') {
            // 距离左边不小于 contentDom.offsetWidth
            newLeft = Math.max(contentDom.offsetWidth - el.offsetWidth, newLeft)
          }

          // 限制左右边界不超出屏幕
          newLeft = Math.max(0, Math.min(newLeft, windowWidth - el.offsetWidth))
        }

        // 更新元素的位置
        el.style.left = `${newLeft}px`
        el.style.top = `${newTop}px`
      }
      document.onmouseup = function () {
        el.classList.remove('moveing')
        el.style.cursor = 'default'
        document.onmousemove = document.onmouseup = null
      }
    }
  },

  updated(el, binding) {
    el.currentValue = binding.value
  }
}
