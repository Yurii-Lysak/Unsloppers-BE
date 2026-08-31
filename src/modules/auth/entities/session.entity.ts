import { ApiProperty } from '@nestjs/swagger';
import { CurrentUserDto } from '../../contracts/current-user-provider.contract';

export class SessionEntity implements CurrentUserDto {
  @ApiProperty({ format: 'uuid' })
  userId!: string;
}
