import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class RunLabDto {
  /** Figma 设计链接（https://www.figma.com/file/xxx?node-id=1-2），必填 */
  @IsString()
  @IsNotEmpty()
  figmaUrl!: string;

  /** 目标组件类型，默认 microcode */
  @IsOptional()
  @IsIn(['vue3', 'microcode'])
  componentType?: 'vue3' | 'microcode';

  /** 组件英文名，缺省由 lite 管线推导 */
  @IsOptional()
  @IsString()
  componentName?: string;

  /** 业务组 ID；缺省 default-group */
  @IsOptional()
  @IsString()
  groupId?: string;

  /** AI 配置覆盖（vision/figma token 等），透传给 lite 管线 */
  @IsOptional()
  @IsObject()
  config?: Record<string, any>;

  /** 回填颜色（默认 true） */
  @IsOptional()
  @IsBoolean()
  applyColor?: boolean;

  /** 回填字号（默认 true） */
  @IsOptional()
  @IsBoolean()
  applyFontSize?: boolean;

  /** 回填绝对宽高（默认 false —— lite 流式布局硬塞绝对尺寸有破坏风险） */
  @IsOptional()
  @IsBoolean()
  applySizes?: boolean;
}
