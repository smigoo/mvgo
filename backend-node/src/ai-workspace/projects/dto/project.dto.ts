import { IsString, IsOptional } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  gitUrl?: string;

  @IsOptional()
  @IsString()
  gitBranch?: string;

  @IsOptional()
  @IsString()
  gitDefaultPath?: string;
}

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  gitUrl?: string;

  @IsOptional()
  @IsString()
  gitBranch?: string;

  @IsOptional()
  @IsString()
  gitDefaultPath?: string;
}
