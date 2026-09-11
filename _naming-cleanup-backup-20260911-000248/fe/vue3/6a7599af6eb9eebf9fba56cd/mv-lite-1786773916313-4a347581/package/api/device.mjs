/*
 * @module device
 * @service base-server
 * @说明 device 模块接口（API 绑定自动生成）
 * @Date: 2026-08-15
 */
import { createRequest } from 'microvideo-request'

// 预览环境 mock 数据：window.__MVGO_PREVIEW_MOCK__ 为真时，函数返回 mock，不真实调用业务接口
const __MOCK__ = {
  getOverview: { code: 200, data: {} },
  postDevicePage: { code: 200, data: {} },
  postRepair: { code: 200, data: {} },
  getRepairDetail: { code: 200, data: {} },
  postDeviceList: { code: 200, data: {} },
  getGetVideoUrl: { code: 200, data: {} },
  getGetVmsContent: { code: 200, data: {} },
  getGetBroadcastContent: { code: 200, data: {} },
  getGetRobotStatus: { code: 200, data: {} },
  getRescueVehicles: { code: 200, data: {} },
  getNearbyCameras: { code: 200, data: {} },
  getEvnMonitor: { code: 200, data: {} },
  getMonitor: { code: 200, data: {} },
}

const resolvePath = (path, params = {}) => path.replace(/{([^}]+)}/g, (_, name) => encodeURIComponent(params[name] ?? ''))
const omitParameters = (params = {}, names = []) => Object.fromEntries(Object.entries(params).filter(([name]) => !names.includes(name)))

export default {
  /**
   * 设备总览
   * GET /device/overview
   * @returns {Object} { rid, code, message, detail, data }
   */
  getOverview(params = {}) {
    if (typeof window !== 'undefined' && window.__MVGO_PREVIEW_MOCK__) {
      return Promise.resolve(__MOCK__.getOverview)
    }
    return createRequest()
      .setParameters(params)
      .get('/device/overview')
  },
  /**
   * 设备异常列表
   * POST /device/devicePage
   * @returns {Object} { rid, code, message, detail, data }
   */
  postDevicePage(params = {}) {
    if (typeof window !== 'undefined' && window.__MVGO_PREVIEW_MOCK__) {
      return Promise.resolve(__MOCK__.postDevicePage)
    }
    return createRequest()
      .setParameters(params)
      .post('/device/devicePage')
  },
  /**
   * 设备报修
   * POST /device/repair
   * @returns {Object} { rid, code, message, detail, data }
   */
  postRepair(params = {}) {
    if (typeof window !== 'undefined' && window.__MVGO_PREVIEW_MOCK__) {
      return Promise.resolve(__MOCK__.postRepair)
    }
    return createRequest()
      .setParameters(params)
      .post('/device/repair')
  },
  /**
   * 工单详情
   * GET /device/repairDetail
   * @returns {Object} { rid, code, message, detail, data }
   */
  getRepairDetail(params = {}) {
    if (typeof window !== 'undefined' && window.__MVGO_PREVIEW_MOCK__) {
      return Promise.resolve(__MOCK__.getRepairDetail)
    }
    return createRequest()
      .setParameters(params)
      .get('/device/repairDetail')
  },
  /**
   * 获取设备列表
   * POST /device/deviceList
   * @returns {Object} { rid, code, message, detail, data }
   */
  postDeviceList(params = {}) {
    if (typeof window !== 'undefined' && window.__MVGO_PREVIEW_MOCK__) {
      return Promise.resolve(__MOCK__.postDeviceList)
    }
    return createRequest()
      .setParameters(params)
      .post('/device/deviceList')
  },
  /**
   * 获取视频流地址
   * GET /device/getVideoUrl
   * @returns {Object} { rid, code, message, detail, data }
   */
  getGetVideoUrl(params = {}) {
    if (typeof window !== 'undefined' && window.__MVGO_PREVIEW_MOCK__) {
      return Promise.resolve(__MOCK__.getGetVideoUrl)
    }
    return createRequest()
      .setParameters(params)
      .get('/device/getVideoUrl')
  },
  /**
   * 获取情报板内容
   * GET /device/getVmsContent
   * @returns {Object} { rid, code, message, detail, data }
   */
  getGetVmsContent(params = {}) {
    if (typeof window !== 'undefined' && window.__MVGO_PREVIEW_MOCK__) {
      return Promise.resolve(__MOCK__.getGetVmsContent)
    }
    return createRequest()
      .setParameters(params)
      .get('/device/getVmsContent')
  },
  /**
   * 获取广播内容
   * GET /device/getBroadcastContent
   * @returns {Object} { rid, code, message, detail, data }
   */
  getGetBroadcastContent(params = {}) {
    if (typeof window !== 'undefined' && window.__MVGO_PREVIEW_MOCK__) {
      return Promise.resolve(__MOCK__.getGetBroadcastContent)
    }
    return createRequest()
      .setParameters(params)
      .get('/device/getBroadcastContent')
  },
  /**
   * 获取烟道机器人状态
   * GET /device/getRobotStatus
   * @returns {Object} { rid, code, message, detail, data }
   */
  getGetRobotStatus(params = {}) {
    if (typeof window !== 'undefined' && window.__MVGO_PREVIEW_MOCK__) {
      return Promise.resolve(__MOCK__.getGetRobotStatus)
    }
    return createRequest()
      .setParameters(params)
      .get('/device/getRobotStatus')
  },
  /**
   * 获取在途清障车列表
   * GET /device/rescue-vehicles
   * @returns {Object} { rid, code, message, detail, data }
   */
  getRescueVehicles(params = {}) {
    if (typeof window !== 'undefined' && window.__MVGO_PREVIEW_MOCK__) {
      return Promise.resolve(__MOCK__.getRescueVehicles)
    }
    return createRequest()
      .setParameters(params)
      .get('/device/rescue-vehicles')
  },
  /**
   * 获取就近摄像头
   * GET /device/nearbyCameras
   * @returns {Object} { rid, code, message, detail, data }
   */
  getNearbyCameras(params = {}) {
    if (typeof window !== 'undefined' && window.__MVGO_PREVIEW_MOCK__) {
      return Promise.resolve(__MOCK__.getNearbyCameras)
    }
    return createRequest()
      .setParameters(params)
      .get('/device/nearbyCameras')
  },
  /**
   * 获取环境监测数据
   * GET /device/evnMonitor
   * @returns {Object} { rid, code, message, detail, data }
   */
  getEvnMonitor(params = {}) {
    if (typeof window !== 'undefined' && window.__MVGO_PREVIEW_MOCK__) {
      return Promise.resolve(__MOCK__.getEvnMonitor)
    }
    return createRequest()
      .setParameters(params)
      .get('/device/evnMonitor')
  },
  /**
   * 获取环境监测数据及预警阈值
   * GET /device/monitor
   * @returns {Object} { rid, code, message, detail, data }
   */
  getMonitor(params = {}) {
    if (typeof window !== 'undefined' && window.__MVGO_PREVIEW_MOCK__) {
      return Promise.resolve(__MOCK__.getMonitor)
    }
    return createRequest()
      .setParameters(params)
      .get('/device/monitor')
  },
}
