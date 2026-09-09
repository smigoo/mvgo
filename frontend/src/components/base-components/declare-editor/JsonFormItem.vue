<template>
  <div class="json-form-item">
    <!-- 对象类型 -->
    <div v-if="isObject" class="object-container">
      <div class="object-grid-form">
        <div v-for="(value, key) in localData" :key="key" class="field-group">
          <!-- 字段标题栏 -->
          <div class="field-title-bar" :class="getType(value) ? 'field-title-bar-string' : ''">
            <div class="field-meta-row">
              <div class="field-tags">
                <a-tag class="field-label-tag">{{ getFieldLabel(key) }}</a-tag>
                <a-tag class="field-type-tag">{{ getTypeName(value) }}</a-tag>
              </div>
              <div class="field-actions">
                <a-tooltip
                  :title="Array.isArray(value) ? '添加元素' : '添加字段'"
                  v-if="Array.isArray(value) || (typeof value === 'object' && value !== null)"
                >
                  <a-button type="primary" size="small" class="action-btn add-btn" @click="addChildItem(key, value)">
                    <plus-outlined />
                  </a-button>
                </a-tooltip>
                <a-tooltip title="删除" v-if="isShowDelete(key)">
                  <a-button
                    type="text"
                    danger
                    size="small"
                    class="action-btn delete-btn"
                    @click="handleDelete(key)"
                  >
                    <delete-outlined />
                  </a-button>
                </a-tooltip>
                <a-tooltip
                  :title="isCollapsed(`field-${key}`) ? '展开' : '收起'"
                  v-if="Array.isArray(value) || (typeof value === 'object' && value !== null)"
                >
                  <a-button
                    type="text"
                    size="small"
                    class="action-btn collapse-btn"
                    :class="{ collapsed: isCollapsed(`field-${key}`) }"
                    @click="toggleCollapse(`field-${key}`)"
                  >
                    <down-outlined v-if="!isCollapsed(`field-${key}`)" class="collapse-icon" />
                    <right-outlined v-else class="collapse-icon" />
                  </a-button>
                </a-tooltip>
              </div>
            </div>
            <a-form-item v-if="isPrimitive(value)" class="field-form-item">
              <!-- 字符串 -->
              <a-input
                v-if="typeof value === 'string'"
                :value="value"
                @update:value="updateField(key, $event)"
                placeholder="请输入字符串值"
                size="large"
              />
              <!-- 数字 -->
              <a-input-number
                v-else-if="typeof value === 'number'"
                :value="value"
                @update:value="updateField(key, $event)"
                placeholder="请输入数字"
                size="large"
                style="width: 100%"
              />
              <!-- 布尔值 -->
              <div v-else-if="typeof value === 'boolean'" class="boolean-field">
                <a-switch
                  :checked="value"
                  @update:checked="updateField(key, $event)"
                  size="default"
                />
                <span class="boolean-value">{{ value ? '是 (true)' : '否 (false)' }}</span>
              </div>
              <!-- null -->
              <a-input v-else-if="value === null" :value="'null'" placeholder="空值" size="large" />
            </a-form-item>
          </div>

          <!-- 字段内容 -->
          <div class="field-value-area" v-if="!isCollapsed(`field-${key}`)">
            <!-- 基础类型 -->

            <!-- 数组类型 -->
            <div v-if="Array.isArray(value)" class="complex-field">
              <!-- <div class="complex-field-label">
                <label>{{ key }}</label>
                <a-button type="primary" size="small" @click="addArrayItem(key)">
                  <plus-outlined />
                  添加元素
                </a-button>
              </div> -->
              <div class="array-items">
                <div v-for="(item, index) in value" :key="index" class="array-item-card">
                  <div class="array-item-header">
                    <a-tag color="green">索引 [{{ index }}]</a-tag>
                    <a-tag>{{ getTypeName(item) }}</a-tag>
                    <a-form-item
                      v-if="isPrimitive(item)"
                      :label="`值 [${index}]`"
                      class="array-item-form"
                    >
                      <a-input
                        v-if="typeof item === 'string'"
                        :value="item"
                        @update:value="updateArrayItem(key, index, $event)"
                        placeholder="请输入"
                        size="large"
                      />
                      <a-input-number
                        v-else-if="typeof item === 'number'"
                        :value="item"
                        @update:value="updateArrayItem(key, index, $event)"
                        size="large"
                        style="width: 100%"
                      />
                      <div v-else-if="typeof item === 'boolean'" class="boolean-field">
                        <a-switch
                          :checked="item"
                          @update:checked="updateArrayItem(key, index, $event)"
                        />
                        <span class="boolean-value">{{ item ? '是 (true)' : '否 (false)' }}</span>
                      </div>
                    </a-form-item>
                    <div style="margin-left: auto; display: flex; gap: 8px">
                      <a-tooltip title="删除">
                        <a-button
                          type="text"
                          danger
                          size="small"
                          class="delete-btn"
                          @click="deleteArrayItem(key, index)"
                        >
                          <delete-outlined />
                        </a-button>
                      </a-tooltip>
                      <a-tooltip
                        :title="isCollapsed(`array-${key}-${index}`) ? '展开' : '收起'"
                        v-if="!isPrimitive(item)"
                      >
                        <a-button
                          type="text"
                          size="small"
                          class="collapse-btn"
                          :class="{ collapsed: isCollapsed(`array-${key}-${index}`) }"
                          @click="toggleCollapse(`array-${key}-${index}`)"
                        >
                          <down-outlined
                            v-if="!isCollapsed(`array-${key}-${index}`)"
                            class="collapse-icon"
                          />
                          <right-outlined v-else class="collapse-icon" />
                        </a-button>
                      </a-tooltip>
                    </div>
                  </div>
                  <div
                    class="array-item-value"
                    v-if="!isPrimitive(item) && !isCollapsed(`array-${key}-${index}`)"
                  >
                    <!-- 基础类型数组元素 -->

                    <!-- 对象或数组类型数组元素 - 递归 -->
                    <json-form-item
                      :data="item"
                      @update:data="updateArrayItem(key, index, $event)"
                    />
                  </div>
                </div>
                <a-empty v-if="value.length === 0" description="暂无元素" :image="simpleImage" />
              </div>
            </div>

            <!-- 对象类型 - 递归 -->
            <div v-else-if="typeof value === 'object' && value !== null" class="complex-field">
              <!-- <div class="complex-field-label">
                <label>{{ key }}</label>
              </div> -->
              <div class="nested-object">
                <json-form-item :data="value" @update:data="updateField(key, $event)" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 添加新字段按钮 -->
      <div class="add-field-section">
        <a-button type="dashed" size="large" block @click="addFieldToTopLevel">
          <plus-outlined />
          添加新字段
        </a-button>
      </div>
    </div>

    <!-- 数组类型（顶层） -->
    <div v-else-if="isArray" class="array-container">
      <div class="array-top-header">
        <h4>数组 ({{ localData.length }} 项)</h4>
        <a-tooltip title="添加元素">
          <a-button type="primary" @click="addArrayItem(null)">
            <plus-outlined />
          </a-button>
        </a-tooltip>
      </div>
      <div class="array-items">
        <div v-for="(item, index) in localData" :key="index" class="array-item-card">
          <div class="array-item-header">
            <a-tag color="green">索引 [{{ index }}]</a-tag>
            <a-tag>{{ getTypeName(item) }}</a-tag>
            <div style="margin-left: auto; display: flex; gap: 8px">
              <a-tooltip title="删除">
                <a-button
                  type="text"
                  danger
                  size="small"
                  class="delete-btn"
                  @click="deleteArrayItem(null, index)"
                >
                  <delete-outlined />
                </a-button>
              </a-tooltip>
              <a-tooltip
                :title="isCollapsed(`top-array-${index}`) ? '展开' : '收起'"
                v-if="!isPrimitive(item)"
              >
                <a-button
                  type="text"
                  size="small"
                  class="collapse-btn"
                  :class="{ collapsed: isCollapsed(`top-array-${index}`) }"
                  @click="toggleCollapse(`top-array-${index}`)"
                >
                  <down-outlined v-if="!isCollapsed(`top-array-${index}`)" class="collapse-icon" />
                  <right-outlined v-else class="collapse-icon" />
                </a-button>
              </a-tooltip>
            </div>
          </div>
          <div class="array-item-value">
            <!-- 基础类型数组元素 -->
            <template v-if="isPrimitive(item)">
              <a-form-item
                :label="`值 [${index}]`"
                :label-col="{ span: 4 }"
                :wrapper-col="{ span: 20 }"
              >
                <a-input
                  v-if="typeof item === 'string'"
                  :value="item"
                  @update:value="updateArrayItem(null, index, $event)"
                  placeholder="请输入"
                  size="large"
                />
                <a-input-number
                  v-else-if="typeof item === 'number'"
                  :value="item"
                  @update:value="updateArrayItem(null, index, $event)"
                  size="large"
                  style="width: 100%"
                />
                <div v-else-if="typeof item === 'boolean'" class="boolean-field">
                  <a-switch
                    :checked="item"
                    @update:checked="updateArrayItem(null, index, $event)"
                  />
                  <span class="boolean-value">{{ item ? '是 (true)' : '否 (false)' }}</span>
                </div>
              </a-form-item>
            </template>
            <!-- 对象或数组类型数组元素 - 递归 -->
            <div v-else-if="!isCollapsed(`top-array-${index}`)">
              <json-form-item :data="item" @update:data="updateArrayItem(null, index, $event)" />
            </div>
          </div>
        </div>
        <a-empty v-if="localData.length === 0" description="暂无元素" />
      </div>
    </div>

    <!-- 添加字段弹窗 -->
    <a-modal
      v-model:open="addFieldModalVisible"
      title="添加新字段"
      @ok="confirmAddField"
      @cancel="cancelAddField"
      width="500px"
    >
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 18 }">
        <a-form-item label="字段名称" required>
          <a-input
            v-model:value="newFieldForm.key"
            placeholder="请输入字段名称（英文key）"
            size="large"
          />
        </a-form-item>
        <a-form-item label="字段类型" required>
          <a-select v-model:value="newFieldForm.type" placeholder="请选择字段类型" size="large">
            <a-select-option value="string">
              <code-outlined />
              字符串 (string)
            </a-select-option>
            <a-select-option value="number">
              <number-outlined />
              数字 (number)
            </a-select-option>
            <a-select-option value="boolean">
              <check-circle-outlined />
              布尔值 (boolean)
            </a-select-option>
            <a-select-option value="object">
              <container-outlined />
              对象 (object)
            </a-select-option>
            <a-select-option value="array">
              <ordered-list-outlined />
              数组 (array)
            </a-select-option>
            <a-select-option value="null">
              <minus-circle-outlined />
              空值 (null)
            </a-select-option>
          </a-select>
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup>
/**
 * JSON 表单编辑器组件
 * 用于可视化编辑 JSON 数据，支持对象、数组、字符串、数字、布尔值等多种数据类型
 * 提供字段添加、删除、折叠/展开等功能
 */
import { computed, ref, watch, reactive } from 'vue'
import {
  DeleteOutlined,
  PlusOutlined,
  CodeOutlined,
  NumberOutlined,
  CheckCircleOutlined,
  ContainerOutlined,
  OrderedListOutlined,
  MinusCircleOutlined,
  DownOutlined,
  RightOutlined
} from '@ant-design/icons-vue'
import { Modal, message, Empty } from 'ant-design-vue'

// ==================== 常量定义 ====================

/** 空状态图片配置 */
const simpleImage = Empty.PRESENTED_IMAGE_SIMPLE

// ==================== Props & Emits ====================

/** 组件属性定义 */
const props = defineProps({
  /** 要编辑的数据，支持对象、数组及基础类型 */
  data: {
    type: [Object, Array, String, Number, Boolean],
    required: true
  }
})

/** 组件事件定义 */
const emit = defineEmits(['update:data'])

// ==================== 响应式数据 ====================

/** 本地数据副本，用于编辑操作 */
const localData = ref(JSON.parse(JSON.stringify(props.data)))

/** 折叠状态管理对象，key 为字段/元素的唯一标识，value 为折叠状态（true=收起，false=展开） */
const collapsedFields = ref({})

// ==================== 监听器 ====================

/**
 * 监听 props 数据变化，同步更新本地数据
 */
watch(
  () => props.data,
  (newData) => {
    localData.value = JSON.parse(JSON.stringify(newData))
  },
  { deep: true }
)

// ==================== 配置数据 ====================

/**
 * 字段中文描述映射表
 * 用于将字段名映射为中文描述，提升界面可读性
 */
const fieldDescriptions = {
  componentId: '组件标识',
  componentName: '组件名称',
  version: '组件版本',
  attribute: '组件自定义属性',
  aspectRatio: '宽高比',
  title: '标题',
  description: '描述',
  imgUrl: '图片地址',
  businessEvents: '组件事件',
  businessStatuses: '组件状态',
  dataSources: '数据源获取',
  formSources: '数据源提交',
  layoutConfig: '布局配置',
  themeConfig: '主题配置',
  cssVariableConfig: '样式配置',
  promptConfig: '提示内容'
}

// ==================== 添加字段相关 ====================

/** 添加字段弹窗显示状态 */
const addFieldModalVisible = ref(false)

/** 当前正在编辑的对象字段key，null 表示顶层对象 */
const currentEditingKey = ref(null)

/** 新字段表单数据 */
const newFieldForm = reactive({
  /** 字段名称 */
  key: '',
  /** 字段类型 */
  type: 'string'
})

// ==================== 计算属性 ====================

/**
 * 判断当前数据是否为对象类型（非数组）
 */
const isObject = computed(() => {
  return (
    typeof localData.value === 'object' &&
    localData.value !== null &&
    !Array.isArray(localData.value)
  )
})

/**
 * 判断当前数据是否为数组类型
 */
const isArray = computed(() => {
  return Array.isArray(localData.value)
})

// ==================== 工具方法 ====================

/**
 * 获取字段显示标签
 * @param {string} key - 字段名
 * @returns {string} 带中文描述的字段标签，格式："中文描述：字段名" 或 "字段名"
 */
const getFieldLabel = (key) => {
  const description = fieldDescriptions[key]
  return description ? `${description}：${key}` : key
}

/**
 * 判断字段是否显示删除按钮
 * 系统预定义字段不可删除
 * @param {string} key - 字段名
 * @returns {boolean} true-显示删除按钮，false-隐藏删除按钮
 */
const isShowDelete = (key) => {
  // 系统预定义字段列表，不允许删除
  const protectedFields = [
    'componentId',
    'componentName',
    'version',
    'attribute',
    'aspectRatio',
    'title',
    'description',
    'imgUrl',
    'businessEvents',
    'businessStatuses',
    'dataSources',
    'formSources'
  ]
  return !protectedFields.includes(key)
}

/**
 * 判断值是否为基础类型（非对象、非数组）
 * @param {*} value - 要判断的值
 * @returns {boolean} true-基础类型，false-复杂类型
 */
const isPrimitive = (value) => {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null
  )
}

/**
 * 获取值的类型名称
 * @param {*} value - 要判断的值
 * @returns {string} 类型名称：'null' | 'array' | 'object' | 'string' | 'number' | 'boolean'
 */
const getTypeName = (value) => {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'object') return 'object'
  return typeof value
}

/**
 * 判断值是否为基础类型（用于样式判断）
 * @param {*} value - 要判断的值
 * @returns {boolean} true-基础类型，false-复杂类型
 */
const getType = (value) => {
  if (Array.isArray(value)) return false
  if (typeof value === 'object') return false
  return true
}

// ==================== 折叠/展开功能 ====================

/**
 * 切换字段/元素的折叠状态
 * @param {string} id - 字段/元素的唯一标识
 */
const toggleCollapse = (id) => {
  // 获取当前状态（默认为 true - 收起）
  const currentState = collapsedFields.value[id] === undefined ? true : collapsedFields.value[id]
  const newState = !currentState
  collapsedFields.value[id] = newState

  // 如果切换为收起状态，级联收起所有子级
  if (newState === true) {
    collapseAllChildren(id)
  }
}

/**
 * 级联收起所有子级元素
 * 当父级收起时，自动收起其所有子级（删除子级状态记录，恢复默认收起）
 * @param {string} parentId - 父级元素的唯一标识
 */
const collapseAllChildren = (parentId) => {
  const keys = Object.keys(collapsedFields.value)
  keys.forEach((key) => {
    if (key === parentId) return // 跳过父级自己

    // 根据父级 ID 类型判断并删除对应的子级状态
    if (parentId.startsWith('field-')) {
      // 对象字段的直接子级：array-${key}-${index}
      const fieldKey = parentId.substring(6) // 去掉 "field-" 前缀
      if (key.startsWith(`array-${fieldKey}-`)) {
        delete collapsedFields.value[key]
      }
    }
    // 注意：递归组件的子级状态在各自的组件实例中管理，无需在此处理
  })
}

/**
 * 检查字段/元素是否处于折叠状态
 * @param {string} id - 字段/元素的唯一标识
 * @returns {boolean} true-收起，false-展开
 */
const isCollapsed = (id) => {
  // 默认状态为收起（true）
  return collapsedFields.value[id] === undefined ? true : collapsedFields.value[id]
}

// ==================== 数据操作方法 ====================

/**
 * 添加子项（统一入口）
 * 根据值的类型决定添加数组元素还是对象字段
 * @param {string} key - 字段名
 * @param {*} value - 字段值
 */
const addChildItem = (key, value) => {
  if (Array.isArray(value)) {
    // 数组类型：添加数组元素
    addArrayItem(key)
  } else if (typeof value === 'object' && value !== null) {
    // 对象类型：打开添加字段弹窗
    currentEditingKey.value = key
    showAddFieldModal()
  }
}

/**
 * 更新对象字段的值
 * @param {string} key - 字段名
 * @param {*} value - 新值
 */
const updateField = (key, value) => {
  const newData = { ...localData.value }
  newData[key] = value
  localData.value = newData
  emit('update:data', newData)
}

/**
 * 更新数组元素的值
 * @param {string|null} key - 字段名，null 表示顶层数组
 * @param {number} index - 数组索引
 * @param {*} value - 新值
 */
const updateArrayItem = (key, index, value) => {
  if (key === null) {
    // 顶层数组
    const newData = [...localData.value]
    newData[index] = value
    localData.value = newData
    emit('update:data', newData)
  } else {
    // 对象中的数组字段
    const newData = { ...localData.value }
    const newArray = [...newData[key]]
    newArray[index] = value
    newData[key] = newArray
    localData.value = newData
    emit('update:data', newData)
  }
}

/**
 * 添加数组元素
 * 根据数组已有元素类型，自动创建相同类型的新元素
 * @param {string|null} key - 字段名，null 表示顶层数组
 */
const addArrayItem = (key) => {
  const arr = key === null ? localData.value : localData.value[key]

  let newItem
  if (arr.length === 0) {
    // 空数组：弹窗让用户选择元素类型
    Modal.confirm({
      title: '选择元素类型',
      content: '请选择要添加的元素类型',
      okText: '对象',
      cancelText: '字符串',
      onOk: () => {
        newItem = {}
        doAddArrayItem(key, newItem)
      },
      onCancel: () => {
        newItem = ''
        doAddArrayItem(key, newItem)
      }
    })
    return
  } else {
    // 非空数组：根据第一个元素的类型创建新元素
    const firstItem = arr[0]
    if (typeof firstItem === 'string') {
      newItem = ''
    } else if (typeof firstItem === 'number') {
      newItem = 0
    } else if (typeof firstItem === 'boolean') {
      newItem = false
    } else if (Array.isArray(firstItem)) {
      newItem = []
    } else if (typeof firstItem === 'object') {
      newItem = {}
    }
  }

  doAddArrayItem(key, newItem)
}

/**
 * 执行添加数组元素操作
 * 添加成功后，如果元素是对象或数组，会自动展开
 * @param {string|null} key - 字段名，null 表示顶层数组
 * @param {*} item - 要添加的元素
 */
const doAddArrayItem = (key, item) => {
  if (key === null) {
    // 顶层数组
    const newData = [...localData.value, item]
    const newIndex = newData.length - 1
    localData.value = newData
    emit('update:data', newData)

    // 如果新添加的元素是对象或数组，自动展开
    if (typeof item === 'object' && item !== null) {
      collapsedFields.value[`top-array-${newIndex}`] = false
    }
  } else {
    // 对象中的数组字段
    const newData = { ...localData.value }
    newData[key] = [...newData[key], item]
    const newIndex = newData[key].length - 1
    localData.value = newData
    emit('update:data', newData)

    // 自动展开数组字段
    collapsedFields.value[`field-${key}`] = false

    // 如果新添加的元素是对象或数组，自动展开
    if (typeof item === 'object' && item !== null) {
      collapsedFields.value[`array-${key}-${newIndex}`] = false
    }
  }
}

/**
 * 删除数组元素
 * 弹出确认框，确认后删除指定索引的数组元素
 * @param {string|null} key - 字段名，null 表示顶层数组
 * @param {number} index - 要删除的元素索引
 */
const deleteArrayItem = (key, index) => {
  Modal.confirm({
    title: '确认删除',
    content: `确定要删除第 ${index + 1} 个元素吗？`,
    okText: '确定',
    okType: 'danger',
    cancelText: '取消',
    onOk: () => {
      if (key === null) {
        // 顶层数组
        const newData = [...localData.value]
        newData.splice(index, 1)
        localData.value = newData
        emit('update:data', newData)
      } else {
        // 对象中的数组字段
        const newData = { ...localData.value }
        const newArray = [...newData[key]]
        newArray.splice(index, 1)
        newData[key] = newArray
        localData.value = newData
        emit('update:data', newData)
      }
    }
  })
}

/**
 * 删除对象字段
 * 弹出确认框，确认后删除指定字段
 * @param {string} key - 要删除的字段名
 */
const handleDelete = (key) => {
  Modal.confirm({
    title: '确认删除',
    content: `确定要删除字段 "${key}" 吗？`,
    okText: '确定',
    okType: 'danger',
    cancelText: '取消',
    onOk: () => {
      const newData = { ...localData.value }
      delete newData[key]
      localData.value = newData
      emit('update:data', newData)
    }
  })
}

// ==================== 字段管理方法 ====================

/**
 * 显示添加字段弹窗
 */
const showAddFieldModal = () => {
  addFieldModalVisible.value = true
}

/**
 * 添加字段到顶层对象
 * 设置当前编辑对象为 null（顶层），然后打开添加字段弹窗
 */
const addFieldToTopLevel = () => {
  currentEditingKey.value = null
  showAddFieldModal()
}

/**
 * 确认添加字段
 * 验证字段名，创建字段初始值，添加到目标对象
 * 添加成功后自动展开相关字段
 */
const confirmAddField = () => {
  // 验证字段名
  if (!newFieldForm.key) {
    message.warning('请输入字段名称')
    return
  }

  // 确定目标对象（顶层对象或嵌套对象）
  const targetObj =
    currentEditingKey.value === null ? localData.value : localData.value[currentEditingKey.value]

  // 检查字段是否已存在
  if (newFieldForm.key in targetObj) {
    message.warning('字段已存在')
    return
  }

  // 根据字段类型创建初始值
  let initialValue
  switch (newFieldForm.type) {
    case 'string':
      initialValue = ''
      break
    case 'number':
      initialValue = 0
      break
    case 'boolean':
      initialValue = false
      break
    case 'object':
      initialValue = {}
      break
    case 'array':
      initialValue = []
      break
    case 'null':
      initialValue = null
      break
    default:
      initialValue = ''
  }

  const newData = { ...localData.value }

  if (currentEditingKey.value === null) {
    // 添加到顶层对象
    newData[newFieldForm.key] = initialValue
  } else {
    // 添加到嵌套对象
    newData[currentEditingKey.value] = {
      ...newData[currentEditingKey.value],
      [newFieldForm.key]: initialValue
    }
    // 自动展开父级对象
    collapsedFields.value[`field-${currentEditingKey.value}`] = false
  }

  // 更新数据
  localData.value = newData
  emit('update:data', newData)

  // 如果新添加的字段是对象或数组，自动展开它
  if (typeof initialValue === 'object' && initialValue !== null) {
    const fieldId = `field-${newFieldForm.key}`
    collapsedFields.value[fieldId] = false
  }

  message.success('字段添加成功')
  cancelAddField()
}

/**
 * 取消添加字段
 * 关闭弹窗并重置表单数据
 */
const cancelAddField = () => {
  addFieldModalVisible.value = false
  currentEditingKey.value = null
  newFieldForm.key = ''
  newFieldForm.type = 'string'
}
</script>

<style scoped>
.json-form-item {
  width: 100%;
}

.object-container,
.array-container,
.array-items {
  width: 100%;
}

.object-grid-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-group {
  margin-bottom: 0;
  padding: 10px 14px;
  background: var(--bg-alt);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.field-group:hover {
  border-color: var(--brand-border);
  box-shadow: var(--shadow-sm);
}

/* 单列模式：标题栏改为横向布局（标签左 + 操作右） */
.field-title-bar {
  display: flex;
  align-items: center;
  gap: 12px;
}

.field-meta-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.field-tags {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
  flex: 1; /* 占据剩余空间，让 actions 被推到右侧 */
}

.field-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.field-label-tag {
  margin: 0 !important;
  padding: 3px 10px !important;
  border-radius: var(--radius-full) !important;
  border: 1px solid var(--brand-border) !important;
  background: var(--brand-bg) !important;
  color: var(--brand-text) !important;
  font-size: 12px;
  font-weight: 600;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.field-type-tag {
  margin: 0 !important;
  padding: 2px 8px !important;
  border-radius: var(--radius-full) !important;
  border: 1px solid var(--border-default) !important;
  background: var(--bg-hover) !important;
  color: var(--text-secondary) !important;
  font-size: 11px;
}

.field-form-item {
  margin-bottom: 0;
  width: 100%;
  min-width: 0;
}

.field-form-item :deep(.ant-form-item-label) {
  display: none;
}

.field-form-item :deep(.ant-form-item-control) {
  max-width: 100%;
}

.field-form-item :deep(.ant-input),
.field-form-item :deep(.ant-input-number),
.field-form-item :deep(.ant-input-affix-wrapper) {
  height: 44px;
  border-radius: var(--radius-md);
}

.field-form-item :deep(.ant-input-number-input) {
  height: 42px;
}

.field-form-item :deep(.ant-select-selector) {
  height: 44px !important;
  border-radius: var(--radius-md) !important;
}

.field-form-item :deep(.ant-select-selection-item),
.field-form-item :deep(.ant-select-selection-placeholder) {
  line-height: 42px !important;
}

.field-value-area {
  padding-top: 8px;
}

.boolean-field {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 40px;
  padding: 0 4px;
}

.boolean-value {
  font-size: 13px;
  font-weight: 600;
  color: var(--success);
}

.complex-field {
  margin-top: 4px;
}

.nested-object {
  padding: 8px 10px;
  background: var(--bg-hover);
  border: 1px dashed var(--border-default);
  border-radius: var(--radius-sm);
}

.array-top-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding: 14px 16px;
  background: var(--brand);
  color: var(--text-inverse);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
}

.array-top-header h4 {
  margin: 0;
  color: var(--text-inverse);
  font-size: 16px;
}

.array-item-card {
  margin-bottom: 14px;
  padding: 14px;
  background: var(--bg-alt);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.array-item-card:hover {
  border-color: var(--brand-border);
  box-shadow: var(--shadow-md);
}

.array-item-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.array-item-header .ant-tag:first-child {
  font-size: 12px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: var(--radius-full);
}

.array-item-header .ant-btn {
  margin-left: auto;
}

.array-item-value {
  margin-top: 12px;
}

.array-item-form {
  margin-bottom: 0;
  flex: 1;
}

.array-item-form :deep(.ant-form-item-label > label) {
  font-weight: 600;
  font-size: 13px;
  color: var(--success);
}

.add-field-section {
  margin-top: 10px;
  padding: 10px 12px;
  background: var(--bg-hover);
  border: 2px dashed var(--border-strong);
  border-radius: var(--radius-lg);
  transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
}

.add-field-section:hover {
  background: var(--brand-bg);
  border-color: var(--brand-border);
  box-shadow: inset 0 0 0 1px var(--brand-bg-hover);
}

.add-field-section :deep(.ant-btn-dashed) {
  height: 46px;
  border-radius: var(--radius-md);
  border-width: 2px;
  color: var(--text-brand);
  background: var(--bg-card);
}

:deep(.ant-input),
:deep(.ant-input-number) {
  font-size: 14px;
}

:deep(.ant-input:focus),
:deep(.ant-input-number-focused) {
  box-shadow: var(--shadow-focus);
}

.action-btn {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-width: 1px;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease, background 0.18s ease;
}

.action-btn:hover {
  transform: translateY(-1px);
}

.add-btn {
  box-shadow: var(--shadow-md);
}

.delete-btn {
  color: var(--error);
  border: 1px solid var(--error-border);
  background: var(--error-bg);
}

.delete-btn:hover {
  color: var(--error-light);
  border-color: var(--error);
  background: var(--error-bg);
  box-shadow: var(--shadow-md);
}

.collapse-btn {
  color: var(--text-brand);
  border: 1px solid var(--brand-border);
  background: var(--brand-bg);
}

.collapse-btn:hover {
  color: var(--text-primary);
  border-color: var(--border-focus);
  background: var(--brand-bg-hover);
  box-shadow: var(--shadow-md);
}

.collapse-btn.collapsed {
  color: var(--text-secondary);
  background: var(--bg-hover);
  border-color: var(--border-default);
}

.collapse-btn.collapsed:hover {
  color: var(--text-brand);
  background: var(--brand-bg);
  border-color: var(--brand-border);
}

.collapse-icon {
  font-size: 12px;
  transition: transform 0.2s ease;
  display: inline-block;
}

.collapse-btn:hover .collapse-icon {
  transform: scale(1.12);
}

.field-value-area,
.array-item-value {
  animation: slideDown 0.24s ease-out;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 单列布局下无需响应式切换 */
@media (max-width: 1200px) {
  .object-grid-form {
    flex-direction: column;
  }
}
</style>
