import { createRequest } from 'microvideo-request'

/**
 * 地图 接口请求
 * @auth renwx
 * @time 2025/02/24
 */
export default {
  /**
   * 获取图例信息
   * */
  getIconData(componentId, params) {
    return createRequest('BASE_SERVER')
      .setParameters(params)
      .get(`/common/api/getIconData/${componentId}`)
  },
  /**
   * 根据单位id获取对应的基础路线
   *
   * */
  getDeptBaseLine(id) {
    return createRequest('BASE_SERVER')
      .setParameters({ deptId: id })
      .get(`/common/api/getIconData/renderMapLineDept`)
  },
  /**
   * 根据单位id获取对应的桩号数据 mileage-list
   * */
  getDeptBaseMileage(params) {
    return createRequest('BASE_SERVER')
      .setParameters(params)
      .get(`/common/api/getThirdData/mileage-list`)
  },

  /**
   * 根据中心经纬度查询10km范围
   * */
  getRange10(params) {
    return createRequest('BASE_SERVER').setParameters(params).get(`/common/api/base/police/range`)
  },
  /**
   * 获取快返点-真实调用
   * */
  getKfdIconData(params) {
    return createRequest('BASE_SERVER_JIAOJING')
      .setParameters(params)
      .get(`/base/police/point/list`)
  },
  /**
   * 查询警车列表-地图上所有警车点位
   * */
  getJcData(params) {
    return createRequest('BASE_SERVER_JC').setParameters(params).get(`/gps-server/gps/list`)
  },
  /**
   * 无人机巢
   * @param {*} params
   * @returns
   */
  getWrjcData(params) {
    return createRequest('BASE_SERVER_WRJ')
      .setParameters()
      .get(`/ck/base/drone/getDroneAirportDetail`)
  },
  /**
   * 无人机
   * @param dataType 0: 铁塔 1:矮寨
   * @param deviceSn 机巢编号
   * @returns
   */
  getWrjData(params) {
    return createRequest('BASE_SERVER_WRJ')
      .setParameters(params)
      .get(`/ck/base/drone/getBaseDroneGpsDetailVo`)
  }
}
