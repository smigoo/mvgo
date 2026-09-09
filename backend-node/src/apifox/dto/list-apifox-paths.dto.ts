import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class ListApifoxPathsDto {
  @IsString()
  @IsNotEmpty()
  apifoxProjectId: string;

  @IsString()
  @IsNotEmpty()
  apifoxToken: string;

  @IsOptional()
  @IsString()
  apifoxBaseUrl?: string;
}