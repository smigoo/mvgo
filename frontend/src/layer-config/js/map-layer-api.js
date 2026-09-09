/*
 * @Author: lany(632805082@qq.com)
 * @Date: 2025-08-18 19:20:36
 * @LastEditors: lany(632805082@qq.com)
 * @LastEditTime: 2025-08-22 11:56:33
 * @Description: Do not edit
 * @Copyright: © 2025 Microvideo
 */
import pinia, { useUserStore } from '@/store'
import { inflate } from 'pako'
import api from './api'
import { base64ToUint8Array } from './utils'
const iconSize = [28, 35]
// 注意：不可在模块顶层调用 useUserStore()，否则在 @/store 循环依赖求值途中会命中 const 暂时性死区（TDZ）。
// 改为惰性函数，运行时（模块均已就绪）再取用户信息。
// 显式传入 pinia 实例，避免组件外调用时 getActivePinia 报错（不依赖 active pinia）
const getUserInfo = () => useUserStore(pinia).userInfo
// 摄像机
export const getCameraData = (params, type) => {
  return new Promise((resolve) => {
    api.getIconData('camera', params).then((res) => {
      let data = []
      let status = 0
      let icon = 'gs-sxj-qiangj-icon'
      let iconLx = 'gs-sxj-qiangj-lx'
      if (res.data && res.data.length > 0) {
        if (type === 'qiuji') {
          icon = 'gs-sxj-qiuj-icon'
          iconLx = 'gs-sxj-qiuj-lx'
        }
        res.data.forEach((item) => {
          if (item.online == 1) {
            let obj = {
              icon: icon,
              path: [item.lng, item.lat],
              name: item.name,
              iconInfo: item
            }
            data.push(obj)
          } else {
            let obj = {
              icon: iconLx,
              path: [item.lng, item.lat],
              name: item.name,
              iconInfo: item
            }
            data.push(obj)
          }
        })

        status = 0
      } else {
        status = 1
      }
      resolve({ status: status, data })
    })
  })
}
// 路况
export const getLkData = () => {
  // 拥堵路况等级
  const traffStatus = {
    all: {
      zIndex: 10,
      color: '#78c164',
      status: 'all'
    },
    未知: {
      zIndex: 55,
      color: '#b3d72d',
      status: '未知'
    },
    轻度拥堵: {
      zIndex: 60,
      color: '#FF6666',
      status: '轻度拥堵'
    },
    中度拥堵: {
      zIndex: 80,
      color: '#FF0033',
      status: '中度拥堵'
    },
    重度拥堵: {
      zIndex: 100,
      color: '#993333',
      status: '重度拥堵'
    }
  }
  return new Promise((resolve, reject) => {
    const config = {
      renderMapLine: {
        lineWidth: 6,
        selectWidth: 8,
        defaultStatusKey: 'all'
      },
      lk: {
        lineWidth: 10,
        selectWidth: 12,
        defaultStatusKey: (status) => status || 'all'
      }
    }

    function createItem(item, type) {
      const conf = config[type]
      const statusKey =
        conf.defaultStatusKey instanceof Function
          ? conf.defaultStatusKey(item.status)
          : conf.defaultStatusKey
      let lkName = ''
      // 拥堵路段的名字不一样
      if (type === 'lk') {
        lkName = `${item.roadCode || ''} ${item.roadName || ''}K${item.beginPileNum || ''} ~ K${item.endPileNum || ''} ${
          item.status || ''
        }`
      } else {
        lkName = item.properties.roadNum
      }
      return {
        name: lkName,
        path: (item.geometry && item.geometry.coordinates) || item.path || [],
        blockType: 'blockUp',
        // ...itemData,
        config: {
          status: traffStatus[statusKey].status,
          lineWidth: conf.lineWidth,
          selectWidth: conf.selectWidth,
          lineColor: traffStatus[statusKey].color,
          selectColor: traffStatus[statusKey].color,
          zIndex: traffStatus[statusKey].zIndex
        },
        id: item.jamEventId,
        ...(type === 'lk' ? { lineInfo: item } : {})
      }
    }
    // Promise.all([api.getDeptBaseLine(), api.getIconData('lk')])
    //   .then(([res1, res2]) => {
    api
      .getIconData('lk')
      .then((res) => {
        let data = []

        if (res && res.data && Array.isArray(res.data)) {
          res.data.forEach((item) => data.push(createItem(item, 'lk')))
        }
        resolve({ status: 0, data })
      })
      .catch((error) => {
        reject(error)
      })
  })
}
/**
 * 获取基础路线
 * @returns baseLineData
 */
export const getBaseLine = () => {
  return new Promise((resolve, reject) => {
    const baseLineData = []

    // 基础路线默认配置
    // const defaultConfig = {
    //   ...defaultLineConfig
    // }
    // 拥堵路况等级
    const traffStatus = {
      all: {
        zIndex: 10,
        color: '#78c164',
        status: 'all'
      },
      未知: {
        zIndex: 55,
        color: '#b3d72d',
        status: '未知'
      },
      轻度拥堵: {
        zIndex: 60,
        color: '#FF6666',
        status: '轻度拥堵'
      },
      中度拥堵: {
        zIndex: 80,
        color: '#FF0033',
        status: '中度拥堵'
      },
      重度拥堵: {
        zIndex: 100,
        color: '#993333',
        status: '重度拥堵'
      }
    }
    api
      .getDeptBaseLine()
      .then((res) => {
        console.log('data==>jichuluxian889', res)
        const conf = {
          lineWidth: 6,
          selectWidth: 8,
          defaultStatusKey: 'all'
        }
        res?.data?.features.forEach((line, index) => {
          if (line.geometry && line.geometry.coordinates) {
            const statusKey =
              conf.defaultStatusKey instanceof Function
                ? conf.defaultStatusKey(line.status)
                : conf.defaultStatusKey
            console.log('statusKey', statusKey)
            baseLineData.push({
              roadType: 1,
              id: line.properties.roadNum + index,
              roadNum: line.properties.roadNum,
              roadName: line.properties.roadNum,
              name: `${line.properties.roadNum}`,
              path: line.geometry.coordinates || [],
              config: {
                status: traffStatus[statusKey].status,
                lineWidth: conf.lineWidth,
                selectWidth: conf.selectWidth,
                lineColor: traffStatus[statusKey].color,
                selectColor: traffStatus[statusKey].color,
                zIndex: traffStatus[statusKey].zIndex
              }
            })
          }
        })
      })
      .finally(() => {
        resolve({ status: 0, data: baseLineData })
      })
  })
}
// 情报板
export const getQbbData = () => {
  return new Promise((resolve) => {
    api.getIconData('qbb').then((res) => {
      let data = []
      let status = 0
      if (res.data && res.data.length > 0) {
        res.data.forEach((item) => {
          let obj = {
            icon: 'gs-qbb-icon',
            path: [item.lng, item.lat],
            name: item.name,
            size: iconSize,
            iconInfo: item
          }
          data.push(obj)
        })
        status = 0
      } else {
        status = 1
        data = []
      }

      resolve({ status: status, data })
    })
  })
}
// 门架
export const getMjData = () => {
  return new Promise((resolve) => {
    api.getIconData('door-frame').then((res) => {
      let data = []
      let status = 0
      if (res.data && res.data.length > 0) {
        res.data.forEach((item) => {
          let obj = {
            icon: 'gs-mj-icon',
            path: [item.lngWgs, item.latWgs],
            name: item.gantryName,
            size: iconSize,
            iconInfo: item
          }
          data.push(obj)
        })
        status = 0
      } else {
        status = 1
        data = []
      }
      resolve({ status: status, data })
    })
  })
}
// 应急物资
export const getYjwzData = () => {
  return new Promise((resolve) => {
    api.getIconData('yjwz').then((res) => {
      let data = []
      let status = 0
      if (res.data && res.data.length > 0) {
        res.data.forEach((item) => {
          if (item.lng && item.lat) {
            let obj = {
              icon: 'gs-yjwz-icon',
              path: [item.lng, item.lat],
              name: item.name,
              size: iconSize,
              iconInfo: item
            }
            data.push(obj)
          }
        })
        status = 0
      } else {
        status = 1
        data = []
      }
      resolve({ status: status, data })
    })
  })
}
// 服务区
export const getFwqData = () => {
  return new Promise((resolve) => {
    api.getIconData('fwq').then((res) => {
      let data = []
      let status = 0
      if (res.data && res.data.length > 0) {
        res.data.forEach((item) => {
          let obj = {
            icon: 'gs-fwq-icon',
            path: [item.lng, item.lat],
            name: item.name,
            size: iconSize
          }
          data.push(obj)
        })
        status = 0
      } else {
        status = 1
        data = []
      }
      resolve({ status: status, data })
    })
  })
}
// 收费站
export const getSfzData = () => {
  return new Promise((resolve) => {
    api.getIconData('sfz').then((res) => {
      let data = []
      let status = 0
      if (res.data && res.data.length > 0) {
        res.data.forEach((item) => {
          let obj = {
            icon: 'gs-sfz-icon',
            path: [item.lng, item.lat],
            name: item.name,
            size: iconSize,
            iconInfo: item
          }
          data.push(obj)
        })
        status = 0
      } else {
        status = 1
        data = []
      }
      resolve({ status: status, data })
    })
  })
}
// 枢纽
export const getSnData = () => {
  return new Promise((resolve) => {
    api.getIconData('sn').then((res) => {
      let data = []
      let status = 0
      if (res.data && res.data.length > 0) {
        res.data.forEach((item) => {
          let obj = {
            icon: 'gs-sn-icon',
            path: [item.lng, item.lat],
            name: item.name,
            size: iconSize
          }
          data.push(obj)
        })
        status = 0
      } else {
        status = 1
        data = []
      }
      resolve({ status: status, data })
    })
  })
}
// 清障车
export const getQzcData = () => {
  return new Promise((resolve) => {
    api.getIconData('zyc', { type: '1' }).then((res) => {
      let data = []
      let status = 0
      if (res.data && res.data.length > 0) {
        res.data.forEach((item) => {
          if (item.status) {
            let obj = {
              icon: 'gs-wrecker-icon',
              path: [item.lng, item.lat],
              name: item.vehicleNo,
              size: iconSize,
              iconInfo: item
            }
            data.push(obj)
          } else {
            let obj = {
              icon: 'gs-wrecker-icon-off',
              path: [item.lng, item.lat],
              name: item.vehicleNo,
              size: iconSize,
              iconInfo: item
            }
            data.push(obj)
          }
        })
        status = 0
      } else {
        status = 1
        data = []
      }

      resolve({ status: status, data })
    })
  })
}
// 除雪车
export const getCxcData = () => {
  return new Promise((resolve) => {
    api.getIconData('zyc', { type: '2' }).then((res) => {
      let data = []
      let status = 0
      if (res.data && res.data.length > 0) {
        res.data.forEach((item) => {
          if (item.status) {
            let obj = {
              icon: 'gs-cxc-icon',
              path: [item.lng, item.lat],
              name: item.vehicleNo,
              size: iconSize
            }
            data.push(obj)
          } else {
            let obj = {
              icon: 'gs-cxc-icon-lx',
              path: [item.lng, item.lat],
              name: item.vehicleNo,
              size: iconSize
            }
            data.push(obj)
          }
        })
      } else {
        status = 1
        data = []
      }

      resolve({ status: status, data })
    })
  })
}

// 巡查车-先使用巡查车的接口
export const getXccData = () => {
  return new Promise((resolve) => {
    api.getIconData('zyc', { type: '3' }).then((res) => {
      let data = []
      let status = 0
      if (res.data && res.data.length > 0) {
        res.data.forEach((item) => {
          if (item.status) {
            let obj = {
              icon: 'gs-jc-icon',
              path: [item.lng, item.lat],
              name: item.vehicleNo,
              size: iconSize,
              iconInfo: item
            }
            data.push(obj)
          } else {
            let obj = {
              icon: 'gs-jc-icon-lx',
              path: [item.lng, item.lat],
              name: item.vehicleNo,
              size: iconSize,
              iconInfo: item
            }
            data.push(obj)
          }
        })
        status = 0
      } else {
        status = 1
        data = []
      }
      resolve({ status: status, data })
    })
  })
}

/**
 * 获取警车状态对应的图标
 * @param {number} vehicleStatus 车辆状态：0-离线，1-在线，2-怠速，3-行驶中
 * @returns {string} 图标名称
 */
const getPoliceCarIcon = (vehicleStatus) => {
  switch (vehicleStatus) {
    case 0:
      return 'gs-jc-icon-lx' // 离线
    case 1:
      return 'gs-jc-icon' // 在线
    case 2:
      return 'gs-jc-icon-ds' // 怠速
    case 3:
      return 'gs-jc-icon' // 行驶中
    default:
      return 'gs-jc-icon-lx' // 默认离线状态
  }
}

/**
 * 获取警车状态文本
 * @param {number} vehicleStatus 车辆状态：0-离线，1-在线，2-怠速，3-行驶中
 * @returns {string} 状态文本
 */
const getPoliceCarStatusText = (vehicleStatus) => {
  const statusMap = {
    0: '离线',
    1: '在线',
    2: '怠速',
    3: '行驶中'
  }
  return statusMap[vehicleStatus] || '--'
}

/**
 * 格式化警车名称
 * @param {string} licensePlate 车牌号
 * @param {number} vehicleStatus 车辆状态
 * @returns {string} 格式化后的名称
 */
const formatPoliceCarName = (licensePlate, vehicleStatus) => {
  const statusText = getPoliceCarStatusText(vehicleStatus)
  return `${licensePlate}：${statusText}`
}

// 获取警车
export const getJcData = () => {
  return new Promise((resolve) => {
    // 四支队
    if (getUserInfo().orgId === '8a8181d5981868be0198316e92bf008e') {
      api.getIconData('jc', {}).then((res) => {
        let data = []
        let status = 0

        if (res.data && res.data.length > 0) {
          res.data.forEach((item) => {
            const obj = {
              icon: getPoliceCarIcon(item.vehicleStatus),
              path: [item.longitude, item.latitude],
              name: formatPoliceCarName(item.licensePlate, item.vehicleStatus),
              size: iconSize,
              iconInfo: item
            }
            data.push(obj)
          })
          status = 0
        } else {
          status = 1
          data = []
        }
        resolve({ status: status, data })
      })
    } else {
      resolve({ status: 0, data: [] })
    }
  })
}

// 桩号
export const getZhData = () => {
  return new Promise((resolve, reject) => {
    // let userInfo = JSON.parse(localStorage.getItem('user_info'))
    const userInfo = useUserStore(pinia).userInfo
    let params = {
      // projectId: 'ZHDD-SJK',
      // operatorCode: 'APP:YXJC' + ':' + new Date().getTime(),
      // qsId: userInfo?.orgId,
      // qsId: 'ORG00193',
      modelType: 'mileage'
    }
    api
      .getDeptBaseMileage(params)
      .then((res) => {
        const data = JSON.parse(inflate(base64ToUint8Array(res.data), { to: 'string' }))
        const objs = data.features.map((i) => {
          return {
            icon: 'zhdd-gs-zh',
            path: i.geometry.coordinates,
            name: i.properties.resourcesName,
            size: iconSize
          }
        })
        console.log(objs, 'objs')
        resolve({
          status: 0,
          data: objs
        })
      })
      .catch(() => {
        reject({ status: null })
      })
  })
}
// 桥梁
export const getQlData = () => {
  return new Promise((resolve) => {
    api.getIconData('ql').then((res) => {
      let data = []
      let status = 0
      if (res.data && res.data.length > 0) {
        res.data.forEach((item) => {
          let obj = {
            icon: 'gs-ql-icon',
            path: [item.lon, item.lat],
            name: item.bridgeName,
            size: iconSize,
            id: item.bridgeId
          }
          data.push(obj)
        })
        status = 0
      } else {
        status = 1
        data = []
      }
      resolve({ status: status, data })
    })
  })
}
// 隧道
export const getSdData = () => {
  return new Promise((resolve) => {
    api.getIconData('sd').then((res) => {
      let data = []
      let status = 0
      if (res.data && res.data.length > 0) {
        res.data.forEach((item) => {
          let obj = {
            icon: 'gs-sd-icon',
            path: [item.lng, item.lat],
            name: item.name,
            size: iconSize,
            iconInfo: item
          }
          data.push(obj)
        })
        status = 0
      } else {
        data = []
        status = 1
      }

      resolve({ status: status, data })
    })
  })
}
// 天气
export const getTqData = () => {
  return new Promise((resolve) => {
    api.getIconData('tq').then((res) => {
      console.log(res, 'rrresdres')
      let data = []
      let status = 0
      if (res.data && res.data.length > 0) {
        res.data.forEach((item) => {
          let obj = {
            path: [item.lng, item.lat],
            name: item.name,
            size: iconSize
          }
          data.push(obj)
        })
        status = 0
      } else {
        data = []
        status = 1
      }
      resolve({ status: status, data })
    })
  })
}
// 事故灾害/车辆故障/气象灾害/障碍物/车流量大
export const getLwsjData = (customEventType) => {
  const eventTypeArr = {
    TAB1: { icon: 'gs-sgzh-icon', name: '事故灾害' },
    TAB2: { icon: 'gs-clgz-icon', name: '车辆故障' },
    TBB1: { icon: 'gs-qxzh-icon', name: '气象灾害' },
    TDB2: { icon: 'gs-zaw-icon', name: '障碍物' },
    TDB1: { icon: 'gs-clld-icon', name: '车流量大' },
    TCB1: { icon: 'gs-dzzh-icon', name: '地质灾害' }
  }
  return new Promise((resolve) => {
    api.getIconData('lwsj').then((res) => {
      let data = []
      let status = 0
      if (res.data && res.data.length > 0) {
        const arr = res.data.filter((item) => item.customEventType === customEventType)
        if (arr && arr.length > 0) {
          arr.forEach((i) => {
            i.eventPositionList.forEach((j) => {
              // 获取name的全称 路线+桩号
              let name = j.eventRoadId
              const {
                eventStartMileageK: StartK,
                eventStartMileageM: StartM,
                eventEndMileageK: EndK,
                eventEndMileageM: EndM
              } = j
              if (StartK && StartM && EndK && EndM) {
                name = `${name} K${StartK}+${StartM} - K${EndM}+${EndM}`
              } else if (StartK && StartM && EndK) {
                name = `${name} K${StartK}+${StartM} - K${EndK}`
              } else if (StartK && StartM && EndM) {
                name = `${name} K${StartK}+${StartM} - ${EndM}`
              } else if (StartK && EndK) {
                name = `${name} K${StartK} - K${EndK}`
              } else if (StartM && EndM) {
                name = `${name} ${StartM} - ${EndM}`
              } else {
                name = `${name}`
              }
              // if (StartM && !EndM) {
              //   name = eventEndMileageK ? `${name} K${eventStartMileageK}+${StartM} - K${eventEndMileageK}` : `${name} K${eventStartMileageK}+${StartM}`
              // } else if (!StartM && EndM) {
              //   name = `${name} K${eventStartMileageK} - K${eventEndMileageK}+${EndM}`
              // } else if (!StartM && !EndM) {
              //   name = `${name} K${eventStartMileageK} - K${eventEndMileageK}`
              // } else {
              //   name = `${name} K${eventStartMileageK}+${StartM} - K${eventEndMileageK}+${EndM}`
              // }
              let obj = {
                icon: eventTypeArr[customEventType].icon,
                path: j.eventLat && j.eventLon ? [j.eventLon, j.eventLat] : null,
                name: name,
                size: iconSize,
                iconInfo: {
                  ...j,
                  eventStartTime: i.eventStartTime,
                  position: name,
                  eventDesc: i.eventDesc
                }
              }
              data.push(obj)
            })
          })
          status = 0
        } else {
          data = []
          status = 1
        }
      } else {
        data = []
        status = 1
      }
      resolve({ status: status, data })
    })
  })
}
// 获取管理单位数据
export const getGldwData = () => {
  return new Promise((resolve) => {
    api.getIconData('gldw').then((res) => {
      let data = []
      let status = []
      if (res.data && res.data.length > 0) {
        res.data.forEach((item) => {
          let obj = {
            icon: 'gs-gldw-icon',
            path: [item.lng, item.lat],
            name: item.name,
            size: iconSize
          }
          data.push(obj)
        })
        status = 0
      } else {
        status = 1
        data = []
      }
      resolve({ status: status, data })
    })
  })
}
// 获取管理单位数据 - 救援站
export const getGldwJyzData = () => {
  return new Promise((resolve) => {
    api.getIconData('jzz', {}).then((res) => {
      let data = []
      let status = []
      if (res.data && res.data.length > 0) {
        res.data.forEach((item) => {
          let obj = {
            icon: 'gs-gldw-jyz-icon',
            id: item.stationId,
            path: [item.lngWgs, item.latWgs],
            name: item.stationName,
            size: iconSize
          }
          data.push(obj)
        })
        status = 0
      } else {
        status = 1
        data = []
      }
      resolve({ status: status, data })
    })
  })
}

// 获取管理单位数据 - 查询快返点
export const getGldwKfdData = (params) => {
  return new Promise((resolve) => {
    // 四支队
    if (getUserInfo().orgId === '8a8181d5981868be0198316e92bf008e') {
      api.getIconData('kfd', {}).then((res) => {
        let data = []
        let status = 0
        let icon = 'gs-gldw-kfd-icon'
        if (res.data && res.data.length > 0) {
          res.data.forEach((item) => {
            let obj = {
              icon: icon,
              path: [item.lon, item.lat],
              name: item.mainForce,
              iconInfo: item,
              type: 'kfd'
            }
            data.push(obj)
          })

          status = 0
        } else {
          status = 1
        }
        resolve({ status: status, data })
      })
    } else {
      resolve({ status: 0, data: [] })
    }
  })
}
// 获取管理单位数据 - 管理所
export const getGldwGlsData = () => {
  return new Promise((resolve) => {
    api.getIconData('gls', {}).then((res) => {
      let data = []
      let status = []
      if (res.data && res.data.length > 0) {
        res.data.forEach((item) => {
          let obj = {
            icon: 'gs-gldw-gls-icon',
            id: item.manageId,
            path: [item.lngWgs, item.latWgs],
            name: item.manageName,
            size: iconSize
          }
          data.push(obj)
        })
        status = 0
      } else {
        status = 1
        data = []
      }
      resolve({ status: status, data })
    })
  })
}
// 获取温度仪数据
export const getWdyData = () => {
  return new Promise((resolve) => {
    api.getIconData('wdy', { treeId: 'yspgmhlv' }).then((res) => {
      let data = []
      let status = []
      if (res.data && res.data.length > 0) {
        res.data.forEach((item) => {
          if (item.lon && item.lat) {
            if (item.status) {
              let obj = {
                icon: 'gs-wdy-lx-icon',
                path: [item.lon, item.lat],
                name: item.deviceName,
                size: iconSize,
                iconInfo: item
              }
              data.push(obj)
            } else {
              let obj = {
                icon: 'gs-wdy-icon',
                path: [item.lon, item.lat],
                name: item.deviceName,
                size: iconSize,
                iconInfo: item
              }
              data.push(obj)
            }
          }
        })
        status = 0
      } else {
        status = 1
        data = []
      }
      resolve({ status: status, data })
    })
  })
}
// 获取无人机数据
export const getWrjData = async () => {
  try {
    let data = []
    let status = 0

    // 1. 获取无人机巢数据
    // const wrjcRes = await api.getWrjcData()
    const wrjcRes = await api.getIconData('wrjc')
    if (wrjcRes.data && wrjcRes.data.length > 0) {
      console.log(wrjcRes, '无人机巢数据')

      // 2. 遍历无人机巢数据，添加无人机巢点位
      for (const wrjcItem of wrjcRes.data) {
        // 添加无人机巢点位
        const wrjcObj = {
          icon: wrjcItem.deviceState === 0 ? 'offline-marker-wrjc-icon' : 'marker-wrjc-icon',
          path: [Number(wrjcItem.longitude), Number(wrjcItem.latitude)],
          name: wrjcItem.deviceSn,
          size: iconSize,
          iconInfo: { ...wrjcItem, type: 'wrjc' } // 标记为无人机巢
        }
        data.push(wrjcObj)

        // 3. 检查无人机巢状态，如果 deviceState === 1，获取该无人机巢下的无人机数据
        if (wrjcItem.deviceState === 1) {
          try {
            const wrjParams = {
              dataType: wrjcItem.dataType,
              deviceSn: wrjcItem.deviceSn
            }

            // const wrjRes = await api.getWrjData(wrjParams)
            const wrjRes = await api.getIconData('wrj', wrjParams)
            if (wrjRes.data && wrjRes) {
              console.log(wrjRes, `无人机巢 ${wrjcItem.deviceSn} 的无人机数据`)
              let lineArr = []
              if (wrjRes.data?.lonlatList && wrjRes.data?.lonlatList.length > 0) {
                wrjRes.data.lonlatList.forEach((item) => {
                  lineArr.push([Number(item.longitude), Number(item.latitude)])
                })
              }

              // 添加无人机点位数据
              // wrjRes.data.forEach((wrjItem) => {
              const wrjObj = {
                icon: wrjcItem.deviceState === 0 ? 'offline-marker-wrj-icon' : 'marker-wrj-icon', // 使用不同的图标区分无人机和无人机巢
                path: [Number(wrjRes.data.longitude), Number(wrjRes.data.latitude)],
                // path: [109.7019071294218, 28.330031371777935],
                // name: `${wrjRes.data.deviceSn || wrjRes.data.name || '无人机'}`,
                name: '无人机',
                size: iconSize,
                iconInfo: {
                  ...wrjRes.data,
                  type: 'wrj', // 标记为无人机
                  parentDeviceSn: wrjcItem.deviceSn,
                  // lineArr: lineArr || [[109.7019071294218, 28.330031371777935]]
                  lineArr: lineArr
                }
              }
              data.push(wrjObj)
              // })
            }
          } catch (wrjError) {
            console.error(`获取无人机巢 ${wrjcItem.deviceSn} 的无人机数据失败:`, wrjError)
            // 即使某个无人机巢的无人机数据获取失败，也不影响其他数据的获取
          }
        }
      }

      status = 0
    } else {
      status = 1
      data = []
    }

    return { status: status, data }
  } catch (error) {
    console.error('获取无人机数据失败:', error)
    return { status: 1, data: [] }
  }
}
