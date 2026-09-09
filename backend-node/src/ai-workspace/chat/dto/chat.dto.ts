import { IsString, IsOptional, IsArray } from 'class-validator';

export class CreateSessionDto {
  @IsString()
  projectId: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  skillId?: string;

  @IsOptional()
  @IsString()
  modelProvider?: string;

  @IsOptional()
  @IsString()
  modelName?: string;
}

export class SaveMessageDto {
  @IsString()
  sessionId: string;

  @IsOptional()
  @IsString()
  documentId?: string;

  @IsArray()
  messages: Array<{ role: string; content: string }>;

  @IsString()
  generatedContent: string;

  @IsOptional()
  @IsArray()
  skills?: string[];

  @IsOptional()
  @IsString()
  modelProvider?: string;

  @IsOptional()
  @IsString()
  modelName?: string;
}

export class UpdateSessionDto {
  @IsOptional()
  @IsString()
  title?: string;
}
