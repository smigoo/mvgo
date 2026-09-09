/*
 * @Description:  注册全局公共方法
 * @Author: 朱琦 1972662943@qq.com
 * @Date: 2025-06-04 16:14:00
 * @LastEditors: 潘强 panqiang1111
 * @LastEditTime: 2025-12-17 14:48:23
 * @FilePath: \src\utils\auto-import\common.js
 */
import { Modal, message, notification } from 'ant-design-vue'
import * as echarts from 'echarts'
import { hasPermission } from '@/core/permission'
import {
  getRuntimeBuilder,
  mcComponentBuilder,
  createMcDeclare,
  mcCssBuilder,
  getMcDefaultConfig,
  mcMapLegend
} from '@/core/microcode'
import dayjs from 'dayjs'
import config from '@/config'

// 微码业务插件注册
// 获取运行时构建器1.0 版本，后期要废弃
export const $runtimeBuilder = getRuntimeBuilder

/**
 * 微码组件获取实例
 * @returns {runtimeBuilder, componentProps, componentLayout}
 */
export const $mcComponentBuilder = mcComponentBuilder
export const $mcCssBuilder = mcCssBuilder
export const $createMcDeclare = createMcDeclare
export const $getMcDefaultConfig = getMcDefaultConfig
export const $mcMapLegend = mcMapLegend
// 业务插件注册
export const $isWujie = window.$wujie
export const $hasPermission = hasPermission

// 公共插件注册
export const $echarts = echarts
export const $config = config
export const $dayjs = dayjs
export const $message = message
export const $notification = notification
export const $confirm = Modal.confirm
export const $info = Modal.info
export const $success = Modal.success
export const $error = Modal.error
export const $warning = Modal.warning
