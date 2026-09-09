/**
 * @description: 工具函数
 * @version: v1.0.1
 * @author: smigoo(xsmigoo@gmail.com)
 * @date: 2024-04-12 16:24:14
 **/
import { getDict, eventTypeConfig, alarmTypeConfig, intelligentConfig } from './dictionaries.js'
import dayjs from 'dayjs'

/**
 * @function
 * @todo: 获取桩号文本
 * @param: {Number | String | Array} num 桩号数 '121.1', 121.1, [121, 100]类格式
 * @return: null
 */
export const getZhText = (num) => {
  if (Array.isArray(num) && !num.length) {
    return 0
  } else {
    if (!/^[0-9]+.?[0-9]*$/.test(num)) {
      return 0
    }
  }
  let k = 0
  let m = 0
  if (Array.isArray(num)) {
    // 数组时
    k = num[0] || 0
    m = Number(num[1]) || 0
  } else {
    const arr = getZhArr(num)
    k = arr[0]
    m = arr[1]
  }
  m = m ? `+${m}` : '' // 百米桩未0时不显示
  return `K${k}${m}`
}

/**
 * @function
 * @todo: 获取桩号数组
 * @param: {Number | String | Array} num 桩号数 '121.1', 121.1, [121, 100]类格式
 * @return: null
 */
export const getZhArr = (num) => {
  const arr = String(num).split('.')
  const k = Number(arr[0])
  const m = Number('0.' + (arr[1] || 0)) * 1000
  return [k, m]
}

/**
 * @function
 * @todo: 获取桩号数值
 * @param:{Number | String | Array} k 桩号数
 * @param:{Number | String} m 桩号数
 * @return: {Number} 桩号数值
 */
export const getZhNumber = (k, m) => {
  k = k ? Number(k) : 0
  m = m ? Number(m) / 1000 : 0
  return k + m
}

// 交通态势拥堵情况 图标配置 轻度、中度、重度、预警
export const congestionConfig = [
  {
    icon: 'jtts-1',
    name: '轻度拥堵',
    key: 1
  },
  {
    icon: 'jtts-2',
    name: '中度拥堵',
    key: 2
  },
  {
    icon: 'jtts-3',
    name: '重度拥堵',
    key: 3
  }
]
// 拥堵预测  绘制路线颜色
export const lineColors = {
  轻度拥堵: '#FF6666',
  中度拥堵: '#FF0033',
  重度拥堵: '#993333',
  // 以上高速

  // 以下公路
  车流量大: '#33c2d7',
  拥堵: ' #f33c18'
}

/**
 * @function
 * @todo: 根据值获取拥堵配置信息
 * @param:{String | Number} value 值
 * @param:{String} key 键
 * @return: {Object} config 配置信息
 */
export function getCongestionConfig(value, key = 'name') {
  const config = congestionConfig.find((item) => item[key] === value) || {}
  return {
    ...config,
    color: lineColors[config.name]
  }
}

/**
 * @function
 * @todo: 获取基础描述数据
 * @param: {String} type 类型
 * @param: {Object} data 数据
 * @param: {Object} config 配置
 * @return: {Object} data 数据
 */
export const getBaseDescData = (type, data, config) => {
  // 来源数据保存下
  data.sourceData = { ...data }
  // 统一字段处理
  data.qsCode = type
  data.qsName = config.qsName
  data.config = config || {}

  data.onlyId = data.id || data.warningId // 交通态势的warningId
  // 告警时间
  data.detectionTime = dayjs(data.detectionTime || data.startTime || data.createTime).format(
    'YYYY-MM-DD HH:mm:ss'
  )
  // 告警类型
  data.alarmTypeText = getDict('ZNZC-AI-EVENTTYPE', data?.alarmType || null) // 没有
  // 事件等级
  data.detectionLevelText = getDict('ZNZC-LEVEL', data?.detectionLevel || 2, '') || '' // 没有
  // 路线信息
  data.roadNum = data.roadNum || ''
  data.roadName = data.roadName || ''
  data.roadText = data.roadNum + data.roadName
  // data.directionName = data.roadDirection || '' // 湖南有这个字段，要进行转化，方便后续流程调整
  const directionText = data.directionName || getDict('DIRECTION', data.direction || null)
  // 方向名
  data.directionText = directionText ? `${directionText}` : ''

  // 桩号信息
  data.startStake = data.startStake || data.beginPileNum // 交通态势的beginPileNum
  data.endStake = data.endStake || data.endPileNum // 交通态势的endPileNum
  data.startKM = getZhText(data.startStake)
  data.endKM = getZhText(data.endStake)
  // 桩号信息 含方向
  data.zhInfo = `${data.directionText} ${data.startKM}`
  // 数据来源 字典值
  data.sourceText = data.source ? getDict('ZNZC-SJLY', data.source, '') : ''
  // AI 监测字符处理
  if (['MENU:AIJC', 'MENU:AIPF'].includes(type)) {
    const alertTypeText = data.alarmTypeText ? ` 监测到${data.alarmTypeText}` : '' // 没有

    // 数据来源
    data.factoryName && (data.sourceText = data.factoryName)
    data.text = `${data.zhInfo} ${alertTypeText}`
    data.hoverText = `${data.roadNum || ''} ${data.startKM}`
  } else if (type === 'MENU:JTTS') {
    //  交通态势字符处理
    data.alarmTypeText = data.status
    data.zhInfo = `${data.zhInfo}-${data.endKM}` // 桩号信息
    data._position = `${data.roadNum} ${data.roadName} ${data.zhInfo}`
    data.text = `${data.zhInfo}发生了${data.status}，拥堵长度${data.distance}米，平均行驶速度${data.speed}km/h`
    data.hoverText = `${data.startKM}-${data.endKM} 发生了${data.status}`
    // 21 代表实时拥堵数据，非21代表预测拥堵数据（22:实验室数据,23：中路数据）
    data.icon = getCongestionConfig(data.status).icon + (data.source != 21 ? '-yu' : '') // 没有
  }
  return data
}

/**
 * @desc base64转Uint8Array
 * @param base64 String
 * @return {Uint8Array}
 */
/**
 * @function
 * @todo: base64转Uint8Array
 * @param: {String} base64 base64字符串
 * @return: {Uint8Array} bytes Uint8Array数组
 */
export function base64ToUint8Array(base64) {
  // 去除可能存在的 URL-safe 版本中的 '-' 和 '_' 字符，并去除末尾的 '='。
  const binaryString = atob(base64.replace(/-/g, '+').replace(/_/g, '/'))
  const byteLength = binaryString.length
  const bytes = new Uint8Array(byteLength)
  for (let i = 0; i < byteLength; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes
}
