import { IsString, IsArray, IsObject, ValidateNested, IsOptional, IsEnum, IsNumber, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class DataSourceConfigDto {
  @IsString()
  url: string;

  @IsEnum(['GET', 'POST'])
  method: 'GET' | 'POST';

  @IsOptional()
  @IsObject()
  headers?: Record<string, string>;

  @IsObject()
  responseMapping: {
    totalField: string;
    listField: string;
    idField: string;
  };
}

export class SelectOptionDto {
  @IsString()
  label: string;

  @IsString()
  value: string;

  @IsOptional()
  @IsBoolean()
  disabled?: boolean;
}

export class LinkageValueMapDto {
  @IsString()
  sourceVal: string;

  @IsString()
  targetVal: string;
}

export class SearchFieldConfigDto {
  @IsString()
  id: string;

  @IsString()
  name: string;

  @IsString()
  label: string;

  @IsEnum(['text', 'number', 'select', 'radio', 'checkbox', 'date', 'datetime', 'time', 'range'])
  type: 'text' | 'number' | 'select' | 'radio' | 'checkbox' | 'date' | 'datetime' | 'time' | 'range';

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsString()
  placeholder?: string;

  @IsOptional()
  @IsString()
  defaultValue?: string;

  @IsOptional()
  @IsNumber()
  min?: number;

  @IsOptional()
  @IsNumber()
  max?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SelectOptionDto)
  options?: SelectOptionDto[];

  // 联动配置
  @IsOptional()
  @IsBoolean()
  linkageEnabled?: boolean;

  @IsOptional()
  @IsString()
  linkageSource?: string;

  @IsOptional()
  @IsEnum(['filterOptions', 'visible', 'valueMap'])
  linkageType?: 'filterOptions' | 'visible' | 'valueMap';

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LinkageValueMapDto)
  linkageValueMaps?: LinkageValueMapDto[];
}

export class TableColumnConfigDto {
  @IsString()
  dataIndex: string;

  @IsString()
  title: string;

  @IsOptional()
  @IsNumber()
  width?: number;

  @IsOptional()
  @IsEnum(['left', 'right'])
  fixed?: 'left' | 'right';

  @IsOptional()
  @IsBoolean()
  customRender?: boolean;

  @IsOptional()
  @IsString()
  renderType?: 'text' | 'tag' | 'switch' | 'actions';

  @IsOptional()
  @IsObject()
  tagOptions?: Record<string, { color: string; text: string }>;

  @IsOptional()
  @IsBoolean()
  sortable?: boolean;

  @IsOptional()
  @IsArray()
  filters?: { text: string; value: string }[];

  @IsOptional()
  @IsEnum(['left', 'center', 'right'])
  align?: 'left' | 'center' | 'right';

  @IsOptional()
  @IsBoolean()
  ellipsis?: boolean;
}

export class AdminPageConfigDto {
  @IsString()
  name: string;

  @IsString()
  title: string;

  @IsOptional()
  @IsBoolean()
  showTitle?: boolean;

  @IsOptional()
  @IsBoolean()
  showPagination?: boolean;

  @IsOptional()
  @IsEnum(['inline', 'horizontal', 'vertical'])
  searchLayout?: 'inline' | 'horizontal' | 'vertical';

  @IsOptional()
  @IsBoolean()
  labelColon?: boolean;

  @IsOptional()
  @IsBoolean()
  formWrap?: boolean;

  @IsOptional()
  @IsNumber()
  fieldsPerRow?: number;

  @IsOptional()
  @IsEnum(['light', 'dark', 'none', 'custom'])
  pageTheme?: 'light' | 'dark' | 'none' | 'custom';

  @IsOptional()
  @IsString()
  primaryColor?: string;

  @ValidateNested()
  @Type(() => DataSourceConfigDto)
  dataSource: DataSourceConfigDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SearchFieldConfigDto)
  searchFields: SearchFieldConfigDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TableColumnConfigDto)
  tableColumns: TableColumnConfigDto[];

  @IsOptional()
  @IsBoolean()
  enableExport?: boolean;

  @IsOptional()
  @IsBoolean()
  enableBatchDelete?: boolean;

  @IsOptional()
  @IsBoolean()
  enableCreate?: boolean;

  @IsOptional()
  @IsBoolean()
  enableEdit?: boolean;

  @IsOptional()
  @IsNumber()
  modalWidth?: number;

  @IsOptional()
  @IsBoolean()
  showActionColumn?: boolean;

  @IsOptional()
  @IsEnum(['link', 'text', 'primary', 'dashed'])
  actionBtnType?: 'link' | 'text' | 'primary' | 'dashed';

  @IsOptional()
  @IsEnum(['small', 'middle'])
  actionBtnSize?: 'small' | 'middle';

  @IsOptional()
  @IsEnum(['danger', 'default'])
  actionDeleteType?: 'danger' | 'default';

  @IsOptional()
  @IsBoolean()
  actionView?: boolean;

  @IsOptional()
  @IsBoolean()
  actionEdit?: boolean;

  @IsOptional()
  @IsBoolean()
  actionDelete?: boolean;

  @IsOptional()
  @IsNumber()
  pageSize?: number;

  @IsOptional()
  @IsNumber()
  scrollX?: number;

  @IsOptional()
  @IsNumber()
  scrollY?: number;

  @IsOptional()
  @IsBoolean()
  striped?: boolean;

  @IsOptional()
  @IsString()
  stripeColor?: string;

  @IsOptional()
  @IsEnum(['checkbox', 'radio'])
  rowSelectionType?: 'checkbox' | 'radio';

  @IsOptional()
  @IsNumber()
  labelWidth?: number;
}
