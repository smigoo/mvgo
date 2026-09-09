/**
 * @description: 地图打点图标配置项
 * @version: v1.0.1
 * @author: smigoo(xsmigoo@gmail.com)
 * @date: 2024-04-12 16:24:14
 **/
import sxjAct from './images/gs-sxj-gq-active.png'
import sxjLx from './images/gs-sxj-gq-lx.png'
import sxj from './images/gs-sxj-gq.png'

import qbbAct from './images/gs-qbb-active.png'
import qbb from './images/gs-qbb.png'

import mjAct from './images/gs-mj-active.png'
import mj from './images/gs-mj.png'

import yjwzAct from './images/gs-yjwz-active.png'
import yjwz from './images/gs-yjwz.png'

import fwqAct from './images/gs-fwq-active.png'
import fwq from './images/gs-fwq.png'

import sfzAct from './images/gs-sfz-active.png'
import sfz from './images/gs-sfz.png'

import snAct from './images/gs-sn-active.png'
import sn from './images/gs-sn.png'

import wreckerAct from './images/zyc-qzc-active.png'
import wreckerOff from './images/zyc-qzc-lx.png'
import wrecker from './images/zyc-qzc.png'

import cxcAct from './images/gs-zyc-cxc-active.png'
import cxc from './images/gs-zyc-cxc.png'
import cxcLx from './images/zyc-cxc-lx.png'

import xccAct from './images/gs-zyc-xcc-active.png'
import xcc from './images/gs-zyc-xcc.png'
import xccLx from './images/zyc-xcc-lx.png'

// 警车相关图标
import jc from './images/gs-zyc-jc.png'

import jcAct from './images/gs-zyc-jc-active.png'

import jcLx from './images/zyc-jc-lx.png' // 警车离线

import jcDs from './images/zyc-jc-ds.png' // 警车怠速

import qlAct from './images/gs-ql-active.png'
import ql from './images/gs-ql.png'

import sdAct from './images/gs-sd-active.png'
import sd from './images/gs-sd.png'

import sgzhAct from './images/gs-jtsg-active.png'
import sgzh from './images/gs-jtsg.png'

import clgzAct from './images/gs-clgz-active.png'
import clgz from './images/gs-clgz.png'

import qxzhAct from './images/gs-eltq-active.png'
import qxzh from './images/gs-eltq.png'

import zawAct from './images/gs-zaw-active.png'
import zaw from './images/gs-zaw.png'

import clldAct from './images/gs-dll-active.png'
import clld from './images/gs-dll.png'

import tdb3Act from './images/gs-qt-active.png'
import tdb3 from './images/gs-qt.png'

import dzzhAct from './images/gs-dzzh-active.png'
import dzzh from './images/gs-dzzh.png'

import weatherAct from './images/weather-active.png'
import weather from './images/weather.png'

import gldwAct from './images/gs-gldw-active.png'
import gldw from './images/gs-gldw.png'

import gldwJyzAct from './images/gs-gldw-jyz-active.png'
import gldwJyz from './images/gs-gldw-jyz.png'

import gldwKfdAct from './images/gs-gldw-kfd-active.png'
import gldwKfd from './images/gs-gldw-kfd.png'

import gldwGlsAct from './images/gs-gldw-gls-active.png'
import gldwGls from './images/gs-gldw-gls.png'

import wdyAct from './images/gs-wdy-active.png'
import wdy from './images/gs-wdy.png'

import wdyLxAct from './images/gs-wdy-lx-active.png'
import wdyLx from './images/gs-wdy-lx.png'

import gsSxj from './images/gs-sxj-active.png'
import znzc from './images/gs-znzc.png'
import znzcAct from './images/gs-znzc-active.png'

import gsZhAct from './images/gs-zh-active.png'
import gszh from './images/gs-zh.png'

import sxjQiujAct from './images/sxj-qiuji-icon-active.png'
import sxjQiuj from './images/sxj-qiuji-icon.png'
import sxjQiujLx from './images/sxj-qiuji-lx.png'

import sxjQiangjAcy from './images/sxj-qiangji-icon-active.png'
import sxjQiangj from './images/sxj-qiangji-icon.png'
import sxjQiangjLx from './images/sxj-qiangji-lx.png'

import bzrwAct from './images/gs-bzrw-active.png'
import bzrw from './images/gs-bzrw.png'
import lsbzAct from './images/gs-lsbz-active.png'
import lsbz from './images/gs-lsbz.png'
import lsyhsgAct from './images/gs-lsyh-active.png'
import lsyhsg from './images/gs-lsyhsg.png'
import qtlsAct from './images/gs-qtls-active.png'
import qtls from './images/gs-qtls.png'
import sgyhAct from './images/gs-sgyh-active.png'
import sgyh from './images/gs-sgyh.png'
import zdshAct from './images/gs-zdsh-active.png'
import zdsh from './images/gs-zdsh.png'
import wrj from './images/marker-wrj.png'
import wrjActive from './images/marker-wrj-active.png'
import wrjc from './images/marker-wrjc.png'
import wrjcActive from './images/marker-wrjc-active.png'

import wrjOffline from './images/offline-wrj.png'
import wrjOfflineActive from './images/offline-wrj-active.png'
import wrjcOffline from './images/offline-wrjc.png'
import wrjcOfflineActive from './images/offline-wrjc-active.png'

import iconGdCar from './images/icon-gd-car.png'

/**
 * 获取图片地址
 * @param {string} name - 图片名称
 * @returns {string} 图片地址
 */
const getImageUrl = (name) => new URL(`./images/${name}`, import.meta.url).href
export default [
  {
    // 摄像机打点图标
    name: 'gs-sxj-gq-icon-active',
    url: sxjAct
  },
  {
    // 摄像机打点图标
    name: 'gs-sxj-gq-icon',
    url: sxj
  },
  {
    // 高速摄像机打点图标
    name: 'zhdd-gs-sxj-active',
    url: gsSxj
  },
  {
    // 离线摄像机图标
    name: 'gs-sxj-gq-lx',
    url: sxjLx
  },
  {
    // 摄像机枪机图标
    name: 'gs-sxj-qiangj-icon',
    url: sxjQiangj
  },
  {
    // 摄像机枪机图标离线
    name: 'gs-sxj-qiangj-lx',
    url: sxjQiangjLx
  },
  {
    // 摄像机枪机图标选中
    name: 'gs-sxj-qiangj-icon-active',
    url: sxjQiangjAcy
  },
  {
    // 摄像机球机图标
    name: 'gs-sxj-qiuj-icon',
    url: sxjQiuj
  },
  {
    // 摄像机球机图标离线
    name: 'gs-sxj-qiuj-lx',
    url: sxjQiujLx
  },
  {
    // 摄像机球机图标选中
    name: 'gs-sxj-qiuj-icon-active',
    url: sxjQiujAct
  },
  {
    // 情报板打点图标
    name: 'gs-qbb-icon',
    url: qbb
  },
  {
    // 情报板打点图标
    name: 'gs-qbb-icon-active',
    url: qbbAct
  },
  {
    // 门架打点图标
    name: 'gs-mj-icon',
    url: mj
  },
  {
    // 门架打点图标
    name: 'gs-mj-icon-active',
    url: mjAct
  },
  {
    // 应急物资打点图标
    name: 'gs-yjwz-icon',
    url: yjwz
  },
  {
    // 应急物资打点图标
    name: 'gs-yjwz-icon-active',
    url: yjwzAct
  },
  {
    // 服务区打点图标
    name: 'gs-fwq-icon',
    url: fwq
  },
  {
    // 服务区打点图标
    name: 'gs-fwq-icon-active',
    url: fwqAct
  },
  {
    // 收费站打点图标
    name: 'gs-sfz-icon',
    url: sfz
  },
  {
    // 收费站打点图标
    name: 'gs-sfz-icon-active',
    url: sfzAct
  },
  {
    // 高速桩号
    name: 'zhdd-gs-zh',
    url: gszh
  },
  {
    // 高速桩号-active
    name: 'zhdd-gs-zh-active',
    url: gsZhAct
  },
  {
    // 枢纽打点图标
    name: 'gs-sn-icon',
    url: sn
  },
  {
    // 枢纽打点图标
    name: 'gs-sn-icon-active',
    url: snAct
  },
  {
    // 清障车打点图标
    name: 'gs-wrecker-icon',
    url: wrecker
  },
  {
    // 清障车打点图标
    name: 'gs-wrecker-icon-active',
    url: wreckerAct
  },
  {
    // 清障车离线图标
    name: 'gs-wrecker-icon-off',
    url: wreckerOff
  },
  {
    // 除雪车打点图标
    name: 'gs-cxc-icon',
    url: cxc
  },
  {
    // 除雪车打点图标
    name: 'gs-cxc-icon-active',
    url: cxcAct
  },
  {
    // 除雪车离线图标
    name: 'gs-cxc-icon-lx',
    url: cxcLx
  },
  {
    // 巡查车打点图标
    name: 'gs-xcc-icon',
    url: xcc
  },
  {
    // 巡查车打点图标
    name: 'gs-xcc-icon-active',
    url: xccAct
  },
  {
    // 巡查车离线图标
    name: 'gs-xcc-icon-lx',
    url: xccLx
  },

  {
    // 警车打点图标
    name: 'gs-jc-icon',
    url: jc
  },
  {
    // 警车打点图标
    name: 'gs-jc-icon-active',
    url: jcAct
  },
  {
    // 警车离线图标
    name: 'gs-jc-icon-lx',
    url: jcLx
  },
  {
    // 警车怠速图标
    name: 'gs-jc-icon-ds',
    url: jcDs
  },

  {
    // 桥梁打点图标
    name: 'gs-ql-icon',
    url: ql
  },
  {
    // 桥梁打点图标激活
    name: 'gs-ql-icon-active',
    url: qlAct
  },
  {
    // 隧道打点图标
    name: 'gs-sd-icon',
    url: sd
  },
  {
    // 隧道打点图标激活
    name: 'gs-sd-icon-active',
    url: sdAct
  },
  {
    // 事故灾害打点图标
    name: 'gs-sgzh-icon',
    url: sgzh
  },
  {
    // 事故灾害打点图标
    name: 'gs-sgzh-icon-active',
    url: sgzhAct
  },
  {
    // 车辆故障打点图标
    name: 'gs-clgz-icon',
    url: clgz
  },
  {
    // 车辆故障打点图标
    name: 'gs-clgz-icon-active',
    url: clgzAct
  },
  {
    // 气象灾害打点图标
    name: 'gs-qxzh-icon',
    url: qxzh
  },
  {
    // 气象灾害打点图标
    name: 'gs-qxzh-icon-active',
    url: qxzhAct
  },
  {
    // 障碍物打点图标
    name: 'gs-zaw-icon',
    url: zaw
  },
  {
    // 障碍物打点图标
    name: 'gs-zaw-icon-active',
    url: zawAct
  },
  {
    // 车流量大打点图标
    name: 'gs-clld-icon',
    url: clld
  },
  {
    // 车流量大打点图标
    name: 'gs-clld-icon-active',
    url: clldAct
  },
  {
    // 突发其他打点图标
    name: 'gs-tdb3-icon',
    url: tdb3
  },
  {
    // 突发其他打点图标
    name: 'gs-tdb3-icon-active',
    url: tdb3Act
  },
  {
    // 地质灾害打点图标
    name: 'gs-dzzh-icon',
    url: dzzh
  },
  {
    // 地质灾害打点图标
    name: 'gs-dzzh-icon-active',
    url: dzzhAct
  },
  {
    // 天气图标
    name: 'weather',
    url: weather
  },
  {
    // 天气图标
    name: 'weather-active',
    url: weatherAct
  },
  {
    // 管理单位图标
    name: 'gs-gldw-icon',
    url: gldw
  },
  {
    // 管理单位图标
    name: 'gs-gldw-icon-active',
    url: gldwAct
  },
  {
    // 管理单位图标-救援站
    name: 'gs-gldw-jyz-icon',
    url: gldwJyz
  },
  {
    // 管理单位图标-救援站激活
    name: 'gs-gldw-jyz-icon-active',
    url: gldwJyzAct
  },
  {
    // 管理单位图标-快返点
    name: 'gs-gldw-kfd-icon',
    url: gldwKfd
  },
  {
    // 管理单位图标-快返点激活
    name: 'gs-gldw-kfd-icon-active',
    url: gldwKfdAct
  },
  {
    // 管理单位图标-管理所
    name: 'gs-gldw-gls-icon',
    url: gldwGls
  },
  {
    // 管理单位图标-管理所激活
    name: 'gs-gldw-gls-icon-active',
    url: gldwGlsAct
  },
  {
    // 管理单位图标
    name: 'gs-gldw-icon-active',
    url: gldwAct
  },
  {
    // 温度仪图标
    name: 'gs-wdy-icon',
    url: wdy
  },
  {
    // 温度仪图标
    name: 'gs-wdy-icon-active',
    url: wdyAct
  },
  {
    // 温度仪离线图标
    name: 'gs-wdy-lx-icon',
    url: wdyLx
  },
  {
    // 温度仪离线图标
    name: 'gs-wdy-lx-icon-active',
    url: wdyLxAct
  },
  {
    // 智能侦测图标
    name: 'gs-znzc-icon',
    url: znzc
  },
  {
    // 施工养护图标
    name: 'gs-sgyh-icon',
    url: sgyh
  },
  {
    // 施工养护选中图标
    name: 'gs-sgyh-icon-active',
    url: sgyhAct
  },
  {
    // 重大社会活动图标
    name: 'gs-zdsh-icon',
    url: zdsh
  },
  {
    // 重大社会活动选中图标
    name: 'gs-zdsh-icon-active',
    url: zdshAct
  },
  {
    // 保障任务图标
    name: 'gs-bzrw-icon',
    url: bzrw
  },
  {
    // 保障任务选中图标
    name: 'gs-bzrw-icon-active',
    url: bzrwAct
  },
  {
    // 临时养护施工图标
    name: 'gs-lsyhsg-icon',
    url: lsyhsg
  },
  {
    // 临时养护施工选中图标
    name: 'gs-lsyhsg-icon-active',
    url: lsyhsgAct
  },
  {
    // 临时保障任务图标
    name: 'gs-lsbz-icon',
    url: lsbz
  },
  {
    // 临时保障任务选中图标
    name: 'gs-lsbz-icon-active',
    url: lsbzAct
  },
  {
    // 其他临时类图标
    name: 'gs-qtls-icon',
    url: qtls
  },
  {
    // 其他临时类选中图标
    name: 'gs-znzc-icon-active',
    // url: qtlsAct
    url: znzcAct
  },

  {
    name: 'marker-wrj-icon',
    url: wrj
  },
  {
    name: 'marker-wrj-icon-active',
    url: wrjActive
  },
  {
    name: 'marker-wrjc-icon',
    url: wrjc
  },
  {
    name: 'marker-wrjc-icon-active',
    url: wrjcActive
  },
  {
    name: 'offline-marker-wrj-icon',
    url: wrjOffline
  },
  {
    name: 'offline-marker-wrj-icon-active',
    url: wrjOfflineActive
  },
  {
    name: 'offline-marker-wrjc-icon',
    url: wrjcOffline
  },
  {
    name: 'offline-marker-wrjc-icon-active',
    url: wrjcOfflineActive
  },
  {
    // 车辆轨迹图标
    name: 'icon-gd-car',
    url: iconGdCar
  },
  // 桩号图标
  {
    name: 'zh-km-icon',
    url: getImageUrl('zh/zh-km.png')
  },
  {
    name: 'zh-1-icon',
    url: getImageUrl('zh/zh-1.png')
  },
  {
    name: 'zh-2-icon',
    url: getImageUrl('zh/zh-2.png')
  },
  {
    name: 'zh-3-icon',
    url: getImageUrl('zh/zh-3.png')
  },
  {
    name: 'zh-4-icon',
    url: getImageUrl('zh/zh-4.png')
  },
  {
    name: 'zh-5-icon',
    url: getImageUrl('zh/zh-5.png')
  },
  {
    name: 'zh-6-icon',
    url: getImageUrl('zh/zh-6.png')
  },
  {
    name: 'zh-7-icon',
    url: getImageUrl('zh/zh-7.png')
  },
  {
    name: 'zh-8-icon',
    url: getImageUrl('zh/zh-8.png')
  },
  {
    name: 'zh-9-icon',
    url: getImageUrl('zh/zh-9.png')
  }
]
