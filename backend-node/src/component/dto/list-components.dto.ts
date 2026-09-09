import { IsOptional, IsString, IsInt, Min, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class ListComponentsDto {
  @IsOptional()
  @IsString()
  groupId?: string;

  /**
   * 可见范围：mine=仅我的（缺省，保持原行为）；
   * public=公共组件池；all=我的 + 公共池并集
   */
  @IsOptional()
  @IsIn(['mine', 'public', 'all'])
  scope?: 'mine' | 'public' | 'all';

  @IsOptional()
  @IsString()
  search?: string; // 搜索关键词

  @IsOptional()
  @IsString()
  creator?: string; // 筛选创建者: 'all' | 'me'

  @IsOptional()
  @IsString()
  sortBy?: string; // 排序字段: 'lastEdited' | 'created' | 'name'

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number = 12;
}
