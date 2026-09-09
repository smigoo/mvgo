import { IsString, IsOptional, IsArray, IsNumber } from 'class-validator';

export class RecordApifoxDto {
  @IsString()
  taskId: string;

  @IsString()
  moduleName: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fileNames?: string[];

  @IsOptional()
  @IsNumber()
  apiCount?: number;

  @IsOptional()
  @IsString()
  zipPath?: string;

  @IsOptional()
  @IsString()
  downloadUrl?: string;
}
