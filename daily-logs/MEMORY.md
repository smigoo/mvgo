# mvgo（感智晓界）速查（详史见同目录 2026-*.md）

## 环境/构建/部署
- 根 `/Users/smigoo/工作/mvgo`；子仓 backend-node/frontend/docs；Node 13030 / Java 8080 / 前端 2610。
- Bash 跑构建/常驻服务必 `env -i PATH=".../22.22.2-3/bin:/usr/local/bin:/usr/bin:/bin" HOME=/Users/smigoo`（清 NODE_OPTIONS shim+代理）；jest 加 `NODE_OPTIONS=--max-old-space-size=1536 --runInBand --forceExit`；curl `--noproxy '*'`；多关键词 grep 必 `-E`；zsh 未加引号的 `--include=*.js` 会中止整条命令。
- 构建 `rm -f tsconfig.build.tsbuildinfo && npm run build`（不清缓存改动不进 dist）；启动 `node start-node.js`（项目根）；日志 `backend-node/server.log`，重启前必看其尾部活动（否则误杀任务且不 resume）。
- 勿设 FIELD_ENCRYPTION_KEY；AI 凭证 `data/ai-config.json`；勿加 package.json type:module；新增路由三处同步（docker nginx/公司 nginx/Java Proxy）。
- ECS `root@iZbp1hik17it6sucvjuotaZ`（仅 FlClash 增强模式）：Node `set -a; . ./.env.production; set +a; NODE_ENV=production nohup node dist/main.js`；Java 先 cd backend-java + `SPRING_PROFILES_ACTIVE=prod`；`npm ci` 必设 `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true`。

## 核心原则
**同一概念只允许一处实现 + 全链路接入 + 落盘闸门收口。** 门禁误报先问：事实源唯一吗？采集/判定是否被表达式、注释、别名、编译产物污染？修完铁律立刻 grep 全部同名判据落点。
事实源：`class-facts`/`classname-contract`/`class-dialect-normalizer`/`less-selector-stack`/`collectDeclaredBindings`/`file-collection`/`resolveComponentDirStrict`/`rootLayoutFacts`/`state.productFiles`。

## 治本家族（2026-09-13，详见 2026-09-13.md）
- 刀 7~11：资源绑定事实源（别名转发撞 import → 子组件消失）；componentId 可剥离性（`sanitizeComponentId` 闸门）；CODE-026 假阳性（`productFiles` vs `writtenFiles`）；CODE-024 假阳性（比较值被当类名）。
- 刀 12 R4 跨侧对齐。铁律：**「样式是否存在」类判据必须先剥 `[自动修复]` stub，且编译产物 `.css` 不入样式源**。
- 刀 13 COMP-001/R3：归一器掏空 `:not()` 参数 → 非法 LESS → P1-4 剔除子组件。治本 `findPseudoArgRanges`+`less-selector-stack`+契约层共用栈；门禁命名单一化 + 可修/不可修二分。刀 13-C `fixFiles` 契约错位（数组 vs 对象 map）→ 静默失效；`file-collection.js`+管线契约守卫。
- 刀 14 CODE-024 C3 可修/不可修二分：契约层 `styleClassSet` 全文本扫描 → 编译产物 `index.css` 的 stub 经主题层展开后剥不干净 → 「只有 stub」误判「样式存在」。治本 `collectAllStyleSources` 排除同名 `.less` 存在的 `.css` + `stripAutoFixSection` + `designBaseMods`；基类存在→C3 error，否则→`CLASSNAME-C3-UNREACHABLE` warn（`f6171b3`，真机 BLOCK=0）。
- 刀 15 颜色 var() 透传破坏 LESS 编译期颜色函数 —— **三条注入路径**：`file-writer#safeLessVarValue`／`less-variable-checker` 优先级 1／`code-healer#healPresetLiteralDecls`。核心：**var()（运行时）与 lighten()（编译期）根本冲突**，凡 var 化颜色都须排除被 Less 颜色函数（lighten/darken/fade/mix…）引用的变量；③「值已是 var 则跳过」会让它在 ①② 修好后**才开始改写**（**只修两条不够**）。真机 **4 模块齐全、`degradedFiles=[]`**（`0c0fb8c`）。
- 刀 16a FLEX-003 假阳性 = **选择器「目标元素」归属**（**非** stub，原预判错）。CSS 规则只作用于**最右复合选择器**，左边是祖先/条件；旧 `CLASS_RX` 直扫 selector 全部 class → `.A > .B{flex:0 0 46px}` 的值记到祖先 `.A` 头上 → 同祖先 {grow 1, grow 0} → BLOCK。治本新增单一事实源 `targetClassesOf(selector)`（拆 `,` → 剥 `:fn(...)` 参数 → 按 `/[\s>+~]+/` 取**最后一段** → 抽 class → 去重），三处调用点改用并删 `CLASS_RX`。真机 **BLOCK=0、4 模块齐全**（`a43a45b`）。
- 刀 16b **LESS 颜色函数实参的合成值必须可求值**（刀 15 的续集：**没有 var() 也一样炸**）。事实源 `utils/less-color-funcs.js`（`LESS_COLOR_FUNCS`/`isColorEvaluable`/`isUsedByLessColorFn`/`collectColorFnVars`/`NEUTRAL_LESS_COLOR`）。铁律：**消费端事实优先于名字猜测**（名字分支会给出 `8px`/`1`/`unset`，同样不可求值）→ `safeLessVarValue(name, ctx)` 后置过滤。4 条取值路径全收口：safeLessVarValue×3 调用点 / resource-mounter / less-variable-checker / injectThemeVarDeclsForLess（theme 原样注入）。`isColorEvaluable` 只认 `#hex`/`rgb*()`/`hsl*()`/`hsv*()`（用 `/^[a-z]+$/` 会把 unset 当颜色）。真机 BLOCK=0、4 模块齐全（`e5f9bcb`）。
- 复现 `POST /api/phase2/generate?reuseCache:true` + `GET /api/tasks/status/<sid>`（**字段 `data.task.status`**；`data.task.progress` 是**日志数组**，别整包打印）；起跑记 `wc -l server.log`，结束 `tail -n +N`。jest 遇 `import.meta` 先 `jest.mock`。
- 产物核验：SFC 里 `var(--x, hex)` 用于**普通 `color:`** 无害；只要不进颜色函数就不炸。全量 jest 基线 = `17 suite 加载失败（import.meta）+ 4 例断言红灯`，改动后须逐字同名同数。

## 治本家族（2026-09-14，详见 2026-09-14.md）
- 刀 17 `grid-template-*` 漏 `display:grid` → 多列塌一列被外壳裁掉 =「整块内容凭空消失」，**代码门禁结构上不可见**。治本 `ensureGridDisplay`（+SFC 版）与 `ensureFlexDirection` 共用新抽的 `scanLeafDeclarationBlocks`；触发属性刻意不含 gap（`15c631a`）。真机 healer 触发 4 次、BLOCK=0。
- 刀 18 绑定表达式对象键：刀 12 类名对齐把 `:class="{ active: x }"` 的**键**改写成含连字符裸键 → 非法 JS → P1-4 剔除整个子组件。治本 `healUnquotedObjectKeysInVue` 补引号；扩展覆盖**数组形式** `:class="['c-x', { active: y }]"` 与事件属性（首版只认「值整体是 {…}」漏了真机形态）。键正则必须 `(^|[{,])`（`3d9842f` + `ecbadde`）。
- 刀 19 **数据键被 LLM 写成类名**：`'c-device-monitor-error': '5'` 配 `{{ item.error }}` → 取值恒空（异常数/Tab 文字渲染空白）；语法合法+类名真实存在 → 全部门禁不可见。**先离线重放归一器排除管线嫌疑**（changes=[] → 污染源是 LLM 重试轮）。治本 `healClassPrefixedDataKeys`：以模板实际访问的 `.prop` 为事实源还原 script 段类名化键（后缀最短优先/裸键已存在跳过/保留引号）。存量 A/B：24895 .vue 修 26 文件，diff 全 script=true 非 script 0 处；跨 4 组件含交通监测 legendState 图例键（`ecbadde`）。真机复测见 2026-09-14.md。

## 预览取源（2026-09-14 真机）
- TaskDetail iframe **优先 last-good 快照**，不是 workspace。手改 frontend/backend workspace 刷新无效；必须改 `temp-components/.task-code-snapshots/<sessionId>/revisions/<last-good>/`。优先级：`last-good > candidate > partial > workspace`（`preview-resolver.ts#selectPreviewSnapshot`）。
- `src/workspace` 是软链到 `frontend/workspace`。`getComponentImagePath` 的 `import.meta.glob('@/**/mc-preview*.png', { eager: true })` 会把 **全部组件缩略图**当 Vite 模块拉进任务页（`?import`），含无关 `c-env-monitor-*`。改预览图加载勿用 eager 全量 glob。

## 待治 backlog
- **视觉覆盖门禁**（新，优先级高）：刀 17/19 都证明 `BLOCK=0` ≠ 视觉正确 —— 文字空白/整块消失全放行。需截图 vs 设计稿的视觉覆盖检查进管线。
- **刀 16c/d**：治本 camelCase→kebab 映射主题变量（`@colorPrimary`→`@color-primary`，兼满足 M5-10）；LLM 偶发返回「示例骨架/裸 SFC」非 JSON（`rawOutputLength` 极短即信号）→ `code-parser` 加形态嗅探。门禁 C4 文案用 `rule.raw`（未展开）→ 改打印 `resolvedSelector`/`modKey`（仅文案，判据正确）。残余：`style-tokens#buildVue3ThemeMixinSnippet`/`mc-skeleton#tokensToLessVars` 构造 theme 文件、消费方任意 → 拿不到消费端事实（输入是设计稿实测色，暂安全）。
- 4 例基线红灯：ComponentService 权限 ×2、HttpExceptionFilter、manifest-auditor golden hash。
