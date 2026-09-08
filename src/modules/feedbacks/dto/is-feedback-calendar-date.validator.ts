import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { isValidFeedbackCalendarDate } from '../feedback-input';

@ValidatorConstraint({ name: 'isFeedbackCalendarDate', async: false })
export class IsFeedbackCalendarDateConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && isValidFeedbackCalendarDate(value);
  }

  defaultMessage(): string {
    return 'recordedAt must be a valid ISO calendar date (YYYY-MM-DD)';
  }
}

export function IsFeedbackCalendarDate(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return (object, propertyName) => {
    registerDecorator({
      target: object.constructor,
      propertyName: String(propertyName),
      options: validationOptions,
      constraints: [],
      validator: IsFeedbackCalendarDateConstraint,
    });
  };
}
