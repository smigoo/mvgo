import { IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';

/**
 * 人工精修 DTO（治本·四象限同步）。
 * 用正式 DTO 接收 target / generationTier，避免全局 ValidationPipe(whitelist) 静默剥离新字段。
 * 旧前端只传 componentId + refineType 仍可工作（target/tier 缺省时由 service 回落到任务自身属性）。
 */
export class RefineComponentDto {
  @IsString()
  @IsNotEmpty()
  componentId: string;

  @IsOptional()
  @IsIn(['layout', 'style', 'both'])
  refineType?: 'layout' | 'style' | 'both';

  @IsOptional()
  @IsIn(['microcode', 'vue3'])
  target?: 'microcode' | 'vue3';

  @IsOptional()
  @IsIn(['max', 'lite'])
  generationTier?: 'max' | 'lite';

  /**
   * 🆕 视觉优化精修：是否走「渲染现状 → 对比设计图 → 视觉差异驱动」分支。
   * 与 refineType 正交：refineType 决定改布局/样式，visionRefine 决定「优化目标从哪来」。
   */
  @IsOptional()
  visionRefine?: boolean;

  /**
   * 🆕 视觉优化精修：由 vision-analyze 产出的「视觉差异引导文本」，
   * 直接注入 LayoutRefiner / StyleRefiner 的 prompt（两 refiner 已有 visualDiffGuidance 插槽）。
   * 仅当 visionRefine=true 时使用；为空则退化为普通精修。
   */
  @IsOptional()
  @IsString()
  visualDiffGuidance?: string;

  /**
   * 🆕 视觉优化精修：用户上传的「期望效果」参照图（base64 / data-url），
   * 优先级高于本地 source-*.png 与 Figma 自动取图。空则走自动取图。
   */
  @IsOptional()
  @IsString()
  overrideImage?: string;
}
