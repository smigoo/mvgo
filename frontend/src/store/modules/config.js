/*
 * @Description: 全局配置相关信息
 * @Author: 朱琦 1972662943@qq.com
 * @Date: 2025-05-17 16:44:04
 * @LastEditors: 潘强 panqiang1111
 * @LastEditTime: 2026-02-28 16:08:15
 * @FilePath: \src\store\modules\config.js
 */

import { defineStore } from 'pinia'

export const useConfigStore = defineStore('config', {
  state: () => ({
    // 接口通用参数
    apiCommonParams: {},
    // 接口请求头通用参数
    apiHeaders: {},
    // 地图组件通用参数
    mapConfigure: {
      theme: '',
      mapId: '',
      mapLoadFinish: false
    },
    // 页面id
    pageId: '',
    // 组件实例
    pageElementSerial: ''
  }),
  getters: {
    getApiCommonParams() {
      return { ...this.apiCommonParams, pageId: this.pageId, pageElementSerial: this.pageElementSerial }
    }
  },
  actions: {
    setMapConfigure(mapConfig) {
      this.mapConfigure = mapConfig
    },
    /**
     * @description: 设置api配置
     * @param {*} apiCommonParams
     * @param {*} apiHeaders
     * @return {*}
     */
    setApiConfig({ apiCommonParams, apiHeaders }) {
      if (apiCommonParams) {
        this.apiCommonParams = { ...this.apiCommonParams, ...apiCommonParams }
      }
      if (apiHeaders) {
        this.apiHeaders = { ...this.apiHeaders, ...apiHeaders }
      }
    }
  }
})
