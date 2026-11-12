/**
 * 组件模板定义
 * 用于手动创建组件时的初始文件
 */

const templates = {
  // 空白模板
  blank: {
    name: '空白模板',
    description: '最基础的Vue组件结构',
    indexVue: `<template>
  <div class="mc-component">
    <h1>{{ title }}</h1>
    <p>开始编辑你的组件...</p>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const title = ref('新组件')

// 在这里添加你的逻辑
</script>

<style scoped>
.mc-component {
  padding: 20px;
  text-align: center;
}

h1 {
  color: #1890ff;
  margin-bottom: 16px;
}
</style>`,
    config: {
      name: '',
      description: '手动创建的组件',
      version: '1.0.0',
      type: 'manual',
      template: 'blank'
    }
  },

  // 数据表格模板
  table: {
    name: '数据表格',
    description: '带分页的数据表格组件',
    indexVue: `<template>
  <div class="table-component">
    <a-table
      :columns="columns"
      :data-source="dataSource"
      :pagination="pagination"
      :loading="loading"
    />
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'

const loading = ref(false)

const columns = [
  {
    title: '名称',
    dataIndex: 'name',
    key: 'name',
  },
  {
    title: '年龄',
    dataIndex: 'age',
    key: 'age',
  },
  {
    title: '地址',
    dataIndex: 'address',
    key: 'address',
  },
]

const dataSource = ref([
  {
    key: '1',
    name: '张三',
    age: 32,
    address: '北京市朝阳区',
  },
  {
    key: '2',
    name: '李四',
    age: 28,
    address: '上海市浦东新区',
  },
])

const pagination = reactive({
  current: 1,
  pageSize: 10,
  total: 2,
})
</script>

<style scoped>
.table-component {
  padding: 20px;
}
</style>`,
    config: {
      name: '',
      description: '数据表格组件',
      version: '1.0.0',
      type: 'manual',
      template: 'table'
    }
  },

  // 表单模板
  form: {
    name: '表单',
    description: '带验证的表单组件',
    indexVue: `<template>
  <div class="form-component">
    <a-form
      :model="formState"
      :label-col="{ span: 6 }"
      :wrapper-col="{ span: 18 }"
      @finish="onFinish"
    >
      <a-form-item
        label="用户名"
        name="username"
        :rules="[{ required: true, message: '请输入用户名' }]"
      >
        <a-input v-model:value="formState.username" />
      </a-form-item>

      <a-form-item
        label="邮箱"
        name="email"
        :rules="[
          { required: true, message: '请输入邮箱' },
          { type: 'email', message: '请输入有效的邮箱' }
        ]"
      >
        <a-input v-model:value="formState.email" />
      </a-form-item>

      <a-form-item
        label="备注"
        name="remark"
      >
        <a-textarea v-model:value="formState.remark" :rows="4" />
      </a-form-item>

      <a-form-item :wrapper-col="{ offset: 6, span: 18 }">
        <a-button type="primary" html-type="submit">提交</a-button>
        <a-button style="margin-left: 10px" @click="resetForm">重置</a-button>
      </a-form-item>
    </a-form>
  </div>
</template>

<script setup>
import { reactive } from 'vue'
import { message } from 'ant-design-vue'

const formState = reactive({
  username: '',
  email: '',
  remark: '',
})

const onFinish = (values) => {
  console.log('提交的数据:', values)
  message.success('提交成功！')
}

const resetForm = () => {
  formState.username = ''
  formState.email = ''
  formState.remark = ''
}
</script>

<style scoped>
.form-component {
  padding: 20px;
  max-width: 600px;
  margin: 0 auto;
}
</style>`,
    config: {
      name: '',
      description: '表单组件',
      version: '1.0.0',
      type: 'manual',
      template: 'form'
    }
  }
}

/**
 * 获取指定模板
 * @param {string} templateType - 模板类型
 * @param {string} componentName - 组件名称
 * @returns {object} 模板对象
 */
function getTemplate(templateType, componentName) {
  const template = templates[templateType] || templates.blank

  // 克隆配置并填充组件名称
  const config = { ...template.config }
  config.name = componentName
  config.createdAt = new Date().toISOString()

  return {
    indexVue: template.indexVue,
    config
  }
}

/**
 * 获取所有模板列表
 * @returns {array} 模板列表
 */
function getTemplateList() {
  return Object.keys(templates).map(key => ({
    key,
    name: templates[key].name,
    description: templates[key].description
  }))
}

module.exports = {
  templates,
  getTemplate,
  getTemplateList
}
