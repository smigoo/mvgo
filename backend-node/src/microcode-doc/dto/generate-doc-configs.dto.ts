import { IsString, IsNotEmpty } from 'class-validator';

export class GenerateDocConfigsDto {
  @IsString()
  @IsNotEmpty()
  document: string;
}

export class GenerateDocConfigsResponse {
  success: boolean;
  configs?: {
    businessEvents: string;
    businessStatuses: string;
    businessConfig: string;
    cssVariableConfig: string;
  };
  merged?: string;
  error?: string;
}
