import { ApiProperty } from '@nestjs/swagger';

export class EmploymentSectionDto {
  @ApiProperty({ nullable: true, example: 'L4' })
  grade!: string | null;

  @ApiProperty({ nullable: true, example: 'Software Engineer' })
  position!: string | null;

  @ApiProperty({ nullable: true, example: 'Senior' })
  seniority!: string | null;

  @ApiProperty({ nullable: true, example: 'Full-time' })
  employmentType!: string | null;

  @ApiProperty({ nullable: true, example: 'B2' })
  englishLevel!: string | null;

  @ApiProperty({ nullable: true, example: 'Completed' })
  probationStatus!: string | null;

  @ApiProperty({ nullable: true, example: 'Employment contract' })
  contractType!: string | null;
}
