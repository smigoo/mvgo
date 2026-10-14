<template>
  <div class="c-component-slot-con">
    <!-- 产品图片 -->
    <div class="c-component-antd-form-item">
      <div class="c-component-antd-form-item-label">
        <span class="c-component-form-label-text">产品图片</span>
      </div>
      <div class="c-component-ant-design-vue-upload">
        <div class="c-component-upload-preview"></div>
      </div>
    </div>

    <!-- 产品编码 -->
    <div class="c-component-antd-form-item">
      <div class="c-component-antd-form-item-label">
        <span class="c-component-form-required">*</span>
        <span class="c-component-form-label-text">产品编码</span>
      </div>
      <a-input
        v-model:value="formData.productCode"
        placeholder="若不输入则系统自动生成"
        class="c-component-form-control"
      />
    </div>

    <!-- 产品名称 -->
    <div class="c-component-antd-form-item">
      <div class="c-component-antd-form-item-label">
        <span class="c-component-form-required">*</span>
        <span class="c-component-form-label-text">产品名称</span>
      </div>
      <a-input
        v-model:value="formData.productName"
        placeholder="请输入产品名称"
        class="c-component-form-control"
      />
    </div>

    <!-- 产品型号 -->
    <div class="c-component-antd-form-item">
      <div class="c-component-antd-form-item-label">
        <span class="c-component-form-label-text">产品型号</span>
      </div>
      <a-input
        v-model:value="formData.productModel"
        placeholder="请输入产品型号"
        class="c-component-form-control"
      />
    </div>

    <!-- 产品厂家 -->
    <div class="c-component-antd-form-item">
      <div class="c-component-antd-form-item-label">
        <span class="c-component-form-label-text">产品厂家</span>
      </div>
      <a-select
        v-model:value="formData.manufacturer"
        placeholder="请选择厂商"
        class="c-component-form-control"
      >
        <a-select-option value="manufacturer-1">请选择厂商</a-select-option>
      </a-select>
    </div>

    <!-- 产品影子时间 -->
    <div class="c-component-antd-form-item">
      <div class="c-component-antd-form-item-label">
        <span class="c-component-form-label-text">产品影子时间</span>
      </div>
      <a-input
        v-model:value="formData.shadowTime"
        class="c-component-form-control c-component-form-control-narrow"
      />
      <div class="c-component-frame-2136639184">
        <span class="c-component-form-unit">min</span>
      </div>
    </div>

    <!-- 心跳周期时间 -->
    <div class="c-component-antd-form-item">
      <div class="c-component-antd-form-item-label">
        <span class="c-component-form-label-text">心跳周期时间</span>
      </div>
      <a-input
        v-model:value="formData.heartbeatTime"
        class="c-component-form-control c-component-form-control-narrow"
      />
      <a-select
        v-model:value="formData.heartbeatUnit"
        class="c-component-form-control c-component-form-control-narrow"
      >
        <a-select-option value="min">min</a-select-option>
      </a-select>
    </div>

    <!-- 所属分类 -->
    <div class="c-component-antd-form-item">
      <div class="c-component-antd-form-item-label">
        <span class="c-component-form-required">*</span>
        <span class="c-component-form-label-text">所属分类</span>
      </div>
      <a-select
        v-model:value="formData.category"
        class="c-component-form-control"
      >
        <a-select-option value="communication">通信类/情报板</a-select-option>
      </a-select>
    </div>

    <!-- 所属组织 -->
    <div class="c-component-antd-form-item">
      <div class="c-component-antd-form-item-label">
        <span class="c-component-form-label-text">所属组织</span>
      </div>
      <a-select
        v-model:value="formData.organization"
        placeholder="请输入所属组织"
        class="c-component-form-control"
      >
        <a-select-option value="org-1">请输入所属组织</a-select-option>
      </a-select>
    </div>

    <!-- 公司认证硬件产品 -->
    <div class="c-component-antd-form-item">
      <div class="c-component-antd-form-item-label c-component-form-label-multi">
        <span class="c-component-form-required">*</span>
        <span class="c-component-form-label-text">公司认证<br />硬件产品</span>
      </div>
      <a-radio-group v-model:value="formData.certification" class="c-component-antd-radio">
        <a-radio value="否">否</a-radio>
        <a-radio value="是">是</a-radio>
      </a-radio-group>
    </div>

    <!-- 链接类型 -->
    <div class="c-component-antd-form-item">
      <div class="c-component-antd-form-item-label">
        <span class="c-component-form-label-text">链接类型</span>
      </div>
      <a-radio-group v-model:value="formData.linkType" class="c-component-antd-radio">
        <a-radio value="直连设备">直连设备</a-radio>
        <a-radio value="网关设备">网关设备</a-radio>
        <a-radio value="网关子设备">网关子设备</a-radio>
        <a-radio value="PLC柜">PLC柜</a-radio>
      </a-radio-group>
    </div>

    <!-- 产品描述 -->
    <div class="c-component-antd-form-item c-component-form-item-textarea">
      <div class="c-component-antd-form-item-label">
        <span class="c-component-form-label-text">产品描述</span>
      </div>
      <a-textarea
        v-model:value="formData.description"
        placeholder="请输入产品描述"
        :rows="4"
        class="c-component-form-control c-component-form-textarea"
      />
    </div>

    <!-- 底部操作按钮 -->
    <div class="c-component-frame-2136639168 c-component-form-footer">
      <a-button class="c-component-ant-design-vue-button c-component-btn-default" @click="handleCancel">
        取消
      </a-button>
      <a-button type="primary" class="c-component-ant-design-vue-button c-component-btn-primary" @click="handleSave">
        保存
      </a-button>
    </div>
  </div>
</template>

<script setup>
import { reactive } from 'vue'

const props = defineProps({
  businessConfig: {
    type: Object,
    default: () => ({})
  }
})

const emit = defineEmits(['cancel', 'save'])

const formData = reactive({
  productCode: '',
  productName: '',
  productModel: '',
  manufacturer: undefined,
  shadowTime: '5',
  heartbeatTime: '1',
  heartbeatUnit: 'min',
  category: 'communication',
  organization: undefined,
  certification: '否',
  linkType: '直连设备',
  description: ''
})

const handleCancel = () => {
  emit('cancel')
}

const handleSave = () => {
  emit('save', { ...formData })
}
</script>

<style lang="less" scoped>
@color-text-required: #333333;
@color-form-control-border: #e8e8e8;
@color-text-placeholder: #333333;

@import '../../resources/styles/index.less';

.c-component-slot-con {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  gap: 12px;
}

.c-component-antd-form-item {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 9px;
  width: 100%;
  flex-shrink: 0;
}

.c-component-form-item-textarea {
  align-items: flex-start;
}

.c-component-antd-form-item-label {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-end;
  flex-shrink: 0;
  width: 90px;
  text-align: right;
  gap: 2px;
}

.c-component-form-label-multi {
  align-items: flex-start;
}

.c-component-form-required {
  color: @color-text-required;
  font-size: @fontSize;
  line-height: 21px;
  flex-shrink: 0;
}

.c-component-form-label-text {
  font-size: @fontSize;
  color: @color-text-base;
  line-height: 21px;
  white-space: nowrap;
  flex-shrink: 0;
}

.c-component-ant-design-vue-upload {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.c-component-upload-preview {
  width: 140px;
  height: 105px;
  background: @color-border;
  border-radius: @border-radius-sm;
  overflow: hidden;
}

.c-component-form-control {
  flex: 1;
  min-width: 0;
}

.c-component-form-control-narrow {
  flex: 0 0 100px;
  min-width: 0;
}

.c-component-form-textarea {
  flex: 1;
  min-height: 100px;
}

.c-component-frame-2136639184 {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.c-component-form-unit {
  font-size: @fontSize;
  color: @color-text-secondary;
  line-height: 21px;
  white-space: nowrap;
}

.c-component-antd-radio {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 20px;
  flex: 1;
  min-width: 0;
}

.c-component-form-footer {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-end;
  gap: 20px;
  flex-shrink: 0;
}

.c-component-ant-design-vue-button {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.c-component-btn-default {
  min-width: 88px;
}

.c-component-btn-primary {
  min-width: 88px;
}

:deep(.ant-input) {
  border-radius: @border-radius-sm;
  border-color: @color-form-control-border;
  color: @color-text-base;
  background: @color-bg-container;
}

:deep(.ant-input::placeholder) {
  color: @color-text-placeholder;
}

:deep(.ant-input:focus),
:deep(.ant-input-focused) {
  border-color: @color-primary;
  box-shadow: 0 0 0 2px @color-primary-bg;
}

:deep(.ant-select-selector) {
  border-radius: @border-radius-sm !important;
  border-color: @color-form-control-border !important;
  color: @color-text-base;
  background: @color-bg-container !important;
}

:deep(.ant-select-selection-placeholder) {
  color: @color-text-placeholder;
}

:deep(.ant-select-focused .ant-select-selector) {
  border-color: @color-primary !important;
  box-shadow: 0 0 0 2px @color-primary-bg !important;
}

:deep(.ant-radio-wrapper) {
  font-size: @fontSize;
  color: @color-text-base;
}

:deep(.ant-radio-checked .ant-radio-inner) {
  border-color: @color-primary;
  background-color: @color-primary;
}

:deep(.ant-textarea) {
  border-radius: @border-radius-sm;
  border-color: @color-form-control-border;
}

:deep(.ant-btn-primary) {
  background: @color-primary;
  border-color: @color-primary;
  border-radius: @border-radius-sm;
}

:deep(.ant-btn-primary:hover) {
  background: @color-primary-bg-hover;
  border-color: @color-primary-bg-hover;
}

:deep(.ant-btn-default) {
  border-radius: @border-radius-sm;
  border-color: @color-form-control-border;
  color: @color-text-secondary;
}
</style>