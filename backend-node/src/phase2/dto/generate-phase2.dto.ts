import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsObject,
  IsIn,
} from 'class-validator';

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
