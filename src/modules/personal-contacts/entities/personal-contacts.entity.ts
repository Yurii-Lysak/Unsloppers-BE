import { ApiProperty } from '@nestjs/swagger';
import { PersonalContactMethodType } from '../../../generated/prisma/client';

export class PersonalContactMethodEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: PersonalContactMethodType })
  type!: PersonalContactMethodType;

  @ApiProperty()
  label!: string;

  @ApiProperty()
  value!: string;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class PersonalContactsSectionEntity {
  @ApiProperty({ type: [PersonalContactMethodEntity] })
  contactMethods!: PersonalContactMethodEntity[];

  @ApiProperty({ nullable: true, type: String })
  residentialAddress!: string | null;

  @ApiProperty({ nullable: true, type: String })
  placeOfStay!: string | null;
}

export class EmergencyContactEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  contactPerson!: string;

  @ApiProperty()
  relationship!: string;

  @ApiProperty()
  phone!: string;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class EmergencyContactsSectionEntity {
  @ApiProperty({ type: [EmergencyContactEntity] })
  contacts!: EmergencyContactEntity[];
}
