import { ApiProperty } from '@nestjs/swagger';
import { EmployeeFieldFilterDto } from '../../directory/dto/list-employees-query.dto';
import { EmployeeListEntity } from '../../directory/entities/employee-list.entity';

export class CampaignAudienceDefinitionEntity {
  @ApiProperty({ type: EmployeeFieldFilterDto, isArray: true })
  filters!: EmployeeFieldFilterDto[];

  @ApiProperty({ type: String, isArray: true })
  addedEmployeeIds!: string[];

  @ApiProperty({ type: String, isArray: true })
  excludedEmployeeIds!: string[];
}

export class CampaignAudiencePreviewEntity extends EmployeeListEntity {}

export class CampaignAudienceResolveEntity {
  @ApiProperty({ type: String, isArray: true })
  employeeIds!: string[];
}
