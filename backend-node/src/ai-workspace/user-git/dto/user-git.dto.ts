import { IsString, IsOptional } from 'class-validator';

export class SaveGitCredentialDto {
  @IsString()
  type: string;

  @IsString()
  token: string;

  @IsOptional()
  @IsString()
  description?: string;
}
