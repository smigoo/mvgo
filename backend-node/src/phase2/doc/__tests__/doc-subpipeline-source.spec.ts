/**
 * 🔍 2026-11-03 · 高级选项上传文档接入文档子管线（方案文档
 *   docs/2026-11-03-需求文档高级选项接入文档子管线.md）。
 *
 * 事故：mc-max-1793638171552-cfa7cc95（今日累计）用高级选项上传文档生成，
 *   requirementDocText 只进「📎 用户补充需求」段、不触发文档子管线 ⇒
 *   S8 buildDocDesignBlock 五维权威注入整段缺席 ⇒ vue 分块照 Figma 画静态卡
 *  （Tag 切换/点击明细/轮询全丢，declare 却落了 businessConfig——两层割裂实证）。
 *
 * 断言口径（改者/验者分离）：
 *   ① 行为阳性对照 = 真实文档片段喂 doc-analyzer.analyze（D0 确定性、无 LLM），
 *      断言提取出 initParams/apis/uiElements/polling + buildDocDesignBlock 五维块非空；
 *   ② 图接线断言 = mc-component-graph-phase2.js 子管线源选择必须含 requirementDocText
 *      分支 + 来源计数行存在（源码级，text-truth-ascii 双形态范式）。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import docAnalyzer from '../doc-analyzer.js';
// 注意：buildDocDesignBlock 不在此处 import——prompt-builder 模块图不可被 jest 加载
//  （prompt-loader ESM __filename 转换冲突，同 base-agent 家族）。其阳性断言在
//  scripts/verify-doc-design-block.mjs（原生 ESM，与真机同构，Phase 6 回归实跑）。

/** 真实事故文档（4.2.3.1 今日累计 F_UC_B_YXJC_ZDCL_JRLJ）核心段，逐字保真 */
const DOC_FRAG = `#### 4.2.3.1 今日累计（F_UC_B_YXJC_ZDCL_JRLJ）
##### 4.2.3.1.1 功能说明
**功能描述**：展示当日指定路段的重点车辆统计，包括危化品车与重型货车通行数量。支持配置多个路段，多路段时以 Tag 切换。点击数量可查看当日通行记录明细。

##### 4.2.3.1.2.3 初始化参数
\`\`\`json
{
  "sections": [
    { "sectionNum": "S23-JY", "sectionName": "江阴隧道" },
    { "sectionNum": "S23-JY-B", "sectionName": "江阴大桥" }
  ],
  "pollInterval": 60000
}
\`\`\`

| 参数名 | 类型 | 必填 | 说明 | 默认值 |
| --- | --- | :---: | --- | --- |
| sections | Array<Object> | 是 | 路段配置列表。仅一项时直接展示；多项时顶部显示路段 Tag 用于切换 | - |
| pollInterval | Number | 否 | 轮询间隔（毫秒） | \`60000\` |

###### 4.2.3.1.2.4 接口配置
| 接口编码 | 绑定接口 | 用途 |
| --- | --- | --- |
| \`point_type_statics\` | \`GET /operation/point/pointTypeStatics\` | 获取重点车辆类型统计 |

###### 4.2.3.1.2.5 页面元素
| 序号 | 元素名称 | 控件类型 | 数据绑定 | 说明 |
| :---: | --- | --- | --- | --- |
| 1 | 路段切换标签 | Tag 标签组 | \`sections\`（模块参数） | 仅配置多路段时显示，每个 Tag 对应一个路段的 \`sectionName\`；单路段时隐藏此元素 |
| 2 | 危化品车数量 | 数字卡片 | \`hazardousCount\`（point_type_statics） | 点击打开当日危化品车通行记录明细 |
| 3 | 重型货车数量 | 数字卡片 | \`truckCount\`（point_type_statics） | 点击打开当日重型货车通行记录明细 |

##### 4.2.3.1.2.6 交互设计
**交互事件**

1. **切换路段 Tag**：点击不同路段 Tag，以该路段的 \`sectionNum\` 重新调用统计接口，刷新数据。
2. **查看行驶明细**：点击危化品车或重型货车数量卡片，打开当日该类型车辆的通行记录明细。
`;

describe('高级选项上传文档 → 文档子管线（D0 确定性阳性对照 + 图接线）', () => {
  let docAnalysis: any = null;

  it('阳性对照：无 LLM（D0 降级）也能从真实文档片段提取出 apis/initParams/uiElements/polling', async () => {
    docAnalysis = await docAnalyzer.analyze(DOC_FRAG, { source: 'paste' });
    // 无 invokeLLM ⇒ D2 跳过，但 D0/D1 确定性维度必须非空（fail-open 前提）
    const apis = docAnalysis.dataBinding?.apis || [];
    const uiElements = docAnalysis.uiElements || [];
    expect(apis.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(apis)).toContain('pointTypeStatics');
    expect(uiElements.length).toBeGreaterThanOrEqual(3);
    // 轮询：initParams.jsonDefaults.pollInterval ⇒ onloadFlow.polling（文档默认 60000）
    expect(docAnalysis.onloadFlow?.polling?.default).toBe(60000);
  });

  it('图接线断言：子管线文档源三级优先必须含 requirementDocText 分支 + 来源计数行', () => {
    const src = readFileSync(
      join(__dirname, '../../../ai-engine/graphs/mc-component-graph-phase2.js'),
      'utf8',
    );    // 文档源选择块：requirementDoc 优先、requirementDocText 兜底（≥20字同门槛）
    const sourceSel = src.match(
      /const _docTextSource =[\s\S]*?: null;/,
    )?.[0];
    expect(sourceSel).toBeTruthy();
    expect(sourceSel).toContain('state.requirementDoc');
    expect(sourceSel).toContain('state.requirementDocText');
    expect(sourceSel.indexOf('state.requirementDoc')).toBeLessThan(
      sourceSel.indexOf('state.requirementDocText'),
    );
    // analyze 调用必须吃 _docTextSource（而非旧字面 state.requirementDoc）
    expect(src).toContain('.analyze(_docTextSource,');
    // 真机判据计数行：来源标记
    expect(src).toContain('文档子管线启动 (source=');
  });
});
