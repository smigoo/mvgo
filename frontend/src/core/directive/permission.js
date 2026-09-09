import { hasPermission } from '@/core/permission'
/**
 * 自定义指令 - 权限控制
 * @author 朱琦
 * @date   时间：2022/4/6
 */
export default {
  name: 'permission',
  mounted(el, binding, vnode) {
    const value = binding.value
    if (!value) return
    // 没有权限时
    if (!hasPermission(value)) {
      el.style.display = 'none'
    }
  }
}
