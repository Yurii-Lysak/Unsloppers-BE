import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { EmployeeFieldFilterDto } from '../../directory/dto/list-employees-query.dto';

export class SaveCampaignAudienceDto {
  @ApiProperty({ type: EmployeeFieldFilterDto, isArray: true })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EmployeeFieldFilterDto)
  filters!: EmployeeFieldFilterDto[];

  @ApiProperty({ type: String, isArray: true })
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  addedEmployeeIds!: string[];

  @ApiProperty({ type: String, isArray: true })
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  excludedEmployeeIds!: string[];
}
