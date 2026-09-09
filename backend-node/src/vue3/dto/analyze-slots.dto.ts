import { IsString, IsNotEmpty } from 'class-validator';

export class AnalyzeSlotsDto {
  @IsString()
  @IsNotEmpty()
  componentId: string;

  @IsString()
  @IsNotEmpty()
  groupId: string;
}
