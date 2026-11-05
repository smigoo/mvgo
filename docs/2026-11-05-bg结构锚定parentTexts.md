# bg 结构锚定通道（parentTexts）：整图卡底图挂不上的治本修法

- 日期：2026-11-05
- 实锤来源：`mc-lab-1793884417940-83cfb20e`（`bg-8439.png` 设备卡底图未挂）
- 模块：`backend-node/src/lite-lab/lib/truth-matcher.ts` + `src/lite-lab/api/lite-lab.service.ts`
- 状态：源码已改完 + spec 72/72 全绿 + 真机对照通过；**未 build 到 dist、未重启、未部署**

## 1. 现象

`c-equipment-monitor-summary-card` / 设备卡列表里，Figma 设计稿的卡底图（`bg-8439.png`，117×64）
在产物里是纯色 `background: #xxx`，没有挂上 `url(...)`。

真机报告计数（`truth-backfill-report.json`）：

```
bgAnchored=1   bgSkipNoClass=0   bgSkipAmbiguous=0   bgSkipNoBgKey=0
bgAiCalled=<n> bgAiAnchored=0   bgAiSkipNoLabelHit=1   bgAiStructCand=0
```

即：命名锚定（`bg-<core>-<id>` 语义段）不通（`bg-8439` 是纯 id），AI 兜底读图给的 label
「环境监测」在产物模板里零命中（`skipNoLabelHit=1`），两条通道全灭。

## 2. 根因

真值里这条资产的锚点字段是空的：

```json
{ "nodeId": "2:8439", "fileName": "bg-8439.png", "width": 117, "height": 64, "siblingTexts": [] }
```

`siblingTexts` 只取**直接父容器的直接 TEXT 子节点**。整图卡底图（卡容器整块铺满的纹理/渐变）
的文本普遍在孙层（图标 + 名称 + 计数的子 frame 里），父容器下没有直接 TEXT → `siblingTexts=[]`
→ AI 兜底拿不到任何确定性锚点，只能全靠 vision 读图；vision 读错/读偏就整条链断。

> 可辩驳说明：另有一份节点快照（`data/figma-node-cache/...2-8417....json`）里 `2:8439` 的父
> `2:8438` 恰好有直接 TEXT（`['摄像机','(2/484)']`），与真值缓存 `siblingTexts=[]` 不一致
> ⇒ 两份数据的层级不同，**不能只依赖「父层一层」**。因此本通道按「最近的有文本祖先（≤3 跳）」
> 取值，对两种层级都成立。

## 3. 修法（治本，管线层）

### 3.1 真值层：`FigmaAssetTruth.parentTexts`

`collectFigmaTruth` 在采集 IMAGE 资产时新增结构锚点：

- 从 `parent` 起沿父链**上溯最多 3 跳**，取第一个「整子树有文本」的祖先；
- 该祖先的**整子树文本**（递归、去重、`trim`、剔空）即 `parentTexts`，上限 12 条防噪声；
- 全链无文本 → 不设该字段（**不臆造锚点**）；
- 父指针用 `WeakMap` 在 `walk` 时登记，不改 `walk` 签名。

### 3.2 服务层：确定性候选与 AI 候选合并

`runBgAiFallback(shotPath, imgDir, assets, userId)` 由「只收 fileName 数组」改为收资产数组：

1. 先由 `parentTexts`（回退 `siblingTexts`）拼**确定性候选** `{fileName, label: texts.join(' ')}`；
2. 同 `fileName` 若 vision 也给了 label → **确定性优先**（`structOverrides++`，AI 幻觉被结构真值覆盖）；
3. 结构缺失项才用 AI label 补齐；
4. 🔴 **确定性通道不依赖 vision**：未配 vision / vision 调用失败 / JSON 解析失败时，只要结构
   候选存在就照常锚定（只记 `errors`），不再整条跳过。

新增计数（报告 `truth-backfill-report.json` + 服务日志）：

```
bgAiStructCand=<确定性候选数>  bgAiStructOverrides=<覆盖 AI 的同名候选数>
```

### 3.3 落点判据不变

候选仍交 `aiAnchorBackgroundAssets` 走原有双闸门：词 → 模板叶子（exact/双向包含）→ LCA 容器 →
class → `<style>` 规则（**唯一命中 + 已有 background 键才换值**，只追加 url 不动几何）。
AI/结构只提供「候选」，判据一条没放宽。

## 4. 判据与证据

### 4.1 spec（`truth-matcher.spec.ts`，72/72 全绿）

| 用例 | 断言 |
|---|---|
| collectFigmaTruth：siblingTexts 空 → parentTexts 收到父容器整子树文本 | `siblingTexts=[]`、`parentTexts=['摄像机','(2/484)']` |
| 阳性：parentTexts 拼结构候选 → LCA 卡容器 → 挂 url | `anchored=1`，规则体出现 `url('../resources/images/bg-8439.png') center / 100% 100% no-repeat` |
| 阴性：父容器整子树无文本 | `parentTexts` 缺省（undefined） |
| 上溯：父层纯容器无文本 → 取祖父层整子树文本（≤3 跳） | `parentTexts=['烟道机器人','(0/484)']` |

### 4.2 真机对照（真实产物 + 真实 Figma 树，只读不写回）

统计口径：`node /tmp/nbcheck2`（`tsc -p tsconfig.build.json --outDir /tmp/nbcheck2`）加载的
`truth-matcher`，对 `mc-lab-1793884417940-83cfb20e` 的 `package/**.vue` + `resources/styles/**`
真实内容跑锚定。

```
== 各节点 parentTexts ==
g-8421.png    ["设备监测","*数据实时更新","设备类型","28","设备总数","68562","完好率","98%"]
bg-8788.png   ["隧道设备","总数:","56302","异常数:","5"]
bg-8807.png   ["总数:","1280","异常数:","3","南北接线\n设备"]
bg-8439.png   ["摄像机","(2/484)"]

== stats ==
{"candidates":3,"anchored":1,"skipNoLabelHit":0,"skipNoClass":0,
 "skipClassAmbiguous":0,"skipNoRule":0,"skipRuleAmbiguous":0,"skipNoBgKey":2,"skipAlreadyUrl":0}

changed:
package/index.vue              bgAi:bg-8439.png→.c-equipment-monitor-card
resources/styles/common.less   bgAi:bg-8439.png→.c-equipment-monitor-card
resources/styles/index.css     ×3
```

读法：

- `bg-8439` **唯一命中** `.c-equipment-monitor-card`，3 文件 5 处挂载；无歧义 skip；
- 已消费/无 background 键的 `bg-8788` / `bg-8807` → `skipNoBgKey=2` **零改动**（闸门守住，
  整子树文本变宽没有造成误挂）。

## 5. 影响面

- 仅 `lite-lab` 回填链（`collectFigmaTruth` / `runBgAiFallback`）受影响，lite 正式链与
  microcode-engineer 不受影响；
- `parentTexts` 是新增可选字段，旧 `figma-truth.json` 缓存没有该字段 → 读取侧按需缺省，
  重跑会话即补齐；
- 计数新增两键，前端/报告消费方按 `Record<string, number>` 透传，无破坏。

## 6. 回归

```bash
cd backend-node
env -i PATH="<node>/bin:/usr/local/bin:/usr/bin:/bin" HOME="$HOME" \
  NODE_OPTIONS="--max-old-space-size=1536" \
  npx jest src/lite-lab/lib/truth-matcher.spec.ts --runInBand --forceExit
# 72 passed
npx tsc -p tsconfig.build.json --outDir /tmp/nbcheck2   # 0 error
```

## 7. 未做 / 边界

- 本通道只解决「卡底图整图挂不上」；**布局方向**（卡内排布、尺寸差异）与**富文本分段色**
  按用户裁决不做（vision schema 无字段承载 / 分段色按字符 index 无法映射到插值产物）；
- 产物直改（本次会话内对 83cfb20e 的原地修复）只是临时可见性，不作为方案主体；本通道
  下次重跑即自动生效；
- 未 build 到 `dist`、未重启 `:13030`、未 commit、未部署生产。
