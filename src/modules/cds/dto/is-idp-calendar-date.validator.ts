import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { isValidIdpDeadline } from '../idp-record-input';

@ValidatorConstraint({ name: 'isIdpCalendarDate', async: false })
export class IsIdpCalendarDateConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && isValidIdpDeadline(value);
  }

  defaultMessage(): string {
    return 'deadline must be a valid ISO calendar date (YYYY-MM-DD)';
  }
}

export function IsIdpCalendarDate(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return (object, propertyName) => {
    registerDecorator({
      target: object.constructor,
      propertyName: String(propertyName),
      options: validationOptions,
      constraints: [],
      validator: IsIdpCalendarDateConstraint,
    });
  };
}
