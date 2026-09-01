import { ApiProperty } from '@nestjs/swagger';

export class ProjectNameEntryEntity {
  @ApiProperty({
    description:
      'Project display label. Bootcamp stub uses projectId until a Project directory exists.',
    example: 'People Management Platform',
  })
  name!: string;
}

export class ProjectsSectionDto {
  @ApiProperty({ type: [ProjectNameEntryEntity] })
  projects!: ProjectNameEntryEntity[];
}
