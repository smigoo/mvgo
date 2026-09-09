<template>
  <div class="trace-view">
    <div class="container">
      <div v-for="(trace, idx) in traceList" :key="idx" class="trace-group">
        <div class="card">
          <div class="card-title">全链路追踪 #{{ idx + 1 }} | TraceID：{{ trace.traceID }}</div>
          <div class="info-row">
            <div class="info-item">
              <span class="label">服务名称：</span>
              {{ trace.processes?.p1?.serviceName || '-' }}
            </div>
            <div class="info-item">
              <span class="label">环境：</span>
              {{ getEnv(trace.processes?.p1?.tags) }}
            </div>
            <div class="info-item">
              <span class="label">总数：</span>
              {{ trace.spans?.length }}
            </div>
          </div>
        </div>

        <div class="card">
          <div class="tree-container">
            <!--------- 第一层 --------->
            <template v-for="item in treeData" :key="item.spanID">
              <div class="tree-item">
                <div
                  class="tree-node"
                  :class="{ slow: item.duration > 1000 || item.operationName.includes('error') }"
                >
                  <span class="node-tag" :class="getClass(item)">{{ getType(item) }}</span>
                  <div class="node-name">
                    {{ item.operationName }}
                  </div>
                  <div
                    class="node-time"
                    :style="item.duration > 2000 ? 'color: var(--error)' : 'color: var(--success)'"
                  >
                    {{ formatDuration(item.duration) }}
                  </div>
                  <button class="node-btn" @click="toggle(item.spanID)">
                    {{ expanded[item.spanID] ? '收起' : '查看详情' }}
                  </button>
                </div>

                <div v-if="expanded[item.spanID]" class="node-detail">
                  <div v-for="tag in item.tags" :key="tag.key" class="tag-item">
                    {{ tagMap[tag.key] || tag.key }}：{{ tag.value }}
                  </div>
                </div>
              </div>

              <!--------- 子层（固定两层，彻底干掉递归渲染） --------->
              <div
                v-for="c in item.children"
                :key="c.spanID"
                style="margin-left: 22px; border-left: 1px dashed var(--border-light); padding-left: 12px"
              >
                <div class="tree-item">
                  <div class="tree-node" :class="{ slow: c.duration > 1000 }">
                    <span class="node-tag" :class="getClass(c)">{{ getType(c) }}</span>
                    <div class="node-name">{{ c.operationName }}</div>
                    <div
                      class="node-time"
                      :style="c.duration > 2000 ? 'color: var(--error)' : 'color: var(--success)'"
                    >
                      {{ formatDuration(c.duration) }}
                    </div>
                    <button class="node-btn" @click="toggle(c.spanID)">
                      {{ expanded[c.spanID] ? '收起' : '查看详情' }}
                    </button>
                  </div>

                  <div v-if="expanded[c.spanID]" class="node-detail">
                    <div v-for="tag in c.tags" :key="tag.key" class="tag-item">
                      {{ tagMap[tag.key] || tag.key }}：{{ tag.value }}
                    </div>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  itemData: {
    type: Object,
    default: () => {}
  }
})
const rawData = ref(props.itemData)

// ====================== ✅ 真正正确的写法 ======================
const expanded = ref({}) // 普通 ref，正常响应
const traceList = ref(rawData.value.data)

const tagMap = {
  'client.address': '客户端IP',
  'http.request.method': '请求方法',
  'http.response.status_code': '状态码',
  'http.route': '路由',
  'network.peer.address': '对端IP',
  'network.peer.port': '对端端口',
  'network.protocol.version': '协议版本',
  'network.type': '网络类型',
  'server.address': '服务端IP',
  'server.port': '服务端端口',
  'url.path': '请求路径',
  'url.scheme': '协议',
  'user_agent.original': 'UA',
  'db.connection_string': '数据库连接',
  'db.name': '数据库名',
  'db.operation': '操作类型',
  'db.sql.table': '表名',
  'db.statement': '执行语句',
  'db.system': '数据库类型',
  'db.user': '数据库账号',
  'thread.id': '线程ID',
  'thread.name': '线程名',
  'span.kind': '调用类型',
  'deployment.environment': '环境',
  'host.arch': '架构',
  'host.name': '主机名',
  'os.description': '系统',
  'os.type': '系统类型',
  'process.command_args': '启动命令',
  'process.executable.path': '进程路径',
  'process.pid': '进程ID',
  'process.runtime.description': '运行时',
  'process.runtime.name': '运行时名称',
  'process.runtime.version': '运行时版本',
  'service.instance.id': '实例ID',
  'otel.scope.name': '监控作用域',
  'otel.scope.version': '监控版本',
  'telemetry.distro.name': '监控版本',
  'telemetry.distro.version': '监控版本',
  'telemetry.sdk.language': 'SDK语言',
  'telemetry.sdk.name': 'SDK名称',
  'telemetry.sdk.version': 'SDK版本',
  'page.href': '页面访问地址',
  'page.pageid': '页面id',
  'mc.eventTypeId': '触发组件事件id',
  'mc.sourceComponentId': '触发组件标识id',
  'mc.sourceSerialNumber': '触发组件序列号',
  'mc.targetComponentId': '目标组件标识id',
  'mc.targetSerialNumber': '目标组件序列号',
  'mc.targetStatus': '目标组件监听状态',
  'mc.desc': '描述',
  'mc.eventBody': '事件传递数据内容',
  'mc.payload': '事件传递数据内容',
  'mc.messageTopic': '事件监听主题',
  'mc.messageTopicWithStatus': '事件监听主题',
  'mc.eventId': '微码事件交互id',
  'mc.errorStack': '错误信息与位置'
}

const filterName = (name) => {
  if (name === 'web.publishEvent.start') {
    return '事件发布开始'
  } else if (name === 'web.publishEvent.end') {
    return '事件发布成功'
  } else if (name === 'web.routes.error') {
    return '未找到路由配置'
  } else if (name === 'web.router.success') {
    return '找到路由配置'
  } else if (name === 'web.listenEvent.start') {
    return '监听接收开始'
  } else if (name === 'web.listenEvent.end') {
    return '监听接收结束'
  } else if (name === 'web.listenEvent.error') {
    return '监听接收错误'
  } else if (name === 'web.listenEvent.dynamic') {
    return '触发动态组件打开'
  } else if (name === 'web.dynamic.start') {
    return '触发动态组件开始'
  } else if (name === 'web.dynamic.end') {
    return '触发动态组件结束'
  } else if (name === 'web.dynamic.loadend') {
    return '动态组件加载结束'
  } else if (name === 'web.mc.publish.error') {
    return '微码事件发布错误'
  } else if (name === 'web.MCCore.error') {
    return '微码框架异常'
  } else if (name === 'web.listenCallback.error') {
    return '业务组件异常'
  }
  return 'web'
}

// 树结构（只构建一次，无响应式污染）
const treeData = (() => {
  const trace = rawData.value.data[0]

  // const m = new Map()
  const roots = []
  trace.spans.forEach((s) => {
    s.children = []
    // m.set(s.spanID, s)
  })
  trace.spans.forEach((s) => {
    // const p = s.references?.find((r) => r.refType === 'CHILD_OF')
    // p ? m.get(p.spanID)?.children.push(s) : roots.push(s)
    roots.push(s)
  })
  const sort = (a) => {
    a.sort((x, y) => x.startTime - y.startTime)
    a.forEach((i) => i.children && sort(i.children))
  }
  sort(roots)

  return roots
})()

/**
 * 切换指定ID元素的展开状态
 * @param {string|number} id - 需要切换展开状态的元素唯一标识符
 */
function toggle(id) {
  expanded.value[id] = !expanded.value[id]
}
const formatDuration = (ms) => {
  if (typeof ms !== 'number' || isNaN(ms)) return '0ms'

  // 小于1秒，显示毫秒
  if (ms < 1000) {
    return `${ms}ms`
  }

  // 大于等于1秒，转换为秒，保留2位小数
  const seconds = (ms / 1000).toFixed(2)
  return `${seconds}s`
}

/**
 * 获取环境信息
 * 从标签数组中查找键为'deployment.environment'的项，并返回其值
 * @param {Array} tags - 标签数组，每个标签对象应包含key和value属性
 * @returns {string} 环境值，如果未找到则返回'-'
 */
function getEnv(tags) {
  const item = tags?.find((i) => i.key === 'deployment.environment')
  return item?.value || '-'
}

/**
 * 根据项目标签和引用信息判断项目类型
 *
 * @param {Object} item - 项目对象，包含tags和references属性
 * @param {Array} item.tags - 标签数组，每个标签对象包含value属性
 * @param {Array} [item.references] - 引用数组，可选属性
 * @returns {string} 返回项目类型：'REDIS'、'MYSQL'、'HTTP'或'ENTRY'
 */
function getType(item) {
  if (item.operationName.includes('web')) return filterName(item.operationName)
  // 检查是否包含redis标签
  if (item.tags.some((t) => t.value === 'redis')) return 'REDIS'
  // 检查是否包含mysql标签
  if (item.tags.some((t) => t.value === 'mysql')) return 'MYSQL'
  // 根据引用数量判断是HTTP类型还是入口类型
  return item.references?.length ? 'HTTP' : 'ENTRY'
}

/**
 * 根据项目标签信息获取对应的CSS类名
 * 该函数通过检查项目的标签来确定应该应用哪个样式类
 *
 * @param {Object} item - 包含标签信息的项目对象
 * @param {Array} item.tags - 标签数组，每个标签对象包含value属性
 * @param {Array} [item.references] - 参考引用数组，用于判断是否为空
 * @returns {string} 返回对应的CSS类名，可能的值包括：
 *   - 'tag-redis': 当项目标签中包含'value'为'redis'的标签时
 *   - 'tag-mysql': 当项目标签中包含'value'为'mysql'的标签时
 *   - 'tag-http': 当项目没有redis或mysql标签，但references数组存在且长度大于0时
 *   - 'tag-entry': 当以上条件都不满足时的默认类名
 */
function getClass(item) {
  if (item.operationName.includes('error')) return 'tag-error'
  if (item.tags.some((t) => t.value === 'redis')) return 'tag-redis'
  if (item.tags.some((t) => t.value === 'mysql')) return 'tag-mysql'
  return item.references?.length ? 'tag-http' : 'tag-entry'
}
</script>

<style scoped>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  font-family: 'Microsoft YaHei', sans-serif;
}
.trace-view {
  background: #f5f7fa;
  padding: 24px;
  height: 100%;
  overflow: auto;
}
.container {
  max-width: 1400px;
  margin: 0 auto;
}
.trace-group {
  margin-bottom: 40px;
}
.card {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  padding: 20px;
  margin-bottom: 16px;
  box-shadow: var(--shadow-md);
}
.card-title {
  font-size: 16px;
  font-weight: bold;
  color: var(--text-primary);
  margin-bottom: 12px;
}
.info-row {
  display: flex;
  gap: 24px;
  color: var(--text-secondary);
  font-size: 14px;
}
.tree-container {
  padding-left: 12px;
  border-left: 1px dashed var(--border-light);
}
.tree-item {
  position: relative;
  padding: 6px 0;
}
.tree-node {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--bg-hover);
  border-radius: var(--radius-md);
  font-size: 14px;
}
.node-tag {
  padding: 3px 8px;
  border-radius: var(--radius-xs);
  color: var(--text-inverse);
  font-size: 12px;
  font-weight: bold;
}
.tag-entry {
  background: #00965d;
}
.tag-http {
  background: var(--brand-light);
}
.tag-mysql {
  background: var(--warning-light);
}
.tag-redis {
  background: var(--c-purple-500);
}
.tag-error {
  background: var(--error);
}
.node-name {
  flex: 1;
  color: var(--text-primary);
}
.node-time {
  color: var(--error);
  font-weight: bold;
  min-width: 80px;
  text-align: right;
}
.node-btn {
  border: none;
  background: none;
  color: var(--brand-light);
  cursor: pointer;
  font-size: 13px;
}
.node-detail {
  margin-top: 8px;
  padding: 12px;
  background: #f9f9f9;
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.6;
}
.tag-item {
  padding: 2px 0;
  word-break: break-all;
}
.slow {
  background: var(--error-bg) !important;
  border: 1px solid #ffd6d3;
}
</style>
