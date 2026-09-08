import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class PatchOpenToMentoringDto {
  @ApiProperty()
  @IsBoolean()
  openToMentoring!: boolean;
}
