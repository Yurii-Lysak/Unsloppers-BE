import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class EndMentorshipPairDto {
  @ApiProperty({ example: 'Pair concluded successfully after six months.' })
  @IsString()
  closureFeedback!: string;
}
