import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const SAFE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
const SAFE_IDENTIFIER_PATTERN = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
const SAFE_ROLE_PATTERN = /^[a-zA-Z][a-zA-Z0-9_.:-]{0,127}$/;
const SOURCE_KIND_VALUES = ['template', 'script', 'echarts', 'props', 'computed'] as const;

export class BindingSlotChildDto {
  @IsString()
  @IsOptional()
  @Matches(SAFE_ROLE_PATTERN)
  role?: string;

  @IsString()
  @IsOptional()
  refName?: string;

  @IsString()
  @IsOptional()
  label?: string;

  @IsString()
  @IsOptional()
  @IsIn(SOURCE_KIND_VALUES)
  sourceKind?: string;

  @IsString()
  @IsOptional()
  sourceContext?: string;
}

export class BindingSlotDto {
  @IsString()
  @Matches(SAFE_ID_PATTERN)
  slotId: string;

  @IsString()
  @IsIn(['table', 'chart', 'select', 'list', 'stat', 'form'])
  slotType: string;

  @IsString()
  @IsOptional()
  @Matches(SAFE_IDENTIFIER_PATTERN)
  refName?: string;

  @IsString()
  @IsOptional()
  label?: string;

  @IsString()
  @IsOptional()
  @Matches(SAFE_ROLE_PATTERN)
  role?: string;

  @IsString()
  @IsOptional()
  @IsIn(SOURCE_KIND_VALUES)
  sourceKind?: string;

  @IsBoolean()
  @IsOptional()
  bindable?: boolean;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => BindingSlotChildDto)
  children?: BindingSlotChildDto[];

  @ValidateIf((slot: BindingSlotDto) => slot.status === 'bound')
  @IsString()
  @Matches(SAFE_ID_PATTERN)
  moduleName?: string;

  @ValidateIf((slot: BindingSlotDto) => slot.status === 'bound')
  @IsString()
  @Matches(SAFE_IDENTIFIER_PATTERN)
  functionName?: string;

  @IsOptional()
  @IsObject()
  parameterValues?: Record<string, string | number | boolean | null>;

  @IsString()
  @IsIn(['bound', 'stub', 'skipped'])
  status: 'bound' | 'stub' | 'skipped';

  @IsString()
  @IsOptional()
  stubReason?: string;

  @IsString()
  @IsOptional()
  skipReason?: string;
}

export class BindApiDto {
  @IsString()
  @IsNotEmpty()
  @Matches(SAFE_ID_PATTERN)
  catalogId: string;

  @IsString()
  @IsNotEmpty()
  @Matches(SAFE_ID_PATTERN)
  componentId: string;

  @IsString()
  @IsNotEmpty()
  @Matches(SAFE_ID_PATTERN)
  groupId: string;

  @IsString()
  @IsOptional()
  componentName?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BindingSlotDto)
  bindings: BindingSlotDto[];

  @IsOptional()
  @IsObject()
  aiConfig?: {
    textApiKey?: string;
    textBaseURL?: string;
    textModel?: string;
  };
}
