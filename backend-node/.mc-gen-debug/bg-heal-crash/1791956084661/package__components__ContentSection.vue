<template>
  <div class="c-6dddd6-slot-con">
    <!-- 产品图片 -->
    <a-form-item label="产品图片" class="c-6dddd6-antd-form-item c-6dddd6-form-item-upload">
      <a-upload
        v-model:file-list="fileList"
        list-type="picture-card"
        :show-upload-list="true"
        :before-upload="beforeUpload"
        class="c-6dddd6-ant-design-vue-upload"
      >
        <div class="c-6dddd6-upload-trigger">
          <span class="c-6dddd6-upload-plus">+</span>
        </div>
      </a-upload>
    </a-form-item>

    <!-- 产品编码 -->
    <a-form-item class="c-6dddd6-antd-form-item">
      <template #label>
        <span class="c-6dddd6-label-required">*</span>
        <span class="c-6dddd6-label-text">产品编码</span>
      </template>
      <a-input
        v-model:value="form.productCode"
        placeholder="若不输入则系统自动生成"
        class="c-6dddd6-antd-input"
      />
    </a-form-item>

    <!-- 产品名称 -->
    <a-form-item class="c-6dddd6-antd-form-item">
      <template #label>
        <span class="c-6dddd6-label-required">*</span>
        <span class="c-6dddd6-label-text">产品名称</span>
      </template>
      <a-input
        v-model:value="form.productName"
        placeholder="请输入产品名称"
        class="c-6dddd6-antd-input"
      />
    </a-form-item>

    <!-- 产品型号 -->
    <a-form-item label="产品型号" class="c-6dddd6-antd-form-item">
      <a-input
        v-model:value="form.productModel"
        placeholder="请输入产品型号"
        class="c-6dddd6-antd-input"
      />
    </a-form-item>

    <!-- 产品厂家 -->
    <a-form-item label="产品厂家" class="c-6dddd6-antd-form-item">
      <a-select
        v-model:value="form.vendor"
        placeholder="请选择厂商"
        class="c-6dddd6-antd-select"
        :options="vendorOptions"
      />
    </a-form-item>

    <!-- 产品影子时间 -->
    <a-form-item label="产品影子时间" class="c-6dddd6-antd-form-item c-6dddd6-form-item-inline">
      <a-input v-model:value="form.shadowTime" class="c-6dddd6-antd-input c-6dddd6-input-inline" />
      <span class="c-6dddd6-inline-unit">min</span>
    </a-form-item>

    <!-- 心跳周期时间 -->
    <a-form-item label="心跳周期时间" class="c-6dddd6-antd-form-item c-6dddd6-form-item-inline">
      <a-input v-model:value="form.heartbeatTime" class="c-6dddd6-antd-input c-6dddd6-input-inline" />
      <a-select
        v-model:value="form.heartbeatUnit"
        class="c-6dddd6-antd-select c-6dddd6-select-inline"
        :options="unitOptions"
      />
    </a-form-item>

    <!-- 所属分类 -->
    <a-form-item class="c-6dddd6-antd-form-item">
      <template #label>
        <span class="c-6dddd6-label-required">*</span>
        <span class="c-6dddd6-label-text">所属分类</span>
      </template>
      <a-select
        v-model:value="form.category"
        placeholder="通信类/情报板"
        class="c-6dddd6-antd-select"
        :options="categoryOptions"
      />
    </a-form-item>

    <!-- 所属组织 -->
    <a-form-item label="所属组织" class="c-6dddd6-antd-form-item">
      <a-select
        v-model:value="form.organization"
        placeholder="请输入所属组织"
        class="c-6dddd6-antd-select"
        :options="orgOptions"
      />
    </a-form-item>

    <!-- 公司认证硬件产品 -->
    <a-form-item class="c-6dddd6-antd-form-item">
      <template #label>
        <span class="c-6dddd6-label-required">*</span>
        <span class="c-6dddd6-label-text c-6dddd6-label-two-line">公司认证<br />硬件产品</span>
      </template>
      <a-radio-group v-model:value="form.hardwareAuth" class="c-6dddd6-antd-radio">
        <a-radio value="否">否</a-radio>
        <a-radio value="是">是</a-radio>
      </a-radio-group>
    </a-form-item>

    <!-- 链接类型 -->
    <a-form-item label="链接类型" class="c-6dddd6-antd-form-item">
      <a-radio-group v-model:value="form.linkType" class="c-6dddd6-antd-radio">
        <a-radio value="直连设备">直连设备</a-radio>
        <a-radio value="网关设备">网关设备</a-radio>
        <a-radio value="网关子设备">网关子设备</a-radio>
        <a-radio value="PLC柜">PLC柜</a-radio>
      </a-radio-group>
    </a-form-item>

    <!-- 产品描述 -->
    <a-form-item label="产品描述" class="c-6dddd6-antd-form-item c-6dddd6-form-item-textarea">
      <a-textarea
        v-model:value="form.description"
        placeholder="请输入产品描述"
        :rows="4"
        class="c-6dddd6-antd-textarea"
      />
    </a-form-item>

    <!-- 底部按钮 -->
    <div class="c-6dddd6-frame-2136639168 c-6dddd6-form-footer">
      <a-button class="c-6dddd6-ant-design-vue-button c-6dddd6-btn-cancel" @click="handleCancel">
        取消
      </a-button>
      <a-button type="primary" class="c-6dddd6-ant-design-vue-button c-6dddd6-btn-save" @click="handleSave">
        保存
      </a-button>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'

// 表单数据
const form = reactive({
  productCode: '',
  productName: '',
  productModel: '',
  vendor: undefined,
  shadowTime: '5',
  heartbeatTime: '1',
  heartbeatUnit: 'min',
  category: undefined,
  organization: undefined,
  hardwareAuth: '否',
  linkType: '直连设备',
  description: ''
})

// 上传文件列表
const fileList = ref([])

// 下拉选项
const vendorOptions = ref([])
const unitOptions = ref([
  { label: 'min', value: 'min' },
  { label: 's', value: 's' },
  { label: 'h', value: 'h' }
])
const categoryOptions = ref([])
const orgOptions = ref([])

// 上传前置校验
const beforeUpload = () => {
  // 禁止自动上传，仅本地预览
  return false
}

// 取消
const handleCancel = () => {
  console.log('[ContentSection] 取消')
}

// 保存
const handleSave = () => {
  console.log('[ContentSection] 保存', form)
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-6dddd6-slot-con {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: hidden;
}

// 表单标签基础样式
.c-6dddd6-label-required {
  color: #ff0000;
  font-size: @fontSize;
  margin-right: 2px;
  line-height: 1.5;
}

.c-6dddd6-label-text {
  color: @color-text-base;
  font-size: @fontSize;
  line-height: 1.5;
  white-space: nowrap;
}

.c-6dddd6-label-two-line {
  white-space: normal;
  text-align: right;
}

// 表单项
.c-6dddd6-antd-form-item {
  display: flex;
  flex-direction: row;
  flex-shrink: 0;
  margin-bottom: 0;
}

// 内联表单项（输入框 + 单位）
.c-6dddd6-form-item-inline {
  :deep(.ant-form-item-control-input-content) {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 10px;
  }
}

.c-6dddd6-input-inline {
  flex: 1;
  min-width: 0;
}

.c-6dddd6-select-inline {
  width: 100px;
  flex-shrink: 0;
}

.c-6dddd6-inline-unit {
  color: @color-text-base;
  font-size: @fontSize;
  flex-shrink: 0;
}

// 产品描述
.c-6dddd6-form-item-textarea {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;

  :deep(.ant-form-item-control) {
    height: 100%;
    min-height: 0;
  }

  :deep(.ant-form-item-control-input) {
    height: 100%;
    min-height: 0;
  }

  :deep(.ant-form-item-control-input-content) {
    height: 100%;
    min-height: 0;
  }
}

.c-6dddd6-antd-textarea {
  width: 100%;
  height: 100%;
  min-height: 80px;
  resize: none;
}

// 上传区域
.c-6dddd6-form-item-upload {
  :deep(.ant-form-item-control-input-content) {
    display: flex;
    flex-direction: row;
  }
}

.c-6dddd6-ant-design-vue-upload {
  :deep(.ant-upload.ant-upload-select) {
    width: 140px;
    height: 105px;
    border: 1px dashed @color-border;
    border-radius: @border-radius-sm;
    background: transparent;
  }
}

.c-6dddd6-upload-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.c-6dddd6-upload-plus {
  font-size: calc(@fontSize * 1.7);
  color: @color-text-secondary;
  line-height: 1;
}

// 底部按钮组
.c-6dddd6-form-footer {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-end;
  gap: 20px;
  flex-shrink: 0;
  padding-top: 8px;
}

.c-6dddd6-ant-design-vue-button {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  min-width: 80px;
  height: 40px;
  font-size: @fontSize;
  border-radius: @border-radius-base;
}

.c-6dddd6-btn-cancel {
  color: @color-text-secondary;
  background: @color-bg-container;
  border: 1px solid @color-border;
}

.c-6dddd6-btn-save {
  color: @color-text-inverse;
  background: @color-primary;
  border: none;
  font-weight: @fontWeightStrong;
  padding: 0 32px;
}
</style>