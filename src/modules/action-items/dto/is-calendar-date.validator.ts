import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { isValidActionItemDueDate } from '../action-item-input';

@ValidatorConstraint({ name: 'isCalendarDate', async: false })
export class IsCalendarDateConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && isValidActionItemDueDate(value);
  }

  defaultMessage(): string {
    return 'dueDate must be a valid ISO calendar date (YYYY-MM-DD)';
  }
}

export function IsCalendarDate(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return (object, propertyName) => {
    registerDecorator({
      target: object.constructor,
      propertyName: String(propertyName),
      options: validationOptions,
      constraints: [],
      validator: IsCalendarDateConstraint,
    });
  };
}
