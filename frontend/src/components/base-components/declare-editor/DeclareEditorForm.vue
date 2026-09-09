<template>
  <div class="declare-editor-form">
    <a-spin :spinning="loading">
      <!-- 操作按钮 -->
      <a-space style="margin-bottom: 10px">
        <!-- <a-upload :before-upload="handleFileUpload" :show-upload-list="false" accept=".json">
          <a-button>
            <upload-outlined />
            导入JSON文件
          </a-button>
        </a-upload> -->
        <a-button type="primary" @click="handleSave">
          <save-outlined />
          保存配置
        </a-button>
        <a-button @click="handleExport">
          <download-outlined />
          导出JSON
        </a-button>
        <a-button @click="handleReset" danger>
          <reload-outlined />
          重置
        </a-button>
      </a-space>

      <!-- 动态表单 -->
      <div v-if="editData" class="json-editor">
        <json-form-item v-model:data="editData" :path="[]" />
      </div>

      <a-empty v-else description="暂无数据，请导入JSON文件" />
    </a-spin>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import {
  UploadOutlined,
  DownloadOutlined,
  ReloadOutlined,
  SaveOutlined
} from '@ant-design/icons-vue'
import JsonFormItem from './JsonFormItem.vue'

// Props 定义
const props = defineProps({
  // 外部传入的JSON数据
  jsonData: {
    type: [Object, Array],
    default: null
  },
  // 是否自动加载同目录下的 declare.json
  autoLoad: {
    type: Boolean,
    default: false
  }
})

// Emits 定义
const emit = defineEmits(['save', 'update:jsonData'])

// 内部状态
const loading = ref(false)
const editData = ref(null) // 编辑中的数据副本
const originalData = ref(null) // 原始数据备份

// 初始化编辑数据
const initEditData = (data) => {
  if (data) {
    originalData.value = JSON.parse(JSON.stringify(data))
    editData.value = JSON.parse(JSON.stringify(data))
  }
}

// 监听外部传入的数据变化
watch(
  () => props.jsonData,
  (newData) => {
    if (newData) {
      initEditData(newData)
    }
  },
  { immediate: true }
)

// 文件上传处理
const handleFileUpload = (file) => {
  loading.value = true
  const reader = new FileReader()

  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result)
      initEditData(data)
      message.success('JSON文件加载成功')
    } catch (error) {
      message.error('JSON文件解析失败: ' + error.message)
    } finally {
      loading.value = false
    }
  }

  reader.onerror = () => {
    message.error('文件读取失败')
    loading.value = false
  }

  reader.readAsText(file)
  return false // 阻止自动上传
}

// 保存配置
const handleSave = () => {
  if (!editData.value) {
    message.warning('没有可保存的数据')
    return
  }
  if (editData.value.dataSources?.length === 0) editData.value.dataSources = null
  if (editData.value.formSources?.length === 0) editData.value.formSources = null
  // 将编辑后的数据暴露出去
  emit('save', JSON.parse(JSON.stringify(editData.value)))
  emit('update:jsonData', JSON.parse(JSON.stringify(editData.value)))

  // 更新原始数据
  originalData.value = JSON.parse(JSON.stringify(editData.value))

  message.success('配置已保存')
}

// 导出JSON
const handleExport = () => {
  if (!editData.value) {
    message.warning('没有可导出的数据')
    return
  }

  const dataStr = JSON.stringify(editData.value, null, 2)
  const blob = new Blob([dataStr], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'declare.json'
  link.click()
  URL.revokeObjectURL(url)
  message.success('JSON文件已导出')
}

// 重置
const handleReset = () => {
  if (!originalData.value) {
    message.warning('没有可重置的数据')
    return
  }

  editData.value = JSON.parse(JSON.stringify(originalData.value))
  message.success('已重置为初始状态')
}

// 组件挂载时自动加载默认文件
onMounted(async () => {
  if (props.autoLoad && !props.jsonData) {
    try {
      loading.value = true
      if (!import.meta.env.DEV) return
      // 仅开发环境加载 workspace 示例；custom-components 不参与生产构建
      const declareJson = await import(
        '../../../workspace/custom-components/c-mc-demo/declare.json'
      )
      const data = declareJson.default || declareJson
      initEditData(data)
    } catch (error) {
      console.warn('未找到默认的 declare.json 文件:', error)
    } finally {
      loading.value = false
    }
  }
})

// 暴露方法供父组件调用
defineExpose({
  getData: () => editData.value,
  setData: (data) => initEditData(data),
  reset: handleReset,
  save: handleSave
})
</script>

<style scoped>
.declare-editor-form {
  padding: 4px;
  background: var(--bg-page);
  color: var(--text-secondary);
  width: 100%;
  box-sizing: border-box;
}

.json-editor {
  border: none;
  border-radius: 0;
  padding: 4px 0;
  background: var(--bg-page);
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}
</style>
