/**
 * 回归锁：vision-agent 的 Claude（anthropic 协议）分支必须把 AIMessage.content 归一化为字符串。
 *
 * 背景（2026-09-15 实测）：
 *   analyzeImage 的 OpenAI 兼容分支写的是 `content: coerceLLMText(response.data...)`，已归一化；
 *   但 Claude 分支（`this.isOpenAICompatible === false`）裸 `return response.content`。
 *   anthropic 协议下 LangChain AIMessage.content 可能是 [{type:'text',text:'...'}] 数组或 null，
 *   裸返回会让下游 lite.extractMicrocodeOutput 收到 object（`typeof null === 'object'`），
 *   类型防护判定失败 → 产物为空 → 整个 Lite 生成失败：
 *     WARN  extractMicrocodeOutput 收到非字符串输入: object
 *     ERROR Lite 生成失败 xxx: 生成的组件代码为空或无效
 *
 * 本 spec 用源码级断言（与 roles-request-context.spec.ts 同款做法）锁死两类返回点，
 * 防止后续重构再把归一化丢掉。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

// 🔴 jest 以 CJS transform，`src/config/backend-root.js` 用 `import.meta.url` 会直接
//    语法报错（Identifier '__filename' has already been declared），导致整套件 0 运行。
//    行为级对照需加载真实 VisionAgent ⇒ 必须先把该模块 mock 掉（与 tasks.service 同款做法）。
jest.mock('../../config/backend-root.js', () => {
  const p = require('path');
  const root = '/tmp/mvgo-jest';
  const join = (...seg: string[]) => p.join(root, ...seg);
  return {
    backendRoot: root,
    projectRoot: join('..'),
    workspaceRoot: join('workspace'),
    customComponentsDir: join('workspace', 'custom-components'),
    vue3ComponentsDir: join('workspace', 'vue3-components'),
    resolveFrontendWorkspacePath: () => join('workspace'),
    frontendCustomComponentsDir: () => join('workspace', 'custom-components'),
    frontendVue3ComponentsDir: () => join('workspace', 'vue3-components'),
    tempComponentsDir: join('temp-components'),
    dataDir: join('data'),
    logsDir: join('logs'),
    configDir: join('config'),
    chatAttachmentsDir: join('temp-chat-attachments'),
    apifoxZipsDir: join('data', 'apifox-zips'),
    apiCatalogsDir: join('data', 'api-catalogs'),
  };
});

describe('vision-agent 返回归一化回归锁', () => {
  const src = fs.readFileSync(path.join(__dirname, 'vision-agent.js'), 'utf8');

  it('源码中不存在裸 `return response.content;`', () => {
    // 裸返回 = Claude 分支未归一化，正是 2026-09-15 事故的根因写法
    const bare = src.match(/^\s*return response\.content;\s*$/gm) || [];
    expect(bare).toHaveLength(0);
  });

  it('两处 Claude 分支 return 均已经 coerceLLMText 归一化（analyzeImage + compareImages）', () => {
    const normalized = src.match(/return coerceLLMText\(response\.content\)/g) || [];
    // analyzeImage 与 compareImages 两处 Claude 分支 return 必须都是归一化形态
    expect(normalized.length).toBeGreaterThanOrEqual(2);
  });

  it('_isAnalysisIntact 调用点同样归一化（否则数组恒判「损坏」触发无谓自愈重试）', () => {
    // 2026-11-12 起 analyzeImage 两分支均传 outputKind（outputKind==='sfc' 时按 SFC 口径判定，
    // 不再把 Lite codegen 的 SFC 输出当 JSON 判「损坏」）——归一化仍然保留（跨行调用形态）
    const normalized =
      src.match(/coerceLLMText\(response\.content\)\s*,\s*options\.outputKind/g) ||
      [];
    expect(normalized.length).toBeGreaterThanOrEqual(1);
  });

  // 🛡️ 2026-11-12 生产实锤（mv-lite-1794450313160-4d463e6d，13 次尝试全灭）回归锁：
  // analyzeImage 两分支的完整性自愈必须消费 options.outputKind —— Lite codegen 传
  // outputKind:'sfc' 后按 SFC 三块闭合判定，绝不把代码当 JSON 判「损坏」白烧高温重试。
  it('analyzeImage 两分支 _isAnalysisIntact 均透传 options.outputKind（SFC 口径自适应）', () => {
    // OpenAI 分支（result 变量）与 Anthropic 分支（coerceLLMText(response.content) 跨行）
    const openaiBranch = src.match(
      /this\._isAnalysisIntact\(result,\s*options\.outputKind\)/,
    );
    const anthropicBranch = src.match(
      /this\._isAnalysisIntact\(\s*coerceLLMText\(response\.content\),\s*options\.outputKind,?\s*\)/,
    );
    expect(openaiBranch).toBeTruthy();
    expect(anthropicBranch).toBeTruthy();
  });

  // 🔴 2026-11-12 生产事故（mv-lite-1794451845045-33c30bf3）根治回归锁：
  //    本文件曾持有**第二份 SFC 判据**（`_isAnalysisIntact` 把 SFC 按 JSON 口径判「损坏」），
  //    与「未声明 outputKind 默认走 JSON」叠加 ⇒ 每轮 codegen **必然**命中自愈，
  //    抬温重采样后**盲覆盖**首轮 ⇒ 确定的 temperature=0 产物被高温采样顶成空壳
  //    （真机：首轮 codeLen 1780 被丢弃，采用 575；落盘 1562 B）。
  //    判据必须单一来源：SFC 完整性归 lite 层 `detectLiteCodegenTruncation` / `validateLiteSfc`，
  //    本文件**不得**再持一份，也不再对 'sfc' 做任何完整性判定。
  it('🔴 SFC 判据不在本文件（判据单一来源）：不再引入 missingSfcBlocks、不再判定 sfc 口径', () => {
    // 注：注释里出现该名词是允许的（记录事故），故只锁「导入 / 调用」形态
    expect(src).not.toMatch(/import\s*\{[^}]*missingSfcBlocks[^}]*\}\s*from/);
    expect(src).not.toContain('missingSfcBlocks(content)');
    // 反证：本文件不应出现内联的三块闭合数组字面量（那正是「另写一份判据」的形态）
    expect(src).not.toContain("'<script setup', '</script>'");
    // 策略门（唯一来源 _isSelfHealApplicable）：sfc / text 明确不自愈，仅 json / brief 允许
    expect(src).toMatch(/if\s*\(outputKind === 'sfc'\)\s*return false/);
    expect(src).toMatch(/if\s*\(outputKind === 'text'\)\s*return false/);
    expect(src).toMatch(/return outputKind === 'json' \|\| outputKind === 'brief'/);
    // 默认口径改为 'text'（判据不适用 ⇒ true），不再默认按 JSON 猜未知形态
    expect(src).toContain("_isAnalysisIntact(content, outputKind = 'text')");
    expect(src).toContain("if (outputKind !== 'json') return true;");
    // 唯一保留的外部判据是 brief（键集合与 buildAnalysisPrompt 的 schema 同源）
    expect(src).toMatch(
      /import\s*\{\s*isBriefAnalysisIntact\s*\}\s*from\s*'\.\.\/\.\.\/lite\/lite-brief-intact\.js'/,
    );
  });

  // 🔴 自愈重试**禁止盲覆盖**（与同文件 control-guard 的「改善才采纳」同口径）
  it('🔴 两分支自愈均为「择优保留」，不存在把重试结果直接写回结果变量的盲覆盖', () => {
    expect(src).toContain('const second = await this.analyzeImage(imagePath, prompt, {');
    expect(src).toContain(
      'result = this._pickBetterContent(first, second, options.outputKind);',
    );
    expect(src).toMatch(/response\.content = this\._pickBetterContent\(/);
    // 反证：旧实现形态（重试结果无条件覆盖首轮）必须彻底消失。
    //    `result = await this.analyzeImage(` 仅允许**带 const 声明**出现在 analyzePreviewImage
    //    的首次调用处；自愈分支内一旦出现「裸赋值覆盖」即为回退事故写法。
    expect(src.match(/const result = await this\.analyzeImage\(/g) || []).toHaveLength(1);
    expect(src).not.toMatch(/^\s*result = await this\.analyzeImage\(/m);
    expect(src).not.toMatch(/response\.content = await this\.analyzeImage\(/);
    // 自愈必须计数（遥测才能归因「同图同模型不同果」）
    expect(src).toContain('this._selfHealCount += 1');
  });

  // 🔴 Anthropic 分支温度是**构造 LLM 客户端时的快照**：只改 `this.temperature` 不重建
  //    `this.llm` ⇒ 第二次请求参数与首轮完全相同（纯白烧 + 盲覆盖，净收益为负）。
  it('🔴 Anthropic 自愈重建 this.llm（让新温度真生效）并重挂网关、finally 双还原', () => {
    expect(src).toMatch(
      /this\.llm = this\._buildLLM\(\{[\s\S]{0,240}?providerType: this\.providerType,[\s\S]{0,80}?\}\)/,
    );
    expect(src).toMatch(/this\._attachAnthropicInvoke\(\);/);
    // savedTemp / savedLlm 双还原（截断升档 + 自愈各一处 ⇒ 至少 2 次）
    expect((src.match(/this\.temperature = savedTemp;/g) || []).length).toBeGreaterThanOrEqual(2);
    expect((src.match(/this\.llm = savedLlm;/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  // 🔴 白烧点防线：输出形态与 JSON 结构判据不匹配的 3 处调用方必须**保持不声明**。
  //    声明 'json' 会被结构判据恒判「损坏」⇒ 每轮白烧一次抬温重试并盲覆盖首轮结果。
  it('🔴 未声明调用方保持不声明（page-skeleton / lite-lab / chat-attachment）', () => {
    const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
    // page-skeleton：JSON 结构是 {layout, components}，**不含** sections/charts/interactions
    const skeleton = read('page-skeleton/page-skeleton.service.ts');
    expect(skeleton).toContain('raw = await agent.analyzeImage(imagePath, prompt, {});');
    expect(skeleton).not.toMatch(/analyzeImage\(imagePath, prompt, \{[^}]*outputKind/);
    // lite-lab：顶层键是任意「文件名」
    const lab = read('lite-lab/api/lite-lab.service.ts');
    expect(lab).toContain('content = await agent.analyzeImage(compositePath, prompt, {});');
    expect(lab).not.toMatch(/analyzeImage\(compositePath, prompt, \{[^}]*outputKind/);
    // chat-attachment：自由文本摘要（旧实现按 JSON 判 ⇒ 每张截图都白烧一次）
    const chat = read('demo/chat-attachment.service.ts');
    expect(chat).toMatch(
      /await visionAgent\.analyzeImage\(imagePath, this\.buildPrompt\([^)]*\)\);/,
    );
  });

  // 🛡️ 声明契约锁（正向）：真实「结构化 JSON / brief / SFC」调用方必须显式声明 outputKind，
  //    否则回到「未声明 ⇒ 不自愈」（不再白烧，但损坏 JSON 也不再被自愈兜住）。
  it('🛡️ 结构化调用方显式声明 outputKind（preview-analysis / lite 分析 / lite codegen）', () => {
    const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
    // visual-parser：顶层 sections/charts/interactions ⇒ 'json'（与自身 hasContent 判据同源）
    expect(read('ai-engine/roles/visual-parser.js')).toContain("outputKind: 'json',");
    // vision-agent 内部 analyzePreviewImage（本文件自身）
    expect(src).toContain("outputKind: 'json',");
    // lite.service：brief（视觉分析）1 处 + sfc（codegen / 断点续跑）2 处
    const lite = read('lite/lite.service.ts');
    expect(lite).toContain("outputKind: 'brief'");
    expect((lite.match(/outputKind: 'sfc'/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  // 🛡️ Anthropic 分支截断升档（2026-11-12 补齐，与 OpenAI 分支对齐）回归锁
  it('Anthropic 分支有截断升档（outputTokens 顶格 → 重建 LLM 用 32000 重试）', () => {
    expect(src).toContain('anthropicTruncated');
    expect(src).toContain('VISION_TRUNCATION_RETRY_MAX_TOKENS');
    // 升档只在调用方未显式指定 maxTokens 时触发
    expect(src).toMatch(/anthropicTruncated[^&]*&&\s*!options\.maxTokens/);
    // 🔴 SFC codegen 不走本升档（语义级重试归 Lite 截断守卫）
    expect(src).toMatch(/&&\s*options\.outputKind !== 'sfc'/);
  });

  it('日志文案不再写死「(Claude)」（协议分支 ≠ 模型厂商，防误判排查）', () => {
    expect(src).toContain('图片分析完成 (Anthropic协议, model=');
    expect(src).not.toContain("图片分析完成 (Claude)");
  });

  // 🛡️ 截断升档重建 LLM 后必须重挂统一网关：`_buildLLM` 返回裸 ChatAnthropic，
  // 不重挂则重试请求绕过超时/心跳/熔断切换/关思考参数（与主请求行为不一致）。
  it('attach 逻辑抽取为 _attachAnthropicInvoke，且截断升档重建后重挂', () => {
    // 构造函数与升档重建两处调用（≥2 次）；attachUnifiedInvoke 只应出现在该方法体内
    const attachCalls = src.match(/this\._attachAnthropicInvoke\(\)/g) || [];
    expect(attachCalls.length).toBeGreaterThanOrEqual(2);
    // 直连 attachUnifiedInvoke 只应有一处（方法体内），避免再散落第二份 attach 选项
    const directAttach = src.match(/attachUnifiedInvoke\(this\.llm,/g) || [];
    expect(directAttach).toHaveLength(1);
    // 升档后 this.llm 必须还原（否则放大上限的客户端泄漏到后续请求）
    expect(src).toContain('const savedLlm = this.llm');
    expect(src).toMatch(/finally\s*\{[\s\S]*?this\.llm = savedLlm;[\s\S]*?\}/);
  });
});

describe('_isAnalysisIntact 输出口径（行为级阳性/阴性对照）', () => {
  // 用原型方法直调，避免构造 VisionAgent（需真实 apiKey 且会建 LLM 客户端）
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { VisionAgent } = require('./vision-agent.js');
  const inst = Object.create(VisionAgent.prototype) as any;
  const call = (content: string, kind?: string) => inst._isAnalysisIntact(content, kind);

  const fullSfc = [
    '<template><div class="c-demo">hi</div></template>',
    '<script setup lang="ts">const a = 1</script>',
    '<style scoped lang="less">.c-demo{color:red}</style>',
  ].join('\n');
  // 截断形态：缺 </style>（生产 mv-lite-1794451845045-33c30bf3 实锤：missing=</style>）
  const truncatedSfc = fullSfc.slice(0, fullSfc.indexOf('</style>'));

  it('🔴 sfc 口径恒返回 true（本文件无 SFC 判据 ⇒ 策略门已挡，不会误自愈）', () => {
    expect(call(fullSfc, 'sfc')).toBe(true);
    // 旧实现此处 false ⇒ 每轮 codegen 必然白烧一次高温重试（2026-11-12 事故直接根因）
    expect(call(truncatedSfc, 'sfc')).toBe(true);
  });

  it('🔴 未声明口径（默认 text）返回 true —— 不再拿 JSON 判据猜未知输出形态', () => {
    expect(call(fullSfc)).toBe(true);
    expect(call('一张设备监测截图的自然语言摘要，非 JSON')).toBe(true);
    expect(call(fullSfc, 'text')).toBe(true);
  });

  it('阴性对照：同一份完整 SFC 在 json 口径下仍判 false（证明旧误判根因真实存在）', () => {
    expect(call(fullSfc, 'json')).toBe(false);
  });

  it('回归：非字符串输入一律 false（该判定先于口径分支）', () => {
    expect(call('', 'sfc')).toBe(false);
    expect(call('', 'json')).toBe(false);
    expect(call(null as any, 'sfc')).toBe(false);
    expect(call(undefined as any, 'brief')).toBe(false);
  });

  // 🛡️ 2026-11-12 第二个白烧点：Lite 视觉分析输出 brief（layout/regions/colors/theme），
  // 旧 JSON 口径查 sections/charts/interactions 一个都不存在 ⇒ 完整 brief 恒判损坏。
  const fullBrief = JSON.stringify({
    layout: '纵向：顶部统计条 + 中部网格',
    regions: [{ name: '网格区', description: '2×2 卡片', position: 'center', size: '剩余高度' }],
    spacing: { outer: '12px', gap: '8px', padding: '10px' },
    theme: 'light',
    colors: { primary: '#2F7BFF', background: '#F5F8FC', surface: '#FFF', text: '#1F2329', border: '#E5E8EF' },
    typography: { size: '16px/11px', weight: '600/400', lineHeight: '1.4' },
    components: ['卡片'],
    textContent: ['环境监测'],
    name: { cn: '环境监测', en: 'environment-monitor' },
    visualDetails: ['圆角 6px'],
    interactions: [],
  });

  it('阳性：完整 brief 在 brief 口径下判「完整」（静态稿 interactions=[] 同样完整）', () => {
    expect(call(fullBrief, 'brief')).toBe(true);
  });

  it('阴性对照：同一份完整 brief 在 json 口径下仍判 false（证明键错位是误判根因）', () => {
    expect(call(fullBrief, 'json')).toBe(false);
  });

  it('🔴 未声明口径下完整 brief 返回 true（旧实现默认 json ⇒ 恒判损坏）', () => {
    expect(call(fullBrief)).toBe(true);
  });

  it('阴性：截断 brief 在 brief 口径下判「损坏」（自愈重试仍保留）', () => {
    expect(call(fullBrief.slice(0, fullBrief.length - 80), 'brief')).toBe(false);
  });
});

describe('自愈策略门 / 温度升档 / 择优保留（行为级 + 阴阳对照）', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { VisionAgent } = require('./vision-agent.js');
  const make = (temperature: number, model = 'qwen/qwen3.8-max') => {
    const i = Object.create(VisionAgent.prototype) as any;
    i.temperature = temperature;
    i.model = model;
    return i;
  };

  it('策略门：仅显式声明的 json / brief 允许自愈；sfc / text / 未声明一律不自愈', () => {
    const i = make(0);
    expect(i._isSelfHealApplicable('json')).toBe(true);
    expect(i._isSelfHealApplicable('brief')).toBe(true);
    expect(i._isSelfHealApplicable('sfc')).toBe(false);
    expect(i._isSelfHealApplicable('text')).toBe(false);
    expect(i._isSelfHealApplicable(undefined)).toBe(false); // 未声明 ⇒ 不自愈（白烧点根治）
    expect(i._isSelfHealApplicable('')).toBe(false);
    expect(i._isSelfHealApplicable('brief ')).toBe(false); // 严格匹配，不做模糊猜测
  });

  it('温度升档基准取当前值本身：0 ⇒ 0.3（旧式 `|| 0.2` 会误升到 0.5，扰动翻倍）', () => {
    expect(make(0)._escalateTemperature(0)).toBeCloseTo(0.3, 5);
    expect(make(0.2)._escalateTemperature(0.2)).toBeCloseTo(0.5, 5);
  });

  it('温度升档上限 0.6（不得把采样推成随机掷骰）', () => {
    expect(make(0.5)._escalateTemperature(0.5)).toBeCloseTo(0.6, 5);
    expect(make(0.9)._escalateTemperature(0.9)).toBeCloseTo(0.6, 5);
  });

  it('推理模型升档仍被强制为 1（不绕过服务端 temperature 约束）', () => {
    expect(make(0, 'deepseek-reasoner')._escalateTemperature(0)).toBe(1);
  });

  // 🔴 决定性直证：自愈的真实触发条件是**复合门**
  //    `!retry && _isSelfHealApplicable(kind) && !_isAnalysisIntact(content, kind)`。
  //    对同一份产物，只要 kind 属 sfc / text / 未声明，复合门**恒为 false** ⇒ 不抬温、不重采样、
  //    不覆盖首轮 ⇒ 同图同模型**确定性地产出同一结果**（这正是用户要的「去除不稳定」）。
  const shouldHeal = (kind: string | undefined, content: string) =>
    make(0)._isSelfHealApplicable(kind) && !make(0)._isAnalysisIntact(content, kind);

  it('🔴 sfc 口径：完整 / 截断 / 任意内容均**永不**触发自愈（确定性产出，不被高温覆盖）', () => {
    expect(shouldHeal('sfc', '<template>x</template>')).toBe(false);
    expect(shouldHeal('sfc', '<template>x')).toBe(false); // 真截断也一样：截断归 Lite 层守卫
    expect(shouldHeal('sfc', '')).toBe(false);
    expect(shouldHeal('sfc', '{{{乱码')).toBe(false);
  });

  it('🔴 未声明口径：任意内容均**永不**触发自愈（旧实现此处 100% 命中，白烧 + 盲覆盖）', () => {
    expect(shouldHeal(undefined, '<template>x</template>')).toBe(false);
    expect(shouldHeal(undefined, '自然语言摘要')).toBe(false);
    expect(shouldHeal('', '{}')).toBe(false);
  });

  it('阳性对照：声明为 brief / json 且结构损坏时**仍会**自愈（正当收益方向未被误杀）', () => {
    const okBrief = JSON.stringify({ layout: 'x', theme: 'light' });
    expect(shouldHeal('brief', okBrief)).toBe(false); // 完整 ⇒ 不自愈
    expect(shouldHeal('brief', okBrief.slice(0, 10))).toBe(true); // 截断 ⇒ 自愈
    expect(shouldHeal('json', JSON.stringify({ sections: [{ a: 1 }] }))).toBe(false);
    expect(shouldHeal('json', '{ broken')).toBe(true);
  });

  it('🔴 择优：重试更短 ⇒ 保留首轮（生产被采纳样本仅首轮 1/3 的直接防线）', () => {    const i = make(0);
    const firstBrief = JSON.stringify({
      layout: '纵向：顶部统计条 + 中部网格',
      regions: [{ name: '网格区' }],
      theme: 'light',
      name: { cn: '环境监测' },
      textContent: ['环境监测'],
      components: ['卡片'],
      visualDetails: [],
    });
    const retryBrief = JSON.stringify({ layout: 'y' }); // 更短且不满足 brief 判据
    expect(i._pickBetterContent(firstBrief, retryBrief, 'brief')).toBe(firstBrief);
  });

  it('择优：重试结构合格而首轮不合格 ⇒ 采纳重试（自愈的正当收益方向）', () => {
    const bad = '```json\n{ "sections": [ { broken';
    const good = JSON.stringify({ sections: [{ title: 'A' }] });
    expect(make(0)._pickBetterContent(bad, good, 'json')).toBe(good);
  });

  it('择优：空产物绝不覆盖有内容者（两个方向都对照）', () => {
    const i = make(0);
    expect(i._pickBetterContent('A', '', 'text')).toBe('A');
    expect(i._pickBetterContent('A', null as any, 'text')).toBe('A');
    expect(i._pickBetterContent('', 'B', 'text')).toBe('B');
  });

  it('择优：同口径同合格度时取更长者（真截断产物必然更短）', () => {
    const i = make(0);
    const short = JSON.stringify({ sections: [{ title: 'A' }] });
    const long = JSON.stringify({ sections: [{ title: 'A' }, { title: 'B' }] });
    expect(i._pickBetterContent(short, long, 'json')).toBe(long);
    expect(i._pickBetterContent(long, short, 'json')).toBe(long);
  });
});
