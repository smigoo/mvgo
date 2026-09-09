import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsObject,
} from 'class-validator';

export class GenerateVue3Dto {
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

  @IsString()
  @IsOptional()
  panelType?: string = 'default-panel';

  // S10: 需求文档（可选，用于接口对接阶段预填）
  @IsString()
  @IsOptional()
  requirementDoc?: string;

  // S10: 预分析的文档产物（可选）
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
