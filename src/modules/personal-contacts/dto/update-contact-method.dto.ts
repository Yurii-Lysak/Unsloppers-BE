import { PartialType } from '@nestjs/swagger';
import { CreateContactMethodDto } from './create-contact-method.dto';

export class UpdateContactMethodDto extends PartialType(
  CreateContactMethodDto,
) {}
