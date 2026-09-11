/*
 * @module flow
 * @service base-server
 * @说明 flow 模块接口（API 绑定自动生成）
 * @Date: 2026-08-03
 */
import { createRequest } from 'microvideo-request'

const resolvePath = (path, params = {}) => path.replace(/{([^}]+)}/g, (_, name) => encodeURIComponent(params[name] ?? ''))
const omitParameters = (params = {}, names = []) => Object.fromEntries(Object.entries(params).filter(([name]) => !names.includes(name)))

export default {
  /**
   * 获取当日流量统计与趋势
   * GET /flow/todayFlow
   * @returns {Object} { rid, code, message, detail, data }
   */
  getTodayFlow(params = {}) {
    return createRequest()
      .setParameters(params)
      .get('/flow/todayFlow')
  },
  /**
   * 获取当日车型流量概览
   * GET /flow/todayVehicleTypeStatic
   * @returns {Object} { rid, code, message, detail, data }
   */
  getTodayVehicleTypeStatic(params = {}) {
    return createRequest()
      .setParameters(params)
      .get('/flow/todayVehicleTypeStatic')
  },
  /**
   * 获取车型细分散点趋势
   * GET /flow/todayVehicleTypeTrend
   * @returns {Object} { rid, code, message, detail, data }
   */
  getTodayVehicleTypeTrend(params = {}) {
    return createRequest()
      .setParameters(params)
      .get('/flow/todayVehicleTypeTrend')
  },
  /**
   * 获取实时路况数据
   * GET /flow/trafficConditions
   * @returns {Object} { rid, code, message, detail, data }
   */
  getTrafficConditions(params = {}) {
    return createRequest()
      .setParameters(params)
      .get('/flow/trafficConditions')
  },
  /**
   * 获取危化品车列表
   * GET /flow/hazardousVehicleList
   * @returns {Object} { rid, code, message, detail, data }
   */
  getHazardousVehicleList(params = {}) {
    return createRequest()
      .setParameters(params)
      .get('/flow/hazardousVehicleList')
  },
  /**
   * 获取小时级流量数据
   * GET /flow/flowStatic
   * @returns {Object} { rid, code, message, detail, data }
   */
  getFlowStatic(params = {}) {
    return createRequest()
      .setParameters(params)
      .get('/flow/flowStatic')
  },
}
