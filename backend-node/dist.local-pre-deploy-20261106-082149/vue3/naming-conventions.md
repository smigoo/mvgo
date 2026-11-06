# 命名与文件规范

## 文件命名规则

| 文件类型 | 命名规范 | 示例 | 说明 |
|---------|---------|------|------|
| **组件文件夹** | PascalCase | `Button/`, `UserCard/` | 组件根目录 |
| **组件文件** | PascalCase.vue | `Button.vue`, `UserCard.vue` | Vue组件文件 |
| **普通JS文件** | kebab-case.js | `lazy-use.js`, `request.js` | 配置、工具等文件 |
| **LESS样式文件** | kebab-case.less | `button-style.less` | 组件内部样式 |
| **父级目录** | kebab-case | `base-components/`, `business-components/` | 组件分类目录 |
| **文档文件** | kebab-case.md | `readme.md` | 组件文档 |
| **导出文件** | kebab-case.js | `index.js` | 组件导出入口 |

## 变量和函数命名

### 变量命名
- **变量和函数**: `camelCase`
  ```javascript
  const userName = 'John'
  const fetchUserData = () => {}
  const calculateTotalPrice = () => {}
  ```

- **常量**: `UPPER_SNAKE_CASE`
  ```javascript
  const MAX_FILE_SIZE = 1024 * 1024 * 10  // 10MB
  const DEFAULT_TIMEOUT = 30000
  ```

- **类/构造函数**: `PascalCase`
  ```javascript
  class UserService {
    constructor() {}
  }
  ```

- **私有成员**: 前缀下划线 `_`
  ```javascript
  class ApiClient {
    constructor() {
      this._baseUrl = 'https://api.example.com'
    }
    _buildHeaders() { /* ... */ }
  }
  ```

### 函数命名约定

| 类型 | 前缀 | 示例 | 说明 |
|-----|------|------|------|
| **事件处理** | handle/on | `handleClick()`, `onInputChange()` | 处理用户交互 |
| **数据获取** | fetch/get | `fetchUserData()`, `getUserInfo()` | 获取远程或本地数据 |
| **数据设置** | set | `setUserInfo()`, `setConfig()` | 设置状态或配置 |
| **UI控制** | show/hide | `showModal()`, `hideDropdown()` | 显示/隐藏UI元素 |
| | open/close | `openDialog()`, `closeDrawer()` | 打开/关闭模态框 |
| **状态变量** | is/has/should | `isLoading`, `hasError`, `shouldUpdate` | 布尔值状态 |
| **数组变量** | 复数/后缀List | `users`, `userList` | 数组类型数据 |
| **CRUD操作** | add/remove/update/delete | `addItem()`, `removeUser()` | 数据增删改查 |

## 目录结构规范
- **业务层级不超过3层**
- **按功能模块分类，不是按类型分类**
- **静态资源要在assets相应子目录**