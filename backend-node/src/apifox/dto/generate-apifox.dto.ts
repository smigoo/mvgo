import { IsString, IsOptional, IsNotEmpty } from 'class-validator';

export class GenerateApifoxDto {
  /** Apifox 项目 ID */
  @IsString()
  @IsNotEmpty()
  apifoxProjectId: string;

  /** Apifox Access Token */
  @IsString()
  @IsNotEmpty()
  apifoxToken: string;

  /** Apifox API Base URL（默认 https://api.apifox.com） */
  @IsOptional()
  @IsString()
  apifoxBaseUrl?: string;

  /** 模块名（用于函数命名 + 文件名 + 路径过滤） */
  @IsString()
  @IsNotEmpty()
  moduleName: string;

  /** 路径过滤前缀（如 /flow），不传则按 moduleName 匹配路径首段 */
  @IsOptional()
  @IsString()
  pathFilter?: string;

  /** 所有者用户 ID（由 controller 从 session 注入，前端无需传） */
  @IsOptional()
  @IsString()
  ownerId?: string;
}
