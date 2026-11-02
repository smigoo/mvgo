# 更新日志（CHANGELOG）

> 记录每次生产发布批次，最新在上。
> 部署步骤 / 回滚 / 密钥红线见 `DEPLOYMENT-NOTES.md` 与 `~/.workbuddy/skills/mvgo-deploy`。
> 提交号均可在对应子仓 `git show <hash>` 复核。

---

## v2026.11.02 — 2026-11-02

**状态：产物已构建完成并核验，未部署（等指令）。**

| 组件 | 生产当前 | 本次目标 | 变更提交 | 产物核验 |
|---|---|---|---|---|
| `backend-node` | `37d0983` | `fe5123b` | **75** | `dist/.build-stamp` = `git: fe5123b`，`dist/main.js` 17:29 ✅ |
| `frontend` | `a82f785`（推定①） | `8510544` | **54** | `dist/index.html` 17:23，入口 `index-CS4HZ0yP.js`，引用全命中 ✅ |
| `backend-java` | `a1224ec`（09-29） | 不变 | 0 | 工作区干净、无 `.java` 变更 |
| nginx `gzxj.conf` | 现状 | 不变 | 0 | 无路由/前缀改动 |
| 环境变量 | 现状 | 不变 | 0 | `FIELD_ENCRYPTION_KEY` 不动 |

> ① 生产前端为 10-09 09:57 构建（入口 `index-Chu2mHxQ.js`），晚于 10-09 00:00 的 `a82f785`、早于下一个提交 `1d84525`(10-09 18:36)，故推定基线为 `a82f785`。

### 后端 `backend-node`（`37d0983` → `fe5123b`）

#### A. 生成管线 · 几何与方向仲裁
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

#### C. 预写自愈与质量门禁（本次重点）
- **R8-1** `fe5123b` 幻觉段整段收敛：`healDuplicateTextIssues` 剥文本后双判据（`section sourceNodeIds` 空 = vision 幻觉段 + 剥后模板渲染文本空）⇒ `index.vue` 移除挂载 + import、files 剔除组件、删盘上文件；不猜三弃权；真锚段空壳走 `emptyShellSections` 显式计数
- **R8-2** `2091b9e` 透明容器臆造背景：`TRANSPARENT-CONTAINER-BG` 从 WARN-only 升级为**确定性剥除**（真值 `fills=[]` 的容器宿主类顶层 `background(-color)` 原文区间外科剥除 + 计数行 + meta WARN 并存）
- **R8-3** `eb68508` 畸形属性名拼接自愈：`gateStandaloneLessWrite` 新增 `healNestedPropertyDeclarations`（`background: box-shadow: X` ⇒ 抽出 `box-shadow: X`）+ 终裁 `LESS-WRITE-006`
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

### 本次不涉及
- **Java**：`backend-java` 工作区干净，自 09-29 `a1224ec`（门户校验短 TTL 缓存）后无提交，`*.java` 无 10-09 之后变更 ⇒ 不打 jar、不重启、不动 `MONGODB_URI` / `PORTAL_BASE_URL`
- **nginx**：`gzxj.conf` 无路由改动；30+ Node 前缀 location 与 `/api → 192.168.112.1:8080` 全部保持原样
- **环境变量**：无新增/变更

### 上线前置（必做）
1. 🔴 **前端快照缺失**：线上最新可用快照 `www/mvgo.old` 是 **9/30** 的，跨不过本次 10-09 → 11-02 的跨度，不可作回滚点。部署前必须先建：
   ```bash
   cp -a /home/mvbt/nginx/www/mvgo /home/mvbt/nginx/www/mvgo.bak.$(date +%Y%m%d-%H%M%S)
   ```
2. 后端已有回滚锚 `dist.bak.37d0983-20261026-164559`；本次发布前再建 `dist.bak.fe5123b-<ts>`
3. 🔴 **前端 dist 卫生**：本地 `dist/static/js` 共 **5195** 个 `.js`，本次构建产物只有 **198** 个 —— 其余为历次 hash 死文件（`build:safe` = `--emptyOutDir false` 累积所致）。打包前建议跑一次 `npm run build`（默认清空 `outDir`；`public/` 顶层 `@mc-config`/`config`/`log`/`monaco`/`topology.html` 会自动重建），或只打包 `dist/index.html` + 本次 198 个产物 + `public` 顶层目录
4. **入口 hash 变更**：生产 `index-Chu2mHxQ.js` → 本次 `index-CS4HZ0yP.js` ⇒ 发布后必须硬刷新（`Cmd/Ctrl+Shift+R`）

### 验收清单
- [ ] 后端生效判据：`ps -o lstart -p $(pm2 pid backend-node)` **晚于** `stat -c '%y' dist/main.js`（17:29），且 `curl localhost:13030/api/` = 200
- [ ] 后端符号核验：`grep -c healNestedPropertyDeclarations dist/ai-engine/validators/less-compile-gate.js` ≥ 1
- [ ] 前端：`curl -H 'Host: go.microvideo.cn' http://127.0.0.1/mvgo/` = 200；`index.html` 内资源逐个存在（strip `?v=`）
- [ ] `/api/tasks` = 401（鉴权链路正常，非故障）
- [ ] 生成一单微码：R8-1 幻觉段不再空壳、R8-2 无臆造背景卡、R8-3 不再 `LESS_COMPILE_GATE_BLOCKED`
- [ ] 前端：预览切主题不闪、响应式拖拽松开不漂、历史任务档位徽章正常、Figma Token 面板可选 2 个并切换生效
