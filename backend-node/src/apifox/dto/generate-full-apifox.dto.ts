import { IsString, IsOptional, IsNotEmpty } from 'class-validator';

export class GenerateFullApifoxDto {
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

  /** 项目名称（必填，用于 catalog 显示和历史记录命名） */
  @IsString()
  @IsNotEmpty({ message: '项目名称不能为空' })
  projectName: string;

  /** 所有者用户 ID（由 controller 从 session 注入，前端无需传） */
  @IsOptional()
  @IsString()
  ownerId?: string;
}
