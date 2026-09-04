import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { isValidRiskCalendarDate } from '../risk-input';

@ValidatorConstraint({ name: 'isRiskCalendarDate', async: false })
export class IsRiskCalendarDateConstraint
  implements ValidatorConstraintInterface
{
  validate(value: unknown): boolean {
    return typeof value === 'string' && isValidRiskCalendarDate(value);
  }

  defaultMessage(): string {
    return 'recordedAt must be a valid ISO calendar date (YYYY-MM-DD)';
  }
}

export function IsRiskCalendarDate(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return (object, propertyName) => {
    registerDecorator({
      target: object.constructor,
      propertyName: String(propertyName),
      options: validationOptions,
      constraints: [],
      validator: IsRiskCalendarDateConstraint,
    });
  };
}
