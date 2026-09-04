import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class ShareSavedViewDto {
  // ArrayMinSize(0) intentionally allows an empty array — that is how an
  // owner unshares a view down to zero recipients (Review][Patch: unshare
  // to zero recipients was previously blocked by ArrayMinSize(1)).
  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayMinSize(0)
  @IsUUID('4', { each: true })
  recipientEmployeeIds!: string[];
}
