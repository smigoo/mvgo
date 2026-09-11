/*
 * @module device
 * @service base-server
 * @说明 device 模块接口（API 绑定生成 · 宿主工程规范版）
 * @Date: 2026-09-03
 */

import { createRequest } from 'microvideo-request'

export default {
  // ==================== 1. 设备总览 ====================
  /**
   * 设备总览
   * @param {Object} params - 请求参数
   * @param {*} params.sectionNum — 路段编码（必填）
   * @returns {Object} { rid, code, message, detail, data }
   * @example
   * import deviceApi from '@/api/device'
   * const res = await deviceApi.getOverview({ ... })
   */
  getOverview(params) {
    return createRequest()
      .setParameters(params)
      .get('/device/overview')
  },

  // ==================== 2. 设备异常列表 ====================
  /**
   * 设备异常列表
   * @param {Object} params - 请求参数
   * @param {Object} params.data — 请求体
   * @returns {Object} { rid, code, message, detail, data }
   * @example
   * import deviceApi from '@/api/device'
   * const res = await deviceApi.postDevicePage({ ... })
   */
  postDevicePage(params) {
    return createRequest()
      .setParameters(params)
      .setData(params.data || params)
      .post('/device/devicePage')
  },

  // ==================== 3. 设备报修 ====================
  /**
   * 设备报修
   * @param {Object} params - 请求参数
   * @param {Object} params.data — 请求体
   * @returns {Object} { rid, code, message, detail, data }
   * @example
   * import deviceApi from '@/api/device'
   * const res = await deviceApi.postRepair({ ... })
   */
  postRepair(params) {
    return createRequest()
      .setParameters(params)
      .setData(params.data || params)
      .post('/device/repair')
  },

  // ==================== 4. 工单详情 ====================
  /**
   * 工单详情
   * @param {Object} params - 请求参数
   * @param {*} params.repairId — 工单编号（必填）
   * @returns {Object} { rid, code, message, detail, data }
   * @example
   * import deviceApi from '@/api/device'
   * const res = await deviceApi.getRepairDetail({ ... })
   */
  getRepairDetail(params) {
    return createRequest()
      .setParameters(params)
      .get('/device/repairDetail')
  },

  // ==================== 5. 获取设备列表 ====================
  /**
   * 获取设备列表
   * @param {Object} params - 请求参数
   * @param {Object} params.data — 请求体
   * @returns {Object} { rid, code, message, detail, data }
   * @example
   * import deviceApi from '@/api/device'
   * const res = await deviceApi.postDeviceList({ ... })
   */
  postDeviceList(params) {
    return createRequest()
      .setParameters(params)
      .setData(params.data || params)
      .post('/device/deviceList')
  },

  // ==================== 6. 获取视频流地址 ====================
  /**
   * 获取视频流地址
   * @param {Object} params - 请求参数
   * @param {*} params.deviceCode — 设备编码（必填）
   * @returns {Object} { rid, code, message, detail, data }
   * @example
   * import deviceApi from '@/api/device'
   * const res = await deviceApi.getGetVideoUrl({ ... })
   */
  getGetVideoUrl(params) {
    return createRequest()
      .setParameters(params)
      .get('/device/getVideoUrl')
  },

  // ==================== 7. 获取情报板内容 ====================
  /**
   * 获取情报板内容
   * @param {Object} params - 请求参数
   * @param {*} params.deviceCode — 设备编码（必填）
   * @returns {Object} { rid, code, message, detail, data }
   * @example
   * import deviceApi from '@/api/device'
   * const res = await deviceApi.getGetVmsContent({ ... })
   */
  getGetVmsContent(params) {
    return createRequest()
      .setParameters(params)
      .get('/device/getVmsContent')
  },

  // ==================== 8. 获取广播内容 ====================
  /**
   * 获取广播内容
   * @param {Object} params - 请求参数
   * @param {*} params.deviceCode — 设备编码（必填）
   * @returns {Object} { rid, code, message, detail, data }
   * @example
   * import deviceApi from '@/api/device'
   * const res = await deviceApi.getGetBroadcastContent({ ... })
   */
  getGetBroadcastContent(params) {
    return createRequest()
      .setParameters(params)
      .get('/device/getBroadcastContent')
  },

  // ==================== 9. 获取烟道机器人状态 ====================
  /**
   * 获取烟道机器人状态
   * @param {Object} params - 请求参数
   * @param {*} params.deviceCode — 设备编码（必填）
   * @returns {Object} { rid, code, message, detail, data }
   * @example
   * import deviceApi from '@/api/device'
   * const res = await deviceApi.getGetRobotStatus({ ... })
   */
  getGetRobotStatus(params) {
    return createRequest()
      .setParameters(params)
      .get('/device/getRobotStatus')
  },

  // ==================== 10. 获取在途清障车列表 ====================
  /**
   * 获取在途清障车列表
   * @param {Object} params - 请求参数
   * @param {*} params.sectionNum — 路段编码（必填）
   * @returns {Object} { rid, code, message, detail, data }
   * @example
   * import deviceApi from '@/api/device'
   * const res = await deviceApi.getRescueVehicles({ ... })
   */
  getRescueVehicles(params) {
    return createRequest()
      .setParameters(params)
      .get('/device/rescue-vehicles')
  },

  // ==================== 11. 获取就近摄像头 ====================
  /**
   * 获取就近摄像头
   * @param {Object} params - 请求参数
   * @param {*} params.pileNumber — 桩号数字（必填）
   * @param {*} params.direction — 方向：1(上行)/2(下行)（必填）
   * @param {*} params.count — 返回数量
   * @returns {Object} { rid, code, message, detail, data }
   * @example
   * import deviceApi from '@/api/device'
   * const res = await deviceApi.getNearbyCameras({ ... })
   */
  getNearbyCameras(params) {
    return createRequest()
      .setParameters(params)
      .get('/device/nearbyCameras')
  },

  // ==================== 12. 获取环境监测数据 ====================
  /**
   * 获取环境监测数据
   * @param {Object} params - 请求参数
   * @param {*} params.sectionNum — 路段编号（必填）
   * @returns {Object} { rid, code, message, detail, data }
   * @example
   * import deviceApi from '@/api/device'
   * const res = await deviceApi.getEvnMonitor({ ... })
   */
  getEvnMonitor(params) {
    return createRequest()
      .setParameters(params)
      .get('/device/evnMonitor')
  },

  // ==================== 13. 获取环境监测数据及预警阈值 ====================
  /**
   * 获取环境监测数据及预警阈值
   * @param {Object} params - 请求参数
   * @param {*} params.sectionNum — 路段编码（必填）
   * @param {*} params.productCode — 设备类型编码（必填）
   * @param {*} params.monitorType — 监测类型：CO/VI/INNER_ILLUM/OUTER_ILLUM（必填）
   * @returns {Object} { rid, code, message, detail, data }
   * @example
   * import deviceApi from '@/api/device'
   * const res = await deviceApi.getMonitor({ ... })
   */
  getMonitor(params) {
    return createRequest()
      .setParameters(params)
      .get('/device/monitor')
  },

}