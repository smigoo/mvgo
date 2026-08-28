# 框架交互事件（mc-framework-*）


`mc-framework-` 前缀的事件是平台级交互事件，**无需在 `declare.json` 的 `businessEvents`/`businessStatuses` 中声明**。

## 事件列表

| 事件标识 | 平台 | 描述 |
|----------|------|------|
| `mc-framework-init` | 微码/一体化 | 通知框架组件初始化完成 |
| `mc-framework-badge` | 一体化 | 设置菜单角标信息 |
| `mc-framework-loading` | 一体化 | 控制全屏 loading 状态 |
| `mc-framework-close-component` | 微码/一体化 | 关闭当前组件 |
| `mc-framework-tab-page-click` | - | 切换分页 |
| `mc-framework-websocket` | 微码 | 监听 WebSocket 推送 |
| `mc-framework-subscribe-websocket` | 微码 | 发起 WebSocket 订阅 |
| `mc-framework-clear-` + layoutId | 微码 | 监听详情布局关闭 |
| `mc-framework-mapdialog` | 微码 | 地图触发弹框交互 |
| `mc-framework-confirm` | 一体化 | 触发二次确认弹框 |
| `mc-framework-openLoadingEffect` | 微码 | 开启页面 loading 蒙层（框架 2.4.40+） |
| `mc-framework-closeLoadingEffect` | 微码 | 关闭页面 loading 蒙层（框架 2.4.40+） |

## 常用事件用法

### 组件初始化完成

```js
runtimeBuilder.publishEvent('mc-framework-init')
```

### 全屏 loading

```js
runtimeBuilder.publishEvent('mc-framework-loading', { loading: true, text: '加载中...' })
runtimeBuilder.publishEvent('mc-framework-loading', { loading: false })
```

### 关闭组件

```js
runtimeBuilder.publishEvent('mc-framework-close-component')
```

### 角标

```js
runtimeBuilder.publishEvent('mc-framework-badge', {
  position: 'top-right',  // top-right / bottom-right / bottom-left / top-left
  count: 5,
  numberStyle: { background: '#ffbe00', color: '#333' }  // 可选
})
```

### 二次确认弹框

```js
runtimeBuilder.publishEvent('mc-framework-confirm', {
  visible: true,
  title: '是否删除？',
  content: '删除后无法恢复！',
  defaultClass: 'top-center',  // top-center / center
  status: 'danger',            // default / warning / danger
  ok: () => {
    // 必须 return true 或 Promise<true> 才会关闭弹框
    return true
  }
})
```

### 组件级 loading 蒙层（框架 2.4.40+）

```js
const { runtimeBuilder } = $mcComponentBuilder()
runtimeBuilder.openLoadingEffect('light')   // 'light' 或 'dark'
runtimeBuilder.closeLoadingEffect()
```

### WebSocket 监听（v1.0.4+）

```js
runtimeBuilder.mcFrameworkListenEvent('mc-framework-websocket', (data) => {
  console.log('收到推送', data)
})
```

### WebSocket 订阅（v1.0.7+）

```js
runtimeBuilder.subscribeWebsocket('topic/path', (topic, body) => {
  console.log(topic, body)
})
```
