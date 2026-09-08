import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CreateMentorshipPairDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  mentorId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  menteeId!: string;
}
