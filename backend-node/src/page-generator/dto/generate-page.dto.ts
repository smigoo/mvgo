import { IsString, IsNotEmpty, IsOptional, IsIn, IsInt, Min, Max, IsObject } from 'class-validator';

export class GeneratePageDto {
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
  @IsIn(['serial', 'parallel'])
  executionMode?: 'serial' | 'parallel' = 'parallel';

  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(10)
  concurrency?: number = 2;

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
