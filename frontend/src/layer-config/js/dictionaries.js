import dayjs from 'dayjs'
import { getZhText } from './utils.js'
/**
 * 根据字典类型查询 对应的所有字典数组
 * 或者
 * 根据字典类型和具体的值 查询对应的返回值
 * @param {String} type 字典类型 只传type返回该字典类型数组
 * @param {String} val 键值 根据键值查询对应的字典值
 * @param {String} notext 字典值没查询到默认返回字段
 * @param {String} callbackKey 返回所需的key值
 * @returns
 */
export function getDict(type, val = undefined, notext = '', callbackKey = 'itemDesc') {
  const dictMap = {
    'CAIYUN-BAD-WEATHER-TYPE': [
      {
        dataCreateTime: '2025-04-24 17:10:38',
        dataUpdateTime: '2025-04-24 17:21:08',
        dataDelFlag: 0,
        id: '664',
        itemCode: '01',
        dictCode: 'CAIYUN-BAD-WEATHER-TYPE',
        itemValue: 1,
        itemDesc: '台风',
        itemOrder: 1
      },
      {
        dataCreateTime: '2025-04-24 17:15:40',
        dataUpdateTime: '2025-04-24 17:15:40',
        dataDelFlag: 0,
        id: '665',
        itemCode: '02',
        dictCode: 'CAIYUN-BAD-WEATHER-TYPE',
        itemValue: 2,
        itemDesc: '暴雨',
        itemOrder: 1
      },
      {
        dataCreateTime: '2025-04-24 17:16:18',
        dataUpdateTime: '2025-04-24 17:16:18',
        dataDelFlag: 0,
        id: '666',
        itemCode: '03',
        dictCode: 'CAIYUN-BAD-WEATHER-TYPE',
        itemValue: 3,
        itemDesc: '暴雪',
        itemOrder: 1
      },
      {
        dataCreateTime: '2025-04-24 17:16:34',
        dataUpdateTime: '2025-04-24 17:16:34',
        dataDelFlag: 0,
        id: '667',
        itemCode: '04',
        dictCode: 'CAIYUN-BAD-WEATHER-TYPE',
        itemValue: 4,
        itemDesc: '寒潮',
        itemOrder: 1
      },
      {
        dataCreateTime: '2025-04-24 17:16:49',
        dataUpdateTime: '2025-04-24 17:16:49',
        dataDelFlag: 0,
        id: '668',
        itemCode: '05',
        dictCode: 'CAIYUN-BAD-WEATHER-TYPE',
        itemValue: 5,
        itemDesc: '大风',
        itemOrder: 1
      },
      {
        dataCreateTime: '2025-04-24 17:17:08',
        dataUpdateTime: '2025-04-24 17:17:08',
        dataDelFlag: 0,
        id: '669',
        itemCode: '06',
        dictCode: 'CAIYUN-BAD-WEATHER-TYPE',
        itemValue: 6,
        itemDesc: '沙尘暴',
        itemOrder: 1
      },
      {
        dataCreateTime: '2025-04-24 17:17:26',
        dataUpdateTime: '2025-04-24 17:17:26',
        dataDelFlag: 0,
        id: '670',
        itemCode: '07',
        dictCode: 'CAIYUN-BAD-WEATHER-TYPE',
        itemValue: 7,
        itemDesc: '高温',
        itemOrder: 1
      },
      {
        dataCreateTime: '2025-04-24 17:17:47',
        dataUpdateTime: '2025-04-24 17:17:47',
        dataDelFlag: 0,
        id: '671',
        itemCode: '08',
        dictCode: 'CAIYUN-BAD-WEATHER-TYPE',
        itemValue: 8,
        itemDesc: '干旱',
        itemOrder: 1
      },
      {
        dataCreateTime: '2025-04-24 17:18:02',
        dataUpdateTime: '2025-04-24 17:18:02',
        dataDelFlag: 0,
        id: '672',
        itemCode: '09',
        dictCode: 'CAIYUN-BAD-WEATHER-TYPE',
        itemValue: 9,
        itemDesc: '雷电',
        itemOrder: 1
      },
      {
        dataCreateTime: '2025-04-24 17:18:30',
        dataUpdateTime: '2025-04-24 17:18:30',
        dataDelFlag: 0,
        id: '673',
        itemCode: '10',
        dictCode: 'CAIYUN-BAD-WEATHER-TYPE',
        itemValue: 10,
        itemDesc: '冰雹',
        itemOrder: 1
      },
      {
        dataCreateTime: '2025-04-24 17:18:42',
        dataUpdateTime: '2025-04-24 17:18:42',
        dataDelFlag: 0,
        id: '674',
        itemCode: '11',
        dictCode: 'CAIYUN-BAD-WEATHER-TYPE',
        itemValue: 11,
        itemDesc: '霜冻',
        itemOrder: 1
      },
      {
        dataCreateTime: '2025-04-24 17:18:53',
        dataUpdateTime: '2025-04-24 17:18:53',
        dataDelFlag: 0,
        id: '675',
        itemCode: '12',
        dictCode: 'CAIYUN-BAD-WEATHER-TYPE',
        itemValue: 12,
        itemDesc: '大雾',
        itemOrder: 1
      },
      {
        dataCreateTime: '2025-04-24 17:19:07',
        dataUpdateTime: '2025-04-24 17:19:07',
        dataDelFlag: 0,
        id: '676',
        itemCode: '13',
        dictCode: 'CAIYUN-BAD-WEATHER-TYPE',
        itemValue: 13,
        itemDesc: '霾',
        itemOrder: 1
      },
      {
        dataCreateTime: '2025-04-24 17:19:24',
        dataUpdateTime: '2025-04-24 17:19:24',
        dataDelFlag: 0,
        id: '677',
        itemCode: '14',
        dictCode: 'CAIYUN-BAD-WEATHER-TYPE',
        itemValue: 14,
        itemDesc: '道路结冰',
        itemOrder: 1
      },
      {
        dataCreateTime: '2025-04-24 17:19:41',
        dataUpdateTime: '2025-04-24 17:19:41',
        dataDelFlag: 0,
        id: '678',
        itemCode: '15',
        dictCode: 'CAIYUN-BAD-WEATHER-TYPE',
        itemValue: 15,
        itemDesc: '森林火险',
        itemOrder: 1
      },
      {
        dataCreateTime: '2025-04-24 17:19:57',
        dataUpdateTime: '2025-04-24 17:19:57',
        dataDelFlag: 0,
        id: '679',
        itemCode: '16',
        dictCode: 'CAIYUN-BAD-WEATHER-TYPE',
        itemValue: 16,
        itemDesc: '雷电大风',
        itemOrder: 1
      },
      {
        dataCreateTime: '2025-04-24 17:20:19',
        dataUpdateTime: '2025-04-24 17:20:19',
        dataDelFlag: 0,
        id: '680',
        itemCode: '17',
        dictCode: 'CAIYUN-BAD-WEATHER-TYPE',
        itemValue: 17,
        itemDesc: '春季沙尘天气趋势预警\t',
        itemOrder: 1
      },
      {
        dataCreateTime: '2025-04-24 17:21:41',
        dataUpdateTime: '2025-04-24 17:21:41',
        dataDelFlag: 0,
        id: '681',
        itemCode: '18',
        dictCode: 'CAIYUN-BAD-WEATHER-TYPE',
        itemValue: 18,
        itemDesc: '沙尘',
        itemOrder: 1
      }
    ],

    'ZNZC-AI-EVENTTYPE': [
      {
        dataCreateTime: '2023-08-15 09:22:45',
        dataUpdateTime: '2023-10-17 17:20:35',
        dataDelFlag: 0,
        id: '8',
        itemCode: 'abandon',
        dictCode: 'ZNZC-AI-EVENTTYPE',
        itemValue: 9,
        itemDesc: '抛洒物',
        itemOrder: 0
      },
      {
        dataCreateTime: '2023-08-15 09:22:45',
        dataUpdateTime: '2023-08-15 09:22:45',
        dataDelFlag: 0,
        id: '46',
        itemCode: 'camera_move',
        dictCode: 'ZNZC-AI-EVENTTYPE',
        itemValue: 20,
        itemDesc: '相机移动',
        itemOrder: 0
      },
      {
        dataCreateTime: '2023-08-15 09:22:45',
        dataUpdateTime: '2023-08-15 09:22:45',
        dataDelFlag: 0,
        id: '58',
        itemCode: 'carry_people',
        dictCode: 'ZNZC-AI-EVENTTYPE',
        itemValue: 23,
        itemDesc: '⾮机动⻋骑⻋带⼈',
        itemOrder: 0
      },
      {
        dataCreateTime: '2023-08-15 09:22:45',
        dataUpdateTime: '2023-08-15 09:22:45',
        dataDelFlag: 0,
        id: '79',
        itemCode: 'construction_area',
        dictCode: 'ZNZC-AI-EVENTTYPE',
        itemValue: 21,
        itemDesc: '施⼯区域',
        itemOrder: 0
      },
      {
        dataCreateTime: '2023-08-15 09:22:45',
        dataUpdateTime: '2023-08-15 09:22:45',
        dataDelFlag: 0,
        id: '123',
        itemCode: 'fog',
        dictCode: 'ZNZC-AI-EVENTTYPE',
        itemValue: 13,
        itemDesc: '雾',
        itemOrder: 0
      },
      {
        dataCreateTime: '2023-08-15 09:22:45',
        dataUpdateTime: '2023-08-15 09:22:45',
        dataDelFlag: 0,
        id: '147',
        itemCode: 'into_drivingarea',
        dictCode: 'ZNZC-AI-EVENTTYPE',
        itemValue: 22,
        itemDesc: '⾮机动⻋闯⼊⾏⻋区域',
        itemOrder: 0
      },
      {
        dataCreateTime: '2023-08-15 09:22:45',
        dataUpdateTime: '2023-08-15 09:22:45',
        dataDelFlag: 0,
        id: '148',
        itemCode: 'into_forbidden_area',
        dictCode: 'ZNZC-AI-EVENTTYPE',
        itemValue: 8,
        itemDesc: '禁⾏闯⼊（⾏⼈/两轮⻋/三轮⻋）',
        itemOrder: 0
      },
      {
        dataCreateTime: '2023-08-15 09:22:45',
        dataUpdateTime: '2023-08-15 09:22:45',
        dataDelFlag: 0,
        id: '195',
        itemCode: 'nmve_converse',
        dictCode: 'ZNZC-AI-EVENTTYPE',
        itemValue: 25,
        itemDesc: '⾮机动⻋逆⾏',
        itemOrder: 0
      },
      {
        dataCreateTime: '2023-08-15 09:22:45',
        dataUpdateTime: '2023-08-15 09:22:45',
        dataDelFlag: 0,
        id: '235',
        itemCode: 'rain',
        dictCode: 'ZNZC-AI-EVENTTYPE',
        itemValue: 12,
        itemDesc: '雨',
        itemOrder: 0
      },
      {
        dataCreateTime: '2023-08-15 09:22:45',
        dataUpdateTime: '2023-08-15 09:22:45',
        dataDelFlag: 0,
        id: '272',
        itemCode: 'smoke',
        dictCode: 'ZNZC-AI-EVENTTYPE',
        itemValue: 15,
        itemDesc: '烟',
        itemOrder: 0
      },
      {
        dataCreateTime: '2023-08-15 09:22:45',
        dataUpdateTime: '2023-08-15 09:22:45',
        dataDelFlag: 0,
        id: '273',
        itemCode: 'snow',
        dictCode: 'ZNZC-AI-EVENTTYPE',
        itemValue: 14,
        itemDesc: '雪',
        itemOrder: 0
      },
      {
        dataCreateTime: '2023-08-15 09:22:45',
        dataUpdateTime: '2023-08-15 09:22:45',
        dataDelFlag: 0,
        id: '350',
        itemCode: 'tunnel_power_outage',
        dictCode: 'ZNZC-AI-EVENTTYPE',
        itemValue: 10,
        itemDesc: '隧道停电',
        itemOrder: 0
      },
      {
        dataCreateTime: '2023-08-15 09:22:45',
        dataUpdateTime: '2024-05-06 16:14:40',
        dataDelFlag: 0,
        id: '362',
        itemCode: 'vehi_accident',
        dictCode: 'ZNZC-AI-EVENTTYPE',
        itemValue: 5,
        itemDesc: '交通事故（以多车违停来定义）',
        itemOrder: 0
      },
      {
        dataCreateTime: '2023-08-15 09:22:45',
        dataUpdateTime: '2023-08-15 09:22:45',
        dataDelFlag: 0,
        id: '363',
        itemCode: 'vehi_converse',
        dictCode: 'ZNZC-AI-EVENTTYPE',
        itemValue: 3,
        itemDesc: '逆⾏',
        itemOrder: 0
      },
      {
        dataCreateTime: '2023-08-15 09:22:45',
        dataUpdateTime: '2023-12-28 16:54:52',
        dataDelFlag: 0,
        id: '365',
        itemCode: 'vehi_day_congestion',
        dictCode: 'ZNZC-AI-EVENTTYPE',
        itemValue: 6,
        itemDesc: '大流量',
        itemOrder: 0
      },
      {
        dataCreateTime: '2023-08-15 09:22:45',
        dataUpdateTime: '2023-08-15 09:22:45',
        dataDelFlag: 0,
        id: '366',
        itemCode: 'vehi_day_congestion_clear',
        dictCode: 'ZNZC-AI-EVENTTYPE',
        itemValue: 16,
        itemDesc: '⽇间拥堵消失',
        itemOrder: 0
      },
      {
        dataCreateTime: '2023-08-15 09:22:45',
        dataUpdateTime: '2023-08-15 09:22:45',
        dataDelFlag: 0,
        id: '368',
        itemCode: 'vehi_mutil_slow',
        dictCode: 'ZNZC-AI-EVENTTYPE',
        itemValue: 18,
        itemDesc: '多⻋缓⾏',
        itemOrder: 0
      },
      {
        dataCreateTime: '2023-08-15 09:22:45',
        dataUpdateTime: '2023-08-15 09:22:45',
        dataDelFlag: 0,
        id: '369',
        itemCode: 'vehi_mutil_slow_clear',
        dictCode: 'ZNZC-AI-EVENTTYPE',
        itemValue: 19,
        itemDesc: '多⻋缓⾏消失',
        itemOrder: 0
      },
      {
        dataCreateTime: '2023-08-15 09:22:45',
        dataUpdateTime: '2023-08-15 09:22:45',
        dataDelFlag: 0,
        id: '370',
        itemCode: 'vehi_night_congestion',
        dictCode: 'ZNZC-AI-EVENTTYPE',
        itemValue: 7,
        itemDesc: '夜间拥堵',
        itemOrder: 0
      },
      {
        dataCreateTime: '2023-08-15 09:22:45',
        dataUpdateTime: '2023-08-15 09:22:45',
        dataDelFlag: 0,
        id: '371',
        itemCode: 'vehi_night_congestion_clear',
        dictCode: 'ZNZC-AI-EVENTTYPE',
        itemValue: 17,
        itemDesc: '夜间拥堵消失',
        itemOrder: 0
      },
      {
        dataCreateTime: '2023-08-15 09:22:45',
        dataUpdateTime: '2023-08-15 09:22:45',
        dataDelFlag: 0,
        id: '372',
        itemCode: 'vehi_nmve_accident',
        dictCode: 'ZNZC-AI-EVENTTYPE',
        itemValue: 26,
        itemDesc: '事故（机动⻋和⾮机动⻋违停）',
        itemOrder: 0
      },
      {
        dataCreateTime: '2023-08-15 09:22:45',
        dataUpdateTime: '2023-08-15 09:22:45',
        dataDelFlag: 0,
        id: '374',
        itemCode: 'vehi_reverse',
        dictCode: 'ZNZC-AI-EVENTTYPE',
        itemValue: 4,
        itemDesc: '倒车',
        itemOrder: 0
      },
      {
        dataCreateTime: '2023-08-15 09:22:45',
        dataUpdateTime: '2023-08-15 09:22:45',
        dataDelFlag: 0,
        id: '375',
        itemCode: 'vehi_slow_pass',
        dictCode: 'ZNZC-AI-EVENTTYPE',
        itemValue: 2,
        itemDesc: '单⻋慢速经过',
        itemOrder: 0
      },
      {
        dataCreateTime: '2023-08-15 09:22:45',
        dataUpdateTime: '2023-08-15 09:22:45',
        dataDelFlag: 0,
        id: '376',
        itemCode: 'vehi_stop',
        dictCode: 'ZNZC-AI-EVENTTYPE',
        itemValue: 1,
        itemDesc: '停驶',
        itemOrder: 0
      },
      {
        dataCreateTime: '2023-08-15 09:22:45',
        dataUpdateTime: '2023-08-15 09:22:45',
        dataDelFlag: 0,
        id: '406',
        itemCode: 'wind',
        dictCode: 'ZNZC-AI-EVENTTYPE',
        itemValue: 11,
        itemDesc: '风',
        itemOrder: 0
      },
      {
        dataCreateTime: '2023-08-15 09:22:45',
        dataUpdateTime: '2023-08-15 09:22:45',
        dataDelFlag: 0,
        id: '407',
        itemCode: 'without_helmet',
        dictCode: 'ZNZC-AI-EVENTTYPE',
        itemValue: 24,
        itemDesc: '未戴头盔',
        itemOrder: 0
      },
      {
        dataCreateTime: '2023-12-28 17:00:36',
        dataUpdateTime: '2023-12-28 17:00:36',
        dataDelFlag: 0,
        id: '455',
        itemCode: 'construction',
        dictCode: 'ZNZC-AI-EVENTTYPE',
        itemValue: 14,
        itemDesc: '施工养护',
        itemOrder: 0
      },
      {
        dataCreateTime: '2023-09-28 20:52:09',
        dataUpdateTime: '2023-12-28 16:55:47',
        dataDelFlag: 0,
        id: '9',
        itemCode: 'abnormal_toss',
        dictCode: 'ZNZC-AI-EVENTTYPE',
        itemValue: 1,
        itemDesc: '障碍物',
        itemOrder: 1
      },
      {
        dataCreateTime: '2023-09-28 20:52:09',
        dataUpdateTime: '2023-09-28 20:52:09',
        dataDelFlag: 0,
        id: '191',
        itemCode: 'motorcycle',
        dictCode: 'ZNZC-AI-EVENTTYPE',
        itemValue: 5,
        itemDesc: '摩托⻋',
        itemOrder: 5
      },
      {
        dataCreateTime: '2023-09-28 20:52:09',
        dataUpdateTime: '2023-12-28 16:53:16',
        dataDelFlag: 0,
        id: '373',
        itemCode: 'vehi_rescue',
        dictCode: 'ZNZC-AI-EVENTTYPE',
        itemValue: 12,
        itemDesc: '车辆故障',
        itemOrder: 12
      },
      {
        dataCreateTime: '2023-09-28 20:52:09',
        dataUpdateTime: '2023-09-28 20:52:09',
        dataDelFlag: 0,
        id: '23',
        itemCode: 'bad_weather',
        dictCode: 'ZNZC-AI-EVENTTYPE',
        itemValue: 13,
        itemDesc: '恶劣天气',
        itemOrder: 13
      },
      {
        dataCreateTime: '2023-09-28 20:52:09',
        dataUpdateTime: '2023-09-28 20:52:09',
        dataDelFlag: 0,
        id: '364',
        itemCode: 'vehi_dangerous',
        dictCode: 'ZNZC-AI-EVENTTYPE',
        itemValue: 16,
        itemDesc: '危化品车辆闯入',
        itemOrder: 16
      },
      {
        dataCreateTime: '2023-08-15 09:22:45',
        dataUpdateTime: '2023-08-15 09:22:45',
        dataDelFlag: 0,
        id: '248',
        itemCode: 'road_temp_humidity',
        dictCode: 'ZNZC-AI-EVENTTYPE',
        itemValue: 33,
        itemDesc: '路面温湿度',
        itemOrder: 33
      },
      {
        dataCreateTime: '2023-08-15 09:22:45',
        dataUpdateTime: '2023-08-15 09:22:45',
        dataDelFlag: 0,
        id: '392',
        itemCode: 'visibility',
        dictCode: 'ZNZC-AI-EVENTTYPE',
        itemValue: 34,
        itemDesc: '能见度',
        itemOrder: 34
      },
      {
        dataCreateTime: '2025-01-06 15:18:29',
        dataUpdateTime: '2025-01-06 15:18:29',
        dataDelFlag: 0,
        id: '652',
        itemCode: 'temperature_low',
        dictCode: 'ZNZC-AI-EVENTTYPE',
        itemValue: 35,
        itemDesc: '低温预警',
        itemOrder: 35
      },
      {
        dataCreateTime: '2025-03-17 22:15:45',
        dataUpdateTime: '2025-03-17 22:15:45',
        dataDelFlag: 0,
        id: '656',
        itemCode: 'dzzh',
        dictCode: 'ZNZC-AI-EVENTTYPE',
        itemValue: 36,
        itemDesc: '地质灾害',
        itemOrder: 36
      },
      {
        dataCreateTime: '2025-03-25 09:53:36',
        dataUpdateTime: '2025-03-25 09:53:36',
        dataDelFlag: 0,
        id: '660',
        itemCode: 'bridge',
        dictCode: 'ZNZC-AI-EVENTTYPE',
        itemValue: 37,
        itemDesc: '桥梁',
        itemOrder: 37
      },
      {
        dataCreateTime: '2025-03-25 09:54:04',
        dataUpdateTime: '2025-03-25 09:54:04',
        dataDelFlag: 0,
        id: '661',
        itemCode: 'carrier',
        dictCode: 'ZNZC-AI-EVENTTYPE',
        itemValue: 38,
        itemDesc: '边坡',
        itemOrder: 38
      },
      {
        dataCreateTime: '2025-03-25 09:59:43',
        dataUpdateTime: '2025-03-25 09:59:43',
        dataDelFlag: 0,
        id: '662',
        itemCode: 'road',
        dictCode: 'ZNZC-AI-EVENTTYPE',
        itemValue: 39,
        itemDesc: '道路',
        itemOrder: 39
      }
    ],
    'SOURCE-TYPE': [
      {
        dataCreateTime: '2023-08-15 09:22:45',
        dataUpdateTime: '2023-08-15 09:22:45',
        dataDelFlag: 0,
        id: '241',
        itemCode: 'road',
        dictCode: 'SOURCE-TYPE',
        itemValue: 20,
        itemDesc: '路线',
        itemOrder: 0
      },
      {
        dataCreateTime: '2023-08-15 09:22:45',
        dataUpdateTime: '2023-08-15 09:22:45',
        dataDelFlag: 0,
        id: '186',
        itemCode: 'mileage',
        dictCode: 'SOURCE-TYPE',
        itemValue: 1,
        itemDesc: '桩号',
        itemOrder: 1
      },
      {
        dataCreateTime: '2023-08-15 09:22:45',
        dataUpdateTime: '2023-08-15 09:22:45',
        dataDelFlag: 0,
        id: '286',
        itemCode: 'station',
        dictCode: 'SOURCE-TYPE',
        itemValue: 4,
        itemDesc: '收费站',
        itemOrder: 4
      },
      {
        dataCreateTime: '2023-09-28 20:52:09',
        dataUpdateTime: '2023-09-28 20:52:09',
        dataDelFlag: 0,
        id: '291',
        itemCode: 'svca',
        dictCode: 'SOURCE-TYPE',
        itemValue: 5,
        itemDesc: '服务区',
        itemOrder: 5
      },
      {
        dataCreateTime: '2023-08-15 09:22:45',
        dataUpdateTime: '2023-08-15 09:22:45',
        dataDelFlag: 0,
        id: '44',
        itemCode: 'camera',
        dictCode: 'SOURCE-TYPE',
        itemValue: 6,
        itemDesc: '摄像机',
        itemOrder: 6
      },
      {
        dataCreateTime: '2023-08-15 09:22:45',
        dataUpdateTime: '2023-08-15 09:22:45',
        dataDelFlag: 0,
        id: '143',
        itemCode: 'infoBoard',
        dictCode: 'SOURCE-TYPE',
        itemValue: 7,
        itemDesc: '情报板',
        itemOrder: 7
      },
      {
        dataCreateTime: '2023-08-15 09:22:45',
        dataUpdateTime: '2023-11-16 00:00:53',
        dataDelFlag: 0,
        id: '110',
        itemCode: 'each',
        dictCode: 'SOURCE-TYPE',
        itemValue: 3,
        itemDesc: '枢纽',
        itemOrder: 8
      }
    ],
    'ZNZC-LEVEL': [
      {
        dataCreateTime: '2023-08-15 09:22:45',
        dataUpdateTime: '2023-08-15 09:22:45',
        dataDelFlag: 0,
        id: '437',
        itemCode: 'ZNZC-LEVEL-1',
        dictCode: 'ZNZC-LEVEL',
        itemValue: 1,
        itemDesc: '一级',
        itemOrder: 0
      },
      {
        dataCreateTime: '2023-08-15 09:22:45',
        dataUpdateTime: '2023-08-15 09:22:45',
        dataDelFlag: 0,
        id: '438',
        itemCode: 'ZNZC-LEVEL-2',
        dictCode: 'ZNZC-LEVEL',
        itemValue: 2,
        itemDesc: '二级',
        itemOrder: 0
      }
    ],
    DIRECTION: [
      {
        dataCreateTime: '2023-08-15 09:22:45',
        dataUpdateTime: '2023-08-15 09:22:45',
        dataDelFlag: 0,
        id: '360',
        itemCode: 'UP',
        dictCode: 'DIRECTION',
        itemValue: 1,
        itemDesc: '上行',
        itemOrder: 1
      },
      {
        dataCreateTime: '2023-08-15 09:22:45',
        dataUpdateTime: '2023-08-15 09:22:45',
        dataDelFlag: 0,
        id: '105',
        itemCode: 'DOWN',
        dictCode: 'DIRECTION',
        itemValue: 2,
        itemDesc: '下行',
        itemOrder: 2
      },
      {
        dataCreateTime: '2023-08-15 09:22:45',
        dataUpdateTime: '2023-08-15 09:22:45',
        dataDelFlag: 0,
        id: '354',
        itemCode: 'TwoWay',
        dictCode: 'DIRECTION',
        itemValue: 3,
        itemDesc: '双向',
        itemOrder: 3
      }
    ],
    'ZNZC-SJLY': [
      {
        dataCreateTime: '2023-08-15 09:22:45',
        dataUpdateTime: '2025-01-06 14:50:32',
        dataDelFlag: 0,
        id: '417',
        itemCode: 'XTSB-XCX',
        dictCode: 'ZNZC-SJLY',
        itemValue: 31,
        itemDesc: '湘高路况协同',
        itemOrder: 1
      },
      {
        dataCreateTime: '2025-04-24 17:41:28',
        dataUpdateTime: '2025-04-24 17:41:28',
        dataDelFlag: 0,
        id: '687',
        itemCode: 'caiyun',
        dictCode: 'ZNZC-SJLY',
        itemValue: 9,
        itemDesc: '彩云天气',
        itemOrder: 1
      },
      {
        dataCreateTime: '2023-08-15 09:22:45',
        dataUpdateTime: '2023-08-15 09:22:45',
        dataDelFlag: 0,
        id: '390',
        itemCode: 'vid_zlkj_test',
        dictCode: 'ZNZC-SJLY',
        itemValue: 11,
        itemDesc: '张力科技',
        itemOrder: 2
      },
      {
        dataCreateTime: '2023-09-28 20:52:09',
        dataUpdateTime: '2023-09-28 20:52:09',
        dataDelFlag: 0,
        id: '391',
        itemCode: 'vid_zlkj_test1',
        dictCode: 'ZNZC-SJLY',
        itemValue: 11,
        itemDesc: '张力科技',
        itemOrder: 2
      },
      {
        dataCreateTime: '2023-08-15 09:22:45',
        dataUpdateTime: '2025-01-03 15:27:25',
        dataDelFlag: 0,
        id: '161',
        itemCode: 'JTTS-BDLK',
        dictCode: 'ZNZC-SJLY',
        itemValue: 21,
        itemDesc: '高德路况',
        itemOrder: 3
      },
      {
        dataCreateTime: '2023-08-15 09:22:45',
        dataUpdateTime: '2023-08-15 09:22:45',
        dataDelFlag: 0,
        id: '413',
        itemCode: 'XTSB-GZ-NJY',
        dictCode: 'ZNZC-SJLY',
        itemValue: 32,
        itemDesc: '宁靖盐二维码',
        itemOrder: 4
      },
      {
        dataCreateTime: '2023-08-15 09:22:45',
        dataUpdateTime: '2023-08-15 09:22:45',
        dataDelFlag: 0,
        id: '416',
        itemCode: 'XTSB-LC-YH',
        dictCode: 'ZNZC-SJLY',
        itemValue: 33,
        itemDesc: '养护',
        itemOrder: 5
      },
      {
        dataCreateTime: '2023-08-15 09:22:45',
        dataUpdateTime: '2023-08-15 09:22:45',
        dataDelFlag: 0,
        id: '415',
        itemCode: 'XTSB-JJ',
        dictCode: 'ZNZC-SJLY',
        itemValue: 34,
        itemDesc: '交警',
        itemOrder: 6
      },
      {
        dataCreateTime: '2023-08-15 09:22:45',
        dataUpdateTime: '2023-08-15 09:22:45',
        dataDelFlag: 0,
        id: '389',
        itemCode: 'vid_hkkj_test',
        dictCode: 'ZNZC-SJLY',
        itemValue: 12,
        itemDesc: '海康科技',
        itemOrder: 7
      },
      {
        dataCreateTime: '2023-09-28 20:52:09',
        dataUpdateTime: '2025-01-06 10:06:36',
        dataDelFlag: 0,
        id: '412',
        itemCode: 'XTSB-AI',
        dictCode: 'ZNZC-SJLY',
        itemValue: 7,
        itemDesc: '事件检测',
        itemOrder: 7
      },
      {
        dataCreateTime: '2023-08-15 09:22:45',
        dataUpdateTime: '2023-08-15 09:22:45',
        dataDelFlag: 0,
        id: '37',
        itemCode: 'bridge-detection',
        dictCode: 'ZNZC-SJLY',
        itemValue: 81,
        itemDesc: '桥梁健康监测系统',
        itemOrder: 8
      },
      {
        dataCreateTime: '2023-09-28 20:52:09',
        dataUpdateTime: '2023-12-07 14:49:08',
        dataDelFlag: 0,
        id: '162',
        itemCode: 'JTTS-SYS',
        dictCode: 'ZNZC-SJLY',
        itemValue: 22,
        itemDesc: '仿真算法模型',
        itemOrder: 8
      },
      {
        dataCreateTime: '2023-08-15 09:22:45',
        dataUpdateTime: '2023-08-15 09:22:45',
        dataDelFlag: 0,
        id: '159',
        itemCode: 'JQGX-XZJJ',
        dictCode: 'ZNZC-SJLY',
        itemValue: 91,
        itemDesc: '徐州交警',
        itemOrder: 9
      },
      {
        dataCreateTime: '2023-10-27 21:47:49',
        dataUpdateTime: '2023-10-27 21:47:49',
        dataDelFlag: 0,
        id: '414',
        itemCode: 'XTSB-GZH',
        dictCode: 'ZNZC-SJLY',
        itemValue: 40,
        itemDesc: '公众号',
        itemOrder: 9
      },
      {
        dataCreateTime: '2024-09-19 21:54:36',
        dataUpdateTime: '2024-09-19 21:54:36',
        dataDelFlag: 0,
        id: '513',
        itemCode: 'GAODE',
        dictCode: 'ZNZC-SJLY',
        itemValue: 28,
        itemDesc: '高德一键救援',
        itemOrder: 28
      },
      {
        dataCreateTime: '2023-12-28 17:15:20',
        dataUpdateTime: '2023-12-28 17:15:20',
        dataDelFlag: 0,
        id: '456',
        itemCode: 'obstacle',
        dictCode: 'ZNZC-SJLY',
        itemValue: 35,
        itemDesc: '障碍物',
        itemOrder: 35
      },
      {
        dataCreateTime: '2024-05-14 16:27:52',
        dataUpdateTime: '2024-05-14 16:27:52',
        dataDelFlag: 0,
        id: '477',
        itemCode: 'XTSB-YH',
        dictCode: 'ZNZC-SJLY',
        itemValue: 36,
        itemDesc: '养护运维',
        itemOrder: 36
      },
      {
        dataCreateTime: '2024-11-23 11:11:12',
        dataUpdateTime: '2024-11-23 11:11:12',
        dataDelFlag: 0,
        id: '528',
        itemCode: 'radar-collect',
        dictCode: 'ZNZC-SJLY',
        itemValue: 37,
        itemDesc: '雷达采集上报',
        itemOrder: 37
      },
      {
        dataCreateTime: '2025-01-06 15:07:18',
        dataUpdateTime: '2025-01-06 15:07:18',
        dataDelFlag: 0,
        id: '651',
        itemCode: 'wdy',
        dictCode: 'ZNZC-SJLY',
        itemValue: 38,
        itemDesc: '温度仪',
        itemOrder: 38
      }
    ],
    'ZNZC-CONGESTION': [
      {
        dataCreateTime: '2023-08-15 09:22:45',
        dataUpdateTime: '2023-08-15 09:22:45',
        dataDelFlag: 0,
        id: '980',
        itemCode: 'ZNZC-CONGESTION-2',
        dictCode: 'ZNZC-CONGESTION',
        itemValue: 2,
        itemDesc: '车流量大',
        itemOrder: 0
      },
      {
        dataCreateTime: '2023-08-15 09:22:45',
        dataUpdateTime: '2023-08-15 09:22:45',
        dataDelFlag: 0,
        id: '981',
        itemCode: 'ZNZC-CONGESTION-3',
        dictCode: 'ZNZC-CONGESTION',
        itemValue: 3,
        itemDesc: '交通管制',
        itemOrder: 0
      },
      {
        dataCreateTime: '2023-08-15 09:22:45',
        dataUpdateTime: '2023-08-15 09:22:45',
        dataDelFlag: 0,
        id: '982',
        itemCode: 'ZNZC-CONGESTION-4',
        dictCode: 'ZNZC-CONGESTION',
        itemValue: 4,
        itemDesc: '施工养护',
        itemOrder: 0
      },
      {
        dataCreateTime: '2023-08-15 09:22:45',
        dataUpdateTime: '2023-08-15 09:22:45',
        dataDelFlag: 0,
        id: '983',
        itemCode: 'ZNZC-CONGESTION-5',
        dictCode: 'ZNZC-CONGESTION',
        itemValue: 5,
        itemDesc: '其他集体性事件',
        itemOrder: 0
      },
      {
        dataCreateTime: '2023-08-15 09:22:45',
        dataUpdateTime: '2023-08-15 09:22:45',
        dataDelFlag: 0,
        id: '984',
        itemCode: 'ZNZC-CONGESTION-JTSG',
        dictCode: 'ZNZC-CONGESTION',
        itemValue: 1,
        itemDesc: '交通事故',
        itemOrder: 0
      }
    ]
  }
  // let dict = []
  // if (dictList && dictList[type] !== undefined) {
  //   dict = dictList[type]
  //   console.log('111111116781', dict)
  // }

  // if (val !== undefined) {
  //   // itemCode是Number，itemValue是String
  //   // eslint-disable-next-line eqeqeq
  //   const index = dict.findIndex((i) => i['itemValue'] == val || i['itemCode'] == val)
  //   return index > -1 ? dict[index][callbackKey] : notext
  // } else {
  //   return dict
  // }
  // 获取对应类型的字典列表
  // const dictList = dictMap[type] || []

  // // 如果未传val，返回整个字典列表
  // if (val === undefined) {
  //   return dictList
  // }
  // // 查找匹配的字典项
  // const foundItem = dictList.find(
  //   (item) =>
  //     item.itemValue == val || // 兼容ZNZC-CONGESTION字符串和数字
  //     item.itemCode == val,
  // )

  // console.log('查找结果:', { type, val, foundItem })

  // return foundItem ? foundItem[callbackKey] : notext
  // 获取对应类型的字典列表
  const dictList = dictMap[type] || []

  // 如果不传val，返回排序后的整个字典列表（用于下拉框）
  if (val === undefined) {
    // 添加稳定性排序：先按itemOrder，再按itemValue
    const sortedList = [...dictList].sort((a, b) => {
      const orderDiff = (a.itemOrder || 0) - (b.itemOrder || 0)
      return orderDiff !== 0 ? orderDiff : a.itemValue - b.itemValue
    })
    return sortedList
  }

  // 查找匹配项
  const foundItem = dictList.find(
    (item) =>
      item.itemValue == val || // 匹配值
      item.itemCode == val // 或匹配代码
  )

  // 返回结果
  const result = foundItem ? foundItem[callbackKey] : notext
  return result
}

/**
 * 事件类型配置
 * key：自定义事件类型 - 具体的事件类型 （根据事件类型分类来定义自定义事件类型）
 * eventAttribute: 事件性质    1突发性 2计划性
 * eventType: 事件类型分类 - 值
 * eventTypeCharacter：事件类型分类 - 字符标识
 * roadType: 路网类型 1 GW-高速公路     2 AW-普通公路
 * routeName: 路由名
 * color：事件主色
 * iconName：事件图标名
 */
export const eventTypeConfig = [
  {
    key: 'ALL', // 仅做展示用
    value: '全部',
    roadType: 1,
    color: '#1172EA',
    iconName: 'all'
  },
  {
    key: 'TAB1',
    eventType: 1,
    eventTypeCharacter: 'TA',
    eventAttribute: 1,
    eventNature: 1,
    value: '事故灾害',
    roadType: 1,
    icon: 'zhdd-gs-jtsg',
    routeName: 'TAB1',
    color: '#EF4821',
    iconName: 'accident'
  },
  {
    key: 'TAB2',
    eventType: 1,
    eventTypeCharacter: 'TA',
    eventAttribute: 1,
    eventNature: 1,
    value: '车辆故障',
    roadType: 1,
    icon: 'zhdd-gs-clgz',
    routeName: 'TAB2',
    color: '#F69129',
    iconName: 'vehicle-fault'
  },
  // {
  //   key: 'JEB1',
  //   eventType: 3,
  //   eventTypeCharacter: 'JE',
  //   eventAttribute: 2,
  //   value: '施工养护',
  //   roadType: 1,
  //   icon: 'zhdd-gs-sgyh',
  //   routeName: 'JEB1',
  //   color: '#0DACD3',
  //   iconName: 'construction',
  //   isLine: true,
  //   isPlan: true
  // },
  {
    key: 'TBB1',
    eventType: 1,
    eventTypeCharacter: 'TB',
    eventAttribute: 1,
    eventNature: 1,
    value: '气象灾害',
    roadType: 1,
    icon: 'zhdd-gs-eltq',
    routeName: 'TBB1',
    color: '#17CAD1',
    iconName: 'bad-weather'
    // isLine: true,
    // isPlan: true
  },
  {
    key: 'TDB2',
    eventType: 1,
    eventTypeCharacter: 'TD',
    eventAttribute: 1,
    eventNature: 1,
    value: '障碍物',
    roadType: 1,
    icon: 'zhdd-gs-zaw',
    routeName: 'TDB2',
    color: '#F6B80D',
    iconName: 'obstacle'
  },
  {
    key: 'TDB1',
    eventType: 1,
    eventTypeCharacter: 'TD',
    eventAttribute: 1,
    eventNature: 1,
    value: '流量大',
    roadType: 1,
    icon: 'zhdd-gs-dll',
    routeName: 'TDB1',
    color: '#117BEE',
    iconName: 'large-flow'
    // isLine: true,
    // isPlan: true
  },
  {
    key: 'TCB1',
    eventType: 1,
    eventTypeCharacter: 'TC',
    eventAttribute: 1,
    eventNature: 1,
    value: '地质灾害',
    roadType: 1,
    icon: 'zhdd-gs-dzzh',
    routeName: 'TCB1',
    color: '#C88647',
    iconName: 'geologic-hazard'
  }
  // {
  //   key: 'JGB1',
  //   eventType: 7,
  //   eventTypeCharacter: 'JG',
  //   eventAttribute: 2,
  //   value: '其他',
  //   roadType: 1,
  //   icon: 'zhdd-gs-qt',
  //   routeName: 'JGB1',
  //   color: '#45A3A2',
  //   iconName: 'sudden-other',
  //   isLine: true
  // }
]

/**
 * 告警类型配置
 * key 唯一标识
 * eventType 对应的事件类型
 */
export const alarmTypeConfig = [
  { key: 'vehi_accident', name: '事故灾害', eventType: 'TAB1' },
  { key: 'vehi_rescue', name: '车辆故障', eventType: 'TAB2' },
  { key: 'bad_weather', name: '气象灾害', eventType: 'TBB1' },
  { key: 'construction', name: '施工养护', eventType: 'JEB1' },
  { key: 'vehi_day_congestion', name: '车流量大', eventType: 'TDB1' },
  { key: 'abnormal_toss', name: '障碍物', eventType: 'TDB2' },
  { key: 'other', name: '其他', eventType: 'JGB1' }
]

/** *
 * @desc    智能侦测配置信息
 * @author  朱琦
 * @date    2023/12/14
 *
 * ***/
export function dateFormat(value, format = 'YYYY-MM-DD HH:mm:ss') {
  return value ? dayjs(value).format(format) : ''
}

/**
 * 智能侦测信息确认   同apifox 确认类型
 * @type {number}
 */
export const confirmType = 1 // 确认
export const connectType = 2 // 关联
export const misstateType = 3 // 误报
export const ignoreType = 4 // 已读

const jttsDetailConfig = [
  {
    label: '预警级别',
    key: 'detectionLevelText'
  },
  { label: '拥堵程度', key: 'congestionLevel' },
  { label: '位置', key: '_position' },
  {
    label: '拥堵长度',
    render(record) {
      return record.congestionMileage + 'm' || ''
    }
  }
]

/**
 * 根据字典值 查询对应字典数组 返回该字典值子对象数据
 * @param {String} type 字典类型 只传type返回该字典类型数组
 * @param {String} val 键值 根据键值查询对应的字典值
 * @param {String} valKey 传入值所属的key， 通过这个key查询字典
 * @returns
 */
export function getDictItem(type, val, valKey = 'itemValue') {
  const dict = getDict(type)
  // eslint-disable-next-line eqeqeq
  const index = dict.findIndex((i) => i[valKey] == val)
  return index > -1 ? dict[index] : {}
}

/**
 * 智能侦测配置项
 * qsCode 唯一标识 匹配qs
 * fetchPrefix  请求url前缀
 * icon svg图标名
 * type 智能侦测类型类型-信息来源
 * mapLayerType 地图图层类型 line 线 point 点
 * reloadList 是否重新加载列表，默认不加载
 * hasDetail 是否有详情，默认有详情，为false时无详情
 * @param {Array} detailList
 * @param {String} detailList[0].key 必要，唯一标识，可用于详情检索路径
 * @param {String} detailList[0].type 详情类型，默认不填为文本。img 图片，  downFile 下载文件列表， roadInfo 占道信息
 * @param {String} detailList[0].label 详情列表 一般的文本都是此处处理
 * @param {String} detailList[0].render 详情列表 如果有render函数 render优先级大于key
 */
export const intelligentConfig = [
  // AI平方 调度
  {
    fetchPrefix: 'ai-square', // 请求url前缀
    prefixUrl: 'forecast-forewarning-info', // 微码的url前缀
    qsCode: 'MENU:AIPF', // qscode 动态渲染tab匹配字段
    sourceId: 'source1',
    icon: 'aijc-car', // 智能侦测图标
    mapLayerType: 'point',
    type: 24, // 智能侦测类型类型
    rowOperatesText: '核实', // 行操作文本  核实,已读,误报都是一个函数 通过字符串判断执行什么
    detailConfig: ['intelligent-detail'], // 是否有详情
    staticDetail: false, // 是否是静态详情   即通过列表作为详情
    fileSwiper: true, // 是否是文件轮播
    operates: [
      // 详情底部操作按钮  通过operateType 判断执行什么函数   关联事件没有 operateType   同apifox 确认类型(1:确认;2:误报;3:已读;)
      { value: '确认事件', key: 'confirm', operateType: confirmType, qsCode: 'CONVERT' },
      { value: '关联事件', key: 'connect', qsCode: 'RELEVANCE' },
      { value: '误报', key: 'misstate', operateType: misstateType, qsCode: 'FAULT' },
      { value: '已读', key: 'ignore', operateType: ignoreType, qsCode: 'IGNORE' }
    ],
    // 详情列表 一般的文本都是此处处理   [key]  详情检索路径， 如有render函数  render优先级大于key
    detailList: [
      {
        label: '报警类型',
        key: 'alarmTypeText'
      },
      {
        label: '报警时间',
        render(record) {
          return dateFormat(record.detectionTime)
        }
      },
      {
        label: '预警级别',
        key: 'detectionLevelText'
      },
      {
        label: '事件位置',
        key: '_position',
        render(record) {
          return `${record.roadNum || ''}${record.roadName || ''} ${getZhText(record.startStake)}`
        }
      },
      {
        label: '数据来源',
        key: 'sourceText'
      }
    ],
    // 详情表单配置
    detailFormConfig: {
      remark: true
    },
    defultTranformEventType: 'TAB2'
  },

  // AI监测
  {
    fetchPrefix: 'ai-monitor', // 请求url前缀
    prefixUrl: '', // 微码的url前缀
    qsCode: 'MENU:AIJC', // qscode 动态渲染tab匹配字段
    sourceId: '',
    icon: 'aijc-car', // 智能侦测图标
    mapLayerType: 'point',
    type: 21, // 智能侦测类型类型
    rowOperatesText: '核实', // 行操作文本  核实,已读,误报都是一个函数 通过字符串判断执行什么
    detailConfig: ['intelligent-detail'], // 是否有详情
    staticDetail: false, // 是否是静态详情   即通过列表作为详情
    fileSwiper: true, // 是否是文件轮播
    operates: [
      // 详情底部操作按钮  通过operateType 判断执行什么函数   关联事件没有 operateType   同apifox 确认类型(1:确认;2:误报;3:已读;)
      { value: '确认事件', key: 'confirm', operateType: confirmType, qsCode: 'CONVERT' },
      { value: '关联事件', key: 'connect', qsCode: 'RELEVANCE' },
      { value: '误报', key: 'misstate', operateType: misstateType, qsCode: 'FAULT' },
      { value: '已读', key: 'ignore', operateType: ignoreType, qsCode: 'IGNORE' }
    ],
    // 详情列表 一般的文本都是此处处理   [key]  详情检索路径， 如有render函数  render优先级大于key
    detailList: [
      {
        label: '告警类型',
        key: 'alarmTypeText'
      },
      {
        label: '告警时间',
        render(record) {
          return dateFormat(record.detectionTime)
        }
      },
      {
        label: '预警级别',
        key: 'detectionLevel'
      },
      {
        label: '摄像机位置',
        key: '_position',
        render(record) {
          return `${record.roadNum || ''}${record.roadName || ''} ${getZhText(record.startStake)}`
        }
      },
      {
        label: '数据来源',
        key: 'sourceText'
      }
    ],
    // 详情表单配置
    detailFormConfig: {
      remark: true
    },
    defultTranformEventType: 'TAB2'
  },
  // 交通态势
  {
    fetchPrefix: 'traffic-situation',
    prefixUrl: 'traffic-detection', // 微码的url前缀
    qsCode: 'MENU:JTTS',
    sourceId: 'source2',
    detailConfig: ['intelligent-detail', 'congestion-details'],
    staticDetail: true,
    type: 22,
    rowOperatesText: '核实',
    mapLayerType: 'line',
    // 重载列表
    reloadList: true,

    operates: [
      { value: '确认事件', key: 'confirm', operateType: confirmType, qsCode: 'CONVERT' },
      { value: '关联事件', key: 'connect', qsCode: 'RELEVANCE' },
      { value: '误报', key: 'misstate', operateType: misstateType, qsCode: 'FAULT' },
      { value: '已读', key: 'ignore', operateType: ignoreType, qsCode: 'IGNORE' }
    ],
    // 默认预测数据
    detailList: [
      {
        label: '拥堵时间',
        render(record) {
          return dateFormat(record?.detectionTime) || dateFormat(record?.warningTime)
          // return record.source === 21
          //   ? record.startTime
          //   : `${record.detectionTime || ''}至${record.predictEndTime || ''}`
        }
      },
      ...jttsDetailConfig
    ],
    // 详情表单配置
    detailFormConfig: {
      remark: true,
      congestionCause: true
    },
    defultTranformEventType: 'TDB1'
  },
  // 协同上报
  {
    qsCode: 'MENU:XTSB',
    fetchPrefix: 'collaborative-reporting',
    prefixUrl: 'collaborative-reporting', // 微码的url前缀
    sourceId: 'source3',
    icon: 'xtsb-lu',
    detailConfig: ['intelligent-detail'],
    staticDetail: false,
    mapLayerType: 'point',
    type: 23,
    rowOperatesText: '核实',

    operates: [
      { value: '确认事件', key: 'confirm', operateType: confirmType, qsCode: 'CONVERT' },
      { value: '关联事件', key: 'connect', qsCode: 'RELEVANCE' },
      { value: '误报', key: 'misstate', operateType: misstateType, qsCode: 'FAULT' }
      // { value: '已读', key: 'ignore', operateType: ignoreType, qsCode: 'IGNORE' }
    ],
    detailList: [
      {
        label: '类型',
        key: 'alarmType'
      },
      {
        label: '时间',
        render(record) {
          return dateFormat(record.detectionTime)
        }
      },
      {
        label: '预警级别',
        key: 'detectionLevelText'
      },
      {
        label: '位置',
        render(record) {
          return record?.zhInfo || ''
        }
      },
      {
        label: '数据来源',
        key: 'source',
        render(record) {
          return getDict('ZNZC-SJLY', record.source, '') || ''
        }
      },
      {
        label: '当事人手机',
        key: 'partyPhone'
      },
      {
        label: '上报人手机',
        key: 'escPhone'
      },
      { label: '事件描述', key: 'desc' },
      { label: '相关图片', key: 'detailImg', type: 'img' }
    ],
    // 详情表单配置
    detailFormConfig: {
      remark: true
    }
  },
  // 相邻路段
  {
    qsCode: 'MENU:XLLD',
    sourceId: '',
    prefixUrl: '', // 微码的url前缀
    icon: 'xlld',
    fetchPrefix: 'adjacent-section',
    type: 24,
    rowOperatesText: '忽略',
    hasDetail: false
  },
  // 气象预警
  {
    qsCode: 'MENU:QXJC',
    sourceId: 'source4',
    fetchPrefix: 'weather',
    prefixUrl: 'weather-list', // 微码的url前缀
    type: 29,
    rowOperatesText: '核实',
    staticDetail: false,
    mapLayerType: 'point',
    detailConfig: ['intelligent-detail'],
    operates: [
      { value: '确认事件', key: 'confirm', operateType: confirmType, qsCode: 'CONVERT' },
      { value: '关联事件', key: 'connect', qsCode: 'RELEVANCE' },
      { value: '误报', key: 'misstate', operateType: misstateType, qsCode: 'FAULT' },
      { value: '已读', key: 'ignore', operateType: ignoreType, qsCode: 'IGNORE' }
    ],
    detailList: [
      { label: '告警时间', key: 'detectionTime' },

      {
        label: '预警类型',
        key: 'alarmTypeText'
      },
      {
        label: '告警来源',
        render(record) {
          return getDict('ZNZC-SJLY', record.source, '') || ''
        }
      },
      {
        label: '告警设备',
        key: 'zhInfo',
        render(record) {
          return `${record.roadNum || ''} ${record.roadName}`
        }
      },

      {
        label: '位置类型',
        key: 'locationType',
        render(record) {
          if (Number(record.source) === 9) {
            return `${record.roadNum || ''} ${record.zhInfo}${record.endKM ? '~' + record.endKM : ''}  `
          }
          return `${record.locationType || ''}`
        },
        show: (row, allData) => {
          if (Number(allData.source) === 9) {
            row.label = '路线位置'
          } else {
            row.label = '位置类型'
          }
          return true
        }
      },
      { label: '告警内容', key: 'described', type: 'describedCustom' },
      { label: '监测温度', key: 'temperature' }
    ],
    // 详情表单配置
    detailFormConfig: {
      remark: true
    },
    defultTranformEventType: 'TBB1'
  },
  // 重点车辆
  {
    qsCode: 'MENU:ZDCL',
    sourceId: '',
    prefixUrl: '', // 微码的url前缀
    type: 26,
    rowOperatesText: '核实',
    operates: [
      { value: '误报', key: 'misstate', operateType: misstateType, qsCode: 'FAULT' },
      { value: '已读', key: 'ignore', operateType: ignoreType, qsCode: 'IGNORE' }
    ],
    detailList: [
      { label: '类型', key: 'alarmTypeText' },
      { label: '时间', key: 'monitorTime' },
      { label: '预警级别', key: 'detectionLevel' },
      { label: '当前位置', key: 'hoverText' },
      { label: '当事人手机', key: 'partyPhone' },
      { label: '入口', key: 'entry' }
    ]
  },
  // 桥梁监测
  {
    qsCode: 'MENU:QLJK',
    sourceId: '',
    prefixUrl: '', // 微码的url前缀
    fetchPrefix: 'bridge-detection',
    detailConfig: ['intelligent-detail'],
    staticDetail: false,
    icon: 'qljk',
    mapLayerType: 'point',
    type: 27,
    rowOperatesText: '查看',
    operates: [{ value: '已读', key: 'ignore', operateType: ignoreType, qsCode: 'IGNORE' }],
    detailList: [
      { label: '告警时间', key: 'detectionTime' },
      { label: '告警类型', key: 'alarmTypeText' },
      { label: '预警级别', key: 'eventLevel' },
      { label: '告警级别', key: 'maxLevel' },
      { label: '桥梁编码', key: 'bridgeCode' },
      { label: '桥梁名称', key: 'bridgeName' },
      { label: '路线编码', key: 'roadNum' },
      { label: '中心桩号', key: 'zxzh' },
      { label: '桥梁分类', key: 'bridgeType' },
      { label: '技术状况', key: 'technologyStatus' },
      { label: '异常情况', key: 'description' },
      {
        label: '具体信息',
        render(record) {
          let list = []
          if (record.bridgeDetectionType === 1 && record.pointAlarmList) {
            // 结构告警
            list = record.pointAlarmList.map((item, index) => {
              return `${index + 1}.${dateFormat(item.alarmTime)} ${item.position}${item.monitorItemTypeName}${
                item.monitorValue
              }${item.reason}`
            })
          } else if (record.bridgeDetectionType === 2 && record.loadCarAlarmList) {
            // 车载报警
            list = record.loadCarAlarmList.map((item, index) => {
              return `${index + 1}.${dateFormat(item.acTime)} ${item.alarmLevel}级告警，第${item.laneNo}车道${
                item.axleNumber
              }轴车，车重${item.weight}kg超重${item.overWeight}kg`
            })
          }
          return list.join('</br>')
        },
        style: {
          'text-align': 'left'
        }
      }
    ]
  },
  // 第三方
  {
    qsCode: 'MENU:DSF',
    sourceId: '',
    prefixUrl: '', // 微码的url前缀
    fetchPrefix: 'third',
    icon: 'dsf',
    type: 29,
    detailConfig: ['intelligent-detail'],
    staticDetail: false,
    mapLayerType: 'point',
    rowOperatesText: '核实', // 行操作文本  核实,已读,误报都是一个函数 通过字符串判断执行什么

    operates: [
      // 详情底部操作按钮  通过operateType 判断执行什么函数   关联事件没有 operateType   同apifox 确认类型(1:确认;2:误报;3:已读;)
      { value: '确认事件', key: 'confirm', operateType: confirmType, qsCode: 'CONVERT' },
      { value: '关联事件', key: 'connect', qsCode: 'RELEVANCE' },
      { value: '误报', key: 'misstate', operateType: misstateType, qsCode: 'FAULT' },
      { value: '已读', key: 'ignore', operateType: ignoreType, qsCode: 'IGNORE' }
    ],
    // 详情列表 一般的文本都是此处处理   [key]  详情检索路径， 如有render函数  render优先级大于key
    detailList: [
      {
        label: '时间',
        key: 'detectionTime'
      },
      {
        label: '预警级别',
        render(record) {
          return getDict('ZNZC-LEVEL', record.eventLevel, '') || ''
        }
      },
      {
        label: '事件发生路线',
        key: 'roadText'
      },
      {
        label: '事件发生桩号',
        render(record) {
          return getZhText(record.startStake)
        }
      },
      {
        label: '联系人',
        key: 'linkman'
      },
      {
        label: '联系人电话',
        key: 'linkmanTel'
      },
      {
        label: '事件描述',
        key: 'desc'
      }
    ]
  },
  // 警情共享
  {
    qsCode: 'MENU:JQGX',
    sourceId: '',
    prefixUrl: '', // 微码的url前缀
    fetchPrefix: 'alarm-event', // 请求URL前缀
    type: 30,
    icon: 'jqgx',
    // rowOperatesText: '核实',
    detailConfig: ['intelligent-detail'], // 是否有详情
    staticDetail: false,
    operates: [
      { value: '已读', key: 'ignore', operateType: ignoreType, abc: 123, qsCode: 'IGNORE' }
    ],
    detailList: [
      { label: '报警时间', key: 'detectionTime' },
      { label: '警情描述', key: 'text' }
    ]
  },
  // 地质灾害
  {
    fetchPrefix: 'alarm-carrier', // 请求url前缀
    prefixUrl: 'alarm-carrier', // 微码的url前缀
    qsCode: 'MENU:DZZH', // qscode 动态渲染tab匹配字段
    sourceId: 'source5',
    icon: 'aijc-car', // 智能侦测图标
    mapLayerType: 'point',
    type: 31, // 智能侦测类型类型
    rowOperatesText: '核实', // 行操作文本  核实,已读,误报都是一个函数 通过字符串判断执行什么
    detailConfig: ['intelligent-detail'], // 是否有详情
    staticDetail: false, // 是否是静态详情   即通过列表作为详情
    fileSwiper: true, // 是否是文件轮播
    operates: [
      // 详情底部操作按钮  通过operateType 判断执行什么函数   关联事件没有 operateType   同apifox 确认类型(1:确认;2:误报;3:已读;)
      { value: '确认事件', key: 'confirm', operateType: confirmType, qsCode: 'CONVERT' },
      { value: '关联事件', key: 'connect', qsCode: 'RELEVANCE' },
      { value: '误报', key: 'misstate', operateType: misstateType, qsCode: 'FAULT' },
      { value: '已读', key: 'ignore', operateType: ignoreType, qsCode: 'IGNORE' }
    ],
    // 详情列表 一般的文本都是此处处理   [key]  详情检索路径， 如有render函数  render优先级大于key
    detailList: [
      {
        label: '报警类型',
        key: 'alarmTypeText'
      },
      {
        label: '报警时间',
        render(record) {
          return dateFormat(record.detectionTime)
        }
      },
      {
        label: '预警级别',
        key: 'detectionLevelText'
      },
      {
        label: '事件位置',
        key: '_position',
        render(record) {
          return `${record.roadNum || ''}${record.roadName || ''} ${getZhText(record.startStake)}`
        }
      },
      {
        label: '数据来源',
        key: 'source',
        render(record) {
          return getDict('ZNZC-SJLY', record.source, '') || ''
        }
      }
    ],
    // 详情表单配置
    detailFormConfig: {
      remark: true
    },
    defultTranformEventType: 'TCB1'
  }
]

export const ZNZCList = [
  {
    id: '4028e7fa88d33018018ad0c5908e1211',
    name: '事件检测',
    parent: 'ff80808186c000080187359c757c05e8',
    code: 'MENU:AIPF#SJK',
    url: '#',
    router: null,
    acceptUrls: null,
    chileM: [
      {
        id: 'ff8081818ccccf9c018f29c48876036c',
        name: '关联事件',
        parent: '4028e7fa88d33018018ad0c5908e1211',
        code: 'MENU:AIPF:RELEVANCE',
        url: '#',
        router: null,
        acceptUrls: null,
        chileM: null
      },
      {
        id: 'ff8081818ccccf9c018f29c4d31e036d',
        name: '转换事件',
        parent: '4028e7fa88d33018018ad0c5908e1211',
        code: 'MENU:AIPF:CONVERT',
        url: '#',
        router: null,
        acceptUrls: null,
        chileM: null
      },
      {
        id: 'ff8081818ccccf9c018f29c5045d036e',
        name: '忽略',
        parent: '4028e7fa88d33018018ad0c5908e1211',
        code: 'MENU:AIPF:IGNORE',
        url: '#',
        router: null,
        acceptUrls: null,
        chileM: null
      },
      {
        id: 'ff8081818ccccf9c018f29c5461f036f',
        name: '误报',
        parent: '4028e7fa88d33018018ad0c5908e1211',
        code: 'MENU:AIPF:FAULT',
        url: '#',
        router: null,
        acceptUrls: null,
        chileM: null
      }
    ]
  },
  {
    id: 'ff80808186c000080187359dd7cf05f3',
    name: '交通态势',
    parent: 'ff80808186c000080187359c757c05e8',
    code: 'MENU:JTTS#SJK',
    url: '#',
    router: null,
    acceptUrls: null,
    chileM: [
      {
        id: 'ff8081818ccccf9c018f29c77f640374',
        name: '关联事件',
        parent: 'ff80808186c000080187359dd7cf05f3',
        code: 'MENU:JTTS:RELEVANCE',
        url: '#',
        router: null,
        acceptUrls: null,
        chileM: null
      },
      {
        id: 'ff8081818ccccf9c018f29c7be040375',
        name: '转换事件',
        parent: 'ff80808186c000080187359dd7cf05f3',
        code: 'MENU:JTTS:CONVERT',
        url: '#',
        router: null,
        acceptUrls: null,
        chileM: null
      },
      {
        id: 'ff8081818ccccf9c018f29c7ea300376',
        name: '忽略',
        parent: 'ff80808186c000080187359dd7cf05f3',
        code: 'MENU:JTTS:IGNORE',
        url: '#',
        router: null,
        acceptUrls: null,
        chileM: null
      },
      {
        id: 'ff8081818ccccf9c018f29c98ee40377',
        name: '误报',
        parent: 'ff80808186c000080187359dd7cf05f3',
        code: 'MENU:JTTS:FAULT',
        url: '#',
        router: null,
        acceptUrls: null,
        chileM: null
      }
    ]
  },
  {
    id: 'ff80808186c000080187359e370b05f5',
    name: '协同上报',
    parent: 'ff80808186c000080187359c757c05e8',
    code: 'MENU:XTSB#SJK',
    url: '#',
    router: null,
    acceptUrls: null,
    chileM: [
      {
        id: 'ff8081818ccccf9c018f29cbeaf50378',
        name: '关联事件',
        parent: 'ff80808186c000080187359e370b05f5',
        code: 'MENU:XTSB:RELEVANCE',
        url: '#',
        router: null,
        acceptUrls: null,
        chileM: null
      },
      {
        id: 'ff8081818ccccf9c018f29cc11cc0379',
        name: '转换事件',
        parent: 'ff80808186c000080187359e370b05f5',
        code: 'MENU:XTSB:CONVERT',
        url: '#',
        router: null,
        acceptUrls: null,
        chileM: null
      },
      {
        id: 'ff8081818ccccf9c018f29cc396f037a',
        name: '忽略',
        parent: 'ff80808186c000080187359e370b05f5',
        code: 'MENU:XTSB:IGNORE',
        url: '#',
        router: null,
        acceptUrls: null,
        chileM: null
      },
      {
        id: 'ff8081818ccccf9c018f29cc675b037b',
        name: '误报',
        parent: 'ff80808186c000080187359e370b05f5',
        code: 'MENU:XTSB:FAULT',
        url: '#',
        router: null,
        acceptUrls: null,
        chileM: null
      }
    ]
  },
  {
    id: 'ff8081818ccd3bb0018e136d1b8801b8',
    name: '气象预警',
    parent: 'ff80808186c000080187359c757c05e8',
    code: 'MENU:QXJC',
    url: '#',
    router: null,
    acceptUrls: null,
    chileM: [
      {
        id: 'ff8081818ccccf9c018f29cddd6f037c',
        name: '关联事件',
        parent: 'ff8081818ccd3bb0018e136d1b8801b8',
        code: 'MENU:QXJC:RELEVANCE',
        url: '#',
        router: null,
        acceptUrls: null,
        chileM: null
      },
      {
        id: 'ff8081818ccccf9c018f29ce169c037d',
        name: '转换事件',
        parent: 'ff8081818ccd3bb0018e136d1b8801b8',
        code: 'MENU:QXJC:CONVERT',
        url: '#',
        router: null,
        acceptUrls: null,
        chileM: null
      },
      {
        id: 'ff8081818ccccf9c018f29ce4f8b037e',
        name: '忽略',
        parent: 'ff8081818ccd3bb0018e136d1b8801b8',
        code: 'MENU:QXJC:IGNORE',
        url: '#',
        router: null,
        acceptUrls: null,
        chileM: null
      },
      {
        id: 'ff8081818ccccf9c018f29ce7b63037f',
        name: '误报',
        parent: 'ff8081818ccd3bb0018e136d1b8801b8',
        code: 'MENU:QXJC:FAULT',
        url: '#',
        router: null,
        acceptUrls: null,
        chileM: null
      }
    ]
  },
  {
    id: '8a8181d595a303d80195a3ee2e340019',
    name: '地质灾害',
    parent: 'ff80808186c000080187359c757c05e8',
    code: 'MENU:DZZH',
    url: '#',
    router: null,
    acceptUrls: null,
    chileM: [
      {
        id: '8a8181d595a303d80195a3f3df750021',
        name: '关联事件',
        parent: '8a8181d595a303d80195a3ee2e340019',
        code: 'MENU:DZZH:RELEVANCE',
        url: '#',
        router: null,
        acceptUrls: null,
        chileM: null
      },
      {
        id: '8a8181d595a303d80195a3f478fd0023',
        name: '转换事件',
        parent: '8a8181d595a303d80195a3ee2e340019',
        code: 'MENU:DZZH:CONVERT',
        url: '#',
        router: null,
        acceptUrls: null,
        chileM: null
      },
      {
        id: '8a8181d595a303d80195a3fb439b0032',
        name: '忽略',
        parent: '8a8181d595a303d80195a3ee2e340019',
        code: 'MENU:DZZH:IGNORE',
        url: '#',
        router: null,
        acceptUrls: null,
        chileM: null
      },
      {
        id: '8a8181d595a303d80195a3fb9d010034',
        name: '误报',
        parent: '8a8181d595a303d80195a3ee2e340019',
        code: 'MENU:DZZH:FAULT',
        url: '#',
        router: null,
        acceptUrls: null,
        chileM: null
      }
    ]
  }
]
