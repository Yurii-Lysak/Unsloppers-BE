import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
  isEmail,
  isPhoneNumber,
} from 'class-validator';
import { PersonalContactMethodType } from '../../../generated/prisma/client';

interface ContactMethodDto {
  type?: PersonalContactMethodType;
  value?: string;
}

@ValidatorConstraint({ name: 'isPersonalContactValue', async: false })
export class IsPersonalContactValueConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const dto = args.object as ContactMethodDto;
    if (value === undefined || value === null) {
      return true;
    }
    if (dto.type === undefined) {
      return true;
    }
    if (typeof value !== 'string') {
      return false;
    }
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return false;
    }

    switch (dto.type) {
      case PersonalContactMethodType.EMAIL:
        return isEmail(trimmed);
      case PersonalContactMethodType.PHONE:
        return isPhoneNumber(trimmed);
      case PersonalContactMethodType.MESSENGER:
        return true;
      default:
        return false;
    }
  }

  defaultMessage(): string {
    return 'value must be a valid email, phone number, or non-empty messenger handle';
  }
}

export const IsPersonalContactValue = (
  validationOptions?: ValidationOptions,
): PropertyDecorator =>
  function (object: object, propertyName: string | symbol) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      constraints: [],
      validator: IsPersonalContactValueConstraint,
    });
  };
