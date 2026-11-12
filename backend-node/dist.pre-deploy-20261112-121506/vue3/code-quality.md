# 代码质量与开发实践

## 代码质量检查清单

### 结构与命名
- [ ] 文件命名符合规范（PascalCase组件、kebab-case文件）？
- [ ] 文件夹命名符合规范（kebab-case）？
- [ ] 变量/函数名是否清晰有意义？
- [ ] 常量用UPPER_SNAKE_CASE？

### 组件设计
- [ ] 组件是否单一职责？
- [ ] 组件是否超过300行？
- [ ] Props是否都有默认值和类型？
- [ ] Emits是否清晰定义？
- [ ] 是否有必要的文档或注释？

### 交互与状态
- [ ] 按钮点击是否防重（disabled + 防抖）？
- [ ] 是否有Loading状态？
- [ ] Loading是否有延迟显示？
- [ ] 模态框打开前是否重置状态？
- [ ] 表单提交后是否清空数据？

### 响应式与数据
- [ ] 是否使用computed代替methods用于派生数据？
- [ ] Props修改是否通过emit而不是直接修改？
- [ ] 是否避免了不必要的watch？

### 性能与内存
- [ ] 定时器是否清理？
- [ ] 事件监听是否清理？
- [ ] WebSocket是否关闭？
- [ ] 第三方库是否销毁？
- [ ] onUnmounted中是否清理资源？
- [ ] 列表渲染是否有key？

### 样式
- [ ] 样式是否都用scoped？
- [ ] CSS类名是否语义化？
- [ ] 是否避免了全局污染？
- [ ] 零值是否无单位？

### 代码质量
- [ ] 是否避免了console.log？
- [ ] 是否通过了eslint检查？
- [ ] 函数是否超过50行？
- [ ] 是否避免了3层以上嵌套？
- [ ] 是否避免了回调地狱（使用async/await）？

### 安全
- [ ] 是否避免了v-html（或已过滤）？
- [ ] 敏感信息是否hardcode？
- [ ] 用户输入是否验证和转义？
- [ ] 文件上传是否验证类型和大小？

## 开发实践

### 类型检查
```javascript
// 类型检查函数
function isValidString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function isValidArray(value) {
  return Array.isArray(value)
}

function isValidObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
```

### 异步函数 - async/await
```javascript
// ✅ 正确：async/await
async function fetchUserData(userId) {
  try {
    const response = await api.getUser(userId)
    return response.data
  } catch (error) {
    console.error('获取用户数据失败:', error)
    throw error
  }
}

// 并行执行
const [users, posts] = await Promise.all([
  fetchUsers(),
  fetchPosts()
])
```

### 安全访问 - 可选链(?.)和空值合并(??)
```javascript
// ✅ 安全
const name = user?.name ?? 'Unknown'
const age = userData?.profile?.age ?? 18

// ❌ 不安全
const name = user.name                     // 可能崩溃
const age = userData.profile.age           // 可能undefined
```

### 注释规范

#### 文件头注释（使用koroFileHeader）
```javascript
/*
 * @Description: 自定义配置文件
 * @Author: smigoo(xsmigoo@gmail.com)
 * @Date: 2024-04-27 20:11:02
 * @LastEditors: smigoo(xsmigoo@gmail.com)
 * @LastEditTime: 2024-09-09 20:16:49
 * @Copyright: © 2024 Microvideo
 */
```

#### 方法注释
```javascript
/**
 * 获取用户信息
 * @param {number} userId - 用户ID
 * @param {object} options - 配置选项
 * @returns {Promise<Object>} 返回用户信息
 * @throws {Error} 用户不存在时抛出错误
 */
export async function getUser(userId, options = {}) {
  // ...
}
```

#### 复杂逻辑注释
- 解释"为什么"而不是"做什么"
- 说明非显而易见的设计意图
- 记录特殊处理原因

```javascript
// ❌ 不好：说的是显而易见的事
// 递增计数器
count++

// ✅ 好：说明为什么这样做
// 由于浏览器缓存问题，需要添加时间戳防止缓存
const url = `/page.html?t=${Date.now()}`
```

## 公共方法使用

### 可用的公共方法
```javascript
// 来自 src/utils/auto-import/common.js
$config      // 全局配置
$dayjs       // 日期处理
$message     // 消息提示
$notification // 通知
$confirm     // 确认对话框
$info        // 信息对话框  
$success     // 成功对话框
$error       // 错误对话框
$warning     // 警告对话框
```

### 使用示例
```javascript
// 使用$message示例
$message.success('操作成功')

// 使用$confirm示例
$confirm({
  title: '确认删除',
  content: '确定要删除吗？',
  onOk: () => {
    // 删除逻辑
  }
})

// 使用$config示例
console.log('当前配置:', $config)

// 使用$dayjs示例
const formattedDate = $dayjs().format('YYYY-MM-DD')
```