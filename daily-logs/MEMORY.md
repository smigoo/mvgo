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
- 复现 `POST /api/phase2/generate?reuseCache:true` + `GET /api/tasks/status/<sid>`（**字段 `data.task.status`**）；起跑记 `wc -l server.log`，结束 `tail -n +N`。jest 遇 `import.meta` 先 `jest.mock`。

## 待治 backlog
- **刀 16a**：FLEX-003 把 `common.less` 的 `[自动修复]` **stub 段**当设计真值 → 照刀 12/14 排除（`stripAutoFixSection`／编译产物 `.css` 不入源）；文案打印的两套 flex 值**完全相同**、不可读。同类：门禁 C4 文案用 `rule.raw`（未展开）→ 改打印 `resolvedSelector`。
- **刀 16b/c/d**：`safeLessVarValue` 兜底 `unset` 也破坏 `lighten()`（实测）→ 被颜色函数引用的变量任何路径都须真颜色；治本 camelCase→kebab 映射主题变量（`@colorPrimary`→`@color-primary`，兼满足 M5-10）；LLM 偶发返回「示例骨架/裸 SFC」非 JSON（`rawOutputLength` 极短即信号）→ `code-parser` 加形态嗅探。
- 4 例基线红灯：ComponentService 权限 ×2、HttpExceptionFilter、manifest-auditor golden hash。
