import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { User } from '../../../generated/prisma/client';

/** API-facing user shape — identity and credential hashes are never exposed. */
export type PublicUser = Omit<User, 'hash' | 'passwordHash'>;

export class UserEntity implements PublicUser {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'user@example.com' })
  email!: string;

  @ApiPropertyOptional({ example: 'John Doe', nullable: true, type: String })
  name!: string | null;

  @ApiPropertyOptional({
    example: 'US',
    description:
      'TimeTracker-sourced (Story 1.16 seed); null for users created outside the seed path.',
    nullable: true,
    type: String,
  })
  countryCode!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
