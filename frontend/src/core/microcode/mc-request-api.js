/*
 * @Description: 当前文件用于组件使用api接口中间件处理请求参数数据
 * @Author: 潘强
 * @Date: 2025-07-07 11:49:45
 * @LastEditors: 潘强 panqiang1111
 * @LastEditTime: 2026-03-23 13:59:46
 * @FilePath: \src\core\microcode\mc-request-api.js
 */

import mcApi from '@/api/mc-api'
import devApiRequest from '@/api/dev-api-request'
import { getDevApiRequestConfig, messageDailog } from './utils'

const developmentApi = {
  get: (params, devRequestData) => {
    return mcApi.getDevelopmentApi(params, devRequestData)
  },
  post: (params, devRequestData) => {
    return mcApi.postDevelopmentApi(params, devRequestData)
  }
}
export const getComponentApi = (declareInfo, pageId) => {
  const route = useRoute()

  const { version, componentId, componentSerialNumber } = declareInfo
  const versionCode = version && Number(version.replace('v', '').replaceAll('.', ''))
  const versionName = version && version // 组件版本
  const pageElementSerial = componentSerialNumber
  const apiParam = {
    componentId,
    versionName,
    versionCode,
    pageElementSerial,
    pageId,
    filter: {},
    dsName: ''
  }

  const getDevelopmentApiRequest = (filter, dsName) => {
    const devRequestData = getDevApiRequestConfig(devApiRequest, dsName, componentId)
    if (!devRequestData) return messageDailog(dsName)
    const { type } = devRequestData
    return developmentApi[type](filter, devRequestData)
  }
  const isDevDemo = () => {
    return route.fullPath.includes('demo') && import.meta.env.DEV
  }
  /**
   * 查询单条数据
   * @param {*} filter  业务侧参数
   * @param {string} dsName 配置的三方数据源标识项(必传)
   * @returns promise
   */
  const getCommonApiFindOne = (filter, dsName) => {
    if (isDevDemo()) return getDevelopmentApiRequest(filter, dsName)
    return mcApi.getCommonApiFindOne({ ...apiParam, filter, dsName })
  }
  /**
   * 查询列表数据 查询时不携带业务侧传参
   * @param {*} filter  业务侧参数
   * @param {string} dsName 配置的三方数据源标识项(必传)
   * @returns promise
   */
  const getCommonApiFindList = (filter, dsName) => {
    if (isDevDemo()) return getDevelopmentApiRequest(filter, dsName)
    return mcApi.getCommonApiFindList({ ...apiParam, filter, dsName })
  }
  /**
   * 根据分页查询列表数据
   * @param {*} filter  业务侧参数
   * @param {string} dsName 配置的三方数据源标识项(必传)
   * @returns promise
   */
  const getCommonApiPageList = (filter, dsName) => {
    if (isDevDemo()) return getDevelopmentApiRequest(filter, dsName)
    return mcApi.getCommonApiPageList({ ...apiParam, filter, dsName, page: filter.page })
  }
  /**
   * 表单提交接口
   * @param {*} filter  业务侧参数
   * @param {string} dsName 配置的三方数据源标识项(必传)
   * @returns promise
   */
  const submitCommonApiForm = (filter, dsName) => {
    if (isDevDemo()) return getDevelopmentApiRequest(filter, dsName)
    return mcApi.submitCommonApiForm({ ...apiParam, filter, dsName })
  }
  /**
   * 删除单条数据
   * @param {*} filter  业务侧参数
   * @param {string} dsName 配置的三方数据源标识项(必传)
   * @returns promise
   */
  const delCommonApiDeleteOne = (filter, dsName) => {
    if (isDevDemo()) return getDevelopmentApiRequest(filter, dsName)
    return mcApi.delCommonApiDeleteOne({ ...apiParam, filter, dsName })
  }

  const commonApiUploadFile = (filter, dsName) => {
    if (isDevDemo()) return getDevelopmentApiRequest(filter, dsName)
    return mcApi.commonApiUploadFile({ ...apiParam, filter, dsName })
  }

  const commonApiDownloadFile = (filter, dsName) => {
    if (isDevDemo()) return getDevelopmentApiRequest(filter, dsName)
    return mcApi.commonApiDownloadFile({ ...apiParam, filter, dsName })
  }
  /**
   * 查询sbds图例数据
   * @param {*} filter 业务侧参数
   * @returns promise
   */
  const getSbdsCommonDataList = (filter) => {
    return mcApi.getSbdsCommonDataList(filter)
  }
  /**
   * ng配置 获取图例点位数据
   * @param {*} filter 业务参数
   * @returns promise
   */
  const getIconData = (filter) => {
    return mcApi.getIconData(filter)
  }

  return {
    getCommonApiFindOne, // 查询单条数据
    getCommonApiFindList, // 查询无参数列表数据
    getCommonApiPageList, // 查询分页列表数据
    submitCommonApiForm, // 提交form表单接口
    delCommonApiDeleteOne, // 删除单条数据
    commonApiUploadFile, // 上传文件接口
    commonApiDownloadFile, // 下载接口
    getSbdsCommonDataList, // 获取sbds数据
    getIconData // ngix配置 获取图例点位数据
  }
}
