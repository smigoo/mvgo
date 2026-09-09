import { IsString, IsOptional, IsIn } from 'class-validator';

/**
 * HTML 大屏拆分请求 DTO
 */
export class SplitHtmlDto {
  @IsString()
  htmlContent: string;

  @IsOptional()
  @IsString()
  htmlFileName?: string;

  @IsString()
  @IsIn(['vue3', 'microcode'])
  componentType: 'vue3' | 'microcode';

  @IsOptional()
  @IsString()
  groupId?: string;

  @IsOptional()
  config?: Record<string, any>;
}
