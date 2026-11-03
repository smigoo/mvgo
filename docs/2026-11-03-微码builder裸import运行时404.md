# 微码 builder 裸 import 导致运行时 404

> 状态：已实施并通过真实浏览器与全量两态验收。刀前锚点 `backend-node@b520026`。未直接修改失败任务产物；未重启、未部署、未推送。

## 1. 查重结论

- 既有 `loadVue3Runtime.js` 会把 `common.js` 的 `$mcComponentBuilder` 注入 `globalThis`；`moduleCache` 只允许 `vue/echarts/microvideo-request/ant-design-vue`，没有同名裸模块。
- 既有 `sfc-semantics.js#dedupeMcComponentBuilder` 只处理重复的全局 builder 解构，不处理 `from '$mcComponentBuilder'`。
- 既有 prompt 契约要求直接调用宿主全局 `$mcComponentBuilder()`；本刀续接该唯一契约，不在前端预览器新增第二套裸模块别名。

## 2. 真机根因

任务 `mc-max-1793660171037-abed6b93` 后端终态为 `completed`，运行时门禁降级。用当前 `b520026` 对应 dist 重放真实预览，稳定得到：

```text
RUNTIME-004: load-error / component-load
原始错误：找不到文件: $mcComponentBuilder
RUNTIME-007: 快照文件 $mcComponentBuilder 404；workspace $mcComponentBuilder 404
RUNTIME-010: [预览] 加载失败: Error: 找不到文件: $mcComponentBuilder
```

真实 `package/index.vue` 含：

```js
import { componentProps, businessProps, runtimeBuilder, componentApi } from '$mcComponentBuilder'
```

这不是可下载文件，而是宿主全局 API。`vue3-sfc-loader` 因 `moduleCache` 无此模块而进入 `getFile`，故快照源与 workspace 源各请求一次并均 404，组件在挂载前失败。

另四项 `bg1/bg2/icon2/icon4` 为静态源码零引用，属于独立资源挂载缺口；它们不是上述 `$mcComponentBuilder` 404 的触发源，本刀不合并处理。

## 3. 治本契约（已按真实回放验证）

- 在 `sfc-semantics.js` 增加唯一归一函数，仅识别具名 import 且模块说明符严格等于 `$mcComponentBuilder`。
- 将简单具名绑定转换为既有标准形态：

```js
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()
```

- `import { runtimeBuilder as rb }` 转为 `runtimeBuilder: rb`；非法/复杂绑定保持原样，不盲目豁免。
- 在 `assembleIndexVue` 的脚本最终拼装出口、既有 `dedupeMcComponentBuilder` 之前调用；后续重复解构仍由既有去重函数处理。
- 真正未知裸模块不被本规则触碰；默认导入、命名空间导入和副作用导入不转换。
- 真机/真实产物回放须输出 `mcBuilderModuleImport healed=N` 计数；N=0 时需阳性对照证明判据不是空转。

## 4. 影响面与回滚

- 直接调用方：仅微码 `assembleIndexVue`；标准 Vue3 不走该装配器，不受影响。
- 上下游：转换后再走既有声明去重、builder 解构去重、语义门禁和写盘守卫，不改变模板、资源、布局或主题。
- 前端 `loadVue3Runtime.js` 不改；预览白名单不扩大。
- 风险：A=共享 builder 判据误改其它模块（用严格模块名和未知模块阴性测试控制）；B=别名转换错误（别名测试控制）；C=既有分块 mock 漏新导出（相关家族回归控制）。
- 回滚：固定 `b520026`，仅反放本刀源码、测试和文档；全量两态失败集合不得漂移。

## 5. 验证计划

1. 旧实现先红：真实具名 import 未归一；别名、重复 builder、未知模块、默认/命名空间/副作用 import 分别有对照。
2. 真实 `abed6b93` 的 template/script 经装配回放：不再存在 `from '$mcComponentBuilder'`，标准 builder 解构只有一份，日志 `healed=1`。
3. 将回放结果送入真实预览（只在临时副本，不改任务产物）：`$mcComponentBuilder` 两类 404 消失；另记录后续独立问题，不用掩盖方式强行 PASS。
4. 定向 + 相关微码家族 + 同仓全量两态；构建并核对 src/dist。
5. 文档/memory/限定文件提交；不重启、不部署。

## 6. 实施与验收结果

### 6.1 代码落地

- `sfc-semantics.js` 新增 `normalizeMcComponentBuilderImports`；`dedupeMcComponentBuilder` 以向后兼容的可选参数支持最终装配出口 opt-in，分块合并不提前消费计数。
- `microcode/code-generator.js#assembleIndexVue` 的 `<script>` 与裸脚本两个分支均启用归一，并只在真实转换时输出计数。
- 初版正则误用 `\s*;?` 吞掉后续换行，已收紧为 `[ \t]*;?`，并新增换行断言。

### 6.2 定向与真实产物

- 新增 `sfc-semantics.mc-builder-import.spec.ts`：9 条用例在旧实现先红，修后 9/9 全绿；相关微码家族 6 套件 / 107 用例全绿。
- 真实 `abed6b93` 装配回放：

```text
mcBuilderModuleImport healed=1
bareBuilderImport=false
builderCalls=1
sfcErrors=[]
scriptParse=PASS
```

- 真实浏览器采用 Puppeteer 请求级临时替换修复后的 `package/index.vue` 响应，**未修改原任务文件**：

```text
httpErrors=[]
pageErrors=[]
```

页面完整显示组件标题、tabs、今日累计和三张统计卡。唯一 console 为既有良性白名单 `Permissions policy violation: unload is not allowed in this document.`。这证明 `$mcComponentBuilder` 两类 404 与加载异常均已消失，不将四个孤儿资源或未渲染时的视觉分数混作本刀结果。

### 6.3 全量两态与构建

固定刀前 `b520026` 反放本刀建立真实基线，再恢复当前改动：

| 状态 | 套件 | 用例 |
|---|---|---|
| 刀前基线 | 364：21 failed / 1 skipped / 342 passed | 5128：43 failed / 3 skipped / 5082 passed |
| 当前 | 365：21 failed / 1 skipped / 343 passed | 5137：43 failed / 3 skipped / 5091 passed |

新增 9 条测试全部通过；两态失败套件与失败用例名单双向 diff 均为空：

```text
CURRENT_ONLY_SUITES=[]
BASELINE_ONLY_SUITES=[]
CURRENT_ONLY_TESTS=[]
BASELINE_ONLY_TESTS=[]
```

两次全量均写出完整 Jest 摘要；工具包装层随后报告项目外生成目录清理动作的 sandbox 拦截，未绕过权限或重试删除，故不声称包装命令 exit 0。`nest build` 已成功，最终换行修正后的两份生产源码与 dist md5 分别一致。

### 6.4 边界

- 本刀只修微码装配出口的宿主 builder 契约；标准 Vue3、前端预览白名单、模板、布局、样式和资源均不改。
- 四个孤儿资源 `bg2/bg-124.png`、`bg1/bg-125.png`、`icon4/icon-8036.png`、`icon2/icon-8070.png` 继续独立归因。
- 组件修复加载后应重新评估视觉差异，不沿用未渲染状态下 `VISUAL-002 score=0.2373` 作为布局根因。
- 不重启、不部署、不推送；提交仅包含本刀明确列出的生产文件、测试、方案与总纲。
