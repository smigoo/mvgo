# mvgo 速查（2026-10-27d｜详判据 `PIPELINE-DETAIL.md`｜全文归档 `MEMORY-full-archive-2026-10-26f.md`｜排障走 `mvgo-*-triage` Skill｜事件细节 `YYYY-MM-DD.md`）

> 只放**一定会踩的**索引行；细节一律去 `PIPELINE-DETAIL.md`（本文件注入会截断 ⇒ 越靠前越保真）。

## 当前状态
- ✅ **生产已部署 `37d0983`**（`go.microvideo.cn:13030`，回滚锚 `dist.bak.37d0983-20261026-164559`）。线上验收全绿：text-truth 归零、锚点审计 1/0/0、文案对账 29/29/0、P1-B takeoverLeaves:0。
- 🚧 **本地已提交、未部署**：`0013ba8`→…→`b3f4d81`（刀53d/e 绑定形态）→`0f7e605`（CODE-028）→`3aa99b2`（刀53 N段文本接管）→`5bdd731`（刀53 icon 父级图片包装借用）→`d686047`（刀6 同 bbox 叠层 stack：≥2 子项 bbox 逐字段全等 ⇒ display:stack 无方向，549 容器）→`c6cd125`（刀7 容器吸收背景层：未认领可见 SOLID RECTANGLE ⇒ 边锚定 absolute+z-index:-1，最近容器独占，63/174 组件 278 层）→**`15a930b`**（刀8 TEXT-COVERAGE 假绿治本，见下）→ **`8cb6773`**（真机验收三刀：刀9 `@/` 别名 import 治本+宿主外壳保标签；刀10 借用资源守卫祖先视觉包含豁免；刀7b 吸收层容器补 isolation:isolate）→ **`082b416`**（刀11 候选快照语法闸：推送前 validateVueSfc 扫全部 .vue、style 类剔除，0833ff36 实锤）→ **`781aedd`**（刀12 2D 行簇重建：`row-band-cluster.js` XY-cut 递归，纵流内横向带成行，801:3 实锤；🔴 pill 固有宽度契约未做）→ **`5880b28`**（刀13 vue3 接管叶重复覆盖守卫：`takeover-overlap-guard.js`，f33d8c12 实锤；真值文本从 tr.vue script 常量提取）→ **`7f92b54`**（刀14 装配嫁接根 template 嵌套配对：`findRootTemplateBlock` 计数配对替换 lazy 正则，治 mc-3538d75b 插槽 `</template>` 截断残留 `</div>` ⇒ Invalid end tag；🔴 lazy `[\s\S]*?</template>` 家族缺陷已有 sfc-template-extractor 三例前科，嫁接场景必须配对定位）。本地 :13030 已重启供测试（PID 60038，刀14 生效）。主仓指针未推进（停在 `681e572c`）。
- 🔴 主仓 push **未做**（远端是日同步镜像、已分叉非 ff，禁 force push）。
- 🔴 遗留：(a) `布局真值守卫 hits:0` 是无病灶非失效，真机阳性命中仍缺；(b) `COMP-002 内容归属错装` 未修（与 TEXT-COVERAGE 已解耦——刀8 后覆盖率口径可信）。
- 🔴 **部署包必剔三样**：`dist/workspace`、`.DS_Store`、`dist/app.controller.spec.*`；打包 `COPYFILE_DISABLE=1 tar --no-xattrs --exclude=...`。

## 硬约束
- 🔴 不得自行部署（重启 :13030/:2610、同步生产、`git push`）→ 等指令；交付必须说「已改完，未部署」。
- 🔴 治本非产物直改；自愈器须可辩驳判据+阳性对照；判据同构单一来源。
- 🔴 文本命名无关：只认 `type` TEXT/CHARACTER；角色唯一来源 `splitTitleValueByStyle`。

## 刀 8 TEXT-COVERAGE 假绿治本（`15a930b`，未部署）
- 三根因：①产物侧扫整个 .vue **含注释**（8bbcf027 注释「// 设备编码区块…」吞掉真值「编码」= 假绿实锤）②双向子串 ③<0.6 才 push ⇒ 通过无留痕。
- 修：新模块 `utils/strip-vue-comments.js`（判据单一来源；template 剥 `<!---->`、script 状态机剥 `//`+`/**/` 且护字符串/模板串、style 剥 `/**/`+less `//` 且护未引号 `url(http://…)`）；validator 剥注释后扫 template+script+style（**禁只扫模板**：刀53 接管真值在 script `runs` 数据）；新增 `TEXT-COVERAGE-STATS`（INFO，**无论命中与否全打**，附未覆盖前 8 条）。
- 匹配口径**维持子串双向**（与 TEXT-TRUTH 同构）：三口径全语料审计 174 组件，剥注释 vs 旧零降档；严格相等仅多 1 WARN 降档但破坏判据同构、rich-text 拆段有假缺失风险 ⇒ 不上。阈值不动（<0.4 BLOCK / <0.6 WARN）。
- 验证：spec 136/136；变异 ①摘剥注释⇒阳性转红 ②摘字符串保护⇒URL 反向转红；真实 A/B 174 组件：STATS 100% 落地、差异仅 7 个全部「注释吞真值」、**零跨档误伤**、8bbcf027 29/29→28/9 点名「编码」、对照 6d79e69d 零变化；两态全量 FAIL 集合 diff 全空（23 套件/44 用例环境基线）；build ✅ dist 含符号。

## 环境
- 根 `/Users/smigoo/工作/mvgo`：backend-node(:13030) / frontend(:2610，`build:safe`，堆上限 4096)。
- 🔴 node 版本先 `ls ~/.workbuddy/binaries/node/versions/`（现为 `22.22.2-6`）；npm/node 一律 `env -i`；jest `--runInBand --forceExit`，参数是 **`--testPathPatterns`（复数）**；`--config` 直接给 **package.json 路径**（rootDir=src，ts-jest，无 babel 配置）。
- 🔴 **Bash cwd 不持久**：一律绝对路径 / `git -C` / `npm --prefix`。全量日志 FAIL 行双写 ⇒ 按 basename sort -u（46→23）。
- 🔴 真机起后端必须 `node <仓库根>/start-node.js`；本地日志 `server.log`；生产日志 `/root/.pm2/logs/backend-node-out.log`。真机 DOM 验证 `/preview/<componentId>?sessionId=&groupId=`（:2610）。
- 🔴 离线重放三坑：权威副本 `.checkpoint/`；`figma-node-data.json` 遍历走 `.document`；plan 入参 = `.checkpoint/visual.json.layoutStructure`。

## 方向判据（结论已定，别再换度量）
- 视觉裁判 22 例：产线度量修前 90.9%、bands 9.1%（作废）、刀5 后 100%。
- 🔴🔴 能视觉模型看图就别让用户填表（`mc-preview.png` 与根 bbox 1:1 像素对应，sharp 裁图直判）。
- 🔴🔴 对照图只初筛，定稿逐张看放大图；裁判必须与判据不同源且查同分布（layoutMode 裁判对 low 样本失明教训）。
- 产物：`fixtures/direction-truth-cases.ts` + `direction-truth-fixtures.spec.ts`（阳性 22/22、阴性 20/22、变异 22→1）。
- 🔴 `gridColumns` 不是缺陷（label-value 对误数）；`low` 容器 910 个中大部分是「置信保守」非判错（视觉裁判 95.5% 准确）。

## 索引（详版一律见 PIPELINE-DETAIL）
- 基础族判据 / LESS invalid type / sourceType / 透传自检三铁律 / `:deep()` 死规则 / 装配层挂载点 `file-writer.js#writeFiles` / R24 破图 / `getFigmaBox` 四元陷阱 ⇒ P-DETAIL 同名小节。
- 🔴🔴 几何/真值判据必须挂真机日志计数行；离线探针手工塞入参 = 假绿闭环。
- 🔴 刀53 家族顺序 `grid→header→statrow→table→text→icon→legend→kvgrid`；新增 kind 必须登记 `FG_TAKEOVER_CLASS_RX` + 计数链显式分支；vue3 映射唯一实现 `matchFgTakeoverTargets`。
- 🔴🔴 刀53d/e 绑定形态（`b3f4d81`）：资源变量**绝不拼进静态 style/JSON**——`:style="{backgroundImage:'url('+var+')'}"`、`:src="ICON_MAP[...]"`；守卫 CODE-028 补 CODE-022 的洞。
- 🔴🔴 方案文档判据只能当假设不许照抄（f98f7463「同宽±2」恒零命中假绿）。
- 刀53f 图例 / 刀54 文本门禁 / 刀55 编造副本 / 刀56 字面量漂移 / 刀57 面板标题槽位 / P1-A（ab7bb76c 只诊断）/ P0 `807:3` 逃 stripChromeOnly / 样式失配（53h `8f7acc0`+契约 `01868d8`）⇒ P-DETAIL。
- T4 四刀（`5e4ad69`→`06ed935`）：internalTree / kvgrid / 卡底图片通道 / low 闸（两事实合取）；vision id 在 `81:7` 偏移一位 ⇒ 锚点用文本反查；数量不等必须不钻。
- 第 6 层令牌化（`bc24a91`）/ B 批管线（已部署 `37d0983`）：详 P-DETAIL「四次瘦身」；`COMP-002`≠`content-anchor`，别用 `mismatched:0` 证明产物正确。
- 文本真值三级衰减 A1/A2（`0013ba8`）：T1 `TEXT_ITEM_QUOTA` / T2 LAYOUT-001 闸⑤ / T3 stub ⇒ P-DETAIL。

## 诊断手法
- 门禁三查；0 命中必配阳性对照；改判据先纯函数 A/B；**改的人和验的人用同一正则 = 假绿闭环**。
- 🔴 flaky 名单：thinking-escalation / build-node-layout-facts-integration / manifest-auditor / file-writer / less-variable-checker / quality-score-v1 / pipeline-regression-0908。
- 🔴 全量基线恒 23 套件/44 用例环境失败——别当回归；两态 FAIL 集合 diff 须空。

## 陷阱
- 🔴🔴 「本地跑一次验证」前必核进程启动时间 vs dist mtime（不重启 :13030 跑的是旧码）。
- 🔴 BSD grep 多模式必须 `-E`（`\|` 静默空，刀8 dist 验收又踩一次）；不支持 `\s`；`sed -i ''`；commit -m 禁 `$(...)`；heredoc `${}` 会展开 ⇒ 用 Write。
- 🔴🔴 **git daily auto-sync 会把改到一半的工作区分多个自动提交入库** ⇒ A/B 基线必须用刀前明确 commit id（禁 `git show HEAD:`）；**两态回归前先 commit 当前态**（刀7 丢过接线）；临时脚本跑完立刻 rm。
- 🔴 幂等守卫对比前先剥修复产物；聚合 stats 复用源模块键表；主仓是 gitlink 嵌套仓（无 .gitmodules），指针推进用 `git add <目录>`。
- 🔴 两态差分必先 `wc -l` 确认捕获非空；计数行核验唯一基线 = 重启前 `wc -l server.log` 快照窗口。

## 文本样式（R19）
- 🔴 唯一真值源 `utils/text-runs.js`；判「落位」不判「存在」；WARN。
