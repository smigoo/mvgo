/**
 * 🔍 验证脚本（原生 ESM，与真机同构）：S8 buildDocDesignBlock 五维权威块阳性对照。
 * 配套 spec：src/phase2/doc/__tests__/doc-subpipeline-source.spec.ts（prompt-builder
 * 模块图不可被 jest 加载，故本断言独立成脚本，Phase 6 回归必须实跑）。
 * 运行：env -i PATH=... node src/phase2/doc/__tests__/verify-doc-design-block.mjs
 */
import docAnalyzer from '../doc-analyzer.js';
import { buildDocDesignBlock } from '../../../ai-engine/roles/microcode/prompt-builder.js';

/** 真实事故文档核心段（4.2.3.1 今日累计），与 spec 的 DOC_FRAG 同源 */
const DOC_FRAG = `#### 4.2.3.1 今日累计（F_UC_B_YXJC_ZDCL_JRLJ）
##### 4.2.3.1.1 功能说明
**功能描述**：展示当日指定路段的重点车辆统计，包括危化品车与重型货车通行数量。支持配置多个路段，多路段时以 Tag 切换。点击数量可查看当日通行记录明细。

###### 4.2.3.1.2.3 初始化参数
\`\`\`json
{
  "sections": [
    { "sectionNum": "S23-JY", "sectionName": "江阴隧道" }
  ],
  "pollInterval": 60000
}
\`\`\`

###### 4.2.3.1.2.4 接口配置
| 接口编码 | 绑定接口 | 用途 |
| --- | --- | --- |
| \`point_type_statics\` | \`GET /operation/point/pointTypeStatics\` | 获取重点车辆类型统计 |

###### 4.2.3.1.2.5 页面元素
| 序号 | 元素名称 | 控件类型 | 数据绑定 | 说明 |
| :---: | --- | --- | --- | --- |
| 2 | 危化品车数量 | 数字卡片 | \`hazardousCount\`（point_type_statics） | 点击打开当日危化品车通行记录明细 |
`;

const docAnalysis = await docAnalyzer.analyze(DOC_FRAG, { source: 'paste' });
const block = buildDocDesignBlock(docAnalysis);

// ④ 业务配置维（getConfig 要求句）只在文档含「微码四配置」标记时出现——
// 本样本无该标记属正常维度分工（initParams 走 jsonDefaults/paramTable 通道）
const expectGetConfig = (docAnalysis.businessConfig || []).length > 0;

const checks = [
  ['必须完整实现（权威性声明）', block.includes('必须完整实现')],
  ['数据对接：pointTypeStatics 进块', block.includes('pointTypeStatics')],
  ['字段映射：hazardousCount 进块', block.includes('hazardousCount')],
  ...(expectGetConfig ? [['getConfig 消费要求', block.includes('getConfig')]] : []),
];
let fail = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? '✓' : '✕'} ${name}`);
  if (!ok) fail++;
}
console.log(`S8 五维权威块长度: ${block.length} 字符`);
if (fail || block.length < 100) {
  console.error('FAIL');
  process.exit(1);
}
console.log('VERIFY-DOC-DESIGN-BLOCK-OK');
