import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsObject,
  IsArray,
  ArrayMaxSize,
  ValidateNested,
  IsIn,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 🆕 副稿 Figma 节点（2026-10-10）：深浅双主题的第二份设计真值。
 * 不传 = 单稿模式，另一套主题继续走算法派生（保持既有行为）。
 *
 * ⚠️ 2026-10-12 起**已被 themeNodes 取代**（N 主题），保留仅为兼容存量前端。
 *   新前端请用 themeNodes（可传任意数量 + 自定义主题名）。
 */
export class SecondaryNodeDto {
  @IsString()
  @IsNotEmpty()
  fileKey: string;

  @IsString()
  @IsNotEmpty()
  nodeId: string;
}

/**
 * 🆕🆕 2026-10-12 N 主题：一个主题对应一份设计稿。
 *
 * 与 `SecondaryNodeDto` 的差异：**带主题显示名**（用户自填，如「黄昏模式」），
 * 且 `name` 可选（省略时由 `normalizeThemeInputs` 按序补默认名「浅色/深色/主题N」）。
 */
export class ThemeNodeDto {
  @IsString()
  @IsNotEmpty()
  fileKey: string;

  @IsString()
  @IsNotEmpty()
  nodeId: string;

  /** 主题显示名（用户自填）。省略则用默认名。 */
  @IsOptional()
  @IsString()
  name?: string;

  /**
   * 🔴 2026-10-13：用户为该主题**自选的深浅配色**（与稿子自动判定解耦——
   *   用户拍的颜色方案说了算）。浅色 ⇒ resolveThemeKey 占用 light 保留位；
   *   深色 ⇒ 深色系 key；dark 恒为系统占位（A8-1）。省略则按稿子自动判定。
   *   ⚠️ normalizeThemeInputs 已消费 raw.brightness（declaredBrightness），
   *   但本 DTO 是白名单式校验类 —— 不加此字段会被 ValidationPipe 静默剥离
   *   （与 secondaryNode/previewImageUrl 丢失同型坑）。
   */
  @IsOptional()
  @IsIn(['light', 'dark'])
  brightness?: 'light' | 'dark';
}

export class GeneratePhase2Dto {
  @IsString()
  @IsOptional()
  componentName?: string;

  @IsString()
  @IsNotEmpty()
  fileKey: string;

  @IsString()
  @IsNotEmpty()
  nodeId: string;

  /**
   * 🆕🆕 N 主题设计稿列表（2026-10-12）：第 1 项即主稿（决定结构/几何/文案），
   * 其余每项贡献一套主题色板。
   *
   * - 不传 / 空数组 = 单稿模式（行为与改动前完全一致，零回归）
   * - 只传 1 项 = 等价单稿（其余主题走派生）
   * - 上限 8（`MAX_THEMES`）：每主题一套 Less mixin，再多会拖垮编译
   *
   * ⚠️ 与 `secondaryNode` 同时存在时，**themeNodes 优先**（新前端只用前者）。
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8, { message: 'themeNodes 最多 8 项（每主题一套 mixin）' })
  @ValidateIf((o: GeneratePhase2Dto) => Array.isArray(o.themeNodes))
  @ValidateNested({ each: true })
  @Type(() => ThemeNodeDto)
  themeNodes?: ThemeNodeDto[];

  /**
   * 副稿 Figma 节点（2026-10-10，**已弃用**，保留兼容存量前端）：
   * 深浅双主题的第二份设计真值。themeNodes 存在时本字段被忽略。
   */
  @IsOptional()
  @ValidateIf((o: GeneratePhase2Dto) => !!o.secondaryNode)
  @IsObject()
  secondaryNode?: SecondaryNodeDto;

  /**
   * 主副角色标注（2026-10-10）：'first' 表示 fileKey+nodeId 是主稿（默认，
   * 前端显式选择、默认预选第一个）；'second' 表示副稿是主稿、fileKey+nodeId 反转为副稿。
   * 主稿决定结构/几何/文案，副稿只贡献色板。
   *
   * ⚠️ 在 `themeNodes` 模式下**不生效** —— themeNodes[0] 恒为主稿。
   */
  @IsOptional()
  @IsString()
  @IsIn(['first', 'second'])
  primaryRole?: 'first' | 'second' = 'first';

  @IsString()
  @IsNotEmpty()
  groupId: string;

  @IsString()
  @IsOptional()
  componentId?: string;

  // 🆕 高级选项 P0（2026-10-09）：用户指定组件 ID（可选）——规范形态 c-<kebab>，
  // declare.json/workspace 目录/class 前缀全链路恒定，重生成不漂移。
  // 服务端经 normalizeUserComponentId 双保险校验，非法值静默回退自动生成。
  @IsString()
  @IsOptional()
  userComponentId?: string;

  // 🆕 高级选项 P0：用户补充提示词（可选）——进 codegen prompt「用户补充需求」段
  @IsString()
  @IsOptional()
  extraPrompt?: string;

  // 🆕 高级选项 P0：需求文档文本（可选）——前端读文件后传纯文本，进同一 prompt 段
  @IsString()
  @IsOptional()
  requirementDocText?: string;

  // 🆕 预览图复用：前端确认预览后获得的 token，用于跳过后续截图门禁
  @IsString()
  @IsOptional()
  previewToken?: string;

  @IsString()
  @IsOptional()
  panelType?: string = 'default-panel';

  // 🆕 C3: 目标管线类型（2026-07-24）
  // microcode = 微码组件（component.js + declare.json，默认）
  // vue3 = 标准 Vue3 SFC（面板头部/背景渲染为真实 DOM）
  @IsString()
  @IsOptional()
  @IsIn(['microcode', 'vue3'])
  target?: string = 'microcode';

  // 🆕 S9: 需求文档（可选）— 原始 Markdown，驱动文档子管线（D0/D1/D2 → doc-analysis）
  @IsString()
  @IsOptional()
  requirementDoc?: string;

  // 🆕 续跑复用缓存（可选，默认 false）：
  // - false = 重新生成（全新，重新拉 Figma API + 重新 Vision 分析，忽略全局缓存）
  // - true  = 续跑（复用 _shared-cache 的 figma.json + visual.json，跳过最贵的两步，只重跑代码生成）
  @IsOptional()
  reuseCache?: boolean;

  // 🆕 S9: 预分析的文档产物（可选）— 前端 analyze-doc 已分析则直传，管线免重复分析
  @IsOptional()
  @IsObject()
  docAnalysis?: Record<string, any>;

  @IsOptional()
  @IsObject()
  config?: {
    outputPath?: string;
    figmaToken?: string;
    aiApiKey?: string;
    aiBaseURL?: string;
    aiModel?: string;
    visionApiKey?: string;
    visionBaseURL?: string;
    visionModel?: string;
    textApiKey?: string;
    textBaseURL?: string;
    textModel?: string;
  };
}
