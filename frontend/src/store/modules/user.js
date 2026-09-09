/*
 * @Description: 用户相关信息
 * @Author: 朱琦 1972662943@qq.com
 * @Date: 2025-05-17 16:44:04
 * @LastEditors: 潘强 panqiang1111
 * @LastEditTime: 2026-01-23 15:31:53
 * @FilePath: \src\store\modules\user.js
 */
import { defineStore } from 'pinia'
import api from '@/api/login'
import devConfig from '@/config/dev-config'
import portlet from '@/utils/portlet'
import { getAuthToken, setAuthToken } from '@/utils/api-token'
import http from '@/core/http'
/**
 * @description: 获取TOken
 * @param {*}
 * @return {*}
 */

// 模块级去重状态：避免刷新/并发时重复请求 /api/auth/current（路由守卫 + 顶栏同时触发）
let _currentUserPromise = null
let _currentUserLoadedAt = 0
let _currentUserFailedAt = 0
const CURRENT_USER_CACHE_TTL = 5 * 60 * 1000 // 5 分钟内不重复拉取
const CURRENT_USER_FAIL_COOLDOWN = 30 * 1000 // 401 等失败后 30 秒内不重复请求，避免刷屏/狂打后端

export const useUserStore = defineStore('user', {
  state: () => ({
    // 认证信息 String
    token: getAuthToken(),
    /**用户信息 Object
     * deptId 部门id
     * mobile 手机号
     * name 用户名
     * orgId 组织id
     * orgName 组织名称
     * uid 用户id
     */
    userInfo: portlet.getParentInfo('getUserInfo', {}),
    /**权限信息 Array
     * 数据结构案例： {
        code: 'QS',
        icon: null,
        integrationType: 0,
        isShow: 1,
        name: 'QS管理',
        type: '',
        url: 'http://',
        children: []
      }
     */
    userAuths: portlet.getParentInfo('getUserAuths', []),
    // 权限码列表（来自后端 /api/auth/current）
    permissions: [],
    // 当前用户角色（admin / member）
    role: 'member',
    // 门户 uid（来自后端 /api/auth/current，用于管理员白名单等身份识别）
    uid: '',
    // 当前用户所属群组（来自后端 /api/auth/current，供顶栏展示）
    group: null
  }),
  getters: {},
  actions: {
    login(userInfo) {
      return new Promise((resolve, reject) => {
        api.submitLogin(userInfo).then((res) => {
          try {
            resolve()
          } catch (error) {
            console.log(error)
            reject()
          }
        })
      })
    },
    setToken(data) {
      this.token = data
      setAuthToken(data)
    },
    /**
     * 获取可用 token：store 为空时向门户实时索取并回填。
     * 门户注入 getToken 可能晚于 store 初始化，故不能只依赖 state。
     * @returns {string|null}
     */
    ensureToken() {
      if (this.token) return this.token
      const token = getAuthToken()
      if (token) this.token = token
      return token
    },
    setUserInfo(data) {
      this.userInfo = data
    },
    setPermissions(data) {
      this.permissions = data || []
    },
    setRole(data) {
      this.role = data || 'member'
    },
    isAdmin() {
      return this.role === 'admin' || this.userInfo?.isAdmin === true
    },
    /**
     * 从 /api/auth/current 同步用户信息 + 权限
     * 含两层去重：
     *  1) 并发去重：同一时刻进行中的请求复用同一 Promise（路由守卫与顶栏 onMounted 同时触发只发一次）
     *  2) 缓存去重：5 分钟内已成功加载过则直接返回，不再请求
     * 返回原始响应数据；缓存命中时返回 { success: true, cached: true }
     */
    async fetchCurrentUser(force = false) {
      // 1) 并发去重：复用进行中的请求
      if (_currentUserPromise) return _currentUserPromise
      // 2) 缓存去重：未过期直接返回已加载状态
      const now = Date.now()
      if (!force && _currentUserLoadedAt && now - _currentUserLoadedAt < CURRENT_USER_CACHE_TTL) {
        return { success: true, cached: true }
      }
      // 3) 失败冷却：token 长期无效（如门户未授权该账号）时，30 秒内不重复请求，避免刷屏/狂打后端
      if (!force && _currentUserFailedAt && now - _currentUserFailedAt < CURRENT_USER_FAIL_COOLDOWN) {
        return { success: false, cached: true, error: 'cooldown' }
      }
      try {
        // token 由 core/http 统一注入（实时取值），此处仅确保 store 侧已回填
        this.ensureToken()
        const p = http
          .get('/api/auth/current')
          .then((data) => {
            _currentUserPromise = null
            if (!data) {
              console.warn('获取用户信息失败: 响应体为空')
              return { success: false, error: 'Empty response' }
            }
            if (data.success) {
              this.userInfo = data.data.user
              this.role = data.data.role || 'member'
              this.uid = data.data.user?.uid || ''
              this.permissions = data.data.permissions || []
              this.group = data.data.group || null
              _currentUserLoadedAt = Date.now()
              _currentUserFailedAt = 0
              localStorage.setItem('user', JSON.stringify(data.data.user))
              if (data.data.group?.id) {
                localStorage.setItem('currentGroupId', data.data.group.id)
              }
            }
            return data
          })
          .catch((error) => {
            _currentUserPromise = null
            _currentUserFailedAt = Date.now()
            console.error('获取用户信息失败:', error)
            // 保持原有契约：失败不抛出，返回 { success:false }，避免路由守卫 next(false) 中止导航
            return {
              success: false,
              error: error?.status ? `HTTP ${error.status}` : error?.message,
            }
          })
        _currentUserPromise = p
        return p
    } catch (error) {
      _currentUserPromise = null
      _currentUserFailedAt = Date.now()
      console.error('获取用户信息失败:', error)
      return { success: false, error: error?.message }
    }
    },
    /**
     * 检查当前用户是否拥有指定权限码
     * @param {string} code 权限码，如 'component:create'
     * @returns {boolean}
     */
    hasPermission(code) {
      if (!code) return true
      if (this.isAdmin()) return true
      return this.permissions.includes(code)
    },
    /**
     * 检查是否拥有给定权限码中的任意一个
     */
    hasAnyPermission(codes) {
      if (!codes || codes.length === 0) return true
      return codes.some((code) => this.hasPermission(code))
    }
  }
})
