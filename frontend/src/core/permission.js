/**
 * @desc    权限相关方法
 * @author  朱琦
 * @date    2023/5/23
 **/
import { useUserStore } from '@/store'
/**
 * 根据项目编码获取当前权限列表
 * @param {String} appCode 项目标识，不传时取系统qs标识
 */
export const getPermission = (appCode) => {
  const res = useUserStore().userAuths
  if (!appCode) {
    return res
  }
  if (!res.length) return
  // 查找对应code的权限
  const currentPermission = res.find((item) => item.code.includes(appCode)) || {}
  return currentPermission.chileM || currentPermission.children || []
}

/**
 * 根据code获取对应的 权限信息
 * @param {String} code 权限标识
 * @returns 配置
 */
export const getPermissionItem = (code, appCode) => {
  const currentData = {}
  hasPermissionCode(getPermission(appCode), code, currentData)
  return currentData || {}
}
/**
 * 判断是否有该权限编码
 * @param {Array} list 权限列表
 * @param {String} code 权限编码
 * @returns {Boolean} 返回是否有该权限
 */
export const hasPermissionCode = (list, code, currentData = {}) => {
  return (
    list &&
    list.some((i) => {
      if (i.code && i.code.includes(code)) {
        Object.keys(i).forEach((key) => {
          currentData[key] = i[key]
        })
        return true
      } else {
        return hasPermissionCode(i.chileM || i.children || [], code, currentData)
      }
    })
  )
}

/**
 * 根据项目编码 判断是否有该权限编码
 * @param {String} code 权限编码
 * @param {String} appCode 项目标识 可不传，默认当前项目标识
 * @returns Boolean
 */
export const hasPermission = (code, appCode) => {
  if (!code) {
    return true
  }
  return hasPermissionCode(getPermission(appCode), code)
}
