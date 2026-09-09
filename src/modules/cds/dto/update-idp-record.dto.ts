import { PartialType } from '@nestjs/swagger';
import { CreateIdpRecordDto } from './create-idp-record.dto';

export class UpdateIdpRecordDto extends PartialType(CreateIdpRecordDto) {}
