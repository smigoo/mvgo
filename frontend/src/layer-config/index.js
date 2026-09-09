/**
 * @description: 自定义图例组件 配置文件 在此文件中定义图例组件 图例配置样例
 * @version: v1.0.1
 * @author: smigoo(xsmigoo@gmail.com)
 * @date: 2024-04-12 16:24:14
 **/
import {
  getBaseLine,
  getCameraData,
  getCxcData,
  getFwqData,
  getGldwData,
  getGldwGlsData,
  getGldwJyzData,
  getGldwKfdData,
  getJcData,
  getLkData,
  getLwsjData,
  getMjData,
  getQbbData,
  getQlData,
  getQzcData,
  getSdData,
  getSfzData,
  getSnData,
  getWdyData,
  getXccData,
  getYjwzData,
  getZhData,
  getWrjData
} from './js/map-layer-api'
/**
 * 导入图例图片
 */
import layerSgzhImg from './images/accident.png'
import layerQxzhImg from './images/bad-weather.png'
import layerQlImg from './images/bridge-monitoring.png'
import layerSxjImg from './images/camera.png'
import layerLkImg from './images/congested-road.png'
import layerFwqImg from './images/fwq.png'
import layerMjImg from './images/gantry.png'
import layerDzzhImg from './images/geologic-hazard.png'
import layerGldwImg from './images/gldw.png'
import layerTqImg from './images/hlwqx.png'
import layerQbbImg from './images/information-board.png'
import layerClldImg from './images/large-flow.png'
import layerZawImg from './images/obstacle.png'
import layerSdImg from './images/sd.png'
import layerSfzImg from './images/sfz.png'
import layerSnImg from './images/sn.png'
import layerClgzImg from './images/vehicle-fault.png'
import layerWdyImg from './images/wdy.png'
import layerWreckerImg from './images/wrecker.png'
import layerYjwzImg from './images/yjwz.png'
import layerCxcImg from './images/zyc-cxc.png'
import layerXccImg from './images/zyc-xcc.png'
import layerJqImg from './images/jq.png'
import layerJcImg from './images/zyc-jc.png'

import layerSgzhImgAct from './images/accident-active.png'
import layerQxzhImgAct from './images/bad-weather-active.png'
import layerQlImgAct from './images/bridge-monitoring-active.png'
import layerSxjImgAct from './images/camera-active.png'
import layerLkImgAct from './images/congested-road-active.png'
import layerFwqImgAct from './images/fwq-active.png'
import layerMjImgAct from './images/gantry-active.png'
import layerDzzhImgAct from './images/geologic-hazard-active.png'
import layerGldwImgAct from './images/gldw-active.png'
import layerGsGlsAct from './images/gldw-gls-active.png'
import layerGsGls from './images/gldw-gls.png'
import layerGsJkzxAct from './images/gldw-jkzx-active.png'
import layerGsJkzx from './images/gldw-jkzx.png'
import layerGsJyzAct from './images/gldw-jyz-active.png'
import layerGsJyz from './images/gldw-jyz.png'

import layerGsKfdAct from './images/gldw-kfd-active.png'
import layerGsKfd from './images/gldw-kfd.png'

import gsBzrwAct from './images/gs-bzrw-active.png'
import gsBzrw from './images/gs-bzrw.png'
import gsLsbzAct from './images/gs-lsbz-active.png'
import gsLsbz from './images/gs-lsbz.png'
import gsLsyhsgAct from './images/gs-lsyh-active.png'
import gsLsyhsg from './images/gs-lsyh.png'
import gsQtlsAct from './images/gs-qtls-active.png'
import gsQtls from './images/gs-qtls.png'
import layerVisibilityAct from './images/gs-visibility-active.png'
import layerVisibility from './images/gs-visibility.png'
import gsZdshAct from './images/gs-zdsh-active.png'
import gsZdsh from './images/gs-zdsh.png'
import layerTqImgAct from './images/hlwqx-active.png'
import layerQbbImgAct from './images/information-board-active.png'
import layerClldImgAct from './images/large-flow-active.png'
import layerZawImgAct from './images/obstacle-active.png'
import planIconAct from './images/plan-active.png'
import planIcon from './images/plan.png'
import layerSdImgAct from './images/sd-active.png'
import layerSfzImgAct from './images/sfz-active.png'
import layerSnImgAct from './images/sn-active.png'
import suddenIconAct from './images/sudden-active.png'
import suddenIcon from './images/sudden.png'
import layerGsQiangjAct from './images/sxj-qiangji-active.png'
import layerGsQiangj from './images/sxj-qiangji.png'
import layerGsQiujAct from './images/sxj-qiuji-active.png'
import layerGszhQiuj from './images/sxj-qiuji.png'
import temporaryIconAct from './images/temporary-active.png'
import temporaryIcon from './images/temporary.png'
import layerClgzImgAct from './images/vehicle-fault-active.png'
import layerWdyImgAct from './images/wdy-active.png'
import layerWhpcActImg from './images/whpc-active.png'
import layerJqImgAct from './images/jq-active.png'

import layerWhpcImg from './images/whpc.png'
import layerWreckerImgAct from './images/wrecker-active.png'
import layerYjwzImgAct from './images/yjwz-active.png'
import layerGsZhAct from './images/zh-active.png'
import layerGszh from './images/zh.png'
import layerCxcImgAct from './images/zyc-cxc-active.png'
import layerJcImgAct from './images/zyc-jc-active.png'
import layerXccImgAct from './images/zyc-xcc-active.png'

import layerWrj from './images/wrj.png'
import layerWrjActive from './images/wrj-active.png'

const iconSize = [28, 35]
const offset = [-15, -35]

export default [
  {
    type: 'lk-hn',
    name: '路况',
    img: [layerLkImg, layerLkImgAct],
    queryData: getBaseLine, //基础路线
    model: 'polyline',
    active: true,
    tooltipShow: false,
    openMouseoverCallback: true,
    hasClickStatus: true,
    zIndex: 9
  },
  // {
  //   type: 'sxj-hn',
  //   name: '摄像机',
  //   img: [layerSxjImg, layerSxjImgAct],
  //   queryData: getCameraData,
  //   timer: 300000,
  //   model: 'point',
  //   openMouseoverCallback: true,
  //   hasClickStatus: true,
  //   iconSize: iconSize,
  //   offset: offset,
  // },
  {
    name: '摄像机',
    type: 'sxj-hn',
    img: [layerSxjImg, layerSxjImgAct],
    tooltipShow: false,
    children: [
      {
        type: 'gs-qiuj',
        name: '球机',
        img: [layerGszhQiuj, layerGsQiujAct],
        queryData: () =>
          getCameraData(
            {
              cameraTypes: '1,2'
              // companyType: 'DISPATCH'
            },
            'qiuji'
          ), // todo更换地址
        model: 'point',
        openMouseoverCallback: true,
        hasClickStatus: true,
        tooltipShow: false,
        iconSize: iconSize,
        // offset: offset,
        cache: false,
        zIndex: 111
      },
      {
        type: 'gs-qiangj',
        name: '枪机',
        img: [layerGsQiangj, layerGsQiangjAct],
        queryData: () =>
          getCameraData(
            {
              cameraTypes: '3,4,5,6,7'
              // companyType: 'DISPATCH'
            },
            'qiangji'
          ), // todo更换地址
        // queryData: getQlData,
        model: 'point',
        openMouseoverCallback: true,
        hasClickStatus: true,
        tooltipShow: false,
        iconSize: iconSize,
        // offset: offset,
        cache: false,
        zIndex: 111
      }
    ]
  },
  {
    type: 'qbb-hn',
    name: '情报板',
    img: [layerQbbImg, layerQbbImgAct],
    queryData: getQbbData,
    model: 'point',
    iconSize: iconSize,
    tooltipShow: false,
    // offset: offset,
    openMouseoverCallback: true,
    hasClickStatus: true,
    cache: false
  },
  {
    type: 'mj-hn',
    name: '门架',
    img: [layerMjImg, layerMjImgAct],
    queryData: getMjData,
    model: 'point',
    tooltipShow: false,
    openMouseoverCallback: true,
    hasClickStatus: true,
    iconSize: iconSize,
    // offset: offset,
    cache: false // 缓存
  },
  {
    type: 'yjwz-hn',
    name: '应急物资',
    img: [layerYjwzImg, layerYjwzImgAct],
    queryData: getYjwzData,
    tooltipShow: false,
    model: 'point',
    openMouseoverCallback: true,
    hasClickStatus: true,
    iconSize: iconSize,
    // offset: offset,
    cache: false,
    zIndex: 9999
  },
  {
    type: 'fwq-hn',
    name: '服务区',
    img: [layerFwqImg, layerFwqImgAct],
    queryData: getFwqData,
    model: 'point',
    openMouseoverCallback: true,
    hasClickStatus: true,
    tooltipShow: false,
    iconSize: iconSize,
    // offset: offset,
    cache: false
  },
  {
    type: 'sfz-hn',
    name: '收费站',
    img: [layerSfzImg, layerSfzImgAct],
    queryData: getSfzData,
    model: 'point',
    openMouseoverCallback: true,
    hasClickStatus: true,
    tooltipShow: false,
    iconSize: iconSize,
    // offset: offset,
    cache: false
  },
  {
    type: 'sn-hn',
    name: '枢纽',
    img: [layerSnImg, layerSnImgAct],
    queryData: getSnData,
    model: 'point',
    openMouseoverCallback: true,
    hasClickStatus: true,
    tooltipShow: false,
    iconSize: iconSize,
    // offset: offset,
    cache: false
  },
  // 图例组
  {
    name: '作业车',
    type: 'zyc-hn',
    img: [layerWreckerImg, layerWreckerImgAct],
    tooltipShow: false,
    children: [
      {
        type: 'qzc-hn',
        name: '清障车',
        tooltipShow: false,
        img: [layerWreckerImg, layerWreckerImgAct],
        queryData: getQzcData,
        timer: 60 * 1,
        model: 'point',
        openMouseoverCallback: true,
        hasClickStatus: true,
        iconSize: iconSize
        // offset: offset
      },
      {
        type: 'cxc-hn',
        name: '除雪车',
        tooltipShow: false,
        img: [layerCxcImg, layerCxcImgAct],
        queryData: getCxcData,
        timer: 60 * 1,
        model: 'point',
        openMouseoverCallback: true,
        hasClickStatus: true,
        iconSize: iconSize
        // offset: offset
      },
      {
        type: 'xcc-hn',
        name: '巡查车',
        tooltipShow: false,
        img: [layerXccImg, layerXccImgAct],
        queryData: getXccData,
        timer: 60 * 1,
        model: 'point',
        openMouseoverCallback: true,
        hasClickStatus: true,
        iconSize: iconSize
        // offset: offset
      },
      {
        type: 'jc-hn', // 新添加
        name: '警车',
        tooltipShow: false,
        img: [layerJcImg, layerJcImgAct],
        queryData: getJcData,
        timer: 60 * 1,
        model: 'point',
        openMouseoverCallback: true,
        hasClickStatus: true,
        iconSize: iconSize
        // offset: offset
      }
    ]
  },
  {
    type: 'qzc-hn',
    name: '清障车',
    img: [layerWreckerImg, layerWreckerImgAct],
    queryData: getQzcData,
    timer: 60 * 1,
    model: 'point',
    openMouseoverCallback: true,
    hasClickStatus: true,
    tooltipShow: false
    // offset: offset
  },
  {
    type: 'cxc-hn',
    name: '除雪车',
    img: [layerCxcImg, layerCxcImgAct],
    queryData: getCxcData,
    timer: 60 * 1,
    model: 'point',
    tooltipShow: false,
    openMouseoverCallback: true,
    hasClickStatus: true
    // offset: offset
  },
  {
    type: 'xcc-hn',
    name: '巡查车',
    img: [layerXccImg, layerXccImgAct],
    queryData: getXccData,
    timer: 60 * 1,
    model: 'point',
    openMouseoverCallback: true,
    hasClickStatus: true,
    tooltipShow: false
    // offset: offset
  },
  {
    type: 'jc-hn',
    name: '警车',
    img: [layerJcImg, layerJcImgAct],
    queryData: getJcData,
    timer: 60 * 1,
    model: 'point',
    openMouseoverCallback: true,
    hasClickStatus: true,
    tooltipShow: false
    // offset: offset
  },
  {
    type: 'ql-hn',
    name: '桥梁',
    img: [layerQlImg, layerQlImgAct],
    queryData: getQlData,
    model: 'point',
    openMouseoverCallback: true,
    hasClickStatus: true,
    iconSize: iconSize,
    tooltipShow: false,
    // offset: offset,
    cache: false
  },
  {
    type: 'sd-hn',
    name: '隧道',
    img: [layerSdImg, layerSdImgAct],
    queryData: getSdData,
    model: 'point',
    openMouseoverCallback: true,
    hasClickStatus: true,
    iconSize: iconSize,
    tooltipShow: false,
    // offset: offset,
    cache: false
  },
  {
    type: 'qzc-wh',
    name: '危化品车',
    img: [layerWhpcImg, layerWhpcActImg],
    // queryData: getQzcData,
    queryData: () => Promise.resolve({ status: 1, data: [] }),
    timer: 60 * 1,
    model: 'point',
    openMouseoverCallback: true,
    tooltipShow: false,
    hasClickStatus: true
    // offset: offset
  },
  {
    type: 'tq-hn',
    name: '天气',
    img: [layerTqImg, layerTqImgAct],
    // queryData: getTqData,
    queryData: () => Promise.resolve({ status: 1, data: [] }),
    tooltipShow: false,
    timer: 60 * 1,
    model: 'point',
    openMouseoverCallback: true,
    hasClickStatus: true
  },
  {
    type: 'wdy-hn',
    name: '温度仪',
    img: [layerWdyImg, layerWdyImgAct],
    timer: 60 * 1,
    queryData: getWdyData,
    tooltipShow: false,
    model: 'point',
    openMouseoverCallback: true,
    hasClickStatus: true,
    iconSize: iconSize
    // offset: offset
  },
  {
    type: 'jq-hn',
    name: '警情',
    img: [layerJqImg, layerJqImgAct],
    timer: 60 * 1,
    queryData: () => Promise.resolve({ status: 1, data: [] }),
    tooltipShow: false,
    model: 'point',
    openMouseoverCallback: true,
    hasClickStatus: true,
    iconSize: iconSize
    // offset: offset
  },
  {
    type: 'wrj-hn',
    name: '无人机',
    img: [layerWrj, layerWrjActive],
    // timer: 10 * 1,
    queryData: getWrjData,
    tooltipShow: false,
    model: 'point',
    openMouseoverCallback: true,
    hasClickStatus: true,
    iconSize: iconSize
  },
  {
    name: '突发',
    type: 'sudden-hn',
    img: [suddenIcon, suddenIconAct],
    tooltipShow: false,
    children: [
      {
        type: 'sgzh-hn',
        name: '事故灾害',
        img: [layerSgzhImg, layerSgzhImgAct],
        timer: 60 * 1,
        queryData: () => getLwsjData('TAB1'),
        model: 'point',
        openMouseoverCallback: true,
        tooltipShow: false,
        hasClickStatus: true,
        iconSize: iconSize,
        offset: offset
      },
      {
        type: 'clgz-hn',
        name: '车辆故障',
        img: [layerClgzImg, layerClgzImgAct],
        timer: 60 * 1,
        queryData: () => getLwsjData('TAB2'),
        model: 'point',
        openMouseoverCallback: true,
        hasClickStatus: true,
        tooltipShow: false,
        iconSize: iconSize
        // offset: offset
      },
      {
        type: 'qxzh-hn',
        name: '气象灾害',
        img: [layerQxzhImg, layerQxzhImgAct],
        imer: 60 * 1,
        queryData: () => getLwsjData('TBB1'),
        model: 'point',
        openMouseoverCallback: true,
        hasClickStatus: true,
        tooltipShow: false,
        iconSize: iconSize,
        offset: offset
      },
      {
        type: 'zaw-hn',
        name: '障碍物',
        img: [layerZawImg, layerZawImgAct],
        timer: 60 * 1,
        queryData: () => getLwsjData('TDB2'),
        model: 'point',
        openMouseoverCallback: true,
        hasClickStatus: true,
        tooltipShow: false,
        iconSize: iconSize,
        offset: offset
      },
      {
        type: 'clld-hn',
        name: '流量大',
        img: [layerClldImg, layerClldImgAct],
        timer: 60 * 1,
        queryData: () => getLwsjData('TDB1'),
        model: 'point',
        openMouseoverCallback: true,
        hasClickStatus: true,
        tooltipShow: false,
        iconSize: iconSize,
        offset: offset
      },
      {
        type: 'dzzh-hn',
        name: '地质灾害',
        img: [layerDzzhImg, layerDzzhImgAct],
        timer: 60 * 1,
        queryData: () => getLwsjData('TCB1'),
        model: 'point',
        openMouseoverCallback: true,
        hasClickStatus: true,
        tooltipShow: false,
        iconSize: iconSize,
        offset: offset
      }
    ]
  },
  {
    name: '计划',
    type: 'plan-hn',
    img: [planIcon, planIconAct],
    tooltipShow: false,
    children: [
      {
        type: 'sgyh-hn',
        name: '施工养护',
        img: [layerSgzhImg, layerSgzhImgAct],
        queryData: () => getLwsjData('JEB1'),
        model: 'point',
        openMouseoverCallback: true,
        hasClickStatus: true,
        tooltipShow: false,
        iconSize: iconSize,
        offset: offset
      },
      {
        type: 'zdsh-hn',
        name: '重大社会活动',
        img: [gsZdsh, gsZdshAct],
        queryData: () => getLwsjData('JDB2'),
        model: 'point',
        openMouseoverCallback: true,
        hasClickStatus: true,
        tooltipShow: false,
        iconSize: iconSize,
        offset: offset
      },
      {
        type: 'bzrw-hn',
        name: '保障任务',
        img: [gsBzrw, gsBzrwAct],
        queryData: () => getLwsjData('JDB3'),
        model: 'point',
        openMouseoverCallback: true,
        hasClickStatus: true,
        tooltipShow: false,
        iconSize: iconSize,
        offset: offset
      }
    ]
  },
  {
    name: '临时',
    type: 'temporary-hn',
    img: [temporaryIcon, temporaryIconAct],
    tooltipShow: false,
    children: [
      {
        type: 'lsyhsg-hn',
        name: '临时养护施工',
        img: [gsLsyhsg, gsLsyhsgAct],
        queryData: () => getLwsjData('LEB1'),
        model: 'point',
        openMouseoverCallback: true,
        hasClickStatus: true,
        tooltipShow: false,
        iconSize: iconSize,
        offset: offset
      },
      {
        type: 'lsbz-hn',
        name: '临时保障任务',
        img: [gsLsbz, gsLsbzAct],
        queryData: () => getLwsjData('LEB2'),
        model: 'point',
        openMouseoverCallback: true,
        hasClickStatus: true,
        tooltipShow: false,
        iconSize: iconSize,
        offset: offset
      },
      {
        type: 'qtls-hn',
        name: '其他临时类',
        img: [gsQtls, gsQtlsAct],
        queryData: () => getLwsjData('LEB3'),
        model: 'point',
        openMouseoverCallback: true,
        hasClickStatus: true,
        tooltipShow: false,
        iconSize: iconSize,
        offset: offset
      }
    ]
  },
  {
    type: 'gldw-hn',
    name: '管理单位',
    img: [layerGldwImg, layerGldwImgAct],
    tooltipShow: false,
    // queryData: getGldwData,
    // model: 'point',
    openMouseoverCallback: true,
    // hasClickStatus: true,
    // offset: offset,
    children: [
      {
        type: 'gs-jkzx',
        name: '监控中心',
        img: [layerGsJkzx, layerGsJkzxAct],
        queryData: getGldwData, // todo更换地址
        model: 'point',
        openMouseoverCallback: true,
        hasClickStatus: true,
        iconSize: iconSize,
        tooltipShow: false,
        // offset: offset,
        cache: false,
        zIndex: 111
      },
      {
        type: 'gs-gls',
        name: '管理所',
        img: [layerGsGls, layerGsGlsAct],
        queryData: getGldwGlsData,
        model: 'point',
        openMouseoverCallback: true,
        hasClickStatus: true,
        tooltipShow: false,
        iconSize: iconSize,
        // offset: offset,
        cache: false,
        zIndex: 111
      },
      {
        type: 'gs-jyz',
        name: '救援站',
        img: [layerGsJyz, layerGsJyzAct],
        queryData: getGldwJyzData,
        model: 'point',
        openMouseoverCallback: true,
        hasClickStatus: true,
        tooltipShow: false,
        iconSize: iconSize,
        // offset: offset,
        cache: false,
        zIndex: 111
      },
      {
        type: 'gs-kfd',
        name: '快返点',
        img: [layerGsKfd, layerGsKfdAct],
        queryData: getGldwKfdData,
        model: 'point',
        openMouseoverCallback: true,
        hasClickStatus: true,
        tooltipShow: false,
        iconSize: iconSize,
        // offset: offset,
        cache: false,
        zIndex: 111
      }
    ]
  },
  {
    type: 'gs-zh',
    name: '桩号',
    img: [layerGszh, layerGsZhAct],
    queryData: getZhData,
    // queryData: getQlData,
    model: 'point',
    openMouseoverCallback: true,
    hasClickStatus: true,
    iconSize: iconSize,
    tooltipShow: false
    // offset: offset
    // model: 'mass-marks',
    // openMouseoverCallback: true,
    // hasClickStatus: true,
  },
  // 可控图例布局显示隐藏
  {
    type: 'gs-visibility',
    name: '收起',
    tooltipShow: false,
    img: [layerVisibilityAct, layerVisibility],
    queryData: () => Promise.resolve({ status: 1, data: [] })
  }
]
/**
 * 基础路线配置
 */
export const baseLineConfig = {
  name: '拥堵路线',
  // 交通强国路线太多使用line图层，其他项目使用polyline
  // model: projectCode === 'ZHDD-JTQG' ? 'line' : 'polyline',
  model: 'polyline',
  timer: 60 * 1,
  type: 'baseLine',
  qsCode: 'BUTTON:DTTC-LK',
  active: false,
  zIndex: 10,
  tooltipShow: false,
  queryData: getLkData
}
