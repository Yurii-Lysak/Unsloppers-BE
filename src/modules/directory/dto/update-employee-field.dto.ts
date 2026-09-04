import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

const IsValuePresent = (validationOptions?: ValidationOptions) => {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isValuePresent',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(_: unknown, args: ValidationArguments) {
          return Object.prototype.hasOwnProperty.call(args.object, propertyName);
        },
        defaultMessage: () => 'value is required',
      },
    });
  };
};

export class UpdateEmployeeFieldDto {
  @ApiPropertyOptional({
    description:
      'Typed value matching the field definition, or null to clear custom fields',
    oneOf: [
      { type: 'string' },
      { type: 'number' },
      { type: 'boolean' },
      { type: 'array', items: { type: 'string' } },
    ],
    nullable: true,
  })
  @IsValuePresent()
  value!: string | number | boolean | string[] | null;
}
