import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { isValidCampaignDueDate } from '../campaign-input';

@ValidatorConstraint({ name: 'isCampaignCalendarDate', async: false })
export class IsCampaignCalendarDateConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && isValidCampaignDueDate(value);
  }

  defaultMessage(): string {
    return 'dueDate must be a valid ISO calendar date (YYYY-MM-DD)';
  }
}

export function IsCampaignCalendarDate(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return (object, propertyName) => {
    registerDecorator({
      target: object.constructor,
      propertyName: String(propertyName),
      options: validationOptions,
      constraints: [],
      validator: IsCampaignCalendarDateConstraint,
    });
  };
}
