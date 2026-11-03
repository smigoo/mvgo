# 更新日志（CHANGELOG）

> 记录每次生产发布批次，最新在上。
> 部署步骤 / 回滚 / 密钥红线见 `DEPLOYMENT-NOTES.md` 与 `~/.workbuddy/skills/mvgo-deploy`。
> 提交号均可在对应子仓 `git show <hash>` 复核。

---

## v2026.11.02 — 2026-11-02（跨至 11-03）

**状态：✅ 前端已于 2026-11-03 00:29:38 部署上线（**仅前端**，后端/Java/nginx 均未动）；后端 `dist` 落后 HEAD，待干净重建、未部署。**

| 组件 | 生产当前 | 本次目标 | 变更提交 | 产物核验 |
|---|---|---|---|---|
| `backend-node` | `37d0983` | `1f0084c` | **82** | ❌ 未部署。`dist/.build-stamp` = `63a285d` 落后一个提交，且 `dist/main.js` mtime 17:29 早于 stamp 写入时间 ⇒ 产物为新旧拼接，**须 `rm -f tsconfig.build.tsbuildinfo && rm -rf dist && npm run build` 重建** |
| `frontend` | **`8510544` + 未提交②（11-03 00:29 已上线）** | 同左（已达成） | **54** | ✅ **已上线**。包 `/tmp/mvgo-frontend-8510544.tar.gz`（27M / 916 项 / sha256 `7de002b5…`），入口 `index-C976NiLg.js`；线上 806 文件 / 313 js / 61 css / 52M，5 个核心产物 SHA256 **与本地产物逐字节一致**；回滚锚 `mvgo.bak.20261103-002938` |
| `backend-java` | `a1224ec`（09-29） | 不变 | 0 | 工作区干净、无 `.java` 变更；进程 PID 2393626 自 09-30 00:01 存活 |
| nginx `gzxj.conf` | 现状 | 不变 | 0 | 无路由/前缀改动（mtime 仍 `2026-09-29 23:24:43`） |
| 环境变量 | 现状 | 不变 | 0 | `FIELD_ENCRYPTION_KEY` 不动 |

> ① 生产前端为 10-09 09:57 构建（入口 `index-Chu2mHxQ.js`），晚于 10-09 00:00 的 `a82f785`、早于下一个提交 `1d84525`(10-09 18:36)，故推定基线为 `a82f785`。
>
> ② 前端重建时工作区尚有 **1 个未提交改动** `src/components/QualityScoreAdminButton.vue`（+29 行，「未评分维度可见性」显式标注，见 D 节末条），**已包含在本次产物包中**。若要严格对齐 `8510544`，需先提交该文件或回退后重建。
>
> ③ 版本号口径：`37d0983..1f0084c` 共 82 个提交（含 7 次 `daily auto-sync`），其中功能性提交 75 个；前端 `a82f785..8510544` 共 54 个（含 3 次 auto-sync）。

### 后端 `backend-node`（`37d0983` → `1f0084c`）

#### A. 生成管线 · 几何与方向仲裁
- 🔴 **架构级重构** `b87a157` ai-engine 管线重构（子组件规划 / 代码生成 / 视觉校验 / 节区处理分层）
- 🔴 **关键契约** `ae860da` **结构骨架 vision 优先** + 字号下限守卫双形态覆盖（`calc(@fontSize*X)` 与裸 px；Lite vue3 不归一）；用户拍板「结构骨架 = vision ／ 精确尺寸 = Figma」
- `07ef202` 布局事实构建与注入器优化（配套测试 `b76f7fa`、`9be50f3`）
- `0013ba8` **A2 定稿**：R23 归并后容器方向复算「闸⑤ 事实优先闸」由单条件改为**两条件合取**；`f1a7b79` 移除 A2 排查临时脚本（7 个）
- **刀12** `781aedd` 2D 行簇重建（左图右文横向带被纵切七段；FIXED pill 被拉成 100% 宽条）
- **刀16** `e35f0b5` 兄弟间距真值注入（纵流 33/20/20px、行带内 64px 全贴死）
- **刀17** `b9041cf` 横向容器 2D 列簇 + 交叉轴居中
- **刀31** `09004e7` 6 统计卡被拍平成 36 行纵堆 + 容器错挂背景
- **刀32** `b52346d` 容器背景色归属律守卫（卡级高亮误写进 `con-con`）
- **刀33 第1步** `435016a` 锚点优先级单一来源 + 折叠形态改用几何判据
- **刀33 第2步** `06abf01` 接管层回收列表 item 卡盒真值（470×72 / radius 6）
- **R1+R2** `d057805` 锚点修复门槛补「LCA 覆盖兄弟段拒修」+ 归属候选键单一来源
- **R3** `47657ca` 超界段禁单元素接管（树内引用落在锚点子树外 ⇒ scope-incomplete）
- **R4b-A** `16ec079` 方向仲裁：几何事实只补缺失、不翻转显式声明（冲突留痕 `LAYOUT-FACTS-CONFLICT`）
- **R6-B1** `2c95738` 宿主类方向豁免（`data-section-id` 宿主类正向剥离豁免 `display/flex-direction`）
- `06ed935` low 置信方向闸改两事实合取；`da0f71d` 宽容器真纵排补第三条事实

#### B. 接管家族（刀53 a–h）
- `55920b3` / `5e4ad69` / `529f9a4` **kvgrid 属性网格**（plan 保留 vision `internalTree`；无声明时从 Figma 几何推导）
- `3aa99b2` N 段线性文本按真值接管
- `5bdd731` icon 叶父级图片包装借用（Mask group 同 bbox IMAGE fill）
- `15eeaee` 锚点解析收口（合成 id 叶不得吸收父容器 + 纯文本多行渲染）
- `b3f4d81` + `0f7e605` **53d/53e 资源绑定收口** + 新增 **CODE-028**（静态 `style` 里的裸 `url(资源变量)`，补 CODE-022 的洞）
- `593cf7f` 统计卡卡底走图片通道（修整卡底只渲 50%）
- `af42a58` 列表统计形态⑥：顶层 `status.elements` 平铺交替 ⇒ 复用 valueGroup 成对归一
- `eb11c84` **刀53h footer 汇总条**确定性接管（家族第 10 成员，判定链末位）
- **R9** `bee632d` **fg-table antd 语义升级**：刀53e table 分支手写 flex 表格 DOM ⇒ `<a-table :columns :data-source :pagination=false :bordered=false table-layout=fixed>`（实锤 `fe47afcd`：确定性接管绕过 LLM，故 prompt 里「数据表格 → a-table」对接管产物天然无效）；真值全走**运行时注入**（列宽 %→`columns.width`、表头/单元格外观→`customHeaderCell`/`customCell` inline style、文本→`#headerCell`/`#bodyCell` slot inline、图标→`ICON_MAP` 查表，无可用图标则不产 img 行以保零副作用）；行高 `th=rowH`、`td=rowH+rowGap`（负节距并入，44+8×43=388 精确命中真值总高）；产物禁 `import ant-design-vue`（运行时全局注册，白名单）

#### B2. 同构列表接管（刀20–刀28，早于刀53 家族）
- `36cdbb7` **刀20** 同构列表接管（20a planner items 轨重建 + 20b 渲染）；`f326601` 刀20 spec 配套（fg-list 检测 / 渲染 / 集成 + planner items 轨坍缩）
- `e909916` **刀21** 同构列表坍缩治本二阶段
- `54571bf` **刀22 + 刀23** 同构列表坍缩治本三阶段
- `674c306` **刀25 + 刀26** 列表接管结构还原（刀25 折叠产物恒带整列）
- `17fab6b` **刀28** 列表接管四连修

#### C. 预写自愈与质量门禁（本次重点）
- **R8-1** `fe5123b` 幻觉段整段收敛：`healDuplicateTextIssues` 剥文本后双判据（`section sourceNodeIds` 空 = vision 幻觉段 + 剥后模板渲染文本空）⇒ `index.vue` 移除挂载 + import、files 剔除组件、删盘上文件；不猜三弃权；真锚段空壳走 `emptyShellSections` 显式计数
- **R8-2** `2091b9e` 透明容器臆造背景：`TRANSPARENT-CONTAINER-BG` 从 WARN-only 升级为**确定性剥除**（真值 `fills=[]` 的容器宿主类顶层 `background(-color)` 原文区间外科剥除 + 计数行 + meta WARN 并存）
- **R8-3** `eb68508` 畸形属性名拼接自愈：`gateStandaloneLessWrite` 新增 `healNestedPropertyDeclarations`（`background: box-shadow: X` ⇒ 抽出 `box-shadow: X`）+ 终裁 `LESS-WRITE-006`
- **R8-5** `502b89a` **空壳对账独立扫描**：`collapseHallucinatedEmptySections` 不再依附重复文本前提（R8-1 被 `duplicateTextIssues=0` 早退锁死 ⇒ 幻觉空壳段从头无文本可剥、静默落盘占 `flex:1` ⇒ 2/3 空白）；判据单一来源 `isHallucinatedSection`（①a `sourceNodeIds` 空；①b 非空但 100% 不在 Figma 真值树，`refs` 全 `missingRefs`）；动作单一来源 `tryCollapseSectionMount`（R8-1 双循环合并，消 rollback 双计数瑕疵）；真值索引缺失则①b 停用不猜
- **R8-6** `e2de851` **frame 类挂载族对账**（pre-write ㉒ pass）：LLM 对同 Figma frame id 概率性挂 `c-component-frame-{id}`（无尺寸）而非 `c-{sem}-frame-{id}`（4 列 flex），同单内不自洽 ⇒ 6 厂商 item 无宽度约束挤一行互相压盖；三条判据同时成立才补挂（①模板挂基类 ②产物 less/scoped 存在 `{X}-frame-{id}` 且规则体含 `flex`/`width`/`grid-template` 尺寸声明 ③class 未含尺寸类）；双类并存不动基类、fail-open 不猜、Figma id 全局唯一无串位
- **R8-7** `36813bc` **段内容事实断供治理**：`declaredContent` 透传 + R6 口径补齐 + header 两态递归 + `droppedKeys` 观测
- **R8-8~10** `1f0084c` **grid/display 一致性对账 + 声明内容覆盖**：新增 `utils/grid-display-alignment.js` —— 同一声明域内同时出现 `grid-template-columns` 与最终生效的 `display:flex` 即确定 display 写错，**只把最后一个 `flex` 改成 `grid`**，不猜列数、不动其他布局声明；`.vue` 的内联 `style=` 域与 `<style>` 块域**分别对账**（静态 inline 与 SFC style 是两个独立声明域）；配套 `subcomponent-planner` / `grid-list-layout-contract` / `figma-coverage-dedupe` / `pre-write-self-healing` 四处口径补齐
- **样式评分双缺陷治本** `396f7c2`（实证 `styleScore=42` 虚低）：① `extractDeclaredStyleLiteralsWithLocation` 补扫 `.vue` 模板内联 `style="…"` / `:style="{…}"`（fg-takeover 产物 fg 样式**全在内联**，此前只扫 `<style>` 块 ⇒ `#3965ff`、`gap:34px/10px`、`margin-top:-1px` 全判 missed；只取字面量，动态表达式天然不误采，不扫 script）；② `scoreResourceMount` 挂载目标改 `targetDomSelector` 解析 `data-section-id` + `ownerSectionId` 兜底（此前用资源图自身 `figmaNodeId` 恒判 0/3），shared alias 回退主资源候选；**实机重算 42→72**（color 58→67 / spacing 25→100 / resourceMount 0→100）
- **刀8** `15a930b` TEXT-COVERAGE 假绿治本（产物语料剥注释单一来源 + 通过也打 STATS 计数行）
- **刀11** `082b416` 候选快照语法有效性闸（推送前 `validateVueSFC`）
- **刀13** `5880b28` vue3 接管叶重复覆盖守卫
- **刀15** `931ec7e` DSML 工具调用残片区剥除（全角 `｜` 污染 `common.less`）
- **刀18** `a07bb1a` `theme-vars.less` 回写 ENOENT（回写前 `mkdirSync(recursive)`）
- **刀19** `52f793d` 硬编码字号假阳性：检查判据与生成侧归一器同源（`FG_TAKEOVER_CLASS_RX`）
- **刀24** `b562ba1` fg-list 渲染产物语法闸（逐项缺逗号致整文件丢失）
- **刀27** `b5aedaf` 死样式剔除括号配平（嵌套 Less 开闭失衡）
- **刀29** `f8a832f` / **刀30** `90bf78f` vue3 三假阳性 / **刀10** `8cb6773` 借用资源守卫祖先视觉包含豁免 / **刀14** `7f92b54` 模板嵌套配对 / **刀6** `d686047` stack⇒grid / **刀7** `c6cd125` 容器吸收背景层 / **刀9** `62f2b80`+`3a33f9c` 别名 import 治本

#### D. 文本与段契约保真
- **Phase H** `8cf367a` 产物文本保真扩口径（ASCII token 并列口径）
- **Phase I-1/2** `33942ef` 段身份契约 + 段归属映射源替换（`assignSectionComponentNames` 取代关键词反猜）
- **Phase I-3** `9234c86` COMP-002 恢复视力（合成 section 真值源补全 `collectSectionBodyTexts`）
- **R6** `1b870fc` 接管形态 vs 段声明内容对账（吃不下就拒接管回退 LLM）
- **R6-2** `fe80049` 声明内容量守恒（`declaredUnconsumedCount` 升维为 `declaredTextMass` 递归收集）
- `c4298a6` 表头契约形态⑤（单个 `table-header` 容器）
- `f4f3728` 用户补充需求契约句拆两层（交互/行为类显式要求必须落实）

#### E. 配置与多租户安全
- `d0b07e8` **Figma Token 多值**（每人最多 2 个、手动选一生效）降维投影：新增 `config/figma-token-projection.ts`，`figmaTokens[]`+`activeFigmaTokenId`；schema `.max(2)`；三条绕过合并入口的直读路径补投影；`collectMaskedSecrets` 数组逐条脱敏
- `1fde189` **ProviderPool 跨用户串配置根治**：槽位注册归属 `scope` 校验 + 删 phase2 启动 pre-pick（修生产实锤「配置 deepseek，任务却烧别人 key」）

#### F. 其他
- `bc24a91` 深色主题令牌化（alpha 与色值成对保真）
- `e2c8ecc` `findSectionById` 重复声明致投单必炸
- `8bd0f07` / `44d2f86` / `2f8c4c6` 方向度量审计脚本与真值裁判三件套

### 前端 `frontend`（`a82f785` → `8510544`）

#### A. 预览体系（本次最大块）
- **响应式预览统一**：TaskDetail 恒响应式（删保真模式）、控制条收进浏览器工具条不再占组件上方一行、缩放下拉（自适应/50–150%）+ Fit 按钮 + 三向视口手柄 —— `cdcd937`、`561406c`、`339d592`
- **拖拽调尺**：Pointer Capture 修「松开后尺寸仍变」（mouseup 被 iframe 吞）—— `4d5358d`、`1d84525`、`4f0665e`、`4ac51d5`、`e4d0dfc`、`98cd54e`
- **自适应语义改按宽度适配**、画布跟随设计稿尺寸、预览 wrapper 全白融合、视觉只余一条页面级滚动条 —— `df9d6fc`、`022984a`、`ab5a512`、`ccc0b8a`
- **demo/playground**：画布缩放换 CSS zoom、补高度链、固定 1920×1080 画布、默认视口跟随设计稿比例 —— `c48878c`、`cbdc116`、`28fe744`、`ed0bcbb`、`e60f2c6`、`102dad4`、`d7102ac`、`20d15fc`、`b7b8ca1`
- **主题链路**：iframe 主题透传、手动选择持久化、N 主题随 URL 持久化、修「切主题闪两下」、修「dark 和主题2 一样」、修「切主题视觉不生效」（puppeteer 定案）—— `c134c8f`、`4459a93`、`5cd8b37`、`b73fbb3`、`50056a6`、`7c1cbae`、`c11cdb7`、`63810da`
- **任务详情多主题卡**：逐主题缩略图/名称/深浅 chip/设计稿跳转/系统内置标记 + 实时拉 Figma 缩略图兜底 —— `a5ad6b6`、`d368f4b`、`ce72ec8`、`0711aef`、`7c2538f`、`43bae26`
- 主题行行内小预览移除、antd 插件重复安装判据更正 —— `84195dd`、`bb9e811`

#### B. 生成页
- **高级选项折叠条**：组件ID防抖查重 + 占用拦截、补充提示词、需求文档上传（仅微码投递）—— `b07541b`、`f59c2c6`
- URL 历史记录按「规范 × 档位」分条（同一 URL 的 vue3/微码、max/lite 各占一条）—— `5448a11`
- Figma 历史下拉改任务维度 + 多主题任务生成期主题卡占位 —— `37bc0e2`
- 生成页面大幅增强与 Lite API / 预览 / 任务详情优化 —— `9a841a3`

#### C. 任务详情与历史
- 历史任务新增档位/类型徽章（微码Max / Lite / Vue3 / 页面）+ 去重键改为「链接 + 类型」+ 还原时自动切换类型档位 —— `013ed75`
- canvas-header 组件名改为**只显示 `componentId`** —— `8510544`

#### D. 其他
- **Figma Token 多值面板 UI**（最多 2 个 / 下拉手动选一生效 / 计数 `n / 2` / 测试按钮整合）—— `8510544`
- **规范检查「AI 修复」假成功**：`ResponseEnvelopeInterceptor` 把扁平返回的 `success` 剥到信封顶层，`fixMcSpecItem` 只查内层 `data.success` ⇒ 失败也弹「修复完成」；改为双层判失败 —— `6111294`
- `sfc-loader-esm` 单一真相源（含顶层 ESM 的 `.js` 声明为 module 资源）—— `db6c46a`
- `default-panel` chrome 标题让位 —— `b30bc51`
- 入库 puppeteer 预览实测探针（三采样点盯 zoom 漂移/尺寸塌陷）—— `bdd0e8a`
- R1 取证：图表 resize 覆盖率 99.7%，风险基本证伪 —— `16cdd81`
- `e1b0428` 补回 `package.json` 末尾换行（json.dump 重写时丢失）
- **质量分「未评分维度」可见性** —— `QualityScoreAdminButton.vue`（**⚠️ 未提交，但已进本次产物包**）：`resourceMount` 维度 `scored:false` 时此前整块不渲染，用户看不到「本维度未验证」、易误读成「已通过」；现改为显式渲染「未评分」态 + 原因说明 + `unanchored` 条目数，并注明该维度**不参与 `styleScore` 等权平均**

### 本次不涉及
- **Java**：`backend-java` 工作区干净，自 09-29 `a1224ec`（门户校验短 TTL 缓存）后无提交，`*.java` 无 10-09 之后变更 ⇒ 不打 jar、不重启、不动 `MONGODB_URI` / `PORTAL_BASE_URL`
- **nginx**：`gzxj.conf` 无路由改动；30+ Node 前缀 location 与 `/api → 192.168.112.1:8080` 全部保持原样
- **环境变量**：无新增/变更

### 上线前置（必做）
1. ✅ **前端快照已建**（11-03 00:29:38）：旧目录整体重命名为回滚锚，**零拷贝秒级**，完整保留 10-09 版 856 文件：
   ```
   /home/mvbt/nginx/www/mvgo.bak.20261103-002938   # 入口 index-Chu2mHxQ.js，856 文件
   /home/mvbt/nginx/www/mvgo.old                   # 9/30 旧锚，保留未动
   ```
   回滚：`cd /home/mvbt/nginx/www && mv mvgo mvgo.failed.<ts> && mv mvgo.bak.20261103-002938 mvgo`（静态文件即时生效，无需 reload）。
2. 🔴 **后端 dist 必须干净重建**（当前 `stamp=63a285d` 落后 `HEAD=1f0084c`，且 `main.js` mtime 早于 stamp ⇒ 产物新旧拼接不可信）：
   ```bash
   cd /Users/smigoo/工作/mvgo/backend-node
   rm -f tsconfig.build.tsbuildinfo && rm -rf dist
   env -i PATH="/Users/smigoo/.workbuddy/binaries/node/versions/22.22.2-6/bin:/usr/bin:/bin" HOME="/Users/smigoo" npm run build
   cat dist/.build-stamp        # 期望 git: 1f0084c
   ```
   判据：`dist/main.js` mtime **≥** `.build-stamp` 写入时间，才算真干净。发布前再建回滚锚 `dist.bak.1f0084c-<ts>`（现有锚 `dist.bak.37d0983-20261026-164559`）。
3. ✅ **前端 dist 卫生已解决**：本地已 `rm -rf dist && npm run build` 干净重建 —— `dist` 全量 `*.js` 由 **5310 → 313**（其中 `dist/static/js` 顶层 **198**）、总文件 **806**、整体 **606M → 53M**（清掉 4998 个历次 hash 死文件；此前 `build:safe`（`--emptyOutDir false`）累积所致）。包已生成：`/tmp/mvgo-frontend-8510544.tar.gz`（27M / 916 项，无 `._` 垃圾文件）。**因是干净包，线上整目录替换（已执行）**。
4. ⚠️ **入口 hash 变更（已生效）**：生产 `index-Chu2mHxQ.js` → 现 **`index-C976NiLg.js`**（另 `vendor-CvtnGv-a.js` / `ant-design-CzcxyID2.js` / `microvideo-map-C31GrQdE.js` / `static/css/index-C3QVjp-u.css`）⇒ 所有在线用户必须硬刷新（`Cmd/Ctrl+Shift+R`）。⚠️ `/mvgo/index.html` **未设 `Cache-Control`**（仅 ETag/Last-Modified），旧标签页仍会命中旧缓存 → 请求旧 chunk 会拿到 SPA 回退的 HTML（`Content-Type: text/html`）而白屏，硬刷新即恢复。

### 前端部署记录（2026-11-03 00:24–00:31）

| 步骤 | 动作 | 结果 |
|---|---|---|
| 1 | `scp -P 65522` 上传 `/tmp/mvgo-frontend-8510544.tar.gz` | 27,957,902 B / 21s；远端 `sha256sum` = `7de002b5…a697d2` **一致** |
| 2 | 解压到暂存区 `www/mvgo.new`（`tar --no-same-owner --no-same-permissions`） | 806 文件 / 313 js / 61 css / 52M / `._` 垃圾 **0** |
| 3 | 暂存区 8 项入口引用逐个存在性校验 | 全 **OK**（`config`/`log`/`monaco`/`@mc-config`/`static` 与线上逐目录对齐） |
| 4 | 差异审计：仅线上有 **202** / 仅暂存有 **152**（净 −50） | 202 个被移除文件 **mtime 全为 `2026-10-09 09:57:45`**（= 该次构建统一时间）⇒ 纯旧构建产物、**零运行时写入**；且 `temp-components`/`workspace`/`backend-node/data`/`src` 反查引用 **0 命中**、新 bundle 引用 **0 命中** |
| 5 | 原子切换 | `mv mvgo → mvgo.bak.20261103-002938`（回滚锚）；`mv mvgo.new → mvgo` |
| 6 | 验收 | 首页 **200** / 1470 B；`index` `css` `vendor` `ant-design` `microvideo-map` **5 个 SHA256 与本地产物逐字节一致**；`monaco/vs/loader.js`、`@mc-config/index.json`、`topology.html` 全 200；`/api/tasks` **401**、`/api/auth/current` **401**、`/api/health` **200** |
| 7 | 未动项确认 | `gzxj.conf` mtime 仍 `2026-09-29 23:24:43`；Java PID 2393626（09-30 起）未重启；Node 未触碰 |

> 备注 ①：`curl -I` 对 `/mvgo/` 返回 **405** 是 gzxj.conf 的 `if ($request_method !~ ^(GET|POST)$)` 白名单拦 HEAD，属正常，验header 须用 GET（`curl -D -`）。
> 备注 ②：`/api/`（根）返回 **500** 为**既有行为**：直连 Java `:8080/api/` 同样 500（无 handler → `GlobalExceptionHandler` 兜底），Node `:13030/api/` 为 200。与本次前端部署无关。

### 验收清单
- [x] **前端已上线**：`GET /mvgo/` = 200；入口 8 项全 200；产物 SHA256 与本地逐字节一致；线上 806 文件 / 313 js / 61 css / 52M
- [x] `/api/tasks` = 401（鉴权链路正常，非故障）
- [x] nginx 配置未改动（mtime `2026-09-29 23:24:43`）、Java / Node 未重启
- [ ] **后端待办**：干净重建 `dist` → 生效判据 `ps -o lstart -p $(pm2 pid backend-node)` **晚于** `stat -c '%y' dist/main.js`，且 `curl localhost:13030/api/` = 200
- [ ] **后端待办**：符号核验 `grep -c healNestedPropertyDeclarations dist/ai-engine/validators/less-compile-gate.js` ≥ 1；`ls dist/ai-engine/utils/grid-display-alignment.js` 存在
- [ ] **后端待办**：生成一单微码：R8-1 幻觉段不再空壳、R8-2 无臆造背景卡、R8-3 不再 `LESS_COMPILE_GATE_BLOCKED`、R8-5 幻觉空壳段被独立收敛、R8-6 厂商 item 不再挤一行压盖、R8-8 无 `grid-template-columns` + `display:flex` 冲突
- [ ] **后端待办**：表格类组件：产物为 `<a-table>` 且行高命中真值总高（R9）
- [ ] **后端待办**：质量分 `styleScore` 不再虚低（同单由 42 升至 ~72）；`resourceMount` 无锚点条目显示「未评分」态
- [ ] **前端业务回归**（需真实 Token 从门户进）：预览切主题不闪、响应式拖拽松开不漂、历史任务档位徽章正常、Figma Token 面板可选 2 个并切换生效、规范检查「AI 修复」失败不再假成功

---

## 🔧 Node 后端部署（2026-11-03 10:09）— 关闭「AI 配置保存 400」并一次性上线 108 提交

**根因**：前端 11-03 已上线并发送 `figmaTokens` / `activeFigmaTokenId`；后端 dist 停在 `8f7acc0`（10-23），`AI_CONFIG_SCHEMA`（`src/config/config.service.ts:240`，`.strict()`）不认识这两个键 ⇒ Zod `unrecognized_keys` ⇒ `user-ai-config.service.ts:37-39` 拼成「保存用户 AI 配置失败，字段不合法：`<root>`: Unrecognized key: …」**400**。影响面=生产**任何 AI 配置保存都 400**（整份 blob 覆盖被拒，不止 Figma Token）。引入点 `d0b07e8`（11-02，commit 原文即写「未部署」）。

**部署台账**

| # | 动作 | 结果 |
|---|---|---|
| 1 | 本地干净重建 | `mv dist dist.old-20261103-095448` + `rm -f tsconfig.build.tsbuildinfo` + `npm run build`（16s，EXIT 0）⇒ 16M / 1204 文件，`build-stamp = git 129c326` |
| 2 | 打包 | `COPYFILE_DISABLE=1 tar --no-xattrs --disable-copyfile --exclude='.DS_Store'`（**禁 AppleDouble**，否则 Linux 侧条目翻倍 1342→2684 并刷 `LIBARCHIVE.xattr` 警告）⇒ sha256 `55316ac7f461d74c75987309d83b96b6cc735074bec933ec4d7c7e4c625252b2`，Linux 侧条目 **1342**，`._` **0** |
| 3 | 上传校验 | 远端 sha256 与本地**逐位一致**；包内 `.build-stamp` = `git 129c326` |
| 4 | 差集预检 | 生产 dist 独有仅 `dist.zip` + 3 个 `tsconfig*.tsbuildinfo`（构建垃圾）；`dist/prompts`(100K) 包内齐 |
| 5 | 部署前置闸门 | `Active requests = 0`（无进行中生成任务）方执行 |
| 6 | 执行热更 | 备份 dist → 解压 → 4 项符号核验**全命中**（`activeFigmaTokenId`=1 / `figmaTokens`=1 / `applyFigmaTokenProjection`=2 / 报错文案=1）→ `pm2 reload backend-node` |
| 7 | 生效判据 | proc lstart `10:09:19` **晚于** `dist/main.js` mtime `09:54:54`；单进程 `1728683`、无僵尸；`:13030` LISTEN；`/api/` **200** |
| 8 | 旧 400 关闭（直接证据） | 生产新 dist 离线 probe：`SHAPE_KEYS_COUNT=35`、两字段均在 `shape`、`PROBE_TWO_NEW_FIELDS=OK(accepted)`；**阳性对照** `CONTROL_UNKNOWN_FIELD=unrecognized_keys @<root>` ⇒ `.strict()` 未被削弱 |
| 9 | 加密环境 | `/proc/<pid>/environ` 的 `FIELD_ENCRYPTION_KEY` len=64 与 `.env.production` 一致 ⇒ 无「开发派生密钥」回退隐患 |

- 🔴 **回滚锚**：`/home/mvbt/mvgo/backend-node/dist.bak.129c326-20261103-100855`（内含旧 `build-stamp = 37d0983`）。另一 `-100918` 是重复执行的冗余副本。
- ⚠️ 生产存在**并发操作者**：`10:08:55` 已有一次（非本次发起）部署动作，与本次同版本 ⇒ 幂等无副作用。
- **关闭上节「后端待办」**
  - ✅ 第 1 条「干净重建 dist → 生效判据」— 已完成（见台账 #1 / #7）
  - ✅ 第 2 条前半「`grep -c healNestedPropertyDeclarations dist/ai-engine/validators/less-compile-gate.js` ≥ 1」— 实测 **3**
  - ⚠️ 第 2 条后半「`dist/ai-engine/utils/grid-display-alignment.js` 存在」— **该文件名系笔误**：`src/ai-engine/utils/` 下实为 `folded-grid-section-takeover.js` / `grid-list-layout-contract.js`，`grid-display-alignment` 在源码中**从未存在**，非部署遗漏
  - ⬜ 第 3~6 条（R8 系列真机生成、R9 表格行高、`styleScore`/`resourceMount`、前端业务回归）— **未验证**，需真机跑单

**待确认收尾**：从门户点一次「保存 AI 配置」应 **200**，且回读 `figmaTokens` / `activeFigmaTokenId` 不丢。
