import { IsArray, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * 项目级管线（M1：S0 扫描 + S2 冻结）请求体
 *
 * 与 v2 的关键区别：v2 的输入是「截图 / Figma 链接」，本管线的输入是
 * **本机绝对路径的项目目录**（里面自带原型 html、文档、前后端框架）。
 * 路径合法性不在 DTO 层判定 —— 必须在 service 里 `path.isAbsolute` + 真实
 * 文件系统探针，DTO 只能保证「非空字符串」。
 */
export class InspectProjectDto {
  /** 项目根目录绝对路径，例如 /Users/smigoo/工作/test */
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  projectDir: string;
}

export class ScanProjectDto extends InspectProjectDto {
  /** 本次运行的备注（会写进 run.json，便于在运行列表里区分） */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

/**
 * 「拉起系统选择文件夹对话框」的入参。
 *
 * projectDir 是可选的**默认起始位置** —— 传了就打开用户上次那个目录，
 * 不传就交给系统默认。这不是必填，所以不能复用 InspectProjectDto。
 */
export class PickProjectDto {
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  projectDir?: string;
}

export class FreezeProjectDto {
  /** S0 扫描返回的 runId */
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  runId: string;
}

export class GenerateProjectDto {
  /** S2 冻结返回的 runId（S3 代码生成基于冻结契约） */
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  runId: string;
}

/**
 * 人裁决条目。
 *
 * 嵌套对象刻意**不用** @ValidateNested（避免 class-transformer 的 Type 依赖），
 * 逐条校验放在 service.saveDecisions 里 —— 那里还要做 conflictId 白名单式正则，
 * 校验逻辑集中在真正使用它的地方，不做两份。
 */
export class SaveDecisionsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  runId: string;

  /** [{ conflictId: 'CF-XXX', choice: 'A', note: '可选备注' }] */
  @IsArray()
  entries: Array<{ conflictId: string; choice: string; note?: string }>;
}
