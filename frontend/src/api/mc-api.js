/*
 * @Description: 接口请求
 * @Author: 潘强
 * @Date: 2025-02-12 11:08:45
 * @LastEditors: 潘强 panqiang1111
 * @LastEditTime: 2026-04-07 20:14:43
 * @FilePath: \src\api\mc-api.js
 */

import { createRequest } from 'microvideo-request'
export default {
  /**
   * 查询单条数据
   */
  getCommonApiFindOne(params) {
    return createRequest()
      .setParameters(params)
      .post(`/common/api/findOne?cpId=${params.componentId}&dsTag=${params.dsName}`)
  },
  /**
   * 查询列表数据
   */
  getCommonApiFindList(params) {
    return createRequest()
      .setParameters(params)
      .post(`/common/api/findList?cpId=${params.componentId}&dsTag=${params.dsName}`)
  },
  /**
   * 查询列表数据
   */
  getCommonApiQueryList(params) {
    return createRequest()
      .setParameters(params)
      .post(`/common/api/queryList?cpId=${params.componentId}&dsTag=${params.dsName}`)
  },
  /**
   * 分页查询列表数据
   */
  getCommonApiPageList(params) {
    return createRequest()
      .setParameters(params)
      .post(`/common/api/pageList?cpId=${params.componentId}&dsTag=${params.dsName}`)
  },
  /**
   * 表单提交接口
   */
  submitCommonApiForm(params) {
    return createRequest()
      .setParameters(params)
      .post(`/common/api/postThirdForm?cpId=${params.componentId}&dsTag=${params.dsName}`)
  },
  /**
   * 删除单条数据
   * /common/api/deleteOne
   */
  delCommonApiDeleteOne(params) {
    return createRequest()
      .setParameters(params)
      .post(`/common/api/deleteOne?cpId=${params.componentId}&dsTag=${params.dsName}`)
  },

  /**
   * 上传文件接口
   */
  commonApiUploadFile(params) {
    return createRequest()
      .setParameters(params)
      .post(`/common/api/uploadFile?cpId=${params.componentId}&dsTag=${params.dsName}`, {
        headers: { 'content-type': 'multipart/form-data' }
      })
  },
  /**
   * 下载文件接口
   */
  commonApiDownloadFile(params) {
    return createRequest()
      .setParameters(params)
      .post(`/common/api/downloadFile?cpId=${params.componentId}&dsTag=${params.dsName}`, {
        responseType: 'blob'
      })
  },
  /**
   * 查询sbds图例数据
   */
  getSbdsCommonDataList(params) {
    return createRequest('SBDS_SERVER').setParameters(params).post(`/sbds/common`)
  },
  /**
   * 获取图例信息
   * */
  getIconData(params) {
    return createRequest().setParameters(params).get(`/common/api/getIconData/{componentId}`)
  },
  /**
   * 本地获取get接口数据
   * */
  getDevelopmentApi(params, { apiUrl, headers, responseType, server }) {
    return createRequest(server || "DEV_SERVER").setParameters(params).get(apiUrl, { headers, responseType })
  },
  /**
   * 本地获取post接口数据
   * */
  postDevelopmentApi(params, { apiUrl, headers, responseType, whitelist, server }) {
    return createRequest(server || "DEV_SERVER").setParameters(params).post(apiUrl, { headers, responseType })
  }
}
