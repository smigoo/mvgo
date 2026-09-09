import { computed } from 'vue'
import { useUserStore } from '@/store'

/**
 * 权限检查 Composable
 *
 * 用法：
 *   const { hasPermission, isAdmin } = usePermission()
 *   v-if="hasPermission('component:create')"
 *
 * 迁移说明：此 composable 只读取 store 中的 role/permissions，
 * 数据来源由后端 /api/auth/current 决定，切换 QS 系统后前端无感知。
 */
export function usePermission() {
  const userStore = useUserStore()

  const hasPermission = (code) => {
    return userStore.hasPermission(code)
  }

  const hasAnyPermission = (codes) => {
    return userStore.hasAnyPermission(codes)
  }

  const isAdmin = computed(() => userStore.isAdmin())

  return {
    hasPermission,
    hasAnyPermission,
    isAdmin,
    role: computed(() => userStore.role),
    permissions: computed(() => userStore.permissions),
  }
}
