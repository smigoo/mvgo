<template>
  <div class="json-editor">
    <!-- <div class="editor-header">
      <a-space>
        <a-button type="primary" @click="loadConfig" :loading="loading">
          <template #icon><ReloadOutlined /></template>
          读取配置
        </a-button>
        <a-button type="primary" @click="saveConfig" :loading="saving" :disabled="!hasChanges">
          <template #icon><SaveOutlined /></template>
          保存配置
        </a-button>
        <a-button @click="formatJson">
          <template #icon><FormatPainterOutlined /></template>
          格式化
        </a-button>
        <a-button @click="resetChanges" :disabled="!hasChanges">
          <template #icon><UndoOutlined /></template>
          重置
        </a-button>
        <a-tag v-if="hasChanges" color="warning">未保存</a-tag>
        <a-tag v-else color="success">已保存</a-tag>
      </a-space>
    </div> -->

    <a-spin :spinning="loading" tip="加载中...">
      <div class="editor-content">
        <!-- <a-textarea
          v-model:value="jsonString"
          :rows="25"
          placeholder="JSON配置内容"
          class="json-textarea"
          @change="handleChange"
        /> -->
        <declareEditorForm :jsonData="jsonParserData" @save="saveJsonParserData" />
      </div>
    </a-spin>

    <div class="editor-footer" v-if="errorMessage">
      <a-alert :message="errorMessage" type="error" show-icon closable @close="errorMessage = ''" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { message } from 'ant-design-vue'
import {
  ReloadOutlined,
  SaveOutlined,
  FormatPainterOutlined,
  UndoOutlined
} from '@ant-design/icons-vue'
import { readDeclareJson, writeDeclareJson } from '@/api/declare-file-editor'
import declareEditorForm from './DeclareEditorForm.vue'
const props = defineProps({
  componentId: {
    type: String,
    required: true
  }
})

const jsonString = ref('')
const originalJson = ref('')
const loading = ref(false)
const saving = ref(false)
const errorMessage = ref('')

const jsonParserData = ref(null)

const hasChanges = computed(() => {
  return jsonString.value !== originalJson.value && jsonString.value.trim() !== ''
})
const fliterJsonParserData = () => {
  const errors = []

  // 校验必需字段 - componentId
  if (!('componentId' in jsonParserData.value)) {
    errors.push('缺少必需字段: componentId')
  }

  // 校验必需字段 - componentName
  if (!('componentName' in jsonParserData.value)) {
    errors.push('缺少必需字段: componentName')
  }

  // 校验必需字段 - version
  if (!('version' in jsonParserData.value)) {
    errors.push('缺少必需字段: version')
  }

  // 校验必需字段 - attribute
  if (!('attribute' in jsonParserData.value)) {
    errors.push('缺少必需字段: attribute')
  } else if (
    typeof jsonParserData.value.attribute !== 'object' ||
    jsonParserData.value.attribute === null
  ) {
    errors.push('attribute 必须是一个对象')
  } else {
    // 校验 attribute 内的必需字段
    if (!('aspectRatio' in jsonParserData.value.attribute)) {
      errors.push('缺少必需字段: attribute.aspectRatio')
    } else if (!Array.isArray(jsonParserData.value.attribute.aspectRatio)) {
      errors.push('attribute.aspectRatio 必须是数组')
    }

    if (!('title' in jsonParserData.value.attribute)) {
      errors.push('缺少必需字段: attribute.title')
    }

    if (!('description' in jsonParserData.value.attribute)) {
      errors.push('缺少必需字段: attribute.description')
    }

    if (!('imgUrl' in jsonParserData.value.attribute)) {
      errors.push('缺少必需字段: attribute.imgUrl')
    }
  }

  // 校验必需字段 - businessEvents
  if (!('businessEvents' in jsonParserData.value)) {
    errors.push('缺少必需字段: businessEvents')
  } else if (
    typeof jsonParserData.value.businessEvents !== 'object' ||
    jsonParserData.value.businessEvents === null
  ) {
    errors.push('businessEvents 必须是一个对象')
  }

  // 校验必需字段 - businessStatuses
  if (!('businessStatuses' in jsonParserData.value)) {
    errors.push('缺少必需字段: businessStatuses')
  } else if (
    typeof jsonParserData.value.businessStatuses !== 'object' ||
    jsonParserData.value.businessStatuses === null
  ) {
    errors.push('businessStatuses 必须是一个对象')
  }

  // 校验必需字段 - dataSources
  if (!('dataSources' in jsonParserData.value)) {
    errors.push('缺少必需字段: dataSources')
  } else {
    // dataSources 可以是 null 或数组
    if (
      jsonParserData.value.dataSources !== null &&
      !Array.isArray(jsonParserData.value.dataSources)
    ) {
      errors.push('dataSources 必须是数组或 null')
    }
    // 如果是 null,转换为空数组
    if (jsonParserData.value.dataSources === null) {
      jsonParserData.value.dataSources = []
    }
  }

  // 校验必需字段 - formSources
  if (!('formSources' in jsonParserData.value)) {
    errors.push('缺少必需字段: formSources')
  } else {
    // formSources 可以是 null 或数组
    if (
      jsonParserData.value.formSources !== null &&
      !Array.isArray(jsonParserData.value.formSources)
    ) {
      errors.push('formSources 必须是数组或 null')
    }
    // 如果是 null,转换为空数组
    if (jsonParserData.value.formSources === null) {
      jsonParserData.value.formSources = []
    }
  }

  // 如果有错误,抛出异常
  if (errors.length > 0) {
    const errorMsg =
      '配置文件校验失败:\n' + errors.map((err, index) => `${index + 1}. ${err}`).join('\n')
    throw new Error(errorMsg)
  }
}
async function loadConfig() {
  loading.value = true
  errorMessage.value = ''
  try {
    const config = await readDeclareJson(props.componentId)
    jsonParserData.value = config

    // 校验配置字段
    fliterJsonParserData()

    const formatted = JSON.stringify(jsonParserData.value, null, 2)
    jsonString.value = formatted
    originalJson.value = formatted
    message.success('配置读取成功')
  } catch (error) {
    errorMessage.value = `读取配置失败: ${error.message}`
    message.error('读取配置失败:', error)
    console.error('配置校验错误:', error)
  } finally {
    loading.value = false
  }
}
async function saveJsonParserData(data) {
  await writeDeclareJson(props.componentId, data)
  jsonParserData.value = data
  const formatted = JSON.stringify(data, null, 2)
  jsonString.value = formatted
  originalJson.value = formatted
}
async function saveConfig() {
  if (!validateJson()) {
    return
  }

  saving.value = true
  errorMessage.value = ''
  try {
    const config = JSON.parse(jsonString.value)
    await writeDeclareJson(props.componentId, config)
    originalJson.value = jsonString.value
    message.success('配置保存成功')
  } catch (error) {
    errorMessage.value = `保存配置失败: ${error.message}`
    message.error('保存配置失败')
  } finally {
    saving.value = false
  }
}

function validateJson() {
  try {
    JSON.parse(jsonString.value)
    errorMessage.value = ''
    return true
  } catch (error) {
    errorMessage.value = `JSON格式错误: ${error.message}`
    return false
  }
}

function formatJson() {
  try {
    const obj = JSON.parse(jsonString.value)
    jsonString.value = JSON.stringify(obj, null, 2)
    errorMessage.value = ''
    message.success('格式化成功')
  } catch (error) {
    errorMessage.value = `JSON格式错误，无法格式化: ${error.message}`
    message.error('格式化失败')
  }
}

function resetChanges() {
  jsonString.value = originalJson.value
  errorMessage.value = ''
  message.info('已重置为上次保存的内容')
}

function handleChange() {
  errorMessage.value = ''
}

watch(
  () => props.componentId,
  () => {
    loadConfig()
  },
  { immediate: true }
)

defineExpose({
  loadConfig,
  saveConfig
})
</script>

<style scoped lang="less">
.json-editor {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--bg-page);
  color: var(--text-secondary);
  font-size: 12px;

  .editor-header {
    padding: 8px;
    background: var(--bg-alt);
    border-radius: var(--radius-xs);
  }

  .editor-content {
    flex: 1;
    overflow: hidden;

    .json-textarea {
      font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
      font-size: 12px;
      line-height: 1.6;

      :deep(textarea) {
        resize: none;
      }
    }
  }

  .editor-footer {
    margin-top: 8px;
  }
}
</style>
