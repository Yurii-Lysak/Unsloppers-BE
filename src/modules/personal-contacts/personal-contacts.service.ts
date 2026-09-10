import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type {
  EmergencyContact,
  PersonalContactMethod,
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { validateContactMethodFields } from './contact-method-validation';
import { CreateContactMethodDto } from './dto/create-contact-method.dto';
import { CreateEmergencyContactDto } from './dto/create-emergency-contact.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { UpdateContactMethodDto } from './dto/update-contact-method.dto';
import { UpdateEmergencyContactDto } from './dto/update-emergency-contact.dto';
import {
  EmergencyContactEntity,
  EmergencyContactsSectionEntity,
  PersonalContactMethodEntity,
  PersonalContactsSectionEntity,
} from './entities/personal-contacts.entity';

@Injectable()
export class PersonalContactsService {
  constructor(private readonly prisma: PrismaService) {}

  async buildPersonalContactsSection(
    subjectEmployeeId: string,
  ): Promise<PersonalContactsSectionEntity> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: subjectEmployeeId },
      select: {
        residentialAddress: true,
        placeOfStay: true,
        personalContactMethods: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
      },
    });
    if (!employee) {
      throw new NotFoundException(`Employee ${subjectEmployeeId} not found`);
    }

    return {
      contactMethods: employee.personalContactMethods.map((method) =>
        this.toContactMethodEntity(method),
      ),
      residentialAddress: employee.residentialAddress,
      placeOfStay: employee.placeOfStay,
    };
  }

  async buildEmergencyContactsSection(
    subjectEmployeeId: string,
  ): Promise<EmergencyContactsSectionEntity> {
    const contacts = await this.prisma.emergencyContact.findMany({
      where: { employeeId: subjectEmployeeId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    return {
      contacts: contacts.map((contact) =>
        this.toEmergencyContactEntity(contact),
      ),
    };
  }

  async createContactMethod(
    subjectEmployeeId: string,
    dto: CreateContactMethodDto,
  ): Promise<PersonalContactMethodEntity> {
    const method = await this.prisma.personalContactMethod.create({
      data: {
        employeeId: subjectEmployeeId,
        type: dto.type,
        label: dto.label,
        value: dto.value,
      },
    });
    return this.toContactMethodEntity(method);
  }

  async updateContactMethod(
    subjectEmployeeId: string,
    contactId: string,
    dto: UpdateContactMethodDto,
  ): Promise<PersonalContactMethodEntity> {
    this.assertPatchHasFields(dto, ['type', 'label', 'value']);
    this.assertNullableStringFields(dto, ['label', 'value']);
    const existing = await this.findContactMethodForSubject(
      subjectEmployeeId,
      contactId,
    );
    const merged = {
      type: dto.type ?? existing.type,
      label: dto.label ?? existing.label,
      value: dto.value ?? existing.value,
    };
    await validateContactMethodFields(merged.type, merged.label, merged.value);

    try {
      const method = await this.prisma.personalContactMethod.update({
        where: { id: existing.id },
        data: {
          ...(dto.type !== undefined ? { type: dto.type } : {}),
          ...(dto.label !== undefined ? { label: dto.label } : {}),
          ...(dto.value !== undefined ? { value: dto.value } : {}),
        },
      });
      return this.toContactMethodEntity(method);
    } catch (error) {
      this.rethrowRecordNotFound(
        error,
        `Contact method ${contactId} not found`,
      );
    }
  }

  async deleteContactMethod(
    subjectEmployeeId: string,
    contactId: string,
  ): Promise<void> {
    const existing = await this.findContactMethodForSubject(
      subjectEmployeeId,
      contactId,
    );
    try {
      await this.prisma.personalContactMethod.delete({
        where: { id: existing.id },
      });
    } catch (error) {
      this.rethrowRecordNotFound(
        error,
        `Contact method ${contactId} not found`,
      );
    }
  }

  async updateAddress(
    subjectEmployeeId: string,
    dto: UpdateAddressDto,
  ): Promise<PersonalContactsSectionEntity> {
    if (dto.residentialAddress === undefined && dto.placeOfStay === undefined) {
      throw new BadRequestException(
        'At least one of residentialAddress or placeOfStay is required',
      );
    }

    await this.prisma.employee.update({
      where: { id: subjectEmployeeId },
      data: {
        ...(dto.residentialAddress !== undefined
          ? { residentialAddress: dto.residentialAddress }
          : {}),
        ...(dto.placeOfStay !== undefined
          ? { placeOfStay: dto.placeOfStay }
          : {}),
      },
    });

    return this.buildPersonalContactsSection(subjectEmployeeId);
  }

  async createEmergencyContact(
    subjectEmployeeId: string,
    dto: CreateEmergencyContactDto,
  ): Promise<EmergencyContactEntity> {
    const contact = await this.prisma.emergencyContact.create({
      data: {
        employeeId: subjectEmployeeId,
        contactPerson: dto.contactPerson,
        relationship: dto.relationship,
        phone: dto.phone,
      },
    });
    return this.toEmergencyContactEntity(contact);
  }

  async updateEmergencyContact(
    subjectEmployeeId: string,
    emergencyContactId: string,
    dto: UpdateEmergencyContactDto,
  ): Promise<EmergencyContactEntity> {
    this.assertPatchHasFields(dto, ['contactPerson', 'relationship', 'phone']);
    this.assertNullableStringFields(dto, [
      'contactPerson',
      'relationship',
      'phone',
    ]);
    const existing = await this.findEmergencyContactForSubject(
      subjectEmployeeId,
      emergencyContactId,
    );

    try {
      const contact = await this.prisma.emergencyContact.update({
        where: { id: existing.id },
        data: {
          ...(dto.contactPerson !== undefined
            ? { contactPerson: dto.contactPerson }
            : {}),
          ...(dto.relationship !== undefined
            ? { relationship: dto.relationship }
            : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        },
      });
      return this.toEmergencyContactEntity(contact);
    } catch (error) {
      this.rethrowRecordNotFound(
        error,
        `Emergency contact ${emergencyContactId} not found`,
      );
    }
  }

  async deleteEmergencyContact(
    subjectEmployeeId: string,
    emergencyContactId: string,
  ): Promise<void> {
    const existing = await this.findEmergencyContactForSubject(
      subjectEmployeeId,
      emergencyContactId,
    );
    try {
      await this.prisma.emergencyContact.delete({ where: { id: existing.id } });
    } catch (error) {
      this.rethrowRecordNotFound(
        error,
        `Emergency contact ${emergencyContactId} not found`,
      );
    }
  }

  private toContactMethodEntity(
    method: PersonalContactMethod,
  ): PersonalContactMethodEntity {
    return {
      id: method.id,
      type: method.type,
      label: method.label,
      value: method.value,
      createdAt: method.createdAt.toISOString(),
      updatedAt: method.updatedAt.toISOString(),
    };
  }

  private toEmergencyContactEntity(
    contact: EmergencyContact,
  ): EmergencyContactEntity {
    return {
      id: contact.id,
      contactPerson: contact.contactPerson,
      relationship: contact.relationship,
      phone: contact.phone,
      createdAt: contact.createdAt.toISOString(),
      updatedAt: contact.updatedAt.toISOString(),
    };
  }

  private async findContactMethodForSubject(
    subjectEmployeeId: string,
    contactId: string,
  ): Promise<PersonalContactMethod> {
    const method = await this.prisma.personalContactMethod.findFirst({
      where: { id: contactId, employeeId: subjectEmployeeId },
    });
    if (!method) {
      throw new NotFoundException(`Contact method ${contactId} not found`);
    }
    return method;
  }

  private async findEmergencyContactForSubject(
    subjectEmployeeId: string,
    emergencyContactId: string,
  ): Promise<EmergencyContact> {
    const contact = await this.prisma.emergencyContact.findFirst({
      where: { id: emergencyContactId, employeeId: subjectEmployeeId },
    });
    if (!contact) {
      throw new NotFoundException(
        `Emergency contact ${emergencyContactId} not found`,
      );
    }
    return contact;
  }

  private assertPatchHasFields(dto: object, fields: string[]): void {
    const record = dto as Record<string, unknown>;
    const hasField = fields.some((field) => record[field] !== undefined);
    if (!hasField) {
      throw new BadRequestException(
        `At least one of ${fields.join(', ')} is required`,
      );
    }
  }

  private assertNullableStringFields(dto: object, fields: string[]): void {
    const record = dto as Record<string, unknown>;
    for (const field of fields) {
      if (record[field] === null) {
        throw new BadRequestException(`${field} cannot be null`);
      }
    }
  }

  private rethrowRecordNotFound(error: unknown, message: string): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    ) {
      throw new NotFoundException(message);
    }
    throw error;
  }
}
