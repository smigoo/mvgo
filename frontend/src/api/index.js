import { createRequest } from 'microvideo-request'

/**
 * 框架基本请求
 * @auth panq
 * @time 2024/11/25
 */

export default {
  /**
   * 获取页面结构配置
   * @param {*} params
   * @returns
   */
  getElementTree: (params) => {
    return createRequest().setParameters(params).post('/management/page/config/elementTree')
  },
  /**
   * 获取交互路由配置
   * @param {*} params
   * @returns
   */
  getRelationList: (params) => {
    return createRequest().setParameters(params).post('/management/component/relation/list')
  },
  /**
   * 获取链路追踪数据
   */
  getTraceData: (params) => {
    return createRequest().setParameters(params).get('/trace/info')
  },
  /**
   * 登录查看链路追踪
   */
  submitTrace: (params) => {
    return createRequest().setParameters(params).get('/trace/register')
  }
}
