import { IsBoolean } from 'class-validator';

/** 设置用户管理员标志的请求体 */
export class SetUserAdminDto {
  @IsBoolean()
  isAdmin: boolean;
}
