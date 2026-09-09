import { IsString, IsOptional } from 'class-validator';

export class UpdateDocumentDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;
}

export class AppendDocumentDto {
  @IsString()
  content: string;
}
