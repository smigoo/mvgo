import { IsString, IsNotEmpty, IsOptional, IsObject } from 'class-validator';

export class AnalyzeFromDocDto {
  @IsString()
  @IsNotEmpty()
  componentId: string;

  @IsString()
  @IsNotEmpty()
  groupId: string;

  @IsString()
  @IsNotEmpty()
  catalogId: string;

  @IsString()
  @IsNotEmpty()
  requirementsDoc: string;

  @IsOptional()
  @IsObject()
  aiConfig?: {
    textApiKey?: string;
    textBaseURL?: string;
    textModel?: string;
  };
}
