<!--
 * @Description: 后台管理页面生成器（亮色清爽风格）
 * @Author: smigoo(xsmigoo@gmail.com)
 * @Date: 2026-07-21
 * @LastEditors: smigoo(xsmigoo@gmail.com)
 * @LastEditTime: 2026-07-24
 * @Copyright: © 2026 Microvideo
-->
<template>
  <div class="ag-root">
    <!-- 主体三栏布局：左步骤 | 中预览+导航 | 右配置 -->
    <div class="ag-body">
      <!-- #region 左侧：圆形步骤导航 -->
      <div class="ag-steps-col">
        <div class="ag-steps-label">生成步骤</div>
        <div
          v-for="(s, i) in steps"
          :key="s.key"
          class="ag-step-item"
          :class="{ 'ag-step-active': current === i, 'ag-step-done': current > i }"
          @click="goStep(i)"
        >
          <div class="ag-step-circle">
            <span v-if="current > i" class="ag-step-check">&#10003;</span>
            <span v-else>{{ i + 1 }}</span>
          </div>
          <span class="ag-step-title">{{ s.title }}</span>
        </div>
      </div>
      <!-- #endregion -->

      <!-- #region 中间：预览区域 + 底部导航 -->
      <div class="ag-main-col">
        <div class="ag-preview-card">
          <h3 class="ag-preview-card-title">页面预览</h3>
          <!-- 预览表格 -->
          <div class="ag-preview-table-wrap" :class="'ag-pv-theme-' + (form.pageTheme === 'custom' ? 'light' : (form.pageTheme || 'light'))" :style="{ '--admin-primary': form.primaryColor }">
            <div v-if="form.showTitle" class="ag-pv-page-title">{{ form.title || '页面标题' }}</div>
            <a-table
              size="middle"
              :columns="previewColumns"
              :data-source="previewRows"
              :pagination="false"
              :scroll="previewScroll"
              :row-class-name="form.striped ? previewRowClassName : undefined"
              row-key="__key"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === '_action'">
                  <a-space>
                    <a-button v-if="form.actionView" type="link" size="small">编辑</a-button>
                    <a-popconfirm v-if="form.actionDelete" title="确定删除？">
                      <a-button type="link" danger size="small">删除</a-button>
                    </a-popconfirm>
                  </a-space>
                </template>
                <template v-else>
                  <a-tag v-if="renderTypeOf(column.dataIndex) === 'tag'" :color="tagColorOf(column.dataIndex, record[column.dataIndex])">{{ record[column.dataIndex] }}</a-tag>
                  <a-switch v-else-if="renderTypeOf(column.dataIndex) === 'switch'" :checked="!!record[column.dataIndex]" disabled size="small" />
                  <span v-else>{{ record[column.dataIndex] }}</span>
                </template>
              </template>
            </a-table>
            <div v-if="form.showPagination" class="ag-pv-pagination">
              <a-pagination
                size="small"
                :total="50"
                :page-size="form.pageSize || 10"
                :show-size-changer="true"
                :show-quick-jumper="true"
                :show-total="(total) => `共 ${total} 条`"
              />
            </div>
          </div>
        </div>

        <!-- 底部导航按钮 -->
        <div class="ag-nav-bar">
          <a-button :disabled="current === 0" @click="prev">上一步</a-button>
          <a-button v-if="current < steps.length - 1" type="primary" @click="next">下一步</a-button>
          <a-button v-else type="primary" :loading="generating" @click="onGenerateDownload">
            <template #icon><DownloadOutlined /></template>生成并下载 ZIP
          </a-button>
        </div>
      </div>
      <!-- #endregion -->

      <!-- #region 右侧：字段配置面板 -->
      <div class="ag-config-col">
        <div class="ag-config-header">字段配置</div>
        <div class="ag-config-body">
          <!-- Step 0: 页面基本配置 -->
          <div v-show="current === 0" class="ag-config-section">
            <div class="ag-config-group">
              <label class="ag-cfg-label">页面标题</label>
              <a-input v-model:value="form.title" placeholder="用户管理" size="small" />
            </div>
            <div class="ag-config-row">
              <div class="ag-config-group ag-config-group--half">
                <label class="ag-cfg-label">每页条数 (pageSize)</label>
                <a-input-number v-model:value="form.pageSize" :min="1" :max="200" size="small" style="width:100%" />
              </div>
              <div class="ag-config-group ag-config-group--half">
                <label class="ag-cfg-label">布局模式</label>
                <a-select v-model:value="form.searchLayout" size="small">
                  <a-select-option value="inline">行内(inline)</a-select-option>
                  <a-select-option value="horizontal">水平(horizontal)</a-select-option>
                  <a-select-option value="vertical">垂直(vertical)</a-select-option>
                </a-select>
              </div>
            </div>
            <div class="ag-config-row">
              <div class="ag-config-group ag-config-group--half">
                <label class="ag-cfg-label">应用搜索</label>
                <a-switch v-model:checked="form.enableCreate" checked-children="开" un-checked-children="关" size="small" />
              </div>
              <div class="ag-config-group ag-config-group--half">
                <label class="ag-cfg-label">Label 冒号</label>
                <a-switch v-model:checked="form.labelColon" checked-children="开" un-checked-children="关" size="small" />
              </div>
            </div>
            <div class="ag-config-row">
              <div class="ag-config-group ag-config-group--half">
                <label class="ag-cfg-label">表单换行</label>
                <a-switch v-model:checked="form.formWrap" checked-children="开" un-checked-children="关" size="small" />
              </div>
              <div class="ag-config-group ag-config-group--half">
                <label class="ag-cfg-label">显示分页</label>
                <a-switch v-model:checked="form.showPagination" checked-children="开" un-checked-children="关" size="small" />
              </div>
            </div>
            <div class="ag-config-group">
              <label class="ag-cfg-label">弹窗宽度</label>
              <a-input-number v-model:value="form.modalWidth" :min="400" :max="1200" :step="50" style="width:100%" size="small" />
            </div>
            <div class="ag-config-row">
              <div class="ag-config-group ag-config-group--half">
                <label class="ag-cfg-label">滚动 X (px)</label>
                <a-input-number v-model:value="form.scrollX" :min="0" :step="100" size="small" style="width:100%" placeholder="0=不滚" />
              </div>
              <div class="ag-config-group ag-config-group--half">
                <label class="ag-cfg-label">滚动 Y (px)</label>
                <a-input-number v-model:value="form.scrollY" :min="0" :step="50" size="small" style="width:100%" placeholder="0=不滚" />
              </div>
            </div>
            <!-- 快速模板 -->
            <div class="ag-tpl-bar">
              <span class="ag-tpl-label">快速模板</span>
              <a-select placeholder="选择预设模板" size="small" style="flex:1" @change="applyTemplate">
                <a-select-option v-for="t in templates" :key="t.key" :value="t.key">{{ t.label }}</a-select-option>
              </a-select>
            </div>
          </div>

          <!-- Step 1: 搜索字段 -->
          <div v-show="current === 1" class="ag-config-section">
            <div class="ag-section-bar">
              <span class="ag-section-bar-title">搜索字段</span>
              <a-button type="dashed" size="small" @click="addField"><PlusOutlined /> 添加</a-button>
            </div>
            <a-empty v-if="!form.searchFields.length" description="暂无搜索字段" :image-style="{ height: '60px' }" />
            <div v-for="(f, idx) in form.searchFields" :key="f.id" class="ag-field-card" :class="{ 'ag-field-card-collapsed': f.collapsed }">
              <div class="ag-field-card-head" @click="toggleFieldCollapse(f)">
                <a-tag :color="typeColor(f.type)" size="small">{{ typeLabel(f.type) }}</a-tag>
                <span class="ag-field-name">{{ f.label || '未命名' }}</span>
                <span class="ag-field-ops" @click.stop>
                  <a-button type="text" size="small" danger @click="removeField(idx)"><DeleteOutlined /></a-button>
                </span>
              </div>
              <div class="ag-field-card-body" v-show="!f.collapsed">
                <a-form layout="vertical" size="small">
                  <a-form-item label="标签"><a-input v-model:value="f.label" size="small" /></a-form-item>
                  <a-form-item label="字段名"><a-input v-model:value="f.name" size="small" /></a-form-item>
                  <a-form-item label="类型">
                    <a-select v-model:value="f.type" @change="onFieldTypeChange(f)" size="small">
                      <a-select-option value="text">文本</a-select-option>
                      <a-select-option value="number">数字</a-select-option>
                      <a-select-option value="select">下拉</a-select-option>
                      <a-select-option value="date">日期</a-select-option>
                      <a-select-option value="datetime">日期时间</a-select-option>
                      <a-select-option value="range">日期范围</a-select-option>
                    </a-select>
                  </a-form-item>
                  <a-form-item label="占位符"><a-input v-model:value="f.placeholder" size="small" /></a-form-item>
                </a-form>
              </div>
            </div>
          </div>

          <!-- Step 2: 表格列 -->
          <div v-show="current === 2" class="ag-config-section">
            <div class="ag-section-bar">
              <span class="ag-section-bar-title">表格列</span>
              <a-button type="dashed" size="small" @click="addColumn"><PlusOutlined /> 添加列</a-button>
            </div>
            <div class="ag-col-editor">
              <div class="ag-col-editor-head">
                <span>标题</span><span>字段名</span><span>宽</span><span>渲染</span><span></span>
              </div>
              <div v-for="(c, idx) in form.tableColumns" :key="c.dataIndex + idx" class="ag-col-editor-item">
                <div class="ag-col-editor-row">
                  <a-input v-model:value="c.title" placeholder="标题" size="small" />
                  <a-input v-model:value="c.dataIndex" placeholder="字段名" size="small" />
                  <a-input-number v-model:value="c.width" :min="40" placeholder="宽" size="small" />
                  <a-select v-model:value="c.renderType" allow-clear placeholder="默认" size="small">
                    <a-select-option value="text">文本</a-select-option>
                    <a-select-option value="tag">标签</a-select-option>
                    <a-select-option value="switch">开关</a-select-option>
                  </a-select>
                  <a-button type="text" danger size="small" @click="removeColumn(idx)"><DeleteOutlined /></a-button>
                </div>
              </div>
            </div>
          </div>

          <!-- Step 3: 数据源 & 导出选项 -->
          <div v-show="current === 3" class="ag-config-section">
            <h4 class="ag-config-subtitle">数据源</h4>
            <a-form layout="vertical" size="small">
              <a-form-item label="API 端点" required>
                <a-input v-model:value="form.dsUrl" placeholder="/api/v1/users" size="small" />
              </a-form-item>
              <a-form-item label="请求方式">
                <a-radio-group v-model:value="form.dsMethod">
                  <a-radio value="GET">GET</a-radio>
                  <a-radio value="POST">POST</a-radio>
                </a-radio-group>
              </a-form-item>
              <a-form-item label="列表字段"><a-input v-model:value="form.mapList" placeholder="list" size="small" /></a-form-item>
              <a-form-item label="总数字段"><a-input v-model:value="form.mapTotal" placeholder="total" size="small" /></a-form-item>
              <a-form-item label="主键字段"><a-input v-model:value="form.mapId" placeholder="id" size="small" /></a-form-item>
            </a-form>
            <h4 class="ag-config-subtitle" style="margin-top:20px">导出选项</h4>
            <div class="ag-export-opts">
              <div class="ag-toggle-row"><span>启用导出</span><a-switch v-model:checked="form.enableExport" size="small" /></div>
              <div class="ag-toggle-row"><span>批量删除</span><a-switch v-model:checked="form.enableBatchDelete" size="small" /></div>
              <div class="ag-toggle-row"><span>显示操作列</span><a-switch v-model:checked="form.showActionColumn" size="small" /></div>
            </div>
            <div class="ag-config-actions-top">
              <a-button size="small" @click="onImport"><UploadOutlined /> 导入</a-button>
              <a-button size="small" @click="onExport"><DownloadOutlined /> 导出</a-button>
              <a-button size="small" danger @click="resetConfig">重置</a-button>
            </div>
          </div>
        </div>
      </div>
      <!-- #endregion -->
    </div>

    <input ref="fileInput" type="file" accept="application/json,.json" hidden @change="onFileChange" />
  </div>
</template>

<script setup>
// #region 1. 引入
import { ref, reactive, computed } from 'vue'
import {
  DownloadOutlined, UploadOutlined, PlusOutlined, DeleteOutlined,
} from '@ant-design/icons-vue'
import { message } from 'ant-design-vue'
import http from '@/core/http'
// #endregion

// #region 2. 响应式状态
const BASE = '/api/admin'
const current = ref(0)
const generating = ref(false)
const codeTab = ref('')
const generatedFiles = ref({})
const fileInput = ref(null)
const previewModalVisible = ref(false)

const steps = [
  { key: 'base', title: '选择数据源', desc: '数据源与接口', tip: '配置后端接口地址和响应字段映射。' },
  { key: 'search', title: '配置字段', desc: '搜索与表格列', tip: '配置搜索条件字段和表格展示列。' },
  { key: 'columns', title: '预览页面', desc: '实时预览效果', tip: '实时预览生成的 CRUD 页面效果。' },
  { key: 'datasource', title: '生成代码', desc: '导出或下载', tip: '预览源码或一键打包下载 ZIP。' }
]

// 预置模板
const templates = [
  { key: 'user', label: '用户管理', desc: '关键词+状态+角色，含新建/编辑/删除' },
  { key: 'device', label: '设备管理', desc: '设备名+类型+在线状态(switch)，含排序/筛选' },
  { key: 'log', label: '日志查询', desc: '时间范围+级别+关键词，含导出/斑马纹' },
  { key: 'order', label: '订单管理', desc: '订单号+状态(tag)+金额，含批量删除' }
]

const applyTemplate = (key) => {
  const tplMap = {
    user: {
      name: 'userManage', title: '用户管理', showTitle: true, showPagination: true, pageSize: 10,
      searchLayout: 'horizontal', labelColon: true, formWrap: true, fieldsPerRow: 3, pageTheme: 'light',
      enableExport: false, enableBatchDelete: false, enableCreate: true, enableEdit: true, modalWidth: 600,
      scrollX: 0, scrollY: 0, striped: false, rowSelectionType: 'checkbox', labelWidth: 80,
      showActionColumn: true, actionBtnType: 'link', actionBtnSize: 'small', actionDeleteType: 'danger',
      actionView: true, actionEdit: true, actionDelete: true,
      searchFields: [
        { id: 't_u_1', name: 'keyword', label: '关键词', type: 'text', placeholder: '请输入用户名', defaultValue: '', required: false, collapsed: false, linkageEnabled: false, linkageSource: '', linkageType: 'filterOptions' },
        { id: 't_u_2', name: 'status', label: '状态', type: 'select', placeholder: '', defaultValue: '', required: false, options: [{ label: '启用', value: 'enabled' }, { label: '禁用', value: 'disabled' }], collapsed: true, linkageEnabled: false, linkageSource: '', linkageType: 'filterOptions' },
        { id: 't_u_3', name: 'role', label: '角色', type: 'select', placeholder: '', defaultValue: '', required: false, options: [{ label: '管理员', value: 'admin' }, { label: '普通用户', value: 'user' }], collapsed: true, linkageEnabled: false, linkageSource: '', linkageType: 'filterOptions' }
      ],
      tableColumns: [
        { dataIndex: 'name', title: '姓名', width: 120, fixed: 'left', customRender: false, renderType: 'text', sortable: false, align: '', ellipsis: false, filtersStr: '' },
        { dataIndex: 'status', title: '状态', width: 100, customRender: true, renderType: 'tag', tagOptionsStr: '{"enabled":{"color":"green","text":"启用"},"disabled":{"color":"red","text":"禁用"}}', sortable: false, align: '', ellipsis: false, filtersStr: '' },
        { dataIndex: 'role', title: '角色', width: 120, customRender: false, renderType: 'text', sortable: false, align: '', ellipsis: false, filtersStr: '' },
        { dataIndex: 'createTime', title: '创建时间', width: 180, customRender: false, renderType: 'text', sortable: true, align: '', ellipsis: false, filtersStr: '' }
      ],
      dsUrl: '/api/user/list', dsMethod: 'GET', mapList: 'list', mapTotal: 'total', mapId: 'id'
    },
    device: {
      name: 'deviceManage', title: '设备管理', showTitle: true, showPagination: true, pageSize: 10,
      searchLayout: 'inline', labelColon: true, formWrap: false, fieldsPerRow: 3, pageTheme: 'light',
      enableExport: false, enableBatchDelete: false, enableCreate: true, enableEdit: true, modalWidth: 600,
      scrollX: 800, scrollY: 400, striped: true, rowSelectionType: 'checkbox', labelWidth: 0,
      showActionColumn: true, actionBtnType: 'link', actionBtnSize: 'small', actionDeleteType: 'danger',
      actionView: true, actionEdit: true, actionDelete: true,
      searchFields: [
        { id: 't_d_1', name: 'deviceName', label: '设备名称', type: 'text', placeholder: '请输入设备名称', defaultValue: '', required: false, collapsed: false, linkageEnabled: false, linkageSource: '', linkageType: 'filterOptions' },
        { id: 't_d_2', name: 'deviceType', label: '设备类型', type: 'select', placeholder: '', defaultValue: '', required: false, options: [{ label: '摄像头', value: 'camera' }, { label: '传感器', value: 'sensor' }, { label: '网关', value: 'gateway' }], collapsed: true, linkageEnabled: false, linkageSource: '', linkageType: 'filterOptions' }
      ],
      tableColumns: [
        { dataIndex: 'deviceName', title: '设备名称', width: 150, fixed: 'left', customRender: false, renderType: 'text', sortable: false, align: '', ellipsis: true, filtersStr: '' },
        { dataIndex: 'deviceType', title: '类型', width: 100, customRender: false, renderType: 'text', sortable: false, align: 'center', ellipsis: false, filtersStr: '[{"text":"摄像头","value":"camera"},{"text":"传感器","value":"sensor"},{"text":"网关","value":"gateway"}]' },
        { dataIndex: 'online', title: '在线状态', width: 100, customRender: true, renderType: 'switch', sortable: false, align: 'center', ellipsis: false, filtersStr: '' },
        { dataIndex: 'ip', title: 'IP地址', width: 140, customRender: false, renderType: 'text', sortable: false, align: '', ellipsis: true, filtersStr: '' },
        { dataIndex: 'lastTime', title: '最后上报', width: 180, customRender: false, renderType: 'text', sortable: true, align: '', ellipsis: false, filtersStr: '' }
      ],
      dsUrl: '/api/device/list', dsMethod: 'GET', mapList: 'list', mapTotal: 'total', mapId: 'id'
    },
    log: {
      name: 'logQuery', title: '日志查询', showTitle: true, showPagination: true, pageSize: 20,
      searchLayout: 'horizontal', labelColon: true, formWrap: true, fieldsPerRow: 3, pageTheme: 'dark',
      enableExport: true, enableBatchDelete: false, enableCreate: false, enableEdit: false, modalWidth: 600,
      scrollX: 0, scrollY: 300, striped: true, rowSelectionType: 'checkbox', labelWidth: 80,
      showActionColumn: true, actionBtnType: 'link', actionBtnSize: 'small', actionDeleteType: 'danger',
      actionView: true, actionEdit: false, actionDelete: false,
      searchFields: [
        { id: 't_l_1', name: 'keyword', label: '关键词', type: 'text', placeholder: '请输入关键词', defaultValue: '', required: false, collapsed: false, linkageEnabled: false, linkageSource: '', linkageType: 'filterOptions' },
        { id: 't_l_2', name: 'level', label: '级别', type: 'select', placeholder: '', defaultValue: '', required: false, options: [{ label: 'INFO', value: 'info' }, { label: 'WARN', value: 'warn' }, { label: 'ERROR', value: 'error' }], collapsed: true, linkageEnabled: false, linkageSource: '', linkageType: 'filterOptions' },
        { id: 't_l_3', name: 'timeRange', label: '时间范围', type: 'range', placeholder: '', defaultValue: '', required: false, collapsed: true, linkageEnabled: false, linkageSource: '', linkageType: 'filterOptions' }
      ],
      tableColumns: [
        { dataIndex: 'time', title: '时间', width: 180, fixed: 'left', customRender: false, renderType: 'text', sortable: true, align: '', ellipsis: false, filtersStr: '' },
        { dataIndex: 'level', title: '级别', width: 80, customRender: true, renderType: 'tag', tagOptionsStr: '{"info":{"color":"blue","text":"INFO"},"warn":{"color":"orange","text":"WARN"},"error":{"color":"red","text":"ERROR"}}', sortable: false, align: 'center', ellipsis: false, filtersStr: '' },
        { dataIndex: 'source', title: '来源', width: 120, customRender: false, renderType: 'text', sortable: false, align: '', ellipsis: false, filtersStr: '' },
        { dataIndex: 'message', title: '日志内容', width: 300, customRender: false, renderType: 'text', sortable: false, align: '', ellipsis: true, filtersStr: '' }
      ],
      dsUrl: '/api/log/list', dsMethod: 'GET', mapList: 'list', mapTotal: 'total', mapId: 'id'
    },
    order: {
      name: 'orderManage', title: '订单管理', showTitle: true, showPagination: true, pageSize: 10,
      searchLayout: 'inline', labelColon: true, formWrap: false, fieldsPerRow: 3, pageTheme: 'light',
      enableExport: true, enableBatchDelete: true, enableCreate: true, enableEdit: true, modalWidth: 600,
      scrollX: 1000, scrollY: 0, striped: false, rowSelectionType: 'checkbox', labelWidth: 0,
      showActionColumn: true, actionBtnType: 'link', actionBtnSize: 'small', actionDeleteType: 'danger',
      actionView: true, actionEdit: true, actionDelete: true,
      searchFields: [
        { id: 't_o_1', name: 'orderNo', label: '订单号', type: 'text', placeholder: '请输入订单号', defaultValue: '', required: false, collapsed: false, linkageEnabled: false, linkageSource: '', linkageType: 'filterOptions' },
        { id: 't_o_2', name: 'status', label: '订单状态', type: 'select', placeholder: '', defaultValue: '', required: false, options: [{ label: '待付款', value: 'pending' }, { label: '已付款', value: 'paid' }, { label: '已发货', value: 'shipped' }, { label: '已完成', value: 'completed' }], collapsed: true, linkageEnabled: false, linkageSource: '', linkageType: 'filterOptions' }
      ],
      tableColumns: [
        { dataIndex: 'orderNo', title: '订单号', width: 160, fixed: 'left', customRender: false, renderType: 'text', sortable: false, align: '', ellipsis: false, filtersStr: '' },
        { dataIndex: 'status', title: '状态', width: 100, customRender: true, renderType: 'tag', tagOptionsStr: '{"pending":{"color":"orange","text":"待付款"},"paid":{"color":"blue","text":"已付款"},"shipped":{"color":"cyan","text":"已发货"},"completed":{"color":"green","text":"已完成"}}', sortable: false, align: 'center', ellipsis: false, filtersStr: '[{"text":"待付款","value":"pending"},{"text":"已付款","value":"paid"},{"text":"已发货","value":"shipped"}]' },
        { dataIndex: 'amount', title: '金额', width: 100, customRender: false, renderType: 'text', sortable: true, align: 'right', ellipsis: false, filtersStr: '' },
        { dataIndex: 'createTime', title: '下单时间', width: 180, customRender: false, renderType: 'text', sortable: true, align: '', ellipsis: false, filtersStr: '' }
      ],
      dsUrl: '/api/order/list', dsMethod: 'GET', mapList: 'list', mapTotal: 'total', mapId: 'id'
    }
  }
  const tpl = tplMap[key]
  if (!tpl) return
  applyConfig(tpl)
  message.success(`已加载模板：${templates.find((t) => t.key === key)?.label || key}`)
}

const form = reactive({
  name: 'userManage',
  title: '用户管理',
  showTitle: true,
  showPagination: true,
  pageSize: 10,
  searchLayout: 'inline',
  labelColon: true,
  formWrap: false,
  fieldsPerRow: 3,
  pageTheme: 'light',
  primaryColor: 'var(--brand)',
  enableExport: false,
  enableBatchDelete: false,
  enableCreate: true,
  enableEdit: true,
  modalWidth: 600,
  scrollX: 0,
  scrollY: 0,
  striped: false,
  stripeColor: 'var(--bg-hover)',
  rowSelectionType: 'checkbox',
  labelWidth: 0,
  showActionColumn: true,
  actionBtnType: 'link',
  actionBtnSize: 'small',
  actionDeleteType: 'danger',
  actionView: true,
  actionEdit: true,
  actionDelete: true,
  searchFields: [
    { id: 'f_keyword', name: 'keyword', label: '关键词', type: 'text', placeholder: '请输入关键词', defaultValue: '', required: false, collapsed: false, linkageEnabled: false, linkageSource: '', linkageType: 'filterOptions' },
    {
      id: 'f_status', name: 'status', label: '状态', type: 'select', placeholder: '请选择状态', defaultValue: '', required: false,
      options: [{ label: '启用', value: 'enabled' }, { label: '禁用', value: 'disabled' }],
      collapsed: true, linkageEnabled: false, linkageSource: '', linkageType: 'filterOptions'
    },
    { id: 'f_createTime', name: 'createTime', label: '创建时间', type: 'datetime', placeholder: '请选择时间', defaultValue: '', required: false, collapsed: true, linkageEnabled: false, linkageSource: '', linkageType: 'filterOptions' }
  ],
  tableColumns: [
    { dataIndex: 'name', title: '姓名', width: 120, fixed: 'left', customRender: false, renderType: 'text', sortable: false, align: '', ellipsis: false, filtersStr: '' },
    { dataIndex: 'status', title: '状态', width: 100, customRender: true, renderType: 'tag', tagOptionsStr: '{"enabled":{"color":"green","text":"启用"},"disabled":{"color":"red","text":"禁用"}}', sortable: false, align: '', ellipsis: false, filtersStr: '' },
    { dataIndex: 'role', title: '角色', width: 120, customRender: false, renderType: 'text', sortable: false, align: '', ellipsis: false, filtersStr: '' },
    { dataIndex: 'createTime', title: '创建时间', width: 180, customRender: false, renderType: 'text', sortable: true, align: '', ellipsis: false, filtersStr: '' }
  ],
  dsUrl: '/api/user/list',
  dsMethod: 'GET',
  mapList: 'list',
  mapTotal: 'total',
  mapId: 'id'
})
const initialSnapshot = JSON.parse(JSON.stringify(form))
// #endregion

// #region 3. 计算属性
const previewColumns = computed(() => {
  const cols = form.tableColumns.map((c) => ({
    title: c.title,
    dataIndex: c.dataIndex,
    key: c.dataIndex,
    width: c.width ? Number(c.width) : undefined,
    fixed: c.fixed || undefined,
    align: c.align || undefined,
    ellipsis: !!c.ellipsis,
    sorter: !!c.sortable,
    filters: c.filtersStr ? safeParseFilters(c.filtersStr) : undefined,
    onFilter: c.filtersStr ? (val, record) => String(record[c.dataIndex]) === String(val) : undefined
  }))
  if (form.showActionColumn) {
    cols.push({ title: '操作', key: '_action', dataIndex: '_action', width: 160, fixed: 'right' })
  }
  return cols
})

const previewScroll = computed(() => {
  const s = {}
  if (form.scrollX) s.x = form.scrollX
  if (form.scrollY) s.y = form.scrollY
  return Object.keys(s).length ? s : undefined
})

const previewRowClassName = (record, index) => (index % 2 === 0 ? '' : 'ag-pv-stripe-row')

const renderTypeOf = (dataIndex) => {
  const c = form.tableColumns.find((x) => x.dataIndex === dataIndex)
  return c ? c.renderType : 'text'
}
const tagColorOf = (dataIndex, val) => {
  const c = form.tableColumns.find((x) => x.dataIndex === dataIndex)
  const map = safeParseTagOptions(c ? c.tagOptionsStr : '')
  if (map && map[String(val)]) return map[String(val)].color || 'default'
  return 'default'
}

const safeParseTagOptions = (str) => {
  if (!str) return {}
  try { return JSON.parse(str) } catch (e) { return {} }
}

const safeParseFilters = (str) => {
  if (!str) return []
  try { return JSON.parse(str) } catch (e) { return [] }
}

const lightenForPreview = (hex, pct) => {
  const n = parseInt(hex.replace('#', ''), 16)
  const r = Math.min(255, (n >> 16) + Math.round(2.55 * pct))
  const g = Math.min(255, ((n >> 8) & 0xff) + Math.round(2.55 * pct))
  const b = Math.min(255, (n & 0xff) + Math.round(2.55 * pct))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}
const darkenForPreview = (hex, pct) => {
  const n = parseInt(hex.replace('#', ''), 16)
  const r = Math.max(0, (n >> 16) - Math.round(2.55 * pct))
  const g = Math.max(0, ((n >> 8) & 0xff) - Math.round(2.55 * pct))
  const b = Math.max(0, (n & 0xff) - Math.round(2.55 * pct))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

const highlightCode = (code) => {
  let esc = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  const strings = []
  esc = esc.replace(/(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g, (m) => {
    strings.push(m)
    return `__STR_${strings.length - 1}__`
  })
  const comments = []
  const saveComment = (m) => { comments.push(m); return `__CMT_${comments.length - 1}__` }
  esc = esc.replace(/(\/\/[^\n]*)/g, saveComment)
  esc = esc.replace(/(\/\*[\s\S]*?\*\/)/g, saveComment)
  esc = esc.replace(/(&lt;!--[\s\S]*?--&gt;)/g, saveComment)
  esc = esc.replace(/\b(const|let|var|function|import|from|export|async|await|return|if|else|for|while|switch|case|break|new|true|false|null|undefined|ref|reactive|computed|watch|onMounted)\b/g, '<span class="hl-kw">$1</span>')
  esc = esc.replace(/(&lt;\/?)([\w-]+)/g, '$1<span class="hl-tag">$2</span>')
  esc = esc.replace(/\b(\d+(\.\d+)?)\b/g, '<span class="hl-num">$1</span>')
  esc = esc.replace(/__CMT_(\d+)__/g, (_, i) => `<span class="hl-cmt">${comments[i]}</span>`)
  esc = esc.replace(/__STR_(\d+)__/g, (_, i) => `<span class="hl-str">${strings[i]}</span>`)
  return esc
}

const searchFieldRows = computed(() => {
  const perRow = Math.max(1, form.fieldsPerRow || 3)
  const rows = []
  for (let i = 0; i < form.searchFields.length; i += perRow) {
    rows.push(form.searchFields.slice(i, i + perRow))
  }
  return rows
})

const previewRows = computed(() => {
  return [0, 1, 2].map((i) => {
    const row = { __key: i }
    form.tableColumns.forEach((c) => {
      if (c.dataIndex === 'status') row[c.dataIndex] = i === 0 ? 'enabled' : 'disabled'
      else if (c.renderType === 'switch') row[c.dataIndex] = i % 2 === 0
      else row[c.dataIndex] = `示例${i + 1}`
    })
    return row
  })
})
// #endregion

// #region 4. 方法
const typeLabel = (t) => ({
  text: '文本', number: '数字', select: '下拉', radio: '单选', checkbox: '多选',
  date: '日期', datetime: '日期时间', time: '时间', range: '日期范围'
}[t] || t)

const typeColor = (t) => ({
  text: 'blue', number: 'cyan', select: 'purple', radio: 'orange', checkbox: 'magenta',
  date: 'green', datetime: 'green', time: 'green', range: 'geekblue'
}[t] || 'default')

const genId = () => 'f_' + Date.now().toString(36) + Math.floor(Math.random() * 1000)

const toggleFieldCollapse = (f) => { f.collapsed = !f.collapsed }
const expandAllFields = () => { form.searchFields.forEach((f) => { f.collapsed = false }) }
const collapseAllFields = () => { form.searchFields.forEach((f, i) => { f.collapsed = i > 0 }) }
const addField = () => {
  form.searchFields.push({
    id: genId(), name: `field${form.searchFields.length + 1}`, label: '新字段', type: 'text',
    placeholder: '', defaultValue: '', required: false, collapsed: true,
    linkageEnabled: false, linkageSource: '', linkageType: 'filterOptions'
  })
}
const removeField = (idx) => form.searchFields.splice(idx, 1)
const copyField = (idx) => {
  const src = form.searchFields[idx]
  const copy = JSON.parse(JSON.stringify(src))
  copy.id = genId()
  copy.name = `${src.name}_copy`
  copy.collapsed = true
  form.searchFields.splice(idx + 1, 0, copy)
}
const moveField = (idx, dir) => {
  const target = idx + dir
  if (target < 0 || target >= form.searchFields.length) return
  const arr = form.searchFields
  ;[arr[idx], arr[target]] = [arr[target], arr[idx]]
}

const dragState = ref({ type: '', fromIdx: -1 })
const onDragStart = (type, idx) => { dragState.value = { type, fromIdx: idx } }
const onDragOver = (e) => { e.preventDefault() }
const onDrop = (type, toIdx) => {
  const { type: fromType, fromIdx } = dragState.value
  if (fromType !== type || fromIdx < 0 || fromIdx === toIdx) return
  const arr = type === 'field' ? form.searchFields : form.tableColumns
  const [moved] = arr.splice(fromIdx, 1)
  arr.splice(toIdx, 0, moved)
  dragState.value = { type: '', fromIdx: -1 }
}
const onFieldTypeChange = (f) => {
  if (['select', 'radio', 'checkbox'].includes(f.type) && (!f.options || !f.options.length)) {
    f.options = [{ label: '选项一', value: '1' }, { label: '选项二', value: '2' }]
  }
}
const addOption = (f) => {
  if (!f.options) f.options = []
  f.options.push({ label: `选项${f.options.length + 1}`, value: String(f.options.length + 1) })
}
const addValueMap = (f) => {
  if (!f.linkageValueMaps) f.linkageValueMaps = []
  f.linkageValueMaps.push({ sourceVal: '', targetVal: '' })
}

const addColumn = () => {
  form.tableColumns.push({ dataIndex: `col${form.tableColumns.length + 1}`, title: `列${form.tableColumns.length + 1}`, width: 120, fixed: '', customRender: false, renderType: 'text', tagOptionsStr: '', sortable: false, align: '', ellipsis: false, filtersStr: '' })
}
const removeColumn = (idx) => form.tableColumns.splice(idx, 1)

const goStep = (i) => { current.value = i }
const prev = () => { if (current.value > 0) current.value-- }
const next = () => { if (current.value < 3) current.value++ }

const buildConfig = () => ({
  name: form.name,
  title: form.title,
  showTitle: !!form.showTitle,
  showPagination: !!form.showPagination,
  pageSize: Number(form.pageSize) || 10,
  searchLayout: form.searchLayout || 'inline',
  labelColon: form.labelColon !== false,
  formWrap: !!form.formWrap,
  fieldsPerRow: Number(form.fieldsPerRow) || 3,
  pageTheme: form.pageTheme || 'light',
  primaryColor: form.primaryColor || 'var(--brand)',
  enableExport: !!form.enableExport,
  enableBatchDelete: !!form.enableBatchDelete,
  enableCreate: form.enableCreate !== false,
  enableEdit: form.enableEdit !== false,
  modalWidth: Number(form.modalWidth) || 600,
  scrollX: form.scrollX || undefined,
  scrollY: form.scrollY || undefined,
  striped: !!form.striped,
  stripeColor: form.stripeColor || 'var(--bg-hover)',
  rowSelectionType: form.rowSelectionType || 'checkbox',
  labelWidth: form.labelWidth || undefined,
  showActionColumn: !!form.showActionColumn,
  actionBtnType: form.actionBtnType || 'link',
  actionBtnSize: form.actionBtnSize || 'small',
  actionDeleteType: form.actionDeleteType || 'danger',
  actionView: !!form.actionView,
  actionEdit: !!form.actionEdit,
  actionDelete: !!form.actionDelete,
  dataSource: {
    url: form.dsUrl,
    method: form.dsMethod,
    responseMapping: {
      totalField: form.mapTotal || 'total',
      listField: form.mapList || 'list',
      idField: form.mapId || 'id'
    }
  },
  searchFields: form.searchFields.map((f) => ({
    id: f.id, name: f.name, label: f.label, type: f.type,
    required: !!f.required, placeholder: f.placeholder, defaultValue: f.defaultValue,
    min: f.min, max: f.max,
    options: ['select', 'radio', 'checkbox'].includes(f.type) ? (f.options || []).map((o) => ({ label: o.label, value: o.value })) : undefined,
    linkageEnabled: !!f.linkageEnabled,
    linkageSource: f.linkageSource || '',
    linkageType: f.linkageType || 'filterOptions',
    linkageValueMaps: f.linkageValueMaps ? (f.linkageValueMaps.map((m) => ({ sourceVal: m.sourceVal, targetVal: m.targetVal }))) : undefined
  })),
  tableColumns: form.tableColumns.map((c) => ({
    dataIndex: c.dataIndex, title: c.title, width: c.width ? Number(c.width) : undefined,
    fixed: c.fixed || undefined, customRender: !!c.customRender, renderType: c.renderType || undefined,
    tagOptions: c.renderType === 'tag' ? safeParseTagOptions(c.tagOptionsStr) : undefined,
    sortable: !!c.sortable,
    filters: c.filtersStr ? safeParseFilters(c.filtersStr) : undefined,
    align: c.align || undefined, ellipsis: !!c.ellipsis
  }))
})

const IDENT_RE = /^[a-zA-Z_$][\w$]*$/
const validateConfig = () => {
  if (!form.name || !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(form.name)) {
    return { ok: false, msg: '页面标识必填，且只能以字母开头，含字母/数字/中划线/下划线' }
  }
  if (!form.title) return { ok: false, msg: '页面标题必填' }
  if (!form.tableColumns.length) return { ok: false, msg: '至少需要配置一列表格列' }
  if (!form.dsUrl) return { ok: false, msg: '数据源接口地址必填' }
  const nameSet = new Set()
  for (const f of form.searchFields) {
    if (!f.name || !f.label) return { ok: false, msg: `搜索字段存在未填写的标签或字段名：${f.label || f.name}` }
    if (!IDENT_RE.test(f.name)) return { ok: false, msg: `字段名「${f.name}」非法，需以字母/下划线/$ 开头且不含空格` }
    if (nameSet.has(f.name)) return { ok: false, msg: `搜索字段名重复：「${f.name}」` }
    nameSet.add(f.name)
    if (['select', 'radio', 'checkbox'].includes(f.type)) {
      if (!f.options || !f.options.length) return { ok: false, msg: `「${f.label}」至少需要一个选项` }
      const vset = new Set()
      for (const o of f.options) {
        if (!o.value) return { ok: false, msg: `「${f.label}」存在空值的选项` }
        if (vset.has(o.value)) return { ok: false, msg: `「${f.label}」选项值重复：「${o.value}」` }
        vset.add(o.value)
      }
    }
  }
  const colSet = new Set()
  for (const c of form.tableColumns) {
    if (!c.dataIndex || !c.title) return { ok: false, msg: `表格列存在未填写的标题或字段名：${c.title || c.dataIndex}` }
    if (!IDENT_RE.test(c.dataIndex)) return { ok: false, msg: `列字段名「${c.dataIndex}」非法，需以字母/下划线/$ 开头` }
    if (colSet.has(c.dataIndex)) return { ok: false, msg: `列字段名重复：「${c.dataIndex}」` }
    colSet.add(c.dataIndex)
  }
  return { ok: true }
}

const requestGenerate = async () => {
  let data
  try {
    data = await http.post(`${BASE}/generate`, buildConfig())
  } catch (e) {
    message.error('生成请求失败（HTTP ' + (e.status ?? 0) + '）')
    return null
  }
  if (!data.success) { message.error(data.message || '生成失败'); return null }
  return data.data.files
}

const onGenerateDownload = async () => {
  const v = validateConfig()
  if (!v.ok) { message.warning(v.msg); return }
  generating.value = true
  try {
    // 用 raw 拿原始 Response：下载失败时保持「提示 + 静默返回」而非抛给外层 catch
    const res = await http.raw(`${BASE}/download`, {
      method: 'POST',
      body: buildConfig()
    })
    if (!res.ok) { message.error('打包下载失败（HTTP ' + res.status + '）'); return }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${form.name}.zip`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    message.success('已生成并下载 ZIP')
  } catch (e) {
    message.error('打包下载异常：' + (e.message || e))
  } finally {
    generating.value = false
  }
}

const onExport = () => {
  const blob = new Blob([JSON.stringify(buildConfig(), null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${form.name || 'page'}-config.json`
  a.click()
  URL.revokeObjectURL(url)
}

const onImport = () => fileInput.value?.click()
const onFileChange = (e) => {
  const file = e.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const cfg = JSON.parse(String(reader.result))
      applyConfig(cfg)
      message.success('配置已导入')
    } catch (err) {
      message.error('配置文件解析失败：' + err.message)
    }
  }
  reader.readAsText(file)
  e.target.value = ''
}

const resetConfig = () => {
  const snap = JSON.parse(JSON.stringify(initialSnapshot))
  Object.keys(snap).forEach((k) => { form[k] = snap[k] })
  message.success('已重置为默认配置')
}

const applyConfig = (cfg) => {
  if (cfg.name) form.name = cfg.name
  if (cfg.title) form.title = cfg.title
  if (cfg.pageSize) form.pageSize = cfg.pageSize
  form.showTitle = cfg.showTitle !== false
  form.showPagination = cfg.showPagination !== false
  form.searchLayout = cfg.searchLayout || 'inline'
  form.labelColon = cfg.labelColon !== false
  form.formWrap = !!cfg.formWrap
  form.fieldsPerRow = cfg.fieldsPerRow || 3
  form.pageTheme = cfg.pageTheme || 'light'
  form.primaryColor = cfg.primaryColor || 'var(--brand)'
  form.enableExport = !!cfg.enableExport
  form.enableBatchDelete = !!cfg.enableBatchDelete
  form.enableCreate = cfg.enableCreate !== false
  form.enableEdit = cfg.enableEdit !== false
  form.modalWidth = cfg.modalWidth || 600
  form.scrollX = cfg.scrollX || 0
  form.scrollY = cfg.scrollY || 0
  form.striped = !!cfg.striped
  form.stripeColor = cfg.stripeColor || 'var(--bg-hover)'
  form.rowSelectionType = cfg.rowSelectionType || 'checkbox'
  form.labelWidth = cfg.labelWidth || 0
  form.showActionColumn = cfg.showActionColumn !== false
  form.actionBtnType = cfg.actionBtnType || 'link'
  form.actionBtnSize = cfg.actionBtnSize || 'small'
  form.actionDeleteType = cfg.actionDeleteType || 'danger'
  form.actionView = cfg.actionView !== false
  form.actionEdit = cfg.actionEdit !== false
  form.actionDelete = cfg.actionDelete !== false
  if (Array.isArray(cfg.searchFields)) {
    form.searchFields = cfg.searchFields.map((f, fi) => ({
      id: f.id || genId(), name: f.name, label: f.label, type: f.type || 'text',
      placeholder: f.placeholder || '', defaultValue: f.defaultValue || '', required: !!f.required,
      options: ['select', 'radio', 'checkbox'].includes(f.type) ? (f.options || []) : undefined,
      min: f.min, max: f.max,
      collapsed: fi > 0,
      linkageEnabled: !!f.linkageEnabled,
      linkageSource: f.linkageSource || '',
      linkageType: f.linkageType || 'filterOptions',
      linkageValueMaps: f.linkageValueMaps ? (f.linkageValueMaps.map((m) => ({ sourceVal: m.sourceVal, targetVal: m.targetVal }))) : undefined
    }))
  }
  if (Array.isArray(cfg.tableColumns)) {
    form.tableColumns = cfg.tableColumns.map((c) => ({
      dataIndex: c.dataIndex, title: c.title, width: c.width || '', fixed: c.fixed || '',
      customRender: !!c.customRender, renderType: c.renderType || 'text',
      tagOptionsStr: c.tagOptions ? JSON.stringify(c.tagOptions) : (c.tagOptionsStr || ''),
      sortable: !!c.sortable,
      filtersStr: c.filters ? JSON.stringify(c.filters) : (c.filtersStr || ''),
      align: c.align || '',
      ellipsis: !!c.ellipsis
    }))
  }
  if (cfg.dataSource) {
    form.dsUrl = cfg.dataSource.url || ''
    form.dsMethod = cfg.dataSource.method || 'GET'
    const rm = cfg.dataSource.responseMapping || {}
    form.mapList = rm.listField || 'list'
    form.mapTotal = rm.totalField || 'total'
    form.mapId = rm.idField || 'id'
  }
}
// #endregion
</script>

<style scoped>
/* ====== 全局容器 ====== */
.ag-root {
  padding: 20px 24px;
  box-sizing: border-box;
  margin-top: 56px;
}

/* ====== 主体三栏布局 ====== */
.ag-body {
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  align-items: stretch;
  gap: 16px;
  width: 100%;
  min-height: calc(100vh - 90px);
}

/* ====== 左侧：步骤导航 ====== */
.ag-steps-col {
  flex: 0 0 140px;
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  padding: 20px 12px;
  box-shadow: 0 1px 4px var(--shadow-sm);
}
.ag-steps-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-tertiary);
  margin-bottom: 20px;
  padding-left: 4px;
}
.ag-step-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px 4px 16px;
  cursor: pointer;
  border-radius: var(--radius-md);
  transition: all 0.2s;
  margin-bottom: 4px;
}
.ag-step-item:hover { background: var(--brand-bg); }
.ag-step-circle {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  border: 2px solid var(--border-strong);
  color: var(--text-tertiary);
  background: var(--bg-card);
  transition: all 0.25s;
  flex-shrink: 0;
}
.ag-step-active .ag-step-circle {
  border-color: var(--brand);
  background: var(--brand);
  color: var(--text-inverse);
  box-shadow: 0 2px 8px rgba(22,119,255,0.35);
}
.ag-step-done .ag-step-circle {
  border-color: var(--success);
  background: var(--success);
  color: var(--text-inverse);
}
.ag-step-check { font-size: 14px; line-height: 1; }
.ag-step-title {
  font-size: 13px;
  color: var(--text-tertiary);
  text-align: center;
  line-height: 1.3;
  transition: color 0.2s;
}
.ag-step-active .ag-step-title { color: var(--brand); font-weight: 600; }
.ag-step-done .ag-step-title { color: var(--success); }

/* ====== 中间：预览区域 ====== */
.ag-main-col {
  flex: 1 1 0%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.ag-preview-card {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  padding: 20px 24px;
  box-shadow: 0 1px 4px var(--shadow-sm);
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.ag-preview-card-title {
  margin: 0 0 16px;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}
.ag-preview-table-wrap {
  flex: 1;
  border-radius: var(--radius-md);
  overflow: auto;
  transition: background 0.3s;
}
.ag-pv-page-title {
  text-align: center;
  font-weight: 600;
  font-size: 15px;
  color: var(--text-primary);
  padding: 10px;
  margin-bottom: 12px;
  background: var(--bg-hover);
  border-radius: var(--radius-sm);
}
.ag-pv-pagination {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
  padding: 8px 0;
}

/* 底部导航按钮 */
.ag-nav-bar {
  display: flex;
  justify-content: space-between;
  padding: 0 4px;
}

/* ====== 右侧：配置面板 ====== */
.ag-config-col {
  flex: 0 0 300px;
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  box-shadow: 0 1px 4px var(--shadow-sm);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 90px);
}
.ag-config-header {
  padding: 18px 20px 14px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
}
.ag-config-body {
  padding: 16px 20px 20px;
  flex: 1;
}
.ag-config-section { animation: fadeIn 0.2s ease; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }

/* 配置项通用样式 */
.ag-config-group { margin-bottom: 14px; }
.ag-config-group--half { flex: 1; min-width: 0; }
.ag-config-row { display: flex; gap: 12px; }
.ag-cfg-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 6px;
}
.ag-config-subtitle {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-light);
}
.ag-export-opts { margin-bottom: 16px; }
.ag-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  font-size: 13px;
  color: var(--text-secondary);
  border-bottom: 1px dashed var(--border-light);
}
.ag-toggle-row:last-child { border-bottom: none; }
.ag-config-actions-top {
  display: flex;
  gap: 8px;
  margin-top: 20px;
  padding-top: 14px;
  border-top: 1px solid var(--border-light);
}

/* 模板栏 */
.ag-tpl-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 16px;
  padding: 10px 12px;
  background: var(--bg-hover);
  border: 1px dashed var(--border-default);
  border-radius: var(--radius-md);
}
.ag-tpl-label { font-size: 12px; font-weight: 600; color: var(--text-tertiary); white-space: nowrap; }

/* Section bar */
.ag-section-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.ag-section-bar-title { font-size: 14px; font-weight: 600; color: var(--text-primary); }

/* 字段卡片 */
.ag-field-card {
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  margin-bottom: 10px;
  overflow: hidden;
  transition: all 0.2s;
}
.ag-field-card-collapsed { opacity: 0.85; }
.ag-field-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-hover);
  cursor: pointer;
  user-select: none;
}
.ag-field-card-head:hover { background: var(--brand-bg); }
.ag-field-name { font-weight: 500; font-size: 13px; color: var(--text-primary); }
.ag-field-ops { margin-left: auto; }
.ag-field-card-body { padding: 12px; }

/* 表格列编辑器 */
.ag-col-editor {
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  overflow: hidden;
  margin-bottom: 10px;
}
.ag-col-editor-head,
.ag-col-editor-row {
  display: grid;
  grid-template-columns: 1fr 1fr 60px 70px 28px;
  gap: 8px;
  align-items: center;
  padding: 8px 10px;
}
.ag-col-editor-head {
  background: var(--bg-hover);
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
  border-bottom: 1px solid var(--border-default);
}
.ag-col-editor-item { border-bottom: 1px solid var(--border-light); padding-bottom: 8px; margin-bottom: 8px; }
.ag-col-editor-item:last-child { border-bottom: none; }

/* ====== 预览主题色 ====== */
.ag-pv-theme-light { background: var(--bg-card); }
.ag-pv-theme-dark {
  background: #141414; color: rgba(255,255,255,0.85);
}
.ag-pv-theme-dark .ag-pv-page-title { background: var(--text-primary); color: #fff; }
.ag-pv-theme-dark :deep(.ant-table-thead > tr > th) {
  background: #262626 !important; color: rgba(255,255,255,0.85); border-bottom: 1px solid var(--text-secondary);
}
.ag-pv-theme-dark :deep(.ant-table-tbody > tr > td) {
  background: var(--text-primary) !important; border-bottom: 1px solid #303030; color: rgba(255,255,255,0.85);
}
.ag-pv-theme-dark :deep(.ant-table-tbody > tr:hover > td) { background: #262626 !important; }
.ag-pv-theme-dark :deep(.ant-table-tbody a) { color: var(--admin-primary, var(--brand)); }
.ag-pv-theme-dark :deep(.ant-tag) { background: #262626 !important; border-color: var(--text-secondary) !important; }
.ag-pv-theme-dark :deep(.ant-tag-green) { color: #73d13d !important; background: #162312 !important; border-color: #274916 !important; }
.ag-pv-theme-dark :deep(.ant-tag-red) { color: var(--error-light) !important; background: #2a1215 !important; border-color: #58181c !important; }
.ag-pv-theme-dark :deep(.ant-empty-description) { color: rgba(255,255,255,0.45) !important; }
.ag-pv-theme-dark :deep(.ant-pagination-item) { background: #141414 !important; border-color: var(--text-secondary) !important; }
.ag-pv-theme-dark :deep(.ant-pagination-item a) { color: rgba(255,255,255,0.85) !important; }
.ag-pv-theme-dark :deep(.ant-pagination-item-active) { border-color: var(--admin-primary, var(--brand)) !important; }
.ag-pv-theme-dark :deep(.ant-pagination-item-active a) { color: var(--admin-primary, var(--brand)) !important; }

/* 响应式 */
@media (max-width: 900px) {
  .ag-body { flex-direction: column; }
  .ag-steps-col { flex: none; flex-direction: row; gap: 8px; overflow-x: auto; padding: 12px; }
  .ag-step-item { flex-direction: row; padding: 8px 12px; margin-bottom: 0; }
  .ag-step-title { font-size: 12px; }
  .ag-config-col { flex: none; max-height: none; }
}
</style>
