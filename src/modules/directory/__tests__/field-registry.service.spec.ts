import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { FieldRegistryService } from '../field-registry.service';

describe('FieldRegistryService', () => {
  let service: FieldRegistryService;

  const prisma = {
    customFieldDefinition: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    customFieldValue: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
    },
    employee: {
      findUnique: jest.fn(),
    },
  };

  const knownError = (code: string) =>
    new Prisma.PrismaClientKnownRequestError('error', {
      code,
      clientVersion: 'test',
    });

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FieldRegistryService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(FieldRegistryService);
  });

  describe('defineField', () => {
    it('creates a select field with options', async () => {
      prisma.customFieldDefinition.create.mockResolvedValue({
        id: 'field-1',
      });

      await expect(
        service.defineField('Preferred office', 'select', 'employee', [
          'Kyiv',
          'Lviv',
        ]),
      ).resolves.toBe('field-1');

      expect(prisma.customFieldDefinition.create).toHaveBeenCalledWith({
        data: {
          name: 'Preferred office',
          type: 'select',
          visibility: 'employee',
          options: ['Kyiv', 'Lviv'],
        },
      });
    });

    it('rejects select fields without options', async () => {
      await expect(
        service.defineField('Preferred office', 'select', 'employee', []),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects whitespace-only names', async () => {
      await expect(
        service.defineField('   ', 'text', 'management'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects options on non-select types', async () => {
      await expect(
        service.defineField('Notes', 'text', 'management', ['A']),
      ).rejects.toThrow(BadRequestException);
    });

    it('maps duplicate names to ConflictException', async () => {
      prisma.customFieldDefinition.create.mockRejectedValue(
        knownError('P2002'),
      );

      await expect(
        service.defineField('Duplicate', 'text', 'management'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('setValue', () => {
    it('upserts a typed value and clears sibling columns', async () => {
      prisma.customFieldDefinition.findUnique.mockResolvedValue({
        id: 'field-1',
        type: 'number',
        options: null,
      });
      prisma.employee.findUnique.mockResolvedValue({ id: 'employee-1' });
      prisma.customFieldValue.upsert.mockResolvedValue({});

      await service.setValue('employee-1', 'field-1', 42);

      expect(prisma.customFieldValue.upsert).toHaveBeenCalledTimes(1);
      const upsertCall = prisma.customFieldValue.upsert.mock
        .calls[0] as unknown as [
        {
          update: {
            valueText: string | null;
            valueNumber: Prisma.Decimal | null;
            valueDate: Date | null;
            valueBoolean: boolean | null;
            valueSelect: string | null;
          };
        },
      ];
      const { update } = upsertCall[0];
      expect(update.valueText).toBeNull();
      expect(update.valueNumber).toBeInstanceOf(Prisma.Decimal);
      expect(update.valueDate).toBeNull();
      expect(update.valueBoolean).toBeNull();
      expect(update.valueSelect).toBeNull();
    });

    it('rejects select values outside defined options', async () => {
      prisma.customFieldDefinition.findUnique.mockResolvedValue({
        id: 'field-1',
        type: 'select',
        options: ['Kyiv'],
      });
      prisma.employee.findUnique.mockResolvedValue({ id: 'employee-1' });

      await expect(
        service.setValue('employee-1', 'field-1', 'Lviv'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects duplicate multi_select entries', async () => {
      prisma.customFieldDefinition.findUnique.mockResolvedValue({
        id: 'field-1',
        type: 'multi_select',
        options: ['A', 'B'],
      });
      prisma.employee.findUnique.mockResolvedValue({ id: 'employee-1' });

      await expect(
        service.setValue('employee-1', 'field-1', ['A', 'A']),
      ).rejects.toThrow(BadRequestException);
    });

    it('deletes the row when value is null (lazy unset)', async () => {
      prisma.customFieldDefinition.findUnique.mockResolvedValue({
        id: 'field-1',
        type: 'text',
        options: null,
      });
      prisma.employee.findUnique.mockResolvedValue({ id: 'employee-1' });
      prisma.customFieldValue.deleteMany.mockResolvedValue({ count: 1 });

      await service.setValue('employee-1', 'field-1', null);

      expect(prisma.customFieldValue.deleteMany).toHaveBeenCalledWith({
        where: {
          employeeId: 'employee-1',
          fieldDefinitionId: 'field-1',
        },
      });
    });

    it('throws when the employee does not exist', async () => {
      prisma.customFieldDefinition.findUnique.mockResolvedValue({
        id: 'field-1',
        type: 'text',
        options: null,
      });
      prisma.employee.findUnique.mockResolvedValue(null);

      await expect(
        service.setValue('missing', 'field-1', 'hello'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('query', () => {
    it('returns an empty array when filter arrays are empty', async () => {
      await expect(service.query({ employeeIds: [] })).resolves.toEqual([]);
      expect(prisma.customFieldValue.findMany).not.toHaveBeenCalled();
    });

    it('returns null for corrupt multi_select storage', async () => {
      prisma.customFieldValue.findMany.mockResolvedValue([
        {
          employeeId: 'employee-1',
          fieldDefinitionId: 'field-multi',
          valueText: '{bad-json',
          valueNumber: null,
          valueDate: null,
          valueBoolean: null,
          valueSelect: null,
          fieldDefinition: { type: 'multi_select' },
        },
      ]);

      await expect(
        service.query({ employeeIds: ['employee-1'] }),
      ).resolves.toEqual([
        {
          employeeId: 'employee-1',
          fieldId: 'field-multi',
          value: null,
        },
      ]);
    });

    it('returns decoded values for mixed types', async () => {
      prisma.customFieldValue.findMany.mockResolvedValue([
        {
          employeeId: 'employee-1',
          fieldDefinitionId: 'field-text',
          valueText: 'note',
          valueNumber: null,
          valueDate: null,
          valueBoolean: null,
          valueSelect: null,
          fieldDefinition: { type: 'text' },
        },
        {
          employeeId: 'employee-1',
          fieldDefinitionId: 'field-multi',
          valueText: '["A","B"]',
          valueNumber: null,
          valueDate: null,
          valueBoolean: null,
          valueSelect: null,
          fieldDefinition: { type: 'multi_select' },
        },
      ]);

      await expect(
        service.query({ employeeIds: ['employee-1'] }),
      ).resolves.toEqual([
        {
          employeeId: 'employee-1',
          fieldId: 'field-text',
          value: 'note',
        },
        {
          employeeId: 'employee-1',
          fieldId: 'field-multi',
          value: ['A', 'B'],
        },
      ]);
    });
  });
});
