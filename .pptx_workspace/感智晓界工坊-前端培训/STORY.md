# STORY.md · 《感智晓界工坊平台-前端开发使用培训》

## ① 用户意图对齐

- **目标受众**：南京感动科技前端开发工程师（含外地远程接入）、前端负责人/技术主管（建议参训）、UI/产品协作方（了解能力）。场合：线下 + 远程内训（2026-09-04 18:30–20:00，105 分钟）。
- **核心目标**：讲完后学员相信「在平台统一生成比本地 AI 更利于组织效率与规范沉淀」，记住「统一生成 → 在线迭代 → 一键交付」闭环，并愿意报名成为首批试点团队。
- **PPT 长度**：20 页（Hero 配额：封面 + 理念页 + 结束页 3 页 ≈ 15%，落在 20–30%）。
- **视觉调性**：商务专业 / 沉稳深蓝 / 结构化清晰 / 要点化。
- **内容边界**：必讲——平台理念、模型池与三方工具、完整版 vs Lite、实操 5 个演示预留、常见问题、计划讨论、讲师。不讲——后端代码生成细节（仅列入演进路线）、具体模型 Key 配置步骤（现场实操）。禁碰——未公开路线图承诺具体上线日期。

## ② 页面布局骨架

- **页面总数与分章**：共 20 页，按课程大纲分 4 章 + 封面/收尾。
  - 封面区：P1
  - 模块1 平台基础理论与配置（25min）：P2 目的 / P3 对象 / P4 大纲 / P5 钩子 / P6 理念 / P7 传统vs平台 / P8 模型池工具 / P9 完整vsLite / P10 演进
  - 模块2 实操与实战（50min）：P11 实操总览 / P12–P16 五个演示预留
  - 模块3 答疑互动（15min）：P17 常见问题
  - 模块4 计划讨论（15min）：P18 计划讨论
  - 收尾区：P19 讲师 / P20 结束
- **目录↔章节扉页契约**：本培训为单轨渐进式课程，不另设独立章节扉页（模块在 P4 大纲页统一呈现，P11 为模块2 实操总览过渡）。无 `type: section` 扉页，与大纲页自洽。
- **Hero 页定位**：P1 封面（hero/peak）、P6 平台理念三步流（hero/peak）、P20 结束（hero/peak）。其余为 supporting，P5 钩子、P11 总览作 peak 节奏。任意两 Hero 间隔 ≥1 个 supporting。
- **rhythm 曲线**：P1 peak → P2–P4 valley → P5 peak（钩子对比）→ P6 peak（理念）→ P7–P10 valley → P11 transition/peak（实操总览）→ P12–P16 valley（演示占位）→ P17 valley → P18 transition → P19 valley → P20 peak。无连续 ≥3 页纯 valley。
- **非对称版式预算**：P1/P6/P20 非对称全幅；P2/P3/P5/P8/P11/P18 非对称双栏或左标题右内容；P7/P9 对比表；P10/P17 卡片/列表。非对称占比 ≥ 40%。对称版式（N卡片横排）仅 P10 演进方向 1 页使用。
- **对称版式预算**：仅 P10 用 N卡片横排（1 页），其余均非对称。

## ③ 页面大纲

| # | title | type | role | rhythm | layout | visual | visual_role | density | anti_pattern | description |
| - | - | - | - | - | - | - | - | - | - | - |
| 01 | 封面 | cover | hero | peak | 全幅视觉+骑线文字 | SVG 抽象科技网格背景 | atmosphere | 30字/0图/35% | 禁止装饰小图塞标题栏 | 主标题+副标+时间地点主讲 |
| 02 | 培训目的 | content | supporting | valley | 左标题+右内容 | FAIcon 列表锚点 | evidence | 180字/0图/28% | 禁止等宽卡片横排 | 4 条目的展开+判断 |
| 03 | 参训对象与前置 | content | supporting | valley | 非对称双栏 | FAIcon 分组 | evidence | 160字/0图/30% | 禁止 50:50 等分 | 必参/建议/前置三类分栏 |
| 04 | 课程大纲 | catalog | supporting | valley | 左标题+右时间轴 | SVG 时间轴 4 模块 | anchor | 120字/1图/25% | 禁止四卡片预览 | 4 模块+时长+远程标注 |
| 05 | 为什么用平台而非本地AI | content | supporting | peak | 非对称双栏 | 对比双栏 | evidence | 150字/0图/30% | 禁止上下等分双栏 | 个人提效 vs 组织生产能力 |
| 06 | 平台理念：统一生成→在线迭代→一键交付 | content | hero | peak | 全幅流程+骑线文字 | SVG 三步流程 | anchor | 120字/1图/35% | 禁止 N卡片横排 | 三步闭环展开 |
| 07 | 传统前端三件事 vs 平台能力 | content | supporting | valley | 图表+洞察(对比表) | Table 对比 | evidence | 180字/1表/25% | 禁止等宽四卡 | 样式/数据/需求 三类映射 |
| 08 | 模型资源池与三方工具 | content | supporting | valley | 左标题+右内容 | FAIcon 卡片 | evidence | 180字/0图/28% | 禁止等宽卡片横排 | 模型池+4 类工具 |
| 09 | 完整生成 vs Lite 边界 | content | supporting | valley | 图表+洞察(对比表) | Table 对比 | evidence | 160字/1表/25% | 禁止等宽四卡 | 选 URL/截图、还原度、适用 |
| 10 | 平台演进方向 | content | supporting | valley | N卡片横排 | FAIcon 六卡 | evidence | 200字/0图/22% | 禁止相邻页重复版式 | 6 项演进+收口 |
| 11 | 实操总览：全流程走查 | content | supporting | transition | 非对称双栏(步骤流) | SVG 步骤流 | anchor | 120字/1图/30% | 禁止等宽卡片 | 5 步顺序+Figma→Lite→迭代→接口→交付 |
| 12 | Demo1 Figma 完整生成 | content | supporting | valley | 演示预留(左徽标右素材) | 演示预留徽标 | — | 80字/0图/40% | 禁止留空白 | 【演示预留】素材+要点 |
| 13 | Demo2 Lite 快速生成 | content | supporting | valley | 演示预留(顶部横幅) | 演示预留徽标 | — | 80字/0图/40% | 禁止留空白 | 【演示预留】素材+要点 |
| 14 | Demo3 在线编辑+大模型迭代 | content | supporting | valley | 演示预留(左徽标右素材) | 演示预留徽标 | — | 80字/0图/40% | 禁止留空白 | 【演示预留】素材+要点 |
| 15 | Demo4 APIFOX+需求文档拆分 | content | supporting | valley | 演示预留(顶部横幅) | 演示预留徽标 | — | 80字/0图/40% | 禁止留空白 | 【演示预留】素材+要点 |
| 16 | Demo5 一键交付 Git | content | supporting | valley | 演示预留(左徽标右素材) | 演示预留徽标 | — | 80字/0图/40% | 禁止留空白 | 【演示预留】素材+要点 |
| 17 | 常见问题 | content | supporting | valley | 左标题+右内容(列表) | FAIcon 六条 | evidence | 200字/0图/22% | 禁止等宽卡片横排 | 6 类高频问题+对策 |
| 18 | 平台计划讨论 | content | supporting | transition | 非对称双栏 | SVG 收束框 | evidence | 120字/1图/30% | 禁止上下等分 | 6 方向回顾+试点征集 |
| 19 | 讲师介绍 | content | supporting | valley | 左标题+右内容(名片卡) | FAIcon 履历 | evidence | 150字/0图/28% | 禁止等宽卡片横排 | 周洁·前端架构师履历 |
| 20 | 结束/联系方式 | ending | hero | peak | 居中金句/巨型数字 | SVG 收束光晕 | atmosphere | 30字/0图/40% | 禁止装饰小图 | 闭环金句+下一步 |
