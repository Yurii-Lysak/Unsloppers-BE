import { BadRequestException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PersonalContactMethodType } from '../../generated/prisma/client';
import { CreateContactMethodDto } from './dto/create-contact-method.dto';

export const validateContactMethodFields = async (
  type: PersonalContactMethodType,
  label: string,
  value: string,
): Promise<void> => {
  const dto = plainToInstance(CreateContactMethodDto, { type, label, value });
  const errors = await validate(dto);
  if (errors.length > 0) {
    const messages = errors.flatMap((error) =>
      Object.values(error.constraints ?? {}),
    );
    throw new BadRequestException(messages[0] ?? 'Invalid contact method');
  }
};
